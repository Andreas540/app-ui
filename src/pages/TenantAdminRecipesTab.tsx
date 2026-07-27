// src/pages/TenantAdminRecipesTab.tsx
// Two sections:
//   1. Materials — list + create products with category='material'
//   2. Recipes — select a product/service, view/edit its active BOM recipe

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

type MaterialProduct = { id: string; name: string; category: string }

type BomItem = {
  id: number
  input_product_id: string
  input_name: string
  qty_per_unit: number
}

type Bom = {
  id: number
  version: number
  items: BomItem[]
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminRecipesTab() {
  const { t } = useTranslation()

  // ── All products (products + services) and materials ───────────────────────
  const [allProducts, setAllProducts] = useState<MaterialProduct[]>([])
  const [materials, setMaterials] = useState<MaterialProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  // ── Materials section ───────────────────────────────────────────────────────
  const [newMatName, setNewMatName] = useState('')
  const [savingMat, setSavingMat] = useState(false)

  // ── Recipes section ─────────────────────────────────────────────────────────
  const [selectedProductId, setSelectedProductId] = useState('')
  const [bom, setBom] = useState<Bom | null>(null)
  const [bomLoading, setBomLoading] = useState(false)
  // Draft recipe rows being edited
  const [draftItems, setDraftItems] = useState<{ input_product_id: string; qty_per_unit: string }[]>([])
  const [editMode, setEditMode] = useState(false)
  const [savingBom, setSavingBom] = useState(false)
  const [bomMsg, setBomMsg] = useState('')

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoadingProducts(true)
    try {
      const res = await fetch(`${apiBase()}/api/product`, { headers: getAuthHeaders() })
      const data = await res.json()
      const prods: MaterialProduct[] = data.products ?? []
      setAllProducts(prods.filter(p => p.category === 'product' || p.category === 'service'))
      setMaterials(prods.filter(p => p.category === 'material'))
    } finally {
      setLoadingProducts(false)
    }
  }

  async function createMaterial() {
    const name = newMatName.trim()
    if (!name) return
    setSavingMat(true)
    try {
      const res = await fetch(`${apiBase()}/api/product`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ name, cost: 0, category: 'material' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Save failed')
        return
      }
      setNewMatName('')
      await loadProducts()
    } finally {
      setSavingMat(false)
    }
  }

  async function loadBom(productId: string) {
    if (!productId) { setBom(null); return }
    setBomLoading(true)
    setBomMsg('')
    try {
      const res = await fetch(`${apiBase()}/api/product-bom?product_id=${productId}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setBom(data.bom ?? null)
      setEditMode(false)
    } finally {
      setBomLoading(false)
    }
  }

  function startEdit() {
    const rows = bom
      ? bom.items.map(i => ({ input_product_id: i.input_product_id, qty_per_unit: String(i.qty_per_unit) }))
      : []
    if (rows.length === 0) rows.push({ input_product_id: '', qty_per_unit: '' })
    setDraftItems(rows)
    setEditMode(true)
    setBomMsg('')
  }

  function updateDraft(idx: number, field: 'input_product_id' | 'qty_per_unit', value: string) {
    setDraftItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addDraftRow() {
    setDraftItems(prev => [...prev, { input_product_id: '', qty_per_unit: '' }])
  }

  function removeDraftRow(idx: number) {
    setDraftItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveBom() {
    const validItems = draftItems.filter(r => r.input_product_id && Number(r.qty_per_unit) > 0)
    if (validItems.length === 0) {
      alert('Add at least one material with qty > 0')
      return
    }
    setSavingBom(true)
    setBomMsg('')
    try {
      const res = await fetch(`${apiBase()}/api/product-bom`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          items: validItems.map(r => ({ input_product_id: r.input_product_id, qty_per_unit: Number(r.qty_per_unit) })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Save failed')
        return
      }
      setBomMsg(t('tenantAdmin.recipes.recipeSaved'))
      await loadBom(selectedProductId)
    } finally {
      setSavingBom(false)
    }
  }

  async function deleteBom() {
    if (!window.confirm(t('tenantAdmin.recipes.confirmDeleteRecipe'))) return
    setSavingBom(true)
    setBomMsg('')
    try {
      await fetch(`${apiBase()}/api/product-bom?product_id=${selectedProductId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      setBomMsg(t('tenantAdmin.recipes.recipeDeleted'))
      await loadBom(selectedProductId)
    } finally {
      setSavingBom(false)
    }
  }

  const CONTROL_H = 40

  // Products + services available for recipes (exclude materials)
  const recipeTargets = allProducts

  return (
    <div>
      {/* ── Materials ──────────────────────────────────────────────────────── */}
      <h4 style={{ margin: '0 0 8px' }}>{t('tenantAdmin.recipes.materialsHeader')}</h4>

      {loadingProducts ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</p>
      ) : (
        <>
          {materials.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>{t('tenantAdmin.recipes.noMaterials')}</p>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {materials.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--primary)' }}>⚙</span>
                  <span>{m.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Create new material */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24 }}>
            <input
              type="text"
              placeholder={t('tenantAdmin.recipes.materialName')}
              value={newMatName}
              onChange={e => setNewMatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createMaterial()}
              style={{ height: CONTROL_H, flex: 1, maxWidth: 280 }}
            />
            <button
              className="primary"
              onClick={createMaterial}
              disabled={savingMat || !newMatName.trim()}
              style={{ height: CONTROL_H }}
            >
              {t('tenantAdmin.recipes.saveMaterial')}
            </button>
          </div>
        </>
      )}

      {/* ── Recipes ────────────────────────────────────────────────────────── */}
      <h4 style={{ margin: '0 0 8px', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        {t('tenantAdmin.recipes.recipesHeader')}
      </h4>

      {/* Product selector */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={selectedProductId}
          onChange={e => {
            setSelectedProductId(e.target.value)
            setEditMode(false)
            setBom(null)
            setBomMsg('')
            if (e.target.value) loadBom(e.target.value)
          }}
          style={{ height: CONTROL_H }}
        >
          <option value="">{t('tenantAdmin.recipes.selectProduct')}</option>
          {recipeTargets.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProductId && !bomLoading && (
        <>
          {/* Current recipe display */}
          {!editMode && (
            <div style={{ marginBottom: 12 }}>
              {bom ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {t('tenantAdmin.recipes.currentRecipe')} · {t('tenantAdmin.recipes.version', { version: bom.version })}
                  </div>
                  {bom.items.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 14, padding: '5px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <span>{item.input_name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                        ×{item.qty_per_unit}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={startEdit} style={{ height: CONTROL_H }}>{t('edit')}</button>
                    <button onClick={deleteBom} disabled={savingBom} style={{ height: CONTROL_H, color: 'var(--color-error)' }}>
                      {t('tenantAdmin.recipes.deleteRecipe')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('tenantAdmin.recipes.noRecipe')}</p>
                  <button onClick={startEdit} style={{ height: CONTROL_H }}>
                    {t('tenantAdmin.recipes.newRecipe')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Edit mode */}
          {editMode && materials.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--color-error)', marginBottom: 12 }}>
              {t('tenantAdmin.recipes.noMaterials')}
            </p>
          )}

          {editMode && (
            <div>
              {draftItems.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select
                    value={row.input_product_id}
                    onChange={e => updateDraft(idx, 'input_product_id', e.target.value)}
                    style={{ height: CONTROL_H, flex: 2 }}
                  >
                    <option value="">{t('tenantAdmin.recipes.material')}</option>
                    {materials.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.001"
                    placeholder={t('tenantAdmin.recipes.qtyPerUnit')}
                    value={row.qty_per_unit}
                    onChange={e => updateDraft(idx, 'qty_per_unit', e.target.value)}
                    style={{ height: CONTROL_H, flex: 1 }}
                  />
                  {draftItems.length > 1 && (
                    <button
                      onClick={() => removeDraftRow(idx)}
                      style={{ height: CONTROL_H, minWidth: CONTROL_H, color: 'var(--color-error)', background: 'transparent', border: '1px solid var(--border)' }}
                    >
                      −
                    </button>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={addDraftRow} style={{ height: CONTROL_H }}>+ {t('tenantAdmin.recipes.addRow')}</button>
                <button className="primary" onClick={saveBom} disabled={savingBom} style={{ height: CONTROL_H }}>
                  {t('tenantAdmin.recipes.saveRecipe')}
                </button>
                <button onClick={() => { setEditMode(false); setBomMsg('') }} style={{ height: CONTROL_H }}>
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {bomMsg && <p style={{ marginTop: 8, fontSize: 14, color: 'var(--primary)' }}>{bomMsg}</p>}
        </>
      )}

      {bomLoading && <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</p>}
    </div>
  )
}
