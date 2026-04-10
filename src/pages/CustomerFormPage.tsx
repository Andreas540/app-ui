// src/pages/CustomerFormPage.tsx
// Public-facing page — rendered outside the authenticated app shell.
// Accessed via /customer-form/:token  (token embedded in URL by the manager)
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

// ── Inline translations ───────────────────────────────────────────────────────

type Lang = 'en' | 'es' | 'sv'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title:         'Customer Information',
    subtitle:      'Please fill in your details below.',
    name:          'Name',
    companyName:   'Company name',
    phone:         'Phone',
    address1:      'Address line 1',
    address2:      'Address line 2',
    city:          'City',
    state:         'State / Province',
    postalCode:    'Postal code',
    country:       'Country',
    submit:        'Submit',
    submitting:    'Submitting…',
    successTitle:  'Thank you!',
    successMsg:    'Your information has been submitted.',
    invalidToken:  'This link is invalid or has expired.',
    errorLoad:     'Could not load the form. Please try again.',
    errorSubmit:   'Submission failed. Please try again.',
    loading:       'Loading…',
  },
  es: {
    title:         'Información del cliente',
    subtitle:      'Por favor, complete sus datos a continuación.',
    name:          'Nombre',
    companyName:   'Nombre de empresa',
    phone:         'Teléfono',
    address1:      'Dirección línea 1',
    address2:      'Dirección línea 2',
    city:          'Ciudad',
    state:         'Estado / Provincia',
    postalCode:    'Código postal',
    country:       'País',
    submit:        'Enviar',
    submitting:    'Enviando…',
    successTitle:  '¡Gracias!',
    successMsg:    'Su información ha sido enviada.',
    invalidToken:  'Este enlace no es válido o ha expirado.',
    errorLoad:     'No se pudo cargar el formulario. Inténtelo de nuevo.',
    errorSubmit:   'Error al enviar. Inténtelo de nuevo.',
    loading:       'Cargando…',
  },
  sv: {
    title:         'Kundinformation',
    subtitle:      'Fyll i dina uppgifter nedan.',
    name:          'Namn',
    companyName:   'Företagsnamn',
    phone:         'Telefon',
    address1:      'Adressrad 1',
    address2:      'Adressrad 2',
    city:          'Stad',
    state:         'Stat / Län',
    postalCode:    'Postnummer',
    country:       'Land',
    submit:        'Skicka',
    submitting:    'Skickar…',
    successTitle:  'Tack!',
    successMsg:    'Din information har skickats.',
    invalidToken:  'Den här länken är ogiltig eller har gått ut.',
    errorLoad:     'Det gick inte att läsa in formuläret. Försök igen.',
    errorSubmit:   'Det gick inte att skicka. Försök igen.',
    loading:       'Laddar…',
  },
}

function detectLang(): Lang {
  const nav = navigator.language?.toLowerCase() || ''
  if (nav.startsWith('sv')) return 'sv'
  if (nav.startsWith('es')) return 'es'
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
  const lang = detectLang()
  const t = (k: string) => T[lang][k] ?? k

  const [status, setStatus]   = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error' | 'invalid'>('loading')
  const [errMsg, setErrMsg]   = useState('')
  const [form, setForm]       = useState<FormData>({
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

  // ── Styles ──────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f5f5f7',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: '32px 28px',
    maxWidth: 520,
    width: '100%',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: '#444',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  }
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  }
  const fieldStyle: React.CSSProperties = { marginBottom: 16 }
  const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 0',
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, color: '#666', textAlign: 'center', padding: 48 }}>
          {t('loading')}
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, color: '#c0392b', textAlign: 'center', padding: 48 }}>
          {t('invalidToken')}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, color: '#c0392b', textAlign: 'center', padding: 48 }}>
          {errMsg}
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <h2 style={{ margin: '0 0 8px', color: '#2e7d32' }}>{t('successTitle')}</h2>
          <p style={{ color: '#555', margin: 0 }}>{t('successMsg')}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 22, color: '#1a1a2e' }}>{t('title')}</h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: 14 }}>{t('subtitle')}</p>

        <form onSubmit={handleSubmit} noValidate>

          <div style={rowStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('name')}</label>
              <input style={inputStyle} value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('companyName')}</label>
              <input style={inputStyle} value={form.company_name} onChange={set('company_name')} autoComplete="organization" />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>{t('phone')}</label>
            <input style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>{t('address1')}</label>
            <input style={inputStyle} value={form.address1} onChange={set('address1')} autoComplete="address-line1" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>{t('address2')}</label>
            <input style={inputStyle} value={form.address2} onChange={set('address2')} autoComplete="address-line2" />
          </div>

          <div style={rowStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('city')}</label>
              <input style={inputStyle} value={form.city} onChange={set('city')} autoComplete="address-level2" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('state')}</label>
              <input style={inputStyle} value={form.state} onChange={set('state')} autoComplete="address-level1" />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('postalCode')}</label>
              <input style={inputStyle} value={form.postal_code} onChange={set('postal_code')} autoComplete="postal-code" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('country')}</label>
              <input style={inputStyle} value={form.country} onChange={set('country')} autoComplete="country-name" />
            </div>
          </div>

          <button
            type="submit"
            style={{ ...btnStyle, opacity: status === 'submitting' ? 0.7 : 1 }}
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? t('submitting') : t('submit')}
          </button>

        </form>
      </div>
    </div>
  )
}
