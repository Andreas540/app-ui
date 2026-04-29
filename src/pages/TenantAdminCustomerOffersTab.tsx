// src/pages/TenantAdminCustomerOffersTab.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders, fetchBootstrap } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

interface CustomerOption { id: string; name: string }
interface OfferRow {
  id: string
  name: string
  price_amount: number
  offer_price_amount: number | null
  offer_is_available: boolean
}
interface EditRow {
  available: boolean
  price: string
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

interface Props {
  initialCustomerId?: string
}

export default function TenantAdminCustomerOffersTab({ initialCustomerId }: Props) {
  const { t } = useTranslation()
  const { fmtMoney } = useCurrency()

  const [customers, setCustomers]               = useState<CustomerOption[]>([])
  const [customerId, setCustomerId]             = useState(initialCustomerId || '')
  const [products, setProducts]                 = useState<OfferRow[]>([])
  const [edits, setEdits]                       = useState<Record<string, EditRow>>({})
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingProducts, setLoadingProducts]   = useState(false)
  const [saving, setSaving]                     = useState(false)
  const [saved, setSaved]                       = useState(false)
  const [error, setError]                       = useState<string | null>(null)

  useEffect(() => {
    fetchBootstrap()
      .then(d => setCustomers(
        (d.customers || [])
          .map((c: any) => ({ id: c.id, name: c.name }))
          .sort((a: CustomerOption, b: CustomerOption) => a.name.localeCompare(b.name))
      ))
      .catch(() => {})
      .finally(() => setLoadingCustomers(false))
  }, [])

  useEffect(() => {
    if (!customerId) { setProducts([]); setEdits({}); return }
    setLoadingProducts(true)
    setError(null)
    fetch(`${apiBase()}/api/get-customer-offers?customer_id=${customerId}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(d => {
        const rows: OfferRow[] = d.products || []
        setProducts(rows)
        const initial: Record<string, EditRow> = {}
        for (const p of rows) {
          initial[p.id] = {
            available: p.offer_is_available,
            price: p.offer_price_amount != null
              ? String(p.offer_price_amount)
              : String(p.price_amount ?? ''),
          }
        }
        setEdits(initial)
      })
      .catch(() => setError(t('customerOffers.errorLoad')))
      .finally(() => setLoadingProducts(false))
  }, [customerId])

  const setAvailable = (id: string, v: boolean) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], available: v } }))

  const setPrice = (id: string, v: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], price: v } }))

  async function handleSave() {
    if (!customerId) return
    setSaving(true); setSaved(false); setError(null)
    try {
      const offers = products.map(p => {
        const e = edits[p.id]
        const priceNum = parseFloat(e?.price ?? '')
        const defaultPrice = p.price_amount
        const priceChanged = Number.isFinite(priceNum) && Math.abs(priceNum - defaultPrice) > 0.001
        return {
          product_id:   p.id,
          is_available: e?.available ?? true,
          price_amount: priceChanged ? priceNum : null,
        }
      })
      const res = await fetch(`${apiBase()}/api/save-customer-offers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customer_id: customerId, offers }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const selectedCustomer = customers.find(c => c.id === customerId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Customer selector */}
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {t('customerOffers.selectCustomer')}
        </label>
        <select
          value={customerId}
          onChange={e => setCustomerId(e.target.value)}
          style={{ maxWidth: 320 }}
          disabled={loadingCustomers}
        >
          <option value="">{loadingCustomers ? t('loading') : t('customerOffers.selectCustomerPlaceholder')}</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Products table */}
      {customerId && (
        <>
          {loadingProducts ? (
            <p className="helper">{t('loading')}</p>
          ) : products.length === 0 ? (
            <p className="helper">{t('customerOffers.noProducts')}</p>
          ) : (
            <div>
              <p className="helper" style={{ margin: '0 0 12px' }}>
                {t('customerOffers.description', { name: selectedCustomer?.name ?? '' })}
              </p>

              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 160px',
                gap: '0 12px',
                paddingBottom: 6,
                borderBottom: '1px solid var(--line)',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                <div />
                <div>{t('customerOffers.product')}</div>
                <div>{t('customerOffers.price')}</div>
              </div>

              {/* Rows */}
              {products.map(p => {
                const e = edits[p.id]
                const hidden = !(e?.available ?? true)
                return (
                  <div key={p.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr 160px',
                    gap: '0 12px',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--line)',
                    opacity: hidden ? 0.4 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={e?.available ?? true}
                      onChange={ev => setAvailable(p.id, ev.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: 14, fontWeight: hidden ? 400 : 500 }}>
                      {p.name}
                      {p.price_amount != null && (
                        <span className="helper" style={{ marginLeft: 6 }}>
                          ({t('customerOffers.default')}: {fmtMoney(p.price_amount)})
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={e?.price ?? ''}
                      onChange={ev => setPrice(p.id, ev.target.value)}
                      disabled={hidden}
                      style={{ height: 36, fontSize: 14, padding: '0 8px' }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {error && <p style={{ color: 'var(--color-error)', fontSize: 13 }}>{error}</p>}

          {!loadingProducts && products.length > 0 && (
            <div>
              <button
                className="primary"
                onClick={handleSave}
                disabled={saving}
                style={{ height: 36, padding: '0 20px', fontSize: 14 }}
              >
                {saving ? t('saving') : saved ? t('saved') : t('save')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
