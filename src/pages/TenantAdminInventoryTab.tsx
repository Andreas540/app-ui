import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
interface InventoryRow {
  product_id: string
  product: string
  pre_prod: number
  finished: number
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminInventoryTab() {
  const { t } = useTranslation()
  const [rows,      setRows]      = useState<InventoryRow[]>([])
  const [checked,   setChecked]   = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [clearing,  setClearing]  = useState(false)
  const [confirm,   setConfirm]   = useState<'selected' | 'all' | null>(null)
  const [doneMsg,   setDoneMsg]   = useState('')

  useEffect(() => {
    fetch(`${apiBase()}/.netlify/functions/warehouse-inventory`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setRows(data.inventory ?? []))
      .finally(() => setLoading(false))
  }, [])

  const allSelected = rows.length > 0 && checked.size === rows.length

  function toggleAll() {
    setChecked(allSelected ? new Set() : new Set(rows.map(r => r.product_id)))
  }

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function executeClear(scope: 'selected' | 'all') {
    setClearing(true)
    setConfirm(null)
    try {
      const productIds = scope === 'all' ? 'all' : [...checked]
      const res = await fetch(`${apiBase()}/.netlify/functions/admin-inventory`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'clearInventory', productIds }),
      })
      const data = await res.json()
      if (res.ok) {
        setDoneMsg(t('tenantAdmin.inventory.clearDone', { count: data.cleared }))
        // Reload inventory
        const inv = await fetch(`${apiBase()}/.netlify/functions/warehouse-inventory`, { headers: getAuthHeaders() })
        const invData = await inv.json()
        setRows(invData.inventory ?? [])
        setChecked(new Set())
      }
    } finally {
      setClearing(false)
    }
  }

  const selectedHasStock = [...checked].some(id => {
    const row = rows.find(r => r.product_id === id)
    return row && (Number(row.pre_prod) !== 0 || Number(row.finished) !== 0)
  })
  const anyHasStock = rows.some(r => Number(r.pre_prod) !== 0 || Number(r.finished) !== 0)

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>

  return (
    <div>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t('tenantAdmin.inventory.clearDesc')}
      </p>

      {doneMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#f0fdf4',
          border: '1px solid #86efac', color: '#166534', fontSize: 14, marginBottom: 16,
        }}>
          {doneMsg}
        </div>
      )}

      {/* Confirmation modal */}
      {confirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setConfirm(null)}
        >
          <div className="card" style={{ maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {confirm === 'all'
                ? t('tenantAdmin.inventory.confirmAll')
                : t('tenantAdmin.inventory.confirmSelected', { count: checked.size })}
            </h3>
            <p style={{ marginTop: 0, marginBottom: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('tenantAdmin.inventory.confirmWarning')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirm(null)} style={{ height: 36, padding: '0 16px', fontSize: 14 }}>
                {t('cancel')}
              </button>
              <button
                onClick={() => executeClear(confirm)}
                disabled={clearing}
                className="primary"
                style={{ height: 36, padding: '0 16px', fontSize: 14, background: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                {t('tenantAdmin.inventory.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.inventory.noProducts')}</p>
      ) : (
        <>
          {/* Select all */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            {t('tenantAdmin.inventory.selectAll')}
          </label>

          {/* Product table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            {/* Header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 80px 80px',
              padding: '8px 12px', background: 'var(--bg-secondary, #f8f9fa)',
              borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600,
            }}>
              <span />
              <span>{t('tenantAdmin.inventory.product')}</span>
              <span style={{ textAlign: 'right' }}>{t('tenantAdmin.inventory.preProd')}</span>
              <span style={{ textAlign: 'right' }}>{t('tenantAdmin.inventory.finished')}</span>
            </div>

            {rows.map((row, i) => {
              const preProd  = Number(row.pre_prod)
              const finished = Number(row.finished)
              const isZero   = preProd === 0 && finished === 0
              return (
                <div
                  key={row.product_id}
                  style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr 80px 80px',
                    padding: '8px 12px', fontSize: 14,
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    opacity: isZero ? 0.45 : 1,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked.has(row.product_id)}
                      onChange={() => toggle(row.product_id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </label>
                  <span style={{ alignSelf: 'center' }}>{row.product}</span>
                  <span style={{
                    textAlign: 'right', alignSelf: 'center', fontWeight: 600,
                    color: preProd < 0 ? '#ef4444' : preProd === 0 ? 'var(--muted)' : undefined,
                  }}>{preProd}</span>
                  <span style={{
                    textAlign: 'right', alignSelf: 'center', fontWeight: 600,
                    color: finished < 0 ? '#ef4444' : finished === 0 ? 'var(--muted)' : undefined,
                  }}>{finished}</span>
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setDoneMsg(''); setConfirm('selected') }}
              disabled={checked.size === 0 || !selectedHasStock || clearing}
              style={{ height: 36, padding: '0 16px', fontSize: 13 }}
            >
              {t('tenantAdmin.inventory.clearSelected', { count: checked.size })}
            </button>
            <button
              onClick={() => { setDoneMsg(''); setConfirm('all') }}
              disabled={!anyHasStock || clearing}
              style={{ height: 36, padding: '0 16px', fontSize: 13 }}
            >
              {t('tenantAdmin.inventory.clearAll')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
