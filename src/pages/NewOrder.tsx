// src/pages/NewOrder.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, type Person, type Product, getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

type PartnerRef = { id: string; name: string }

type Line = {
  product_id: string
  qtyStr: string
  priceStr: string
  historicalPrice: number | null
  historicalProductCost: number | null
}

function emptyLine(product_id = ''): Line {
  return { product_id, qtyStr: '', priceStr: '', historicalPrice: null, historicalProductCost: null }
}

export default function NewOrder() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { parseAmount } = useCurrency()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const allowMultipleRows = config.ui.multipleOrderRows

  const [people, setPeople] = useState<Person[]>([])
  const [partners, setPartners] = useState<PartnerRef[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Customer search + selection
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [entityId, setEntityId] = useState('')

  // Order-level fields
  const [orderDate, setOrderDate] = useState<string>(todayYMD())
  const [delivered, setDelivered] = useState(false)
  const [deliveredAt, setDeliveredAt] = useState<string>(todayYMD())
  const [notes, setNotes] = useState('')

  // Line items
  const [lines, setLines] = useState<Line[]>([emptyLine()])

  // Partner splits
  const [partner1Id, setPartner1Id] = useState('')
  const [partner2Id, setPartner2Id] = useState('')
  const [partner1PerItemStr, setPartner1PerItemStr] = useState('')
  const [partner2PerItemStr, setPartner2PerItemStr] = useState('')
  const [partner1Mode, setPartner1Mode] = useState<'per-item' | 'percent' | 'fixed'>('per-item')
  const [partner2Mode, setPartner2Mode] = useState<'per-item' | 'percent' | 'fixed'>('per-item')

  // Cost overrides (order-level)
  const [showMoreFields, setShowMoreFields] = useState(false)
  const [productCostStr, setProductCostStr] = useState('')
  const [shippingCostStr, setShippingCostStr] = useState('')
  const [historicalShippingCost, setHistoricalShippingCost] = useState<number | null>(null)

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
        const { customers, products: prods, partners: bootPartners } = await fetchBootstrap()
        setPeople(customers)
        setProducts(prods)
        setPartners(bootPartners ?? [])
        const firstProduct = prods
          .filter(p => (p.category ?? 'product') === 'product')
          .sort((a, b) => a.name.localeCompare(b.name))[0]
        if (firstProduct) setLines([emptyLine(firstProduct.id)])
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Historical costs (order-level, based on first line's product)
  useEffect(() => {
    const firstProductId = lines[0]?.product_id
    if (!firstProductId || !entityId || !orderDate) return
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(
          `${base}/api/historical-costs?product_id=${firstProductId}&customer_id=${entityId}&order_date=${orderDate}`,
          { headers: getAuthHeaders() }
        )
        if (res.ok) {
          const data = await res.json()
          setHistoricalShippingCost(data.shipping_cost)
        }
      } catch { /* silent */ }
    })()
  }, [lines[0]?.product_id, entityId, orderDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch last price + historical product cost per line
  function fetchLastPrice(lineIdx: number, product_id: string) {
    if (!product_id || !entityId || !orderDate) return
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const [priceRes, costRes] = await Promise.allSettled([
          fetch(`${base}/api/last-price?product_id=${product_id}&customer_id=${entityId}&order_date=${orderDate}`, { headers: getAuthHeaders() }),
          fetch(`${base}/api/historical-costs?product_id=${product_id}&customer_id=${entityId}&order_date=${orderDate}`, { headers: getAuthHeaders() }),
        ])
        const patch: Partial<Line> = {}
        if (priceRes.status === 'fulfilled' && priceRes.value.ok) {
          const d = await priceRes.value.json()
          patch.historicalPrice = d.unit_price
        }
        if (costRes.status === 'fulfilled' && costRes.value.ok) {
          const d = await costRes.value.json()
          patch.historicalProductCost = d.product_cost
        }
        setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, ...patch } : l))
      } catch { /* silent */ }
    })()
  }

  // Re-fetch last prices for all lines when customer or date changes
  useEffect(() => {
    lines.forEach((l, i) => { if (l.product_id) fetchLastPrice(i, l.product_id) })
  }, [entityId, orderDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill price from product's price_amount when product on a line changes
  function onLineProductChange(idx: number, product_id: string) {
    const prod = products.find(p => p.id === product_id)
    const pa = prod?.price_amount
    const isRefund = (prod?.name || '').trim().toLowerCase() === 'refund/discount'
    let priceStr = ''
    if (pa != null && pa > 0) priceStr = isRefund ? String(-Math.abs(pa)) : String(pa)
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, product_id, priceStr, historicalPrice: null } : l))
    fetchLastPrice(idx, product_id)
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()])
  }

  function removeLine(idx: number) {
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }

  // Per-line computed helpers
  function lineProduct(l: Line) {
    return products.find(p => p.id === l.product_id)
  }
  function lineIsRefund(l: Line) {
    return (lineProduct(l)?.name || '').trim().toLowerCase() === 'refund/discount'
  }
  function lineQty(l: Line) { return parseInt(l.qtyStr || '0', 10) }
  function linePrice(l: Line) { return parseAmount(l.priceStr) }
  function lineValue(l: Line) {
    const q = lineQty(l); const p = linePrice(l)
    return Number.isInteger(q) && q > 0 && Number.isFinite(p) ? q * p : NaN
  }

  // Filter and group products
  const { filteredProducts, productGroup, serviceGroup } = useMemo(() => {
    const excludedNames = ['boutiq', 'perfect day_2', 'muha meds', 'clouds', 'mix pack', 'bodega boys', 'hex fuel']
    const filtered = products
      .filter(p => !excludedNames.includes(p.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
    const productGroup = filtered.filter(p => (p.category ?? 'product') === 'product')
    const serviceGroup = filtered.filter(p => p.category === 'service')
    return { filteredProducts: filtered, productGroup, serviceGroup }
  }, [products])

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

  const person = useMemo(() => people.find(p => p.id === entityId), [people, entityId])

  // Order totals
  const totalOrderValue = useMemo(() => {
    const sum = lines.reduce((s, l) => { const v = lineValue(l); return s + (Number.isFinite(v) ? v : 0) }, 0)
    return sum !== 0 ? sum : NaN
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalQty = useMemo(() => lines.reduce((s, l) => s + (lineQty(l) > 0 ? lineQty(l) : 0), 0), [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Partner totals — mode-aware calculation
  function computePartnerTotal(mode: 'per-item' | 'percent' | 'fixed', valueStr: string) {
    const v = parseAmount(valueStr)
    if (!Number.isFinite(v) || v <= 0) return 0
    if (mode === 'per-item') return totalQty > 0 ? v * totalQty : 0
    if (mode === 'percent') return Number.isFinite(totalOrderValue) && totalOrderValue > 0 ? (v / 100) * totalOrderValue : 0
    if (mode === 'fixed') return v
    return 0
  }
  const partner1Total = useMemo(() => computePartnerTotal(partner1Mode, partner1PerItemStr), [partner1Mode, partner1PerItemStr, totalQty, totalOrderValue]) // eslint-disable-line react-hooks/exhaustive-deps
  const partner2Total = useMemo(() => computePartnerTotal(partner2Mode, partner2PerItemStr), [partner2Mode, partner2PerItemStr, totalQty, totalOrderValue]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effective shipping cost (order-level, per customer)
  const effectiveShippingCost = useMemo(() => {
    const override = shippingCostStr.trim() ? parseAmount(shippingCostStr) : null
    if (override !== null && Number.isFinite(override)) return override
    return historicalShippingCost ?? 0
  }, [shippingCostStr, historicalShippingCost])

  // Profit — product cost summed per line for accuracy with multiple products
  const profit = useMemo(() => {
    if (!Number.isFinite(totalOrderValue) || totalOrderValue <= 0) return 0
    const productCostOverride = productCostStr.trim() ? parseAmount(productCostStr) : null
    const totalProductCost = productCostOverride !== null && Number.isFinite(productCostOverride)
      ? productCostOverride * totalQty
      : lines.reduce((s, l) => s + lineQty(l) * (l.historicalProductCost ?? 0), 0)
    const totalShippingCost = effectiveShippingCost * totalQty
    return totalOrderValue - partner1Total - partner2Total - totalProductCost - totalShippingCost
  }, [totalOrderValue, partner1Total, partner2Total, productCostStr, lines, effectiveShippingCost, totalQty]) // eslint-disable-line react-hooks/exhaustive-deps

  const profitPercent = useMemo(() => {
    if (!Number.isFinite(totalOrderValue) || totalOrderValue <= 0) return 0
    return (profit / totalOrderValue) * 100
  }, [profit, totalOrderValue])

  const personCustomerType = (person as any)?.customer_type
  const isPartnerCustomer = personCustomerType === 'Partner'

  const partner2Options = useMemo(() => partners.filter(p => p.id !== partner1Id), [partners, partner1Id])

  const BLANCO_IDS = ['f4bfabe7-62cb-4e08-b98a-b3faed93278f', '9f5b9939-e35f-435f-93aa-0ed5be64b2a1']

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>

  const hasCustomers = people.length > 0
  const hasProducts = filteredProducts.length > 0
  const CONTROL_H = 44

  const orderValueStr = Number.isFinite(totalOrderValue) ? usdFmt.format(totalOrderValue) : ''
  const partner1TotalStr = partner1Total > 0 ? usdFmt.format(partner1Total) : ''
  const partner2TotalStr = partner2Total > 0 ? usdFmt.format(partner2Total) : ''

  return (
    <div className="card page-normal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <h3 style={{ margin: 0 }}>{t('orders.newOrderTitle')}</h3>

        {Number.isFinite(totalOrderValue) && totalOrderValue > 0 && (
          <div style={{ textAlign: 'right', fontSize: 14 }}>
            <div style={{ color: 'var(--text-secondary)' }}>{t('orders.profit')}</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: profit >= 0 ? 'var(--primary)' : 'var(--color-error)' }}>
              ${profit.toFixed(2)}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
              {profitPercent.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Search customer | Order date — 50/50 */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div style={{ position: 'relative' }}>
          <label>{t('orders.searchCustomer')}</label>
          {!hasCustomers && <div className="helper" style={{ marginTop: 4 }}>{t('orders.noCustomersYet')}</div>}
          <input
            ref={inputRef}
            placeholder={t('orders.startTyping')}
            value={query}
            onChange={(e) => {
              const val = e.target.value
              setQuery(val)
              if (person && !person.name.toLowerCase().includes(val.trim().toLowerCase())) setEntityId('')
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            style={{ height: CONTROL_H }}
          />
          {(focused && query && suggestions.length > 0) && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              borderRadius: 10, background: 'rgba(47,109,246,0.90)', color: '#fff',
              padding: 6, zIndex: 50, boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
            }}>
              {suggestions.map(s => (
                <button key={s.id} className="primary" onClick={() => pickSuggestion(s.id, s.name)}
                  style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', padding: '8px 10px', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label>{t('orders.orderDate')}</label>
          <DateInput value={orderDate} onChange={v => setOrderDate(v)} style={{ height: CONTROL_H }} />
        </div>
      </div>

      {/* Line items */}
      {lines.map((l, idx) => {
        const isRefund = lineIsRefund(l)
        const isMinusOnly = isRefund && l.priceStr.trim() === '-'
        return (
          <div key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--line)', marginTop: idx === 0 ? 12 : 16, paddingTop: idx === 0 ? 0 : 12 }}>
            {/* Row 1: Product | Qty */}
            <div className="row row-2col-mobile" style={{ marginTop: 0 }}>
              <div>
                <label>{t('orders.productOrService')}</label>
                <select
                  value={l.product_id}
                  onChange={e => onLineProductChange(idx, e.target.value)}
                  style={{ height: CONTROL_H }}
                  disabled={!hasProducts}
                >
                  {!hasProducts ? (
                    <option value="">{t('orders.noProductsYet')}</option>
                  ) : (
                    <>
                      {productGroup.length > 0 && (
                        <optgroup label={t('orders.groupProducts')}>
                          {productGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </optgroup>
                      )}
                      {serviceGroup.length > 0 && (
                        <optgroup label={t('orders.groupServices')}>
                          {serviceGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </optgroup>
                      )}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label>{t('quantity')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={l.qtyStr ? intFmt.format(Number(l.qtyStr)) : ''}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                    updateLine(idx, { qtyStr: digits })
                  }}
                  style={{ height: CONTROL_H }}
                />
              </div>
            </div>
            {/* Row 2: Price | Price last time */}
            <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
              <div>
                <label>{t('price')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={l.priceStr}
                  onChange={e => {
                    const raw = e.target.value
                    if (isRefund) {
                      const withoutSigns = raw.replace(/^[+-]+/, '')
                      const v = '-' + withoutSigns
                      updateLine(idx, { priceStr: v === '-' ? '-' : v })
                    } else {
                      updateLine(idx, { priceStr: raw.replace(/^[+-]+/, '') })
                    }
                  }}
                  onKeyDown={e => {
                    if (!isRefund) return
                    const target = e.currentTarget
                    const { selectionStart, selectionEnd, value } = target
                    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) { e.preventDefault(); return }
                    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) { e.preventDefault(); return }
                  }}
                  style={{ height: CONTROL_H, color: isMinusOnly ? 'var(--text-secondary)' : undefined, opacity: isMinusOnly ? 0.6 : undefined }}
                />
              </div>
              <div>
                <label>{t('orders.priceLastTime')}</label>
                <input
                  type="text"
                  value={l.historicalPrice !== null ? (isRefund ? (-Math.abs(l.historicalPrice)).toFixed(2) : l.historicalPrice.toFixed(2)) : '—'}
                  readOnly
                  style={{ height: CONTROL_H, opacity: 0.6 }}
                />
              </div>
            </div>

            {/* Add / Remove links */}
            {allowMultipleRows && (
              <div style={{ marginTop: 6, display: 'flex', gap: 16 }}>
                <button className="helper" onClick={addLine}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  + {t('supplierOrders.addProduct')}
                </button>
                {lines.length > 1 && (
                  <button className="helper" onClick={() => removeLine(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    – {t('supplierOrders.removeProduct')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Order value | Fully delivered | Delivery date */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('orders.orderValue')}</label>
          <input
            type="text"
            value={orderValueStr}
            placeholder="auto"
            readOnly
            style={{ height: CONTROL_H, opacity: 0.9, color: Number.isFinite(totalOrderValue) && totalOrderValue < 0 ? 'var(--color-error)' : undefined }}
          />
        </div>
        <div>
          <label>{t('fullyDelivered')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={delivered}
              onChange={e => setDelivered(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            {delivered && <span className="helper">{t('yes')}</span>}
          </div>
        </div>
        {delivered && (
          <div>
            <label>{t('customerDetail.deliveryDate')}</label>
            <DateInput value={deliveredAt} onChange={setDeliveredAt} style={{ height: CONTROL_H }} />
          </div>
        )}
      </div>

      {/* Partner splits */}
      {isPartnerCustomer && (
        <>
          {(
            [
              { label: t('orders.partner1'), id: partner1Id, setId: setPartner1Id, valueStr: partner1PerItemStr, setValueStr: setPartner1PerItemStr, mode: partner1Mode, setMode: setPartner1Mode, totalStr: partner1TotalStr, toLabel: t('orders.toPartner1'), opts: partners },
              { label: t('orders.partner2'), id: partner2Id, setId: setPartner2Id, valueStr: partner2PerItemStr, setValueStr: setPartner2PerItemStr, mode: partner2Mode, setMode: setPartner2Mode, totalStr: partner2TotalStr, toLabel: t('orders.toPartner2'), opts: partner2Options },
            ] as const
          ).map((p, i) => (
            <div key={i} style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div>
                <label>{p.label}</label>
                <select value={p.id} onChange={e => p.setId(e.target.value)} style={{ height: CONTROL_H }}>
                  <option value="">—</option>
                  {p.opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <select
                  value={p.mode}
                  onChange={e => { p.setMode(e.target.value as any); p.setValueStr('') }}
                  className="mode-select"
                >
                  <option value="per-item">{t('orders.perItem')}</option>
                  <option value="percent">{t('orders.percentOfOrder')}</option>
                  <option value="fixed">{t('orders.fixedAmount')}</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={p.mode === 'percent' ? '0.0' : '0.00'}
                  value={p.valueStr}
                  onChange={e => p.setValueStr(e.target.value)}
                  style={{ height: CONTROL_H }}
                />
              </div>
              <div>
                <label>{p.toLabel}</label>
                <input type="text" value={p.totalStr} placeholder="auto" readOnly style={{ height: CONTROL_H, opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Notes */}
      <div style={{ marginTop: 12 }}>
        <label>{t('notesOptional')}</label>
        <input type="text" placeholder={t('optionalNotesPlaceholder')} value={notes}
          onChange={e => setNotes(e.target.value)} style={{ height: CONTROL_H }} />
      </div>

      {/* Blanco special case */}
      {BLANCO_IDS.includes(entityId) && totalQty > 0 && (
        <div style={{ marginTop: 12, padding: '12px 16px', backgroundColor: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Owed to Tony by Blanco:</span>
            <span style={{ fontWeight: 600, color: '#f57c00' }}>{totalQty} × $0.50 = ${(totalQty * 0.50).toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>This amount will be recorded as partner-to-partner debt</div>
        </div>
      )}

      {/* More fields */}
      {showMoreFields && (
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          <div>
            <label>{t('orders.productCostThisOrder')}</label>
            <input type="text" inputMode="decimal" placeholder="0.00" value={productCostStr}
              onChange={e => setProductCostStr(e.target.value)} style={{ height: CONTROL_H }} />
          </div>
          <div>
            <label>{t('orders.shippingCostThisOrder')}</label>
            <input type="text" inputMode="decimal" placeholder="0.00" value={shippingCostStr}
              onChange={e => setShippingCostStr(e.target.value)} style={{ height: CONTROL_H }} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={async () => {
          if (!person) { alert(t('orders.alertSelectCustomer')); return }

          const validLines = lines.filter(l => {
            if (!l.product_id) return false
            const qty = lineQty(l)
            const price = linePrice(l)
            if (!Number.isInteger(qty) || qty <= 0) return false
            if (!Number.isFinite(price)) return false
            const isRefund = lineIsRefund(l)
            if (isRefund && !(price < 0)) return false
            if (!isRefund && !(price > 0)) return false
            return true
          })

          if (validLines.length === 0) {
            alert(t('orders.alertPickProduct')); return
          }

          // Build partner_splits using already-computed totals
          const splits: Array<{ partner_id: string; amount: number }> = []
          if (isPartnerCustomer) {
            if (partner1Id && partner1Total > 0) splits.push({ partner_id: partner1Id, amount: partner1Total })
            if (partner2Id && partner2Total > 0) splits.push({ partner_id: partner2Id, amount: partner2Total })
          }

          let productCostToSend: number | undefined = undefined
          let shippingCostToSend: number | undefined = undefined
          if (productCostStr.trim()) { const p = parseAmount(productCostStr); if (Number.isFinite(p) && p > 0) productCostToSend = p }
          if (shippingCostStr.trim()) { const p = parseAmount(shippingCostStr); if (Number.isFinite(p) && p >= 0) shippingCostToSend = p }

          try {
            const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
            const body: any = {
              customer_id: person.id,
              date: orderDate,
              delivered,
              delivered_at: delivered ? deliveredAt : null,
              discount: 0,
              notes: notes.trim() || undefined,
              product_cost: productCostToSend,
              shipping_cost: shippingCostToSend,
              partner_splits: splits.length ? splits : undefined,
              items: validLines.map(l => ({
                product_id: l.product_id,
                qty: lineQty(l),
                unit_price: linePrice(l),
              })),
            }

            const res = await fetch(`${base}/api/orders`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              const text = await res.text().catch(() => '')
              throw new Error(`Save failed (${res.status}) ${text?.slice(0, 140)}`)
            }
            const data = await res.json()
            alert(t('orders.orderSaved', { number: data.order_no }))

            const params = new URLSearchParams(location.search)
            const returnTo = params.get('return_to')
            const returnId = params.get('return_id')
            if (returnTo === 'customer' && returnId) { navigate(`/customers/${returnId}`); return }

            setLines([emptyLine(lines[0]?.product_id || '')])
            setOrderDate(todayYMD())
            setDelivered(false)
            setNotes('')
            setPartner1Id(''); setPartner2Id('')
            setPartner1PerItemStr(''); setPartner2PerItemStr('')
            setPartner1Mode('per-item'); setPartner2Mode('per-item')
            setProductCostStr(''); setShippingCostStr('')
            setShowMoreFields(false)
          } catch (e: any) {
            alert(e?.message || t('payments.alertSaveFailed'))
          }
        }} style={{ height: CONTROL_H }}>{t('orders.saveOrder')}</button>

        <button onClick={() => {
          setLines([emptyLine(lines[0]?.product_id || '')])
          setNotes(''); setQuery(''); setEntityId('')
          setPartner1Id(''); setPartner2Id(''); setPartner1PerItemStr(''); setPartner2PerItemStr('')
          setPartner1Mode('per-item'); setPartner2Mode('per-item')
          setProductCostStr(''); setShippingCostStr(''); setShowMoreFields(false)
        }} style={{ height: CONTROL_H }}>{t('clear')}</button>

        <button onClick={() => setShowMoreFields(v => !v)} style={{ height: CONTROL_H }}>
          {showMoreFields ? t('orders.less') : t('orders.more')}
        </button>
      </div>
    </div>
  )
}
