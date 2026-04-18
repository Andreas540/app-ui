// src/pages/MergeCustomer.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listCustomersWithOwed, fetchCustomerDetail, getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const BLV_TENANT_ID = 'c00e0058-3dec-4300-829d-cca7e3033ca6'

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

interface CustomerRow { id: string; name: string }

interface CustomerFields {
  name: string
  company_name: string
  phone: string
  email: string
  customer_type: string
  shipping_cost: string
  address1: string
  address2: string
  city: string
  state: string
  postal_code: string
  country: string
  sms_consent: boolean
}

const EMPTY: CustomerFields = {
  name: '', company_name: '', phone: '', email: '',
  customer_type: 'Direct', shipping_cost: '',
  address1: '', address2: '', city: '', state: '',
  postal_code: '', country: '', sms_consent: false,
}

export default function MergeCustomer() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { user } = useAuth()
  const isBLVTenant = user?.tenantId === BLV_TENANT_ID
  const directValue = isBLVTenant ? 'BLV' : 'Direct'
  const directLabel = isBLVTenant ? 'BLV' : 'Direct'

  const [customers, setCustomers]   = useState<CustomerRow[]>([])
  const [loading, setLoading]       = useState(true)

  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [dataA, setDataA] = useState<CustomerFields | null>(null)
  const [dataB, setDataB] = useState<CustomerFields | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)

  // Which customer's profile drives the editable fields ('A' | 'B' | null)
  const [source, setSource] = useState<'A' | 'B' | null>(null)

  // Editable merged fields
  const [fields, setFields] = useState<CustomerFields>(EMPTY)

  const [saving, setSaving] = useState(false)

  // Load customer list
  useEffect(() => {
    listCustomersWithOwed()
      .then(res => setCustomers(res.customers.map(c => ({ id: c.id, name: c.name }))))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Load detail for customer A
  useEffect(() => {
    if (!idA) { setDataA(null); return }
    setLoadingA(true)
    fetchCustomerDetail(idA)
      .then(res => setDataA(toFields(res.customer)))
      .catch(console.error)
      .finally(() => setLoadingA(false))
  }, [idA])

  // Load detail for customer B
  useEffect(() => {
    if (!idB) { setDataB(null); return }
    setLoadingB(true)
    fetchCustomerDetail(idB)
      .then(res => setDataB(toFields(res.customer)))
      .catch(console.error)
      .finally(() => setLoadingB(false))
  }, [idB])

  // When source radio changes, populate the editable fields
  useEffect(() => {
    if (source === 'A' && dataA) setFields({ ...dataA })
    if (source === 'B' && dataB) setFields({ ...dataB })
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof CustomerFields, v: string | boolean) {
    setFields(f => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!idA || !idB) { alert(t('customers.mergeSelectBoth')); return }
    if (!source)      { alert(t('customers.mergeSelectSource')); return }
    if (!fields.name.trim()) { alert(t('customers.alertNoName')); return }

    const winningId = source === 'A' ? idA : idB
    const losingId  = source === 'A' ? idB : idA

    if (!confirm(t('customers.mergeConfirm'))) return

    setSaving(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/merge-customer`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          winning_id: winningId,
          losing_id:  losingId,
          data: {
            ...fields,
            shipping_cost: fields.shipping_cost !== '' ? Number(fields.shipping_cost.replace(',', '.')) : null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Merge failed')
      nav(`/customers/${winningId}`)
    } catch (e: any) {
      alert(e?.message || 'Merge failed')
    } finally {
      setSaving(false)
    }
  }

  const bothSelected = !!idA && !!idB
  const showForm     = bothSelected && !!source

  return (
    <div className="card page-narrow">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t('customers.mergeTitle')}</h3>
        <button onClick={() => nav('/customers')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>
          {t('cancel')}
        </button>
      </div>

      {loading ? (
        <p>{t('loading')}</p>
      ) : (
        <>
          {/* Two customer selectors */}
          <div className="row row-2col-mobile" style={{ alignItems: 'flex-start' }}>

            {/* Customer A */}
            <div>
              <label>{t('customers.mergeCustomerA')}</label>
              <select
                value={idA}
                onChange={e => { setIdA(e.target.value); setSource(null) }}
              >
                <option value="">{t('customers.mergePick')}</option>
                {customers.filter(c => c.id !== idB).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {idA && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="radio"
                    name="source"
                    checked={source === 'A'}
                    onChange={() => setSource('A')}
                    disabled={!idB}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  {t('customers.mergeUseInfo')}
                  {loadingA && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> …</span>}
                </label>
              )}
            </div>

            {/* Customer B */}
            <div>
              <label>{t('customers.mergeCustomerB')}</label>
              <select
                value={idB}
                onChange={e => { setIdB(e.target.value); setSource(null) }}
              >
                <option value="">{t('customers.mergePick')}</option>
                {customers.filter(c => c.id !== idA).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {idB && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="radio"
                    name="source"
                    checked={source === 'B'}
                    onChange={() => setSource('B')}
                    disabled={!idA}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  {t('customers.mergeUseInfo')}
                  {loadingB && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> …</span>}
                </label>
              )}
            </div>
          </div>

          {/* Hint when both selected but no source yet */}
          {bothSelected && !source && (
            <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('customers.mergeSelectSource')}
            </p>
          )}

          {/* Editable merged fields */}
          {showForm && (
            <>
              <div style={{ borderTop: '1px solid var(--separator)', margin: '20px 0 16px' }} />
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('customers.mergeEditNote')}
              </p>

              {/* Name | Contact */}
              <div className="row row-2col-mobile">
                <div>
                  <label>{t('customers.customerName')}</label>
                  <input value={fields.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label>{t('customers.contact')}</label>
                  <input value={fields.company_name} onChange={e => set('company_name', e.target.value)} />
                </div>
              </div>

              {/* Type | Shipping */}
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('customers.customerType')}</label>
                  <select value={fields.customer_type} onChange={e => set('customer_type', e.target.value)}>
                    <option value={directValue}>{directLabel}</option>
                    <option value="Partner">Partner</option>
                  </select>
                </div>
                <div>
                  <label>{t('customers.shippingCost')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fields.shipping_cost}
                    onChange={e => set('shipping_cost', e.target.value)}
                  />
                </div>
              </div>

              {/* Phone | Email */}
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('phone')}</label>
                  <input type="tel" value={fields.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div>
                  <label>{t('email')}</label>
                  <input type="email" value={fields.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>

              {/* Address 1 | Address 2 */}
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('addressLine1')}</label>
                  <input value={fields.address1} onChange={e => set('address1', e.target.value)} />
                </div>
                <div>
                  <label>{t('addressLine2')}</label>
                  <input value={fields.address2} onChange={e => set('address2', e.target.value)} />
                </div>
              </div>

              {/* City | State */}
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('city')}</label>
                  <input value={fields.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div>
                  <label>{t('state')}</label>
                  <input value={fields.state} onChange={e => set('state', e.target.value)} />
                </div>
              </div>

              {/* Postal | Country */}
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('postalCode')}</label>
                  <input value={fields.postal_code} onChange={e => set('postal_code', e.target.value)} />
                </div>
                <div>
                  <label>{t('country')}</label>
                  <input value={fields.country} onChange={e => set('country', e.target.value)} />
                </div>
              </div>

              {/* SMS consent */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fields.sms_consent}
                  onChange={e => set('sms_consent', e.target.checked)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14 }}>{t('customers.smsConsent')}</span>
              </label>

              {/* Warning */}
              <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-error)' }}>
                {t('customers.mergeWarning')}
              </p>

              {/* Actions */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="primary" onClick={save} disabled={saving}>
                  {saving ? t('saving') : t('customers.mergeSave')}
                </button>
                <button onClick={() => nav('/customers')} disabled={saving}>
                  {t('cancel')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFields(c: Record<string, any>): CustomerFields {
  return {
    name:          c.name          || '',
    company_name:  c.company_name  || '',
    phone:         c.phone         || '',
    email:         c.email         || '',
    customer_type: c.customer_type || 'Direct',
    shipping_cost: c.shipping_cost != null ? String(c.shipping_cost) : '',
    address1:      c.address1      || '',
    address2:      c.address2      || '',
    city:          c.city          || '',
    state:         c.state         || '',
    postal_code:   c.postal_code   || '',
    country:       c.country       || '',
    sms_consent:   c.sms_consent   ?? false,
  }
}
