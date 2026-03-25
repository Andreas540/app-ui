import { useEffect, useRef, useState } from 'react'
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

type FilterMode = 'today' | '7days' | 'revenue' | 'outstanding'

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
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function fmtCurrency(amount: number | null, currency: string | null, locale: string, defaultCurrency: string) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || defaultCurrency,
    minimumFractionDigits: 0,
  }).format(amount)
}

function toDateStr(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone,
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function BookingDashboardPage() {
  const { t } = useTranslation()
  const { locale, timezone, currency: tenantCurrency } = useLocale()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeFilter, setActiveFilter] = useState<FilterMode>('today')

  // Calendar
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [calCounts, setCalCounts] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dateBookings, setDateBookings] = useState<BookingRow[]>([])
  const [datePayments, setDatePayments] = useState<BookingRow[]>([])
  const [dateLoading, setDateLoading] = useState(false)

  // Payment list for revenue / outstanding modes
  const [paymentList, setPaymentList] = useState<BookingRow[]>([])
  const [paymentLoading, setPaymentLoading] = useState(false)

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPending = useRef(false)

  useEffect(() => { fetchDashboard() }, [])

  // Scroll after React has actually committed the new render
  useEffect(() => {
    if (scrollPending.current) {
      scrollPending.current = false
      scrollToList()
    }
  })

  useEffect(() => {
    const month = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`
    fetchCalendarCounts(month)
    setSelectedDate(null)
  }, [calMonth])

  useEffect(() => {
    if (activeFilter === 'revenue' || activeFilter === 'outstanding') {
      fetchPaymentList(activeFilter)
    }
  }, [activeFilter])

  async function fetchDashboard() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-booking-dashboard`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function fetchCalendarCounts(month: string) {
    try {
      const res = await fetch(`${apiBase()}/api/get-booking-calendar?month=${month}`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const json = await res.json()
      setCalCounts(json.counts || {})
    } catch { /* optional */ }
  }

  async function fetchPaymentList(mode: 'revenue' | 'outstanding') {
    try {
      setPaymentLoading(true)
      const now = new Date()
      const params = new URLSearchParams({ page: '1' })
      if (mode === 'revenue') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        params.set('date_from', toDateStr(firstDay, timezone))
        params.set('date_to', toDateStr(lastDay, timezone))
      } else {
        params.set('status', 'unpaid')
      }
      const res = await fetch(`${apiBase()}/api/get-booking-payments?${params}`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const json = await res.json()
      setPaymentList(json.bookings || [])
    } catch { /* ignore */ } finally {
      setPaymentLoading(false)
    }
  }

  async function fetchDateData(dateStr: string, currentData: DashboardData | null) {
    setDateLoading(true)
    try {
      const res = await fetch(`${apiBase()}/api/get-booking-calendar-date?date=${dateStr}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const json = await res.json()
        setDateBookings(json.bookings || [])
        setDatePayments(json.payments || [])
      } else {
        // fallback: filter from already-loaded today/upcoming
        const allLoaded = [...(currentData?.today ?? []), ...(currentData?.upcoming ?? [])]
        setDateBookings(allLoaded.filter(bk => toDateStr(new Date(bk.start_at), timezone) === dateStr))
        setDatePayments([])
      }
    } catch {
      const allLoaded = [...(currentData?.today ?? []), ...(currentData?.upcoming ?? [])]
      setDateBookings(allLoaded.filter(bk => toDateStr(new Date(bk.start_at), timezone) === dateStr))
      setDatePayments([])
    } finally {
      setDateLoading(false)
    }
  }

  async function handleSync() {
    try {
      setSyncing(true)
      setSyncResult(null)
      const res = await fetch(`${apiBase()}/api/sync-booking-provider`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'simplybook' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setSyncResult(t('bookingIntegration.syncSuccess', { count: json.records_processed ?? 0 }))
      await fetchDashboard()
    } catch (e: any) {
      setSyncResult(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function scrollToList() {
    const el = listRef.current
    if (!el) return
    // Walk up to find the first element that actually scrolls
    let parent: HTMLElement | null = el.parentElement
    while (parent && parent !== document.documentElement) {
      const { overflowY } = getComputedStyle(parent)
      if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
        const offset = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
        parent.scrollTo({ top: offset, behavior: 'smooth' })
        return
      }
      parent = parent.parentElement
    }
    // Fallback: window scroll
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' })
  }

  function handleCardClick(filter: FilterMode) {
    setActiveFilter(filter)
    setSelectedDate(null)
    scrollPending.current = true
  }

  function handleDateClick(dateStr: string) {
    setSelectedDate(dateStr)
    fetchDateData(dateStr, data)
    scrollPending.current = true
  }

  // Build calendar grid
  const calYear = calMonth.getFullYear()
  const calMo = calMonth.getMonth()
  const firstDow = new Date(calYear, calMo, 1).getDay()
  const daysInMonth = new Date(calYear, calMo + 1, 0).getDate()
  const calDays: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) calDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d)
  const monthLabel = calMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const todayStr = toDateStr(new Date(), timezone)

  function getListTitle(): string {
    if (selectedDate) {
      return new Date(selectedDate + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
    }
    switch (activeFilter) {
      case 'today':       return t('bookingDashboard.todaySchedule', "Today's Schedule")
      case '7days':       return t('bookingDashboard.upcoming', 'Next 7 Days')
      case 'revenue':     return t('bookingDashboard.monthlyRevenue', 'Revenue This Month')
      case 'outstanding': return t('bookingDashboard.outstandingAmount', 'Outstanding Amount')
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>
  if (error)   return <div style={{ padding: 32, color: 'salmon' }}>{error}</div>
  if (!data)   return null

  return (
    <div className="card" style={{ maxWidth: 900, paddingBottom: '60vh' }}>

      {/* Header with sync button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ margin: 0 }}>{t('bookingDashboard.title', 'Bookings')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncResult && (
            <span style={{ fontSize: 13, color: syncResult.includes('ailed') ? 'salmon' : '#10b981' }}>
              {syncResult}
            </span>
          )}
          <button onClick={handleSync} disabled={syncing} style={{ opacity: syncing ? 0.6 : 1 }}>
            {syncing ? t('bookingIntegration.syncing', 'Syncing…') : t('bookingIntegration.syncNow', 'Sync now')}
          </button>
        </div>
      </div>

      {/* Summary cards — 2 rows × 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div
          className="card"
          onClick={() => handleCardClick('today')}
          style={{
            padding: 20, cursor: 'pointer',
            outline: activeFilter === 'today' && !selectedDate ? '2px solid var(--accent)' : undefined,
          }}
        >
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.todayCount', "Today's bookings")}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.today.length}</div>
        </div>

        <div
          className="card"
          onClick={() => handleCardClick('7days')}
          style={{
            padding: 20, cursor: 'pointer',
            outline: activeFilter === '7days' && !selectedDate ? '2px solid var(--accent)' : undefined,
          }}
        >
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.upcomingCount', 'Next 7 days')}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.upcoming.length}</div>
        </div>

        <div
          className="card"
          onClick={() => handleCardClick('revenue')}
          style={{
            padding: 20, cursor: 'pointer',
            outline: activeFilter === 'revenue' && !selectedDate ? '2px solid var(--accent)' : undefined,
          }}
        >
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.monthlyRevenue', 'Revenue this month')}</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtCurrency(data.monthly_revenue, null, locale, tenantCurrency)}</div>
          <div className="helper">{data.monthly_booking_count} {t('bookingDashboard.bookings', 'bookings')}</div>
        </div>

        <div
          className="card"
          onClick={() => handleCardClick('outstanding')}
          style={{
            padding: 20, cursor: 'pointer',
            outline: activeFilter === 'outstanding' && !selectedDate ? '2px solid var(--accent)' : undefined,
          }}
        >
          <div className="helper" style={{ marginBottom: 4 }}>{t('bookingDashboard.outstandingAmount', 'Outstanding amount')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.outstanding_count > 0 ? '#f59e0b' : undefined }}>
            {fmtCurrency(data.outstanding_amount, null, locale, tenantCurrency)}
          </div>
          <div className="helper">{data.outstanding_count} {t('bookingDashboard.unpaid', 'unpaid')}</div>
        </div>
      </div>

      {/* Calendar */}
      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
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
                    fontSize: 10,
                    lineHeight: 1,
                    fontWeight: 600,
                    color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--accent)',
                  }}>
                    {count}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* List section */}
      <div ref={listRef}>
        <h3 style={{ marginBottom: 16 }}>{getListTitle()}</h3>

        {selectedDate ? (
          /* Date-specific view */
          dateLoading ? (
            <div className="helper">{t('loading')}</div>
          ) : dateBookings.length === 0 && datePayments.length === 0 ? (
            <div className="helper">No bookings or payments for this date.</div>
          ) : (
            <>
              {dateBookings.length > 0 && (
                <>
                  {datePayments.length > 0 && (
                    <div className="helper" style={{ marginBottom: 8, fontWeight: 600 }}>Bookings</div>
                  )}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {dateBookings.map(bk => (
                      <BookingRowCard key={bk.id} bk={bk} showDate locale={locale} timezone={timezone} tenantCurrency={tenantCurrency} />
                    ))}
                  </div>
                </>
              )}
              {datePayments.length > 0 && (
                <>
                  <div className="helper" style={{ marginBottom: 8, marginTop: 16, fontWeight: 600 }}>Payments</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {datePayments.map(bk => (
                      <PaymentRowCard key={bk.id} bk={bk} locale={locale} timezone={timezone} tenantCurrency={tenantCurrency} />
                    ))}
                  </div>
                </>
              )}
            </>
          )
        ) : activeFilter === 'today' ? (
          data.today.length === 0 ? (
            <div className="helper">{t('bookingDashboard.nothingToday', 'No bookings scheduled today.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.today.map(bk => (
                <BookingRowCard key={bk.id} bk={bk} showDate={false} locale={locale} timezone={timezone} tenantCurrency={tenantCurrency} />
              ))}
            </div>
          )
        ) : activeFilter === '7days' ? (
          data.upcoming.length === 0 ? (
            <div className="helper">No upcoming bookings in the next 7 days.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.upcoming.map(bk => (
                <BookingRowCard key={bk.id} bk={bk} showDate locale={locale} timezone={timezone} tenantCurrency={tenantCurrency} />
              ))}
            </div>
          )
        ) : paymentLoading ? (
          <div className="helper">{t('loading')}</div>
        ) : paymentList.length === 0 ? (
          <div className="helper">No payments found.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {paymentList.map(bk => (
              <PaymentRowCard key={bk.id} bk={bk} locale={locale} timezone={timezone} tenantCurrency={tenantCurrency} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BookingRowCard({
  bk, showDate, locale, timezone, tenantCurrency,
}: {
  bk: BookingRow
  showDate: boolean
  locale: string
  timezone: string
  tenantCurrency: string
}) {
  const time = new Date(bk.start_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone })
  const date = showDate
    ? new Date(bk.start_at).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone })
    : null

  return (
    <Link to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{ padding: '12px 16px' }}>
        {/* Row 1: time/date · booking status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {date ? `${date} · ` : ''}{time}
          </span>
          <StatusBadge status={bk.booking_status} map={STATUS_COLORS} />
        </div>
        {/* Row 2: customer name · amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {bk.customer_name ?? '—'}
          </span>
          {bk.total_amount != null && (
            <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {fmtCurrency(bk.total_amount, bk.currency, locale, tenantCurrency)}
            </span>
          )}
        </div>
        {/* Row 3: service · payment status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: bk.assigned_staff_name ? 2 : 0 }}>
          <span className="helper" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {bk.service_name ?? '—'}
          </span>
          <StatusBadge status={bk.payment_status} map={PAYMENT_COLORS} />
        </div>
        {/* Row 4: staff name (if present) */}
        {bk.assigned_staff_name && (
          <div className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bk.assigned_staff_name}
          </div>
        )}
      </div>
    </Link>
  )
}

function PaymentRowCard({
  bk, locale, timezone, tenantCurrency,
}: {
  bk: BookingRow
  locale: string
  timezone: string
  tenantCurrency: string
}) {
  const date = new Date(bk.start_at).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })

  return (
    <Link to={`/bookings/${bk.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{ padding: '12px 16px' }}>
        {/* Row 1: date · payment status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{date}</span>
          <StatusBadge status={bk.payment_status} map={PAYMENT_COLORS} />
        </div>
        {/* Row 2: customer name · amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {bk.customer_name ?? '—'}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
            {fmtCurrency(bk.total_amount, bk.currency, locale, tenantCurrency)}
          </span>
        </div>
        {/* Row 3: service */}
        {bk.service_name && (
          <div className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bk.service_name}
          </div>
        )}
      </div>
    </Link>
  )
}
