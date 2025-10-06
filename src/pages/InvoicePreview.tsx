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

  // Device hint: treat phones/tablets as mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // US Letter canvas at 96dpi
  const BASE_W = 816
  const BASE_H = 1056
  const ASPECT = BASE_H / BASE_W

  const [scale, setScale] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  // Mobile snapshot overlay state
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayImg, setOverlayImg] = useState<string | null>(null)

  const recomputeScale = () => {
    const host = viewportRef.current
    if (!host) return
    const P = 12
    const vw = Math.max(0, host.clientWidth - P * 2)
    const vh = Math.max(0, host.clientHeight - P * 2)
    const s = Math.min(vw / BASE_W, vh / BASE_H)
    setScale(s > 0 && Number.isFinite(s) ? s : 1)
  }

  useLayoutEffect(() => {
    recomputeScale()
    const r = () => recomputeScale()
    window.addEventListener('resize', r)
    window.addEventListener('orientationchange', r)
    const vv = (window as any).visualViewport as VisualViewport | undefined
    vv?.addEventListener?.('resize', r)
    vv?.addEventListener?.('scroll', r)
    return () => {
      window.removeEventListener('resize', r)
      window.removeEventListener('orientationchange', r)
      vv?.removeEventListener?.('resize', r)
      vv?.removeEventListener?.('scroll', r)
    }
  }, [])

  // Lock scroll behind preview
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

  // Desktop-only: Download PDF (unchanged from your good path)
  async function onDownloadPdfDesktop() {
    try {
      const node = pageRef.current
      if (!node) throw new Error('No invoice to export.')

      const { toPng } = await import('html-to-image')
      const pngDataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        cacheBust: true,
        width: BASE_W,
        height: BASE_H,
        style: { transform: 'none', transformOrigin: 'top left' },
      })

      const res = await fetch(pngDataUrl)
      const pngBytes = new Uint8Array(await res.arrayBuffer())

      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const page = doc.addPage([612, 792]) // 8.5x11in @72pt/in
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

      const dataUri: string = await doc.saveAsBase64({ dataUri: true })
      const a = document.createElement('a')
      a.href = dataUri
      a.download = 'invoice.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      console.error(e)
      alert('Could not create PDF.')
    }
  }

  // Mobile: Open Image (no print on mobile)
  async function onOpenImageMobile() {
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(pageRef.current!, {
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        cacheBust: true,
        width: BASE_W,
        height: BASE_H,
        style: { transform: 'none', transformOrigin: 'top left' },
      })
      setOverlayImg(dataUrl)
      setOverlayOpen(true)
    } catch (e) {
      console.error(e)
      alert('Could not create image.')
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
        {!isMobile && (
          <>
            <button
              onClick={() => window.print()}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: 12,
                background: '#0d6efd',
                color: '#fff',
                fontWeight: 700,
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              }}
            >
              Print
            </button>
            <button
              onClick={onDownloadPdfDesktop}
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
              Download PDF
            </button>
          </>
        )}

        {isMobile && (
          <button
            onClick={onOpenImageMobile}
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
            Open Image
          </button>
        )}

        <button
          onClick={() => navigate('/invoices/create')}
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

      {/* Preview viewport */}
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 240px', // narrower right column → shifts left slightly
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ width: 100, height: 100, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 }}>
                BLV
              </div>
              <div style={{ fontSize: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>BLV Pack Design LLC</div>
                <div>13967 SW 119th Ave</div>
                <div>Miami, FL 33186</div>
                <div style={{ marginTop: 8 }}>(305) 798-3317</div>
              </div>

              {/* Right panel: labels left, values right */}
              <div style={{ fontSize: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px' }}>
                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice #</div>
                  <div style={{ textAlign: 'right' }}>{invoiceData.invoiceNo}</div>

                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice date</div>
                  <div style={{ textAlign: 'right' }}>{fmtDate(invoiceData.invoiceDate)}</div>

                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Due date</div>
                  <div style={{ textAlign: 'right' }}>{fmtDate(invoiceData.dueDate)}</div>

                  <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Est. delivery</div>
                  <div style={{ textAlign: 'right' }}>{fmtDate(invoiceData.deliveryDate)}</div>
                </div>
              </div>
            </div>

            {/* Addresses & meta */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 240px', // narrower → column sits a bit more left
                gap: 12,
                marginBottom: 18,
                fontSize: 14,
              }}
            >
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

              {/* Wire instructions: labels left, values right */}
              <div>
                <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Wire Transfer Instructions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 13 }}>
                  <div>Company Name:</div>
                  <div style={{ textAlign: 'right' }}>BLV Pack Design LLC</div>

                  <div>Bank Name:</div>
                  <div style={{ textAlign: 'right' }}>Bank of America</div>

                  <div>Account Name:</div>
                  <div style={{ textAlign: 'right' }}>BLV Pack Design LLC</div>

                  <div>Account Number:</div>
                  <div style={{ textAlign: 'right' }}>898161854242</div>

                  <div style={{ whiteSpace: 'nowrap' }}>Routing Number (ABA):</div>
                  <div style={{ textAlign: 'right' }}>026009593</div>
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

      {/* Mobile snapshot overlay (controls at bottom) */}
      {overlayOpen && overlayImg && (
        <div
          className="snapshot-overlay no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100001,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ position: 'relative', flex: 1, background: '#fff' }}>
            <img
              src={overlayImg}
              alt="Invoice Snapshot"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Bottom bar controls */}
          <div
            style={{
              padding: '10px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
              borderTop: '1px solid #e5e5e5',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              background: '#fff',
            }}
          >
            <button
              onClick={() => setOverlayOpen(false)}
              style={{ padding: '10px 14px', border: 0, borderRadius: 10, background: '#6c757d', color: '#fff' }}
            >
              Close
            </button>
            <a
              href={overlayImg}
              download="invoice.png"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: '#198754',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Download invoice
            </a>
            <span style={{ color: '#666', fontSize: 13 }}>Press invoice to share</span>
          </div>
        </div>
      )}

      <style>{`
        :root { --app-top-offset: 56px; }
        @media screen { .items-scroll { overflow: auto; } }
        @media print {
          .no-print { display: none !important; }
          @page { size: 8.5in 11in; margin: 0; }
          html, body { background: #fff !important; }
          .snapshot-overlay img { width: 100%; height: 100vh; object-fit: contain; }
        }
      `}</style>
    </>
  )
}




















