// src/pages/PublicOrderPage.tsx
// General public order page — accessed via /order/:slug
// Access controls: active flag, geo restriction, shared password (session-based).

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Lightbox } from '../components/Lightbox'
import { Vibrant } from 'node-vibrant/browser'

// ── Inline translations (standalone page, no i18n context) ───────────────────

type Lang = 'en' | 'es' | 'sv'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title:           'Order',
    pageNotActive:   'This order page is not currently available.',
    pageNotFound:    'Order page not found.',
    geoBlocked:      'This order page is not available in your region.',
    passwordTitle:   'Enter password to continue',
    passwordLabel:   'Password',
    passwordSubmit:  'Continue',
    passwordWrong:   'Incorrect password. Please try again.',
    passwordChecking:'Checking…',
    product:         'Product',
    price:           'Price',
    qty:             'Qty',
    available:       'Available',
    yourInfo:        'Your information',
    name:            'Name',
    email:           'Email',
    phone:           'Phone (optional)',
    notes:           'Notes (optional)',
    next:            'Next',
    back:            'Back',
    placeOrder:      'Place Order',
    bookAndPay:      'Book & Pay',
    submitting:      'Submitting…',
    successTitle:    'Order received!',
    successMsg:      'Your order has been submitted. We will be in touch.',
    errorNoItems:    'Please select at least one product.',
    errorNoName:     'Please enter your name.',
    errorSubmit:     'Submission failed. Please try again.',
    loading:         'Loading…',
    noProducts:      'No products are currently available.',
    total:           'Total',
    sessionExpired:  'Your session has expired. Please enter the password again.',
  },
  es: {
    title:           'Pedido',
    pageNotActive:   'Esta página de pedido no está disponible actualmente.',
    pageNotFound:    'Página de pedido no encontrada.',
    geoBlocked:      'Esta página de pedido no está disponible en tu región.',
    passwordTitle:   'Ingresa la contraseña para continuar',
    passwordLabel:   'Contraseña',
    passwordSubmit:  'Continuar',
    passwordWrong:   'Contraseña incorrecta. Inténtalo de nuevo.',
    passwordChecking:'Verificando…',
    product:         'Producto',
    price:           'Precio',
    qty:             'Cant.',
    available:       'Disponible',
    yourInfo:        'Tu información',
    name:            'Nombre',
    email:           'Correo electrónico',
    phone:           'Teléfono (opcional)',
    notes:           'Notas (opcional)',
    next:            'Siguiente',
    back:            'Atrás',
    placeOrder:      'Realizar pedido',
    bookAndPay:      'Reservar y pagar',
    submitting:      'Enviando…',
    successTitle:    '¡Pedido recibido!',
    successMsg:      'Tu pedido ha sido enviado. Nos pondremos en contacto contigo.',
    errorNoItems:    'Selecciona al menos un producto.',
    errorNoName:     'Por favor ingresa tu nombre.',
    errorSubmit:     'Error al enviar. Inténtalo de nuevo.',
    loading:         'Cargando…',
    noProducts:      'No hay productos disponibles actualmente.',
    total:           'Total',
    sessionExpired:  'Tu sesión ha expirado. Ingresa la contraseña nuevamente.',
  },
  sv: {
    title:           'Beställning',
    pageNotActive:   'Den här beställningssidan är inte tillgänglig just nu.',
    pageNotFound:    'Beställningssidan hittades inte.',
    geoBlocked:      'Den här beställningssidan är inte tillgänglig i din region.',
    passwordTitle:   'Ange lösenord för att fortsätta',
    passwordLabel:   'Lösenord',
    passwordSubmit:  'Fortsätt',
    passwordWrong:   'Fel lösenord. Försök igen.',
    passwordChecking:'Kontrollerar…',
    product:         'Produkt',
    price:           'Pris',
    qty:             'Antal',
    available:       'Tillgänglig',
    yourInfo:        'Din information',
    name:            'Namn',
    email:           'E-post',
    phone:           'Telefon (valfritt)',
    notes:           'Anteckningar (valfritt)',
    next:            'Nästa',
    back:            'Tillbaka',
    placeOrder:      'Lägg beställning',
    bookAndPay:      'Boka & betala',
    submitting:      'Skickar…',
    successTitle:    'Beställning mottagen!',
    successMsg:      'Din beställning har skickats. Vi hör av oss.',
    errorNoItems:    'Välj minst en produkt.',
    errorNoName:     'Vänligen ange ditt namn.',
    errorSubmit:     'Det gick inte att skicka. Försök igen.',
    loading:         'Laddar…',
    noProducts:      'Inga produkter är tillgängliga just nu.',
    total:           'Totalt',
    sessionExpired:  'Din session har löpt ut. Ange lösenordet igen.',
  },
}

