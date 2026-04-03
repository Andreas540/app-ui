// src/pages/TenantCustomization.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { defaultConfig } from '../lib/tenantConfig'

const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type Section = 'terminology' | 'payments' | 'booking' | 'orders'

type UiConfig = {
  payments?: { showOrderSelection?: boolean; showAdvancePayment?: boolean }
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

interface Tenant { id: string; name: string }

export default function TenantCustomization() {
  const { t } = useTranslation()

  const [tenants, setTenants]       = useState<Tenant[]>([])
  const [tenantId, setTenantId]     = useState('')
  const [section, setSection]       = useState<Section>('terminology')
  const [cfg, setCfg]               = useState<UiConfig>({})
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setLabel(key: keyof NonNullable<UiConfig['labels']>, val: string) {
    setCfg(p => ({ ...p, labels: { ...p.labels, [key]: val || undefined } }))
  }
  function setPayment(key: keyof NonNullable<UiConfig['payments']>, val: boolean) {
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

  // ── Sub-components ─────────────────────────────────────────────────────────

  const H = 40 // control height

  function Badge({ customized }: { customized: boolean }) {
    if (!customized) return null
    return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent, #5b8dee)', color: '#fff', marginLeft: 8, verticalAlign: 'middle' }}>
        {t('tenantCustom.customized')}
      </span>
    )
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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

  // ── Sections ───────────────────────────────────────────────────────────────

  // Global > Terminology
  // directLabel = short label on filter buttons (Customers page)
  // directCustomerGroup = full group header in dropdowns (Payments page)
  // customer/customers/order/orders exist in config but have no rendering yet
  function TerminologySection() {
    const d = defaultConfig.labels
    const c = cfg.labels || {}
    return (
      <>
        <Row label={t('tenantCustom.directLabel')} help={t('tenantCustom.directLabelHelp')}
          customized={c.directLabel !== undefined && c.directLabel !== d.directLabel}>
          <input value={c.directLabel ?? d.directLabel}
            onChange={e => setLabel('directLabel', e.target.value)}
            placeholder={d.directLabel} style={{ height: H, width: 220 }} />
        </Row>
        <Row label={t('tenantCustom.customerGroupLabel')} help={t('tenantCustom.customerGroupLabelHelp')}
          customized={c.directCustomerGroup !== undefined && c.directCustomerGroup !== d.directCustomerGroup}>
          <input value={c.directCustomerGroup ?? d.directCustomerGroup}
            onChange={e => setLabel('directCustomerGroup', e.target.value)}
            placeholder={d.directCustomerGroup} style={{ height: H, width: 220 }} />
        </Row>
      </>
    )
  }

  // Modules > Payments
  function PaymentsSection() {
    const d = defaultConfig.payments
    const c = cfg.payments || {}
    return (
      <>
        <Row label={t('tenantCustom.showOrderSelection')} help={t('tenantCustom.showOrderSelectionHelp')}
          customized={c.showOrderSelection !== undefined && c.showOrderSelection !== d.showOrderSelection}>
          <Toggle value={c.showOrderSelection ?? d.showOrderSelection} onChange={v => setPayment('showOrderSelection', v)} />
        </Row>
        <Row label={t('tenantCustom.showAdvancePayment')} help={t('tenantCustom.showAdvancePaymentHelp')}
          customized={c.showAdvancePayment !== undefined && c.showAdvancePayment !== d.showAdvancePayment}>
          <Toggle value={c.showAdvancePayment ?? d.showAdvancePayment} onChange={v => setPayment('showAdvancePayment', v)} />
        </Row>
      </>
    )
  }

  // Modules > Booking
  function BookingSection() {
    const d = defaultConfig.booking
    const c = cfg.booking || {}
    return (
      <>
        <Row label={t('tenantCustom.serviceTypeLabel')} help={t('tenantCustom.serviceTypeLabelHelp')}
          customized={c.serviceTypeLabel !== undefined && c.serviceTypeLabel !== d.serviceTypeLabel}>
          <input value={c.serviceTypeLabel ?? d.serviceTypeLabel}
            onChange={e => setBookingText('serviceTypeLabel', e.target.value)}
            placeholder={d.serviceTypeLabel} style={{ height: H, width: 220 }} />
        </Row>
        <Row label={t('tenantCustom.bookingProviderName')} help={t('tenantCustom.bookingProviderNameHelp')}
          customized={c.bookingProviderName !== undefined && c.bookingProviderName !== d.bookingProviderName}>
          <input value={c.bookingProviderName ?? d.bookingProviderName}
            onChange={e => setBookingText('bookingProviderName', e.target.value)}
            placeholder={d.bookingProviderName || t('tenantCustom.bookingProviderNamePlaceholder')}
            style={{ height: H, width: 220 }} />
        </Row>
        <Row label={t('tenantCustom.smsRemindersEnabled')}
          customized={c.smsRemindersEnabled !== undefined && c.smsRemindersEnabled !== d.smsRemindersEnabled}>
          <Toggle value={c.smsRemindersEnabled ?? d.smsRemindersEnabled} onChange={v => setBookingBool('smsRemindersEnabled', v)} />
        </Row>
        <Row label={t('tenantCustom.showBookingParticipants')} help={t('tenantCustom.showBookingParticipantsHelp')}
          customized={c.showBookingParticipants !== undefined && c.showBookingParticipants !== d.showBookingParticipants}>
          <Toggle value={c.showBookingParticipants ?? d.showBookingParticipants} onChange={v => setBookingBool('showBookingParticipants', v)} />
        </Row>
      </>
    )
  }

  // Pages > Orders
  function OrdersSection() {
    const d = defaultConfig.ui
    const c = cfg.ui || {}
    return (
      <>
        <Row label={t('tenantCustom.showOrderNumber')} help={t('tenantCustom.showOrderNumberHelp')}
          customized={c.showOrderNumberInList !== undefined && c.showOrderNumberInList !== d.showOrderNumberInList}>
          <Toggle value={c.showOrderNumberInList ?? d.showOrderNumberInList} onChange={v => setUi('showOrderNumberInList', v)} />
        </Row>
      </>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tenantName = tenants.find(ten => ten.id === tenantId)?.name

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
            <select
              value={section}
              onChange={e => setSection(e.target.value as Section)}
              style={{ height: H, minWidth: 220 }}
            >
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

          {/* Section content */}
          {section === 'terminology' && TerminologySection()}
          {section === 'payments'    && PaymentsSection()}
          {section === 'booking'     && BookingSection()}
          {section === 'orders'      && OrdersSection()}

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
