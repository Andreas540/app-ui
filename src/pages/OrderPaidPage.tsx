// src/pages/OrderPaidPage.tsx
// Public-facing order payment confirmation page at /order-paid/:orderId
// No authentication required.

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type Status = 'loading' | 'paid' | 'pending' | 'canceled' | 'error'

type OrderData = {
  order_no: number
  total_amount: number
  paid_amount: number
  customer_name: string
  tenant_name: string
  tenant_icon: string | null
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '28px 24px',
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  maxWidth: 480,
  width: '100%',
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f3f4f6',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '32px 16px',
}

const mutedStyle: React.CSSProperties = { color: '#6b7280', fontSize: 14 }

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function OrderPaidPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const [searchParams] = useSearchParams()
  const canceled = searchParams.get('canceled') === '1'

  const [status, setStatus] = useState<Status>('loading')
  const [data, setData]     = useState<OrderData | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!orderId) { setStatus('error'); setErrMsg('Invalid link.'); return }

    if (canceled) { setStatus('canceled'); return }

    fetch(`${BASE}/api/public-order-status?order_id=${encodeURIComponent(orderId)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setStatus('error'); setErrMsg(d.error || 'Order not found'); return }
        setData(d)
        setStatus(d.paid_amount >= d.total_amount && d.total_amount > 0 ? 'paid' : 'pending')
      })
      .catch(() => { setStatus('error'); setErrMsg('Could not load order. Please try again.') })
  }, [orderId, canceled])

  const icon   = data?.tenant_icon
  const tenant = data?.tenant_name || ''

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, gap: 8 }}>
        {icon && (
          <img src={icon} alt={tenant} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
        )}
        {tenant && <div style={{ fontWeight: 700, fontSize: 20, color: '#111' }}>{tenant}</div>}
      </div>

      <div style={cardStyle}>
        {status === 'loading' && (
          <p style={mutedStyle}>Loading…</p>
        )}

        {status === 'error' && (
          <p style={{ color: '#dc2626', fontSize: 14 }}>{errMsg}</p>
        )}

        {status === 'canceled' && (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Payment canceled</h3>
            <p style={mutedStyle}>Your payment was not completed. You can close this page.</p>
          </>
        )}

        {status === 'pending' && data && (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Payment processing…</h3>
            <p style={mutedStyle}>
              We haven't received confirmation yet. This page will update once your payment is confirmed.
              You can safely close this page.
            </p>
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
              <div><strong>Order #{data.order_no}</strong></div>
              <div style={mutedStyle}>{data.customer_name}</div>
            </div>
          </>
        )}

        {status === 'paid' && data && (
          <>
            <div style={{ fontSize: 36, marginBottom: 8, textAlign: 'center' }}>✓</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, textAlign: 'center' }}>Payment received</h3>
            <p style={{ ...mutedStyle, textAlign: 'center', marginBottom: 20 }}>
              Thank you — your payment has been confirmed.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={mutedStyle}>Order</span>
                <span>#{data.order_no}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={mutedStyle}>Customer</span>
                <span>{data.customer_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Amount paid</span>
                <span>{fmt(data.paid_amount)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
