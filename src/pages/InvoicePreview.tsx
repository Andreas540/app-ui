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
  const { state } = useLocation()
  const navigate = useNavigate()
  const invoiceData = state as InvoiceData | undefined

  // 8.5×11in at 96dpi → 816×1056 px
  const BASE_W = 816
  const BASE_H = 1056
  const ASPECT = BASE_H / BASE_W

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)
  const lastHostH = useRef<number>(0)
  const resizeTimer = useRef<number | null>(null)

  const recomputeScale = () => {
    const host = viewportRef.current
    if (!host) return
    const P = 12
    const vw = Math.max(0, host.clientWidth - P * 2)
    const vh = Math.max(0, host.clientHeight - P * 2)

    // Ignore tiny visual-viewport wiggles (iOS toolbars / share sheet)
    if (lastHostH.current) {
      const delta = Math.abs(vh - lastHostH.current)
      if (delta < 80) return
    }
    lastHostH.current = vh

    const s = Math.min(vw / BASE_W, vh / BASE_H)
    setScale(s > 0 && Number.isFinite(s) ? s : 1)
  }

  useLayoutEffect(() => {
    recomputeScale()
    const onResize = () => {
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
      resizeTimer.current = window.setTimeout(() => {
        recomputeScale()
        resizeTimer.current = null
      }, 120)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    // iOS visualViewport changes: also debounce them
    const vv = (window as any).visualViewport as VisualViewport | undefined
    const onVV = () => onResize()
    vv?.addEventListener?.('resize', onVV)
    vv?.addEventListener?.('scroll', onVV)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      vv?.removeEventListener?.('resize', onVV)
      vv?.removeEventListener?.('scroll', onVV)
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
    }
  }, [])

  // Lock background & scrolling in preview
  useEffect(() => {
    const prevBg = document.body.style.background
    const prevOv = document.body.style.overflow
    document.body.style.background = '#f2f3f5'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.background = prevBg
      document.body.style.overflow = prevOv
    }
  }, [])

  const fmtDate = (s: string) => {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  }
  const money = (n: number) => `$${Number(n).toFixed(2)}`
  const subtotal = useMemo(
    () => (invoiceData?.orders ?? []).reduce((t, o) => t + o.amount, 0),
    [invoiceData]
  )
  const total = subtotal

  // -------- PDF (stable, print-perfect on mobile) --------
  async function openPdf() {
    try {
      if (!invoiceData) return
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const page = doc.addPage([612, 792]) // Letter @ 72pt/in

      const font = await doc.embedFont(StandardFonts.Helvetica)
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
      const M_LEFT = 0.5 * 72, M_RIGHT = 0.5 * 72, M_TOP = 0.5 * 72, M_BOTTOM = 0.75 * 72
      const blue = rgb(0.1, 0.3, 0.56)

      const drawText = (text: string, x: number, y: number, size = 12, col = rgb(0,0,0), bold = false) =>
        page.drawText(text, { x, y, size, font: bold ? fontBold : font, color: col })
      const line = (x1: number, y1: number, x2: number, y2: number, w = 0.5) =>
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: rgb(0.8,0.8,0.8) })

      let y = 792 - M_TOP

      // Header
      page.drawRectangle({ x: M_LEFT, y: y - 100, width: 100, height: 100, color: rgb(0,0,0) })
      drawText('BLV', M_LEFT + 35, y - 60, 18, rgb(1,1,1), true)
      drawText('BLV Pack Design LLC', M_LEFT + 120, y - 16, 16, rgb(0,0,0), true)
      drawText('13967 SW 119th Ave', M_LEFT + 120, y - 34)
      drawText('Miami, FL 33186', M_LEFT + 120, y - 50)
      drawText('(305) 798-3317', M_LEFT + 120, y - 70)

      // Meta
      const rightX = 612 - M_RIGHT - 200
      const labels = ['Invoice #', 'Invoice date', 'Due date', 'Est. delivery']
      const values = [
        invoiceData.invoiceNo,
        fmtDate(invoiceData.invoiceDate),
        fmtDate(invoiceData.dueDate),
        fmtDate(invoiceData.deliveryDate),
      ]
      labels.forEach((lab, i) => {
        drawText(lab, rightX, y - 16 - i * 16, 11, blue, true)
        drawText(values[i], rightX + 80, y - 16 - i * 16, 11)
      })
      y -= 120

      // Addresses & payment
      const col1X = M_LEFT, col2X = M_LEFT + 220, col3X = 612 - M_RIGHT - 220
      drawText('Invoice for', col1X, y, 12, blue, true)
      drawText(invoiceData.customer.name, col1X, y - 18)
      invoiceData.customer.address1 && drawText(invoiceData.customer.address1, col1X, y - 34)
      invoiceData.customer.address2 && drawText(invoiceData.customer.address2, col1X, y - 50)
      const cityLine = [invoiceData.customer.city, invoiceData.customer.state, invoiceData.customer.postal_code].filter(Boolean).join(', ')
      drawText(cityLine, col1X, y - 66)

      drawText('Payment method', col2X, y, 12, blue, true)
      drawText(invoiceData.paymentMethod, col2X, y - 18)
      drawText('Our contact', col2X, y - 42, 12, blue, true)
      drawText('Julian de Armas', col2X, y - 60)

      drawText('Wire Transfer Instructions', col3X, y, 12, blue, true)
      const wt = [
        ['Company Name:', 'BLV Pack Design LLC'],
        ['Bank Name:', 'Bank of America'],
        ['Account Name:', 'BLV Pack Design LLC'],
        ['Account Number:', '898161854242'],
        ['Routing Number (ABA):', '026009593'],
      ]
      wt.forEach((pair, i) => {
        drawText(pair[0], col3X, y - 18 - i * 14, 10)
        drawText(pair[1], col3X + 110, y - 18 - i * 14, 10)
      })
      y -= 120

      // Items
      line(M_LEFT, y - 4, 612 - M_RIGHT, y - 4, 0.5)
      const thY = y - 22
      drawText('Description', M_LEFT, thY, 11, blue, true)
      drawText('Qty', 612 - M_RIGHT - 360 + 220, thY, 11, blue, true)
      drawText('Unit price', 612 - M_RIGHT - 220, thY, 11, blue, true)
      drawText('Total price', 612 - M_RIGHT - 80, thY, 11, blue, true)
      line(M_LEFT, thY - 6, 612 - M_RIGHT, thY - 6, 0.5)

      let rowY = thY - 24
      const lineGap = 18
      const textWidth = (s: string, size = 12, bold = false) =>
        (bold ? fontBold : font).widthOfTextAtSize(s, size)
      invoiceData.orders.forEach(o => {
        drawText(o.product, M_LEFT, rowY)
        const qtyStr = String(o.quantity), unitStr = money(o.unit_price), amtStr = money(o.amount)
        const qtyX = 612 - M_RIGHT - 360 + 220 + 40 - textWidth(qtyStr, 12)
        const unitX = 612 - M_RIGHT - 220 + 80 - textWidth(unitStr, 12)
        const amtX = 612 - M_RIGHT - 80 + 60 - textWidth(amtStr, 12)
        drawText(qtyStr, qtyX, rowY); drawText(unitStr, unitX, rowY); drawText(amtStr, amtX, rowY)
        rowY -= lineGap
      })

      // Totals (guaranteed visible)
      y = Math.min(rowY - 8, 792 - M_BOTTOM - 110)
      line(M_LEFT, y, 612 - M_RIGHT, y, 1)
      const totalsY = y - 28, labelX = 612 - M_RIGHT - 160, valueX = 612 - M_RIGHT - 20
      const subtotalStr = money(subtotal), totalStr = money(total)
      drawText('Subtotal', labelX - 80, totalsY, 12)
      drawText(subtotalStr, valueX - textWidth(subtotalStr, 12), totalsY, 12)
      drawText('Adjustments/Discount', labelX - 80, totalsY - 18, 12)
      drawText('-', valueX - textWidth('-', 12), totalsY - 18, 12)
      drawText('Total', labelX - 80, totalsY - 40, 14, undefined, true)
      drawText(totalStr, valueX - textWidth(totalStr, 14, true), totalsY - 40, 14, undefined, true)

      // Open PDF
      const pdfBytes: Uint8Array = await doc.save()
      const blob = new globalThis.Blob([new Uint8Array(pdfBytes)] as BlobPart[], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('Could not generate PDF. Make sure "pdf-lib" is installed and try again.')
    }
  }

  if (!invoiceData) {
    return (
      <div style={{ height: '100svh', display: 'grid', placeItems: 'center', background: '#fff' }}>
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

  const { invoiceNo, invoiceDate, dueDate, deliveryDate, paymentMethod, customer, orders } = invoiceData

  return (
    <>
      {/* Footer controls (no print) */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100000,
          padding: '10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left))',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'saturate(180%) blur(8px)',
          boxShadow: '0 -4px 18px rgba(0,0,0,0.12)',
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={openPdf}
          style={{
            padding: '12px 16px',
            border: 'none',
            borderRadius: 12,
            background: '#198754',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}
        >
          Open PDF
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '12px 16px',
            border: 'none',
            borderRadius: 12,
            background: '#6c757d',
            color: '#fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}
        >
          Back
        </button>
      </div>

      {/* Preview viewport (uses 100svh so share-sheet/toolbars don't rescale it) */}
      <div
        ref={viewportRef}
        className="invoice-viewport"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 'calc(var(--app-top-offset, 56px) + env(safe-area-inset-top))',
          height: 'calc(100svh - var(--app-top-offset, 56px) - env(safe-area-inset-top))',
          background: '#f2f3f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          zIndex: 9999,
        }}
      >
        <div
          style={{
            width: BASE_W,
            height: BASE_H,
            aspectRatio: `${ASPECT}`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
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
              padding: '48px 48px 76px 48px',
              display: 'flex',
              flexDirection: 'column',
              WebkitTextSizeAdjust: '100%',
              textSizeAdjust: '100%',
              wordBreak: 'normal',
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
                  <div>{fmtDate(invoiceDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Due date</div>
                  <div>{fmtDate(dueDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Est. delivery</div>
                  <div>{fmtDate(deliveryDate)}</div>
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

            {/* Items + totals (preview clamp so totals always visible) */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div className="items-scroll" style={{ flex: 1, minHeight: 0 }}>
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
              </div>

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
          </div>{/* .invoice-page */}
        </div>{/* scale wrapper */}
      </div>{/* viewport */}

      <style>{`
        :root { --app-top-offset: 56px; }

        @media screen {
          .items-scroll { overflow: auto; }
        }

        /* Print mirrors the preview page size */
        @page { size: 8.5in 11in; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .invoice-viewport {
            position: static !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .invoice-viewport > div {
            transform: none !important;
            width: 8.5in !important;
            height: 11in !important;
            aspect-ratio: auto !important;
          }
          .invoice-page {
            width: 100% !important;
            height: 100% !important;
            padding: 0.4in 0.35in 0.6in 0.35in !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            -webkit-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .items-scroll { overflow: visible !important; }
        }
      `}</style>
    </>
  )
}








