import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import TenantAdminRecipesTab from './TenantAdminRecipesTab'

interface ProductRow {
  id: string
  name: string
  category: 'product' | 'service' | 'material'
  hidden: boolean
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminProductSettingsTab() {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<'products' | 'recipes'>('products')

  const [rows, setRows] = useState<ProductRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getProductSettings`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: ProductRow[] = data.products ?? []
        setRows(list)
        setHiddenIds(new Set(list.filter(p => p.hidden).map(p => p.id)))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const products = useMemo(() => rows.filter(r => r.category === 'product'), [rows])
  const services = useMemo(() => rows.filter(r => r.category === 'service'), [rows])
  const materials = useMemo(() => rows.filter(r => r.category === 'material'), [rows])

  const q = search.trim().toLowerCase()
  const filteredProducts = useMemo(() => q ? products.filter(p => p.name.toLowerCase().includes(q)) : products, [products, q])
  const filteredServices = useMemo(() => q ? services.filter(s => s.name.toLowerCase().includes(q)) : services, [services, q])
  const filteredMaterials = useMemo(() => q ? materials.filter(m => m.name.toLowerCase().includes(q)) : materials, [materials, q])

  async function toggleHide(id: string, hide: boolean) {
    setTogglingId(id)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'toggleHideProduct', productId: id, hide }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setHiddenIds(prev => { const n = new Set(prev); hide ? n.add(id) : n.delete(id); return n })
    } catch (e: any) { alert(e?.message || 'Failed to update') }
    finally { setTogglingId(null) }
  }

  function renderList(items: ProductRow[]) {
    if (items.length === 0) return (
      <div style={{ padding: '12px', fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.productSettings.noMatch')}</div>
    )
    return items.map((p, i) => {
      const isHidden = hiddenIds.has(p.id)
      const isToggling = togglingId === p.id
      return (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', opacity: isHidden ? 0.45 : 1 }}>
          <span style={{ fontSize: 14 }}>{p.name}</span>
          <button
            onClick={() => toggleHide(p.id, !isHidden)}
            disabled={isToggling}
            style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: isToggling ? 'default' : 'pointer', opacity: isToggling ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {isHidden ? t('tenantAdmin.productSettings.unhide') : t('tenantAdmin.productSettings.hide')}
          </button>
        </div>
      )
    })
  }

  const SUB_TABS: { id: typeof subTab; label: string }[] = [
    { id: 'products', label: t('tenantAdmin.tabHideProducts') },
    { id: 'recipes',  label: t('tenantAdmin.tabRecipes') },
  ]

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as typeof subTab)}
        >
          {SUB_TABS.map(tab => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>
        <div className="booking-subtab-tabs" style={{ gap: 4, borderBottom: '1px solid var(--separator)' }}>
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: subTab === tab.id ? 600 : 400,
                fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Products / Services sub-tab ── */}
      {subTab === 'products' && (
        <>
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('tenantAdmin.productSettings.desc')}
          </p>

          <input
            type="search"
            placeholder={t('tenantAdmin.productSettings.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 16 }}
          />

          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.productSettings.noProducts')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredProducts.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('product')}
                  </div>
                  {renderList(filteredProducts)}
                </div>
              )}

              {filteredServices.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('service')}
                  </div>
                  {renderList(filteredServices)}
                </div>
              )}

              {filteredMaterials.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--line)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('tenantAdmin.productSettings.materialsHeader')}
                  </div>
                  {renderList(filteredMaterials)}
                </div>
              )}

              {q && filteredProducts.length === 0 && filteredServices.length === 0 && filteredMaterials.length === 0 && (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.productSettings.noMatch')}</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Recipes sub-tab ── */}
      {subTab === 'recipes' && <TenantAdminRecipesTab />}

    </div>
  )
}
