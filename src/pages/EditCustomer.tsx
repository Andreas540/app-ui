// src/pages/EditCustomer.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchCustomerDetail, updateCustomer, type CustomerType } from '../lib/api'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import { useAuth } from '../contexts/AuthContext'

const BLV_TENANT_ID = 'c00e0058-3dec-4300-829d-cca7e3033ca6'

export default function EditCustomer() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { user } = useAuth()

  const isBLVTenant = user?.tenantId === BLV_TENANT_ID
  const directValue: CustomerType = isBLVTenant ? 'BLV' : 'Direct'
  const directLabel  = isBLVTenant ? 'BLV' : 'Direct'

  const [loading, setLoading]       = useState(true)
  const [showAskCustomer, setShowAskCustomer] = useState(false)
  const [generatingLink, setGeneratingLink]   = useState(false)
  const [customerLink, setCustomerLink]       = useState<string | null>(null)
  const [copied, setCopied]                   = useState(false)

  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  async function generateLink() {
    if (!id) return
    setGeneratingLink(true)
    try {
      const { getAuthHeaders } = await import('../lib/api')
      const res = await fetch(`${base}/api/customer-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_id: id,
          lang: i18n.language.startsWith('sv') ? 'sv' : i18n.language.startsWith('es') ? 'es' : 'en',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setCustomerLink(data.url)
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
  const [err, setErr] = useState<string | null>(null)

  // form state
  const [name, setName] = useState('')
  const [customerType, setCustomerType] = useState<CustomerType>(directValue)
  const [shippingCost, setShippingCost] = useState<string>('')
  const [costOption, setCostOption] = useState<'history' | 'next' | 'specific'>('next')
  const [specificDate, setSpecificDate] = useState<string>(todayYMD())
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [smsConsent, setSmsConsent] = useState(true)
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postal, setPostal] = useState('')
  const [country, setCountry] = useState('')

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchCustomerDetail(id)
        const c = d.customer
        setName(c.name || '')
        const loaded = c.customer_type as CustomerType
setCustomerType(
  (loaded === 'BLV' || loaded === 'Direct') ? directValue : (loaded || directValue)
)
        setShippingCost(c.shipping_cost != null ? String(c.shipping_cost) : '')
        setCompanyName(c.company_name || '')
        setPhone(c.phone || '')
        setEmail(c.email || '')
        setSmsConsent(c.sms_consent ?? true)
        setAddress1(c.address1 || '')
        setAddress2(c.address2 || '')
        setCity(c.city || '')
        setState(c.state || '')
        setPostal(c.postal_code || '')
        setCountry(c.country || '')
        setCostOption('next')
        setSpecificDate(todayYMD())
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function save() {
    if (!id) return
    if (!name.trim()) { alert(t('customers.alertNameRequired')); return }

    const sc = shippingCost.trim() === '' ? null : Number(shippingCost.replace(',', '.'))
    if (sc != null && !Number.isFinite(sc)) { alert(t('customers.alertShippingNumber')); return }

    if (costOption === 'specific' && !specificDate) {
      alert(t('products.alertSelectDate'))
      return
    }

    try {
      await updateCustomer({
        id,
        name: name.trim(),
        customer_type: customerType,
        shipping_cost: sc,
        apply_to_history: costOption === 'history',
        effective_date: costOption === 'specific' ? specificDate : undefined,
        company_name: companyName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        sms_consent: smsConsent,
        address1: address1.trim() || null,
        address2: address2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postal_code: postal.trim() || null,
        country: country.trim() || null,
      })
      nav(`/customers/${id}`)
    } catch (e:any) {
      alert(e?.message || t('customers.failedUpdate'))
    }
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{color:'var(--color-error)'}}>{t('error')} {err}</p></div>

  return (
    <div className="card page-normal">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>{t('customers.editTitle')}</h3>
        <Link to={id ? `/customers/${id}` : '/customers'} className="helper">{t('cancel')}</Link>
      </div>

      {/* Ask customer to add missing information */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowAskCustomer(v => !v)}
          className="helper"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
        >
          {t('customers.askCustomerToUpdate')}
        </button>

        {showAskCustomer && (
          <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer Name | Contact */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('customers.customerName')}</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder={t('fullNamePlaceholder')} />
        </div>
        <div>
          <label>{t('customers.contact')}</label>
          <input value={companyName} onChange={e=>setCompanyName(e.target.value)} />
        </div>
      </div>

      {/* Shipping cost | Customer Type */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('customers.shippingCost')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder={t('customers.shippingCostPlaceholder')}
            value={shippingCost}
            onChange={e=>setShippingCost(e.target.value)}
          />
        </div>
        <div>
          <label>{t('customers.customerType')}</label>
          <select value={customerType} onChange={e=>setCustomerType(e.target.value as CustomerType)}>
            <option value={directValue}>{directLabel}</option>
            <option value="Partner">Partner</option>
          </select>
        </div>
      </div>

      {/* Cost application options */}
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'history'}
            onChange={() => setCostOption('history')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('customers.applyCostToHistory')}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'next'}
            onChange={() => setCostOption('next')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('customers.applyCostFromNextOrder')}</span>
        </label>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="costOption"
              checked={costOption === 'specific'}
              onChange={() => setCostOption('specific')}
              style={{ width: 18, height: 18 }}
            />
            <span>{t('customers.applyCostFromSpecificDate')}</span>
          </label>
          
          {costOption === 'specific' && (
            <div style={{ marginTop: 8, marginLeft: 28 }}>
              <DateInput
                value={specificDate}
                onChange={v => setSpecificDate(v)}
                style={{ width: '100%', maxWidth: 200 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Row: Phone | Email */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('phone')}</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 555-123-4567" />
        </div>
        <div>
          <label>{t('email')}</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
      </div>

      {/* Row 2: Address line 1 | Address line 2 */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('addressLine1')}</label>
          <input value={address1} onChange={e=>setAddress1(e.target.value)} />
        </div>
        <div>
          <label>{t('addressLine2')}</label>
          <input value={address2} onChange={e=>setAddress2(e.target.value)} />
        </div>
      </div>

      {/* Row 3: City | State */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('city')}</label>
          <input value={city} onChange={e=>setCity(e.target.value)} />
        </div>
        <div>
          <label>{t('state')}</label>
          <input value={state} onChange={e=>setState(e.target.value)} />
        </div>
      </div>

      {/* Row 4: Postal code | Country */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('postalCode')}</label>
          <input value={postal} onChange={e=>setPostal(e.target.value)} />
        </div>
        <div>
          <label>{t('country')}</label>
          <input value={country} onChange={e=>setCountry(e.target.value)} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={smsConsent}
          onChange={e => setSmsConsent(e.target.checked)}
          style={{ width: 16, height: 16, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14 }}>{t('customers.smsConsent')}</span>
      </label>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save}>{t('saveChanges')}</button>
        <Link to={id ? `/customers/${id}` : '/customers'} style={{ alignSelf:'center' }} className="helper">{t('cancel')}</Link>
      </div>
    </div>
  )
}

