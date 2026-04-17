// src/pages/NewProduct.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createProduct, listProducts, type ProductWithCost, getAuthHeaders } from '../lib/api'
import { formatDate } from '../lib/time'

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
  const [category, setCategory] = useState<'product' | 'service'>(
    searchParams.get('type') === 'service' ? 'service' : 'product'
  )

  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const [showMoreInfo, setShowMoreInfo] = useState(false)
  const [durationStr, setDurationStr] = useState('')
  const [priceStr, setPriceStr] = useState('')

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
    const cleaned = s.replace(/[^\d.,]/g, '')
    const normalized = cleaned.replace(',', '.')
    return normalized
  }

  function fmtMoney(n: number) {
    const v = Number(n) || 0
    return v.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    })
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
  }, [])

  useEffect(() => {
    if (showHistorical) {
      loadHistoricalCosts()
    }
  }, [showHistorical])

  async function save() {
    const nm = name.trim()
    const costNum = Number(parseCostInput(costStr || ''))
    if (!nm) { alert(t('products.alertEnterName')); return }
    if (!Number.isFinite(costNum) || costNum < 0) { alert(t('products.alertEnterValidCost')); return }

    const durationMinutes = category === 'service' && showMoreInfo && durationStr
      ? Math.max(1, parseInt(durationStr, 10) || 60)
      : null
    const priceAmount = (category === 'service' && showMoreInfo && priceStr) || (category === 'product' && priceStr)
      ? Number(parseCostInput(priceStr))
      : null

    try {
      setSaving(true)
      await createProduct({ name: nm, cost: costNum, category, duration_minutes: durationMinutes, price_amount: priceAmount })
      alert(t('products.created'))
      setName('')
      setCostStr('')
      setDurationStr('')
      setPriceStr('')
      setShowMoreInfo(false)
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
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>{category === 'service' ? t('products.newServiceTitle') : t('products.newProductTitle')}</h3>
        <Link to={`/products/edit?type=${category}`}>
          <button className="primary" style={{ height: BTN_H }}>
            {category === 'service' ? t('products.editServicesButton') : t('products.editProductsButton')}
          </button>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 0, marginTop: 12, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
        {(['product', 'service'] as const).map(cat => (
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

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{category === 'service' ? t('products.serviceName') : t('products.productName')}</label>
          <input
            type="text"
            placeholder=""
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label>{category === 'service' ? t('products.directServiceCost') : t('products.productCostUSD')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={costStr}
            onChange={e => setCostStr(parseCostInput(e.target.value))}
          />
        </div>
      </div>

      {category === 'product' && (
        <div style={{ marginTop: 12 }}>
          <label>{t('products.servicePrice')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={priceStr}
            onChange={e => setPriceStr(parseCostInput(e.target.value))}
          />
        </div>
      )}

      {category === 'service' && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowMoreInfo(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}
          >
            {showMoreInfo ? `− ${t('products.lessInfo')}` : `+ ${t('products.addMoreInfo')}`}
          </button>
          {showMoreInfo && (
            <div className="row" style={{ marginTop: 10 }}>
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
                  placeholder="0.00"
                  value={priceStr}
                  onChange={e => setPriceStr(parseCostInput(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? t('saving') : t('products.saveProduct')}
        </button>
        <button onClick={() => { setName(''); setCostStr(''); setDurationStr(''); setPriceStr(''); setShowMoreInfo(false) }} disabled={saving}>
          {t('clear')}
        </button>
      </div>

      {/* ---- Product costs section ---- */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>{t('products.productCosts')}</h4>
          <button
            className="primary"
            onClick={() => setShowHistorical(!showHistorical)}
            style={{ height: BTN_H, minWidth: 140 }}
          >
            {showHistorical ? t('products.currentCosts') : t('products.historicalCosts')}
          </button>
        </div>

        {!showHistorical ? (
          // Current costs view - using filtered products
          <div
            role="list"
            aria-busy={loadingList}
            style={{ display: 'grid', gap: 6 }}
          >
            {loadingList && <div>{t('loading')}</div>}
            {!loadingList && filteredProducts.length === 0 && (
              <div style={{ opacity: 0.7 }}>{t('products.noProducts')}</div>
            )}
            {!loadingList && filteredProducts.map(p => (
              <div
                key={p.id}
                role="listitem"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border, #e6e6e6)'
                }}
                title={p.name}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                {p.category === 'service' && (
                  <span className="helper" style={{ fontSize: 11, background: 'var(--border, #e6e6e6)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                    Service
                  </span>
                )}
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(p.cost ?? 0)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Historical costs view - showing all products (no filter)
          <div
            role="list"
            aria-busy={loadingHistorical}
            style={{ display: 'grid', gap: 12 }}
          >
            {loadingHistorical && <div>{t('loading')}</div>}
            {!loadingHistorical && historicalCosts.length === 0 && (
              <div style={{ opacity: 0.7 }}>{t('products.noHistoricalCosts')}</div>
            )}
            {!loadingHistorical && Object.keys(groupedHistorical).sort().map(productName => (
              <div 
                key={productName}
                style={{ 
                  borderBottom: '2px solid var(--border, #e6e6e6)',
                  paddingBottom: 8 
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {productName}
                </div>
                {groupedHistorical[productName]
                  .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                  .map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 1fr auto',
                        alignItems: 'center',
                        padding: '4px 0 4px 16px',
                        gap: 12,
                        fontSize: 14,
                        opacity: 0.9
                      }}
                    >
                      <div className="helper">
                        {formatDate(item.effective_from)}
                      </div>
                      <div></div>
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(item.cost)}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



