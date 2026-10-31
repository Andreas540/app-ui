import { useState, useEffect, useMemo, useRef } from 'react'
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
  // The ordered list IS the order — position is derived from index on save, so
  // duplicates and gaps are impossible by construction.
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
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
        setPinnedIds(
          list.filter(r => r.sort_order != null)
              .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
              .map(r => r.id)
        )
      })
      .finally(() => setLoading(false))
  }, [entity])

  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])
  const pinnedRows = useMemo(
    () => pinnedIds.map(id => byId.get(id)).filter(Boolean) as Row[],
    [pinnedIds, byId]
  )
  const availableRows = useMemo(() => {
    const pinned = new Set(pinnedIds)
    const q = search.trim().toLowerCase()
    return rows.filter(r => !pinned.has(r.id) && (!q || r.name.toLowerCase().includes(q)))
  }, [rows, pinnedIds, search])

  // The moved row slides out from under the pointer, so without this the next click
  // lands on whatever took its place and swaps it straight back. Following the row
  // with focus lets the same button be pressed repeatedly to keep moving.
  const moveBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())
  const pendingFocus = useRef<string | null>(null)

  function move(index: number, dir: -1 | 1) {
    const id = pinnedRows[index]?.id
    if (!id) return
    setPinnedIds(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    pendingFocus.current = `${id}:${dir}`
  }

  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    pendingFocus.current = null
    const btn = moveBtnRefs.current.get(key)
    // At either end the button is disabled and cannot take focus — fall back to the
    // opposite arrow so focus stays on the row the user is moving.
    if (btn && !btn.disabled) { btn.focus(); return }
    const [id, dir] = key.split(':')
    moveBtnRefs.current.get(`${id}:${dir === '-1' ? 1 : -1}`)?.focus()
  }, [pinnedIds])

  async function save() {
    setSaving(true); setDone('')
    try {
      const positions: Record<string, number> = {}
      pinnedIds.forEach((id, i) => { positions[id] = i + 1 })
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
  const smallBtn: React.CSSProperties = {
    height: 28, minWidth: 28, padding: '0 8px', fontSize: 12, borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer',
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
        <div style={{ display: 'grid', gap: 10 }}>
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
        <label style={{ ...radioRow, alignItems: 'flex-start', marginBottom: 14 }}>
          <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
          <span>
            {t('tenantAdmin.sorting.useCustom')}
            <span className="helper" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
              {t('tenantAdmin.sorting.useCustomHelp')}
            </span>
          </span>
        </label>

        {/* Ordered list */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('tenantAdmin.sorting.orderedTitle')}</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('tenantAdmin.sorting.orderedHelp')}
        </p>
        {pinnedRows.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 18px' }}>{t('tenantAdmin.sorting.noPinned')}</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
            {pinnedRows.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ width: 28, flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button ref={el => { moveBtnRefs.current.set(`${r.id}:-1`, el) }}
                    aria-label={t('tenantAdmin.sorting.moveUp')} onClick={() => move(i, -1)} disabled={i === 0}
                    style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                  <button ref={el => { moveBtnRefs.current.set(`${r.id}:1`, el) }}
                    aria-label={t('tenantAdmin.sorting.moveDown')} onClick={() => move(i, 1)} disabled={i === pinnedRows.length - 1}
                    style={{ ...smallBtn, opacity: i === pinnedRows.length - 1 ? 0.4 : 1, cursor: i === pinnedRows.length - 1 ? 'default' : 'pointer' }}>↓</button>
                  <button onClick={() => setPinnedIds(prev => prev.filter(id => id !== r.id))}
                    style={{ ...smallBtn, borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'transparent' }}>
                    {t('tenantAdmin.sorting.remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Picker */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('tenantAdmin.sorting.availableTitle')}</div>
        <input type="search" placeholder={t('tenantAdmin.sorting.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
        {availableRows.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>
            {rows.length === 0 ? t('tenantAdmin.sorting.noRows') : search.trim() ? t('tenantAdmin.sorting.noMatch') : t('tenantAdmin.sorting.allPinned')}
          </p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
            {availableRows.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <button onClick={() => setPinnedIds(prev => [...prev, r.id])} style={{ ...smallBtn, flexShrink: 0 }}>
                  {t('tenantAdmin.sorting.add')}
                </button>
              </div>
            ))}
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
