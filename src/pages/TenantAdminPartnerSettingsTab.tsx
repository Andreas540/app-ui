import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

interface PartnerRow {
  id: string
  name: string
  hidden?: boolean
}

interface RecordCounts {
  orders: number
  payments: number
  customers: number
  debtPayments: number
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminPartnerSettingsTab() {
  const { t } = useTranslation()

  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<PartnerRow | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<RecordCounts | null>(null)
  const [deleteCountsLoading, setDeleteCountsLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getPartnerSettings`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const rows: PartnerRow[] = data.partners ?? []
        setPartners(rows)
        setHiddenIds(new Set(rows.filter(p => p.hidden).map(p => p.id)))
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? partners.filter(p => p.name.toLowerCase().includes(q)) : partners
  }, [partners, search])

  async function toggleHide(id: string, hide: boolean) {
    setTogglingId(id)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'toggleHidePartner', partnerId: id, hide }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setHiddenIds(prev => { const n = new Set(prev); hide ? n.add(id) : n.delete(id); return n })
    } catch (e: any) { alert(e?.message || 'Failed to update') }
    finally { setTogglingId(null) }
  }

  async function openDeleteModal(partner: PartnerRow) {
    setDeleteTarget(partner)
    setDeleteCounts(null)
    setDeleteCountsLoading(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getPartnerRecordCounts&partner_id=${partner.id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDeleteCounts({ orders: data.orders ?? 0, payments: data.payments ?? 0, customers: data.customers ?? 0, debtPayments: data.debtPayments ?? 0 })
    } catch { setDeleteCounts({ orders: 0, payments: 0, customers: 0, debtPayments: 0 }) }
    finally { setDeleteCountsLoading(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'deletePartner', partnerId: deleteTarget.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        if (d.error === 'PARTNER_HAS_CUSTOMERS') {
          throw new Error(t('tenantAdmin.partnerSettings.deleteBlockedCustomers', { count: d.customers }))
        }
        throw new Error(d.error || 'Failed to delete')
      }
      setPartners(prev => prev.filter(p => p.id !== deleteTarget.id))
      setHiddenIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      setDeleteTarget(null)
    } catch (e: any) { alert(e?.message || 'Failed to delete') }
    finally { setDeleting(false) }
  }

  // Deleting a partner that still owns customers would detach or cascade them, so it is blocked.
  const blockedByCustomers = (deleteCounts?.customers ?? 0) > 0

  return (
    <div>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t('tenantAdmin.partnerSettings.hideDeleteDesc')}
      </p>
      {loading ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div> : (
        <>
          <input type="search" placeholder={t('tenantAdmin.partnerSettings.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
          {partners.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.partnerSettings.noPartners')}</p>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                <span>{t('tenantAdmin.partnerSettings.partner')}</span>
              </div>
              {filtered.length === 0
                ? <div style={{ padding: '12px', fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.partnerSettings.noMatch')}</div>
                : filtered.map((p, i) => {
                  const isHidden = hiddenIds.has(p.id)
                  const isToggling = togglingId === p.id
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', opacity: isHidden ? 0.45 : 1 }}>
                      <span style={{ fontSize: 14 }}>{p.name}</span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleHide(p.id, !isHidden)}
                          disabled={isToggling}
                          style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: isToggling ? 'default' : 'pointer', opacity: isToggling ? 0.5 : 1, whiteSpace: 'nowrap' }}
                        >
                          {isHidden ? t('tenantAdmin.partnerSettings.unhide') : t('tenantAdmin.partnerSettings.hide')}
                        </button>
                        <button
                          onClick={() => openDeleteModal(p)}
                          style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {t('tenantAdmin.partnerSettings.delete')}
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
            <div style={{ fontWeight: 600, fontSize: 16 }}>{t('tenantAdmin.partnerSettings.deleteTitle')}</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('tenantAdmin.partnerSettings.deleteConfirm', { name: deleteTarget.name })}
            </p>
            {deleteCountsLoading ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loading')}</div>
            ) : blockedByCustomers ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', fontSize: 13, lineHeight: 1.6 }}>
                {t('tenantAdmin.partnerSettings.deleteBlockedCustomers', { count: deleteCounts!.customers })}
              </div>
            ) : deleteCounts && (deleteCounts.orders > 0 || deleteCounts.payments > 0 || deleteCounts.debtPayments > 0) ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', fontSize: 13, lineHeight: 1.6 }}>
                {t('tenantAdmin.partnerSettings.deleteRecordsWarning')}
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {deleteCounts.orders       > 0 && <li>{t('tenantAdmin.partnerSettings.deleteOrders',       { count: deleteCounts.orders })}</li>}
                  {deleteCounts.payments     > 0 && <li>{t('tenantAdmin.partnerSettings.deletePayments',     { count: deleteCounts.payments })}</li>}
                  {deleteCounts.debtPayments > 0 && <li>{t('tenantAdmin.partnerSettings.deleteDebtPayments', { count: deleteCounts.debtPayments })}</li>}
                </ul>
              </div>
            ) : null}
            {!blockedByCustomers && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error)', fontWeight: 500 }}>
                {t('tenantAdmin.partnerSettings.deleteCannotUndo')}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ height: 36, padding: '0 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }}>
                {blockedByCustomers ? t('close') : t('cancel')}
              </button>
              {!blockedByCustomers && (
                <button onClick={confirmDelete} disabled={deleting || deleteCountsLoading} style={{ height: 36, padding: '0 16px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--color-error)', color: '#fff', cursor: deleting ? 'default' : 'pointer', opacity: deleting || deleteCountsLoading ? 0.7 : 1 }}>
                  {deleting ? t('tenantAdmin.partnerSettings.deleting') : t('tenantAdmin.partnerSettings.deletePermanently')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
