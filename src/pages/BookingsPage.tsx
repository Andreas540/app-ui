import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'

interface BookingRow {
  id: string
  start_at: string
  booking_status: string
  payment_status: string
  total_amount: number | null
  currency: string | null
  customer_name: string | null
  service_name: string | null
  assigned_staff_name: string | null
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#10b981',
  completed: '#6366f1',
  pending:   '#f59e0b',
  canceled:  '#ef4444',
  no_show:   '#9ca3af',
}

const PAYMENT_COLORS: Record<string, string> = {
  paid:               '#10b981',
  deposit_paid:       '#f59e0b',
  unpaid:             '#ef4444',
  partially_refunded: '#f59e0b',
  refunded:           '#9ca3af',
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: (map[status] ?? '#9ca3af') + '22',
      color: map[status] ?? '#9ca3af',
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function fmtDateTime(iso: string, locale: string, timezone: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: timezone }) + ' ' +
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone })
}

function fmtCurrency(amount: number | null, currency: string | null, locale: string, defaultCurrency: string) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || defaultCurrency,
    minimumFractionDigits: 0,
  }).format(amount)
}

const BOOKING_STATUSES = ['confirmed', 'pending', 'completed', 'canceled', 'no_show']

export default function BookingsPage() {
  const { t } = useTranslation()
  const { locale, timezone, currency: tenantCurrency } = useLocale()

  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    fetchBookings()
  }, [page, filterStatus, filterDateFrom, filterDateTo])

  async function fetchBookings() {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(page) })
      if (filterStatus) params.set('status', filterStatus)
      if (filterDateFrom) params.set('date_from', filterDateFrom)
      if (filterDateTo) params.set('date_to', filterDateTo)

      const res = await fetch(`${apiBase()}/api/get-bookings?${params}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setBookings(data.bookings || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e.message || 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  const perPage = 50
  const totalPages = Math.ceil(total / perPage)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 20 }}>{t('bookingsList.title', 'All Bookings')}</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          style={{ minWidth: 140 }}
        >
          <option value="">{t('bookingsList.allStatuses', 'All statuses')}</option>
          {BOOKING_STATUSES.map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }}
          style={{ minWidth: 130 }}
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={e => { setFilterDateTo(e.target.value); setPage(1) }}
          style={{ minWidth: 130 }}
        />
        {(filterStatus || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1) }}>
            {t('bookingsList.clearFilters', 'Clear')}
          </button>
        )}
        <div className="helper" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
          {total} {t('bookingsList.results', 'results')}
        </div>
      </div>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="helper">{t('loading')}</div>
      ) : bookings.length === 0 ? (
        <div className="helper">{t('bookingsList.noBookings', 'No bookings found.')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            {bookings.map(bk => (
              <Link key={bk.id} to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 110, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
                    {fmtDateTime(bk.start_at, locale, timezone)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bk.customer_name ?? '—'}
                    </div>
                    <div className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bk.service_name ?? '—'}
                      {bk.assigned_staff_name ? ` · ${bk.assigned_staff_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <StatusBadge status={bk.booking_status} map={STATUS_COLORS} />
                    <StatusBadge status={bk.payment_status} map={PAYMENT_COLORS} />
                    <span style={{ fontWeight: 600, fontSize: 13, minWidth: 60, textAlign: 'right' }}>
                      {fmtCurrency(bk.total_amount, bk.currency, locale, tenantCurrency)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span className="helper" style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
