import Modal from './Modal'
import { useCurrency } from '../lib/useCurrency'
import { useTranslation } from 'react-i18next'
import type { ProductWithCost } from '../lib/api'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

interface Props {
  product: ProductWithCost | null
  onClose: () => void
  pageFields: Record<string, boolean | undefined>
  labelProductCost?: string
}

export default function ProductDetailModal({ product, onClose, pageFields, labelProductCost }: Props) {
  const { fmtMoney } = useCurrency()
  const { t } = useTranslation()
  const costLabel = labelProductCost || t('products.productCostUSD')

  if (!product) return null

  const showVariant     = pageFields.variant      !== false
  const showSku         = pageFields.sku          !== false
  const showBarcode     = pageFields.barcode      !== false
  const showCategory    = pageFields.product_category    !== false
  const showSubcategory = pageFields.product_subcategory !== false
  const showUnitTracking = pageFields.unit_tracking !== false

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

  return (
    <Modal isOpen title={product.name} onClose={onClose}>
      {/* Top section: image + descriptors */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        {/* Image */}
        <div style={{ flexShrink: 0 }}>
          {imageUrl
            ? <img src={imageUrl} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }} />
            : <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--muted)' }}>
                {isService ? '⚙' : '📦'}
              </div>
          }
        </div>

        {/* Key descriptors */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(showCategory && product.product_category) && (
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

      {/* Pricing row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        {product.price_amount != null && (
          <div style={{ background: 'var(--input-bg, #f9f9f9)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('products.servicePrice')}</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(product.price_amount)}</div>
          </div>
        )}

        <div style={{ background: 'var(--input-bg, #f9f9f9)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {costLabel}
            {costMethodLabel && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: 'var(--primary-light, #dbeafe)', color: 'var(--primary, #2563eb)', fontWeight: 600 }}>
                {costMethodLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(product.cost ?? 0, 3)}</div>
        </div>

        {isService && product.duration_minutes != null && (
          <div style={{ background: 'var(--input-bg, #f9f9f9)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('products.duration')}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{product.duration_minutes} min</div>
          </div>
        )}

        {isProduct && showUnitTracking && unitTrackingLabel && (
          <div style={{ background: 'var(--input-bg, #f9f9f9)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('products.unitTracking')}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{unitTrackingLabel}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
