import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Info, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useApp } from '../App'
import { api, type Verification } from '../lib/api'
import { catColor, inr } from '../lib/format'
import { Card, CardTitle, EmptyState, LevelBar, Skeleton, VerifiedBadge, tooltipStyle } from '../components/ui'
import type { Anomaly } from './Dashboard'

type Ins = {
  headline: string; insights: { title: string; detail: string; type: string }[]; verification: Verification; source: string
  patterns: {
    weekday_weekend: { weekday_avg_per_day: number; weekend_avg_per_day: number; weekend_vs_weekday_ratio: number; by_day: { day: string; avg: number }[] }
    subscriptions: { count: number; monthly_total: number; annual_total: number; items: { merchant: string; monthly_amount: number; annual_cost: number; next_expected: string }[] }
    top_merchants: { merchant: string; category: string; amount: number; count: number }[]
    month_over_month: { from_month: string; to_month: string; spent_from: number; spent_to: number; total_change: number; categories: { category: string; from: number; to: number; change: number; change_pct: number | null }[] } | null
  }
  budget: { avg_monthly_income: number; needs_budget: number; wants_budget: number; savings_target: number; current_needs: number; current_wants: number; current_savings: number }
}

const TYPE_STYLE: Record<string, [typeof Info, string]> = {
  positive: [CheckCircle2, 'text-success bg-success/12'], warning: [AlertCircle, 'text-amber bg-amber/12'], info: [Info, 'text-cyan bg-cyan/12'],
}
const ANOM_LABEL: Record<string, string> = { spike: 'Spending spike', duplicate: 'Possible duplicate', new_merchant: 'New merchant' }

