// src/pages/EditAddonProduct.tsx
// Edit-page for Add-On Products (product_kind='addon').
// Same pattern as EditProduct.tsx: select from list, edit form, Cancel/Save navigate back.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listCoverageProducts, type CoverageProduct } from '../lib/api'
import AddOnProductForm from './AddOnProductForm'

export default function EditAddonProduct() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [products, setProducts] = useState<CoverageProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')

  async function load() {
    try {
      setLoading(true)
      const { coverage_products } = await listCoverageProducts()
      const sorted = coverage_products.slice().sort((a, b) => a.name.localeCompare(b.name))
      setProducts(sorted)
      if (sorted.length) setSelectedId(id => id || sorted[0].id)
    } catch (e: any) {
      console.error('Failed to load add-on products:', e?.message || e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const editProduct = products.find(p => p.id === selectedId) ?? null

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (!products.length) return <div className="card page-normal"><p>{t('coverage.noProducts')}</p></div>

  return (
    <div className="card page-normal">
      <h3 style={{ margin: 0 }}>{t('products.editAddonProductTitle')}</h3>

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
        onSaved={() => navigate('/products/new')}
        onCancelEdit={() => navigate('/products/new')}
      />
    </div>
  )
}
