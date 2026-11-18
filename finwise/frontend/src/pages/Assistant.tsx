import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, PiggyBank, ReceiptText, RotateCcw, SendHorizontal, Sparkles, Wallet, Wrench } from 'lucide-react'
import { useApp } from '../App'
import { api, streamChat, type ChartSpec, type Verification } from '../lib/api'
import { inr } from '../lib/format'
import { Card, CardTitle, ChartBlock, EmptyState, HealthRing, Markdown, VerifiedBadge } from '../components/ui'

type Msg = { role: 'user' | 'assistant'; content: string; tool?: string; chart?: ChartSpec; verification?: Verification; pending?: boolean; error?: boolean }

const CHIPS = [
  { icon: Wallet, label: 'Spending', q: 'Show me my spending breakdown for this month.' },
  { icon: PiggyBank, label: 'Suggest Budget', q: 'Suggest a monthly budget for me.' },
  { icon: CalendarClock, label: 'Upcoming Bills', q: 'What bills are coming up next?' },
  { icon: ReceiptText, label: 'Subscriptions', q: 'Which subscriptions am I paying for and how much do they cost per year?' },
  { icon: AlertTriangle, label: 'Unusual expenses', q: 'Explain my unusual expenses.' },
  { icon: Sparkles, label: 'Compare months', q: 'How did my spending change compared to last month?' },
]
const TOOL_LABEL: Record<string, string> = {
  spending_summary: 'Spending summary', category_spend: 'Category analysis', top_merchants: 'Top merchants', compare_months: 'Month comparison',
  find_transactions: 'Transaction search', subscriptions: 'Subscriptions', upcoming_bills: 'Upcoming bills', unusual_expenses: 'Anomaly report',
  budget_suggestion: 'Budget planner', health_score: 'Health score', spending_patterns: 'Spending patterns', none: 'General',
}

let saved: Msg[] = []  // survives page switches

type Side = { health: { score: number; label: string; rationale: string }; latest: { income: number; spent: number; fixed_commitments: number }; subscriptions: { monthly_total: number; count: number } }

