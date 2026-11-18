import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CalendarDays, ChevronRight, Copy, Sparkles, Store, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../App'
import { api } from '../lib/api'
import { catColor, inr, monthLabel } from '../lib/format'
import { Card, CardTitle, ChartBlock, EmptyState, HealthRing, LevelBar, Skeleton, tooltipStyle } from '../components/ui'

type Overview = {
  period: string; income: number; spent: number; net_savings: number; savings_rate_pct: number; fixed_commitments: number
  avg_monthly_spend: number; transactions: number; by_category: { category: string; amount: number; count: number; share_pct: number }[]
}
export type Anomaly = { id: number; date: string; merchant: string; category: string; amount: number; type: string; reason: string; explanation?: string; suggestion?: string }
type Recurring = { merchant: string; category: string; monthly_amount: number; next_expected: string; days_until: number }
type Dash = {
  months: string[]; overview: Overview; latest: Overview
  trend: { month: string; label: string; income: number; spent: number; savings: number }[]
  health: { score: number; label: string; rationale: string; components: { name: string; points: number; max: number; value: string }[] }
  anomalies: Anomaly[]
  subscriptions: { count: number; monthly_total: number; annual_total: number }
  upcoming: { as_of: string; total_due: number; bills: Recurring[] }
  recent: { id: number; date: string; merchant: string; category: string; amount: number; direction: string }[]
}

