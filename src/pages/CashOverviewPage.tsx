import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../contexts/LocaleContext'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

interface CashUser { id: string; name: string }
interface CashTx {
  id: string
  transaction_date: string
  transaction_type: 'cash_pickup' | 'salary' | 'expense'
  amount: number
  comment: string | null
  user_name?: string | null
}
interface WeekOption { value: string; label: string } // value = "start::end"

const H = 36

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateWeekOptions(thisWeekLabel: string, lastWeekLabel: string, tz: string): WeekOption[] {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const delta = dow === 0 ? -6 : 1 - dow
  const thisMonday = new Date(y, m - 1, d + delta)

  const opts: WeekOption[] = []
  for (let i = 0; i <= 12; i++) {
    const mon = new Date(thisMonday)
    mon.setDate(thisMonday.getDate() - i * 7)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const start = fmtDate(mon)
    const end   = fmtDate(sun)
    let label: string
    if      (i === 0) label = thisWeekLabel
    else if (i === 1) label = lastWeekLabel
    else              label = `${mon.getMonth() + 1}/${mon.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}`
    opts.push({ value: `${start}::${end}`, label })
  }
  return opts
}

function weeksInRange(fromStart: string, toEnd: string): Array<{ start: string; end: string }> {
  const weeks: Array<{ start: string; end: string }> = []
  const [y, m, d] = fromStart.split('-').map(Number)
  const cur = new Date(y, m - 1, d)
  while (fmtDate(cur) <= toEnd) {
    const start = fmtDate(cur)
    const sun   = new Date(cur); sun.setDate(cur.getDate() + 6)
    weeks.push({ start, end: fmtDate(sun) })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks.reverse()
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function CashOverviewPage() {
  const { t, i18n } = useTranslation()
  const { locale, timezone } = useLocale()
  const { fmtMoney } = useCurrency()

  const weekOptions = useMemo(
    () => generateWeekOptions(t('cashManagement.thisWeek'), t('cashManagement.lastWeek'), timezone),
    [i18n.language, timezone] // eslint-disable-line
  )

  const [activePeriod, setActivePeriod] = useState<'thisWeek' | 'lastWeek' | null>('thisWeek')
  const [fromWeekVal,  setFromWeekVal]  = useState('')
  const [toWeekVal,    setToWeekVal]    = useState('')
  const [selectedUser, setSelectedUser] = useState('all')
  const [users,        setUsers]        = useState<CashUser[]>([])
  const [txs,          setTxs]          = useState<CashTx[]>([])
  const [ingoing,      setIngoing]      = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [expandedWeeks, setExpandedWeeks] = useState(new Set<string>())
  const [expandedDays,  setExpandedDays]  = useState(new Set<string>())

  // Init to "this week"
  useEffect(() => {
    if (weekOptions.length > 0 && !fromWeekVal) {
      setFromWeekVal(weekOptions[0].value)
      setToWeekVal(weekOptions[0].value)
    }
  }, [weekOptions]) // eslint-disable-line

  // Derived date range — always take min start / max end so order doesn't matter
  const fromStart = fromWeekVal.split('::')[0] || ''
  const fromEnd   = fromWeekVal.split('::')[1] || fromStart
  const toStart   = toWeekVal.split('::')[0]   || ''
  const toEnd     = toWeekVal.split('::')[1]   || toStart
  const from = fromStart <= toStart ? fromStart : toStart
  const to   = fromEnd   >= toEnd   ? fromEnd   : toEnd

  const load = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    try {
      const userParam = selectedUser === 'all' ? '' : `&user_id=${encodeURIComponent(selectedUser)}`
      const res = await fetch(
        `${apiBase()}/.netlify/functions/cash-transactions?from=${from}&to=${to}${userParam}`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users ?? [])
        setTxs(data.transactions ?? [])
        setIngoing(Number(data.ingoing_balance) || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [from, to, selectedUser])

  useEffect(() => { load() }, [load])

  function handlePeriod(p: 'thisWeek' | 'lastWeek') {
    setActivePeriod(p)
    const val = weekOptions[p === 'thisWeek' ? 0 : 1]?.value
    if (val) { setFromWeekVal(val); setToWeekVal(val) }
  }

  function toggleWeek(start: string) {
    setExpandedWeeks(prev => { const n = new Set(prev); n.has(start) ? n.delete(start) : n.add(start); return n })
  }
  function toggleDay(ds: string) {
    setExpandedDays(prev => { const n = new Set(prev); n.has(ds) ? n.delete(ds) : n.add(ds); return n })
  }

  const moneyIn  = txs.reduce((s, tx) => s + (tx.amount > 0 ? tx.amount : 0), 0)
  const moneyOut = txs.reduce((s, tx) => s + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0)
  const outgoing = ingoing + moneyIn - moneyOut

  const weeks = from && to ? weeksInRange(from, to) : []

  function dayName(ds: string) {
    const [y, m, d] = ds.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' })
  }
  function shortDate(ds: string) {
    const [y, m, d] = ds.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
  }

  const selectStyle = { width: '100%', padding: '0 8px', height: H, fontSize: 13 } as const

  const summaryRows: [string, number, string | undefined][] = [
    ['ingoingBalance', ingoing,  undefined],
    ['moneyIn',        moneyIn,  '#10b981'],
    ['moneyOut',       moneyOut, '#ef4444'],
    ['outgoingBalance',outgoing, undefined],
  ]

  return (
    <div className="card page-narrow">
      <h2 style={{ marginBottom: 16 }}>{t('cashOverview.title')}</h2>

      {/* This week / Last week preset buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {(['thisWeek', 'lastWeek'] as const).map(p => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            style={{
              flex: 1, height: H,
              background: activePeriod === p ? 'var(--primary)' : 'transparent',
              color: activePeriod === p ? '#fff' : undefined,
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 14,
            }}
          >
            {t(`cashManagement.${p}`)}
          </button>
        ))}
      </div>

      {/* From / To week selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {(['from', 'to'] as const).map(key => (
          <div key={key}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              {t(`cashOverview.${key}`)}
            </label>
            <select
              value={key === 'from' ? fromWeekVal : toWeekVal}
              onChange={e => {
                if (key === 'from') { setFromWeekVal(e.target.value); setActivePeriod(null) }
                else                { setToWeekVal(e.target.value);   setActivePeriod(null) }
              }}
              style={selectStyle}
            >
              {weekOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Registered by */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {t('cashManagement.registeredBy')}
        </label>
        <select
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          style={{ width: '100%', padding: '0 10px', height: H }}
        >
          {users.length > 1 && <option value="all">{t('cashOverview.allUsers')}</option>}
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8,
        padding: 12, marginBottom: 20,
      }}>
        {summaryRows.map(([key, val, color]) => (
          <div key={key}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              {t(`cashManagement.${key}`)}
            </div>
            <div style={{ fontWeight: 700, color }}>
              {key === 'moneyIn'  && `+${fmtMoney(val)}`}
              {key === 'moneyOut' && `−${fmtMoney(val)}`}
              {key !== 'moneyIn' && key !== 'moneyOut' && fmtMoney(val)}
            </div>
          </div>
        ))}
      </div>

      {/* Weekly breakdown */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{t('loading')}</div>
      ) : (
        <div>
          {weeks.map((week, wi) => {
            const weekTxs    = txs.filter(tx => tx.transaction_date.slice(0, 10) >= week.start && tx.transaction_date.slice(0, 10) <= week.end)
            const weekNet    = weekTxs.reduce((s, tx) => s + tx.amount, 0)
            const isExpanded = expandedWeeks.has(week.start)

            // Week label from options, fallback to date range
            const weekLabel = weekOptions.find(o => o.value === `${week.start}::${week.end}`)?.label
              ?? `${shortDate(week.start)} – ${shortDate(week.end)}`

            // All days in the week that fall within the selected range
            const daysInWeek: string[] = []
            const cur = new Date(week.start + 'T12:00:00Z')
            for (let i = 0; i < 7; i++) {
              const ds = cur.toISOString().slice(0, 10)
              if (ds >= from && ds <= to) daysInWeek.push(ds)
              cur.setUTCDate(cur.getUTCDate() + 1)
            }

            return (
              <div key={week.start}>
                {wi > 0 && <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />}

                {/* Week row — clickable */}
                <div
                  onClick={() => toggleWeek(week.start)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', userSelect: 'none' }}>{isExpanded ? '▾' : '▸'}</span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{weekLabel}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: weekNet >= 0 ? '#10b981' : '#ef4444' }}>
                    {weekNet >= 0 ? `+${fmtMoney(weekNet)}` : `−${fmtMoney(Math.abs(weekNet))}`}
                  </span>
                </div>

                {/* Days — visible when week expanded */}
                {isExpanded && (
                  <div style={{ paddingLeft: 20 }}>
                    {[...daysInWeek].reverse().map(ds => {
                      const dayTxs    = weekTxs.filter(tx => tx.transaction_date.slice(0, 10) === ds)
                      const dayNet    = dayTxs.reduce((s, tx) => s + tx.amount, 0)
                      const isDayExp  = expandedDays.has(ds)

                      return (
                        <div key={ds}>
                          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '3px 0' }} />

                          {/* Day row — clickable */}
                          <div
                            onClick={() => toggleDay(ds)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', cursor: 'pointer', fontSize: 14 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--muted)', userSelect: 'none' }}>{isDayExp ? '▾' : '▸'}</span>
                              <span>{dayName(ds)}</span>
                              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{shortDate(ds)}</span>
                            </div>
                            <span style={{ color: dayNet >= 0 ? '#10b981' : '#ef4444' }}>
                              {dayNet >= 0 ? `+${fmtMoney(dayNet)}` : `−${fmtMoney(Math.abs(dayNet))}`}
                            </span>
                          </div>

                          {/* Individual transactions — visible when day expanded */}
                          {isDayExp && dayTxs.map(tx => (
                            <div
                              key={tx.id}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '3px 0 3px 16px', fontSize: 13 }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: 'var(--muted)' }}>
                                  {t(`cashManagement.${tx.transaction_type}`)}
                                  {tx.user_name && (
                                    <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({tx.user_name})</span>
                                  )}
                                </div>
                                {tx.comment && (
                                  <div style={{ color: 'var(--muted)', fontSize: 12, wordBreak: 'break-word' }}>
                                    {tx.comment}
                                  </div>
                                )}
                              </div>
                              <span style={{ color: tx.amount >= 0 ? '#10b981' : '#ef4444', flexShrink: 0, marginLeft: 8 }}>
                                {tx.amount >= 0 ? `+${fmtMoney(tx.amount)}` : `−${fmtMoney(Math.abs(tx.amount))}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
