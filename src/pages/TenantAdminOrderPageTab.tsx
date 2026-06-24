// src/pages/TenantAdminOrderPageTab.tsx
// Order Page admin tab: two sub-tabs — content setup and URL/access configuration.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function sanitizeSlug(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 60)
}

// ── Country / state data ──────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'AR', label: 'Argentina' }, { code: 'AU', label: 'Australia' },
  { code: 'AT', label: 'Austria' },   { code: 'BE', label: 'Belgium' },
  { code: 'BR', label: 'Brazil' },    { code: 'CA', label: 'Canada' },
  { code: 'CL', label: 'Chile' },     { code: 'CN', label: 'China' },
  { code: 'CO', label: 'Colombia' },  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },   { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },   { code: 'GH', label: 'Ghana' },
  { code: 'IN', label: 'India' },     { code: 'IE', label: 'Ireland' },
  { code: 'IL', label: 'Israel' },    { code: 'IT', label: 'Italy' },
  { code: 'JP', label: 'Japan' },     { code: 'KE', label: 'Kenya' },
  { code: 'KR', label: 'South Korea' }, { code: 'MX', label: 'Mexico' },
  { code: 'NL', label: 'Netherlands' }, { code: 'NZ', label: 'New Zealand' },
  { code: 'NG', label: 'Nigeria' },   { code: 'NO', label: 'Norway' },
  { code: 'PE', label: 'Peru' },      { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },  { code: 'SG', label: 'Singapore' },
  { code: 'ZA', label: 'South Africa' }, { code: 'ES', label: 'Spain' },
  { code: 'SE', label: 'Sweden' },    { code: 'CH', label: 'Switzerland' },
  { code: 'AE', label: 'UAE' },       { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
]

