import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'
import { DateInput } from '../components/DateInput'

interface PaymentSummary {
  collected: number
  outstanding: number
  deposit_received: number
  paid_count: number
  outstanding_count: number
}

interface BookingRow {
  id: string
  start_at: string
  booking_status: string
  payment_status: string
  total_amount: number | null
  currency: string | null
  customer_name: string | null
  service_name: string | null
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

const PAYMENT_COLORS: Record<string, string> = {
  paid:               '#10b981',
  deposit_paid:       '#f59e0b',
  unpaid:             '#ef4444',
  partially_refunded: '#f59e0b',
  refunded:           '#9ca3af',
}

function StatusBadge({ status }: { status: string }) {
  const color = PAYMENT_COLORS[status] ?? '#9ca3af'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: color + '22',
      color,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function fmtCurrency(amount: number | null, locale: string, defaultCurrency: string, currency?: string | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || defaultCurrency,
    minimumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(iso: string, locale: string, timezone: string) {
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })
}

const PAYMENT_STATUSES = [
  { value: 'unpaid',       label: 'Unpaid' },
  { value: 'deposit_paid', label: 'Deposit paid' },
  { value: 'paid',         label: 'Paid' },
]

export default function BookingPaymentsPage() {
  const { t } = useTranslation()
  const { locale, timezone, currency: tenantCurrency } = useLocale()
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('unpaid')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    fetchPayments()
  }, [page, filterStatus, filterDateFrom, filterDateTo])

  async function fetchPayments() {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(page) })
      if (filterStatus) params.set('status', filterStatus)
      if (filterDateFrom) params.set('date_from', filterDateFrom)
      if (filterDateTo) params.set('date_to', filterDateTo)

      const res = await fetch(`${apiBase()}/api/get-booking-payments?${params}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSummary(data.summary)
      setBookings(data.bookings || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const perPage = 50
  const totalPages = Math.ceil(total / perPage)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 24 }}>{t('bookingPayments.title', 'Booking Payments')}</h2>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="helper" style={{ marginBottom: 4 }}>{t('bookingPayments.outstanding', 'Outstanding')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: summary.outstanding > 0 ? '#f59e0b' : undefined }}>
              {fmtCurrency(summary.outstanding, locale, tenantCurrency)}
            </div>
            <div className="helper">{summary.outstanding_count} {t('bookingPayments.bookings', 'bookings')}</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="helper" style={{ marginBottom: 4 }}>{t('bookingPayments.collected', 'Collected')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
              {fmtCurrency(summary.collected, locale, tenantCurrency)}
            </div>
            <div className="helper">{summary.paid_count} {t('bookingPayments.paid', 'paid')}</div>
          </div>
          {summary.deposit_received > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div className="helper" style={{ marginBottom: 4 }}>{t('bookingPayments.deposits', 'Deposits received')}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtCurrency(summary.deposit_received, locale, tenantCurrency)}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setFilterStatus(''); setPage(1) }}
            style={{ opacity: filterStatus === '' ? 1 : 0.5 }}
          >
            {t('bookingPayments.all', 'All')}
          </button>
          {PAYMENT_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => { setFilterStatus(s.value); setPage(1) }}
              style={{ opacity: filterStatus === s.value ? 1 : 0.5 }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <DateInput
          value={filterDateFrom}
          onChange={v => { setFilterDateFrom(v); setPage(1) }}
          style={{ minWidth: 130 }}
        />
        <DateInput
          value={filterDateTo}
          onChange={v => { setFilterDateTo(v); setPage(1) }}
          style={{ minWidth: 130 }}
        />
        <div className="helper" style={{ marginLeft: 'auto' }}>
          {total} {t('bookingPayments.results', 'results')}
        </div>
      </div>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="helper">{t('loading')}</div>
      ) : bookings.length === 0 ? (
        <div className="helper">{t('bookingPayments.none', 'No bookings found.')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            {bookings.map(bk => (
              <Link key={bk.id} to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 90, fontSize: 13, color: 'var(--muted)' }}>
                    {fmtDate(bk.start_at, locale, timezone)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bk.customer_name ?? '—'}
                    </div>
                    <div className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bk.service_name ?? '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    <StatusBadge status={bk.payment_status} />
                    <span style={{ fontWeight: 600, fontSize: 13, minWidth: 60, textAlign: 'right' }}>
                      {fmtCurrency(bk.total_amount, locale, tenantCurrency, bk.currency)}
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
