import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

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

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

export default function BookingCustomersPage() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<BookingCustomer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [page])

  function onSearchChange(val: string) {
    setSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
      fetchCustomers(val, 1)
    }, 300)
  }

  async function fetchCustomers(q = search, p = page) {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(p) })
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

  const perPage = 50
  const totalPages = Math.ceil(total / perPage)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 20 }}>{t('bookingClients.title', 'Booking Clients')}</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          type="text"
          placeholder={t('bookingClients.searchPlaceholder', 'Search by name…')}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <div className="helper" style={{ marginLeft: 'auto' }}>
          {total} {t('bookingClients.clients', 'clients')}
        </div>
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
              <Link key={c.id} to={`/customers/${c.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.phone && <div className="helper">{c.phone}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.booking_count} {t('bookingClients.bookings', 'bookings')}</div>
                      <div className="helper">{t('bookingClients.last', 'Last')}: {fmtDate(c.last_booking_at)}</div>
                    </div>
                    {c.unpaid_count > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#f59e0b' }}>{fmtCurrency(c.unpaid_amount)}</div>
                        <div className="helper" style={{ color: '#f59e0b' }}>{t('bookingClients.outstanding', 'outstanding')}</div>
                      </div>
                    )}
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
