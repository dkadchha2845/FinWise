import type { ReactNode } from 'react'
import { ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartSpec, Verification } from '../lib/api'
import { catColor, inr } from '../lib/format'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card p-5 ${className}`}>{children}</section>
}

export function CardTitle({ children, right, sub }: { children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-fg">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function VerifiedBadge({ v }: { v?: Verification | null }) {
  if (!v) return null
  const ok = v.verified
  return (
    <span
      title={ok ? `All ${v.claims} numbers checked against your data` : `Unverified: ${v.unsupported.join(', ')}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? 'bg-success/15 text-success' : 'bg-amber/15 text-amber'}`}
    >
      {ok ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
      {ok ? `Verified · ${v.claims} numbers` : `${v.supported}/${v.claims} numbers verified`}
    </span>
  )
}

export function HealthRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="hr" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={10} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#hr)" strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <span className="text-4xl font-bold text-fg">{score}</span>
          <span className="text-sm text-muted">/100</span>
        </div>
      </div>
    </div>
  )
}

/** Eye-Able style horizontal level bar */
export function LevelBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="font-medium text-fg">{label}</span>
        <span className="tabular-nums text-muted">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color, transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

/** Minimal markdown: **bold**, _italic_, bullet lists, line breaks */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={`${k}-${i}`} className="font-semibold text-fg">{p.slice(2, -2)}</strong>
        : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={`${k}-${i}`} className="text-muted">{p.slice(1, -1)}</em>
          : p)
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`} className="my-1.5 space-y-1 pl-1">{list}</ul>)
    list = []
  }
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/)
    if (m) list.push(<li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-2" /><span>{inline(m[1], i)}</span></li>)
    else { flush(); if (l.trim()) out.push(<p key={i} className="my-1">{inline(l, i)}</p>) }
  })
  flush()
  return <div className="text-[14px] leading-relaxed">{out}</div>
}

export function ChartBlock({ chart, height = 220 }: { chart: ChartSpec; height?: number }) {
  if (!chart || !chart.data?.length) return null
  if (chart.type === 'donut') {
    const total = chart.data.reduce((s, d) => s + d.value, 0)
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-muted">{chart.title}</p>
        <div className="flex flex-wrap items-center gap-4">
          <div style={{ width: height, height }} className="relative">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chart.data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={3} cornerRadius={6} stroke="none">
                  {chart.data.map((d) => <Cell key={d.name} fill={catColor(d.name)} />)}
                </Pie>
                <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="text-[11px] text-muted">Total</div><div className="text-lg font-bold">{inr(total, { compact: true })}</div></div>
            </div>
          </div>
          <ul className="min-w-[160px] flex-1 space-y-1.5 text-[13px]">
            {chart.data.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(d.name) }} />{d.name}</span>
                <span className="tabular-nums text-muted">{inr(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
  const hasCap = chart.data.some((d) => d.cap !== undefined)
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{chart.title}</p>
      <div style={{ height: Math.max(140, chart.data.length * 34) }}>
        <ResponsiveContainer>
          <BarChart data={chart.data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-soft)' }} />
            <Bar dataKey="value" name="Actual" radius={[0, 8, 8, 0]} barSize={14}>
              {chart.data.map((d) => <Cell key={d.name} fill={d.value < 0 ? 'var(--success)' : 'var(--primary)'} />)}
            </Bar>
            {hasCap && <Bar dataKey="cap" name="Suggested cap" radius={[0, 8, 8, 0]} barSize={14} fill="var(--teal)" />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export const tooltipStyle = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)', fontSize: 12,
}

export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><Upload /></div>
      <h2 className="text-xl font-semibold">No statement yet</h2>
      <p className="mt-2 text-sm text-muted">Upload a bank statement (CSV, Excel or PDF) or load a sample to see your AI-powered insights.</p>
      <button onClick={onUpload} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Upload statement</button>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />
}
