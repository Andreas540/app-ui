// src/pages/Warehouse.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, type Product, getAuthHeaders } from '../lib/api'
import OrderDetailModal from '../components/OrderDetailModal'
import SupplierOrderDetailModal from '../components/SupplierOrderDetailModal'
import { useCurrency } from '../lib/useCurrency'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'

type OrderRef = { order_id: string; order_no: number; qty: number }

type InventoryItem = {
  product: string
  product_id: string
  has_bom: boolean
  pre_prod: number
  finished: number
  qty: number
  committed: number
  on_order: number
  available_finished: number
  available_total: number
  committed_orders: OrderRef[] | null
  on_order_orders: OrderRef[] | null
}

type MaterialItem = {
  product: string
  product_id: string
  on_hand: number
  received: number
  consumed: number
  on_order: number
  used_in: string[]
}

export default function Warehouse() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { parseAmount, fmtNumber } = useCurrency()

  const [products, setProducts] = useState<Product[]>([])
  const [materialProducts, setMaterialProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [customerModalOrder, setCustomerModalOrder] = useState<{ id: string } | null>(null)
  const [supplierModalOrder, setSupplierModalOrder] = useState<any | null>(null)

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const openSupplierOrder = async (orderId: string) => {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/order-supplier?id=${orderId}`, { headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) return
    const items = (data.items ?? []).map((item: any) => ({
      ...item,
      product_total: Number(item.product_cost) * Number(item.qty),
      shipping_total: Number(item.shipping_cost) * Number(item.qty),
    }))
    const total = items.reduce((sum: number, item: any) => sum + item.product_total + item.shipping_total, 0)
    setSupplierModalOrder({ ...data.order, items, total, lines: items.length })
  }

  // Form fields
  const [productId, setProductId] = useState('')
  const [qtyStr, setQtyStr] = useState('')
  const [date, setDate] = useState<string>(todayYMD())
  const [flag, setFlag] = useState<'M' | 'P' | 'material'>('M')
  const [productCostStr, setProductCostStr] = useState('')
  const [laborCostStr, setLaborCostStr] = useState('')
  const [notes, setNotes] = useState('')

  const CONTROL_H = 44

  // Load products and inventory
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setErr(null)
      const { products: bootProducts } = await fetchBootstrap()

      // Filter out services, materials, Refund/Discount, Other Products, and Other Services
      const filtered = bootProducts.filter((p) => {
        if (p.category === 'service' || p.category === 'material') return false
        const name = p.name.trim().toLowerCase()
        return (
          !name.includes('refund') &&
          !name.includes('discount') &&
          !name.includes('other product') &&
          !name.includes('other service')
        )
      })
      const matFiltered = bootProducts.filter(p => p.category === 'material')

      setProducts(filtered)
      setMaterialProducts(matFiltered)
      if (filtered[0]) setProductId(filtered[0].id)

      await loadInventory()
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadInventory() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/warehouse-inventory`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setInventory(data.inventory || [])
        setMaterials(data.materials || [])
      }
    } catch (e) {
      console.error('Failed to fetch inventory:', e)
    }
  }

  // Parse quantity (allow negative with minus sign, allow decimals for materials)
  function parseQtyToNumber(s: string): number {
    if (!s || s.trim() === '' || s.trim() === '-') return NaN
    const cleaned = s.trim().replace(/,/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? NaN : num
  }


  // iOS numeric keypad often has no "-" key. Provide a toggle button instead.
  function toggleNegativeQty() {
    setQtyStr((prev) => {
      const v = prev.trim()
      if (!v) return '-'
      if (v.startsWith('-')) return v.slice(1)
      return '-' + v
    })
  }

  const qtyInt = useMemo(() => parseQtyToNumber(qtyStr), [qtyStr])
  const productCost = useMemo(() => parseAmount(productCostStr), [productCostStr])
  const laborCost = useMemo(() => parseAmount(laborCostStr), [laborCostStr])

  const selectedProduct = useMemo(() => {
    const list = flag === 'material' ? materialProducts : products
    return list.find((p) => p.id === productId)
  }, [products, materialProducts, productId, flag])

  const currentInventoryItem = useMemo(() => {
    return inventory.find((i) => i.product_id === productId)
  }, [inventory, productId])

  const currentInventoryQty = useMemo(() => {
    if (flag === 'material') {
      return Number(materials.find(m => m.product_id === productId)?.on_hand ?? 0)
    }
    return currentInventoryItem ? Number(currentInventoryItem.qty) : 0
  }, [flag, materials, productId, currentInventoryItem])

  const newInventoryQty = useMemo(() => {
    if (!Number.isFinite(qtyInt)) return currentInventoryQty
    return currentInventoryQty + qtyInt
  }, [currentInventoryQty, qtyInt])

  const willGoNegative = useMemo(() => {
    return Number.isFinite(qtyInt) && qtyInt < 0 && newInventoryQty < 0
  }, [qtyInt, newInventoryQty])


  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>
  if (!products.length && !materialProducts.length) return <div className="card page-normal"><p>{t('warehouse.noProducts')}</p></div>

  return (
    <>
      {/* Adjust Warehouse Inventory Card */}
      <div className="card page-normal">
        <div
          onClick={() => setAdjustOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{adjustOpen ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('warehouse.title')}</h3>
        </div>

        {adjustOpen && <>
        {/* Row 1: Stage (M or P) - MOVED TO TOP */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>{t('warehouse.stage')}</label>
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            flexWrap: 'wrap',
          }}>
            {([
              { value: 'M',        label: t('warehouse.preProduction') },
              { value: 'P',        label: t('warehouse.finishedProducts') },
              { value: 'material', label: t('warehouse.materialsSection') },
            ] as const).map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="flag"
                  value={opt.value}
                  checked={flag === opt.value}
                  onChange={() => {
                    setFlag(opt.value)
                    // Reset product selection to first item in the new list
                    if (opt.value === 'material') {
                      setProductId(materialProducts[0]?.id ?? '')
                    } else if (flag === 'material') {
                      setProductId(products[0]?.id ?? '')
                    }
                  }}
                  style={{ cursor: 'pointer', width: 16, height: 16 }}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Row 2: Product */}
        <div style={{ marginTop: 12 }}>
          <label>{t('product')}</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{ height: CONTROL_H }}
          >
            {(flag === 'material' ? materialProducts : products).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Quantity | Date (50/50) */}
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          {/* LEFT: Qty */}
          <div>
            <label>{t('warehouse.qtyLabel')}</label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={toggleNegativeQty}
                style={{
                  width: 44,
                  height: CONTROL_H,
                  fontSize: 22,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: qtyStr.trim().startsWith('-') ? 'var(--color-error)' : 'transparent',
                  color: qtyStr.trim().startsWith('-') ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={t('warehouse.toggleNegative')}
                aria-label={t('warehouse.toggleNegative')}
              >
                −
              </button>

              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                style={{
                  height: CONTROL_H,
                  flex: 1,
                  borderColor: willGoNegative ? 'var(--color-error)' : undefined,
                }}
              />
            </div>

            {willGoNegative && (
              <div style={{ color: 'var(--color-error)', fontSize: 13, marginTop: 4 }}>
                {t('warehouse.negativeWarning', { product: selectedProduct?.name, qty: newInventoryQty })}
              </div>
            )}
          </div>

          {/* RIGHT: Date */}
          <div>
            <label>{t('date')}</label>
            <DateInput
              value={date}
              onChange={v => setDate(v)}
              style={{ height: CONTROL_H }}
            />
          </div>
        </div>

        {/* Row 4: Product cost | Labor cost (50/50) - HIDDEN */}
        <div className="row row-2col-mobile" style={{ marginTop: 12, display: 'none' }}>
          <div>
            <label>Product cost (optional)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.000"
              value={productCostStr}
              onChange={(e) => setProductCostStr(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
          <div>
            <label>Labor cost (optional)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.000"
              value={laborCostStr}
              onChange={(e) => setLaborCostStr(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
        </div>

        {/* Row 5: Notes */}
        <div style={{ marginTop: 12 }}>
          <label>{t('notesOptional')}</label>
          <input
            type="text"
            placeholder={t('warehouse.notesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>

        {/* Buttons */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            className="primary"
            onClick={async () => {
              if (!selectedProduct) {
                alert(t('warehouse.alertSelectProduct'))
                return
              }

              const qty = parseQtyToNumber(qtyStr)
              if (!Number.isFinite(qty) || qty === 0) {
                alert(t('warehouse.alertEnterQuantity'))
                return
              }

              if (!date) {
                alert(t('warehouse.alertSelectDate'))
                return
              }

              let productCostToSend: number | undefined = undefined
              let laborCostToSend: number | undefined = undefined

              if (Number.isFinite(productCost)) productCostToSend = productCost
              if (Number.isFinite(laborCost)) laborCostToSend = laborCost

              try {
                const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
                const res = await fetch(`${base}/api/warehouse-add-manual`, {
                  method: 'POST',
                  headers: getAuthHeaders(),
                  body: JSON.stringify({
                    product_id: productId,
                    qty,
                    date,
                    flag: flag === 'material' ? 'M' : flag,
                    product_cost: productCostToSend,
                    labor_cost: laborCostToSend,
                    notes: notes.trim() || undefined,
                  }),
                })

                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}))
                  throw new Error(errData.error || `Save failed (${res.status})`)
                }

                alert(t('warehouse.saved'))

                setQtyStr('')
                setDate(todayYMD())
                setFlag('M')
                setProductCostStr('')
                setLaborCostStr('')
                setNotes('')
                await loadInventory()
              } catch (e: any) {
                alert(e?.message || t('warehouse.saveFailed'))
              }
            }}
            style={{ height: CONTROL_H }}
          >
            {t('save')}
          </button>

          <button
            onClick={() => {
              setQtyStr('')
              setDate(todayYMD())
              setFlag('M')
              setProductCostStr('')
              setLaborCostStr('')
              setNotes('')
            }}
            style={{ height: CONTROL_H }}
          >
            {t('clear')}
          </button>

          <button
            onClick={() => navigate(-1)}
            style={{ height: CONTROL_H }}
          >
            {t('cancel')}
          </button>
        </div>
        </>}
      </div>

      {/* Current Inventory Card */}
      <div className="card page-normal" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>{t('warehouse.currentInventory')}</h3>
        {inventory.length === 0 ? (
          <p className="helper">{t('warehouse.noInventoryData')}</p>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 580 }}>
              {/* Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(100px, 2fr) repeat(7, minmax(62px, 1fr))',
                  gap: 6,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <div>{t('product')}</div>
                <div style={{ textAlign: 'right' }}>{t('warehouse.preProdColumn')}</div>
                <div style={{ textAlign: 'right' }}>{t('warehouse.finishedColumn')}</div>
                <div style={{ textAlign: 'right' }}>{t('warehouse.totalQtyColumn')}</div>
                <div style={{ textAlign: 'right' }} title={t('warehouse.committedTooltip')}>{t('warehouse.committedColumn')}</div>
                <div style={{ textAlign: 'right' }} title={t('warehouse.availableFinishedTooltip')}>{t('warehouse.availableFinishedColumn')}</div>
                <div style={{ textAlign: 'right' }} title={t('warehouse.availableTotalTooltip')}>{t('warehouse.availableTotalColumn')}</div>
                <div style={{ textAlign: 'right' }} title={t('warehouse.onOrderTooltip')}>{t('warehouse.onOrderColumn')}</div>
              </div>

              {/* Rows */}
              {inventory
                .filter((item) => {
                  const name = item.product.trim().toLowerCase()
                  return (
                    !name.includes('refund') &&
                    !name.includes('discount') &&
                    !name.includes('other product') &&
                    !name.includes('other service')
                  )
                })
                .map((item) => {
                  const availFin = Number(item.available_finished)
                  const availTot = Number(item.available_total)
                  const committedOrders = item.committed_orders ?? []
                  const onOrderOrders = item.on_order_orders ?? []
                  const hasOrders = committedOrders.length > 0 || onOrderOrders.length > 0
                  const isExpanded = expandedRows.has(item.product_id)
                  return (
                    <div key={item.product_id}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(100px, 2fr) repeat(7, minmax(62px, 1fr))',
                          gap: 6,
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                          paddingTop: 10,
                          paddingBottom: 10,
                          fontSize: 13,
                          alignItems: 'start',
                        }}
                      >
                        <div
                          style={{ wordBreak: 'break-word', lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', gap: 5, cursor: hasOrders ? 'pointer' : undefined }}
                          onClick={hasOrders ? () => toggleRow(item.product_id) : undefined}
                        >
                          {hasOrders && (
                            <span style={{ fontSize: 'var(--expand-icon-size)', flexShrink: 0, marginTop: 2 }}>
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          )}
                          <span>{item.product}</span>
                          {item.has_bom && (
                            <span title={t('warehouse.hasBom')} style={{ fontSize: 11, color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>⚙</span>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.pre_prod < 0 ? 'var(--color-error)' : undefined, fontWeight: item.pre_prod < 0 ? 600 : undefined }}>
                          {fmtNumber(Number(item.pre_prod))}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.finished < 0 ? 'var(--color-error)' : undefined, fontWeight: item.finished < 0 ? 600 : undefined }}>
                          {fmtNumber(Number(item.finished))}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: item.qty < 0 ? 'var(--color-error)' : item.qty === 0 ? 'var(--text-secondary)' : 'var(--primary)' }}>
                          {fmtNumber(Number(item.qty))}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                          {fmtNumber(Number(item.committed))}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: availFin < 0 ? 600 : undefined, color: availFin < 0 ? 'var(--color-error)' : availFin === 0 ? 'var(--text-secondary)' : undefined }}>
                          {fmtNumber(availFin)}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: availTot < 0 ? 600 : undefined, color: availTot < 0 ? 'var(--color-error)' : availTot === 0 ? 'var(--text-secondary)' : undefined }}>
                          {fmtNumber(availTot)}
                        </div>

                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.on_order > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                          {fmtNumber(Number(item.on_order))}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(100px, 2fr) repeat(7, minmax(62px, 1fr))',
                          gap: 6,
                          borderBottom: '1px solid var(--border)',
                          paddingBottom: 8,
                          paddingTop: 4,
                          fontSize: 12,
                        }}>
                          <div /><div /><div /><div />
                          <div>
                            {committedOrders.map(o => (
                              <div key={o.order_id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0 4px', marginBottom: 2 }}>
                                <button onClick={() => setCustomerModalOrder({ id: o.order_id })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>
                                  #{o.order_no}
                                </button>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(o.qty)}</span>
                              </div>
                            ))}
                          </div>
                          <div /><div />
                          <div>
                            {onOrderOrders.map(o => (
                              <div key={o.order_id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0 4px', marginBottom: 2 }}>
                                <button onClick={() => openSupplierOrder(o.order_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>
                                  #{o.order_no}
                                </button>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(o.qty)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Materials Section */}
      {materials.length > 0 && (
        <div className="card page-normal" style={{ marginTop: 16 }}>
          <div
            onClick={() => setMaterialsOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{materialsOpen ? '▼' : '▶'}</span>
            <h3 style={{ margin: 0 }}>{t('warehouse.materialsSection')}</h3>
          </div>

          {materialsOpen && (
            <div style={{ marginTop: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 500 }}>
                {/* Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(100px, 2fr) repeat(4, minmax(70px, 1fr)) minmax(100px, 2fr)',
                  gap: 6,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}>
                  <div>{t('product')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.receivedColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.consumedColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.onHandColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.onOrderColumn')}</div>
                  <div>{t('warehouse.usedInColumn')}</div>
                </div>

                {/* Rows */}
                {materials.map(mat => (
                  <div key={mat.product_id} style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(100px, 2fr) repeat(4, minmax(70px, 1fr)) minmax(100px, 2fr)',
                    gap: 6,
                    borderBottom: '1px solid var(--border)',
                    paddingTop: 10,
                    paddingBottom: 10,
                    fontSize: 13,
                    alignItems: 'start',
                  }}>
                    <div style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>{mat.product}</div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {fmtNumber(Number(mat.received))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {fmtNumber(Math.abs(Number(mat.consumed)))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: mat.on_hand < 0 ? 'var(--color-error)' : mat.on_hand === 0 ? 'var(--text-secondary)' : 'var(--primary)' }}>
                      {fmtNumber(Number(mat.on_hand))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: mat.on_order > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                      {fmtNumber(Number(mat.on_order))}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {(mat.used_in ?? []).join(', ') || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <OrderDetailModal
        isOpen={!!customerModalOrder}
        onClose={() => setCustomerModalOrder(null)}
        order={customerModalOrder}
      />
      <SupplierOrderDetailModal
        isOpen={!!supplierModalOrder}
        onClose={() => setSupplierModalOrder(null)}
        order={supplierModalOrder}
        supplierName={supplierModalOrder?.supplier_name ?? ''}
      />
    </>
  )
}

