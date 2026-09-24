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

  const [open, setOpen]           = useState(defaultOpen || hideHeader)
  const [loading, setLoading]     = useState(false)
  const [products, setProducts]   = useState<ProductWithCost[]>([])
  const [listCategory, setListCategory] = useState<'product' | 'service'>('product')
  const [productSearch, setProductSearch] = useState('')
  const [showImages, setShowImages]       = useState(false)
  const [detailProduct, setDetailProduct] = useState<ProductWithCost | null>(null)
  const fetchedRef = useRef(false)

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
    const uncategorized = searchFiltered.filter(p => !p.product_category).sort((a, b) => a.name.localeCompare(b.name))
    const cats = [...new Set(searchFiltered.filter(p => p.product_category).map(p => p.product_category!))].sort()
    return [
      ...uncategorized.map(p => ({ type: 'row' as const, product: p })),
      ...cats.flatMap(cat => [
        { type: 'header' as const, cat },
        ...searchFiltered.filter(p => p.product_category === cat).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ type: 'row' as const, product: p })),
      ]),
    ]
  }, [searchFiltered])

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
                      <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{t('name')}</th>
                      {listCategory === 'product' && showVariant && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>Variant</th>}
                      {listCategory === 'product' && showVariant && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>Variant 2</th>}
                      {listCategory === 'product' && showUnitTracking && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{t('products.unitTracking')}</th>}
                      {listCategory === 'service' && <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }}>{t('products.duration')}</th>}
                      <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0 4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }}>{t('products.servicePrice')}</th>
                      <th style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0 4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }}>{listCategory === 'service' ? t('products.directServiceCost') : labelProductCost}</th>
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
