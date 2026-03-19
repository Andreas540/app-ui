import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'

interface BookingRow {
  id: string
  start_at: string
  end_at: string
  booking_status: string
  payment_status: string
  total_amount: number | null
  currency: string | null
  assigned_staff_name: string | null
  customer_name: string | null
  service_name: string | null
}

interface DashboardData {
  today: BookingRow[]
  upcoming: BookingRow[]
  monthly_revenue: number
  monthly_booking_count: number
  outstanding_count: number
  outstanding_amount: number
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
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function fmtTime(iso: string, locale: string, timezone: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone })
}

function fmtDate(iso: string, locale: string, timezone: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone })
}

function fmtCurrency(amount: number | null, currency: string | null, locale: string, defaultCurrency: string) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || defaultCurrency,
    minimumFractionDigits: 0,
  }).format(amount)
}

export default function BookingDashboardPage() {
  const { t } = useTranslation()
  const { locale, timezone, currency: tenantCurrency } = useLocale()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-booking-dashboard`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>
  if (error) return <div style={{ padding: 32, color: 'salmon' }}>{error}</div>
  if (!data) return null

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 24 }}>{t('bookingDashboard.title', 'Bookings')}</h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.todayCount', "Today's bookings")}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.today.length}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.upcomingCount', 'Next 7 days')}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.upcoming.length}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.monthlyRevenue', 'Revenue this month')}</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtCurrency(data.monthly_revenue, null, locale, tenantCurrency)}</div>
          <div className="helper">{data.monthly_booking_count} {t('bookingDashboard.bookings', 'bookings')}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.outstanding', 'Outstanding')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.outstanding_count > 0 ? '#f59e0b' : undefined }}>
            {fmtCurrency(data.outstanding_amount, null, locale, tenantCurrency)}
          </div>
          <div className="helper">{data.outstanding_count} {t('bookingDashboard.unpaid', 'unpaid')}</div>
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>{t('bookingDashboard.todaySchedule', "Today's Schedule")}</h3>
        {data.today.length === 0 ? (
          <div className="helper">{t('bookingDashboard.nothingToday', 'No bookings scheduled today.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.today.map(bk => (
              <Link key={bk.id} to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ minWidth: 80, fontWeight: 600, fontSize: 14 }}>
                    {fmtTime(bk.start_at, locale, timezone)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{bk.customer_name ?? '—'}</div>
                    <div className="helper">{bk.service_name ?? '—'}{bk.assigned_staff_name ? ` · ${bk.assigned_staff_name}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <StatusBadge status={bk.booking_status} map={STATUS_COLORS} />
                    <StatusBadge status={bk.payment_status} map={PAYMENT_COLORS} />
                    {bk.total_amount != null && (
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtCurrency(bk.total_amount, bk.currency, locale, tenantCurrency)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming */}
      {data.upcoming.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>{t('bookingDashboard.upcoming', 'Upcoming (next 7 days)')}</h3>
            <Link to="/bookings/list" className="helper" style={{ color: 'var(--accent)' }}>
              {t('bookingDashboard.viewAll', 'View all →')}
            </Link>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.upcoming.map(bk => (
              <Link key={bk.id} to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ minWidth: 110, fontWeight: 600, fontSize: 13 }}>
                    {fmtDate(bk.start_at, locale, timezone)} {fmtTime(bk.start_at, locale, timezone)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{bk.customer_name ?? '—'}</div>
                    <div className="helper">{bk.service_name ?? '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={bk.booking_status} map={STATUS_COLORS} />
                    {bk.total_amount != null && (
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtCurrency(bk.total_amount, bk.currency, locale, tenantCurrency)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
