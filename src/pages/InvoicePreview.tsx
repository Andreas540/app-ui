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

  // 8.5×11in at 96dpi → 816×1056 px (logical canvas)
  const BASE_W = 816
  const BASE_H = 1056
  const ASPECT = BASE_H / BASE_W

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
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
  const subtotal = useMemo(() => (invoiceData?.orders ?? []).reduce((t, o) => t + o.amount, 0), [invoiceData])
  const total = subtotal

  // -------- Open PDF (snapshot) — data URI + embedded iframe (iOS-safe) --------
  async function openPdf() {
    // Open a tab synchronously to avoid popup blockers
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    if (popup) {
      try {
        popup.document.open()
        popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Invoice PDF</title>
  <style>
    html,body { margin:0; height:100%; }
    .wrap { position:fixed; inset:0; display:flex; flex-direction:column; }
    header { font: 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; padding:8px 12px; color:#555; }
    iframe,embed { flex:1; border:0; width:100%; }
    .fallback { padding:10px 12px; font: 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
    a { color:#0d6efd; text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>Preparing PDF…</header>
    <iframe id="pdfFrame" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
    <div class="fallback" id="fallback" style="display:none">
      If the viewer is blank, <a id="dl" href="#" download="invoice.pdf" rel="noopener">tap here to open/download the PDF.</a>
    </div>
  </div>
</body>
</html>`)
        popup.document.close()
      } catch { /* some browsers may restrict writing — we still try later */ }
    }

    try {
      const node = pageRef.current
      if (!node) throw new Error('No invoice page to capture')

      // 1) Render DOM → PNG (pixel-perfect)
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        cacheBust: true,
        width: BASE_W,
        height: BASE_H,
        style: { transform: 'none', transformOrigin: 'top left' },
      })

      // 2) PNG bytes
      const res = await fetch(dataUrl)
      const pngBytes = new Uint8Array(await res.arrayBuffer())

      // 3) Wrap in a US Letter PDF
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const page = doc.addPage([612, 792]) // Letter @ 72pt/in
      const png = await doc.embedPng(pngBytes)

      const margin = 0.5 * 72
      const maxW = 612 - margin * 2
      const maxH = 792 - margin * 2
      const s = Math.min(maxW / png.width, maxH / png.height)
      const drawW = png.width * s
      const drawH = png.height * s
      const x = margin + (maxW - drawW) / 2
      const y = margin + (maxH - drawH) / 2
      page.drawImage(png, { x, y, width: drawW, height: drawH })

      // 4) Data URI (no Blob/URL.createObjectURL)
      const dataUri: string = await doc.saveAsBase64({ dataUri: true })

      // 5) Inject into the already-open page via an iframe (iOS-friendly)
      if (popup && !popup.closed) {
        try {
          const iframe = popup.document.getElementById('pdfFrame') as HTMLIFrameElement | null
          if (iframe) {
            iframe.src = dataUri
            const h = popup.document.querySelector('header')
            if (h) h.textContent = 'Invoice PDF'
            const dl = popup.document.getElementById('dl') as HTMLAnchorElement | null
            if (dl) dl.href = dataUri
            const fb = popup.document.getElementById('fallback') as HTMLElement | null
            if (fb) fb.style.display = 'block'
          } else {
            // Fallback: navigate the tab if iframe is missing
            popup.location.replace(dataUri)
          }
        } catch {
          // As a last resort, navigate the tab
          popup.location.replace(dataUri)
        }
      } else {
        // If the popup was blocked, try a hidden link
        const a = document.createElement('a')
        a.href = dataUri
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.download = 'invoice.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
    } catch (err) {
      console.error('PDF snapshot failed:', err)
      if (popup && !popup.closed) {
        try {
          popup.document.body.innerHTML =
            '<div style="padding:24px;font:16px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#b00020">Could not build PDF snapshot.</div>'
        } catch { /* ignore */ }
      } else {
        alert('Could not build PDF snapshot.')
      }
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

  return (
    <>
      {/* Footer controls */}
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

      {/* HTML Preview (unchanged layout) */}
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
            width: 816,
            height: 1056,
            aspectRatio: `${ASPECT}`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <div
            ref={pageRef}
            className="invoice-page"
            style={{
              width: '100%',
              height: '100%',
              background: '#fff',
              color: '#333',
              fontFamily: 'Arial, sans-serif',
              boxSizing: 'border-box',
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              padding: '48px 48px 76px 48px', // keep totals visible in preview
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
                  <div>{invoiceData.invoiceNo}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice date</div>
                  <div>{fmtDate(invoiceData.invoiceDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Due date</div>
                  <div>{fmtDate(invoiceData.dueDate)}</div>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Est. delivery</div>
                  <div>{fmtDate(invoiceData.deliveryDate)}</div>
                </div>
              </div>
            </div>

            {/* Addresses & meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 270px', gap: 12, marginBottom: 18, fontSize: 14 }}>
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Invoice for</div>
                <div>{invoiceData.customer.name}</div>
                {invoiceData.customer.address1 && <div>{invoiceData.customer.address1}</div>}
                {invoiceData.customer.address2 && <div>{invoiceData.customer.address2}</div>}
                <div>{[invoiceData.customer.city, invoiceData.customer.state, invoiceData.customer.postal_code].filter(Boolean).join(', ')}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Payment method</div>
                <div style={{ marginBottom: 16 }}>{invoiceData.paymentMethod}</div>
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

            {/* Items + totals */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div className="items-scroll" style={{ flex: 1, minHeight: 0 }}>
                <div style={{ borderTop: '1px solid #ddd' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 140px', gap: 16, padding: '12px 0', fontWeight: 'bold', color: '#1a4d8f', fontSize: 14, borderBottom: '1px solid #ddd' }}>
                    <div>Description</div>
                    <div style={{ textAlign: 'right' }}>Qty</div>
                    <div style={{ textAlign: 'right' }}>Unit price</div>
                    <div style={{ textAlign: 'right' }}>Total price</div>
                  </div>
                  {(invoiceData.orders || []).map((o, i) => (
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

        @media print {
          .no-print { display: none !important; }
          @page { size: 8.5in 11in; margin: 0; }
          html, body { background: #fff !important; }
        }
      `}</style>
    </>
  )
}












