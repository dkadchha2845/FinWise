export function inr(v: number, opts: { compact?: boolean; sign?: boolean } = {}) {
  const n = Math.abs(v)
  if (opts.compact && n >= 100000) return `${v < 0 ? '-' : ''}₹${(n / 100000).toFixed(n >= 1000000 ? 1 : 2)}L`
  if (opts.compact && n >= 1000) return `${v < 0 ? '-' : ''}₹${(n / 1000).toFixed(1)}k`
  const s = n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  const sign = v < 0 ? '-' : opts.sign && v > 0 ? '+' : ''
  return `${sign}₹${s}`
}

export const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#a78bfa',
  Groceries: '#2dd4bf',
  Transport: '#38bdf8',
  Shopping: '#f472b6',
  'Bills & Utilities': '#fbbf24',
  Subscriptions: '#8b5cf6',
  Entertainment: '#fb7185',
  'Rent & Housing': '#6366f1',
  Health: '#34d399',
  Education: '#60a5fa',
  'EMI & Loans': '#f97316',
  Transfers: '#94a3b8',
  'Cash Withdrawal': '#a3a3a3',
  Income: '#22c55e',
  Other: '#64748b',
  'Everything else': '#475569',
}
export const catColor = (c: string) => CAT_COLORS[c] ?? '#8b92b8'

export function monthLabel(m: string) {
  const [y, mm] = m.split('-').map(Number)
  return new Date(y, mm - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}
