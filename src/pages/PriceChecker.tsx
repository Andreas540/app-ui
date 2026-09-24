// src/pages/PriceChecker.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, type Person, type Product, getAuthHeaders } from '../lib/api'
import { optLabel } from '../lib/productOptions'
import { useCurrency } from '../lib/useCurrency'

type PriceData = {
  price_last_time: number | null
  last_sale_customer: string | null
  average_price: number | null
  order_count: number
  customer_price: number | null
}

export default function PriceChecker() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Person[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('all')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load customers and products on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { customers, products } = await fetchBootstrap()
        setCustomers(customers)
        setProducts(products)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const stdProducts = products.filter(p => p.product_kind !== 'addon' && p.category !== 'service')
  const addonProducts = products.filter(p => p.product_kind === 'addon')

  // Fetch price data when both customer and product are selected
  useEffect(() => {
    if (!selectedCustomerId || !selectedProductId) {
      setPriceData(null)
      return
    }

    (async () => {
      try {
        setDataLoading(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const res = await fetch(
  `${base}/api/price-checker?customer_id=${selectedCustomerId}&product_id=${selectedProductId}`,
  { 
    cache: 'no-store',
    headers: getAuthHeaders(),
  }
)
        
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to fetch price data (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setPriceData(data)
      } catch (e: any) {
        console.error('Price data error:', e)
        setPriceData(null)
      } finally {
        setDataLoading(false)
      }
    })()
  }, [selectedCustomerId, selectedProductId])

  const { fmtMoney } = useCurrency()

  if (loading) return <div className="card page-narrow"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-narrow"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>

  const showResults = !!selectedProductId

  return (
    <div className="card page-narrow">
      <h3 style={{ margin: 0, marginBottom: 16 }}>{t('priceChecker.title')}</h3>

      {/* Filters */}
      <div className="row row-2col-mobile" style={{ gap: 12 }}>
        <div>
          <label>{t('product')}</label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">{t('priceChecker.selectProduct')}</option>
            <optgroup label={t('priceChecker.productsGroup')}>
              {stdProducts.map((p) => (
                <option key={p.id} value={p.id}>{optLabel(p)}</option>
              ))}
            </optgroup>
            {addonProducts.length > 0 && (
              <optgroup label={t('priceChecker.addOnProductsGroup')}>
                {addonProducts.map((p) => (
                  <option key={p.id} value={p.id}>{optLabel(p)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label>{t('customer')}</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="all">{t('priceChecker.allCustomers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {showResults && (
        <div style={{ marginTop: 24 }}>
          {dataLoading ? (
            <p className="helper">{t('priceChecker.loadingPriceData')}</p>
          ) : priceData ? (
            <div style={{ display: 'grid', gap: 20 }}>
              {/* Customer price */}
              <div>
                <div className="helper" style={{ marginBottom: 8 }}>
                  {t('priceChecker.customerPrice')}
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {priceData.customer_price == null ? '—' : fmtMoney(priceData.customer_price)}
                </div>
              </div>

              {/* Price last time */}
              <div>
                <div className="helper" style={{ marginBottom: 8 }}>
                  {t('priceChecker.priceLastTime')}
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {priceData.price_last_time == null ? '—' : fmtMoney(priceData.price_last_time)}
                </div>
                {selectedCustomerId === 'all' && priceData.last_sale_customer && (
                  <div className="helper" style={{ marginTop: 4 }}>{priceData.last_sale_customer}</div>
                )}
              </div>

              {/* Average price */}
              <div>
                <div className="helper" style={{ marginBottom: 8 }}>
                  {t('priceChecker.averagePrice')}
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {priceData.average_price == null ? '—' : fmtMoney(priceData.average_price)}
                </div>
                <div className="helper" style={{ marginTop: 8 }}>
                  {t('priceChecker.previousOrders', { count: priceData.order_count })}
                </div>
              </div>
            </div>
          ) : (
            <p className="helper">{t('priceChecker.noPriceData')}</p>
          )}
        </div>
      )}

      {!showResults && (
        <p className="helper" style={{ marginTop: 24 }}>
          {t('priceChecker.selectProduct')}
        </p>
      )}
    </div>
  )
}