export default function Assistant() {
  const { status, go } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>(saved)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [side, setSide] = useState<Side | null>(null)
  const [noData, setNoData] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { saved = msgs; end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs])
  useEffect(() => { api.get<Side>('/api/dashboard').then(setSide).catch((e) => e.status === 404 && setNoData(true)) }, [])

  if (noData) return <EmptyState onUpload={() => go('upload')} />

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    setBusy(true)
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true }])
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])])
    try {
      await streamChat(q, history, (e) => {
        if (e.type === 'tool') patch((m) => ({ ...m, tool: e.tool, chart: e.chart }))
        else if (e.type === 'token') patch((m) => ({ ...m, content: m.content + e.text, pending: false }))
        else if (e.type === 'done') patch((m) => ({ ...m, verification: e.verification, pending: false }))
        else if (e.type === 'error') patch((m) => ({ ...m, content: e.message, error: true, pending: false }))
      })
    } catch (err) {
      patch((m) => ({ ...m, content: (err as Error).message, error: true, pending: false }))
    }
    setBusy(false)
  }

  const L = side?.latest
  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <Card className="flex min-h-[calc(100vh-150px)] flex-col xl:col-span-8">
        {/* Greeting with glowing orb */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-r from-surface-2 via-surface-2 to-primary/25 px-6 py-5">
          <div className="beam pointer-events-none absolute -top-6 right-16 h-56 w-28" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Hey {status?.user_name ?? 'there'}!</h2>
              <p className="mt-1 text-[15px] text-muted">How can I help you with your finances today?</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="orb hidden sm:block" />
              <span className="flex items-center gap-1.5 text-sm font-medium text-primary-2">
                <span className={`h-2.5 w-2.5 rounded-full ring-4 ${status?.llm.available ? 'bg-primary-2 ring-primary/30' : 'bg-amber ring-amber/30'}`} />
                {status?.llm.available ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {CHIPS.map(({ icon: Icon, label, q }) => (
            <button key={label} className="chip" disabled={busy} onClick={() => send(q)}><Icon size={16} className="text-primary-2" />{label}</button>
          ))}
          {msgs.length > 0 && <button className="chip ml-auto" onClick={() => setMsgs([])}><RotateCcw size={14} /> New chat</button>}
        </div>

        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {!msgs.length && (
            <div className="rounded-3xl border border-dashed border-line p-6 text-sm text-muted">
              Ask anything about your statement in plain English, for example <i>"How much did I spend on food in September?"</i>,
              <i> "Why was October expensive?"</i> or <i>"Show me all Uber rides above ₹500"</i>. Every number in my answers is computed from your data and checked before you see it.
            </div>
          )}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-primary/90 px-5 py-3 text-[15px] text-white shadow-lg shadow-primary/20">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff_0_8%,#c4b5fd_20%,#8b5cf6_55%,#4c1d95)] shadow-[0_0_18px_rgba(139,92,246,.6)]" />
              <div className={`min-w-0 flex-1 rounded-3xl rounded-tl-lg border px-5 py-4 ${m.error ? 'border-danger/40 bg-danger/10 text-danger' : 'border-line bg-surface-2'}`}>
                {m.tool && (
                  <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    <Wrench size={11} /> {TOOL_LABEL[m.tool] ?? m.tool}
                  </p>
                )}
                {m.pending && !m.content ? <div className="typing flex gap-1 py-2">{[0, 1, 2].map((k) => <span key={k} className="h-2 w-2 rounded-full bg-primary-2" />)}</div> : <Markdown text={m.content} />}
                {m.chart && !m.pending && <div className="mt-4 rounded-2xl bg-surface p-4"><ChartBlock chart={m.chart} height={180} /></div>}
                {m.verification && <div className="mt-3"><VerifiedBadge v={m.verification} /></div>}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="mt-4 flex items-center gap-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask me anything about your finances…"
            className="flex-1 rounded-full border border-line bg-surface-2 px-6 py-4 text-[15px] outline-none placeholder:text-muted focus:border-primary" />
          <button disabled={busy || !input.trim()} className="grid h-14 w-14 place-items-center rounded-full bg-primary-2 text-white shadow-lg shadow-primary/30 transition hover:scale-105 disabled:opacity-50">
            <SendHorizontal size={22} />
          </button>
        </form>
      </Card>

      <div className="space-y-5 xl:col-span-4">
        <Card>
          <CardTitle>Financial Health Score</CardTitle>
          {side ? (
            <div className="flex items-center gap-4">
              <HealthRing score={side.health.score} size={110} />
              <div><p className="text-sm">{side.health.rationale}</p><p className="mt-2 font-semibold">{side.health.label}</p></div>
            </div>
          ) : <div className="h-28" />}
        </Card>
        {L && (
          <Card>
            <CardTitle sub="Latest month">Quick overview</CardTitle>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="border-l-2 border-teal pl-2"><p className="text-[11px] text-muted">Income</p><p className="font-semibold">{inr(L.income)}</p></div>
              <div className="border-l-2 border-amber pl-2"><p className="text-[11px] text-muted">Spent</p><p className="font-semibold">{inr(L.spent)}</p></div>
              <div className="border-l-2 border-primary pl-2"><p className="text-[11px] text-muted">Fixed bills</p><p className="font-semibold">{inr(L.fixed_commitments)}</p></div>
            </div>
          </Card>
        )}
        <Card>
          <CardTitle>How FinWise answers</CardTitle>
          <ol className="space-y-3 text-sm text-muted">
            {['The AI picks the right analysis tool for your question.', 'FinWise computes the exact numbers from your data. The AI never does the maths.',
              'The AI explains the result in plain language.', 'Every ₹ amount and % is checked against the computed facts.'].map((s, i) => (
              <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
