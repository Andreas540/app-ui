import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { DateInput } from '../components/DateInput'

interface CustomerRow {
  id: string
  name: string
  customer_type: string
  hidden?: boolean
  shipping_cost?: number | null
}

type CustomerSubTab = 'show-hide' | 'shipping'
type ShippingTarget = 'all' | 'direct' | 'partner' | 'custom'
type CostOption = 'history' | 'next' | 'specific'

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }
function todayYMD() { return new Date().toISOString().slice(0, 10) }

export default function TenantAdminCustomerSettingsTab() {
  const { t } = useTranslation()
  const { fmtInput, parseAmount } = useCurrency()
  const [subTab, setSubTab] = useState<CustomerSubTab>('show-hide')

  const SUB_TABS: { id: CustomerSubTab; label: string }[] = [
    { id: 'show-hide', label: t('tenantAdmin.customerSettings.showHideTitle') },
    { id: 'shipping',  label: t('tenantAdmin.customerSettings.shippingTitle') },
  ]

  // ── Show/Hide state ───────────────────────────────────────────────────────
  const [showHideCustomers, setShowHideCustomers] = useState<CustomerRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [showHideSearch, setShowHideSearch] = useState('')
  const [showHideLoading, setShowHideLoading] = useState(false)
  const [showHideSaving, setShowHideSaving] = useState(false)
  const [showHideDone, setShowHideDone] = useState('')

  // ── Shipping state ────────────────────────────────────────────────────────
  const [defaultMethod, setDefaultMethod] = useState<'per_item' | 'per_order'>('per_item')
  const [shippingCustomers, setShippingCustomers] = useState<CustomerRow[]>([])
  const [shippingLoading, setShippingLoading] = useState(false)
  const [savingMethod, setSavingMethod] = useState(false)
  const [methodDone, setMethodDone] = useState('')

  const [target, setTarget] = useState<ShippingTarget>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [customSearch, setCustomSearch] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costOption, setCostOption] = useState<CostOption>('next')
  const [specificDate, setSpecificDate] = useState(todayYMD())
  const [applying, setApplying] = useState(false)
  const [applyDone, setApplyDone] = useState('')

  // ── Load show/hide data on first visit ───────────────────────────────────
  useEffect(() => {
    if (subTab !== 'show-hide' || showHideCustomers.length > 0) return
    setShowHideLoading(true)
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getCustomerSettings`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const rows: CustomerRow[] = data.customers ?? []
        setShowHideCustomers(rows)
        setHiddenIds(new Set(rows.filter(c => c.hidden).map(c => c.id)))
      })
      .finally(() => setShowHideLoading(false))
  }, [subTab])

  // ── Load shipping data on first visit ────────────────────────────────────
  useEffect(() => {
    if (subTab !== 'shipping' || shippingCustomers.length > 0) return
    setShippingLoading(true)
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getShippingSettings`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        setDefaultMethod(data.defaultShippingMethod || 'per_item')
        setShippingCustomers(data.customers ?? [])
      })
      .finally(() => setShippingLoading(false))
  }, [subTab])

  // ── Show/Hide helpers ─────────────────────────────────────────────────────
  const filteredShowHide = useMemo(() => {
    const q = showHideSearch.trim().toLowerCase()
    return q ? showHideCustomers.filter(c => c.name.toLowerCase().includes(q)) : showHideCustomers
  }, [showHideCustomers, showHideSearch])

  function toggleHidden(id: string) {
    setHiddenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    setShowHideDone('')
  }

  async function saveShowHide() {
    setShowHideSaving(true); setShowHideDone('')
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setHiddenCustomers', hiddenCustomerIds: [...hiddenIds] }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save') }
      setShowHideDone(t('tenantAdmin.customerSettings.saved'))
    } catch (e: any) { alert(e?.message || 'Failed to save') }
    finally { setShowHideSaving(false) }
  }

  // ── Shipping helpers ──────────────────────────────────────────────────────
  const filteredCustom = useMemo(() => {
    const q = customSearch.trim().toLowerCase()
    return q ? shippingCustomers.filter(c => c.name.toLowerCase().includes(q)) : shippingCustomers
  }, [shippingCustomers, customSearch])

  function toggleSelected(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function saveMethod() {
    setSavingMethod(true); setMethodDone('')
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'saveDefaultShippingMethod', method: defaultMethod }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save') }
      setMethodDone(t('tenantAdmin.customerSettings.saved'))
    } catch (e: any) { alert(e?.message || 'Failed to save') }
    finally { setSavingMethod(false) }
  }

  async function applyShippingCost() {
    if (target === 'custom' && selectedIds.size === 0) {
      alert(t('tenantAdmin.customerSettings.noTargetSelected')); return
    }
    const sc = costAmount.trim() === '' ? null : parseAmount(costAmount)
    if (costAmount.trim() !== '' && (sc === null || !Number.isFinite(sc))) {
      alert(t('customers.alertShippingNumber')); return
    }
    if (costOption === 'specific' && !specificDate) {
      alert(t('products.alertSelectDate')); return
    }
    setApplying(true); setApplyDone('')
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'setBulkShippingCost',
          shippingCost: sc,
          target,
          customerIds: target === 'custom' ? [...selectedIds] : undefined,
          applyToHistory: costOption === 'history',
          effectiveDate: costOption === 'specific' ? specificDate : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply')
      setApplyDone(t('tenantAdmin.customerSettings.appliedCount', { count: data.updated }))
      // Refresh displayed shipping costs
      const refresh = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getShippingSettings`, { headers: getAuthHeaders() })
      const refreshData = await refresh.json()
      setShippingCustomers(refreshData.customers ?? [])
    } catch (e: any) { alert(e?.message || 'Failed to apply') }
    finally { setApplying(false) }
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 10,
  }

  const radioRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14,
  }

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as CustomerSubTab)}
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

      {/* ── Show / Hide Customers ── */}
      {subTab === 'show-hide' && (
        <div>
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('tenantAdmin.customerSettings.showHideDesc')}
          </p>
          {showHideLoading ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div> : (
            <>
              {showHideDone && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 14, marginBottom: 12 }}>{showHideDone}</div>}
              <input type="search" placeholder={t('tenantAdmin.customerSettings.search')} value={showHideSearch} onChange={e => setShowHideSearch(e.target.value)} style={{ marginBottom: 12 }} />
              {showHideCustomers.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.noCustomers')}</p>
              ) : (
                <>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                      <span /><span>{t('tenantAdmin.customerSettings.customer')}</span>
                    </div>
                    {filteredShowHide.length === 0
                      ? <div style={{ padding: '12px', fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.noMatch')}</div>
                      : filteredShowHide.map((c, i) => (
                        <label key={c.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', padding: '8px 12px', fontSize: 14, cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--border)', opacity: hiddenIds.has(c.id) ? 0.45 : 1 }}>
                          <input type="checkbox" checked={!hiddenIds.has(c.id)} onChange={() => toggleHidden(c.id)} style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 1 }} />
                          <span style={{ alignSelf: 'center' }}>{c.name}</span>
                        </label>
                      ))
                    }
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    {hiddenIds.size > 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.hiddenCount', { count: hiddenIds.size })}</span> : <span />}
                    <button className="primary" onClick={saveShowHide} disabled={showHideSaving} style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
                      {showHideSaving ? t('saving') : t('tenantAdmin.customerSettings.saveChanges')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Shipping Cost ── */}
      {subTab === 'shipping' && (
        <div style={{ display: 'grid', gap: 28 }}>
          {shippingLoading ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div> : (
            <>
              {/* Section 1: Calculation method */}
              <div>
                <div style={sectionLabel}>{t('tenantAdmin.customerSettings.calculationMethod')}</div>
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  <label style={radioRow}>
                    <input type="radio" name="shippingMethod" checked={defaultMethod === 'per_item'} onChange={() => setDefaultMethod('per_item')} style={{ width: 18, height: 18 }} />
                    {t('tenantAdmin.customerSettings.perItem')}
                  </label>
                  <label style={{ ...radioRow, opacity: 0.45, cursor: 'not-allowed' }}>
                    <input type="radio" name="shippingMethod" disabled checked={false} onChange={() => {}} style={{ width: 18, height: 18 }} />
                    {t('tenantAdmin.customerSettings.perOrder')}
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>— {t('tenantAdmin.customerSettings.perOrderComingSoon')}</span>
                  </label>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('tenantAdmin.customerSettings.methodNote')}
                </p>
                {methodDone && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 14, marginBottom: 12 }}>{methodDone}</div>}
                <button className="primary" onClick={saveMethod} disabled={savingMethod} style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
                  {savingMethod ? t('saving') : t('tenantAdmin.customerSettings.saveChanges')}
                </button>
              </div>

              {/* Divider */}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

              {/* Section 2: Set shipping cost */}
              <div>
                <div style={sectionLabel}>{t('tenantAdmin.customerSettings.setShippingCost')}</div>

                {/* Apply to */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>{t('tenantAdmin.customerSettings.applyTo')}</label>
                  <select value={target} onChange={e => { setTarget(e.target.value as ShippingTarget); setSelectedIds(new Set()) }} style={{ height: 44 }}>
                    <option value="all">{t('tenantAdmin.customerSettings.allCustomers')}</option>
                    <option value="direct">{t('tenantAdmin.customerSettings.allDirect')}</option>
                    <option value="partner">{t('tenantAdmin.customerSettings.allPartner')}</option>
                    <option value="custom">{t('tenantAdmin.customerSettings.selectCustomers')}</option>
                  </select>
                </div>

                {/* Customer picker (custom target) */}
                {target === 'custom' && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--line)' }}>
                      <input type="search" placeholder={t('tenantAdmin.customerSettings.search')} value={customSearch} onChange={e => setCustomSearch(e.target.value)} style={{ margin: 0, fontSize: 13 }} />
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {filteredCustom.map((c, i) => (
                        <label key={c.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--border)', alignItems: 'center' }}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          <span>{c.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.shipping_cost != null ? fmtInput(String(c.shipping_cost)) : '—'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>{t('tenantAdmin.customerSettings.amount')}</label>
                  <input type="text" inputMode="decimal" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder={t('customers.shippingCostPlaceholder')} style={{ maxWidth: 160 }} />
                </div>

                {/* Valid from */}
                <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                  <label style={radioRow}>
                    <input type="radio" name="costOption" checked={costOption === 'history'} onChange={() => setCostOption('history')} style={{ width: 18, height: 18 }} />
                    {t('customers.applyCostToHistory')}
                  </label>
                  <label style={radioRow}>
                    <input type="radio" name="costOption" checked={costOption === 'next'} onChange={() => setCostOption('next')} style={{ width: 18, height: 18 }} />
                    {t('customers.applyCostFromNextOrder')}
                  </label>
                  <label style={radioRow}>
                    <input type="radio" name="costOption" checked={costOption === 'specific'} onChange={() => setCostOption('specific')} style={{ width: 18, height: 18 }} />
                    {t('customers.applyCostFromSpecificDate')}
                  </label>
                  {costOption === 'specific' && (
                    <DateInput value={specificDate} onChange={setSpecificDate} style={{ maxWidth: 180, marginLeft: 28 }} />
                  )}
                </div>

                {applyDone && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 14, marginBottom: 12 }}>{applyDone}</div>}
                <button className="primary" onClick={applyShippingCost} disabled={applying} style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
                  {applying ? t('loading') : t('tenantAdmin.customerSettings.applyButton')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
