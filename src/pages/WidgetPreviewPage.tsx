import { useSearchParams, useNavigate } from 'react-router-dom'

export default function WidgetPreviewPage() {
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src') || ''
  const navigate = useNavigate()

  function closePreview() {
    navigate('/admin', { state: { openTab: 'booking', openBookingSubTab: 'widget' } })
  }

  return (
    <>
      <style>{`
        .wp-root {
          min-height: 100vh;
          background: #f3f4f6;
          font-family: system-ui, sans-serif;
          padding-bottom: 40px;
        }

        /* ── Desktop header ── */
        .wp-header-desktop {
          background: #1e293b;
          padding: 0 24px;
          height: 56px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .wp-header-mobile { display: none; }

        /* ── Hero ── */
        .wp-hero {
          background: #e2e8f0;
          padding: 40px 24px;
          text-align: center;
        }

        /* ── Body layout ── */
        .wp-body {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 24px;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 32px;
          align-items: start;
        }
        .wp-content { display: flex; flex-direction: column; gap: 14px; }

        /* ── Close button shared ── */
        .wp-close-btn {
          margin-left: auto;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          color: #e2e8f0;
          border-radius: 6px;
          padding: 0 12px;
          height: 32px;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .wp-close-btn:hover { background: rgba(255,255,255,0.2); }

        /* ── Preview banner ── */
        .wp-banner {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: #1e293b;
          color: #94a3b8;
          font-size: 12px;
          padding: 8px 16px;
          text-align: center;
        }

        /* ── Mobile ── */
        @media (max-width: 639px) {
          .wp-header-desktop { display: none; }
          .wp-header-mobile {
            display: flex;
            background: #1e293b;
            padding: 0 16px;
            height: 48px;
            align-items: center;
            justify-content: space-between;
          }
          .wp-hero { padding: 24px 16px; }
          .wp-body {
            grid-template-columns: 1fr;
            padding: 20px 12px;
            gap: 20px;
          }
          .wp-widget-col { order: -1; }
        }
      `}</style>

      <div className="wp-root">
        {/* Desktop header */}
        <div className="wp-header-desktop">
          <div style={{ width: 28, height: 28, background: '#6366f1', borderRadius: 6 }} />
          <div style={{ width: 80, height: 12, background: '#475569', borderRadius: 4 }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
          <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
          <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
          <button className="wp-close-btn" onClick={closePreview}>✕ Close preview</button>
        </div>

        {/* Mobile header */}
        <div className="wp-header-mobile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 24, height: 24, background: '#6366f1', borderRadius: 5 }} />
            <div style={{ width: 60, height: 11, background: '#475569', borderRadius: 4 }} />
          </div>
          <button className="wp-close-btn" style={{ marginLeft: 0 }} onClick={closePreview}>✕ Close preview</button>
        </div>

        {/* Hero */}
        <div className="wp-hero">
          <div style={{ width: 220, height: 18, background: '#94a3b8', borderRadius: 4, margin: '0 auto 12px' }} />
          <div style={{ width: 160, height: 12, background: '#cbd5e1', borderRadius: 4, margin: '0 auto' }} />
        </div>

        {/* Body */}
        <div className="wp-body">
          {/* Dummy text content */}
          <div className="wp-content">
            <div style={{ width: '70%', height: 14, background: '#cbd5e1', borderRadius: 4 }} />
            <div style={{ width: '90%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: '80%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: '85%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: '60%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ marginTop: 8, width: '70%', height: 14, background: '#cbd5e1', borderRadius: 4 }} />
            <div style={{ width: '90%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: '75%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: '88%', height: 10, background: '#e2e8f0', borderRadius: 4 }} />
          </div>

          {/* Widget */}
          <div className="wp-widget-col">
            {src ? (
              <iframe
                src={src}
                style={{ width: '100%', minHeight: 650, border: 'none', borderRadius: 12, display: 'block' }}
                title="Booking widget preview"
              />
            ) : (
              <div style={{ padding: 24, background: '#fff', borderRadius: 12, color: '#64748b', fontSize: 14 }}>
                No widget URL provided.
              </div>
            )}
          </div>
        </div>

        <div className="wp-banner">
          Widget preview — this is a simulated website layout
        </div>
      </div>
    </>
  )
}
