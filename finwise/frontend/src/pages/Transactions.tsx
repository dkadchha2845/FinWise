import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useApp } from '../App'
import { api } from '../lib/api'
import { catColor, inr } from '../lib/format'
import { Card, EmptyState } from '../components/ui'

type Tx = { id: number; date: string; description: string; merchant: string; category: string; source: string; amount: number; direction: string; is_anomaly: boolean; anomaly_reason: string }
type Resp = { total: number; page: number; size: number; items: Tx[] }

const SRC: Record<string, string> = { rule: 'Rule', llm: 'AI', user: 'You', heuristic: 'Guess', default: 'Default' }

export default function Transactions() {
  const { status, go } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [onlyAnom, setOnlyAnom] = useState(false)
  const [sort, setSort] = useState('date_desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Resp | null>(null)
  const [err, setErr] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const p = new URLSearchParams({ sort, page: String(page), size: '20' })
    if (q) p.set('q', q)
    if (cat) p.set('category', cat)
    if (onlyAnom) p.set('anomalies_only', 'true')
    const t = setTimeout(() => api.get<Resp>(`/api/transactions?${p}`).then(setData).catch((e) => setErr(e.status ?? 500)), 200)
    return () => clearTimeout(t)
  }, [q, cat, onlyAnom, sort, page, tick])

  if (err === 404) return <EmptyState onUpload={() => go('upload')} />
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  async function recat(t: Tx, c: string) {
    await api.patch(`/api/transactions/${t.id}`, { category: c })
    setTick((x) => x + 1)
  }

  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-5">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2.5">
          <Search size={16} className="text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search merchant or narration…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </div>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1) }} className="rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none">
          <option value="">All categories</option>
          {status?.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none">
          <option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option>
          <option value="amount_desc">Largest first</option><option value="amount_asc">Smallest first</option>
        </select>
        <label className="chip cursor-pointer"><input type="checkbox" checked={onlyAnom} onChange={(e) => { setOnlyAnom(e.target.checked); setPage(1) }} className="accent-[var(--primary)]" /> Unusual only</label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Merchant</th>
              <th className="px-3 py-3 font-medium">Category</th><th className="px-3 py-3 font-medium">Tagged by</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t.id} className="border-t border-line hover:bg-surface-2/60">
                <td className="whitespace-nowrap px-5 py-3 text-muted">{new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {t.merchant}
                    {t.is_anomaly && <span title={t.anomaly_reason}><AlertTriangle size={14} className="text-danger" /></span>}
                  </div>
                  <div className="max-w-[360px] truncate text-xs text-muted" title={t.description}>{t.description}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(t.category) }} />
                    <select value={t.category} onChange={(e) => recat(t, e.target.value)} className="rounded-lg bg-transparent py-1 outline-none hover:bg-surface-2">
                      {status?.categories.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.source === 'llm' ? 'bg-primary-soft text-primary' : t.source === 'user' ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted'}`}>
                    {SRC[t.source] ?? t.source}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums ${t.direction === 'credit' ? 'text-success' : ''}`}>
                  {t.direction === 'credit' ? '+' : '-'}{inr(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="p-8 text-center text-sm text-muted">No transactions match.</p>}
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
        <span>{data?.total ?? 0} transactions · change a category to teach FinWise (applies to that merchant)</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border border-line p-1.5 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-full border border-line p-1.5 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>
    </Card>
  )
}
