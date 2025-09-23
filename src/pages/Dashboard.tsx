import { useEffect, useMemo, useState } from 'react'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'
import { getOrders, clearOrders } from '../lib/storage'

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  
  // Load customers data for totals
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed()
        setCustomers(res.customers)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Calculate totals from database data
  const totalOwedToMe = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.owed_to_me || 0), 0),
    [customers]
  )
  
  const totalOwedToPartners = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.owed_to_partners || 0), 0),
    [customers]
  )

  const myDollars = useMemo(
    () => Math.max(0, Number(totalOwedToMe) - Number(totalOwedToPartners)),
    [totalOwedToMe, totalOwedToPartners]
  )

  // Keep local orders for recent orders display
  const orders = getOrders()
  const recent = orders.slice(-5).reverse()

  return (
    <div className="grid">
      <div className="card">
        <h3>Financial Overview</h3>
        
        {loading ? (
          <div className="helper">Loading...</div>
        ) : err ? (
          <div style={{ color: 'salmon' }}>Error: {err}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Total owed to me */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Total owed to me</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(totalOwedToMe)}
              </div>
            </div>

            {/* Owed to partners */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Owed to partners</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(totalOwedToPartners)}
              </div>
            </div>

            {/* My $ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
                marginTop: 4,
                paddingTop: 8,
                borderTop: '1px solid #eee'
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>My $</div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 20, color: 'var(--primary)' }}>
                {fmtIntMoney(myDollars)}
              </div>
            </div>
          </div>
        )}
        
        <div className="helper" style={{ marginTop: 12 }}>From customer database</div>
      </div>

      <div className="card">
        <h3>Recent orders</h3>
        {recent.length === 0 ? (
          <div className="helper">No orders yet. Add one from "New Order".</div>
        ) : (
          <ul style={{margin:0, paddingLeft:16}}>
            {recent.map(o => (
              <li key={o.id}>
                #{o.orderNo} · {o.productName} × {o.qty} · ${ (o.unitPrice * o.qty).toFixed(2) } · {o.date}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Maintenance</h3>
        <button onClick={() => { if (confirm('Delete ALL saved orders?')) { clearOrders(); location.reload(); }}}>
          Clear saved orders
        </button>
        <p className="helper" style={{marginTop:8}}>Local-only; useful while prototyping.</p>
      </div>
    </div>
  )
}
