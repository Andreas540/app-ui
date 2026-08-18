// src/pages/EditAddonProduct.tsx
// Edit-page for Add-On Products (product_kind='coverage').
// Same select-on-left / form-on-right pattern as EditProduct.tsx.
// The form's "Extended Coverage" section surfaces coverage-specific fields
// when applicable; other add-on types may leave those blank.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCoverageProducts, type CoverageProduct } from '../lib/api'
import AddOnProductForm from './AddOnProductForm'

export default function EditAddonProduct() {
  const { t } = useTranslation()
  const [products, setProducts] = useState<CoverageProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('__new__')

  async function load() {
    try {
      setLoading(true)
      const { coverage_products } = await listCoverageProducts()
      const sorted = coverage_products.slice().sort((a, b) => a.name.localeCompare(b.name))
      setProducts(sorted)
      setSelectedId(sorted[0]?.id ?? '')
    } catch (e: any) {
      console.error('Failed to load add-on products:', e?.message || e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const editProduct = products.find(p => p.id === selectedId) ?? null

  return (
    <div className="card page-normal">
      <h3 style={{ marginTop: 0 }}>{t('products.allAddOnProducts')}</h3>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
      ) : products.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>{t('coverage.noProducts')}</div>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <label>{t('product')}</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <AddOnProductForm
            editProduct={editProduct}
            onSaved={async () => { await load() }}
            onCancelEdit={() => setSelectedId(products[0]?.id ?? '')}
          />
        </>
      )}
    </div>
  )
}
