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

type CustomerSubTab = 'hide-delete' | 'shipping'
type ShippingTarget = 'all' | 'direct' | 'partner' | 'custom'
type CostOption = 'history' | 'next' | 'specific'

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }
function todayYMD() { return new Date().toISOString().slice(0, 10) }

export default function TenantAdminCustomerSettingsTab() {
  const { t } = useTranslation()
  const { fmtInput, parseAmount } = useCurrency()
  const [subTab, setSubTab] = useState<CustomerSubTab>('hide-delete')

  const SUB_TABS: { id: CustomerSubTab; label: string }[] = [
    { id: 'hide-delete', label: t('tenantAdmin.customerSettings.hideDeleteTitle') },
    { id: 'shipping',    label: t('tenantAdmin.customerSettings.shippingTitle') },
  ]

  // ── Hide/Delete state ─────────────────────────────────────────────────────
  const [showHideCustomers, setShowHideCustomers] = useState<CustomerRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [showHideSearch, setShowHideSearch] = useState('')
  const [showHideLoading, setShowHideLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<{ orders: number; payments: number; bookings: number } | null>(null)
  const [deleteCountsLoading, setDeleteCountsLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  // ── Load hide/delete data on first visit ─────────────────────────────────
  useEffect(() => {
    if (subTab !== 'hide-delete' || showHideCustomers.length > 0) return
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

  // ── Hide/Delete helpers ───────────────────────────────────────────────────
  const filteredShowHide = useMemo(() => {
    const q = showHideSearch.trim().toLowerCase()
    return q ? showHideCustomers.filter(c => c.name.toLowerCase().includes(q)) : showHideCustomers
  }, [showHideCustomers, showHideSearch])

  async function toggleHide(id: string, hide: boolean) {
    setTogglingId(id)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'toggleHideCustomer', customerId: id, hide }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setHiddenIds(prev => { const n = new Set(prev); hide ? n.add(id) : n.delete(id); return n })
    } catch (e: any) { alert(e?.message || 'Failed to update') }
    finally { setTogglingId(null) }
  }

  async function openDeleteModal(customer: CustomerRow) {
    setDeleteTarget(customer)
    setDeleteCounts(null)
    setDeleteCountsLoading(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getCustomerRecordCounts&customer_id=${customer.id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDeleteCounts({ orders: data.orders ?? 0, payments: data.payments ?? 0, bookings: data.bookings ?? 0 })
    } catch { setDeleteCounts({ orders: 0, payments: 0, bookings: 0 }) }
    finally { setDeleteCountsLoading(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'deleteCustomer', customerId: deleteTarget.id }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete') }
      setShowHideCustomers(prev => prev.filter(c => c.id !== deleteTarget.id))
      setHiddenIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      setDeleteTarget(null)
    } catch (e: any) { alert(e?.message || 'Failed to delete') }
    finally { setDeleting(false) }
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

      {/* ── Hide / Delete Customers ── */}
      {subTab === 'hide-delete' && (
        <div>
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('tenantAdmin.customerSettings.hideDeleteDesc')}
          </p>
          {showHideLoading ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div> : (
            <>
              <input type="search" placeholder={t('tenantAdmin.customerSettings.search')} value={showHideSearch} onChange={e => setShowHideSearch(e.target.value)} style={{ marginBottom: 12 }} />
              {showHideCustomers.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.noCustomers')}</p>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                    <span>{t('tenantAdmin.customerSettings.customer')}</span>
                  </div>
                  {filteredShowHide.length === 0
                    ? <div style={{ padding: '12px', fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.noMatch')}</div>
                    : filteredShowHide.map((c, i) => {
                      const isHidden = hiddenIds.has(c.id)
                      const isToggling = togglingId === c.id
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', opacity: isHidden ? 0.45 : 1 }}>
                          <span style={{ fontSize: 14 }}>{c.name}</span>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => toggleHide(c.id, !isHidden)}
                              disabled={isToggling}
                              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: isToggling ? 'default' : 'pointer', opacity: isToggling ? 0.5 : 1, whiteSpace: 'nowrap' }}
                            >
                              {isHidden ? t('tenantAdmin.customerSettings.unhide') : t('tenantAdmin.customerSettings.hide')}
                            </button>
                            <button
                              onClick={() => openDeleteModal(c)}
                              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {t('tenantAdmin.customerSettings.delete')}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </>
          )}

          {/* Delete confirmation modal */}
          {deleteTarget && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div className="card" style={{ maxWidth: 440, width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{t('tenantAdmin.customerSettings.deleteTitle')}</div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {t('tenantAdmin.customerSettings.deleteConfirm', { name: deleteTarget.name })}
                </p>
                {deleteCountsLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loading')}</div>
                ) : deleteCounts && (deleteCounts.orders > 0 || deleteCounts.payments > 0 || deleteCounts.bookings > 0) ? (
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', fontSize: 13, lineHeight: 1.6 }}>
                    {t('tenantAdmin.customerSettings.deleteRecordsWarning')}
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {deleteCounts.orders   > 0 && <li>{t('tenantAdmin.customerSettings.deleteOrders',   { count: deleteCounts.orders })}</li>}
                      {deleteCounts.payments > 0 && <li>{t('tenantAdmin.customerSettings.deletePayments', { count: deleteCounts.payments })}</li>}
                      {deleteCounts.bookings > 0 && <li>{t('tenantAdmin.customerSettings.deleteBookings', { count: deleteCounts.bookings })}</li>}
                    </ul>
                  </div>
                ) : null}
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error)', fontWeight: 500 }}>
                  {t('tenantAdmin.customerSettings.deleteCannotUndo')}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ height: 36, padding: '0 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }}>
                    {t('cancel')}
                  </button>
                  <button onClick={confirmDelete} disabled={deleting} style={{ height: 36, padding: '0 16px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--color-error)', color: '#fff', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                    {deleting ? t('tenantAdmin.customerSettings.deleting') : t('tenantAdmin.customerSettings.deletePermanently')}
                  </button>
                </div>
              </div>
            </div>
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
