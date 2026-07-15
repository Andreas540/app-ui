import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listProducts, updateProduct, listProductCategories, createProductCategory, type ProductWithCost } from '../lib/api'
import { ImagePicker } from '../components/ImagePicker'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import { useCurrency } from '../lib/useCurrency'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

export default function EditProduct() {
  const { t } = useTranslation()
  const { fmtInput, parseAmount } = useCurrency()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type') === 'service' ? 'service' : 'product'
  const pageFields = getTenantConfig(user?.tenantId).pages['edit-product']?.fields ?? {}
  const showCategory    = pageFields.product_category    !== false
  const showSubcategory = pageFields.product_subcategory !== false
  const showSku         = pageFields.sku                 !== false
  const showVariant     = pageFields.variant             !== false
  const preselectedId = searchParams.get('id') || ''
  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [costStr, setCostStr] = useState('') // decimal string
  const [costOption, setCostOption] = useState<'history' | 'next' | 'specific'>('next')
  const [specificDate, setSpecificDate] = useState<string>(todayYMD())
  const [saving, setSaving] = useState(false)

  const [durationStr, setDurationStr] = useState('')
  const [priceStr, setPriceStr] = useState('')

  const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const [imageDisplayUrl, setImageDisplayUrl] = useState<string | null>(null)
  const [imageChangeData, setImageChangeData] = useState<string | null | undefined>(undefined)

  const [productCategory, setProductCategory] = useState('')
  const [productSubcategory, setProductSubcategory] = useState('')
  const [sku, setSku] = useState('')
  const [variant, setVariant] = useState('')

  const [categories, setCategories] = useState<string[]>([])
  const [subcategories, setSubcategories] = useState<string[]>([])
  const [addingCategory, setAddingCategory] = useState(false)
  const [addingSubcategory, setAddingSubcategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { products } = await listProducts()
        setProducts(products)
        // default selection — preselected id from URL, or first item matching type
        const filtered = products.filter(p => (p.category ?? 'product') === type)
        const match = preselectedId && products.find(p => p.id === preselectedId)
        if (match) setSelectedId(match.id)
        else if (filtered.length) setSelectedId(filtered[0].id)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selected = useMemo(() => products.find(p => p.id === selectedId) || null, [products, selectedId])

  useEffect(() => {
    loadCategories()
    loadSubcategories()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // When product changes, prefill fields
  useEffect(() => {
    if (!selected) return
    setNewName(selected.name)
    setCostStr(selected.cost == null ? '' : fmtInput(selected.cost, 3))
    setCostOption('next')
    setSpecificDate(todayYMD())
    if (selected.category === 'service') {
      setDurationStr(selected.duration_minutes == null ? '' : String(selected.duration_minutes))
      setPriceStr(selected.price_amount == null ? '' : fmtInput(selected.price_amount))
    } else {
      setPriceStr(selected.price_amount == null ? '' : fmtInput(selected.price_amount))
    }
    setProductCategory(selected.product_category ?? '')
    setProductSubcategory(selected.product_subcategory ?? '')
    setSku(selected.sku ?? '')
    setVariant(selected.variant ?? '')
    setImageDisplayUrl(selected.has_image ? `${BASE}/.netlify/functions/serve-product-image?id=${selected.id}&v=${Date.now()}` : null)
    setImageChangeData(undefined)
    setAddingCategory(false)
    setAddingSubcategory(false)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function parseCostInput(s: string) {
    return s.replace(/[^\d.,]/g, '')
  }

  async function save() {
    if (!selected) { alert(t('products.alertPickProduct')); return }
    const name = (newName || '').trim()
    if (!name) { alert(t('products.alertEnterName')); return }
    const costNum = parseAmount(costStr)
    if (!Number.isFinite(costNum) || costNum < 0) { alert(t('products.alertEnterValidCost')); return }

    if (costOption === 'specific' && !specificDate) {
      alert(t('products.alertSelectDate'))
      return
    }

    const durationMinutes = type === 'service' && durationStr
      ? Math.max(1, parseInt(durationStr, 10) || 60)
      : undefined
    const priceAmount: number | null | undefined = priceStr.trim() === '' ? null : parseAmount(priceStr)

    try {
      setSaving(true)
      const res = await updateProduct({
        id: selected.id,
        name: selected.category === 'service' && !!selected.external_service_id ? undefined : name,
        cost: costNum,
        apply_to_history: costOption === 'history',
        effective_date: costOption === 'specific' ? specificDate : undefined,
        duration_minutes: durationMinutes,
        price_amount: priceAmount,
        ...(imageChangeData !== undefined ? { image_data: imageChangeData } : {}),
        product_category: productCategory || null,
        product_subcategory: productSubcategory || null,
        ...(type === 'product' ? { sku: sku || null, variant: variant || null } : {}),
      })

      let message = t('products.updatedProduct', { product: res.product.name })
      if (res.applied_to_history) {
        message += ' ' + t('products.appliedToHistory')
      } else if (costOption === 'specific') {
        message += ' ' + t('products.effectiveFrom', { date: specificDate })
      }

      alert(message)
      navigate(`/products/new?type=${type}`)
    } catch (e:any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{color:'var(--color-error)'}}>{t('error')} {err}</p></div>
  if (!products.length) return <div className="card page-normal"><p>{t('products.noProducts')}</p></div>

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card page-normal">
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>{type === 'service' ? t('products.editServiceTitle') : t('products.editProductTitle')}</h3>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('product')}</label>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
            {products.filter(p => (p.category ?? 'product') === type).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>{t('products.newName')}</label>
          <input
            type="text"
            placeholder="e.g. ACE Ultra"
            value={newName}
            onChange={e=>setNewName(e.target.value)}
            disabled={selected?.category === 'service' && !!selected?.external_service_id}
            title={selected?.category === 'service' && !!selected?.external_service_id ? 'Name is managed by SimplyBook' : undefined}
          />
          {selected?.category === 'service' && !!selected?.external_service_id && (
            <p className="helper" style={{ marginTop: 4 }}>Name is synced from SimplyBook and cannot be edited here.</p>
          )}
        </div>
      </div>

      {(showCategory || showSubcategory) && (
        <div className="row" style={{ marginTop: 12 }}>
          {showCategory && (
            <div>
              <label>{type === 'service' ? 'Service category' : 'Product category'}</label>
              {addingCategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" autoFocus placeholder="Category name" value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') } }}
                    style={{ flex: 1, minWidth: 0 }} />
                  <button onClick={handleAddCategory} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>Add</button>
                  <button onClick={() => { setAddingCategory(false); setNewCategoryName(''); setProductCategory('') }} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <select value={productCategory} onChange={e => { if (e.target.value === '__new__') { setAddingCategory(true); setProductCategory('') } else setProductCategory(e.target.value) }}>
                  <option value="">—</option>
                  <option value="__new__">＋ New category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}
          {showSubcategory && (
            <div>
              <label>{type === 'service' ? 'Service subcategory' : 'Product subcategory'}</label>
              {addingSubcategory ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" autoFocus placeholder="Subcategory name" value={newSubcategoryName}
                    onChange={e => setNewSubcategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubcategory(); if (e.key === 'Escape') { setAddingSubcategory(false); setNewSubcategoryName('') } }}
                    style={{ flex: 1, minWidth: 0 }} />
                  <button onClick={handleAddSubcategory} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>Add</button>
                  <button onClick={() => { setAddingSubcategory(false); setNewSubcategoryName(''); setProductSubcategory('') }} style={{ height: 'var(--control-h)', padding: '0 10px', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <select value={productSubcategory} onChange={e => { if (e.target.value === '__new__') { setAddingSubcategory(true); setProductSubcategory('') } else setProductSubcategory(e.target.value) }}>
                  <option value="">—</option>
                  <option value="__new__">＋ New subcategory</option>
                  {subcategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {type === 'product' && (showSku || showVariant) && (
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

      {type === 'product' && (
        <div style={{ marginTop: 12 }}>
          <label>{t('products.servicePrice')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder={fmtInput(0)}
            value={priceStr}
            onChange={e => setPriceStr(parseCostInput(e.target.value))}
          />
        </div>
      )}

      {type === 'service' && (
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

      <div style={{ marginTop: 12 }}>
        <label>{t('products.newProductCostUSD')}</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder={fmtInput(0, 3)}
          value={costStr}
          onChange={e=>setCostStr(parseCostInput(e.target.value))}
        />
      </div>

      {/* Cost application options */}
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'history'}
            onChange={() => setCostOption('history')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('products.applyCostToHistory')}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'next'}
            onChange={() => setCostOption('next')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('products.applyCostFromNextOrder')}</span>
        </label>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="costOption"
              checked={costOption === 'specific'}
              onChange={() => setCostOption('specific')}
              style={{ width: 18, height: 18 }}
            />
            <span>{t('products.applyCostFromSpecificDate')}</span>
          </label>
          
          {costOption === 'specific' && (
            <div style={{ marginTop: 8, marginLeft: 28 }}>
              <DateInput
                value={specificDate}
                onChange={v => setSpecificDate(v)}
                style={{ width: '100%', maxWidth: 200 }}
              />
            </div>
          )}
        </div>
      </div>

      <ImagePicker
        label={type === 'service' ? t('products.serviceImage') : t('products.productImage')}
        value={imageDisplayUrl}
        onChange={dataUrl => { setImageDisplayUrl(dataUrl); setImageChangeData(dataUrl) }}
      />

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ height: BTN_H }}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button
          onClick={() => {
            if (selected) {
              setNewName(selected.name)
              setCostStr(selected.cost == null ? '' : fmtInput(selected.cost, 3))
              if (selected.category === 'service') {
                setDurationStr(selected.duration_minutes == null ? '' : String(selected.duration_minutes))
                setPriceStr(selected.price_amount == null ? '' : fmtInput(selected.price_amount))
              } else {
                setPriceStr(selected.price_amount == null ? '' : fmtInput(selected.price_amount))
              }
              setProductCategory(selected.product_category ?? '')
              setProductSubcategory(selected.product_subcategory ?? '')
              setSku(selected.sku ?? '')
              setVariant(selected.variant ?? '')
              setImageDisplayUrl(selected.has_image ? `${BASE}/.netlify/functions/serve-product-image?id=${selected.id}&v=${Date.now()}` : null)
            }
            setCostOption('next')
            setSpecificDate(todayYMD())
            setImageChangeData(undefined)
            setAddingCategory(false)
            setAddingSubcategory(false)
          }}
          disabled={saving}
        >
          {t('reset')}
        </button>
        <button onClick={() => navigate(`/products/new?type=${type}`)} disabled={saving}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

