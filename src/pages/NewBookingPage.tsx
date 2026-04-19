// src/pages/NewBookingPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, getAuthHeaders, listProducts } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'
import { useCurrency } from '../lib/useCurrency'

interface ServiceOption {
  id: string
  name: string
  duration_minutes: number | null
  price_amount: number | null
  currency: string | null
}

interface CustomerOption {
  id: string
  name: string
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function toDateStr(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone,
  }).formatToParts(date)
  return [
    parts.find(p => p.type === 'year')!.value,
    parts.find(p => p.type === 'month')!.value,
    parts.find(p => p.type === 'day')!.value,
  ].join('-')
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(':')
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select
        value={h}
        onChange={e => onChange(`${e.target.value}:${m}`)}
        style={{ flex: 1, minWidth: 0 }}
      >
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <select
        value={MINUTES.includes(m) ? m : '00'}
        onChange={e => onChange(`${h}:${e.target.value}`)}
        style={{ flex: 1, minWidth: 0 }}
      >
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
}

export default function NewBookingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { locale, timezone } = useLocale()
  const { parseAmount } = useCurrency()
  const prefilledCustomerId = searchParams.get('customer_id') || ''

  const [services, setServices] = useState<ServiceOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [calCounts, setCalCounts] = useState<Record<string, number>>({})

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState('09:00')
  const [endTimeOverride, setEndTimeOverride] = useState<string | null>(null)
  const [priceStr, setPriceStr] = useState('')
  const [notes, setNotes] = useState('')
  const [showDayBookings, setShowDayBookings] = useState(false)
  const [dayBookings, setDayBookings] = useState<{ id: string; start_at: string; customer_name: string | null; service_name: string | null }[]>([])
  const [dayBookingsLoading, setDayBookingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendConfirmation] = useState(false)
  const [linkOrderId, setLinkOrderId] = useState('')
  const [linkPaymentId, setLinkPaymentId] = useState('')
  const [billingOrders, setBillingOrders] = useState<{ id: string; order_no: number; order_date: string; product_name: string | null; balance: number; remaining_qty: number }[]>([])
  const [billingPayments, setBillingPayments] = useState<{ id: string; amount: number; payment_date: string; notes: string | null }[]>([])

  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })

  const [bookingConfigExpanded, setBookingConfigExpanded] = useState(false)
  const [bookingSlug, setBookingSlug] = useState<string | null>(null)
  const [bookingPaymentProvider, setBookingPaymentProvider] = useState<string | null>(null)

  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${apiBase()}/api/tenant-admin?action=getBookingConfig`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        setBookingSlug(data.slug || null)
        setBookingPaymentProvider(data.paymentProvider || null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [{ products }, bootstrap] = await Promise.all([
          listProducts(),
          fetchBootstrap(),
        ])
        setServices(
          products
            .filter(p => p.category === 'service')
            .map(p => ({
              id: p.id,
              name: p.name,
              duration_minutes: (p as any).duration_minutes ?? null,
              price_amount: (p as any).price_amount ?? null,
              currency: (p as any).currency ?? null,
            }))
        )
        const customerList = (bootstrap.customers as any[]).map(c => ({ id: c.id, name: c.name }))
        setCustomers(customerList)
        const initialId = prefilledCustomerId || (customerList.length ? customerList[0].id : '')
        setSelectedCustomerId(initialId)
      } catch { /* silent */ }
    })()
  }, [])

  useEffect(() => {
    const month = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`
    ;(async () => {
      try {
        const res = await fetch(`${apiBase()}/api/get-booking-calendar?month=${month}`, { headers: getAuthHeaders() })
        if (!res.ok) return
        const json = await res.json()
        setCalCounts(json.counts || {})
      } catch { /* ignore */ }
    })()
  }, [calMonth])

  // Fetch open orders + advance payments when customer changes
  useEffect(() => {
    if (!selectedCustomerId) { setBillingOrders([]); setBillingPayments([]); return }
    setLinkOrderId('')
    setLinkPaymentId('')
    ;(async () => {
      try {
        const res = await fetch(`${apiBase()}/api/booking-link-options?customer_id=${selectedCustomerId}`, { headers: getAuthHeaders() })
        const json = await res.json()
        if (!res.ok) { console.error('booking-link-options error:', json); return }
        setBillingOrders(json.orders || [])
        setBillingPayments(json.payments || [])
      } catch (e) { console.error('booking-link-options fetch failed:', e) }
    })()
  }, [selectedCustomerId])

  // When service changes, pre-fill price
  useEffect(() => {
    const svc = services.find(s => s.id === selectedServiceId)
    if (svc) setPriceStr(svc.price_amount != null ? String(svc.price_amount) : '')
  }, [selectedServiceId, services])

  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  )

  const endTimeAuto = useMemo(() => {
    if (!startTime || !selectedService?.duration_minutes) return ''
    return addMinutes(startTime, selectedService.duration_minutes)
  }, [startTime, selectedService])

  const endTime = endTimeOverride ?? endTimeAuto

  function handleDateClick(dateStr: string) {
    setSelectedDate(dateStr)
    setShowDayBookings(false)
    setDayBookings([])
    setEndTimeOverride(null)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function toggleDayBookings(dateStr: string) {
    if (showDayBookings) { setShowDayBookings(false); return }
    setDayBookingsLoading(true)
    setShowDayBookings(true)
    try {
      const res = await fetch(`${apiBase()}/api/get-booking-calendar-date?date=${dateStr}`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const json = await res.json()
      setDayBookings(json.bookings || [])
    } catch { /* ignore */ } finally {
      setDayBookingsLoading(false)
    }
  }

  async function save() {
    if (!selectedServiceId) { alert(t('newBooking.selectServiceFirst')); return }
    if (!selectedDate)      { alert(t('newBooking.selectDateFirst')); return }
    if (!selectedCustomerId){ alert(t('newBooking.selectCustomer')); return }
    if (!startTime)         { alert(t('newBooking.invalidTime')); return }

    const price = parseAmount(priceStr || '0')

    try {
      setSaving(true)
      const res = await fetch(`${apiBase()}/api/create-booking`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedServiceId,
          customer_id: selectedCustomerId,
          date: selectedDate,
          start_time: startTime,
          total_amount: price,
          notes: notes.trim() || null,
          send_confirmation: sendConfirmation,
          ...(linkOrderId   ? { link_order_id:   linkOrderId }   : {}),
          ...(linkPaymentId ? { link_payment_id: linkPaymentId } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      alert(t('newBooking.saved'))
      navigate(`/bookings/${json.booking_id}`)
    } catch (e: any) {
      alert(e?.message || t('newBooking.errorCreate'))
    } finally {
      setSaving(false)
    }
  }

  // Calendar grid
  const calYear = calMonth.getFullYear()
  const calMo = calMonth.getMonth()
  const firstDow = new Date(calYear, calMo, 1).getDay()
  const daysInMonth = new Date(calYear, calMo + 1, 0).getDate()
  const calDays: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) calDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d)
  const monthLabel = calMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const todayStr = toDateStr(new Date(), timezone)

  const dateLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="card page-narrow">
      <h3 style={{ marginBottom: 8 }}>{t('newBooking.title')}</h3>

      {/* Customer self-booking expander */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setBookingConfigExpanded(v => !v)}
          className="helper"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
        >
          {t('newBooking.customerSelfBook', 'Let your customers book themselves')}
        </button>

        {bookingConfigExpanded && (
          <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, display: 'grid', gap: 6 }}>
            {bookingSlug ? (
              <div>
                {t('newBooking.bookingLink', 'Link to your booking site:')}
                {' '}
                <a
                  href={`${window.location.origin}/book/${bookingSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--primary)' }}
                >
                  {`${window.location.origin}/book/${bookingSlug}`}
                </a>
              </div>
            ) : (
              <div>
                <Link to="/admin" state={{ openBookingTab: true, openBookingSubTab: 'booking-page' }} style={{ color: 'var(--primary)' }}>
                  {t('newBooking.missingSlug', 'First specify your URL here')}
                </Link>
              </div>
            )}
            {(!bookingPaymentProvider || bookingPaymentProvider === 'none') && (
              <div style={{ color: 'var(--text-secondary)' }}>
                {t('newBooking.missingPayment', 'If you want your customers to pay when booking, ')}{' '}
                <Link to="/admin" state={{ openBookingTab: true, openBookingSubTab: 'booking-page' }} style={{ color: 'var(--primary)' }}>
                  {t('newBooking.setupPaymentProvider', 'set up payment provider here')}
                </Link>.
              </div>
            )}
            <div>
              <Link to="/admin" state={{ openBookingTab: true, openBookingSubTab: 'availability' }} style={{ color: 'var(--primary)' }}>
                {t('newBooking.manageAvailability', 'Manage your availability here')}
              </Link>
            </div>
            <div>
              <Link to="/admin" state={{ openBookingTab: true, openBookingSubTab: 'sms' }} style={{ color: 'var(--primary)' }}>
                {t('newBooking.manageSmsReminders', 'Manage your SMS-reminders here')}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Service selector */}
      <div style={{ marginBottom: 20 }}>
        <label>{t('bookingReminders.service', 'Service')}</label>
        {services.length === 0 ? (
          <p className="helper">{t('newBooking.noServices')}</p>
        ) : (
          <select
            value={selectedServiceId}
            onChange={e => setSelectedServiceId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">{t('newBooking.selectService')}</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.duration_minutes ? ` (${s.duration_minutes} min)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Calendar */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <button
            onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d })}
            style={{ padding: '4px 12px' }}
          >←</button>
          <span style={{ fontWeight: 600 }}>{monthLabel}</span>
          <button
            onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d })}
            style={{ padding: '4px 12px' }}
          >→</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {DAY_LABELS.map(dl => (
            <div key={dl} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '4px 0' }}>
              {dl}
            </div>
          ))}
          {calDays.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const dateStr = `${calYear}-${String(calMo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const count = calCounts[dateStr] ?? 0
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            return (
              <div
                key={dateStr}
                onClick={() => handleDateClick(dateStr)}
                style={{
                  textAlign: 'center',
                  padding: '5px 2px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent)22' : undefined,
                  color: isSelected ? '#fff' : undefined,
                  fontWeight: isToday ? 700 : undefined,
                  fontSize: 13,
                }}
              >
                <div>{day}</div>
                {count > 0 && (
                  <div style={{
                    fontSize: 10, lineHeight: 1, fontWeight: 600,
                    color: isSelected ? 'rgba(255,255,255,0.8)' : '#10b981',
                  }}>
                    {count}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Booking form — shown after date selected */}
      <div ref={formRef}>
        {!selectedDate ? (
          <p className="helper">{t('newBooking.pickDate')}</p>
        ) : (
          <>
            <h4 style={{ marginBottom: 8 }}>{dateLabel}</h4>

            {/* Toggle existing bookings for this date */}
            <button
              onClick={() => toggleDayBookings(selectedDate!)}
              style={{ background: 'none', border: 'none', padding: 0, marginBottom: 16, cursor: 'pointer', color: '#10b981', fontSize: 13, fontWeight: 600 }}
            >
              {showDayBookings ? t('newBooking.hideDayBookings', 'Hide bookings for this date') : t('newBooking.showDayBookings', 'See current bookings this date')}
            </button>

            {showDayBookings && (
              <div style={{ marginBottom: 16 }}>
                {dayBookingsLoading ? (
                  <p className="helper">{t('loading')}</p>
                ) : dayBookings.length === 0 ? (
                  <p className="helper">{t('newBooking.noDayBookings', 'No bookings for this date.')}</p>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {dayBookings.map(bk => {
                      const time = new Date(bk.start_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone })
                      return (
                        <div key={bk.id} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, background: 'var(--card-bg, rgba(255,255,255,0.04))', border: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 600 }}>{time}</span>
                          {bk.service_name && <span> · {bk.service_name}</span>}
                          {bk.customer_name && <span className="helper"> · {bk.customer_name}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Customer */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>{t('newBooking.customer')}</label>
                <Link to="/customers/new" style={{ fontSize: 13 }}>{t('newBooking.newCustomer')}</Link>
              </div>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                style={{ width: '100%' }}
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Connect to existing order */}
            <div style={{ marginBottom: 12 }}>
              <label>{t('newBooking.connectOrder', 'Connect to existing order')}</label>
              <select
                value={linkOrderId}
                onChange={e => { setLinkOrderId(e.target.value); if (e.target.value) setLinkPaymentId('') }}
                style={{ width: '100%' }}
              >
                <option value="">{t('newBooking.newOrder', 'Create new order')}</option>
                {billingOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    #{o.order_no} · {o.product_name || t('newBooking.order', 'Order')} · {t('newBooking.remainingQty', 'Remaining')}: {o.remaining_qty}
                  </option>
                ))}
              </select>
            </div>

            {/* Connect to advance payment */}
            {!linkOrderId && (
              <div style={{ marginBottom: 12 }}>
                <label>{t('newBooking.connectPayment', 'Connect to advance payment')}</label>
                <select
                  value={linkPaymentId}
                  onChange={e => setLinkPaymentId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">{t('newBooking.noAdvancePayment', 'None')}</option>
                  {billingPayments.map(p => {
                    const amt = Number(p.amount)
                    const bookingPrice = parseAmount(priceStr || '0')
                    const afterThis = amt - bookingPrice
                    const dateStr = new Date(String(p.payment_date).slice(0, 10) + 'T12:00:00').toLocaleDateString(locale)
                    const afterStr = afterThis > 0 ? ` → $${afterThis.toFixed(2)} after booking` : ''
                    return (
                      <option key={p.id} value={p.id}>
                        Remaining: ${amt.toFixed(2)} · {dateStr}{p.notes ? ` · ${p.notes}` : ''}{afterStr}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Time */}
            <div className="row" style={{ marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <label>{t('newBooking.startTime')}</label>
                <TimePicker value={startTime} onChange={v => { setStartTime(v); setEndTimeOverride(null) }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <label>{t('newBooking.endTime')}</label>
                <TimePicker value={endTime || '09:00'} onChange={setEndTimeOverride} />
                {selectedService?.duration_minutes && !endTimeOverride && (
                  <p className="helper" style={{ marginTop: 4 }}>
                    {t('newBooking.duration', { min: selectedService.duration_minutes })}
                  </p>
                )}
              </div>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 12 }}>
              <label>{t('newBooking.price')}</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={priceStr}
                onChange={e => setPriceStr(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 12 }}>
              <label>{t('newBooking.notes')}</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            {/* SMS confirmation */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed', opacity: 0.45 }}>
                <input
                  type="checkbox"
                  checked={sendConfirmation}
                  onChange={() => {}}
                  disabled
                  style={{ width: 16, height: 16 }}
                />
                <span>{t('newBooking.sendConfirmationSms')} (coming soon)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? t('newBooking.saving') : t('newBooking.save')}
              </button>
              <button onClick={() => setSelectedDate(null)} disabled={saving}>
                {t('cancel', 'Cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
