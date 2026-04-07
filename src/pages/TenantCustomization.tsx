// src/pages/TenantCustomization.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAuthHeaders,
  PAYMENT_TYPES, PAYMENT_TYPES_COP,
  PARTNER_PAYMENT_TYPES, PARTNER_PAYMENT_TYPES_COP,
  SUPPLIER_PAYMENT_TYPES, SUPPLIER_PAYMENT_TYPES_COP,
} from '../lib/api'
import { defaultConfig } from '../lib/tenantConfig'

const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const H = 40 // control height

type Section = 'terminology' | 'payments' | 'booking' | 'orders'

type UiConfig = {
  payments?: {
    showOrderSelection?: boolean
    visibleCustomerPaymentTypes?: string[] | null
    visiblePartnerPaymentTypes?: string[] | null
    visibleSupplierPaymentTypes?: string[] | null
    showPartnerTransfer?: boolean
  }
  labels?: {
    customer?: string; customers?: string
    order?: string; orders?: string
    directLabel?: string
    directCustomerGroup?: string
  }
  ui?: { showCostEffectiveness?: boolean; requiresApproval?: boolean; showOrderNumberInList?: boolean }
  booking?: {
    serviceTypeLabel?: string; bookingProviderName?: string
    smsRemindersEnabled?: boolean; showBookingParticipants?: boolean
  }
}

interface Tenant { id: string; name: string; default_currency?: string | null }

// ── Stable sub-components (defined at module level to avoid remount on render) ─

function Badge({ customized }: { customized: boolean }) {
  const { t } = useTranslation()
  if (!customized) return null
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent, #5b8dee)', color: '#fff', marginLeft: 8, verticalAlign: 'middle' }}>
      {t('tenantCustom.customized')}
    </span>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button className={value ? 'primary' : ''} onClick={() => onChange(true)}
        style={{ height: H, padding: '0 18px', fontSize: 13 }}>
        {t('tenantCustom.on')}
      </button>
      <button className={!value ? 'primary' : ''} onClick={() => onChange(false)}
        style={{ height: H, padding: '0 18px', fontSize: 13 }}>
        {t('tenantCustom.off')}
      </button>
    </div>
  )
}

