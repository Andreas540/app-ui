import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProducts, type ProductWithCost } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import ProductDetailModal from './ProductDetailModal'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

interface Props {
  defaultOpen?: boolean
  hideHeader?: boolean
}

export default function SearchProductsCard({ defaultOpen = false, hideHeader = false }: Props) {
  const { t } = useTranslation()
  const { fmtMoney } = useCurrency()
  const { user } = useAuth()
  const pageFields = getTenantConfig(user?.tenantId).pages['new-product']?.fields ?? {}
  const btLabels = (user as any)?.businessTypeConfig?.labels ?? {}
  const labelProductCost: string = btLabels.productCostPerUnit || t('products.productCostUSD')

  const showVariant      = pageFields.variant        !== false
  const showUnitTracking = pageFields.unit_tracking  !== false
  const showProductTab   = pageFields.show_product_tab !== false
  const showServiceTab   = pageFields.show_service_tab !== false

  type SortCol = 'name' | 'variant' | 'variant_2' | 'unit' | 'price' | 'cost'

  const [open, setOpen]           = useState(defaultOpen || hideHeader)
  const [loading, setLoading]     = useState(false)
  const [products, setProducts]   = useState<ProductWithCost[]>([])
  const [listCategory, setListCategory] = useState<'product' | 'service'>('product')
  const [productSearch, setProductSearch] = useState('')
  const [showImages, setShowImages]       = useState(false)
  const [detailProduct, setDetailProduct] = useState<ProductWithCost | null>(null)
  const [sortCol, setSortCol]     = useState<SortCol>('name')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc')
  const fetchedRef = useRef(false)

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'price' || col === 'cost' ? 'desc' : 'asc') }
  }

  function thStyle(col: SortCol, align: 'left' | 'right' = 'left') {
    const active = sortCol === col
    return {
      fontSize: 12, fontWeight: 600,
      color: active ? 'var(--primary)' : 'var(--text-secondary)',
      padding: align === 'right' ? '4px 0 4px 8px' : '4px 8px 4px 0',
      borderBottom: '1px solid var(--border)', textAlign: align as 'left' | 'right',
      cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const,
    }
  }

  function thArrow(col: SortCol) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  }

  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    listProducts()
      .then(({ products: raw }) => setProducts(raw.filter(p => p.product_kind !== 'addon')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  const filtered = useMemo(() =>
    products.filter(p => (p.category ?? 'product') === listCategory),
    [products, listCategory]
  )

  const searchFiltered = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.variant ?? '').toLowerCase().includes(q) ||
      (p.variant_2 ?? '').toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q)
    )
  }, [filtered, productSearch])

  type Entry = { type: 'row'; product: ProductWithCost } | { type: 'header'; cat: string }
  const sorted: Entry[] = useMemo(() => {
    if (sortCol !== 'name') {
      // Flat sort — no category grouping
      const arr = [...searchFiltered]
      arr.sort((a, b) => {
        let v = 0
        if (sortCol === 'variant')   v = (a.variant ?? '').localeCompare(b.variant ?? '')
        else if (sortCol === 'variant_2') v = (a.variant_2 ?? '').localeCompare(b.variant_2 ?? '')
        else if (sortCol === 'unit') v = (a.unit_tracking ?? '').localeCompare(b.unit_tracking ?? '')
        else if (sortCol === 'price') v = Number(a.price_amount ?? 0) - Number(b.price_amount ?? 0)
        else if (sortCol === 'cost') v = Number(a.cost ?? 0) - Number(b.cost ?? 0)
        return sortDir === 'asc' ? v : -v
      })
      return arr.map(p => ({ type: 'row' as const, product: p }))
    }
    // Name sort — preserve category grouping
    const dir = sortDir === 'asc' ? 1 : -1
    const uncategorized = searchFiltered.filter(p => !p.product_category).sort((a, b) => dir * a.name.localeCompare(b.name))
    const cats = [...new Set(searchFiltered.filter(p => p.product_category).map(p => p.product_category!))].sort()
    return [
      ...uncategorized.map(p => ({ type: 'row' as const, product: p })),
      ...cats.flatMap(cat => [
        { type: 'header' as const, cat },
        ...searchFiltered.filter(p => p.product_category === cat).sort((a, b) => dir * a.name.localeCompare(b.name)).map(p => ({ type: 'row' as const, product: p })),
      ]),
    ]
  }, [searchFiltered, sortCol, sortDir])

  const tabs = ([
    showProductTab && { key: 'product' as const, label: t('products.allProducts') },
    showServiceTab && { key: 'service' as const, label: t('products.allServices') },
  ].filter(Boolean) as Array<{ key: 'product' | 'service'; label: string }>)

  return (
    <>
      <div className="card page-normal" style={{ marginTop: 12 }}>
        {!hideHeader && (
          <div
            onClick={() => setOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 4 : 0 }}
          >
            <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
            <h3 style={{ margin: 0 }}>
              {listCategory === 'service' ? t('products.allServices') : t('products.allProducts')}
            </h3>
          </div>
        )}

        {open && (
          <>
            {/* Category tabs */}
            {tabs.length > 1 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, borderBottom: '1px solid var(--separator, var(--border))' }}>
                {tabs.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setListCategory(key); setProductSearch('') }}
                    style={{
                      background: 'none', border: 'none', fontSize: 14,
                      padding: '6px 14px 10px', marginBottom: -1, cursor: 'pointer',
                      borderBottom: listCategory === key ? '2px solid var(--primary)' : '2px solid transparent',
                      color: listCategory === key ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: listCategory === key ? 600 : 400,
                    }}
                  >{label}</button>
                ))}
              </div>
            )}

            {/* Search + images toggle */}
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                placeholder={listCategory === 'service' ? 'Search by name…' : 'Search by name, variant, SKU…'}
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                style={{ width: '100%' }}
              />
              <button
                onClick={() => setShowImages(v => !v)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', marginTop: 6 }}
              >
                {showImages ? t('products.hideImages') : t('products.showImages')}
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', marginTop: 4 }}>
              {loading ? (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
              ) : searchFiltered.length === 0 ? (
                <div style={{ opacity: 0.7, fontSize: 14 }}>{productSearch.trim() ? 'No products match your search.' : t('products.noProducts')}</div>
              ) : (
                <table style={{ width: '100%', minWidth: showImages ? 440 : undefined, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {showImages && <th style={{ padding: '4px 8px 4px 0', borderBottom: '1px solid var(--border)', width: 48 }} />}
                      <th onClick={() => toggleSort('name')} style={thStyle('name')}>{t('name')}{thArrow('name')}</th>
                      {listCategory === 'product' && showVariant && <th onClick={() => toggleSort('variant')} style={thStyle('variant')}>Variant{thArrow('variant')}</th>}
                      {listCategory === 'product' && showVariant && <th onClick={() => toggleSort('variant_2')} style={thStyle('variant_2')}>Variant 2{thArrow('variant_2')}</th>}
                      {listCategory === 'product' && showUnitTracking && <th onClick={() => toggleSort('unit')} style={thStyle('unit')}>{t('products.unitTracking')}{thArrow('unit')}</th>}
                      {listCategory === 'service' && <th onClick={() => toggleSort('unit')} style={thStyle('unit', 'right')}>{t('products.duration')}{thArrow('unit')}</th>}
                      <th onClick={() => toggleSort('price')} style={thStyle('price', 'right')}>{t('products.servicePrice')}{thArrow('price')}</th>
                      <th onClick={() => toggleSort('cost')} style={thStyle('cost', 'right')}>{listCategory === 'service' ? t('products.directServiceCost') : labelProductCost}{thArrow('cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(entry =>
                      entry.type === 'header' ? (
                        <tr key={`hdr-${entry.cat}`}>
                          <td colSpan={(showImages ? 1 : 0) + 1 + (listCategory === 'product' ? (showVariant ? 2 : 0) + (showUnitTracking ? 1 : 0) : 1) + 2}
                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '10px 0 2px', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                            {entry.cat}
                          </td>
                        </tr>
                      ) : (
                        <tr key={entry.product.id} onClick={() => setDetailProduct(entry.product)} style={{ cursor: 'pointer' }}>
                          {showImages && (
                            <td style={{ padding: '4px 8px 4px 0', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                              {entry.product.has_image
                                ? <img src={`${BASE}/.netlify/functions/serve-product-image?id=${entry.product.id}`} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--border)' }} />
                              }
                            </td>
                          )}
                          <td style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>{entry.product.name}</td>
                          {listCategory === 'product' && showVariant && (
                            <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', color: entry.product.variant ? undefined : 'var(--text-secondary)' }}>{entry.product.variant || '—'}</td>
                          )}
                          {listCategory === 'product' && showVariant && (
                            <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', color: entry.product.variant_2 ? undefined : 'var(--text-secondary)' }}>{entry.product.variant_2 || '—'}</td>
                          )}
                          {listCategory === 'product' && showUnitTracking && (
                            <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              {entry.product.unit_tracking === 'on_promote' ? t('products.unitTrackingOnPromote')
                                : entry.product.unit_tracking === 'serialized_intake' ? t('products.unitTrackingSerializedIntake')
                                : t('products.unitTrackingNone')}
                            </td>
                          )}
                          {listCategory === 'service' && (
                            <td style={{ fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {entry.product.duration_minutes != null ? `${entry.product.duration_minutes} min` : '—'}
                            </td>
                          )}
                          <td style={{ fontSize: 13, padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{entry.product.price_amount != null ? fmtMoney(entry.product.price_amount) : '—'}</td>
                          <td style={{ fontSize: 13, padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {entry.product.cost_method && entry.product.cost_method !== 'manual' && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: 'var(--primary-light, #dbeafe)', color: 'var(--primary, #2563eb)', fontWeight: 600, marginRight: 6 }}>
                                {entry.product.cost_method === 'last_purchase' ? 'last' : entry.product.cost_method.replace('avg_', 'avg ')}
                              </span>
                            )}
                            {fmtMoney(entry.product.cost ?? 0, 3)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        pageFields={pageFields}
        labelProductCost={labelProductCost}
      />
    </>
  )
}
