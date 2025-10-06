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

  // Base canvas at 96dpi: 8.5in × 11in → 816 × 1056 px
  const BASE_W = 816
  const BASE_H = 1056

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Read the app top bar height via CSS variable, fallback depending on width
  const getTopOffset = () => {
    const cs = getComputedStyle(document.documentElement)
    const raw = cs.getPropertyValue('--app-top-offset').trim()
    const fromVar = raw ? parseFloat(raw) : NaN
    const defaultMobile = window.innerWidth <= 640 ? 56 : 0
    return Number.isFinite(fromVar) ? fromVar : defaultMobile
  }

  const recomputeScale = () => {
    const pad = 12 // viewport breathing room
    const safeTop = Number((window as any).visualViewport?.offsetTop || 0)
    const safeBottomInset =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0
    const topOffset = getTopOffset()

    const vw = window.innerWidth - pad * 2
    const vh = window.innerHeight - (pad * 2 + topOffset + safeTop + safeBottomInset)

    const next = Math.min(vw / BASE_W, vh / BASE_H)
    setScale(next > 0 && Number.isFinite(next) ? next : 1)
  }

  useLayoutEffect(() => {
    recomputeScale()
    const onResize = () => recomputeScale()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  // Screen background & scroll lock while preview is open
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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return isNaN(d.getTime())
      ? dateStr
      : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  }
  const fmtMoney = (n: number) => `$${Number(n).toFixed(2)}`
  const subtotal = useMemo(
    () => (invoiceData?.orders ?? []).reduce((s, o) => s + o.amount, 0),
    [invoiceData]
  )
  const total = subtotal

  if (!invoiceData) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#fff',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ marginBottom: 12 }}>No invoice data found.</p>
          <button
            onClick={() => navigate('/invoices/create')}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderRadius: 8,
              background: '#0d6efd',
              color: '#fff',
              cursor: 'pointer',
            }}
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
      {/* Screen-only controls (bottom-right, safe-area aware) */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          right: `calc(12px + env(safe-area-inset-right))`,
          bottom: `calc(12px + env(safe-area-inset-bottom))`,
          zIndex: 99999,
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
            cursor: 'pointer',
            fontSize: 14,
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
            cursor: 'pointer',
            fontSize: 14,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          }}
        >
          Back
        </button>
      </div>

      {/* Viewport host (respects app top-bar height) */}
      <div
        ref={viewportRef}
        className="invoice-viewport"
        style={{
          position: 'fixed',
          top: 'calc(var(--app-top-offset, 56px) + env(safe-area-inset-top))',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: '#f2f3f5',
          zIndex: 9999,
          padding: 12,
        }}
      >
        {/* The page canvas in px; scaled to fit and centered */}
        <div
          className="invoice-page"
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            background: '#fff',
            color: '#333',
            fontFamily: 'Arial, sans-serif',
            boxSizing: 'border-box',
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            // Increased bottom padding to ensure totals never get clipped
            padding: '48px 48px 64px 48px', // 0.5in sides/top, ~0.67in bottom
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // Prevent any accidental page breaks
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 270px',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 100,
                height: 100,
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: 20,
              }}
            >
              BLV
            </div>

            <div style={{ fontSize: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
                BLV Pack Design LLC
              </div>
              <div>13967 SW 119th Ave</div>
              <div>Miami, FL 33186</div>
              <div style={{ marginTop: 8 }}>(305) 798-3317</div>
            </div>

            <div style={{ fontSize: 14 }}>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px' }}
              >
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 270px',
              gap: 12,
              marginBottom: 18,
              fontSize: 14,
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>
                Invoice for
              </div>
              <div>{customer.name}</div>
              {customer.address1 && <div>{customer.address1}</div>}
              {customer.address2 && <div>{customer.address2}</div>}
              <div>
                {[customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>
                Payment method
              </div>
              <div style={{ marginBottom: 16 }}>{paymentMethod}</div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>
                Our contact
              </div>
              <div>Julian de Armas</div>
            </div>

            <div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>
                Wire Transfer Instructions
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '3px 8px',
                  fontSize: 13,
                }}
              >
                <div>Company Name:</div>
                <div>BLV Pack Design LLC</div>
                <div>Bank Name:</div>
                <div>Bank of America</div>
                <div>Account Name:</div>
                <div>BLV Pack Design LLC</div>
                <div>Account Number:</div>
                <div>898161854242</div>
                <div style={{ whiteSpace: 'nowrap' }}>Routing Number (ABA):</div>
                <div>026009593</div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderTop: '1px solid #ddd' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 120px 140px',
                  gap: 16,
                  padding: '12px 0',
                  fontWeight: 'bold',
                  color: '#1a4d8f',
                  fontSize: 14,
                  borderBottom: '1px solid #ddd',
                }}
              >
                <div>Description</div>
                <div style={{ textAlign: 'right' }}>Qty</div>
                <div style={{ textAlign: 'right' }}>Unit price</div>
                <div style={{ textAlign: 'right' }}>Total price</div>
              </div>

              {orders.map((order, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 120px 140px',
                    gap: 16,
                    padding: '12px 0',
                    fontSize: 14,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <div>{order.product}</div>
                  <div style={{ textAlign: 'right' }}>{order.quantity}</div>
                  <div style={{ textAlign: 'right' }}>{fmtMoney(order.unit_price)}</div>
                  <div style={{ textAlign: 'right' }}>{fmtMoney(order.amount)}</div>
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
                  <div style={{ marginBottom: 12 }}>{fmtMoney(subtotal)}</div>
                  <div style={{ marginBottom: 12 }}>-</div>
                  <div style={{ fontWeight: 'bold', fontSize: 18 }}>{fmtMoney(total)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen + Print CSS */}
      <style>{`
        /* You can override this globally if your app bar is taller */
        :root { --app-top-offset: 0px; }
        @media (max-width: 640px) {
          :root { --app-top-offset: 56px; }
        }

        /* Print: exact Letter; no scaling; no clipping; colors preserved */
        @page { size: 8.5in 11in; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .invoice-viewport {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: #fff !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .invoice-page {
            width: 8.5in !important;
            height: 11in !important;
            padding: 0.5in 0.5in 0.75in 0.5in !important; /* extra bottom to keep totals safe */
            transform: none !important;
            box-shadow: none !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }

        /* Safari/iOS: smoother scaling */
        .invoice-page { will-change: transform; }
      `}</style>
    </>
  )
}

