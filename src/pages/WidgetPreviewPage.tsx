import { useSearchParams } from 'react-router-dom'

export default function WidgetPreviewPage() {
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src') || ''

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {/* Fake website header */}
      <div style={{ background: '#1e293b', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, background: '#6366f1', borderRadius: 6 }} />
        <div style={{ width: 80, height: 12, background: '#475569', borderRadius: 4 }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
        <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
        <div style={{ width: 60, height: 10, background: '#475569', borderRadius: 4 }} />
      </div>

      {/* Fake hero */}
      <div style={{ background: '#e2e8f0', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ width: 220, height: 18, background: '#94a3b8', borderRadius: 4, margin: '0 auto 12px' }} />
        <div style={{ width: 160, height: 12, background: '#cbd5e1', borderRadius: 4, margin: '0 auto' }} />
      </div>

      {/* Page body with widget */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        {/* Left: fake content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        {/* Right: widget iframe */}
        <div>
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

      {/* Preview banner */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#1e293b', color: '#94a3b8',
        fontSize: 12, padding: '8px 16px', textAlign: 'center',
      }}>
        Widget preview — this is a simulated website layout
      </div>
    </div>
  )
}
