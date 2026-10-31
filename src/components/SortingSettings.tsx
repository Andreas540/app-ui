import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

type Entity = 'customer' | 'partner'
type BaseSort = 'name' | 'owed'

interface Row { id: string; name: string; sort_order?: number | null }

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function SortingSettings({ entity }: { entity: Entity }) {
  const { t } = useTranslation()
  const isPartner = entity === 'partner'

  const [rows, setRows] = useState<Row[]>([])
  const [baseSort, setBaseSort] = useState<BaseSort>('name')
  const [useCustom, setUseCustom] = useState(false)
  const [positions, setPositions] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=${isPartner ? 'getPartnerSorting' : 'getCustomerSorting'}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: Row[] = data.rows ?? []
        setRows(list)
        setBaseSort(data.defaultSort === 'owed' ? 'owed' : 'name')
        setUseCustom(data.useCustom === true)
        const pos: Record<string, number | null> = {}
        for (const r of list) pos[r.id] = r.sort_order ?? null
        setPositions(pos)
      })
      .finally(() => setLoading(false))
  }, [entity])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows
  }, [rows, search])

  const positionedCount = useMemo(
    () => Object.values(positions).filter(v => v != null).length,
    [positions]
  )

  async function save() {
    setSaving(true); setDone('')
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          action: isPartner ? 'savePartnerSorting' : 'saveCustomerSorting',
          defaultSort: baseSort,
          useCustom,
          positions,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save') }
      setDone(t('tenantAdmin.sorting.saved'))
    } catch (e: any) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 10,
  }
  const radioRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14,
  }

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {/* Section 1: base sort */}
      <div>
        <div style={sectionLabel}>{t('tenantAdmin.sorting.defaultTitle')}</div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('tenantAdmin.sorting.defaultDesc')}
        </p>
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <label style={radioRow}>
            <input type="radio" name={`baseSort-${entity}`} checked={baseSort === 'name'} onChange={() => setBaseSort('name')} style={{ width: 18, height: 18 }} />
            {isPartner ? t('partners.sortName') : t('customers.sortName')}
          </label>
          <label style={radioRow}>
            <input type="radio" name={`baseSort-${entity}`} checked={baseSort === 'owed'} onChange={() => setBaseSort('owed')} style={{ width: 18, height: 18 }} />
            {isPartner ? t('partners.sortOwed') : t('customers.sortOwed')}
          </label>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

      {/* Section 2: custom order */}
      <div>
        <div style={sectionLabel}>{t('tenantAdmin.sorting.customTitle')}</div>
        <label style={{ ...radioRow, alignItems: 'flex-start', marginBottom: 10 }}>
          <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
          <span>
            {t('tenantAdmin.sorting.useCustom')}
            <span className="helper" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
              {t('tenantAdmin.sorting.useCustomHelp')}
            </span>
          </span>
        </label>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('tenantAdmin.sorting.positionHelp', { count: positionedCount })}
        </p>

        <input type="search" placeholder={t('tenantAdmin.sorting.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

        {rows.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.sorting.noRows')}</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              <span>{isPartner ? t('tenantAdmin.partnerSettings.partner') : t('tenantAdmin.customerSettings.customer')}</span>
              <span>{t('tenantAdmin.sorting.position')}</span>
            </div>
            {filtered.length === 0
              ? <div style={{ padding: 12, fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.sorting.noMatch')}</div>
              : filtered.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <select
                    value={positions[r.id] ?? ''}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      setPositions(prev => ({ ...prev, [r.id]: v }))
                    }}
                    style={{ width: 72, height: 'var(--control-h)', fontSize: 12, textAlign: 'center', flexShrink: 0 }}
                  >
                    <option value="">—</option>
                    {rows.map((_, idx) => (
                      <option key={idx + 1} value={idx + 1}>{idx + 1}</option>
                    ))}
                  </select>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {done && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-success-bg)', border: '1px solid var(--color-success)', fontSize: 14 }}>{done}</div>
      )}
      <div>
        <button className="primary" onClick={save} disabled={saving} style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
          {saving ? t('saving') : t('tenantAdmin.sorting.saveChanges')}
        </button>
      </div>
    </div>
  )
}
