import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

interface BookingDetail {
  id: string
  start_at: string
  end_at: string
  timezone: string | null
  booking_status: string
  payment_status: string
  total_amount: number | null
  currency: string | null
  assigned_staff_name: string | null
  participant_count: number
  location_name: string | null
  notes: string | null
  external_booking_id: string | null
  external_provider: string | null
  external_status: string | null
  created_at: string
  updated_at: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  service_id: string | null
  service_name: string | null
  service_type: string | null
  duration_minutes: number | null
}

interface Obligation {
  id: string
  obligation_type: string
  due_amount: number
  currency: string
  due_at: string | null
  obligation_status: string
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
      padding: '3px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: (map[status] ?? '#9ca3af') + '22',
      color: map[status] ?? '#9ca3af',
      textTransform: 'capitalize',
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtCurrency(amount: number | null, currency: string | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div className="helper" style={{ minWidth: 140 }}>{label}</div>
      <div style={{ flex: 1 }}>{value ?? '—'}</div>
    </div>
  )
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`${apiBase()}/api/get-booking-detail?id=${id}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setBooking(data.booking)
        setObligations(data.obligations || [])
      })
      .catch(e => setError(e.message || 'Failed to load booking'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>
  if (error) return <div style={{ padding: 32, color: 'salmon' }}>{error}</div>
  if (!booking) return null

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/bookings/list" className="helper" style={{ color: 'var(--accent)' }}>
          ← {t('bookingDetail.backToList', 'All bookings')}
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>
          {booking.service_name ?? t('bookingDetail.booking', 'Booking')}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatusBadge status={booking.booking_status} map={STATUS_COLORS} />
          <StatusBadge status={booking.payment_status} map={PAYMENT_COLORS} />
        </div>
      </div>

      {/* Booking details */}
      <div className="card" style={{ padding: '4px 20px', marginBottom: 20 }}>
        <Row label={t('bookingDetail.date', 'Date & time')} value={fmtDateTime(booking.start_at)} />
        {booking.duration_minutes && (
          <Row label={t('bookingDetail.duration', 'Duration')} value={`${booking.duration_minutes} min`} />
        )}
        <Row label={t('bookingDetail.customer', 'Customer')} value={
          booking.customer_id
            ? <Link to={`/customers/${booking.customer_id}`}>{booking.customer_name}</Link>
            : booking.customer_name
        } />
        {booking.customer_phone && (
          <Row label={t('bookingDetail.phone', 'Phone')} value={booking.customer_phone} />
        )}
        {booking.service_type && (
          <Row label={t('bookingDetail.serviceType', 'Service type')} value={booking.service_type} />
        )}
        {booking.assigned_staff_name && (
          <Row label={t('bookingDetail.staff', 'Staff')} value={booking.assigned_staff_name} />
        )}
        {booking.participant_count > 1 && (
          <Row label={t('bookingDetail.participants', 'Participants')} value={booking.participant_count} />
        )}
        {booking.location_name && (
          <Row label={t('bookingDetail.location', 'Location')} value={booking.location_name} />
        )}
        <Row label={t('bookingDetail.amount', 'Amount')} value={
          <strong>{fmtCurrency(booking.total_amount, booking.currency)}</strong>
        } />
        {booking.notes && (
          <Row label={t('bookingDetail.notes', 'Notes')} value={booking.notes} />
        )}
      </div>

      {/* Payment obligations */}
      {obligations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>{t('bookingDetail.obligations', 'Payment obligations')}</h3>
          <div className="card" style={{ padding: '4px 20px' }}>
            {obligations.map(ob => (
              <div key={ob.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <span style={{ textTransform: 'capitalize' }}>{ob.obligation_type.replace('_', ' ')}</span>
                  {ob.due_at && <span className="helper"> · due {new Date(ob.due_at).toLocaleDateString()}</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="helper" style={{ textTransform: 'capitalize' }}>{ob.obligation_status.replace('_', ' ')}</span>
                  <strong>{fmtCurrency(ob.due_amount, ob.currency)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider info */}
      {booking.external_booking_id && (
        <div className="helper" style={{ marginTop: 16, fontSize: 12 }}>
          {booking.external_provider} #{booking.external_booking_id}
          {booking.external_status ? ` · ${booking.external_status}` : ''}
        </div>
      )}
    </div>
  )
}