function resolveLang(param: string | null): Lang {
  const s = (param || navigator.language || '').toLowerCase()
  if (s.startsWith('sv')) return 'sv'
  if (s.startsWith('es')) return 'es'
  return 'en'
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderProduct {
  id: string
  name: string
  price_amount: number
  available_qty: number | null
  label_text: string | null
  label_image_data: string | null
  has_image: boolean
  image_version: number | null
}

type PageStatus =
  | 'loading'
  | 'inactive'
  | 'not_found'
  | 'geo_blocked'
  | 'password'
  | 'order'
  | 'details'
  | 'submitting'
  | 'done'
  | 'error'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

function sessionKey(slug: string) { return `order_page_session_${slug}` }

function getStoredSession(slug: string): string | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(slug))
    if (!raw) return null
    const { token, exp } = JSON.parse(raw)
    if (Date.now() / 1000 > exp) { sessionStorage.removeItem(sessionKey(slug)); return null }
    return token
  } catch { return null }
}

function storeSession(slug: string, token: string, sessionMinutes: number) {
  try {
    sessionStorage.setItem(sessionKey(slug), JSON.stringify({
      token,
      exp: Math.floor(Date.now() / 1000) + sessionMinutes * 60,
    }))
  } catch { /* ignore storage errors */ }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PublicOrderPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const [lang, setLang] = useState<Lang>(() => resolveLang(searchParams.get('lang')))
  const t = (k: string) => T[lang][k] ?? k

  const [currency, setCurrency] = useState('USD')
  const fmtMoney = (n: number) => {
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
    } catch { return `${Number(n).toFixed(2)} ${currency}` }
  }

  const [status, setStatus]           = useState<PageStatus>('loading')
  const [tenantName, setTenantName]   = useState('')
  const [tenantIcon, setTenantIcon]   = useState<string | null>(null)
  const [bgColor, setBgColor]         = useState('#f0f2f5')
  const [products, setProducts]       = useState<OrderProduct[]>([])
  const [qtys, setQtys]               = useState<Record<string, string>>({})
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [sessionMinutes] = useState(60)
  const [hasPayment, setHasPayment]   = useState(false)

  // Password form
  const [password, setPassword]       = useState('')
  const [pwError, setPwError]         = useState('')
  const [pwChecking, setPwChecking]   = useState(false)

  // Contact form
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState('')

  // Confirmation
  const [orderNo, setOrderNo] = useState<number | null>(null)

  useEffect(() => {
    if (!slug) { setStatus('not_found'); return }
    loadPage()
  }, [slug])

  async function loadPage(overrideSession?: string) {
    if (!slug) return
    setStatus('loading')
    const token = overrideSession ?? getStoredSession(slug)
    const url = `${BASE}/api/public-order-page?slug=${encodeURIComponent(slug)}${token ? `&session=${encodeURIComponent(token)}` : ''}`
    try {
      const res = await fetch(url)
      const data = await res.json()

      if (res.status === 404 || data.error === 'not_found') { setStatus('not_found'); return }
      if (data.error === 'inactive') { setStatus('inactive'); return }
      if (data.error === 'geo_blocked') { setStatus('geo_blocked'); return }
      if (!res.ok) { setStatus('error'); return }

      setTenantName(data.tenant_name || '')
      setTenantIcon(data.tenant_icon || null)
      if (!searchParams.get('lang') && data.tenant_language) setLang(resolveLang(data.tenant_language))
      if (data.tenant_currency) setCurrency(data.tenant_currency.toUpperCase())

      // Extract background colour from tenant icon
      if (data.tenant_icon) {
        try {
          const palette = await Vibrant.from(data.tenant_icon).getPalette()
          const color = palette.LightVibrant?.hex || palette.Vibrant?.hex
          if (color) setBgColor(color)
        } catch { /* ignore */ }
      }

      if (data.requires_password) {
        // Check if stored session expired
        if (token && !overrideSession) {
          setPwError(t('sessionExpired'))
        }
        setStatus('password')
        return
      }

      setProducts(data.products || [])
      setHasPayment(!!data.has_payment)
      setStatus('order')
    } catch {
      setStatus('error')
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!slug) return
    setPwError('')
    setPwChecking(true)
    try {
      const res = await fetch(`${BASE}/api/public-order-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth', slug, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPwError(t('passwordWrong'))
        return
      }
      storeSession(slug, data.session_token, sessionMinutes)
      setSessionToken(data.session_token)
      setPassword('')
      await loadPage(data.session_token)
    } catch {
      setPwError(t('passwordWrong'))
    } finally {
      setPwChecking(false)
    }
  }

  function handleNext() {
    const hasItems = Object.values(qtys).some(v => Number(v) > 0)
    if (!hasItems) { setSubmitError(t('errorNoItems')); return }
    setSubmitError('')
    setStatus('details')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    const items = Object.entries(qtys)
      .filter(([, v]) => Number(v) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: Math.floor(Number(qty)) }))

    if (!items.length) { setSubmitError(t('errorNoItems')); return }
    if (!name.trim()) { setSubmitError(t('errorNoName')); return }
    if (!slug) return

    setStatus('submitting')
    try {
      const body: any = { action: 'order', slug, items, name: name.trim(), email: email.trim(), phone: phone.trim(), notes: notes.trim() || undefined }
      const storedSession = getStoredSession(slug) || sessionToken
      if (storedSession) body.session = storedSession

      const res = await fetch(`${BASE}/api/public-order-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error || t('errorSubmit')); setStatus('details'); return }

      if (data.checkout_url) {
        setOrderNo(data.order_no ?? null)
        setStatus('done')
        window.location.href = data.checkout_url
        return
      }

      setOrderNo(data.order_no ?? null)
      setStatus('done')
    } catch {
      setSubmitError(t('errorSubmit'))
      setStatus('details')
    }
  }

  const total = Object.entries(qtys).reduce((sum, [pid, qty]) => {
    const p = products.find(p => p.id === pid)
    return sum + (p ? p.price_amount * (Number(qty) || 0) : 0)
  }, 0)

  // ── Shell layout ──────────────────────────────────────────────────────────
  const shellStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    background: bgColor,
    fontFamily: 'system-ui, sans-serif',
  }

  const innerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px 48px',
    minHeight: '100%',
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 16,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    textAlign: 'center',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 44,
    padding: '0 12px', fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={shellStyle}>
        <div style={innerStyle}>
          <div style={{ color: '#fff', marginTop: 60, fontSize: 16 }}>{t('loading')}</div>
        </div>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div style={shellStyle}><div style={innerStyle}>
        <div style={cardStyle}><p style={{ textAlign: 'center', color: '#666', margin: 0 }}>{t('pageNotFound')}</p></div>
      </div></div>
    )
  }

  if (status === 'inactive') {
    return (
      <div style={shellStyle}><div style={innerStyle}>
        <div style={cardStyle}><p style={{ textAlign: 'center', color: '#666', margin: 0 }}>{t('pageNotActive')}</p></div>
      </div></div>
    )
  }

  if (status === 'geo_blocked') {
    return (
      <div style={shellStyle}><div style={innerStyle}>
        <div style={cardStyle}><p style={{ textAlign: 'center', color: '#666', margin: 0 }}>{t('geoBlocked')}</p></div>
      </div></div>
    )
  }

  if (status === 'password') {
    return (
      <div style={shellStyle}>
        {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        <div style={innerStyle}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              {tenantIcon && <img src={tenantIcon} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />}
              {tenantName && <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>{tenantName}</div>}
            </div>
            <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 16, textAlign: 'center', color: '#1a1a2e' }}>{t('passwordTitle')}</div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 6 }}>{t('passwordLabel')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                  style={inputStyle}
                />
              </div>
              {pwError && <p style={{ color: '#e53e3e', margin: 0, fontSize: 13, textAlign: 'center' }}>{pwError}</p>}
              <button
                type="submit"
                disabled={pwChecking || !password}
                style={{ height: 46, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                {pwChecking ? t('passwordChecking') : t('passwordSubmit')}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div style={shellStyle}><div style={innerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            {tenantIcon && <img src={tenantIcon} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />}
            {tenantName && <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>{tenantName}</div>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: '#1a1a2e', marginBottom: 8 }}>{t('successTitle')}</div>
            <div style={{ color: '#555', fontSize: 15 }}>{t('successMsg')}</div>
            {orderNo != null && <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>#{orderNo}</div>}
          </div>
        </div>
      </div></div>
    )
  }

  // ── Step 1: Product selection ─────────────────────────────────────────────
  if (status === 'order') {
    return (
      <div style={shellStyle}>
        {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        <div style={innerStyle}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              {tenantIcon && <img src={tenantIcon} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />}
              {tenantName && <div style={{ fontWeight: 700, fontSize: 20, color: '#1a1a2e' }}>{tenantName}</div>}
              <div style={{ fontSize: 15, color: '#555' }}>{t('title')}</div>
            </div>

            {products.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666' }}>{t('noProducts')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 12, color: '#888', fontWeight: 600 }}>{t('product')}</th>
                      <th style={{ textAlign: 'right', padding: '6px 6px', fontSize: 12, color: '#888', fontWeight: 600 }}>{t('price')}</th>
                      <th style={{ textAlign: 'center', padding: '6px 0', fontSize: 12, color: '#888', fontWeight: 600 }}>{t('qty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const qty = qtys[p.id] || ''
                      const maxQty = p.available_qty ?? undefined
                      const imgUrl = `${BASE}/.netlify/functions/serve-product-image?id=${p.id}&v=${p.image_version || 0}`
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '10px 0', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {p.has_image && (
                                <img
                                  src={imgUrl}
                                  alt=""
                                  onClick={() => setLightboxSrc(imgUrl)}
                                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                                />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a2e' }}>{p.name}</div>
                                {(p.label_image_data || p.label_text) && (
                                  p.label_image_data
                                    ? <img src={p.label_image_data} alt="" style={{ height: 18, maxWidth: 60, objectFit: 'contain', marginTop: 3 }} />
                                    : <span style={{ display: 'inline-block', background: '#ff6b35', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginTop: 3, textTransform: 'uppercase' }}>{p.label_text}</span>
                                )}
                                {maxQty != null && (
                                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{t('available')}: {maxQty}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: 14, color: '#333', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {fmtMoney(p.price_amount)}
                          </td>
                          <td style={{ padding: '10px 0', textAlign: 'center', verticalAlign: 'middle' }}>
                            <input
                              type="number"
                              min="0"
                              max={maxQty}
                              step="1"
                              value={qty}
                              onChange={e => {
                                const v = e.target.value
                                if (v === '' || Number(v) >= 0) setQtys(prev => ({ ...prev, [p.id]: v }))
                              }}
                              style={{ width: 60, height: 36, textAlign: 'center', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid #eee' }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>
                      {t('total')}: {fmtMoney(total)}
                    </span>
                  </div>
                )}

                {submitError && <p style={{ color: '#e53e3e', margin: 0, fontSize: 13 }}>{submitError}</p>}

                <button
                  type="button"
                  onClick={handleNext}
                  style={{ height: 50, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('next')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Contact details + submit ──────────────────────────────────────
  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            {tenantIcon && <img src={tenantIcon} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />}
            {tenantName && <div style={{ fontWeight: 700, fontSize: 20, color: '#1a1a2e' }}>{tenantName}</div>}
          </div>

          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a2e', marginBottom: 16 }}>{t('yourInfo')}</div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 4 }}>{t('name')} *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 4 }}>{t('email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 4 }}>{t('phone')}</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 4 }}>{t('notes')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 16, border: '1px solid #ddd', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {submitError && <p style={{ color: '#e53e3e', margin: 0, fontSize: 13 }}>{submitError}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { setSubmitError(''); setStatus('order') }}
                style={{ flex: 1, height: 50, background: '#f0f2f5', color: '#333', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
              >
                {t('back')}
              </button>
              <button
                type="submit"
                disabled={status === 'submitting'}
                style={{ flex: 2, height: 50, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
              >
                {status === 'submitting' ? t('submitting') : hasPayment ? t('bookAndPay') : t('placeOrder')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
