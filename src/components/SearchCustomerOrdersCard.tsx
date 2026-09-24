import { useEffect, useRef, useState } from 'react'
import { getAuthHeaders } from '../lib/api'
import { formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'
import OrderDetailModal from './OrderDetailModal'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type OrderRow = {
  id: string
  order_no: number
  order_date: string | null
  delivered: boolean
  notes: string | null
  customer_id: string | null
  customer_name: string | null
  total: number
  paid_amount: number
  product_list: string
}

interface Props {
  defaultOpen?: boolean
  hideHeader?: boolean
  initialProductId?: string
  initialCustomerId?: string
}

export default function SearchCustomerOrdersCard({ defaultOpen = false, hideHeader = false, initialProductId, initialCustomerId }: Props) {
  const { fmtMoney } = useCurrency()

  const [open, setOpen] = useState(defaultOpen || hideHeader || !!initialProductId || !!initialCustomerId)
  const fetchedRef = useRef(false)

  const filterProductId  = initialProductId  ?? ''
  const filterCustomerId = initialCustomerId ?? ''

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  type SortCol = 'date' | 'no' | 'customer' | 'products' | 'total' | 'balance'
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Search state
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all')

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [modalCustomerName, setModalCustomerName] = useState('')
  const [modalCustomerId, setModalCustomerId] = useState<string | undefined>(undefined)
  const [modalLoadingId, setModalLoadingId] = useState<string | null>(null)

  function buildUrl(overrides?: Record<string, string>) {
    const p = new URLSearchParams()
    const params = { q, from_date: fromDate, to_date: toDate, min_amount: minAmount, max_amount: maxAmount, ...overrides }
    if (params.q)          p.set('q',          params.q)
    if (params.from_date)  p.set('from_date',  params.from_date)
    if (params.to_date)    p.set('to_date',    params.to_date)
    if (params.min_amount) p.set('min_amount', params.min_amount)
    if (params.max_amount) p.set('max_amount', params.max_amount)
    if (filterProductId)   p.set('product_id',  filterProductId)
    if (filterCustomerId)  p.set('customer_id', filterCustomerId)
    return `${BASE}/api/search-orders?${p}`
  }

  function fetchOrders(url: string) {
    setLoading(true)
    setErr(null)
    fetch(url, { cache: 'no-store', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setOrders(d?.orders ?? []))
      .catch(() => setErr('Failed to load orders'))
      .finally(() => setLoading(false))
  }

  // Load last 50 once on first open
  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    fetchOrders(buildUrl())
  }, [open])

  function handleSearch() {
    fetchOrders(buildUrl())
  }

  function handleClear() {
    setQ(''); setFromDate(''); setToDate(''); setMinAmount(''); setMaxAmount(''); setPaidFilter('all')
    setSortCol('date'); setSortDir('desc')
    fetchOrders(`${BASE}/api/search-orders`)
  }

  async function openOrderModal(row: OrderRow) {
    setModalLoadingId(row.id)
    try {
      const res = await fetch(`${BASE}/api/order?id=${row.id}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedOrder(data.order ?? data)
      setModalCustomerName(row.customer_name ?? '')
      setModalCustomerId(row.customer_id ?? undefined)
    } catch {
      alert('Failed to load order')
    } finally {
      setModalLoadingId(null)
    }
  }

  const balance = (o: OrderRow) => Number(o.total) - Number(o.paid_amount)

  return (
    <div className="card page-normal" style={{ marginTop: 12 }}>
      {!hideHeader && (
        <div
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>Search Orders</h3>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Search fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <input
                type="text"
                placeholder="Customer, order #, product…"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date from</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date to</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Amount from</label>
              <input type="number" min="0" placeholder="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Amount to</label>
              <input type="number" min="0" placeholder="Any" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Paid filter + action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['all', 'paid', 'unpaid'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPaidFilter(f)}
                  style={{
                    padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                    background: paidFilter === f ? 'var(--primary)' : 'transparent',
                    color: paidFilter === f ? '#fff' : undefined,
                  }}
                >
                  {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
                </button>
              ))}
            </div>
            <button className="primary" onClick={handleSearch}>Search</button>
            <button onClick={handleClear}>Clear</button>
          </div>

          {/* Results */}
          {loading && <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</div>}
          {err && <div style={{ color: 'var(--color-error)', fontSize: 14 }}>{err}</div>}

          {!loading && !err && orders.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: 14 }}>No orders found.</div>
          )}

          {!loading && !err && orders.length > 0 && (() => {
            function toggleSort(col: SortCol) {
              if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
              else { setSortCol(col); setSortDir('asc') }
            }
            function colHeader(col: SortCol, label: string, align: 'left' | 'right' = 'left') {
              const active = sortCol === col
              const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
              return (
                <th
                  style={{ ...th, textAlign: align, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--primary)' : undefined }}
                  onClick={() => toggleSort(col)}
                >
                  {label}{arrow}
                </th>
              )
            }
            const sorted = [...orders].sort((a, b) => {
              let v = 0
              if (sortCol === 'date')     v = (a.order_date ?? '').localeCompare(b.order_date ?? '')
              else if (sortCol === 'no')  v = a.order_no - b.order_no
              else if (sortCol === 'customer') v = (a.customer_name ?? '').localeCompare(b.customer_name ?? '')
              else if (sortCol === 'products') v = a.product_list.localeCompare(b.product_list)
              else if (sortCol === 'total')   v = Number(a.total) - Number(b.total)
              else if (sortCol === 'balance') v = balance(a) - balance(b)
              return sortDir === 'asc' ? v : -v
            })
            const displayed = paidFilter === 'all' ? sorted
              : sorted.filter(o => paidFilter === 'paid' ? balance(o) <= 0.009 : balance(o) > 0.009)
            return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {colHeader('date', 'Date')}
                      {colHeader('no', 'Order #')}
                      {colHeader('customer', 'Customer')}
                      {colHeader('products', 'Products')}
                      {colHeader('total', 'Total', 'right')}
                      {colHeader('balance', 'Balance', 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(o => (
                      <tr
                        key={o.id}
                        onClick={() => openOrderModal(o)}
                        style={{ cursor: modalLoadingId === o.id ? 'wait' : 'pointer' }}
                      >
                        <td style={td}>{o.order_date ? formatDate(o.order_date) : '—'}</td>
                        <td style={td}>{o.order_no}</td>
                        <td style={td}>{o.customer_name ?? '—'}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.product_list || '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.total)}</td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: balance(o) > 0.009 ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {fmtMoney(balance(o))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!q && !fromDate && !toDate && !minAmount && !maxAmount && !filterProductId && !filterCustomerId && orders.length === 50 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>Showing last 50 orders — use search to find older ones.</div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          isOpen
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          customerName={modalCustomerName}
          customerId={modalCustomerId}
        />
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 600,
  padding: '4px 8px 4px 0',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '6px 8px 6px 0',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}
