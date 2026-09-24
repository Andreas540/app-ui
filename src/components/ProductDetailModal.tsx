import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useCurrency } from '../lib/useCurrency'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import type { ProductWithCost } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type PriceData = {
  price_last_time: number | null
  last_sale_customer: string | null
  average_price: number | null
  order_count: number
}

type InventoryData = {
  qty: number
  committed: number
  on_order: number
  available_total: number
}

interface Props {
  product: ProductWithCost | null
  onClose: () => void
  pageFields: Record<string, boolean | undefined>
  labelProductCost?: string
}

export default function ProductDetailModal({ product, onClose, pageFields, labelProductCost }: Props) {
  const { fmtMoney, fmtNumber } = useCurrency()
  const { t } = useTranslation()
  const { user } = useAuth()
  const costLabel = labelProductCost || t('products.productCostUSD')
  const isRetail = (user as any)?.businessTypeConfig?.inventory_mode === 'retail'

  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [invData, setInvData] = useState<InventoryData | null>(null)
  const [invLoading, setInvLoading] = useState(false)

  useEffect(() => {
    if (!product) { setPriceData(null); setInvData(null); return }
    setPriceData(null)
    setPriceLoading(true)
    fetch(`${BASE}/api/price-checker?customer_id=all&product_id=${product.id}`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setPriceData(data))
      .catch(() => setPriceData(null))
      .finally(() => setPriceLoading(false))

    // Only fetch inventory for physical products
    if ((product.category ?? 'product') !== 'product') return
    setInvData(null)
    setInvLoading(true)
    fetch(`${BASE}/api/product-inventory?product_id=${product.id}`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setInvData(data?.inventory ?? null))
      .catch(() => setInvData(null))
      .finally(() => setInvLoading(false))
  }, [product?.id])

  if (!product) return null

  const showVariant      = pageFields.variant             !== false
  const showSku          = pageFields.sku                 !== false
  const showBarcode      = pageFields.barcode             !== false
  const showCategory     = pageFields.product_category    !== false
  const showSubcategory  = pageFields.product_subcategory !== false
  const showUnitTracking = pageFields.unit_tracking       !== false

  const isProduct = (product.category ?? 'product') === 'product'
  const isService = product.category === 'service'

  const costMethodLabel = product.cost_method && product.cost_method !== 'manual'
    ? product.cost_method === 'last_purchase' ? 'last' : product.cost_method.replace('avg_', 'avg ')
    : null

  const imageUrl = product.has_image
    ? `${BASE}/.netlify/functions/serve-product-image?id=${product.id}`
    : null

  const unitTrackingLabel =
    product.unit_tracking === 'on_promote' ? t('products.unitTrackingOnPromote')
    : product.unit_tracking === 'serialized_intake' ? t('products.unitTrackingSerializedIntake')
    : null

  const tile = (label: React.ReactNode, value: React.ReactNode, sub?: React.ReactNode) => (
    <div style={{ background: 'var(--input-bg, #f9f9f9)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <Modal isOpen title={product.name} onClose={onClose}>
      {/* Top section: image + descriptors */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ flexShrink: 0 }}>
          {imageUrl
            ? <img src={imageUrl} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }} />
            : <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--muted)' }}>
                {isService ? '⚙' : '📦'}
              </div>
          }
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {showCategory && product.product_category && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{product.product_category}</span>
              {showSubcategory && product.product_subcategory && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>›</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{product.product_subcategory}</span>
                </>
              )}
            </div>
          )}

          {showVariant && isProduct && (product.variant || product.variant_2) && (
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {[product.variant, product.variant_2].filter(Boolean).join(' · ')}
            </div>
          )}

          {showSku && isProduct && product.sku && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              SKU: {product.sku}
            </div>
          )}

          {showBarcode && isProduct && product.barcode && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              EAN: {product.barcode}
            </div>
          )}
        </div>
      </div>

      {/* Row 1: Customer price · Price last sale · Avg price all sales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {tile(t('products.servicePrice'), product.price_amount != null ? fmtMoney(product.price_amount) : '—')}

        {tile(
          t('priceChecker.priceLastTime'),
          priceLoading ? '…' : (priceData?.price_last_time != null ? fmtMoney(priceData.price_last_time) : '—'),
          !priceLoading && priceData?.last_sale_customer ? priceData.last_sale_customer : undefined
        )}

        {tile(
          t('priceChecker.averagePrice'),
          priceLoading ? '…' : (priceData?.average_price != null ? fmtMoney(priceData.average_price) : '—'),
          !priceLoading && priceData != null
            ? t('priceChecker.previousOrders', { count: priceData.order_count })
            : undefined
        )}
      </div>

      {/* Row 2: Production cost · Duration · Unit tracking */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: isProduct ? 12 : 0 }}>
        {tile(
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {costLabel}
            {costMethodLabel && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: 'var(--primary-light, #dbeafe)', color: 'var(--primary, #2563eb)', fontWeight: 600 }}>
                {costMethodLabel}
              </span>
            )}
          </span>,
          fmtMoney(product.cost ?? 0, 3)
        )}

        {isService && product.duration_minutes != null &&
          tile(t('products.duration'), `${product.duration_minutes} min`)
        }

        {isProduct && showUnitTracking && unitTrackingLabel &&
          tile(t('products.unitTracking'), unitTrackingLabel)
        }
      </div>

      {/* Row 3: Inventory — products only */}
      {isProduct && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {invLoading ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--text-secondary)' }}>{t('loading')}</div>
          ) : (() => {
            const inv = invData
            const fmt = (n: number) => fmtNumber(n)
            const numStyle = (n: number): React.CSSProperties => ({
              fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: n < 0 ? 'var(--color-error)' : n === 0 ? 'var(--text-secondary)' : undefined,
            })
            if (isRetail) return (
              <>
                {tile(t('warehouse.inStockColumn'),    <span style={numStyle(inv?.qty ?? 0)}>{fmt(inv?.qty ?? 0)}</span>)}
                {tile(t('warehouse.committedColumn'),  <span style={numStyle(inv?.committed ?? 0)}>{fmt(inv?.committed ?? 0)}</span>)}
                {tile(t('warehouse.availableColumn'),  <span style={numStyle(inv?.available_total ?? 0)}>{fmt(inv?.available_total ?? 0)}</span>)}
                {tile(t('warehouse.onOrderColumn'),    <span style={{ ...numStyle(inv?.on_order ?? 0), color: (inv?.on_order ?? 0) > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>{fmt(inv?.on_order ?? 0)}</span>)}
              </>
            )
            return (
              <>
                {tile(t('warehouse.totalQtyColumn'),        <span style={numStyle(inv?.qty ?? 0)}>{fmt(inv?.qty ?? 0)}</span>)}
                {tile(t('warehouse.committedColumn'),       <span style={numStyle(inv?.committed ?? 0)}>{fmt(inv?.committed ?? 0)}</span>)}
                {tile(t('warehouse.availableTotalColumn'),  <span style={numStyle(inv?.available_total ?? 0)}>{fmt(inv?.available_total ?? 0)}</span>)}
                {tile(t('warehouse.onOrderColumn'),         <span style={{ ...numStyle(inv?.on_order ?? 0), color: (inv?.on_order ?? 0) > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>{fmt(inv?.on_order ?? 0)}</span>)}
              </>
            )
          })()}
        </div>
      )}
    </Modal>
  )
}