export default function Insights() {
  const { go } = useApp()
  const [d, setD] = useState<Ins | null>(null)
  const [anoms, setAnoms] = useState<Anomaly[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [err, setErr] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (refresh = false) => {
    setBusy(true)
    api.get<Ins>(`/api/insights${refresh ? '?refresh=true' : ''}`).then(setD).catch((e) => setErr(e.status ?? 500)).finally(() => setBusy(false))
  }
  useEffect(() => {
    load()
    api.get<{ items: Anomaly[] }>('/api/anomalies').then((r) => { setAnoms(r.items); if (r.items.length) setOpen(r.items[0].id) }).catch(() => setAnoms([]))
  }, [])

  if (err === 404) return <EmptyState onUpload={() => go('upload')} />
  if (!d) return <div className="space-y-5"><Skeleton className="h-40" /><div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>

  const p = d.patterns
  const b = d.budget
  const maxDay = Math.max(...p.weekday_weekend.by_day.map((x) => x.avg), 1)

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Sparkles size={14} /> AI summary</p>
            <p className="mt-2 text-xl font-semibold leading-snug md:text-2xl">{d.headline}</p>
          </div>
          <div className="flex items-center gap-2">
            <VerifiedBadge v={d.verification} />
            <button onClick={() => load(true)} className="chip !py-1.5" disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Regenerate</button>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.insights.map((i) => {
            const [Icon, cls] = TYPE_STYLE[i.type] ?? TYPE_STYLE.info
            return (
              <div key={i.title} className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full ${cls}`}><Icon size={15} /></span><p className="font-semibold">{i.title}</p></div>
                <p className="mt-2 text-sm text-muted">{i.detail}</p>
              </div>
            )
          })}
        </div>
        {d.source === 'template' && <p className="relative mt-3 text-xs text-muted">Offline mode: insights generated from templates. Add an API key in backend/.env for AI-written insights.</p>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-12">
        {/* Unusual expenses accordion – Eye-Able audit style */}
        <Card className="xl:col-span-7">
          <div className="mb-4 flex items-stretch gap-3">
            <div className="grid min-w-[120px] place-items-center rounded-2xl bg-danger px-4 py-3 text-center text-white">
              <div><p className="text-xs">Unusual expenses</p><p className="text-3xl font-extrabold">{anoms?.length ?? '…'}</p></div>
            </div>
            <div className="flex-1 rounded-2xl border border-line p-3 text-sm">
              <p className="font-semibold">Explained by AI</p>
              <p className="mt-1 text-xs text-muted">Statistics find the outliers (robust z-score, duplicate and new-merchant checks). The AI explains them, and every number it uses is verified.</p>
            </div>
          </div>
          {!anoms && <Skeleton className="h-40" />}
          <ul className="space-y-2">
            {anoms?.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-2xl border border-line">
                <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-danger text-[11px] font-bold text-white">!</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.merchant} · {inr(a.amount)}</p>
                    <p className="text-xs text-muted">{a.date} · {ANOM_LABEL[a.type] ?? a.type} · {a.category}</p>
                  </div>
                  <ChevronDown size={18} className={`text-muted transition ${open === a.id ? 'rotate-180' : ''}`} />
                </button>
                {open === a.id && (
                  <div className="space-y-3 border-t border-line bg-surface-2 px-4 py-3 text-sm">
                    <p><span className="text-xs font-semibold uppercase tracking-wide text-muted">Why it's flagged</span><br />{a.reason}</p>
                    {a.explanation && <p><span className="text-xs font-semibold uppercase tracking-wide text-muted">Explanation</span><br />{a.explanation}</p>}
                    {a.suggestion && <p className="flex gap-2 rounded-xl bg-primary-soft p-3"><Lightbulb size={16} className="mt-0.5 shrink-0 text-primary" />{a.suggestion}</p>}
                  </div>
                )}
              </li>
            ))}
            {anoms && !anoms.length && <p className="text-sm text-muted">Nothing unusual. Nice!</p>}
          </ul>
        </Card>

        <div className="space-y-5 xl:col-span-5">
          <Card>
            <CardTitle sub="50 / 30 / 20 rule on your average monthly income">Budget health</CardTitle>
            <div className="space-y-4">
              <LevelBar label={`Needs · budget ${inr(b.needs_budget)}`} value={inr(b.current_needs)} pct={(b.current_needs / b.needs_budget) * 50} color="var(--teal)" />
              <LevelBar label={`Wants · budget ${inr(b.wants_budget)}`} value={inr(b.current_wants)} pct={(b.current_wants / b.wants_budget) * 50} color={b.current_wants > b.wants_budget ? 'var(--danger)' : 'var(--amber)'} />
              <LevelBar label={`Savings · target ${inr(b.savings_target)}`} value={inr(b.current_savings)} pct={(Math.max(0, b.current_savings) / b.savings_target) * 50} color="var(--primary)" />
            </div>
            <p className="mt-3 text-xs text-muted">The bar's midpoint marks the budget.</p>
          </Card>
          <Card>
            <CardTitle sub={`Weekend days cost ${p.weekday_weekend.weekend_vs_weekday_ratio}× a weekday`}>Spending by day of week</CardTitle>
            <div className="h-[170px]">
              <ResponsiveContainer>
                <BarChart data={p.weekday_weekend.by_day}>
                  <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-soft)' }} />
                  <Bar dataKey="avg" name="Avg / day" radius={[8, 8, 8, 8]} barSize={26}>
                    {p.weekday_weekend.by_day.map((x) => <Cell key={x.day} fill={x.avg === maxDay ? 'var(--primary)' : x.day === 'Sat' || x.day === 'Sun' ? 'var(--primary-2)' : 'var(--line)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardTitle sub={`${inr(p.subscriptions.monthly_total)}/month · ${inr(p.subscriptions.annual_total)}/year`}>Subscriptions</CardTitle>
          <ul className="space-y-2">
            {p.subscriptions.items.map((s) => (
              <li key={s.merchant} className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
                <div><p className="font-medium">{s.merchant}</p><p className="text-xs text-muted">Next: {s.next_expected}</p></div>
                <div className="text-right"><p className="font-semibold">{inr(s.monthly_amount)}</p><p className="text-xs text-muted">{inr(s.annual_cost)}/yr</p></div>
              </li>
            ))}
            {!p.subscriptions.items.length && <p className="text-sm text-muted">No subscriptions detected.</p>}
          </ul>
        </Card>
        <Card>
          <CardTitle sub="Where most of your money goes">Top merchants</CardTitle>
          <ul className="space-y-3">
            {p.top_merchants.map((m, i) => (
              <li key={m.merchant} className="flex items-center gap-3 text-sm">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{m.merchant}</p><p className="text-xs" style={{ color: catColor(m.category) }}>{m.category} · {m.count} payments</p></div>
                <span className="font-semibold tabular-nums">{inr(m.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle sub={p.month_over_month ? `${p.month_over_month.from_month} → ${p.month_over_month.to_month}` : ''}>Month-over-month</CardTitle>
          {p.month_over_month ? (
            <ul className="space-y-2.5 text-sm">
              {p.month_over_month.categories.slice(0, 6).map((c) => (
                <li key={c.category} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(c.category) }} />
                  <span className="flex-1">{c.category}</span>
                  <span className="text-xs text-muted">{inr(c.from)} → {inr(c.to)}</span>
                  <span className={`w-20 text-right font-semibold tabular-nums ${c.change > 0 ? 'text-danger' : 'text-success'}`}>{inr(c.change, { sign: true })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Need at least two months of data.</p>}
        </Card>
      </div>
    </div>
  )
}
