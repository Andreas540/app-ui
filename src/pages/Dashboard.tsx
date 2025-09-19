import { useMemo } from 'react'
import { getOrders, clearOrders } from '../lib/storage'

export default function Dashboard() {
  const orders = getOrders()
  const totalOwed = useMemo(
    () => orders.reduce((sum, o) => sum + o.unitPrice * o.qty, 0),
    [orders]
  )
  const recent = orders.slice(-5).reverse()

  return (
    <div className="grid">
      <div className="card">
        <h3>Owed to me</h3>
        <div className="big">${totalOwed.toFixed(2)}</div>
        <div className="helper">Computed from saved orders (local)</div>
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
