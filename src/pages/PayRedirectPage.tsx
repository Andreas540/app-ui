// src/pages/PayRedirectPage.tsx
// Public payment redirect page — /pay/:token
// Looks up the token, checks payment status, then redirects.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f3f4f6',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  fontFamily: 'system-ui, sans-serif',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  color: '#111827',
  borderRadius: 16,
  padding: '32px 28px',
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  maxWidth: 400,
  width: '100%',
  textAlign: 'center',
}

export default function PayRedirectPage() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'paid' | 'expired' | 'not_found'>('loading')

  useEffect(() => {
    if (!token) { setStatus('not_found'); return }
    fetch(`${BASE}/api/pay?t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'redirect' && data.url) {
          setStatus('redirecting')
          window.location.href = data.url
        } else if (data.status === 'paid' && data.order_id) {
          window.location.href = `/order-paid/${data.order_id}`
        } else if (data.status === 'expired') {
          setStatus('expired')
        } else {
          setStatus('not_found')
        }
      })
      .catch(() => setStatus('not_found'))
  }, [token])

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {status === 'loading' || status === 'redirecting' ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{ color: '#6b7280', margin: 0, fontSize: 15 }}>
              {status === 'redirecting' ? 'Redirecting to payment…' : 'Loading…'}
            </p>
          </>
        ) : status === 'expired' ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏰</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, color: '#111827' }}>Link expired</h3>
            <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>
              This payment link has expired. Please contact the sender to get a new one.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, color: '#111827' }}>Link not found</h3>
            <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>
              This payment link is invalid or has already been used.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
