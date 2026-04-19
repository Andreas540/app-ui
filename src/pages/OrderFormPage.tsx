// src/pages/OrderFormPage.tsx
// Public-facing order form — rendered outside the authenticated app shell.
// Accessed via /order-form/:token?lang=sv
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Vibrant } from 'node-vibrant/browser'
import { useCurrency } from '../lib/useCurrency'

// ── Inline translations ───────────────────────────────────────────────────────

type Lang = 'en' | 'es' | 'sv'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title:        'Place an order',
    welcome:      'Hi {{name}}, select the products you want to order.',
    product:      'Product',
    price:        'Price',
    qty:          'Qty',
    notes:        'Notes (optional)',
    submit:       'Submit order',
    submitting:   'Submitting…',
    successTitle: 'Order received!',
    successMsg:   'Your order has been submitted. We will be in touch.',
    invalidToken: 'This link is invalid or has expired.',
    errorLoad:    'Could not load the form. Please try again.',
    errorSubmit:  'Submission failed. Please try again.',
    errorNoItems: 'Please add at least one item.',
    loading:      'Loading…',
    noProducts:   'No products are available to order at this time.',
    total:        'Total for this order',
  },
  es: {
    title:        'Realizar un pedido',
    welcome:      'Hola {{name}}, selecciona los productos que quieres pedir.',
    product:      'Producto',
    price:        'Precio',
    qty:          'Cant.',
    notes:        'Notas (opcional)',
    submit:       'Enviar pedido',
    submitting:   'Enviando…',
    successTitle: '¡Pedido recibido!',
    successMsg:   'Tu pedido ha sido enviado. Nos pondremos en contacto contigo.',
    invalidToken: 'Este enlace no es válido o ha expirado.',
    errorLoad:    'No se pudo cargar el formulario. Inténtelo de nuevo.',
    errorSubmit:  'Error al enviar. Inténtelo de nuevo.',
    errorNoItems: 'Por favor, añade al menos un artículo.',
    loading:      'Cargando…',
    noProducts:   'No hay productos disponibles para pedir en este momento.',
    total:        'Total de este pedido',
  },
  sv: {
    title:        'Lägg en beställning',
    welcome:      'Hej {{name}}, välj de produkter du vill beställa.',
    product:      'Produkt',
    price:        'Pris',
    qty:          'Antal',
    notes:        'Anteckningar (valfritt)',
    submit:       'Skicka beställning',
    submitting:   'Skickar…',
    successTitle: 'Beställning mottagen!',
    successMsg:   'Din beställning har skickats. Vi hör av oss.',
    invalidToken: 'Den här länken är ogiltig eller har gått ut.',
    errorLoad:    'Det gick inte att läsa in formuläret. Försök igen.',
    errorSubmit:  'Det gick inte att skicka. Försök igen.',
    errorNoItems: 'Lägg till minst en produkt.',
    loading:      'Laddar…',
    noProducts:   'Inga produkter är tillgängliga för beställning just nu.',
    total:        'Totalt för denna beställning',
  },
}

