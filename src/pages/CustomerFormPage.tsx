// src/pages/CustomerFormPage.tsx
// Public-facing page — rendered outside the authenticated app shell.
// Accessed via /customer-form/:token?lang=sv  (token + optional lang in URL)
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Vibrant } from 'node-vibrant/browser'

// ── Inline translations ───────────────────────────────────────────────────────

type Lang = 'en' | 'es' | 'sv'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title:        'Customer Information',
    welcome:      'Hi, please send us your company information using this form.',
    welcomeUpdate: 'Hi, please add any missing information about your company.',
    name:         'Customer Name',
    companyName:  'Contact',
    phone:        'Phone',
    address1:     'Address line 1',
    address2:     'Address line 2',
    city:         'City',
    state:        'State',
    postalCode:   'ZIP',
    country:      'Country',
    submit:       'Submit',
    submitting:   'Submitting…',
    successTitle: 'Thank you!',
    successMsg:   'Your information has been submitted.',
    invalidToken: 'This link is invalid or has expired.',
    errorLoad:    'Could not load the form. Please try again.',
    errorSubmit:  'Submission failed. Please try again.',
    loading:      'Loading…',
  },
  es: {
    title:        'Información del cliente',
    welcome:      'Hola, por favor envíanos la información de tu empresa usando este formulario.',
    welcomeUpdate: 'Hola, por favor añade cualquier información que falte sobre tu empresa.',
    name:         'Nombre del Cliente',
    companyName:  'Contacto',
    phone:        'Teléfono',
    address1:     'Dirección línea 1',
    address2:     'Dirección línea 2',
    city:         'Ciudad',
    state:        'Estado',
    postalCode:   'Código postal',
    country:      'País',
    submit:       'Enviar',
    submitting:   'Enviando…',
    successTitle: '¡Gracias!',
    successMsg:   'Su información ha sido enviada.',
    invalidToken: 'Este enlace no es válido o ha expirado.',
    errorLoad:    'No se pudo cargar el formulario. Inténtelo de nuevo.',
    errorSubmit:  'Error al enviar. Inténtelo de nuevo.',
    loading:      'Cargando…',
  },
  sv: {
    title:        'Kundinformation',
    welcome:      'Hej, vänligen skicka din företagsinformation via det här formuläret.',
    welcomeUpdate: 'Hej, vänligen lägg till eventuell saknad information om ditt företag.',
    name:         'Kundnamn',
    companyName:  'Kontakt',
    phone:        'Telefon',
    address1:     'Adressrad 1',
    address2:     'Adressrad 2',
    city:         'Stad',
    state:        'Stat',
    postalCode:   'Postnummer',
    country:      'Land',
    submit:       'Skicka',
    submitting:   'Skickar…',
    successTitle: 'Tack!',
    successMsg:   'Din information har skickats.',
    invalidToken: 'Den här länken är ogiltig eller har gått ut.',
    errorLoad:    'Det gick inte att läsa in formuläret. Försök igen.',
    errorSubmit:  'Det gick inte att skicka. Försök igen.',
    loading:      'Laddar…',
  },
}

function resolveLang(param: string | null): Lang {
  const s = (param || navigator.language || '').toLowerCase()
  if (s.startsWith('sv')) return 'sv'
  if (s.startsWith('es')) return 'es'
  return 'en'
}

// ── Component ─────────────────────────────────────────────────────────────────

type FormData = {
  name:         string
  company_name: string
  phone:        string
  address1:     string
  address2:     string
  city:         string
  state:        string
  postal_code:  string
  country:      string
}

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export default function CustomerFormPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const lang = resolveLang(searchParams.get('lang'))
  const isUpdate = searchParams.get('type') === 'update'
  const t = (k: string) => T[lang][k] ?? k

  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error' | 'invalid'>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [tenantIcon, setTenantIcon] = useState<string | null>(null)
  const [bgColor,    setBgColor]    = useState('#f0f2f5')
  const [form, setForm]     = useState<FormData>({
    name: '', company_name: '', phone: '',
    address1: '', address2: '', city: '',
    state: '', postal_code: '', country: '',
  })

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    fetch(`${BASE}/api/customer-form?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setStatus('invalid'); return }
        setTenantName(data.tenant_name ?? '')
        setTenantIcon(data.tenant_icon ?? null)
        const c = data.customer
        setForm({
          name:         c.name         ?? '',
          company_name: c.company_name ?? '',
          phone:        c.phone        ?? '',
          address1:     c.address1     ?? '',
          address2:     c.address2     ?? '',
          city:         c.city         ?? '',
          state:        c.state        ?? '',
          postal_code:  c.postal_code  ?? '',
          country:      c.country      ?? '',
        })
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

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch(`${BASE}/api/customer-form`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setStatus('done')
    } catch {
      setErrMsg(t('errorSubmit'))
      setStatus('error')
    }
  }

  // ── Styles — always explicit, no CSS variables, works outside app theme ──────

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
  const inp: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d0d0d0',
    borderRadius: 6,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#1a1a2e',
  }
  const row2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  }
  const field: React.CSSProperties = { marginBottom: 14 }
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
  if (status === 'error') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', padding: 48, color: '#c0392b' }}>{errMsg}</div></div>
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

  return (
    <div style={page}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {tenantIcon || tenantName ? (
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
        ) : null}
      <div style={card}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#1a1a2e' }}>{t('title')}</h2>
        <p style={{ margin: '0 0 24px', color: '#555', fontSize: 14 }}>{isUpdate ? t('welcomeUpdate') : t('welcome')}</p>

        <form onSubmit={handleSubmit} noValidate>

          {/* Name — full width */}
          <div style={field}>
            <label style={lbl}>{t('name')}</label>
            <input style={inp} value={form.name} onChange={set('name')} autoComplete="name" />
          </div>

          {/* Company name + Phone — same row as in app */}
          <div style={{ ...row2, marginBottom: 14 }}>
            <div>
              <label style={lbl}>{t('companyName')}</label>
              <input style={inp} value={form.company_name} onChange={set('company_name')} autoComplete="organization" />
            </div>
            <div>
              <label style={lbl}>{t('phone')}</label>
              <input style={inp} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </div>
          </div>

          {/* Address line 1 + Address line 2 */}
          <div style={{ ...row2, marginBottom: 14 }}>
            <div>
              <label style={lbl}>{t('address1')}</label>
              <input style={inp} value={form.address1} onChange={set('address1')} autoComplete="address-line1" />
            </div>
            <div>
              <label style={lbl}>{t('address2')}</label>
              <input style={inp} value={form.address2} onChange={set('address2')} autoComplete="address-line2" />
            </div>
          </div>

          {/* City + State */}
          <div style={{ ...row2, marginBottom: 14 }}>
            <div>
              <label style={lbl}>{t('city')}</label>
              <input style={inp} value={form.city} onChange={set('city')} autoComplete="address-level2" />
            </div>
            <div>
              <label style={lbl}>{t('state')}</label>
              <input style={inp} value={form.state} onChange={set('state')} autoComplete="address-level1" />
            </div>
          </div>

          {/* Postal code + Country */}
          <div style={{ ...row2, marginBottom: 14 }}>
            <div>
              <label style={lbl}>{t('postalCode')}</label>
              <input style={inp} value={form.postal_code} onChange={set('postal_code')} autoComplete="postal-code" />
            </div>
            <div>
              <label style={lbl}>{t('country')}</label>
              <input style={inp} value={form.country} onChange={set('country')} autoComplete="country-name" />
            </div>
          </div>

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
