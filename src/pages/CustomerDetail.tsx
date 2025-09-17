import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, type CustomerDetail } from '../lib/api'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchCustomerDetail(id)
        setData(d)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function fmt(n:number) { return `$${(Number(n)||0).toFixed(2)}` }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data

  return (
    <div className="card" style={{maxWidth: 960}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>{customer.name}</h3>
        <Link to="/customers" className="helper">&larr; Back to customers</Link>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <div className="helper">Type</div>
          <div>{customer.customer_type ?? customer.type}</div>
        </div>
        <div>
          <div className="helper">Shipping cost</div>
          <div>{fmt(customer.shipping_cost ?? 0)}</div>
        </div>
        <div>
          <div className="helper">Phone</div>
          <div>{customer.phone || '—'}</div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <div className="helper">Address</div>
          <div>
            {[customer.address1, customer.address2].filter(Boolean).join(', ') || '—'}
            <br/>
            {[customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ') || ''}
          </div>
        </div>
        <div>
          <div className="helper">Totals</div>
          <div>Orders: {fmt(totals.total_orders)}</div>
          <div>Payments: {fmt(totals.total_payments)}</div>
          <div><strong>Owed to me: {fmt(totals.owed_to_me)}</strong></div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Recent orders</h4>
        {orders.length === 0 ? <p className="helper">No orders yet.</p> : (
          <div style={{display:'grid', gap:8}}>
            {orders.map(o => (
              <div key={o.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, borderBottom:'1px solid #eee', padding:'8px 0'}}>
                <div className="helper">#{o.order_no}</div>
                <div>{o.order_date} {o.delivered ? '✓' : ''}</div>
                <div style={{textAlign:'right'}}>{fmt(o.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Recent payments</h4>
        {payments.length === 0 ? <p className="helper">No payments yet.</p> : (
          <div style={{display:'grid', gap:8}}>
            {payments.map(p => (
              <div key={p.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, borderBottom:'1px solid #eee', padding:'8px 0'}}>
                <div className="helper">{p.payment_date}</div>
                <div>{p.payment_type}</div>
                <div style={{textAlign:'right'}}>{fmt(p.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

