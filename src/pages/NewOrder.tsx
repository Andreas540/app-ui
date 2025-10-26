// src/pages/NewOrder.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchBootstrap, createOrder, type Person, type Product } from '../lib/api'
import { todayYMD } from '../lib/time'

type PartnerRef = { id: string; name: string }

export default function NewOrder() {
  const navigate = useNavigate()
  const location = useLocation()

  const [people, setPeople] = useState<Person[]>([])
  const [partners, setPartners] = useState<PartnerRef[]>([]) // from partners table
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Customer search + selection
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [entityId, setEntityId] = useState('')

  // Form fields
  const [productId, setProductId] = useState('')
  const [orderDate, setOrderDate] = useState<string>(todayYMD())
  const [qtyStr, setQtyStr] = useState('') // integer string (digits only)
  const [priceStr, setPriceStr] = useState('') // decimal string (can be negative for Refund/Discount)
  const [delivered, setDelivered] = useState(false) // default unchecked
  const [notes, setNotes] = useState('') // optional notes

  // Partner splits - per-item amounts
  const [partner1Id, setPartner1Id] = useState('')
  const [partner2Id, setPartner2Id] = useState('')
  const [partner1PerItemStr, setPartner1PerItemStr] = useState('')
  const [partner2PerItemStr, setPartner2PerItemStr] = useState('')

  const [showMoreFields, setShowMoreFields] = useState(false)
  const [productCostStr, setProductCostStr] = useState('')
  const [shippingCostStr, setShippingCostStr] = useState('')
  const [historicalProductCost, setHistoricalProductCost] = useState<number | null>(null)
  const [historicalShippingCost, setHistoricalShippingCost] = useState<number | null>(null)
  const [historicalPrice, setHistoricalPrice] = useState<number | null>(null)

  // Formatters
  const intFmt = useMemo(() => new Intl.NumberFormat('en-US'), [])
  const usdFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), [])

  // Read URL parameters for pre-populating customer
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const customerId = params.get('customer_id')
    const customerName = params.get('customer_name')
    if (customerId && customerName) {
      setEntityId(customerId)
      setQuery(customerName)
    }
  }, [location.search])

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers, products, partners: bootPartners } = await fetchBootstrap()
        setPeople(customers)
        setProducts(products)
        setPartners(bootPartners ?? [])
        if (products[0]) setProductId(products[0].id)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Fetch historical costs when product or customer changes
  useEffect(() => {
    if (!productId || !entityId || !orderDate) return
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/historical-costs?product_id=${productId}&customer_id=${entityId}&order_date=${orderDate}`)
        if (res.ok) {
          const data = await res.json()
          setHistoricalProductCost(data.product_cost)
          setHistoricalShippingCost(data.shipping_cost)
        }
      } catch (e) {
        console.error('Failed to fetch historical costs:', e)
      }
    })()
  }, [productId, entityId, orderDate])

  // Fetch last price when product or customer changes
  useEffect(() => {
    if (!productId || !entityId || !orderDate) return
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/last-price?product_id=${productId}&customer_id=${entityId}&order_date=${orderDate}`)
        if (res.ok) {
          const data = await res.json()
          setHistoricalPrice(data.unit_price)
        }
      } catch (e) {
        console.error('Failed to fetch last price:', e)
      }
    })()
  }, [productId, entityId, orderDate])

  const person = useMemo(() => people.find(p => p.id === entityId), [people, entityId])
  const product = useMemo(() => products.find(p => p.id === productId), [products, productId])

  // Is this the Refund/Discount product? (name match, case-insensitive)
  const isRefundProduct = useMemo(
    () => (product?.name || '').trim().toLowerCase() === 'refund/discount',
    [product]
  )

  // Suggestions (like Customers.tsx)
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const uniq = new Set<string>()
    return people
      .filter(c => c.name.toLowerCase().includes(q))
      .filter(c => (uniq.has(c.name.toLowerCase()) ? false : (uniq.add(c.name.toLowerCase()), true)))
      .slice(0, 5)
  }, [query, people])

  function pickSuggestion(id: string, name: string) {
    setEntityId(id)
    setQuery(name)
    setFocused(false)
    inputRef.current?.blur()
  }

  // Helpers
  function parseQty(s: string) {
    const digits = s.replace(/\D/g, '')
    return digits.replace(/^0+(?=\d)/, '')
  }
  function parsePriceToNumber(s: string) {
    const m = s.match(/-?\d+(?:[.,]\d+)?/)
    if (!m) return NaN
    return Number(m[0].replace(',', '.'))
  }

  const qtyInt = useMemo(() => parseInt(qtyStr || '0', 10), [qtyStr])
  const priceNum = useMemo(() => parsePriceToNumber(priceStr), [priceStr])

  const orderValue = useMemo(() => {
    if (!Number.isInteger(qtyInt) || qtyInt <= 0) return NaN
    if (!Number.isFinite(priceNum)) return NaN
    return qtyInt * priceNum
  }, [qtyInt, priceNum])

  // Partner totals
  const partner1PerItem = useMemo(() => parsePriceToNumber(partner1PerItemStr), [partner1PerItemStr])
  const partner2PerItem = useMemo(() => parsePriceToNumber(partner2PerItemStr), [partner2PerItemStr])

  const partner1Total = useMemo(() => {
    if (!Number.isFinite(partner1PerItem) || partner1PerItem <= 0) return 0
    if (!Number.isInteger(qtyInt) || qtyInt <= 0) return 0
    return partner1PerItem * qtyInt
  }, [partner1PerItem, qtyInt])
  const partner2Total = useMemo(() => {
    if (!Number.isFinite(partner2PerItem) || partner2PerItem <= 0) return 0
    if (!Number.isInteger(qtyInt) || qtyInt <= 0) return 0
    return partner2PerItem * qtyInt
  }, [partner2PerItem, qtyInt])

  // Effective costs (override or historical)
  const effectiveProductCost = useMemo(() => {
    const override = productCostStr.trim() ? parsePriceToNumber(productCostStr) : null
    if (override !== null && Number.isFinite(override)) return override
    return historicalProductCost ?? 0
  }, [productCostStr, historicalProductCost])

  const effectiveShippingCost = useMemo(() => {
    const override = shippingCostStr.trim() ? parsePriceToNumber(shippingCostStr) : null
    if (override !== null && Number.isFinite(override)) return override
    return historicalShippingCost ?? 0
  }, [shippingCostStr, historicalShippingCost])

  // Profit (only for positive order values)
  const profit = useMemo(() => {
    if (!Number.isFinite(orderValue) || orderValue <= 0) return 0
    const totalPartners = partner1Total + partner2Total
    const totalProductCost = effectiveProductCost * qtyInt
    const totalShippingCost = effectiveShippingCost * qtyInt
    return orderValue - totalPartners - totalProductCost - totalShippingCost
  }, [orderValue, partner1Total, partner2Total, effectiveProductCost, effectiveShippingCost, qtyInt])

  const profitPercent = useMemo(() => {
    if (!Number.isFinite(orderValue) || orderValue <= 0) return 0
    return (profit / orderValue) * 100
  }, [profit, orderValue])

  // Customer type
  const personCustomerType = (person as any)?.customer_type
  const isPartnerCustomer = personCustomerType === 'Partner'

  const partner2Options = useMemo(
    () => partners.filter(p => p.id !== partner1Id),
    [partners, partner1Id]
  )

  // ---- Refund/Discount behaviors ----
  useEffect(() => {
    if (isRefundProduct) {
      setPriceStr(prev => {
        const cleaned = (prev ?? '').replace(/^-+/, '')
        const next = '-' + cleaned
        return next === '-' ? '-' : next
      })
    } else {
      setPriceStr(prev => (prev ?? '').replace(/^-+/, ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefundProduct])

  const onPriceKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isRefundProduct) return
    const target = e.target as HTMLInputElement
    const { selectionStart, selectionEnd, value } = target
    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) {
      e.preventDefault(); return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) {
      e.preventDefault(); return
    }
  }

  const onPriceChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value
    if (isRefundProduct) {
      const withoutSigns = raw.replace(/^[+-]+/, '')
      const v = '-' + withoutSigns
      setPriceStr(v === '-' ? '-' : v)
    } else {
      setPriceStr(raw.replace(/^[+-]+/, ''))
    }
  }

  const isMinusOnly = isRefundProduct && priceStr.trim() === '-'

  // --- Presentation helpers ---
  const formattedQty = qtyStr ? intFmt.format(Number(qtyStr)) : ''
  const orderValueStr = Number.isFinite(orderValue) ? usdFmt.format(orderValue as number) : ''
  const partner1TotalStr = partner1Total > 0 ? usdFmt.format(partner1Total) : ''
  const partner2TotalStr = partner2Total > 0 ? usdFmt.format(partner2Total) : ''

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!people.length || !products.length) return <div className="card"><p>No data yet.</p></div>

  const CONTROL_H = 44

  return (
    <div className="card" style={{maxWidth: 720}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
        <h3 style={{ margin:0 }}>New Order</h3>

        {/* Profit display - top right (only for positive orders) */}
        {Number.isFinite(orderValue) && orderValue > 0 && (
          <div style={{ textAlign:'right', fontSize: 14 }}>
            <div style={{ color: 'var(--text-secondary)' }}>Profit</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: profit >= 0 ? 'var(--primary)' : 'salmon' }}>
              ${profit.toFixed(2)}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
              {profitPercent.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Search customer (full width) */}
      <div style={{ marginTop: 12, position: 'relative' }}>
        <label>Search customer</label>
        <input
          ref={inputRef}
          placeholder="Start typing a name…"
          value={query}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            if (person && !person.name.toLowerCase().includes(val.trim().toLowerCase())) {
              setEntityId('')
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          style={{ height: CONTROL_H }}
        />

        {(focused && query && suggestions.length > 0) && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              borderRadius: 10,
              background: 'rgba(47,109,246,0.90)',
              color: '#fff',
              padding: 6,
              zIndex: 50,
              boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
            }}
          >
            {suggestions.map(s => (
              <button
                key={s.id}
                className="primary"
                onClick={() => pickSuggestion(s.id, s.name)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  padding: '8px 10px',
                  color: '#fff',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product | Order date */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Product</label>
          <select
            value={productId}
            onChange={e=>setProductId(e.target.value)}
            style={{ height: CONTROL_H }}
          >
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Order date</label>
          <input
            type="date"
            value={orderDate}
            onChange={e=>setOrderDate(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      {/* Quantity | Price | Price last time - now equal thirds */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label>Quantity</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formattedQty}
            onChange={e => setQtyStr(parseQty(e.target.value))}
            style={{ height: CONTROL_H }}
          />
        </div>
        <div>
          <label>Price</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={priceStr}
            onChange={onPriceChange}
            onKeyDown={onPriceKeyDown}
            style={{
              height: CONTROL_H,
              color: isMinusOnly ? 'var(--text-secondary)' : undefined,
              opacity: isMinusOnly ? 0.6 : undefined,
            }}
          />
        </div>
        <div>
          <label>Price last time</label>
          <input
            type="text"
            value={
              historicalPrice !== null
                ? (isRefundProduct ? (-Math.abs(historicalPrice)).toFixed(2) : historicalPrice.toFixed(2))
                : '—'
            }
            placeholder="—"
            readOnly
            style={{ height: CONTROL_H, opacity: 0.6 }}
          />
        </div>
      </div>

      {/* Order value | Delivered */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Order value</label>
          <input
            type="text"
            value={orderValueStr}
            placeholder="auto"
            readOnly
            style={{ height: CONTROL_H, opacity: 0.9, color: Number.isFinite(orderValue) && orderValue < 0 ? 'salmon' : undefined }}
          />
        </div>

        {/* Delivered: only the checkbox toggles; show "Yes" only when checked */}
        <div>
          <label>Delivered</label>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
            <input
              type="checkbox"
              checked={delivered}
              onChange={e => setDelivered(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            {delivered && <span className="helper">Yes</span>}
          </div>
        </div>
      </div>

      {/* Partner splits (only when selected customer's customer_type === 'Partner') */}
      {isPartnerCustomer && (
        <>
          {/* Partner 1 row: now equal thirds */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label>Partner 1</label>
              <select
                value={partner1Id}
                onChange={e=>setPartner1Id(e.target.value)}
                style={{ height: CONTROL_H }}
              >
                <option value="">—</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Per item</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={partner1PerItemStr}
                onChange={e=>setPartner1PerItemStr(e.target.value)}
                style={{ height: CONTROL_H }}
              />
            </div>
            <div>
              <label>To Partner 1</label>
              <input
                type="text"
                value={partner1TotalStr}
                placeholder="auto"
                readOnly
                style={{ height: CONTROL_H, opacity: 0.6 }}
              />
            </div>
          </div>

          {/* Partner 2 row: now equal thirds */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label>Partner 2</label>
              <select
                value={partner2Id}
                onChange={e=>setPartner2Id(e.target.value)}
                style={{ height: CONTROL_H }}
              >
                <option value="">—</option>
                {partner2Options.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Per item</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={partner2PerItemStr}
                onChange={e=>setPartner2PerItemStr(e.target.value)}
                style={{ height: CONTROL_H }}
              />
            </div>
            <div>
              <label>To Partner 2</label>
              <input
                type="text"
                value={partner2TotalStr}
                placeholder="auto"
                readOnly
                style={{ height: CONTROL_H, opacity: 0.6 }}
              />
            </div>
          </div>
        </>
      )}

      {/* Notes field - always shows, always last */}
      <div style={{ marginTop: 12 }}>
        <label>Notes (optional)</label>
        <input
          type="text"
          placeholder="Add notes about this order..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ height: CONTROL_H }}
        />
      </div>

      {/* More fields - Product cost and Shipping cost */}
      {showMoreFields && (
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          <div>
            <label>Product cost this order</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={productCostStr}
              onChange={e => setProductCostStr(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
          <div>
            <label>Shipping cost this order</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={shippingCostStr}
              onChange={e => setShippingCostStr(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={async () => {
          // save flow
          if (!person) { alert('Select a customer first'); return }
          if (!product) { alert('Pick a product'); return }

          const qty = parseInt(qtyStr || '0', 10)
          if (!Number.isInteger(qty) || qty <= 0) { alert('Enter a quantity > 0'); return }

          const unitPrice = parsePriceToNumber(priceStr)
          if (!Number.isFinite(unitPrice)) { alert('Enter a valid unit price'); return }
          if (isRefundProduct) {
            if (!(unitPrice < 0)) { alert('Refund/Discount requires a NEGATIVE unit price'); return }
          } else {
            if (!(unitPrice > 0)) { alert('Enter a unit price > 0'); return }
          }

          // Build partner_splits only for Partner customers
          const splits: Array<{ partner_id: string; amount: number }> = []
          if (isPartnerCustomer) {
            if (partner1Id && partner1PerItemStr) {
              const per = parsePriceToNumber(partner1PerItemStr)
              if (Number.isFinite(per) && per > 0 && qty > 0) splits.push({ partner_id: partner1Id, amount: per * qty })
            }
            if (partner2Id && partner2PerItemStr) {
              const per = parsePriceToNumber(partner2PerItemStr)
              if (Number.isFinite(per) && per > 0 && qty > 0) splits.push({ partner_id: partner2Id, amount: per * qty })
            }
          }

          // Parse optional cost overrides
          let productCostToSend: number | undefined = undefined
          let shippingCostToSend: number | undefined = undefined

          if (productCostStr.trim()) {
            const parsed = parsePriceToNumber(productCostStr)
            if (Number.isFinite(parsed) && parsed > 0) productCostToSend = parsed
          }

          if (shippingCostStr.trim()) {
            const parsed = parsePriceToNumber(shippingCostStr)
            if (Number.isFinite(parsed) && parsed >= 0) shippingCostToSend = parsed
          }

          try {
            const { order_no } = await createOrder({
              customer_id: person.id,
              product_id: product.id,
              qty,
              unit_price: unitPrice,
              date: orderDate,
              delivered,
              discount: 0,
              notes: notes.trim() || undefined,
              product_cost: productCostToSend,
              shipping_cost: shippingCostToSend,
              partner_splits: splits.length ? splits : undefined,
            })

            alert(`Saved! Order #${order_no}`)

            // Post-save reset
            const params = new URLSearchParams(location.search)
            const returnTo = params.get('return_to')
            const returnId = params.get('return_id')

            if (returnTo === 'customer' && returnId) {
              navigate(`/customers/${returnId}`)
              return
            }

            setQtyStr('')
            setPriceStr('')
            setOrderDate(todayYMD())
            setDelivered(false)
            setNotes('')
            setPartner1Id(''); setPartner2Id('')
            setPartner1PerItemStr(''); setPartner2PerItemStr('')
            setProductCostStr(''); setShippingCostStr('')
            setShowMoreFields(false)
          } catch (e: any) {
            alert(e?.message || 'Save failed')
          }
        }} style={{ height: CONTROL_H }}>Save order</button>

        <button
          onClick={() => {
            setQtyStr(''); setPriceStr(''); setNotes(''); setQuery(''); setEntityId('');
            setPartner1Id(''); setPartner2Id(''); setPartner1PerItemStr(''); setPartner2PerItemStr('');
            setProductCostStr(''); setShippingCostStr(''); setShowMoreFields(false);
          }}
          style={{ height: CONTROL_H }}
        >
          Clear
        </button>
        <button
          onClick={() => setShowMoreFields(v => !v)}
          style={{ height: CONTROL_H }}
        >
          {showMoreFields ? 'Less' : 'More'}
        </button>
      </div>
    </div>
  )
}












