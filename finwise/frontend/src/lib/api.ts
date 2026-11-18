export type Verification = { verified: boolean; claims: number; supported: number; gfs: number; unsupported: string[] }
export type ChartSpec = { type: 'donut' | 'bar'; title: string; data: { name: string; value: number; cap?: number }[] } | null

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) {
    let msg = r.statusText
    try { msg = (await r.json()).detail ?? msg } catch { /* not json */ }
    const e = new Error(msg) as Error & { status?: number }
    e.status = r.status
    throw e
  }
  return r.json()
}

export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body?: unknown) =>
    req<T>(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(p: string, body: unknown) =>
    req<T>(p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  del: <T,>(p: string) => req<T>(p, { method: 'DELETE' }),
  upload: <T,>(file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<T>('/api/statements/upload', { method: 'POST', body: fd })
  },
}

export type ChatEvent =
  | { type: 'tool'; tool: string; args: Record<string, unknown>; chart: ChartSpec }
  | { type: 'token'; text: string }
  | { type: 'done'; verification: Verification }
  | { type: 'error'; message: string }

export async function streamChat(message: string, history: { role: string; content: string }[], onEvent: (e: ChatEvent) => void) {
  const r = await fetch('/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history }),
  })
  if (!r.ok || !r.body) {
    let msg = 'Chat failed'
    try { msg = (await r.json()).detail ?? msg } catch { /* ignore */ }
    onEvent({ type: 'error', message: msg })
    return
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i).trim()
      buf = buf.slice(i + 2)
      if (chunk.startsWith('data:')) {
        try { onEvent(JSON.parse(chunk.slice(5))) } catch { /* partial */ }
      }
    }
  }
}
