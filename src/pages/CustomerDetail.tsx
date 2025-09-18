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
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')

  return (
    <div className="card" style={{maxWidth: 960}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
          <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {customer.name}
          </h3>
          <Link
            to={`/customers/${customer.id}/edit`}
            className="icon-btn"
            title="Edit customer"
            aria-label="Edit customer"
            style={{ width:32, height:32 }}
          >
            ✎
          </Link>
        </div>
        <Link to="/customers" className="helper">&larr; Back to customers</Link>
      </div>

      {/* Two columns on ALL screens for the top info block */}
      <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
        {/* LEFT column: Type + Phone + Address */}
        <div>
          <div className="helper">Type</div>
          <div>{customer.customer_type ?? customer.type}</div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Phone</div>
            <div>
              {customer.phone
                ? <a href={phoneHref(customer.phone)}>{customer.phone}</a>
                : '—'}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Address</div>
            <div>
              {addrLine1 || '—'}{addrLine1 && <br/>}{addrLine2}
            </div>
          </div>
        </div>

        {/* RIGHT column: Shipping + Totals */}
        <div>
          <div className="helper">Shipping cost</div>
          <div>{fmt(customer.shipping_cost ?? 0)}</div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Totals</div>
            <div>Orders: {fmt(totals.total_orders)}</div>
            <div>Payments: {fmt(totals.total_payments)}</div>
            <div><strong>Owed to me: {fmt(totals.owed_to_me)}</strong></div>
          </div>
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