const US_STATES = [
  { code: 'AL', label: 'Alabama' },     { code: 'AK', label: 'Alaska' },
  { code: 'AZ', label: 'Arizona' },     { code: 'AR', label: 'Arkansas' },
  { code: 'CA', label: 'California' },  { code: 'CO', label: 'Colorado' },
  { code: 'CT', label: 'Connecticut' }, { code: 'DE', label: 'Delaware' },
  { code: 'FL', label: 'Florida' },     { code: 'GA', label: 'Georgia' },
  { code: 'HI', label: 'Hawaii' },      { code: 'ID', label: 'Idaho' },
  { code: 'IL', label: 'Illinois' },    { code: 'IN', label: 'Indiana' },
  { code: 'IA', label: 'Iowa' },        { code: 'KS', label: 'Kansas' },
  { code: 'KY', label: 'Kentucky' },    { code: 'LA', label: 'Louisiana' },
  { code: 'ME', label: 'Maine' },       { code: 'MD', label: 'Maryland' },
  { code: 'MA', label: 'Massachusetts' }, { code: 'MI', label: 'Michigan' },
  { code: 'MN', label: 'Minnesota' },   { code: 'MS', label: 'Mississippi' },
  { code: 'MO', label: 'Missouri' },    { code: 'MT', label: 'Montana' },
  { code: 'NE', label: 'Nebraska' },    { code: 'NV', label: 'Nevada' },
  { code: 'NH', label: 'New Hampshire' }, { code: 'NJ', label: 'New Jersey' },
  { code: 'NM', label: 'New Mexico' },  { code: 'NY', label: 'New York' },
  { code: 'NC', label: 'North Carolina' }, { code: 'ND', label: 'North Dakota' },
  { code: 'OH', label: 'Ohio' },        { code: 'OK', label: 'Oklahoma' },
  { code: 'OR', label: 'Oregon' },      { code: 'PA', label: 'Pennsylvania' },
  { code: 'RI', label: 'Rhode Island' }, { code: 'SC', label: 'South Carolina' },
  { code: 'SD', label: 'South Dakota' }, { code: 'TN', label: 'Tennessee' },
  { code: 'TX', label: 'Texas' },       { code: 'UT', label: 'Utah' },
  { code: 'VT', label: 'Vermont' },     { code: 'VA', label: 'Virginia' },
  { code: 'WA', label: 'Washington' },  { code: 'WV', label: 'West Virginia' },
  { code: 'WI', label: 'Wisconsin' },   { code: 'WY', label: 'Wyoming' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderPageConfig {
  slug: string
  is_active: boolean
  has_password: boolean
  session_minutes: number
  geo_countries: string[]
  geo_states: string[]
}

interface OrderProduct {
  id: string
  name: string
  product_price: number
  has_image: boolean
  image_version: number | null
  display_price: number | null
  display_qty: number | null
  is_visible: boolean
  label_text: string | null
  label_image_data: string | null
  sort_order: number | null
}

type SubTab = 'content' | 'setup'

// ── Main component ────────────────────────────────────────────────────────────

export default function TenantAdminOrderPageTab() {
  const { t } = useTranslation()
  const { fmtInput, parseAmount } = useCurrency()
  const [subTab, setSubTab] = useState<SubTab>('content')

  // ── Content tab state ─────────────────────────────────────────────────────
  const [products, setProducts] = useState<OrderProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [savingProduct, setSavingProduct] = useState<string | null>(null)

  // Per-product row edits (keyed by product id)
  const [edits, setEdits] = useState<Record<string, Partial<OrderProduct>>>({})

  // ── Setup tab state ───────────────────────────────────────────────────────
  const [config, setConfig] = useState<OrderPageConfig>({
    slug: '', is_active: false, has_password: false,
    session_minutes: 60, geo_countries: [], geo_states: [],
  })
  const [configLoaded, setConfigLoaded] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [geoEnabled, setGeoEnabled] = useState(false)

  const siteOrigin = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
  const publicUrl  = config.slug ? `${siteOrigin}/order/${config.slug}` : ''
  const [copiedUrl, setCopiedUrl] = useState(false)

  useEffect(() => { loadConfig(); loadProducts() }, [])

  async function loadConfig() {
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin?action=getOrderPageConfig`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.config) {
        setConfig({
          slug: data.config.slug || '',
          is_active: !!data.config.is_active,
          has_password: !!data.config.has_password,
          session_minutes: data.config.session_minutes || 60,
          geo_countries: data.config.geo_countries || [],
          geo_states: data.config.geo_states || [],
        })
        setGeoEnabled((data.config.geo_countries || []).length > 0)
        setConfigLoaded(true)
      }
    } catch (e) { console.error(e) }
  }

  async function loadProducts() {
    setProductsLoading(true)
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin?action=getOrderPageProducts`, { headers: getAuthHeaders() })
      const data = await res.json()
      setProducts(data.products || [])
      const initial: Record<string, Partial<OrderProduct>> = {}
      for (const p of (data.products || [])) {
        initial[p.id] = {
          display_price: p.display_price,
          display_qty:   p.display_qty,
          is_visible:    p.is_visible !== false,
          label_text:    p.label_text || '',
          label_image_data: p.label_image_data || '',
          sort_order:    p.sort_order ?? 0,
        }
      }
      setEdits(initial)
    } catch (e) { console.error(e) } finally { setProductsLoading(false) }
  }

  function patchEdit(productId: string, patch: Partial<OrderProduct>) {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }))
  }

  async function saveProduct(product: OrderProduct) {
    const e = edits[product.id] || {}
    setSavingProduct(product.id)
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'saveOrderPageProduct',
          productId:      product.id,
          displayPrice:   e.display_price != null && e.display_price !== (null as any) ? e.display_price : null,
          displayQty:     e.display_qty != null ? e.display_qty : null,
          isVisible:      e.is_visible !== false,
          labelText:      e.label_text || null,
          labelImageData: e.label_image_data || null,
          sortOrder:      e.sort_order ?? 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    } finally { setSavingProduct(null) }
  }

  async function handleSaveConfig() {
    setSavingConfig(true)
    try {
      const body: any = {
        action: 'saveOrderPageConfig',
        slug:           config.slug,
        isActive:       config.is_active,
        sessionMinutes: config.session_minutes,
        geoCountries:   geoEnabled ? config.geo_countries : [],
        geoStates:      geoEnabled && config.geo_countries.includes('US') ? config.geo_states : [],
      }
      if (newPassword) {
        body.password = newPassword
      } else if (!config.has_password && !newPassword) {
        body.clearPassword = true
      }

      const res = await fetch(`${apiBase()}/api/tenant-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      if (newPassword) {
        setConfig(c => ({ ...c, has_password: true }))
        setNewPassword('')
      }
      alert(t('tenantAdmin.orderPage.settingsSaved'))
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    } finally { setSavingConfig(false) }
  }

  function handleLabelImage(productId: string, file: File | null) {
    if (!file) { patchEdit(productId, { label_image_data: '' }); return }
    const reader = new FileReader()
    reader.onload = e => patchEdit(productId, { label_image_data: String(e.target?.result || '') })
    reader.readAsDataURL(file)
  }

  const imgInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function toggleCountry(code: string) {
    setConfig(c => {
      const list = c.geo_countries.includes(code)
        ? c.geo_countries.filter(x => x !== code)
        : [...c.geo_countries, code]
      const states = code === 'US' && !list.includes('US') ? [] : c.geo_states
      return { ...c, geo_countries: list, geo_states: states }
    })
  }

  function toggleState(code: string) {
    setConfig(c => ({
      ...c,
      geo_states: c.geo_states.includes(code)
        ? c.geo_states.filter(x => x !== code)
        : [...c.geo_states, code],
    }))
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'content', label: t('tenantAdmin.orderPage.tabContent') },
    { id: 'setup',   label: t('tenantAdmin.orderPage.tabSetup') },
  ]

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as SubTab)}
        >
          {SUB_TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        <div className="booking-subtab-tabs" style={{ gap: 4, borderBottom: '1px solid var(--separator)' }}>
          {SUB_TABS.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
              background: 'none', border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subTab === tab.id ? 600 : 400,
              fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 1: Order page content ── */}
      {subTab === 'content' && (
        <div>
          {productsLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('loading')}</p>
          ) : products.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('tenantAdmin.orderPage.noProducts')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {products.map(product => {
                const e = edits[product.id] || {}
                const isVisible = e.is_visible !== false
                return (
                  <div key={product.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    opacity: isVisible ? 1 : 0.6,
                    display: 'grid',
                    gap: 12,
                  }}>
                    {/* Product header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {product.has_image && (
                          <img
                            src={`${apiBase()}/api/product-image?id=${product.id}&v=${product.image_version || 0}`}
                            alt=""
                            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{product.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {t('tenantAdmin.orderPage.productPrice')}: {fmtInput(product.product_price)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => patchEdit(product.id, { is_visible: !isVisible })}
                          style={{
                            height: 30, padding: '0 12px', fontSize: 12,
                            background: isVisible ? 'var(--primary)' : 'var(--btn-bg)',
                            color: isVisible ? '#fff' : 'var(--text)',
                            border: isVisible ? 'none' : '1px solid var(--border)',
                            borderRadius: 6,
                          }}
                        >
                          {isVisible ? t('tenantAdmin.orderPage.visible') : t('tenantAdmin.orderPage.hidden')}
                        </button>
                      </div>
                    </div>

                    {/* Override fields */}
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div className="row" style={{ gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 12 }}>{t('tenantAdmin.orderPage.overridePrice')}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={e.display_price != null ? e.display_price : ''}
                            onChange={ev => patchEdit(product.id, { display_price: ev.target.value === '' ? null : parseAmount(ev.target.value) })}
                            placeholder={fmtInput(product.product_price)}
                            style={{ marginTop: 4, maxWidth: 140 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12 }}>{t('tenantAdmin.orderPage.overrideQty')}</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={e.display_qty != null ? e.display_qty : ''}
                            onChange={ev => patchEdit(product.id, { display_qty: ev.target.value === '' ? null : Math.max(0, Math.floor(Number(ev.target.value))) })}
                            placeholder={t('tenantAdmin.orderPage.qtyPlaceholder')}
                            style={{ marginTop: 4, maxWidth: 100 }}
                          />
                        </div>
                      </div>

                      {/* Label section */}
                      <div style={{ display: 'grid', gap: 8 }}>
                        <label style={{ fontSize: 12 }}>{t('tenantAdmin.orderPage.label')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            value={e.label_text || ''}
                            onChange={ev => patchEdit(product.id, { label_text: ev.target.value })}
                            placeholder={t('tenantAdmin.orderPage.labelTextPlaceholder')}
                            style={{ maxWidth: 160 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('tenantAdmin.orderPage.labelOr')}</span>
                          {e.label_image_data ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <img src={e.label_image_data} alt="" style={{ height: 28, maxWidth: 80, objectFit: 'contain', borderRadius: 4 }} />
                              <button
                                onClick={() => { patchEdit(product.id, { label_image_data: '' }); if (imgInputRefs.current[product.id]) imgInputRefs.current[product.id]!.value = '' }}
                                style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                              >✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => imgInputRefs.current[product.id]?.click()}
                              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                            >
                              {t('tenantAdmin.orderPage.uploadLabelImage')}
                            </button>
                          )}
                          <input
                            ref={el => { imgInputRefs.current[product.id] = el }}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={ev => handleLabelImage(product.id, ev.target.files?.[0] || null)}
                          />
                        </div>
                        <p className="helper" style={{ margin: 0, fontSize: 11 }}>{t('tenantAdmin.orderPage.labelHelp')}</p>
                      </div>
                    </div>

                    {/* Save row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="primary"
                        onClick={() => saveProduct(product)}
                        disabled={savingProduct === product.id}
                        style={{ height: 32, padding: '0 20px', fontSize: 13 }}
                      >
                        {savingProduct === product.id ? t('saving') : t('save')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Order page set up ── */}
      {subTab === 'setup' && (
        <div style={{ maxWidth: 520 }}>

          {/* Slug */}
          <div style={{ marginBottom: 20 }}>
            <label>{t('tenantAdmin.orderPage.pageUrl')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 4 }}>
              <span style={{
                padding: '0 10px', height: 'var(--control-h)', display: 'flex', alignItems: 'center',
                fontSize: 14, color: 'var(--text-secondary)', background: 'var(--btn-bg)',
                border: '1px solid var(--border)', borderRight: 'none', borderRadius: '10px 0 0 10px',
                whiteSpace: 'nowrap',
              }}>
                /order/
              </span>
              <input
                value={config.slug}
                onChange={e => setConfig(c => ({ ...c, slug: sanitizeSlug(e.target.value) }))}
                placeholder="your-business-name"
                style={{ borderRadius: '0 10px 10px 0', flex: 1 }}
              />
            </div>
            {publicUrl && (
              <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('tenantAdmin.orderPage.yourOrderPage')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <a href={publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', wordBreak: 'break-all' }}>{publicUrl}</a>
                  <button onClick={copyUrl} style={{ height: 30, padding: '0 12px', fontSize: 12, flexShrink: 0 }}>
                    {copiedUrl ? t('tenantAdmin.booking.copied') : t('tenantAdmin.booking.copyUrl')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={config.is_active}
                onChange={e => setConfig(c => ({ ...c, is_active: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.active')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.activeHelp')}</p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '0 0 20px' }} />

          {/* Password protection */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={config.has_password || !!newPassword}
                onChange={e => {
                  if (!e.target.checked) {
                    setNewPassword('')
                    setConfig(c => ({ ...c, has_password: false }))
                  } else {
                    setShowPassword(true)
                  }
                }}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.loginProtected')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.loginProtectedHelp')}</p>

            {(config.has_password || showPassword) && (
              <div style={{ marginTop: 12, marginLeft: 28 }}>
                <label style={{ fontSize: 13 }}>
                  {config.has_password ? t('tenantAdmin.orderPage.changePassword') : t('tenantAdmin.orderPage.setPassword')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder={config.has_password ? t('tenantAdmin.orderPage.passwordPlaceholderChange') : t('tenantAdmin.orderPage.passwordPlaceholder')}
                  style={{ marginTop: 4, maxWidth: 280 }}
                  autoComplete="new-password"
                />
                {config.has_password && !newPassword && (
                  <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>{t('tenantAdmin.orderPage.passwordKeepExisting')}</p>
                )}
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 13 }}>{t('tenantAdmin.orderPage.autoLogoutMinutes')}</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={config.session_minutes}
                    onChange={e => setConfig(c => ({ ...c, session_minutes: Math.max(1, Number(e.target.value) || 60) }))}
                    style={{ marginTop: 4, maxWidth: 100 }}
                  />
                  <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>{t('tenantAdmin.orderPage.autoLogoutHelp')}</p>
                </div>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '0 0 20px' }} />

          {/* Geo location */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={geoEnabled}
                onChange={e => {
                  setGeoEnabled(e.target.checked)
                  if (!e.target.checked) setConfig(c => ({ ...c, geo_countries: [], geo_states: [] }))
                }}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.locationAccess')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.locationAccessHelp')}</p>

            {geoEnabled && (
              <div style={{ marginTop: 14, marginLeft: 28 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>{t('tenantAdmin.orderPage.allowedCountries')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 16px' }}>
                  {COUNTRIES.map(c => (
                    <label key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={config.geo_countries.includes(c.code)}
                        onChange={() => toggleCountry(c.code)}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>

                {config.geo_countries.includes('US') && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>
                      {t('tenantAdmin.orderPage.allowedStates')}
                      <span className="helper" style={{ fontWeight: 400, marginLeft: 8 }}>
                        ({t('tenantAdmin.orderPage.allowedStatesHelp')})
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 16px' }}>
                      {US_STATES.map(s => (
                        <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={config.geo_states.includes(s.code)}
                            onChange={() => toggleState(s.code)}
                            style={{ width: 15, height: 15, cursor: 'pointer' }}
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save */}
          <button
            className="primary"
            onClick={handleSaveConfig}
            disabled={savingConfig || !configLoaded}
            style={{ height: 'var(--control-h)', padding: '0 32px', marginTop: 4 }}
          >
            {savingConfig ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </div>
  )
}
