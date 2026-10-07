import { useEffect, useRef, useState } from 'react'
import { fetchBootstrap, createCustomer, getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { formatDate } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type QsOrderRow = {
  id: string
  order_no: number
  order_date: string | null
  total: number
  paid_amount: number
  product_list: string
  payment_type: string | null
}

type SortCol = 'date' | 'no' | 'products' | 'total' | 'payment'

export default function QuickSalesPage() {
  const { fmtMoney } = useCurrency()

  const [customerId, setCustomerId] = useState<string | null>(null)
  const customerIdRef = useRef<string | null>(null)

  // Search fields
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'card' | 'cash'>('all')

  // Results
  const [orders, setOrders] = useState<QsOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Modal
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [modalLoadingId, setModalLoadingId] = useState<string | null>(null)

  function doFetch(cid: string, params: { q?: string; fromDate?: string; toDate?: string; minAmount?: string; maxAmount?: string }) {
    const p = new URLSearchParams()
    p.set('customer_id', cid)
    if (params.q)         p.set('q',          params.q)
    if (params.fromDate)  p.set('from_date',  params.fromDate)
    if (params.toDate)    p.set('to_date',    params.toDate)
    if (params.minAmount) p.set('min_amount', params.minAmount)
    if (params.maxAmount) p.set('max_amount', params.maxAmount)
    setLoading(true); setErr(null)
    fetch(`${BASE}/api/search-orders?${p}`, { cache: 'no-store', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setOrders(d?.orders ?? []))
      .catch(() => setErr('Failed to load orders'))
      .finally(() => setLoading(false))
  }

  // Resolve Quick Sales customer then load orders
  useEffect(() => {
    ;(async () => {
      try {
        const { customers } = await fetchBootstrap()
        let qsc = customers.find((c: any) => c.name === 'Quick Sales')
        if (!qsc) {
          const created = await createCustomer({ name: 'Quick Sales', customer_type: 'Direct', shipping_cost: 0 })
          customerIdRef.current = created.id
        } else {
          customerIdRef.current = qsc.id
        }
        setCustomerId(customerIdRef.current)
        doFetch(customerIdRef.current!, {})
      } catch { /* non-fatal */ }
    })()
  }, [])

  // Refresh after any QS sale completes
  useEffect(() => {
    const handler = () => {
      if (customerIdRef.current) doFetch(customerIdRef.current, {})
    }
    window.addEventListener('qs-sale-completed', handler)
    return () => window.removeEventListener('qs-sale-completed', handler)
  }, [])

  function handleSearch() {
    if (!customerId) return
    doFetch(customerId, { q, fromDate, toDate, minAmount, maxAmount })
  }

  function handleClear() {
    setQ(''); setFromDate(''); setToDate(''); setMinAmount(''); setMaxAmount('')
    setPaymentFilter('all'); setSortCol('date'); setSortDir('desc')
    if (customerId) doFetch(customerId, {})
  }

  async function openOrderModal(row: QsOrderRow) {
    setModalLoadingId(row.id)
    try {
      const res = await fetch(`${BASE}/api/order?id=${row.id}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedOrder(data.order ?? data)
    } catch {
      alert('Failed to load order')
    } finally {
      setModalLoadingId(null)
    }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function colHeader(col: SortCol, label: string, align: 'left' | 'right' = 'left') {
    const active = sortCol === col
    return (
      <th
        style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--primary)' : undefined }}
        onClick={() => toggleSort(col)}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  function paymentLabel(type: string | null) {
    if (!type) return '—'
    if (type === 'Cash') return 'Cash'
    if (type === 'amp_terminal') return 'Card'
    return type
  }

  const clientFiltered = orders.filter(o => {
    if (paymentFilter === 'cash') return o.payment_type === 'Cash'
    if (paymentFilter === 'card') return o.payment_type !== 'Cash' && o.payment_type != null
    return true
  })

  const sorted = [...clientFiltered].sort((a, b) => {
    let v = 0
    if      (sortCol === 'date')     v = (a.order_date ?? '').localeCompare(b.order_date ?? '')
    else if (sortCol === 'no')       v = a.order_no - b.order_no
    else if (sortCol === 'products') v = a.product_list.localeCompare(b.product_list)
    else if (sortCol === 'total')    v = Number(a.total) - Number(b.total)
    else if (sortCol === 'payment')  v = (a.payment_type ?? '').localeCompare(b.payment_type ?? '')
    return sortDir === 'asc' ? v : -v
  })

  return (
    <div className="page-narrow">
      {/* Banner */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 20px' }}>
        <div>
          <h2 style={{ margin: '0 0 2px' }}>Quick Sale</h2>
          <p className="helper" style={{ margin: 0, fontSize: 14 }}>Scan a product barcode to add it to the cart.</p>
        </div>
        <span style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>🛒</span>
      </div>

      {/* Orders */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ margin: '0 0 14px' }}>Quick Sale Orders</h3>

        {/* Row 1: free text + action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Order #, product…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="primary" onClick={handleSearch}>Search</button>
          <button onClick={handleClear}>Clear</button>
        </div>

        {/* Row 2: date + amount filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date from</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch() }} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date to</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch() }} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Amount from</label>
            <input type="number" min="0" placeholder="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch() }} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Amount to</label>
            <input type="number" min="0" placeholder="Any" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch() }} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Row 3: payment type toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14, width: 'fit-content' }}>
          {(['all', 'card', 'cash'] as const).map(f => (
            <button
              key={f}
              onClick={() => setPaymentFilter(f)}
              style={{
                padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: paymentFilter === f ? 'var(--primary)' : 'transparent',
                color: paymentFilter === f ? '#fff' : undefined,
              }}
            >
              {f === 'all' ? 'All' : f === 'card' ? 'Card' : 'Cash'}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</div>}
        {err && <div style={{ color: 'var(--color-error)', fontSize: 14 }}>{err}</div>}
        {!loading && !err && sorted.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 14 }}>No orders found.</div>
        )}
        {!loading && !err && sorted.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {colHeader('date', 'Date')}
                  {colHeader('no', 'Order #')}
                  {colHeader('products', 'Products')}
                  {colHeader('total', 'Total', 'right')}
                  {colHeader('payment', 'Payment', 'right')}
                </tr>
              </thead>
              <tbody>
                {sorted.map(o => (
                  <tr
                    key={o.id}
                    onClick={() => openOrderModal(o)}
                    style={{ cursor: modalLoadingId === o.id ? 'wait' : 'pointer' }}
                  >
                    <td style={tdStyle}>{o.order_date ? formatDate(o.order_date) : '—'}</td>
                    <td style={tdStyle}>{o.order_no}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.product_list || '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.total)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{paymentLabel(o.payment_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!q && !fromDate && !toDate && !minAmount && !maxAmount && orders.length === 50 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                Showing last 50 orders — use search to find older ones.
              </div>
            )}
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailModal
          isOpen
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          customerName="Quick Sales"
          customerId={customerId ?? undefined}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 600,
  padding: '4px 8px 4px 0',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px 6px 0',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}