function CheckboxDropdown({ label, allTypes, visible, onChange }: {
  label: string
  allTypes: string[]
  visible: string[] | null
  onChange: (v: string[] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const visibleSet = visible ? new Set(visible) : new Set(allTypes)
  const checkedCount = allTypes.filter(t => visibleSet.has(t)).length
  const allChecked = checkedCount === allTypes.length

  function toggle(type: string) {
    const next = new Set(visibleSet)
    next.has(type) ? next.delete(type) : next.add(type)
    onChange(next.size === allTypes.length ? null : [...next])
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', height: H, padding: '0 12px',
          border: '1px solid var(--line)', borderRadius: 6,
          background: 'var(--bg, #fff)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
        }}
      >
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="helper" style={{ fontSize: 12 }}>
            {allChecked ? 'All' : `${checkedCount}/${allTypes.length}`}
          </span>
          <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div style={{
          marginTop: 4, padding: '8px 12px',
          border: '1px solid var(--line)', borderRadius: 6,
          background: 'var(--bg, #fff)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {allTypes.map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '3px 0', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={visibleSet.has(type)}
                style={{ width: 14, height: 14, margin: 0, cursor: 'pointer', flexShrink: 0 }}
                onChange={() => toggle(type)}
              />
              {type}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, help, customized, children }: { label: string; help?: string; customized: boolean; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
        {label}
        <Badge customized={customized} />
      </div>
      {help && <div className="helper" style={{ marginTop: 2, marginBottom: 8, fontSize: 12 }}>{help}</div>}
      <div>{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TenantCustomization() {
  const { t } = useTranslation()

  const [tenants, setTenants]   = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [section, setSection]   = useState<Section>('terminology')
  const [cfg, setCfg]           = useState<UiConfig>({})
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')

  useEffect(() => { loadTenants() }, [])
  useEffect(() => { if (tenantId) loadCfg(tenantId) }, [tenantId])

  async function loadTenants() {
    try {
      const res = await fetch(`${base}/api/super-admin?action=listTenants`, { headers: getAuthHeaders() })
      const data = await res.json()
      setTenants(data.tenants || [])
    } catch { /* ignore */ }
  }

  async function loadCfg(id: string) {
    setLoading(true)
    setCfg({})
    try {
      const res = await fetch(`${base}/api/super-admin?action=getUiConfig&tenantId=${id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setCfg(data.uiConfig || {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function save() {
    if (!tenantId) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateUiConfig', tenantId, uiConfig: cfg }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setSaveMsg(t('tenantCustom.saved'))
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  // ── Setters ────────────────────────────────────────────────────────────────

  function setLabel(key: keyof NonNullable<UiConfig['labels']>, val: string) {
    setCfg(p => ({ ...p, labels: { ...p.labels, [key]: val || undefined } }))
  }
  function setPayment(key: 'showOrderSelection' | 'showPartnerTransfer', val: boolean) {
    setCfg(p => ({ ...p, payments: { ...p.payments, [key]: val } }))
  }
  function setVisibleTypes(key: 'visibleCustomerPaymentTypes' | 'visiblePartnerPaymentTypes' | 'visibleSupplierPaymentTypes', val: string[] | null) {
    setCfg(p => ({ ...p, payments: { ...p.payments, [key]: val } }))
  }
  function setUi(key: keyof NonNullable<UiConfig['ui']>, val: boolean) {
    setCfg(p => ({ ...p, ui: { ...p.ui, [key]: val } }))
  }
  function setBookingBool(key: 'smsRemindersEnabled' | 'showBookingParticipants', val: boolean) {
    setCfg(p => ({ ...p, booking: { ...p.booking, [key]: val } }))
  }
  function setBookingText(key: 'serviceTypeLabel' | 'bookingProviderName', val: string) {
    setCfg(p => ({ ...p, booking: { ...p.booking, [key]: val || undefined } }))
  }

  function resetSection() {
    if (section === 'terminology') {
      setCfg(p => { const next = { ...p }; delete next.labels; return next })
    } else if (section === 'payments') {
      setCfg(p => { const next = { ...p }; delete next.payments; return next })
    } else if (section === 'booking') {
      setCfg(p => { const next = { ...p }; delete next.booking; return next })
    } else if (section === 'orders') {
      setCfg(p => {
        const ui = { ...p.ui }
        delete ui.showOrderNumberInList
        return { ...p, ui }
      })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tenantName = tenants.find(ten => ten.id === tenantId)?.name
  const dl = defaultConfig.labels
  const dp = defaultConfig.payments
  const du = defaultConfig.ui
  const db = defaultConfig.booking
  const cl = cfg.labels || {}
  const cp = cfg.payments || {}
  const cu = cfg.ui || {}
  const cb = cfg.booking || {}

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>{t('tenantCustom.title')}</h2>

      {/* Tenant selector */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 500 }}>{t('tenantCustom.selectTenant')}</label>
        <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ height: H, minWidth: 200 }}>
          <option value="">{t('tenantCustom.chooseTenant')}</option>
          {tenants.map(ten => <option key={ten.id} value={ten.id}>{ten.name}</option>)}
        </select>
      </div>

      {!tenantId && (
        <div className="card" style={{ color: 'var(--text-secondary)', padding: 32, textAlign: 'center' }}>
          {t('tenantCustom.noTenantSelected')}
        </div>
      )}

      {tenantId && loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {t('loadingDots')}
        </div>
      )}

      {tenantId && !loading && (
        <div className="card">

          {/* Section selector */}
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 500, fontSize: 14 }}>{t('tenantCustom.section')}</label>
            <select value={section} onChange={e => setSection(e.target.value as Section)} style={{ height: H, minWidth: 220 }}>
              <optgroup label={t('tenantCustom.groupGlobal')}>
                <option value="terminology">{t('tenantCustom.sectionTerminology')}</option>
              </optgroup>
              <optgroup label={t('tenantCustom.groupModules')}>
                <option value="payments">{t('tenantCustom.sectionPayments')}</option>
                <option value="booking">{t('tenantCustom.sectionBooking')}</option>
              </optgroup>
              <optgroup label={t('tenantCustom.groupPages')}>
                <option value="orders">{t('tenantCustom.sectionOrders')}</option>
              </optgroup>
            </select>
          </div>

          <p className="helper" style={{ marginBottom: 16 }}>
            {t('tenantCustom.editingFor', { tenant: tenantName })}
          </p>

          {/* Global > Terminology
              directLabel = short label on filter buttons (Customers page)
              directCustomerGroup = full group header in dropdowns (Payments page)
              customer/customers/order/orders exist in config but have no rendering yet */}
          {section === 'terminology' && (
            <>
              <Row label={t('tenantCustom.directLabel')} help={t('tenantCustom.directLabelHelp')}
                customized={cl.directLabel !== undefined && cl.directLabel !== dl.directLabel}>
                <input value={cl.directLabel ?? dl.directLabel}
                  onChange={e => setLabel('directLabel', e.target.value)}
                  placeholder={dl.directLabel} style={{ height: H, width: 220 }} />
              </Row>
              <Row label={t('tenantCustom.customerGroupLabel')} help={t('tenantCustom.customerGroupLabelHelp')}
                customized={cl.directCustomerGroup !== undefined && cl.directCustomerGroup !== dl.directCustomerGroup}>
                <input value={cl.directCustomerGroup ?? dl.directCustomerGroup}
                  onChange={e => setLabel('directCustomerGroup', e.target.value)}
                  placeholder={dl.directCustomerGroup} style={{ height: H, width: 220 }} />
              </Row>
            </>
          )}

          {/* Modules > Payments */}
          {section === 'payments' && (
            <>
              <Row label={t('tenantCustom.showOrderSelection')} help={t('tenantCustom.showOrderSelectionHelp')}
                customized={cp.showOrderSelection !== undefined && cp.showOrderSelection !== dp.showOrderSelection}>
                <Toggle value={cp.showOrderSelection ?? dp.showOrderSelection} onChange={v => setPayment('showOrderSelection', v)} />
              </Row>
              {(() => {
                const isCOP = (tenants.find(t => t.id === tenantId)?.default_currency || 'USD') === 'COP'
                const customerTypes = (isCOP ? PAYMENT_TYPES_COP : PAYMENT_TYPES) as string[]
                const partnerTypes  = (isCOP ? PARTNER_PAYMENT_TYPES_COP : PARTNER_PAYMENT_TYPES) as string[]
                const supplierTypes = (isCOP ? SUPPLIER_PAYMENT_TYPES_COP : SUPPLIER_PAYMENT_TYPES) as string[]
                const customized = cp.visibleCustomerPaymentTypes != null || cp.visiblePartnerPaymentTypes != null || cp.visibleSupplierPaymentTypes != null
                return (
                  <Row label={t('tenantCustom.visiblePaymentTypes')} help={t('tenantCustom.visiblePaymentTypesHelp')} customized={customized}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <CheckboxDropdown label="From customer" allTypes={customerTypes}
                        visible={cp.visibleCustomerPaymentTypes ?? null}
                        onChange={v => setVisibleTypes('visibleCustomerPaymentTypes', v)} />
                      <CheckboxDropdown label="To partner" allTypes={partnerTypes}
                        visible={cp.visiblePartnerPaymentTypes ?? null}
                        onChange={v => setVisibleTypes('visiblePartnerPaymentTypes', v)} />
                      <CheckboxDropdown label="To supplier" allTypes={supplierTypes}
                        visible={cp.visibleSupplierPaymentTypes ?? null}
                        onChange={v => setVisibleTypes('visibleSupplierPaymentTypes', v)} />
                    </div>
                  </Row>
                )
              })()}
              <Row label={t('tenantCustom.showPartnerTransfer')} help={t('tenantCustom.showPartnerTransferHelp')}
                customized={cp.showPartnerTransfer !== undefined && cp.showPartnerTransfer !== dp.showPartnerTransfer}>
                <Toggle value={cp.showPartnerTransfer ?? dp.showPartnerTransfer} onChange={v => setPayment('showPartnerTransfer', v)} />
              </Row>
            </>
          )}

          {/* Modules > Booking */}
          {section === 'booking' && (
            <>
              <Row label={t('tenantCustom.serviceTypeLabel')} help={t('tenantCustom.serviceTypeLabelHelp')}
                customized={cb.serviceTypeLabel !== undefined && cb.serviceTypeLabel !== db.serviceTypeLabel}>
                <input value={cb.serviceTypeLabel ?? db.serviceTypeLabel}
                  onChange={e => setBookingText('serviceTypeLabel', e.target.value)}
                  placeholder={db.serviceTypeLabel} style={{ height: H, width: 220 }} />
              </Row>
              <Row label={t('tenantCustom.bookingProviderName')} help={t('tenantCustom.bookingProviderNameHelp')}
                customized={cb.bookingProviderName !== undefined && cb.bookingProviderName !== db.bookingProviderName}>
                <input value={cb.bookingProviderName ?? db.bookingProviderName}
                  onChange={e => setBookingText('bookingProviderName', e.target.value)}
                  placeholder={db.bookingProviderName || t('tenantCustom.bookingProviderNamePlaceholder')}
                  style={{ height: H, width: 220 }} />
              </Row>
              <Row label={t('tenantCustom.smsRemindersEnabled')}
                customized={cb.smsRemindersEnabled !== undefined && cb.smsRemindersEnabled !== db.smsRemindersEnabled}>
                <Toggle value={cb.smsRemindersEnabled ?? db.smsRemindersEnabled} onChange={v => setBookingBool('smsRemindersEnabled', v)} />
              </Row>
              <Row label={t('tenantCustom.showBookingParticipants')} help={t('tenantCustom.showBookingParticipantsHelp')}
                customized={cb.showBookingParticipants !== undefined && cb.showBookingParticipants !== db.showBookingParticipants}>
                <Toggle value={cb.showBookingParticipants ?? db.showBookingParticipants} onChange={v => setBookingBool('showBookingParticipants', v)} />
              </Row>
            </>
          )}

          {/* Pages > Orders */}
          {section === 'orders' && (
            <Row label={t('tenantCustom.showOrderNumber')} help={t('tenantCustom.showOrderNumberHelp')}
              customized={cu.showOrderNumberInList !== undefined && cu.showOrderNumberInList !== du.showOrderNumberInList}>
              <Toggle value={cu.showOrderNumberInList ?? du.showOrderNumberInList} onChange={v => setUi('showOrderNumberInList', v)} />
            </Row>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button className="primary" onClick={save} disabled={saving}
              style={{ height: H, padding: '0 28px' }}>
              {saving ? t('saving') : t('save')}
            </button>
            <button onClick={resetSection} style={{ height: H, padding: '0 20px' }}>
              {t('tenantCustom.resetSection')}
            </button>
            {saveMsg && <span style={{ color: 'var(--success, #4caf50)', fontSize: 14 }}>{saveMsg}</span>}
          </div>

        </div>
      )}
    </div>
  )
}
