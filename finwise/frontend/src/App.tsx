import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  Bot, ChevronDown, FileUp, LayoutGrid, Lightbulb, Menu, Moon, ReceiptText, Settings as SettingsIcon, Sparkles, Sun, X,
} from 'lucide-react'
import { api } from './lib/api'
import Dashboard from './pages/Dashboard'
import UploadPage from './pages/Upload'
import Transactions from './pages/Transactions'
import Insights from './pages/Insights'
import Assistant from './pages/Assistant'
import SettingsPage from './pages/Settings'

export type Page = 'dashboard' | 'upload' | 'transactions' | 'insights' | 'assistant' | 'settings'
export type Status = {
  llm: { provider: string; model: string; available: boolean }
  active_statement: number | null
  user_name: string
  categories: string[]
  samples: string[]
}

type Ctx = { status: Status | null; refresh: () => Promise<void>; go: (p: Page) => void; version: number; bump: () => void }
const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

const NAV: { group: string; items: { id: Page; label: string; icon: typeof LayoutGrid }[] }[] = [
  { group: 'General', items: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'upload', label: 'Upload Statement', icon: FileUp },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  ] },
  { group: 'AI & Insights', items: [
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
    { id: 'insights', label: 'Spending Insights', icon: Lightbulb },
  ] },
  { group: 'User', items: [{ id: 'settings', label: 'Settings', icon: SettingsIcon }] },
]
const TITLES: Record<Page, string> = {
  dashboard: 'Dashboard', upload: 'Upload Statement', transactions: 'Transactions', insights: 'Spending Insights',
  assistant: 'AI Assistant', settings: 'Settings',
}

function readPage(): Page {
  const h = window.location.hash.replace('#/', '') as Page
  return h in TITLES ? h : 'dashboard'
}

export default function App() {
  const [page, setPage] = useState<Page>(readPage)
  const [status, setStatus] = useState<Status | null>(null)
  const [version, setVersion] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('fw-theme') !== 'light' } catch { return true }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('fw-theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [dark])
  useEffect(() => {
    const on = () => setPage(readPage())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const refresh = useCallback(async () => {
    try { setStatus(await api.get<Status>('/api/status')) } catch { setStatus(null) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const go = (p: Page) => { window.location.hash = `/${p}`; setNavOpen(false) }
  const bump = () => setVersion((v) => v + 1)
  const name = status?.user_name ?? 'Aarav'

  return (
    <AppCtx.Provider value={{ status, refresh, go, version, bump }}>
      <div className="flex min-h-full">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-line bg-sidebar px-5 py-6 transition-transform lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-8 flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-[26px] font-extrabold tracking-tight">
              <span className="text-primary">✳</span>
              <span><span className="text-primary">Fin</span>wise<span className="text-primary">.</span></span>
            </div>
            <button className="lg:hidden" onClick={() => setNavOpen(false)}><X size={20} /></button>
          </div>
          <nav className="flex-1 space-y-6 overflow-y-auto">
            {NAV.map((g) => (
              <div key={g.group}>
                <p className="mb-2 px-3 text-xs font-medium text-muted">{g.group}</p>
                <ul className="space-y-1">
                  {g.items.map(({ id, label, icon: Icon }) => {
                    const on = page === id
                    return (
                      <li key={id}>
                        <button onClick={() => go(id)}
                          className={`group flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-[14px] transition ${on
                            ? 'border border-primary/40 bg-primary-soft font-semibold text-fg'
                            : 'border border-transparent text-muted hover:bg-surface-2 hover:text-fg'}`}>
                          <Icon size={18} className={on ? 'text-primary' : ''} />
                          <span className="flex-1 text-left">{label}</span>
                          {on && <Sparkles size={14} className="text-primary" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status?.llm.available ? 'bg-success' : 'bg-amber'}`} />
              <span className="font-semibold text-fg">{status?.llm.available ? 'AI online' : 'Offline mode'}</span>
            </div>
            <p className="mt-1 truncate text-muted">{status ? `${status.llm.provider} · ${status.llm.model}` : 'API not reachable'}</p>
          </div>
        </aside>
        {navOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} />}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-4 backdrop-blur md:px-8">
            <button className="lg:hidden" onClick={() => setNavOpen(true)}><Menu size={22} /></button>
            <h1 className="text-[15px] text-muted">{TITLES[page]}</h1>
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setDark((d) => !d)} title="Toggle theme"
                className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-fg hover:border-primary">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={() => go('settings')} className="flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary-2 to-primary text-sm font-bold text-white">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight">{name}</span>
                  <span className="block text-xs text-muted">Personal finance</span>
                </span>
                <ChevronDown size={16} className="text-muted" />
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-8" key={`${page}-${version}`}>
            {page === 'dashboard' && <Dashboard />}
            {page === 'upload' && <UploadPage />}
            {page === 'transactions' && <Transactions />}
            {page === 'insights' && <Insights />}
            {page === 'assistant' && <Assistant />}
            {page === 'settings' && <SettingsPage dark={dark} setDark={setDark} />}
          </main>
        </div>
      </div>
    </AppCtx.Provider>
  )
}
