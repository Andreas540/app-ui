import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
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
}

const H = 36

function isOutflow(type: string) { return type === 'salary' || type === 'expense' }

function weekBounds(period: 'thisWeek' | 'lastWeek', tz: string) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay() // 0=Sun
  const delta = dow === 0 ? -6 : 1 - dow
  const mon = new Date(y, m - 1, d + delta + (period === 'lastWeek' ? -7 : 0))
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: fmt(mon), end: fmt(sun) }
}

function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const endD = new Date(ey, em - 1, ed)
  while (cur <= endD) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function CashManagementPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'super_admin'
  const { locale, timezone } = useLocale()
  const { fmtMoney } = useCurrency()

  const [period, setPeriod]   = useState<'thisWeek' | 'lastWeek'>('thisWeek')
  const [users, setUsers]     = useState<CashUser[]>([])
  const [selUser, setSelUser] = useState('')
  const [txs, setTxs]         = useState<CashTx[]>([])
  const [ingoing, setIngoing] = useState(0)
  const [loading, setLoading] = useState(true)

  const [formDate,    setFormDate]    = useState('')
  const [formType,    setFormType]    = useState('cash_pickup')
  const [formAmount,  setFormAmount]  = useState('')
  const [formComment, setFormComment] = useState('')
  const [saving,      setSaving]      = useState(false)

  // Seed selected user from auth on first load
  useEffect(() => {
    if (user?.id && !selUser) setSelUser(user.id)
  }, [user?.id]) // eslint-disable-line

  // Default date: today for this week, Monday for last week
  useEffect(() => {
    const { start, end } = weekBounds(period, timezone)
    if (period === 'thisWeek') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
      setFormDate(today >= start && today <= end ? today : end)
    } else {
      setFormDate(start) // Monday of last week
    }
  }, [period, timezone]) // eslint-disable-line

  const load = useCallback(async (userId: string) => {
    if (!userId) return
    const { start, end } = weekBounds(period, timezone)
    setLoading(true)
    try {
      const res = await fetch(
        `${apiBase()}/.netlify/functions/cash-transactions` +
        `?user_id=${encodeURIComponent(userId)}&from=${start}&to=${end}`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (res.ok) {
        const userList: CashUser[] = data.users ?? []
        setUsers(userList)
        setTxs(data.transactions ?? [])
        setIngoing(Number(data.ingoing_balance) || 0)
        // Admin viewing a user not in the eligible list → snap to first eligible user
        if (isAdmin && userList.length > 0 && !userList.find(u => u.id === userId)) {
          setSelUser(userList[0].id)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [period, timezone]) // selUser intentionally excluded — passed as explicit parameter

  useEffect(() => { load(selUser) }, [selUser, period, timezone]) // eslint-disable-line

  const bounds   = weekBounds(period, timezone)
  const allDates = datesInRange(bounds.start, bounds.end)

  const moneyIn  = txs.reduce((s, tx) => s + (tx.amount > 0 ? tx.amount : 0), 0)
  const moneyOut = txs.reduce((s, tx) => s + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0)
  const outgoing = ingoing + moneyIn - moneyOut

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const raw = parseFloat(formAmount)
    if (!raw || raw <= 0) return
    setSaving(true)
    try {
      await fetch(`${apiBase()}/.netlify/functions/cash-transactions`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id:          selUser,
          transaction_date: formDate,
          transaction_type: formType,
          amount:           isOutflow(formType) ? -raw : raw,
          comment:          formComment.trim() || null,
        }),
      })
      setFormAmount('')
      setFormComment('')
      await load(selUser)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('cashManagement.deleteConfirm'))) return
    await fetch(`${apiBase()}/.netlify/functions/cash-transactions`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load(selUser)
  }

  function dayName(ds: string) {
    const [y, m, d] = ds.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' })
  }
  function shortDate(ds: string) {
    const [y, m, d] = ds.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
  }

  const canRegister = isAdmin || (!loading && !!users.find(u => u.id === selUser))

  const summaryRows: [string, number, string | undefined][] = [
    ['ingoingBalance', ingoing,  undefined],
    ['moneyIn',        moneyIn,  '#10b981'],
    ['moneyOut',       moneyOut, '#ef4444'],
    ['outgoingBalance',outgoing, undefined],
  ]

  return (
    <div className="card page-narrow">
      <h2 style={{ marginBottom: 16 }}>{t('cashManagement.title')}</h2>

      {/* No-access guard for non-admin users not in the eligible list */}
      {!loading && !isAdmin && !users.find(u => u.id === selUser) && (
        <div style={{
          padding: '12px 14px', borderRadius: 8, background: 'var(--bg-secondary, #f8f9fa)',
          border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 14, marginBottom: 16,
        }}>
          {t('cashManagement.noAccess')}
        </div>
      )}

      {/* Registered by */}
      {(isAdmin || (!loading && users.find(u => u.id === selUser))) && (
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {t('cashManagement.registeredBy')}
        </label>
        {isAdmin ? (
          <select
            value={selUser}
            onChange={e => setSelUser(e.target.value)}
            style={{ width: '100%', height: H, padding: '0 10px' }}
          >
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <div style={{
            height: H, display: 'flex', alignItems: 'center',
            padding: '0 10px', border: '1px solid var(--border)',
            borderRadius: 4, background: 'var(--bg-secondary, #f8f9fa)',
            color: 'var(--muted)', fontSize: 14,
          }}>
            {users.find(u => u.id === selUser)?.name ?? user?.name ?? ''}
          </div>
        )}
      </div>
      )}

      {canRegister && <>

      {/* Week filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['thisWeek', 'lastWeek'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1, height: H,
              background: period === p ? 'var(--primary)' : 'transparent',
              color: period === p ? '#fff' : undefined,
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 14,
            }}
          >
            {t(`cashManagement.${p}`)}
          </button>
        ))}
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

      {/* Add transaction form */}
      <form onSubmit={handleAdd} style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select
            value={formDate}
            onChange={e => setFormDate(e.target.value)}
            style={{ padding: '0 10px', height: H }}
            required
          >
            {allDates.map(ds => {
              const [y, m, d] = ds.split('-').map(Number)
              const dt = new Date(y, m - 1, d)
              const dayLabel  = dt.toLocaleDateString(locale, { weekday: 'long' })
              const shortDate = dt.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
              return <option key={ds} value={ds}>{dayLabel} {shortDate}</option>
            })}
          </select>
          <select
            value={formType}
            onChange={e => setFormType(e.target.value)}
            style={{ padding: '0 10px', height: H }}
          >
            <option value="cash_pickup">{t('cashManagement.cash_pickup')}</option>
            <option value="salary">{t('cashManagement.salary')}</option>
            <option value="expense">{t('cashManagement.expense')}</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {isOutflow(formType) && (
              <span style={{
                position: 'absolute', left: 10, pointerEvents: 'none',
                color: 'var(--muted)', fontSize: 15, zIndex: 1,
              }}>−</span>
            )}
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder={t('cashManagement.amount')}
              value={formAmount}
              onChange={e => setFormAmount(e.target.value)}
              required
              style={{
                width: '100%', height: H,
                paddingLeft: isOutflow(formType) ? 26 : undefined,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <input
            type="text"
            placeholder={t('cashManagement.commentOptional')}
            value={formComment}
            onChange={e => setFormComment(e.target.value)}
            style={{ height: H }}
          />
        </div>
        <button
          type="submit"
          className="primary"
          disabled={saving}
          style={{ width: '100%', height: H }}
        >
          {saving ? t('saving') : t('cashManagement.add')}
        </button>
      </form>

      {/* Transactions by date */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{t('loading')}</div>
      ) : (
        <div>
          {[...allDates].reverse().map((ds, idx) => {
            const dayTxs = txs.filter(tx => tx.transaction_date.slice(0, 10) === ds)
            const net    = dayTxs.reduce((s, tx) => s + tx.amount, 0)
            return (
              <div key={ds}>
                {idx > 0 && (
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                )}
                {/* Date summary row */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0',
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{dayName(ds)}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 13 }}>{shortDate(ds)}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: net >= 0 ? '#10b981' : '#ef4444' }}>
                    {net >= 0 ? `+${fmtMoney(net)}` : `−${fmtMoney(Math.abs(net))}`}
                  </span>
                </div>
                {/* Individual lines */}
                {dayTxs.map(tx => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '4px 0 4px 12px', fontSize: 14,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--muted)' }}>
                        {t(`cashManagement.${tx.transaction_type}`)}
                      </div>
                      {tx.comment && (
                        <div style={{ color: 'var(--muted)', fontSize: 12, wordBreak: 'break-word' }}>
                          {tx.comment}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ color: tx.amount >= 0 ? '#10b981' : '#ef4444' }}>
                        {tx.amount >= 0
                          ? `+${fmtMoney(tx.amount)}`
                          : `−${fmtMoney(Math.abs(tx.amount))}`}
                      </span>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        title={t('delete')}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 2px',
                        }}
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      </>}
    </div>
  )
}
