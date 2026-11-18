import { useState } from 'react'
import { CheckCircle2, Cpu, Moon, Sun } from 'lucide-react'
import { useApp } from '../App'
import { api } from '../lib/api'
import { Card, CardTitle } from '../components/ui'

export default function SettingsPage({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  const { status, refresh } = useApp()
  const [name, setName] = useState(status?.user_name ?? '')
  const [saved, setSaved] = useState(false)

  async function save() {
    await api.post('/api/settings', { user_name: name })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <Card>
        <CardTitle>Profile</CardTitle>
        <label className="text-xs text-muted">Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-primary" />
        <button onClick={save} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white">
          {saved ? <><CheckCircle2 size={16} /> Saved</> : 'Save'}
        </button>
      </Card>
      <Card>
        <CardTitle>Appearance</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          {[{ v: true, label: 'Night violet', icon: Moon }, { v: false, label: 'Clean light', icon: Sun }].map(({ v, label, icon: Icon }) => (
            <button key={label} onClick={() => setDark(v)} className={`rounded-2xl border p-4 text-left ${dark === v ? 'border-primary bg-primary-soft' : 'border-line'}`}>
              <Icon size={18} className="text-primary" /><p className="mt-2 text-sm font-semibold">{label}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card className="md:col-span-2">
        <CardTitle right={<Cpu size={18} className="text-muted" />}>AI provider</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${status?.llm.available ? 'bg-success/15 text-success' : 'bg-amber/15 text-amber'}`}>
            {status?.llm.available ? 'Connected' : 'Offline mode'}
          </span>
          <span>{status?.llm.provider} · <span className="text-muted">{status?.llm.model}</span></span>
        </div>
        <p className="mt-3 text-sm text-muted">
          Set <code className="rounded bg-surface-2 px-1.5">GROQ_API_KEY</code> or <code className="rounded bg-surface-2 px-1.5">GEMINI_API_KEY</code> in
          <code className="rounded bg-surface-2 px-1.5">backend/.env</code>, then click reload. Without a key FinWise still works using rules and templates.
        </p>
        <button onClick={save} className="chip mt-4">Reload provider</button>
      </Card>
    </div>
  )
}
