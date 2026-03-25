import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'

interface BookingCustomer {
  id: string
  name: string
  phone: string | null
  booking_count: number
  last_booking_at: string | null
  total_booked: number
  unpaid_count: number
  unpaid_amount: number
}

type SortOption = 'last_booking' | 'name' | 'booking_count'

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(amount: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount)
}

export default function BookingCustomersPage() {
  const { t } = useTranslation()
  const { locale, currency: tenantCurrency } = useLocale()
  const [customers, setCustomers] = useState<BookingCustomer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('last_booking')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [page, sortBy])

  function onSearchChange(val: string) {
    setSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
      fetchCustomers(val, 1)
    }, 300)
  }

  async function fetchCustomers(q = search, p = page, s = sortBy) {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(p), sort: s })
      if (q) params.set('q', q)
      const res = await fetch(`${apiBase()}/api/get-booking-customers?${params}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCustomers(data.customers || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e.message || 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  function onSortChange(val: SortOption) {
    setSortBy(val)
    setPage(1)
  }

  const perPage = 50
  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <h3 style={{ marginBottom: 20 }}>{t('bookingClients.title', 'Booking Clients')}</h3>

      {/* 2-column grid: count label | search+sort */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 8, marginBottom: 20, alignItems: 'center' }}>
        <span className="helper" style={{ whiteSpace: 'nowrap' }}>{total} {t('bookingClients.clients', 'clients')}</span>
        <input
          type="text"
          placeholder={t('bookingClients.searchPlaceholder', 'Search by name…')}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{ width: '100%' }}
        />
        <span className="helper" style={{ whiteSpace: 'nowrap' }}>{t('sortBy', 'Sort by')}:</span>
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as SortOption)}
          style={{ width: '100%' }}
        >
          <option value="last_booking">{t('bookingClients.sortLastBooking', 'Last booking')}</option>
          <option value="booking_count">{t('bookingClients.sortBookingCount', '# Bookings')}</option>
          <option value="name">{t('bookingClients.sortName', 'Name')}</option>
        </select>
      </div>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="helper">{t('loading')}</div>
      ) : customers.length === 0 ? (
        <div className="helper">{t('bookingClients.noClients', 'No booking clients found. Run a sync to import clients.')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            {customers.map(c => (
              <div key={c.id} className="card" style={{ padding: '12px 16px' }}>
                {/* Row 1: name · outstanding badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <Link to={`/customers/${c.id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {c.name}
                    </span>
                  </Link>
                  {c.unpaid_count > 0 && c.unpaid_amount > 0 && (
                    <span style={{
                      flexShrink: 0, marginLeft: 8,
                      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                      fontSize: 11, fontWeight: 600,
                      background: '#f59e0b22', color: '#f59e0b',
                    }}>
                      {fmtCurrency(c.unpaid_amount, locale, tenantCurrency)} {t('bookingClients.outstanding', 'outstanding')}
                    </span>
                  )}
                </div>
                {/* Row 2: booking count · last booking */}
                <div style={{ marginBottom: c.phone ? 3 : 0 }}>
                  <span className="helper">
                    {c.booking_count} {t('bookingClients.bookings', 'bookings')}
                    {' · '}
                    {t('bookingClients.last', 'Last')}: {fmtDate(c.last_booking_at)}
                  </span>
                </div>
                {/* Row 3: phone (clickable) */}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', display: 'block' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {c.phone}
                  </a>
                )}
              </div>
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
