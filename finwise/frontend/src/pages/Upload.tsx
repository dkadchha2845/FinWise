import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, ShieldCheck, Trash2, UploadCloud } from 'lucide-react'
import { useApp } from '../App'
import { api } from '../lib/api'
import { Card, CardTitle } from '../components/ui'

type Result = { statement_id: number; filename: string; transactions: number; anomalies: number; seconds: number; llm_calls: number; steps: { step: string; detail: string }[] }
type Stmt = { id: number; filename: string; uploaded_at: string; n_txns: number; period_start: string; period_end: string }

const SAMPLES = [
  { id: 'aarav', name: 'Aarav · salaried', file: 'HDFC-style CSV', icon: FileSpreadsheet },
  { id: 'priya', name: 'Priya · family', file: 'Excel export (.xlsx)', icon: FileSpreadsheet },
  { id: 'rohan', name: 'Rohan · freelancer', file: 'PDF statement', icon: FileText },
]
const PIPE = ['Parsing statement', 'Masking personal data', 'Categorising with AI', 'Detecting unusual expenses']

export default function UploadPage() {
  const { go, refresh } = useApp()
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState(0)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [list, setList] = useState<{ active: number | null; items: Stmt[] }>({ active: null, items: [] })
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(() => api.get<typeof list>('/api/statements').then(setList).catch(() => {}), [])
  useEffect(() => { load() }, [load])

  async function run(fn: () => Promise<Result>) {
    setBusy(true); setErr(''); setRes(null); setPhase(0)
    const t = setInterval(() => setPhase((p) => Math.min(PIPE.length - 1, p + 1)), 700)
    try {
      const r = await fn()
      setRes(r); await refresh(); await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      clearInterval(t); setBusy(false)
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) run(() => api.upload<Result>(f))
  }

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-8">
        <Card>
          <CardTitle sub="CSV, Excel (.xlsx) or text-based PDF · up to 10 MB">Upload your bank statement</CardTitle>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
            onClick={() => !busy && input.current?.click()}
            className={`grid cursor-pointer place-items-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition ${
              drag ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary/60'}`}
          >
            <input ref={input} type="file" accept=".csv,.xlsx,.xls,.pdf" hidden onChange={(e) => onFiles(e.target.files)} />
            {busy ? (
              <div className="w-full max-w-sm space-y-3 text-left">
                {PIPE.map((p, i) => (
                  <div key={p} className={`flex items-center gap-3 text-sm ${i <= phase ? 'text-fg' : 'text-muted'}`}>
                    {i < phase ? <CheckCircle2 size={18} className="text-success" /> : i === phase ? <Loader2 size={18} className="animate-spin text-primary" /> : <span className="h-[18px] w-[18px] rounded-full border border-line" />}
                    {p}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary"><UploadCloud size={30} /></div>
                <p className="text-lg font-semibold">Drop your statement here, or click to browse</p>
                <p className="mt-1 text-sm text-muted">Works with HDFC, SBI, ICICI, Axis, Kotak-style exports with UPI / NEFT / POS narrations</p>
              </>
            )}
          </div>
          {err && <p className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}
          {res && (
            <div className="mt-5 rounded-3xl border border-success/30 bg-success/10 p-5">
              <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={18} /> {res.filename} analysed in {res.seconds}s</p>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {res.steps.map((s) => <li key={s.step}><span className="font-medium">{s.step}:</span> <span className="text-muted">{s.detail}</span></li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => go('dashboard')} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white">Open dashboard</button>
                <button onClick={() => go('assistant')} className="chip">Ask the AI assistant</button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle sub="Synthetic Indian statements with known categories and planted anomalies">Try a sample statement</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {SAMPLES.map(({ id, name, file, icon: Icon }) => (
              <button key={id} disabled={busy} onClick={() => run(() => api.post<Result>(`/api/statements/sample/${id}`))}
                className="rounded-2xl border border-line bg-surface-2 p-4 text-left transition hover:border-primary disabled:opacity-50">
                <Icon size={20} className="text-primary" />
                <p className="mt-3 font-semibold">{name}</p>
                <p className="text-xs text-muted">{file} · 3 months</p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-5 xl:col-span-4">
        <Card>
          <CardTitle>Your statements</CardTitle>
          <ul className="space-y-2">
            {list.items.map((s) => (
              <li key={s.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${list.active === s.id ? 'border-primary bg-primary-soft' : 'border-line'}`}>
                <button className="min-w-0 flex-1 text-left" onClick={async () => { await api.post(`/api/statements/${s.id}/activate`); await load(); await refresh() }}>
                  <p className="truncate text-sm font-medium">{s.filename}</p>
                  <p className="text-xs text-muted">{s.n_txns} txns · {s.period_start} → {s.period_end}</p>
                </button>
                {list.active === s.id && <span className="text-[11px] font-semibold text-primary">Active</span>}
                <button onClick={async () => { await api.del(`/api/statements/${s.id}`); await load(); await refresh() }} className="text-muted hover:text-danger"><Trash2 size={16} /></button>
              </li>
            ))}
            {!list.items.length && <p className="text-sm text-muted">Nothing uploaded yet.</p>}
          </ul>
        </Card>
        <Card>
          <CardTitle right={<ShieldCheck className="text-success" size={20} />}>Privacy first</CardTitle>
          <ul className="space-y-2 text-sm text-muted">
            <li>• Account numbers, UPI IDs, phone numbers and names of people are masked <b className="text-fg">before</b> anything reaches the AI.</li>
            <li>• Known merchants are categorised locally by rules; only unfamiliar ones are sent to the AI.</li>
            <li>• All totals are computed on your machine, so the AI never does arithmetic.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