function resolveLang(param: string | null): Lang {
  const s = (param || navigator.language || '').toLowerCase()
  if (s.startsWith('sv')) return 'sv'
  if (s.startsWith('es')) return 'es'
  return 'en'
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Product = { id: string; name: string; price_amount: number }

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export default function OrderFormPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const { fmtMoney } = useCurrency()
  const lang = resolveLang(searchParams.get('lang'))
  const t = (k: string, vars?: Record<string, string>) => {
    let s = T[lang][k] ?? k
    if (vars) Object.entries(vars).forEach(([key, val]) => { s = s.replace(`{{${key}}}`, val) })
    return s
  }

  const [status,       setStatus]       = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error' | 'invalid'>('loading')
  const [errMsg,       setErrMsg]       = useState('')
  const [customerName, setCustomerName] = useState('')
  const [products,     setProducts]     = useState<Product[]>([])
  const [qtys,         setQtys]         = useState<Record<string, string>>({})
  const [notes,        setNotes]        = useState('')
  const [tenantName,   setTenantName]   = useState('')
  const [tenantIcon,   setTenantIcon]   = useState<string | null>(null)
  const [bgColor,      setBgColor]      = useState('#f0f2f5')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    fetch(`${BASE}/api/order-form?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setStatus('invalid'); return }
        setCustomerName(data.customer_name ?? '')
        setTenantName(data.tenant_name ?? '')
        setTenantIcon(data.tenant_icon ?? null)
        setProducts(data.products ?? [])
        setStatus('ready')
      })
      .catch(() => { setErrMsg(t('errorLoad')); setStatus('error') })
  }, [token])

  useEffect(() => {
    if (!tenantIcon) return
    new Vibrant(tenantIcon).getPalette()
      .then(palette => {
        const swatch = palette.Vibrant ?? palette.LightVibrant ?? palette.Muted
        if (!swatch) return
        const { r, g, b } = swatch
        setBgColor(`rgb(${Math.round(r * 0.12 + 255 * 0.88)}, ${Math.round(g * 0.12 + 255 * 0.88)}, ${Math.round(b * 0.12 + 255 * 0.88)})`)
      })
      .catch(() => {})
  }, [tenantIcon])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const items = products
      .filter(p => Number(qtys[p.id]) > 0)
      .map(p => ({ product_id: p.id, qty: Math.floor(Number(qtys[p.id])) }))

    if (items.length === 0) { setErrMsg(t('errorNoItems')); return }
    setErrMsg('')
    setStatus('submitting')
    try {
      const res = await fetch(`${BASE}/api/order-form`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, items, notes: notes.trim() || undefined }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setStatus('done')
    } catch {
      setErrMsg(t('errorSubmit'))
      setStatus('error')
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const page: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    overflowY: 'auto',
    background: bgColor,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a2e',
  }
  const card: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 12,
    padding: '32px 28px',
    maxWidth: 520,
    width: '100%',
    boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
    color: '#1a1a2e',
  }
  const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: '#444',
  }
  const btn: React.CSSProperties = {
    width: '100%',
    padding: '12px 0',
    background: '#4f8ef7',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  }

  // ── Render states ─────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', padding: 48, color: '#666' }}>{t('loading')}</div></div>
  }
  if (status === 'invalid') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', padding: 48, color: '#c0392b' }}>{t('invalidToken')}</div></div>
  }
  if (status === 'error' && !errMsg) {
    return <div style={page}><div style={{ ...card, textAlign: 'center', padding: 48, color: '#c0392b' }}>{t('errorLoad')}</div></div>
  }
  if (status === 'done') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 44, marginBottom: 16, color: '#2e7d32' }}>✓</div>
          <h2 style={{ margin: '0 0 8px', color: '#2e7d32' }}>{t('successTitle')}</h2>
          <p style={{ color: '#555', margin: 0 }}>{t('successMsg')}</p>
        </div>
      </div>
    )
  }

  if (status === 'ready' && products.length === 0) {
    return <div style={page}><div style={{ ...card, textAlign: 'center', padding: 48, color: '#666' }}>{t('noProducts')}</div></div>
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {(tenantIcon || tenantName) && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            {tenantIcon && (
              <img
                src={tenantIcon}
                alt={tenantName}
                style={{ width: 78, height: 78, borderRadius: 14, background: '#fff', padding: 2, boxShadow: '0 1px 6px rgba(0,0,0,0.10)', objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{tenantName}</h2>
            </div>
          </div>
        )}
      <div style={card}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#1a1a2e' }}>{t('title')}</h2>
        <p style={{ margin: '0 0 24px', color: '#555', fontSize: 14 }}>
          {t('welcome', { name: customerName })}
        </p>

        <form onSubmit={handleSubmit} noValidate>

          {/* Product list */}
          <div style={{ marginBottom: 20 }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, marginBottom: 6 }}>
              <span style={{ ...lbl, marginBottom: 0 }}>{t('product')}</span>
              <span style={{ ...lbl, marginBottom: 0, textAlign: 'right' }}>{t('price')}</span>
              <span style={{ ...lbl, marginBottom: 0, textAlign: 'center' }}>{t('qty')}</span>
            </div>

            {/* Product rows */}
            {products.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px',
                  gap: 8,
                  alignItems: 'center',
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span style={{ fontSize: 15, color: '#1a1a2e' }}>{p.name}</span>
                <span style={{ fontSize: 14, color: '#555', textAlign: 'right' }}>
                  {fmtMoney(p.price_amount)}
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={qtys[p.id] ?? ''}
                  onChange={e => setQtys(q => ({ ...q, [p.id]: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #d0d0d0',
                    borderRadius: 6,
                    fontSize: 15,
                    textAlign: 'center',
                    background: '#fff',
                    color: '#1a1a2e',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          {/* Total */}
          {(() => {
            const total = products.reduce((sum, p) => {
              const qty = Math.max(0, Math.floor(Number(qtys[p.id]) || 0))
              return sum + qty * Number(p.price_amount)
            }, 0)
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginBottom: 8, borderTop: '2px solid #1a1a2e' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>{t('total')}</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>
                  {fmtMoney(total)}
                </span>
              </div>
            )
          })()}

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>{t('notes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d0d0d0',
                borderRadius: 6,
                fontSize: 15,
                resize: 'vertical',
                background: '#fff',
                color: '#1a1a2e',
                boxSizing: 'border-box',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {errMsg && (
            <p style={{ color: '#c0392b', fontSize: 14, margin: '0 0 8px' }}>{errMsg}</p>
          )}

          <button
            type="submit"
            style={{ ...btn, opacity: status === 'submitting' ? 0.7 : 1 }}
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? t('submitting') : t('submit')}
          </button>

        </form>
      </div>
      </div>
    </div>
  )
}
