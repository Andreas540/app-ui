// src/pages/EditOrder.tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchBootstrap, type Person, type Product } from '../lib/api'
import { todayYMD } from '../lib/time'

type PartnerRef = { id: string; name: string }

export default function EditOrder() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  
  const [people, setPeople] = useState<Person[]>([])
  const [partners, setPartners] = useState<PartnerRef[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Order data
  const [orderNo, setOrderNo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [productId, setProductId] = useState('')
  const [orderDate, setOrderDate] = useState<string>(todayYMD())
  const [qtyStr, setQtyStr] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [delivered, setDelivered] = useState(false)
  const [notes, setNotes] = useState('')

  // Partner splits
  const [partner1Id, setPartner1Id] = useState('')
  const [partner2Id, setPartner2Id] = useState('')
  const [partner1PerItemStr, setPartner1PerItemStr] = useState('')
  const [partner2PerItemStr, setPartner2PerItemStr] = useState('')
  const [showMoreFields, setShowMoreFields] = useState(false)
  const [productCostStr, setProductCostStr] = useState('')
  const [shippingCostStr, setShippingCostStr] = useState('')
  const [historicalProductCost, setHistoricalProductCost] = useState<number | null>(null)
  const [historicalShippingCost, setHistoricalShippingCost] = useState<number | null>(null)

  // Load bootstrap data and order details
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers, products, partners: bootPartners } = await fetchBootstrap()
        setPeople(customers)
        setProducts(products)
        setPartners(bootPartners ?? [])

        // Fetch order details
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/order?id=${orderId}`)
        if (!res.ok) throw new Error('Failed to load order')
        
        const orderData = await res.json()
        const order = orderData.order
        
        // Populate form with order data
        setOrderNo(order.order_no)
        setCustomerId(order.customer_id)
        setCustomerName(order.customer_name)
        setProductId(order.product_id)
        setOrderDate(order.order_date)
        setQtyStr(String(order.qty))
        setPriceStr(String(order.unit_price))
        setDelivered(order.delivered)
        setNotes(order.notes || '')
        
        // Set cost overrides if they exist
        if (order.product_cost !== null && order.product_cost !== undefined) {
          setProductCostStr(String(order.product_cost))
          setShowMoreFields(true)
        }
        if (order.shipping_cost !== null && order.shipping_cost !== undefined) {
          setShippingCostStr(String(order.shipping_cost))
          setShowMoreFields(true)
        }
        
        // Load partner splits
        if (orderData.partner_splits && orderData.partner_splits.length > 0) {
          const split1 = orderData.partner_splits[0]
          setPartner1Id(split1.partner_id)
          setPartner1PerItemStr(String(split1.amount / order.qty))
          
          if (orderData.partner_splits.length > 1) {
            const split2 = orderData.partner_splits[1]
            setPartner2Id(split2.partner_id)
            setPartner2PerItemStr(String(split2.amount / order.qty))
          }
        }
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [orderId])

  // Fetch historical costs when product or customer changes
  useEffect(() => {
    if (!productId || !customerId || !orderDate) return
    
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const dateOnly = orderDate.split('T')[0] // Extract YYYY-MM-DD from potential ISO string
        const res = await fetch(`${base}/api/historical-costs?product_id=${productId}&customer_id=${customerId}&order_date=${dateOnly}`)
        if (res.ok) {
          const data = await res.json()
          setHistoricalProductCost(data.product_cost)
          setHistoricalShippingCost(data.shipping_cost)
        }
      } catch (e) {
        console.error('Failed to fetch historical costs:', e)
      }
    })()
  }, [productId, customerId, orderDate])

  const person = useMemo(() => people.find(p => p.id === customerId), [people, customerId])
  const product = useMemo(() => products.find(p => p.id === productId), [products, productId])

  // Is this the Refund/Discount product?
  const isRefundProduct = useMemo(
    () => (product?.name || '').trim().toLowerCase() === 'refund/discount',
    [product]
  )

  // Helpers
  function parseQty(s: string) {
    const digits = s.replace(/\D/g, '')
    return digits.replace(/^0+(?=\d)/, '')
  }
  // Allow optional leading "-" for Refund/Discount
  function parsePriceToNumber(s: string) {
    const m = s.match(/-?\d+(?:[.,]\d+)?/)
    if (!m) return NaN
    return Number(m[0].replace(',', '.'))
  }

  const qtyInt = useMemo(() => parseInt(qtyStr || '0', 10), [qtyStr])
  const priceNum = useMemo(() => parsePriceToNumber(priceStr), [priceStr])

  // Allow negative order value when refund product is selected
  const orderValue = useMemo(() => {
    if (!Number.isInteger(qtyInt) || qtyInt <= 0) return NaN
    if (!Number.isFinite(priceNum)) return NaN
    return qtyInt * priceNum
  }, [qtyInt, priceNum])

  // Partner amounts
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

  // Effective costs
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

  // Profit (hide when Refund/Discount)
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

  const personCustomerType = (person as any)?.customer_type
  const isPartnerCustomer = personCustomerType === 'Partner'

  const partner2Options = useMemo(
    () => partners.filter(p => p.id !== partner1Id),
    [partners, partner1Id]
  )

  // --- Refund/Discount input behavior (mirror NewOrder) ---

  // When switching TO Refund/Discount: show "-" immediately; switching away removes it
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

  // Prevent deleting the leading "-" when Refund/Discount is selected
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

  // Enforce a single leading "-" for refund; strip signs otherwise
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

  async function save() {
    if (!person) { alert('Customer missing'); return }
    if (!product) { alert('Product missing'); return }

    const qty = parseInt(qtyStr || '0', 10)
    if (!Number.isInteger(qty) || qty <= 0) { alert('Enter a quantity > 0'); return }

    const unitPrice = parsePriceToNumber(priceStr)
    if (!Number.isFinite(unitPrice)) { alert('Enter a valid unit price'); return }
    if (isRefundProduct) {
      if (!(unitPrice < 0)) { alert('Refund/Discount requires a NEGATIVE unit price'); return }
    } else {
      if (!(unitPrice > 0)) { alert('Enter a unit price > 0'); return }
    }

    // Build partner_splits
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
      if (Number.isFinite(parsed) && parsed > 0) {
        productCostToSend = parsed
      }
    }
    
    if (shippingCostStr.trim()) {
      const parsed = parsePriceToNumber(shippingCostStr)
      if (Number.isFinite(parsed) && parsed >= 0) {
        shippingCostToSend = parsed
      }
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          customer_id: person.id,
          product_id: product.id,
          qty,
          unit_price: unitPrice,
          date: orderDate,
          delivered,
          notes: notes.trim() || undefined,
          product_cost: productCostToSend,
          shipping_cost: shippingCostToSend,
          partner_splits: splits.length ? splits : undefined,
          item_product_cost: Number.isFinite(effectiveProductCost)
            ? effectiveProductCost
            : undefined,
        }),
      })

      if (!res.ok) throw new Error('Failed to update order')
      
      alert('Order updated!')
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function deleteOrder() {
    if (!confirm(`Delete Order #${orderNo}? This cannot be undone.`)) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: orderId }),
      })

      if (!res.ok) throw new Error('Failed to delete order')
      
      alert('Order deleted')
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>

  const CONTROL_H = 44

  return (
    <div className="card" style={{maxWidth: 720}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
        <div>
          <h3 style={{ margin:0 }}>Edit Order</h3>
          <div className="helper" style={{ marginTop: 4 }}>Order #{orderNo}</div>
        </div>
        
        {/* Profit display - top right (hidden for Refund/Discount) */}
        {Number.isFinite(orderValue) && orderValue > 0 && !isRefundProduct && (
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

      {/* Customer name (read-only) */}
      <div style={{ marginTop: 12 }}>
        <label>Customer</label>
        <input
          type="text"
          value={customerName}
          readOnly
          style={{ height: CONTROL_H, opacity: 0.9 }}
        />
      </div>

      {/* Product | Order date */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Product</label>
          <select value={productId} onChange={e=>setProductId(e.target.value)} style={{ height: CONTROL_H }}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Order date</label>
          <input type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)} style={{ height: CONTROL_H }} />
        </div>
      </div>

      {/* Quantity | Order price */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Quantity</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={qtyStr}
            onChange={e => setQtyStr(parseQty(e.target.value))}
            style={{ height: CONTROL_H }}
          />
        </div>
        <div>
          <label>Order price (USD)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={priceStr}
            onChange={onPriceChange}
            onKeyDown={onPriceKeyDown}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      {/* Order value | Delivered */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Order value (USD)</label>
          <input
            type="text"
            value={Number.isFinite(orderValue) ? orderValue.toFixed(2) : ''}
            placeholder="auto"
            readOnly
            style={{ height: CONTROL_H, opacity: 0.9 }}
          />
        </div>
        <div style={{ display:'flex', alignItems:'end' }}>
          <label style={{ width:'100%' }}>
            Delivered
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
              <input
                type="checkbox"
                checked={delivered}
                onChange={e => setDelivered(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span className="helper">{delivered ? 'Yes' : 'No'}</span>
            </div>
          </label>
        </div>
      </div>

      {/* Partner splits */}
      {isPartnerCustomer && (
        <>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12 }}>
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
              <label>To Partner 1 (USD)</label>
              <input
                type="text"
                value={partner1Total > 0 ? partner1Total.toFixed(2) : ''}
                placeholder="auto"
                readOnly
                style={{ height: CONTROL_H, opacity: 0.6 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12 }}>
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
              <label>To Partner 2 (USD)</label>
              <input
                type="text"
                value={partner2Total > 0 ? partner2Total.toFixed(2) : ''}
                placeholder="auto"
                readOnly
                style={{ height: CONTROL_H, opacity: 0.6 }}
              />
            </div>
          </div>
        </>
      )}

      {/* Notes field */}
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

      {/* More fields */}
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
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>Save changes</button>
        <button onClick={() => navigate(-1)} style={{ height: CONTROL_H }}>Cancel</button>
        <button
          onClick={() => setShowMoreFields(v => !v)}
          style={{ height: CONTROL_H }}
        >
          More
        </button>
        <button
          onClick={deleteOrder}
          style={{ 
            height: CONTROL_H, 
            marginLeft: 'auto',
            backgroundColor: 'salmon',
            color: 'white',
            border: 'none'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
