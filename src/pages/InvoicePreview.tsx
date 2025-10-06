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

  // Base “print” page size at 96 dpi: 8.5in × 11in -> 816 × 1056 px
  // (The DOM uses inches for print, but we scale this pixel canvas for screen preview.)
  const BASE_W = 816
  const BASE_H = 1056

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Fit the page into the viewport without cropping or double-scroll.
  const recomputeScale = () => {
    const pad = 16 // small breathing room around the page
    const vw = window.innerWidth - pad * 2
    const vh = window.innerHeight - pad * 2
    const next = Math.min(vw / BASE_W, vh / BASE_H)
    setScale(Number.isFinite(next) && next > 0 ? next : 1)
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
    if (isNaN(d.getTime())) return dateStr
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
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
        }}
      >
        <div style={{ textAlign: 'center' }}>
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
      {/* Screen-only controls (hidden in print) */}
      <div
        id="invoice-screen-controls"
        className="no-print"
        style={{
          position: 'fixed',
          right: 12,
          top: 12,
          zIndex: 99999, // above your app's top bar
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          onClick={handlePrint}
          style={{
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            background: '#007bff',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          Print
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '10px 14px',
            border: 'none',
            borderRadius: 10,
            background: '#6c757d',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          Back
        </button>
      </div>

      {/* Viewport host (locks to screen, centers the page, no scrollbars) */}
      <div
        ref={viewportRef}
        className="invoice-viewport"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: '#f2f3f5',
          // Avoid accidental parent stacking contexts clipping
          zIndex: 9999,
        }}
      >
        {/* This element is a 8.5×11in page designed in px, scaled for screen */}
        <div
          className="invoice-page"
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#fff',
            color: '#333',
            fontFamily: 'Arial, sans-serif',
            boxSizing: 'border-box',
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            padding: 48, // 0.5in at 96dpi
            display: 'flex',
            flexDirection: 'column',
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

      {/* Screen & print styles */}
      <style>{`
        /* PRINT: make the page real Letter size and remove scaling/decoration */
        @page {
          size: 8.5in 11in; /* letter portrait */
          margin: 0;
        }
        @media print {
          html, body {
            background: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-viewport {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: #fff !important;
            overflow: visible !important;
          }
          .invoice-page {
            width: 8.5in !important;
            height: 11in !important;
            padding: 0.5in !important;
            transform: none !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* SAFARI iOS: help avoid flicker during scale (optional) */
        .invoice-page {
          will-change: transform;
        }
      `}</style>
    </>
  )
}
