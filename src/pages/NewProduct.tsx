// src/pages/NewProduct.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createProduct, listProducts, listProductCategories, createProductCategory, listCoverageProducts, type ProductWithCost, type CoverageProduct, getAuthHeaders } from '../lib/api'
import AddOnProductForm from './AddOnProductForm'
import { ImagePicker } from '../components/ImagePicker'
import { formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

interface HistoricalCost {
  product_id: string
  product_name: string
  cost: number
  effective_from: string
}

export default function NewProduct() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')  // decimal string
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState<'product' | 'service' | 'coverage'>(
    searchParams.get('type') === 'service' ? 'service' : 'product'
  )

  const [formOpen, setFormOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [coverageProducts, setCoverageProducts] = useState<CoverageProduct[]>([])
  const [loadingCoverage, setLoadingCoverage] = useState(false)
  const [editingCoverage, setEditingCoverage] = useState<CoverageProduct | null>(null)

  const [durationStr, setDurationStr] = useState('')
  const [priceStr, setPriceStr] = useState('')

  const [imageData, setImageData] = useState<string | null>(null)
  const [productCategory, setProductCategory] = useState('')
  const [productSubcategory, setProductSubcategory] = useState('')
  const [sku, setSku] = useState('')
  const [variant, setVariant] = useState('')
  const [unitTracking, setUnitTracking] = useState<'none' | 'on_promote' | 'serialized_intake'>('none')
  const [unitTrackingOpen, setUnitTrackingOpen] = useState(false)

  const [categories, setCategories] = useState<string[]>([])
  const [subcategories, setSubcategories] = useState<string[]>([])
  const [addingCategory, setAddingCategory] = useState(false)
  const [addingSubcategory, setAddingSubcategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

  const [showHistorical, setShowHistorical] = useState(false)
  const [historicalCosts, setHistoricalCosts] = useState<HistoricalCost[]>([])
  const [loadingHistorical, setLoadingHistorical] = useState(false)

  // Filter out specific products and apply category filter
  const filteredProducts = useMemo(() => {
    const excludedNames = ['boutiq', 'perfect day_2', 'muha meds', 'clouds', 'mix pack', 'bodega boys', 'hex fuel']
    return products.filter(p =>
      !excludedNames.includes(p.name.toLowerCase()) &&
      (p.category ?? 'product') === category
    )
  }, [products, category])

  function parseCostInput(s: string) {
    return s.replace(/[^\d.,]/g, '')
  }

  const { fmtMoney, fmtInput, parseAmount } = useCurrency()
  const { user } = useAuth()
  const pageFields = getTenantConfig(user?.tenantId).pages['new-product']?.fields ?? {}
  const btLabels = (user as any)?.businessTypeConfig?.labels ?? {}
  const labelProductCost: string = btLabels.productCostPerUnit || t('products.productCostUSD')
  const showCategory    = pageFields.product_category    !== false
  const showSubcategory = pageFields.product_subcategory !== false
  const showSku         = pageFields.sku                 !== false
  const showVariant     = pageFields.variant             !== false
  const showUnitTracking = pageFields.unit_tracking      !== false
  const showProductTab  = pageFields.show_product_tab    !== false
  const showServiceTab  = pageFields.show_service_tab    !== false

  useEffect(() => {
    if (category === 'product' && !showProductTab && showServiceTab) setCategory('service')
    if (category === 'service' && !showServiceTab && showProductTab) setCategory('product')
  }, [showProductTab, showServiceTab])

  async function loadCoverageProducts() {
    try {
      setLoadingCoverage(true)
      const { coverage_products } = await listCoverageProducts()
      setCoverageProducts(coverage_products.slice().sort((a, b) => a.name.localeCompare(b.name)))
    } finally {
      setLoadingCoverage(false)
    }
  }

  async function loadProducts() {
    try {
      setLoadingList(true)
      const { products: raw } = await listProducts()
      const rows = raw.slice().sort((a, b) => a.name.localeCompare(b.name))
      setProducts(rows)
    } finally {
      setLoadingList(false)
    }
  }

  async function loadHistoricalCosts() {
    try {
      setLoadingHistorical(true)

      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const res = await fetch(`${base}/api/product-cost-history`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error('Failed to load historical costs')
      const data = await res.json()
      setHistoricalCosts(Array.isArray(data) ? data : [])
    } catch (e: any) {
      alert(e?.message || 'Failed to load historical costs')
    } finally {
      setLoadingHistorical(false)
    }
  }

  useEffect(() => {
    loadProducts()
    loadCategories()
    loadSubcategories()
    loadCoverageProducts()
  }, [])

  useEffect(() => {
    if (showHistorical) {
      loadHistoricalCosts()
    }
  }, [showHistorical])

  async function loadCategories() {
    try { setCategories(await listProductCategories('category')) } catch {}
  }

  async function loadSubcategories() {
    try { setSubcategories(await listProductCategories('subcategory')) } catch {}
  }

  async function handleAddCategory() {
    const nm = newCategoryName.trim()
    if (!nm) return
    try {
      await createProductCategory('category', nm)
      setCategories(prev => [...prev, nm].sort((a, b) => a.localeCompare(b)))
      setProductCategory(nm)
      setAddingCategory(false)
      setNewCategoryName('')
    } catch (e: any) { alert(e?.message || 'Failed to save category') }
  }

  async function handleAddSubcategory() {
    const nm = newSubcategoryName.trim()
    if (!nm) return
    try {
      await createProductCategory('subcategory', nm)
      setSubcategories(prev => [...prev, nm].sort((a, b) => a.localeCompare(b)))
      setProductSubcategory(nm)
      setAddingSubcategory(false)
      setNewSubcategoryName('')
    } catch (e: any) { alert(e?.message || 'Failed to save subcategory') }
  }

  async function save() {
    const nm = name.trim()
    const costNum = parseAmount(costStr || '')
    if (!nm) { alert(t('products.alertEnterName')); return }
    if (!Number.isFinite(costNum) || costNum < 0) { alert(t('products.alertEnterValidCost')); return }

    const durationMinutes = category === 'service' && durationStr
      ? Math.max(1, parseInt(durationStr, 10) || 60)
      : null
    const priceAmount = priceStr ? parseAmount(priceStr) : null

    try {
      setSaving(true)
      if (category === 'coverage') return
      await createProduct({ name: nm, cost: costNum, category, duration_minutes: durationMinutes, price_amount: priceAmount, image_data: imageData, product_category: productCategory || null, product_subcategory: productSubcategory || null, sku: category === 'product' ? (sku || null) : null, variant: category === 'product' ? (variant || null) : null, ...(category === 'product' && showUnitTracking ? { unit_tracking: unitTracking } : {}) })
      alert(t(category === 'service' ? 'products.serviceCreated' : 'products.created'))
      setName('')
      setCostStr('')
      setDurationStr('')
      setPriceStr('')
      setImageData(null)
      setProductCategory('')
      setProductSubcategory('')
      setSku('')
      await loadProducts()
      if (showHistorical) {
        await loadHistoricalCosts()
      }
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  // Group historical costs by product
  const groupedHistorical = historicalCosts.reduce((acc, item) => {
    if (!acc[item.product_name]) {
      acc[item.product_name] = []
    }
    acc[item.product_name].push(item)
    return acc
  }, {} as Record<string, HistoricalCost[]>)

  return (
    <>
    <div className="card page-normal">
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <div
          onClick={() => setFormOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{formOpen ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('products.addOrEdit')}</h3>
        </div>
        {category !== 'coverage' && (
          <Link to={`/products/edit?type=${category}`}>
            <button className="primary" style={{ height: BTN_H }}>
              {category === 'service' ? t('products.editServicesButton') : t('products.editProductsButton')}
            </button>
          </Link>
        )}
      </div>

      {formOpen && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {(showProductTab && showServiceTab) && (
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden' }}>
            {(['product', 'service'] as const)
              .filter(cat => cat === 'product' ? showProductTab : showServiceTab)
              .map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: '6px 18px',
                    border: 'none',
                    borderRadius: 0,
                    background: category === cat ? 'var(--primary, #2563eb)' : 'transparent',
                    color: category === cat ? '#fff' : 'inherit',
                    cursor: 'pointer',
                    fontWeight: category === cat ? 600 : 400,
                  }}
                >
                  {cat === 'product' ? 'Product' : 'Service'}
                </button>
              ))}
          </div>
        )}
        <button
          onClick={() => setCategory('coverage')}
          style={{
            padding: '6px 18px',
            border: '1px solid var(--border, #e6e6e6)',
            borderRadius: 6,
            background: category === 'coverage' ? 'var(--primary, #2563eb)' : 'transparent',
            color: category === 'coverage' ? '#fff' : 'inherit',
            cursor: 'pointer',
            fontWeight: category === 'coverage' ? 600 : 400,
          }}
        >
          {t('products.addOnProduct')}
        </button>
      </div>

      {category === 'coverage' && (
        <AddOnProductForm
          editProduct={editingCoverage}
          onSaved={() => { loadCoverageProducts(); setEditingCoverage(null) }}
          onCancelEdit={() => setEditingCoverage(null)}
        />
      )}

      {category !== 'coverage' && <><div style={{ marginTop: 12 }}>
        <label>{category === 'service' ? t('products.serviceName') : t('products.productName')}</label>
        <input
          type="text"
          placeholder=""
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {(showCategory || showSubcategory) && (
        <div className="row" style={{ marginTop: 12 }}>
          {showCategory && (
            <div>
              <label>{category === 'service' ? 'Service category' : 'Product category'}</label>
              {addingCategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') } }}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button onClick={handleAddCategory} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>Add</button>
                  <button onClick={() => { setAddingCategory(false); setNewCategoryName(''); setProductCategory('') }} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <select value={productCategory} onChange={e => {
                  if (e.target.value === '__new__') { setAddingCategory(true); setProductCategory('') }
                  else setProductCategory(e.target.value)
                }}>
                  <option value="">—</option>
                  <option value="__new__">＋ New category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}
          {showSubcategory && (
            <div>
              <label>{category === 'service' ? 'Service subcategory' : 'Product subcategory'}</label>
              {addingSubcategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Subcategory name"
                    value={newSubcategoryName}
                    onChange={e => setNewSubcategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubcategory(); if (e.key === 'Escape') { setAddingSubcategory(false); setNewSubcategoryName('') } }}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button onClick={handleAddSubcategory} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>Add</button>
                  <button onClick={() => { setAddingSubcategory(false); setNewSubcategoryName(''); setProductSubcategory('') }} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <select value={productSubcategory} onChange={e => {
                  if (e.target.value === '__new__') { setAddingSubcategory(true); setProductSubcategory('') }
                  else setProductSubcategory(e.target.value)
                }}>
                  <option value="">—</option>
                  <option value="__new__">＋ New subcategory</option>
                  {subcategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {category === 'product' && (showSku || showVariant) && (
        <div className="row" style={{ marginTop: 12 }}>
          {showSku && (
            <div>
              <label>Item ID / SKU</label>
              <input type="text" value={sku} onChange={e => setSku(e.target.value)} />
            </div>
          )}
          {showVariant && (
            <div>
              <label>Variant</label>
              <input type="text" value={variant} onChange={e => setVariant(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {category === 'product' && showUnitTracking && (
        <div style={{ marginTop: 12 }}>
          <div
            onClick={() => setUnitTrackingOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{unitTrackingOpen ? '▼' : '▶'}</span>
            <label style={{ cursor: 'pointer', margin: 0 }}>{t('products.unitTracking')}</label>
          </div>
          {unitTrackingOpen && (
            <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
              {(['none', 'on_promote', 'serialized_intake'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="radio" name="unit_tracking_new" value={mode} checked={unitTracking === mode} onChange={() => setUnitTracking(mode)} style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 500 }}>
                      {mode === 'none' ? t('products.unitTrackingNone') : mode === 'on_promote' ? t('products.unitTrackingOnPromote') : t('products.unitTrackingSerializedIntake')}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                      {mode === 'none' ? t('products.unitTrackingNoneDesc') : mode === 'on_promote' ? t('products.unitTrackingOnPromoteDesc') : t('products.unitTrackingSerializedIntakeDesc')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {category === 'product' && (
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>{t('products.servicePrice')}</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={fmtInput(0)}
              value={priceStr}
              onChange={e => setPriceStr(parseCostInput(e.target.value))}
            />
          </div>
          <div>
            <label>{t('products.productCostUSD')}</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={fmtInput(0)}
              value={costStr}
              onChange={e => setCostStr(parseCostInput(e.target.value))}
            />
          </div>
        </div>
      )}

      {category === 'service' && (
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>{t('products.duration')}</label>
            <input
              type="number"
              min={1}
              placeholder="60"
              value={durationStr}
              onChange={e => setDurationStr(e.target.value)}
            />
          </div>
          <div>
            <label>{t('products.servicePrice')}</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={fmtInput(0)}
              value={priceStr}
              onChange={e => setPriceStr(parseCostInput(e.target.value))}
            />
          </div>
        </div>
      )}

      {category === 'service' && (
        <div style={{ marginTop: 12 }}>
          <label>{t('products.directServiceCost')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder={fmtInput(0)}
            value={costStr}
            onChange={e => setCostStr(parseCostInput(e.target.value))}
          />
        </div>
      )}

      <ImagePicker
        label={category === 'service' ? t('products.serviceImage') : t('products.productImage')}
        value={imageData}
        onChange={setImageData}
      />

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? t('saving') : t(category === 'service' ? 'products.saveService' : 'products.saveProduct')}
        </button>
        <button onClick={() => { setName(''); setCostStr(''); setDurationStr(''); setPriceStr(''); setImageData(null); setProductCategory(''); setProductSubcategory(''); setSku(''); setVariant('') }} disabled={saving}>
          {t('clear')}
        </button>
      </div>
      </>}
      </>}

    </div>

    {/* ---- Product costs card ---- */}
    <div className="card page-normal" style={{ marginTop: 16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, marginBottom: listOpen ? 8 : 0 }}>
          <div
            onClick={() => setListOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{listOpen ? '▼' : '▶'}</span>
            <h3 style={{ margin: 0 }}>
              {category === 'service' ? t('products.allServices') : category === 'coverage' ? t('products.allAddOnProducts') : t('products.allProducts')}
            </h3>
          </div>
          {listOpen && category !== 'coverage' && (
            <button
              className="primary"
              onClick={() => setShowHistorical(!showHistorical)}
              style={{ height: BTN_H, minWidth: 140 }}
            >
              {showHistorical ? t('products.currentCosts') : t('products.historicalCosts')}
            </button>
          )}
        </div>

        {/* ── Add On Products list ── */}
        {listOpen && category === 'coverage' && (
          loadingCoverage ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>{t('loading')}</div>
          ) : coverageProducts.length === 0 ? (
            <div style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>{t('coverage.noProducts')}</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {coverageProducts.map(p => (
                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                        {p.coverage_duration_days != null && <span>{p.coverage_duration_days}d</span>}
                        {p.coverage_issuer_type && <span>{p.coverage_issuer_type === 'manufacturer' ? t('coverage.issuerManufacturer') : p.coverage_issuer_type === 'shop' ? t('coverage.issuerShop') : t('coverage.issuerThirdParty')}{p.coverage_issuer_name ? ` — ${p.coverage_issuer_name}` : ''}</span>}
                        {p.coverage_ref && (
                          p.coverage_ref.startsWith('http')
                            ? <a href={p.coverage_ref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{p.coverage_ref}</a>
                            : <span>{p.coverage_ref}</span>
                        )}
                        {p.price_amount != null && <span>{fmtMoney(p.price_amount)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => { setEditingCoverage(p); setFormOpen(true) }}
                      style={{ fontSize: 12, padding: '4px 12px', height: 28, flexShrink: 0 }}
                    >
                      {t('edit')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Products / Services: current costs ── */}
        {listOpen && category !== 'coverage' && !showHistorical && (
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            {loadingList ? (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 14 }}>{t('products.noProducts')}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0 4px 0', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{t('name')}</th>
                    {category === 'product' && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{t('products.unitTracking')}</th>}
                    {category === 'service' && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{t('products.duration')}</th>}
                    <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0 4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{t('products.servicePrice')}</th>
                    <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0 4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{category === 'service' ? t('products.directServiceCost') : labelProductCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>{p.name}</td>
                      {category === 'product' && (
                        <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                          {p.unit_tracking === 'on_promote' ? t('products.unitTrackingOnPromote')
                            : p.unit_tracking === 'serialized_intake' ? t('products.unitTrackingSerializedIntake')
                            : t('products.unitTrackingNone')}
                        </td>
                      )}
                      {category === 'service' && (
                        <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {p.duration_minutes != null ? `${p.duration_minutes} min` : '—'}
                        </td>
                      )}
                      <td style={{ fontSize: 13, padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.price_amount != null ? fmtMoney(p.price_amount) : '—'}</td>
                      <td style={{ fontSize: 13, padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.cost ?? 0, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Products / Services: historical costs ── */}
        {listOpen && category !== 'coverage' && showHistorical && (
          <div role="list" aria-busy={loadingHistorical} style={{ display: 'grid', gap: 12, marginTop: 4 }}>
            {loadingHistorical && <div>{t('loading')}</div>}
            {!loadingHistorical && historicalCosts.length === 0 && (
              <div style={{ opacity: 0.7 }}>{t('products.noHistoricalCosts')}</div>
            )}
            {!loadingHistorical && Object.keys(groupedHistorical).sort().map(productName => (
              <div key={productName} style={{ borderBottom: '2px solid var(--border)', paddingBottom: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{productName}</div>
                {groupedHistorical[productName]
                  .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                  .map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', alignItems: 'center', padding: '4px 0 4px 16px', gap: 12, fontSize: 14, opacity: 0.9 }}>
                      <div className="helper">{formatDate(item.effective_from)}</div>
                      <div />
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(item.cost, 3)}</div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
    </div>
    </>
  )
}