export default function Dashboard() {
  const { go, status } = useApp()
  const [d, setD] = useState<Dash | null>(null)
  const [err, setErr] = useState<number | null>(null)

  useEffect(() => {
    api.get<Dash>('/api/dashboard').then(setD).catch((e) => setErr(e.status ?? 500))
  }, [])

  if (err === 404) return <EmptyState onUpload={() => go('upload')} />
  if (err) return <p className="text-danger">Could not reach the FinWise API. Is the backend running on port 8000?</p>
  if (!d) return <div className="grid gap-5 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-60" />)}</div>

  const L = d.latest
  const fixed = Math.min(L.fixed_commitments, L.spent)
  const flexible = Math.max(0, L.spent - fixed)
  const saved = Math.max(0, L.income - L.spent)
  const total = fixed + flexible + saved || 1
  const types = { spike: 0, duplicate: 0, new_merchant: 0 } as Record<string, number>
  d.anomalies.forEach((a) => { types[a.type] = (types[a.type] ?? 0) + 1 })
  const maxCat = d.overview.by_category[0]?.amount || 1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Hey {status?.user_name ?? 'there'}! 👋</h2>
          <p className="mt-1 text-sm text-muted">Here's what your statement says about {monthLabel(d.months[0])} – {monthLabel(d.months[d.months.length - 1])}.</p>
        </div>
        <button onClick={() => go('assistant')} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 hover:opacity-90">
          <Sparkles size={16} /> Ask FinWise AI
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        {/* Health score */}
        <Card className="relative overflow-hidden xl:col-span-4">
          <CardTitle>Financial Health Score</CardTitle>
          <div className="flex items-center gap-5">
            <HealthRing score={d.health.score} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-fg">{d.health.rationale}</p>
              <button onClick={() => go('insights')} className="chip mt-3">Improve my score <ChevronRight size={14} /></button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-lg font-semibold">{d.health.label}</span>
            <span className="text-xs text-muted">Savings rate {d.overview.savings_rate_pct}%</span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-primary/25 to-transparent" />
        </Card>

        {/* Quick overview */}
        <Card className="xl:col-span-5">
          <CardTitle right={<span className="chip !py-1.5"><CalendarDays size={14} /> {monthLabel(d.months[d.months.length - 1])}</span>}>
            Quick Overview
          </CardTitle>
          <div className="flex h-8 gap-1.5 rounded-full border border-line p-1">
            <div className="rounded-full bg-teal" style={{ width: `${(fixed / total) * 100}%` }} title="Fixed commitments" />
            <div className="rounded-full bg-amber" style={{ width: `${(flexible / total) * 100}%` }} title="Flexible spending" />
            <div className="hatch rounded-full bg-primary" style={{ width: `${(saved / total) * 100}%` }} title="Saved" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ['Fixed (rent, EMI, bills)', inr(fixed), 'bg-teal'],
              ['Flexible spending', inr(flexible), 'bg-amber'],
              ['Saved this month', (L.income - L.spent >= 0 ? '+' : '') + inr(L.income - L.spent), 'bg-primary'],
            ].map(([k, v, c]) => (
              <div key={k} className="flex gap-2">
                <span className={`w-0.5 rounded-full ${c}`} />
                <div><p className="text-[11px] text-muted">{k}</p><p className="text-[15px] font-semibold tabular-nums">{v}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div className="flex items-center gap-2"><ArrowDownLeft size={16} className="text-success" /> Income <b className="ml-auto tabular-nums">{inr(L.income)}</b></div>
            <div className="flex items-center gap-2"><ArrowUpRight size={16} className="text-danger" /> Spent <b className="ml-auto tabular-nums">{inr(L.spent)}</b></div>
          </div>
        </Card>

        {/* Unusual expenses (Eye-Able issues card) */}
        <Card className="flex flex-col xl:col-span-3">
          <div className="flex items-stretch overflow-hidden rounded-2xl">
            <div className="flex flex-1 flex-col items-center justify-center bg-danger py-4 text-white">
              <span className="text-xs font-medium opacity-90">Unusual expenses</span>
              <span className="text-4xl font-extrabold">{d.anomalies.length}</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-[13px]">
            {[['spike', 'Spending spikes', TrendingUp], ['duplicate', 'Duplicate charges', Copy], ['new_merchant', 'New high-value merchants', Store]].map(([k, label, Icon]) => {
              const I = Icon as typeof Copy
              return (
                <li key={k as string} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <I size={15} className="text-danger" /><span className="flex-1">{label as string}</span><b>{types[k as string] ?? 0}</b>
                </li>
              )
            })}
          </ul>
          <button onClick={() => go('insights')} className="mt-auto pt-4 text-left text-sm font-semibold text-primary hover:underline">See AI explanations →</button>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardTitle sub="Income vs spending per month">Cash flow over time</CardTitle>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <AreaChart data={d.trend} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gs" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gi" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => inr(v, { compact: true })} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="income" name="Income" stroke="var(--cyan)" strokeWidth={2.5} fill="url(#gi)" dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="spent" name="Spent" stroke="var(--primary)" strokeWidth={2.5} fill="url(#gs)" dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardTitle sub={`${d.overview.transactions} transactions · ${d.overview.period}`}>Spending by category</CardTitle>
          <ChartBlock height={200} chart={{ type: 'donut', title: '', data: [...d.overview.by_category.slice(0, 6).map((c) => ({ name: c.category, value: c.amount })),
            ...(d.overview.by_category.length > 6 ? [{ name: 'Everything else', value: d.overview.by_category.slice(6).reduce((s, c) => s + c.amount, 0) }] : [])] }} />
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardTitle sub="Share of total spending">Category breakdown</CardTitle>
          <div className="space-y-4">
            {d.overview.by_category.slice(0, 6).map((c) => (
              <LevelBar key={c.category} label={c.category} value={`${c.share_pct.toFixed(1)} %`} pct={(c.amount / maxCat) * 100} color={catColor(c.category)} />
            ))}
          </div>
        </Card>
        <Card className="xl:col-span-4">
          <CardTitle sub={`After ${d.upcoming.as_of}`} right={<CalendarClock size={18} className="text-muted" />}>Upcoming bills</CardTitle>
          <ul className="space-y-2">
            {d.upcoming.bills.slice(0, 6).map((b) => (
              <li key={b.merchant} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                <span className="h-8 w-1 rounded-full" style={{ background: catColor(b.category) }} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{b.merchant}</p><p className="text-xs text-muted">{b.next_expected}</p></div>
                <span className="text-sm font-semibold tabular-nums">{inr(b.monthly_amount)}</span>
              </li>
            ))}
            {!d.upcoming.bills.length && <p className="text-sm text-muted">No recurring bills detected.</p>}
          </ul>
        </Card>
        <Card className="xl:col-span-4">
          <CardTitle right={<button onClick={() => go('transactions')} className="text-xs font-semibold text-primary">View all</button>}>Recent transactions</CardTitle>
          <ul className="divide-y divide-line">
            {d.recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-12 text-xs text-muted">{t.date}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{t.merchant}</p><p className="text-xs text-muted">{t.category}</p></div>
                <span className={`font-semibold tabular-nums ${t.direction === 'credit' ? 'text-success' : 'text-danger'}`}>
                  {t.direction === 'credit' ? '+' : '-'}{inr(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
