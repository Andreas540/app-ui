// src/pages/CreateCustomer.tsx
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createCustomer, type CustomerType } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// The one tenant that still uses the legacy 'BLV' customer_type label
const BLV_TENANT_ID = 'c00e0058-3dec-4300-829d-cca7e3033ca6'

export default function CreateCustomer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

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

  function resolvedShipping(): number {
    if (shipMode === 'preset') return parseFloat(shipPreset)
    const n = Number(shipCustom.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }

  async function save() {
    if (!name.trim()) { alert(t('customers.alertNoName')); return }
    const ship = resolvedShipping()
    if (!Number.isFinite(ship)) { alert(t('customers.alertInvalidShipping')); return }

    try {
      await createCustomer({
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
      })
      alert(t('customers.created'))
      navigate('/customers')
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  return (
    <div className="card" style={{maxWidth: 900}}>
      <h3>{t('customers.createTitle')}</h3>

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

