// src/pages/InvoicePreview.tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type InvoiceData = {
  invoiceNo: string
  invoiceDate: string
  dueDate: string
  deliveryDate: string
  paymentMethod: string
  customer: {
    name: string
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
  }
  orders: Array<{
    product: string
    quantity: number
    unit_price: number
    amount: number
  }>
}

export default function InvoicePreview() {
  const location = useLocation()
  const navigate = useNavigate()
  const invoiceData = location.state as InvoiceData | undefined

  // Base logical canvas (96 dpi): 8.5in × 11in → 816 × 1056
  const BASE_W = 816
  const BASE_H = 1056

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Recompute scale based on actual viewport box (no env()/visualViewport JS parsing)
  const recomputeScale = () => {
    const el = viewportRef.current
    if (!el) return
    const pad = 12 // visual breathing room
    const availW = Math.max(0, el.clientWidth - pad * 2)
    const availH = Math.max(0, el.clientHeight - pad * 2)
    const next = Math.min(availW / BASE_W, availH / BASE_H)
    setScale(next > 0 && Number.isFinite(next) ? next : 1)
  }

  useLayoutEffect(() => {
    recomputeScale()
    const r = () => recomputeScale()
    window.addEventListener('resize', r)
    window.addEventListener('orientationchange', r)
    // iOS address-bar show/hide can change the layout without resize → RAF tick
    let raf = requestAnimationFrame(r)
    return () => {
      window.removeEventListener('resize', r)
      window.removeEventListener('orientationchange', r)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Screen background & scroll lock
  useEffect(() => {
    const prevBg = document.body.style.background
    const prevOverflow = document.body.style.overflow
    document.body.style.background = '#f2f3f5'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.background = prevBg
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const handlePrint = () => window.print()

  const formatDate = (s: string) => {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  }
  const money = (n: number) => `$${Number(n).toFixed(2)}`
  const subtotal = useMemo(
    () => (invoiceData?.orders ?? []).reduce((t, o) => t + o.amount, 0),
    [invoiceData]
  )
  const total = subtotal

  if (!invoiceData) {
    return (
      <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 12 }}>No invoice data found.</p>
          <button
            onClick={() => navigate('/invoices/create')}
            style={{ padding: '10px 16px', border: 'none', borderRadius: 8, background: '#0d6efd', color: '#fff' }}
          >
            Create Invoice
          </button>
        </div>
      </div>
    )
  }

  const { invoiceNo, invoiceDate, dueDate, deliveryDate, paymentMethod, customer, orders } =
    invoiceData

  return (
    <>
      {/* Controls — bottom-right, safe-area aware; visible on mobile; hidden in print */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          right: 'max(12px, env(safe-area-inset-right))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          zIndex: 100_000,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={handlePrint}
          style={{
            padding: '12px 14px',
            border: 'none',
            borderRadius: 12,
            background: '#007bff',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          }}
        >
          Print
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '12px 14px',
            border: 'none',
            borderRadius: 12,
            background: '#6c757d',
            color: '#fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          }}
        >
          Back
        </button>
      </div>

      {/* Viewport — uses 100dvh and honors your app’s top bar via CSS var */}
      <div
        ref={viewportRef}
        className="invoice-viewport"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          // Set this var globally if your top bar is taller on mobile
          top: 'calc(var(--app-top-offset, 56px) + env(safe-area-inset-top))',
          height: 'calc(100dvh - var(--app-top-offset, 56px) - env(safe-area-inset-top))',
          background: '#f2f3f5',
          // Center with flex (avoids iOS grid+transform bug)
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          zIndex: 9999,
        }}
      >
        {/* Scale wrapper — flex centers this box; transform keeps it centered */}
        <div
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            // Helps iOS Safari with transformed layers
            willChange: 'transform',
          }}
        >
          {/* Actual page */}
          <div
            className="invoice-page"
            style={{
              width: '100%',
              height: '100%',
              background: '#fff',
              color: '#333',
              fontFamily: 'Arial, sans-serif',
              boxSizing: 'border-box',
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              // Extra bottom padding so Total never gets clipped by printer margins
              padding: '48px 48px 72px 48px', // 0.5in sides & top, ~0.75in bottom
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 270px', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 100, height: 100, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 }}>
                BLV
              </div>
              <div style={{ fontSize: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>BLV Pack Design LLC</div>
                <div>13967 SW 119th Ave</div>
                <div>Miami, FL 33186</div>
                <div style={{ marginTop: 8 }}>(305) 798-3317</div>
              </div>
              <div style={{ fontSize: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px' }}>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice #</div>
                  <div>{invoiceNo}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice date</div>
                  <div>{formatDate(invoiceDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Due date</div>
                  <div>{formatDate(dueDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Est. delivery</div>
                  <div>{formatDate(deliveryDate)}</div>
                </div>
              </div>
            </div>

            {/* Addresses & meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 270px', gap: 12, marginBottom: 18, fontSize: 14 }}>
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Invoice for</div>
                <div>{customer.name}</div>
                {customer.address1 && <div>{customer.address1}</div>}
                {customer.address2 && <div>{customer.address2}</div>}
                <div>{[customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Payment method</div>
                <div style={{ marginBottom: 16 }}>{paymentMethod}</div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Our contact</div>
                <div>Julian de Armas</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Wire Transfer Instructions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 13 }}>
                  <div>Company Name:</div><div>BLV Pack Design LLC</div>
                  <div>Bank Name:</div><div>Bank of America</div>
                  <div>Account Name:</div><div>BLV Pack Design LLC</div>
                  <div>Account Number:</div><div>898161854242</div>
                  <div style={{ whiteSpace: 'nowrap' }}>Routing Number (ABA):</div><div>026009593</div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ borderTop: '1px solid #ddd' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 140px', gap: 16, padding: '12px 0', fontWeight: 'bold', color: '#1a4d8f', fontSize: 14, borderBottom: '1px solid #ddd' }}>
                  <div>Description</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Unit price</div>
                  <div style={{ textAlign: 'right' }}>Total price</div>
                </div>
                {orders.map((o, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 140px', gap: 16, padding: '12px 0', fontSize: 14, borderBottom: '1px solid #eee' }}>
                    <div>{o.product}</div>
                    <div style={{ textAlign: 'right' }}>{o.quantity}</div>
                    <div style={{ textAlign: 'right' }}>{money(o.unit_price)}</div>
                    <div style={{ textAlign: 'right' }}>{money(o.amount)}</div>
                  </div>
                ))}
              </div>

              <div style={{ flex: 1 }} />

              <div style={{ borderTop: '2px solid #333', paddingTop: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, fontSize: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: 12 }}>Subtotal</div>
                    <div style={{ marginBottom: 12 }}>Adjustments/Discount</div>
                    <div style={{ fontWeight: 'bold', fontSize: 18 }}>Total</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ marginBottom: 12 }}>{money(subtotal)}</div>
                    <div style={{ marginBottom: 12 }}>-</div>
                    <div style={{ fontWeight: 'bold', fontSize: 18 }}>{money(total)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* Adjust this globally if your app bar height differs on mobile */
        :root { --app-top-offset: 56px; }

        /* Print: exact Letter; remove scaling; keep extra bottom padding */
        @page { size: 8.5in 11in; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .invoice-viewport {
            position: static !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .invoice-viewport > div { /* scale wrapper */
            transform: none !important;
            width: 8.5in !important;
            height: 11in !important;
          }
          .invoice-page {
            width: 100% !important;
            height: 100% !important;
            padding: 0.5in 0.5in 0.75in 0.5in !important; /* extra bottom so Total never clips */
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  )
}


