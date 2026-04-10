// src/pages/CreateCustomer.tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createCustomer, updateCustomer, type CustomerType } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

// The one tenant that still uses the legacy 'BLV' customer_type label
const BLV_TENANT_ID = 'c00e0058-3dec-4300-829d-cca7e3033ca6'

export default function CreateCustomer() {
  const { t, i18n } = useTranslation()
  const { t: ti } = useTranslation('info')
  const navigate = useNavigate()
  const { user } = useAuth()
  const tenantUi = getTenantConfig(user?.tenantId).ui

  // For the BLV tenant the "direct" type is stored as 'BLV'; everyone else uses 'Direct'.
  // Both values behave identically in all business logic — only the label/stored value differs.
  const isBLVTenant = user?.tenantId === BLV_TENANT_ID
  const directValue: CustomerType = isBLVTenant ? 'BLV' : 'Direct'
  const directLabel   = isBLVTenant ? 'BLV' : 'Direct'

  const [name, setName] = useState('')
  const [ctype, setCtype] = useState<CustomerType>(directValue)

  // Company name (DB column: company_name)
  const [companyName, setCompanyName] = useState('')

  // Shipping UI state
  type ShipMode = 'preset' | 'custom'
  const [shipMode, setShipMode] = useState<ShipMode>('preset')
  const [shipPreset, setShipPreset] = useState<'0' | '0.35'>('0')
  const [shipCustom, setShipCustom] = useState('') // only used in custom mode
  const customInputRef = useRef<HTMLInputElement>(null)

  // Contact/address
  const [phone, setPhone] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postal, setPostal] = useState('')
  const [country, setCountry] = useState('')

  const CONTROL_H = 44

  // Info overlay
  const [showInfo, setShowInfo] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showInfo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowInfo(false) }
    const onDown = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [showInfo])

  // Ask customer for information
  const [showAskCustomer, setShowAskCustomer] = useState(false)
  const [generatingLink, setGeneratingLink]   = useState(false)
  const [customerLink, setCustomerLink]       = useState<string | null>(null)
  const [sharedCustomerId, setSharedCustomerId]     = useState<string | null>(null)
  const [sharedCustomerName, setSharedCustomerName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  async function generateLink() {
    setGeneratingLink(true)
    try {
      const { getAuthHeaders } = await import('../lib/api')
      const res = await fetch(`${base}/api/customer-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          name:          name.trim() || undefined,
          company_name:  companyName.trim() || undefined,
          customer_type: ctype,
          shipping_cost: resolvedShipping() || 0,
          phone:    phone.trim()    || undefined,
          address1: address1.trim() || undefined,
          address2: address2.trim() || undefined,
          city:     city.trim()     || undefined,
          state:    state.trim()    || undefined,
          postal_code: postal.trim()  || undefined,
          country:  country.trim()  || undefined,
          lang: i18n.language.startsWith('sv') ? 'sv' : i18n.language.startsWith('es') ? 'es' : 'en',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setCustomerLink(data.url)
      setSharedCustomerId(data.customer_id)
      setSharedCustomerName(data.name)
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    } finally {
      setGeneratingLink(false)
    }
  }

  async function copyLink() {
    if (!customerLink) return
    await navigator.clipboard.writeText(customerLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function resolvedShipping(): number {
    if (shipMode === 'preset') return parseFloat(shipPreset)
    const n = Number(shipCustom.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }

  async function save() {
    if (!name.trim()) { alert(t('customers.alertNoName')); return }
    const ship = resolvedShipping()
    if (!Number.isFinite(ship)) { alert(t('customers.alertInvalidShipping')); return }

    const payload = {
      name: name.trim(),
      customer_type: ctype,
      shipping_cost: ship,
      company_name: companyName.trim() || undefined,
      phone: phone.trim() || undefined,
      address1: address1.trim() || undefined,
      address2: address2.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      postal_code: postal.trim() || undefined,
      country: country.trim() || undefined,
    }

    try {
      if (sharedCustomerId) {
        await updateCustomer({ id: sharedCustomerId, ...payload })
      } else {
        await createCustomer(payload)
      }
      alert(t('customers.created'))
      navigate('/customers')
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  return (
    <div className="card" style={{maxWidth: 900, position: 'relative'}}>

      {/* Info overlay */}
      {showInfo && (
        <div
          ref={overlayRef}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: 'var(--card, #fff)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '16px 20px', zIndex: 200,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ti('createCustomer.title')}</div>
            <button
              onClick={() => setShowInfo(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['p1','p2','p3','p3note','p4','p5'] as const).map(k => (
              <p key={k} style={{ margin: 0, fontStyle: k === 'p3note' ? 'italic' : 'normal' }}>{ti(`createCustomer.${k}`)}</p>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{t('customers.createTitle')}</h3>
        {tenantUi.showInfoIconsPages && (
          <button
            onClick={() => setShowInfo(v => !v)}
            style={{
              width: 20, height: 20, padding: 0, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', cursor: 'pointer',
              background: 'var(--border, rgba(0,0,0,0.08))',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >i</button>
        )}
      </div>

      {/* Ask customer for information */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowAskCustomer(v => !v)}
          className="helper"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
        >
          {t('customers.askCustomerForInfo')}
        </button>

        {showAskCustomer && (
          <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
            <p style={{ margin: '0 0 4px' }}>{t('customers.askCustomerLine1')}</p>
            <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>{t('customers.askCustomerLine2')}</p>
            <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{t('customers.askCustomerLine3')}</p>

            {!customerLink ? (
              <button
                type="button"
                onClick={generateLink}
                disabled={generatingLink}
                style={{ height: 36, padding: '0 16px', fontSize: 13 }}
              >
                {generatingLink ? t('customers.generating') : t('customers.shareLink')}
              </button>
            ) : (
              <div>
                <p style={{ margin: '0 0 6px', fontWeight: 500 }}>{t('customers.linkReady')}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    readOnly
                    value={customerLink}
                    style={{ flex: 1, minWidth: 0, height: 36, fontSize: 12, padding: '0 8px' }}
                    onFocus={e => e.target.select()}
                  />
                  <button type="button" onClick={copyLink} style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
                    {copied ? t('customers.copied') : t('customers.copyLink')}
                  </button>
                </div>
                {sharedCustomerName && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t('customers.linkCreatedInfo', { name: sharedCustomerName })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('customers.customerName')}</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label>{t('customers.customerType')}</label>
          <select value={ctype} onChange={e=>setCtype(e.target.value as CustomerType)}>
            <option value={directValue}>{directLabel}</option>
            <option value="Partner">Partner</option>
          </select>
        </div>
      </div>

      {/* Shipping Cost */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('customers.shippingCost')}</label>

          {shipMode === 'preset' ? (
            <select
              value={shipPreset}
              onChange={e => {
                const v = e.target.value
                if (v === 'custom') {
                  setShipMode('custom')
                  setTimeout(() => customInputRef.current?.focus(), 0)
                } else {
                  setShipPreset(v as '0' | '0.35')
                }
              }}
              style={{ height: CONTROL_H }}
            >
              <option value="0">0</option>
              <option value="0.35">0.35</option>
              <option value="custom">{t('customers.customShipping')}</option>
            </select>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              <input
                ref={customInputRef}
                type="text"
                inputMode="decimal"
                placeholder={t('customers.customShippingPlaceholder')}
                value={shipCustom}
                onChange={e=>setShipCustom(e.target.value)}
                style={{ height: CONTROL_H, flex:1 }}
              />
              <button
                type="button"
                onClick={() => { setShipMode('preset'); setShipCustom('') }}
                style={{ height: CONTROL_H }}
              >
                {t('customers.presets')}
              </button>
            </div>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
            {ti('createCustomer.shippingComingSoon')}
          </p>
        </div>
      </div>

      {/* Row 1: Contact | Phone */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('customers.contact')}</label>
          <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} />
        </div>
        <div>
          <label>{t('phone')}</label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} />
        </div>
      </div>

      {/* Row 2: Address line 1 | Address line 2 */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('addressLine1')}</label>
          <input type="text" value={address1} onChange={e=>setAddress1(e.target.value)} />
        </div>
        <div>
          <label>{t('addressLine2')}</label>
          <input type="text" value={address2} onChange={e=>setAddress2(e.target.value)} />
        </div>
      </div>

      {/* Row 3: City | State */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('city')}</label>
          <input type="text" value={city} onChange={e=>setCity(e.target.value)} />
        </div>
        <div>
          <label>{t('state')}</label>
          <input type="text" value={state} onChange={e=>setState(e.target.value)} />
        </div>
      </div>

      {/* Row 4: Postal code | Country */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('zip')}</label>
          <input type="text" value={postal} onChange={e=>setPostal(e.target.value)} />
        </div>
        <div>
          <label>{t('country')}</label>
          <input type="text" value={country} onChange={e=>setCountry(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop:16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>{t('save')}</button>
        <button onClick={()=>history.back()} style={{ height: CONTROL_H }}>{t('cancel')}</button>
      </div>
    </div>
  )
}

