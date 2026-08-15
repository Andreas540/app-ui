// src/pages/Warehouse.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, type Product, getAuthHeaders, type UnitCoverage, type CoverageOrderLine, listUnitCoverage, getAvailableCoverageLines, createUnitCoverage, updateUnitCoverage, deleteUnitCoverage, listProductCategories, createProductCategory } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
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
  unit_tracking: 'none' | 'on_promote' | 'serialized_intake'
  unit_instock_count: number
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

type InventoryUnit = {
  id: number
  serial_number: string | null
  condition: string | null
  listing_status: 'Inventory' | 'Listed' | 'Sold'
  notes: string | null
  acquired_at: string | null
  order_id: string | null
  order_no: number | null
  customer_name: string | null
}

type NamedItem = {
  id: string
  product_id: string
  product_name: string
  unit_identifier: string
  order_id: string
  order_no: number
  order_date: string
  customer_name: string
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
  const { parseAmount, fmtQty } = useCurrency()
  const { user } = useAuth()
  const isRetail = (user as any)?.businessTypeConfig?.inventory_mode === 'retail'
  const inventoryGrid = isRetail
    ? 'minmax(100px, 2fr) repeat(4, minmax(62px, 1fr))'
    : 'minmax(100px, 2fr) repeat(7, minmax(62px, 1fr))'

  const [products, setProducts] = useState<Product[]>([])
  const [materialProducts, setMaterialProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [unitCache, setUnitCache] = useState<Record<string, InventoryUnit[] | 'loading'>>({})
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ serial_number: '', condition: '', notes: '' })
  const [addingForProduct, setAddingForProduct] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ serial_number: '', condition: '', notes: '', acquired_at: '' })
  const [unitSaving, setUnitSaving] = useState(false)
  const [customerModalOrder, setCustomerModalOrder] = useState<{ id: string; order_no?: string | number | null } | null>(null)
  const [supplierModalOrder, setSupplierModalOrder] = useState<any | null>(null)
  const [expandedCoverageUnit, setExpandedCoverageUnit] = useState<number | null>(null)
  const [namedItems, setNamedItems] = useState<NamedItem[]>([])
  const [unitFetchError, setUnitFetchError] = useState<Record<string, string>>({})

  const [conditions, setConditions] = useState<string[]>([])
  const [editCondAdding, setEditCondAdding] = useState(false)
  const [editCondNew, setEditCondNew] = useState('')
  const [addCondAdding, setAddCondAdding] = useState(false)
  const [addCondNew, setAddCondNew] = useState('')

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const fetchUnits = async (productId: string): Promise<InventoryUnit[]> => {
    const res = await fetch(
      `/.netlify/functions/inventory-units?product_id=${productId}`,
      { headers: getAuthHeaders() }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `Failed to load units (${res.status})`)
    return data.units ?? []
  }

  const toggleUnits = async (productId: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
    // Only fetch L1 inventory units for products with unit tracking enabled
    const invItem = inventory.find(i => i.product_id === productId)
    if (!invItem || invItem.unit_tracking === 'none') return
    if (unitCache[productId] && unitCache[productId] !== 'loading' && (unitCache[productId] as InventoryUnit[]).length > 0) return
    setUnitCache(prev => ({ ...prev, [productId]: 'loading' }))
    setUnitFetchError(prev => { const n = { ...prev }; delete n[productId]; return n })
    try {
      const units = await fetchUnits(productId)
      setUnitCache(prev => ({ ...prev, [productId]: units }))
    } catch (e) {
      setUnitCache(prev => ({ ...prev, [productId]: [] }))
      setUnitFetchError(prev => ({ ...prev, [productId]: String(e) }))
    }
  }

  const refreshUnits = async (productId: string) => {
    setUnitCache(prev => ({ ...prev, [productId]: 'loading' }))
    setUnitFetchError(prev => { const n = { ...prev }; delete n[productId]; return n })
    try {
      const units = await fetchUnits(productId)
      setUnitCache(prev => ({ ...prev, [productId]: units }))
    } catch (e) {
      setUnitCache(prev => ({ ...prev, [productId]: [] }))
      setUnitFetchError(prev => ({ ...prev, [productId]: String(e) }))
    }
    // Also refresh inventory totals so unit_instock_count badge stays accurate
    const inv = await fetch('/.netlify/functions/warehouse-inventory', { headers: getAuthHeaders() })
    const invData = await inv.json()
    if (inv.ok) { setInventory(invData.inventory ?? []); setMaterials(invData.materials ?? []); setNamedItems(invData.named_items ?? []) }
  }

  const saveUnitEdit = async (productId: string) => {
    if (editingUnitId == null) return
    setUnitSaving(true)
    try {
      const res = await fetch('/.netlify/functions/inventory-units', {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id: editingUnitId, serial_number: editForm.serial_number || null, condition: editForm.condition || null, notes: editForm.notes || null }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Save failed'); return }
      setEditingUnitId(null)
      await refreshUnits(productId)
    } finally { setUnitSaving(false) }
  }

  const saveUnitAdd = async (productId: string) => {
    setUnitSaving(true)
    try {
      const res = await fetch('/.netlify/functions/inventory-units', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId, serial_number: addForm.serial_number || null, condition: addForm.condition || null, notes: addForm.notes || null, acquired_at: addForm.acquired_at || null }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Save failed'); return }
      setAddingForProduct(null)
      setAddForm({ serial_number: '', condition: '', notes: '', acquired_at: '' })
      await refreshUnits(productId)
    } finally { setUnitSaving(false) }
  }

  useEffect(() => { listProductCategories('condition').then(setConditions).catch(() => {}) }, [editingUnitId, addingForProduct])

  function handleAddConditionEdit() {
    const name = editCondNew.trim()
    if (!name) return
    setConditions(prev => prev.includes(name) ? prev : [...prev, name].sort())
    setEditForm(f => ({ ...f, condition: name }))
    setEditCondAdding(false)
    setEditCondNew('')
    createProductCategory('condition', name).catch(() => {})
  }

  function handleAddConditionAdd() {
    const name = addCondNew.trim()
    if (!name) return
    setConditions(prev => prev.includes(name) ? prev : [...prev, name].sort())
    setAddForm(f => ({ ...f, condition: name }))
    setAddCondAdding(false)
    setAddCondNew('')
    createProductCategory('condition', name).catch(() => {})
  }

  const demoteUnit = async (unitId: number, productId: string) => {
    const res = await fetch(`/.netlify/functions/inventory-units?id=${unitId}`, { method: 'DELETE', headers: getAuthHeaders() })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to remove unit'); return }
    await refreshUnits(productId)
  }

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
        setNamedItems(data.named_items || [])
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
              { value: 'P',        label: isRetail ? t('warehouse.inStockColumn') : t('warehouse.finishedProducts') },
              { value: 'material', label: t('warehouse.materialsSection') },
            ] as const).filter(opt => !(isRetail && opt.value === 'M')).map(opt => (
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
                  gridTemplateColumns: inventoryGrid,
                  gap: 6,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <div>{t('product')}</div>
                {isRetail ? <>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.inStockColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.committedTooltip')}>{t('warehouse.committedColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.availableColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.onOrderTooltip')}>{t('warehouse.onOrderColumn')}</div>
                </> : <>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.preProdColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.finishedColumn')}</div>
                  <div style={{ textAlign: 'right' }}>{t('warehouse.totalQtyColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.committedTooltip')}>{t('warehouse.committedColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.availableFinishedTooltip')}>{t('warehouse.availableFinishedColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.availableTotalTooltip')}>{t('warehouse.availableTotalColumn')}</div>
                  <div style={{ textAlign: 'right' }} title={t('warehouse.onOrderTooltip')}>{t('warehouse.onOrderColumn')}</div>
                </>}
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
                  const isUnitsExpanded = expandedUnits.has(item.product_id)
                  const isUnitTracked = item.unit_tracking !== 'none'
                  const unitRows = unitCache[item.product_id]
                  const namedForProduct = namedItems.filter(n => n.product_id === item.product_id)
                  const hasUniqueUnits = isUnitTracked || namedForProduct.length > 0
                  const uniqueUnitCount = Number(item.unit_instock_count) + namedForProduct.length
                  return (
                    <div key={item.product_id}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: inventoryGrid,
                          gap: 6,
                          borderBottom: (isExpanded || isUnitsExpanded) ? 'none' : '1px solid var(--border)',
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
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span>{item.product}</span>
                            {hasUniqueUnits && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleUnits(item.product_id) }}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: 11, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 3 }}
                              >
                                <span>{isUnitsExpanded ? '▼' : '▶'}</span>
                                <span>{t('warehouse.uniqueUnitsCount', { count: uniqueUnitCount })}</span>
                              </button>
                            )}
                          </span>
                          {item.has_bom && (
                            <span title={t('warehouse.hasBom')} style={{ fontSize: 11, color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>⚙</span>
                          )}
                        </div>

                        {isRetail ? <>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: item.qty < 0 ? 'var(--color-error)' : item.qty === 0 ? 'var(--text-secondary)' : 'var(--primary)' }}>
                            {fmtQty(Number(item.qty))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            {fmtQty(Number(item.committed))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: availTot < 0 ? 600 : undefined, color: availTot < 0 ? 'var(--color-error)' : availTot === 0 ? 'var(--text-secondary)' : undefined }}>
                            {fmtQty(availTot)}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.on_order > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                            {fmtQty(Number(item.on_order))}
                          </div>
                        </> : <>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.pre_prod < 0 ? 'var(--color-error)' : undefined, fontWeight: item.pre_prod < 0 ? 600 : undefined }}>
                            {fmtQty(Number(item.pre_prod))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.finished < 0 ? 'var(--color-error)' : undefined, fontWeight: item.finished < 0 ? 600 : undefined }}>
                            {fmtQty(Number(item.finished))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: item.qty < 0 ? 'var(--color-error)' : item.qty === 0 ? 'var(--text-secondary)' : 'var(--primary)' }}>
                            {fmtQty(Number(item.qty))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            {fmtQty(Number(item.committed))}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: availFin < 0 ? 600 : undefined, color: availFin < 0 ? 'var(--color-error)' : availFin === 0 ? 'var(--text-secondary)' : undefined }}>
                            {fmtQty(availFin)}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: availTot < 0 ? 600 : undefined, color: availTot < 0 ? 'var(--color-error)' : availTot === 0 ? 'var(--text-secondary)' : undefined }}>
                            {fmtQty(availTot)}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.on_order > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                            {fmtQty(Number(item.on_order))}
                          </div>
                        </>}
                      </div>

                      {isExpanded && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: inventoryGrid,
                          gap: 6,
                          borderBottom: isUnitsExpanded ? 'none' : '1px solid var(--border)',
                          paddingBottom: 8,
                          paddingTop: 4,
                          fontSize: 12,
                        }}>
                          {isRetail ? <><div /></> : <><div /><div /><div /><div /></>}
                          <div>
                            {committedOrders.map(o => (
                              <div key={o.order_id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0 4px', marginBottom: 2 }}>
                                <button onClick={() => setCustomerModalOrder({ id: o.order_id, order_no: o.order_no })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>
                                  #{o.order_no}
                                </button>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(o.qty)}</span>
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
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(o.qty)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {isUnitsExpanded && (
                        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, paddingTop: 4 }}>
                          {isUnitTracked && unitFetchError[item.product_id] && (
                            <div style={{ fontSize: 12, color: 'var(--color-error)', paddingLeft: 16, paddingBottom: 6 }}>{unitFetchError[item.product_id]}</div>
                          )}
                          {isUnitTracked && (unitRows === 'loading' || !unitRows) ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 16 }}>{t('warehouse.loadingUnits')}</div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <div style={{ minWidth: 420, fontSize: 12 }}>
                                {/* Unified header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px', gap: 6, fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: 4, paddingLeft: 16, paddingRight: 8 }}>
                                  <div>{t('warehouse.unitSerialCol')}</div>
                                  <div>{t('warehouse.unitConditionCol')}</div>
                                  <div>{t('warehouse.unitStatusCol')}</div>
                                  <div />
                                </div>

                                {/* Named item rows (order_items.unit_identifier, no inventory record) */}
                                {namedForProduct.map(ni => (
                                  <div key={ni.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 8, alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{ni.unit_identifier}</div>
                                    <div style={{ color: 'var(--text-secondary)' }}>—</div>
                                    <div style={{ color: 'var(--color-warning, #e6a817)' }}>
                                      {t('warehouse.statusListed')}
                                      {' · '}
                                      <button onClick={() => setCustomerModalOrder({ id: ni.order_id, order_no: ni.order_no })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>#{ni.order_no}</button>
                                      <span style={{ color: 'var(--text-secondary)' }}> · {ni.customer_name}</span>
                                    </div>
                                    <div />
                                  </div>
                                ))}

                                {/* Inventory unit rows */}
                                {isUnitTracked && Array.isArray(unitRows) && unitRows.map(u => {
                                  const isReserved = u.order_id != null
                                  return (
                                    <div key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                                      {editingUnitId === u.id ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 8px 8px 16px' }}>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            <input placeholder={t('warehouse.serialPlaceholder')} value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} style={{ fontSize: 12, padding: '4px 8px', height: 28 }} />
                                            {editCondAdding ? (
                                            <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                                              <input autoFocus placeholder="Condition name" value={editCondNew} onChange={e => setEditCondNew(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); handleAddConditionEdit() } if (e.key === 'Escape') { setEditCondAdding(false); setEditCondNew('') } }} style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 8px', height: 28 }} />
                                              <button onClick={handleAddConditionEdit} style={{ height: 28, padding: '0 8px', flexShrink: 0 }}>Add</button>
                                              <button onClick={() => { setEditCondAdding(false); setEditCondNew('') }} style={{ height: 28, padding: '0 8px', flexShrink: 0 }}>✕</button>
                                            </div>
                                          ) : (
                                            <select value={editForm.condition} onChange={e => { if (e.target.value === '__new__') { setEditCondAdding(true); setEditCondNew('') } else setEditForm(f => ({ ...f, condition: e.target.value })) }} style={{ fontSize: 12, padding: '4px 8px', height: 28 }}>
                                              <option value="">—</option>
                                              <option value="__new__">＋ New condition</option>
                                              {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                          )}
                                          </div>
                                          <input placeholder={t('warehouse.unitNotesPlaceholder')} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ fontSize: 12, padding: '4px 8px', height: 28 }} />
                                          <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => saveUnitEdit(item.product_id)} disabled={unitSaving} style={{ fontSize: 12, padding: '3px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.saveUnit')}</button>
                                            <button onClick={() => setEditingUnitId(null)} style={{ fontSize: 12, padding: '3px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.cancelUnit')}</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px', gap: 6, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 8, alignItems: 'center' }}>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span style={{ color: u.serial_number ? undefined : 'var(--text-secondary)' }}>{u.serial_number ?? '—'}</span>
                                            {u.listing_status === 'Inventory' && !isReserved && (
                                              <button onClick={() => navigate(`/orders/new?product_id=${item.product_id}&unit_id=${u.id}`)} style={{ fontSize: 10, padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', textAlign: 'left' }}>{t('newOrder')}</button>
                                            )}
                                          </div>
                                          <div style={{ color: u.condition ? undefined : 'var(--text-secondary)' }}>{u.condition ?? '—'}</div>
                                          <div style={{ color: u.listing_status === 'Sold' ? undefined : isReserved ? 'var(--color-warning, #e6a817)' : undefined }}>
                                            {u.listing_status === 'Sold' ? (
                                              <>
                                                {t('warehouse.statusSold')}
                                                {u.order_id && <> · <button onClick={() => setCustomerModalOrder({ id: u.order_id!, order_no: u.order_no })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>#{u.order_no}</button></>}
                                              </>
                                            ) : isReserved ? (
                                              <>
                                                {t('warehouse.statusListed')}
                                                {' · '}
                                                <button onClick={() => setCustomerModalOrder({ id: u.order_id!, order_no: u.order_no })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>#{u.order_no}</button>
                                                {u.customer_name && <span style={{ color: 'var(--text-secondary)' }}> · {u.customer_name}</span>}
                                              </>
                                            ) : (
                                              t('warehouse.statusInventory')
                                            )}
                                          </div>
                                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                            {u.listing_status === 'Inventory' && (
                                              <>
                                                <button onClick={() => { setEditingUnitId(u.id); setEditForm({ serial_number: u.serial_number ?? '', condition: u.condition ?? '', notes: u.notes ?? '' }) }} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.editUnit')}</button>
                                                <button onClick={() => demoteUnit(u.id, item.product_id)} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-error)' }}>{t('warehouse.demoteUnit')}</button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      <CoveragePanel
                                        unitId={u.id}
                                        productId={item.product_id}
                                        isExpanded={expandedCoverageUnit === u.id}
                                        onToggle={() => setExpandedCoverageUnit(prev => prev === u.id ? null : u.id)}
                                        t={t}
                                        isEditingThisUnit={editingUnitId === u.id}
                                      />
                                    </div>
                                  )
                                })}

                                {/* Add unit */}
                                {isUnitTracked && Array.isArray(unitRows) && (
                                  addingForProduct === item.product_id ? (
                                    <div style={{ borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 8px 4px 16px' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                        <input placeholder={t('warehouse.serialPlaceholder')} value={addForm.serial_number} onChange={e => setAddForm(f => ({ ...f, serial_number: e.target.value }))} style={{ fontSize: 12, padding: '4px 8px', height: 28 }} />
                                        {addCondAdding ? (
                                        <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                                          <input autoFocus placeholder="Condition name" value={addCondNew} onChange={e => setAddCondNew(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); handleAddConditionAdd() } if (e.key === 'Escape') { setAddCondAdding(false); setAddCondNew('') } }} style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 8px', height: 28 }} />
                                          <button onClick={handleAddConditionAdd} style={{ height: 28, padding: '0 8px', flexShrink: 0 }}>Add</button>
                                          <button onClick={() => { setAddCondAdding(false); setAddCondNew('') }} style={{ height: 28, padding: '0 8px', flexShrink: 0 }}>✕</button>
                                        </div>
                                      ) : (
                                        <select value={addForm.condition} onChange={e => { if (e.target.value === '__new__') { setAddCondAdding(true); setAddCondNew('') } else setAddForm(f => ({ ...f, condition: e.target.value })) }} style={{ fontSize: 12, padding: '4px 8px', height: 28 }}>
                                          <option value="">—</option>
                                          <option value="__new__">＋ New condition</option>
                                          {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                      )}
                                      </div>
                                      <input placeholder={t('warehouse.unitNotesPlaceholder')} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} style={{ fontSize: 12, padding: '4px 8px', height: 28 }} />
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => saveUnitAdd(item.product_id)} disabled={unitSaving} style={{ fontSize: 12, padding: '3px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.saveUnit')}</button>
                                        <button onClick={() => { setAddingForProduct(null); setAddForm({ serial_number: '', condition: '', notes: '', acquired_at: '' }) }} style={{ fontSize: 12, padding: '3px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.cancelUnit')}</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ borderTop: (unitRows.length > 0 || namedForProduct.length > 0) ? '1px solid var(--border)' : undefined, paddingTop: 6, paddingLeft: 16 }}>
                                      <button onClick={() => { setAddingForProduct(item.product_id); setEditingUnitId(null) }} style={{ fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)' }}>+ {t('warehouse.addUnit')}</button>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}
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
                      {fmtQty(Number(mat.received))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {fmtQty(Math.abs(Number(mat.consumed)))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: mat.on_hand < 0 ? 'var(--color-error)' : mat.on_hand === 0 ? 'var(--text-secondary)' : 'var(--primary)' }}>
                      {fmtQty(Number(mat.on_hand))}
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: mat.on_order > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                      {fmtQty(Number(mat.on_order))}
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

// ─── helpers ───────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── CoveragePanel ──────────────────────────────────────────────────────────

type CoveragePanelProps = {
  unitId: number
  productId: string
  isExpanded: boolean
  onToggle: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
  isEditingThisUnit: boolean
}

function CoveragePanel({ unitId, isExpanded, onToggle, t, isEditingThisUnit }: CoveragePanelProps) {
  const [coverages, setCoverages] = useState<UnitCoverage[] | 'loading' | null>(null)
  const [bindingMode, setBindingMode] = useState(false)
  const [adHocMode, setAdHocMode] = useState(false)
  const [bindLines, setBindLines] = useState<CoverageOrderLine[]>([])
  const [bindLoading, setBindLoading] = useState(false)
  const [suggestedStart, setSuggestedStart] = useState<string | null>(null)
  const [tenantWide, setTenantWide] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [adHocForm, setAdHocForm] = useState({ name: '', issuer_type: 'shop' as 'manufacturer' | 'shop' | 'third_party', issuer_name: '', coverage_ref: '', start_date: '', end_date: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: '', start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isExpanded && coverages === null) loadCoverages()
    if (!isExpanded) { setBindingMode(false); setAdHocMode(false); setEditingId(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded])

  async function loadCoverages() {
    setCoverages('loading')
    try { setCoverages((await listUnitCoverage(unitId)).coverages) }
    catch { setCoverages([]) }
  }

  async function refresh() {
    setCoverages('loading')
    try { setCoverages((await listUnitCoverage(unitId)).coverages) }
    catch { setCoverages([]) }
  }

  async function openBindPicker(wide = false) {
    setBindingMode(true); setAdHocMode(false); setBindLoading(true)
    setTenantWide(wide); setSelectedLineId(null)
    try {
      const data = await getAvailableCoverageLines(unitId, wide)
      setBindLines(data.lines)
      setSuggestedStart(data.unit_delivered_at)
    } finally { setBindLoading(false) }
  }

  async function confirmBind() {
    if (!selectedLineId) return
    const line = bindLines.find(l => l.order_item_id === selectedLineId)
    if (!line) return
    setSaving(true)
    try {
      const start = suggestedStart ?? new Date().toISOString().slice(0, 10)
      const end = line.coverage_duration_days ? addDays(start, line.coverage_duration_days) : start
      await createUnitCoverage({
        unit_id: unitId, order_item_id: line.order_item_id,
        coverage_product_id: line.coverage_product_id,
        name: line.name,
        issuer_type: (line.coverage_issuer_type as 'manufacturer' | 'shop' | 'third_party') ?? 'shop',
        issuer_name: line.coverage_issuer_name ?? null,
        coverage_ref: line.coverage_ref ?? null,
        start_date: start, end_date: end,
      })
      setBindingMode(false); setSelectedLineId(null)
      await refresh()
    } finally { setSaving(false) }
  }

  async function confirmAdHoc() {
    if (!adHocForm.name || !adHocForm.start_date || !adHocForm.end_date) return
    setSaving(true)
    try {
      await createUnitCoverage({
        unit_id: unitId, order_item_id: null, coverage_product_id: null,
        name: adHocForm.name, issuer_type: adHocForm.issuer_type,
        issuer_name: adHocForm.issuer_name || null,
        coverage_ref: adHocForm.coverage_ref || null,
        start_date: adHocForm.start_date, end_date: adHocForm.end_date,
      })
      setAdHocMode(false)
      setAdHocForm({ name: '', issuer_type: 'shop', issuer_name: '', coverage_ref: '', start_date: '', end_date: '' })
      await refresh()
    } finally { setSaving(false) }
  }

  async function saveEdit() {
    if (editingId == null) return
    setSaving(true)
    try {
      await updateUnitCoverage({ id: editingId, name: editForm.name, start_date: editForm.start_date, end_date: editForm.end_date })
      setEditingId(null)
      await refresh()
    } finally { setSaving(false) }
  }

  async function remove(id: number) {
    await deleteUnitCoverage(id)
    await refresh()
  }

  if (isEditingThisUnit) return null

  const cvrList = Array.isArray(coverages) ? coverages : []

  return (
    <>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, paddingBottom: 4, paddingLeft: 16 }}>
        <button
          onClick={onToggle}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
        >
          <span>{isExpanded ? '▼' : '▶'}</span>
          <span>{t('warehouse.coverageSection')}{cvrList.length > 0 ? ` (${cvrList.length})` : ''}</span>
        </button>
      </div>

      {isExpanded && (
        <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 10 }}>
          {coverages === 'loading' ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('warehouse.loadingCoverage')}</div>
          ) : (
            <>
              {cvrList.length === 0 && !bindingMode && !adHocMode && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('warehouse.noCoverage')}</div>
              )}

              {cvrList.map(c => (
                <div key={c.id} style={{ fontSize: 11, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  {editingId === c.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px' }} />
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px', flex: 1 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>→</span>
                        <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px', flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={saveEdit} disabled={saving} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.saveCoverage')}</button>
                        <button onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.cancelCoverage')}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ marginLeft: 6, fontWeight: 600, color: c.is_active ? 'var(--color-success, #22c55e)' : 'var(--color-error)' }}>
                          {c.is_active ? t('warehouse.coverageActive') : t('warehouse.coverageExpired')}
                        </span>
                        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                          {c.start_date} → {c.end_date}
                          {c.order_no && <span style={{ marginLeft: 6 }}>#{c.order_no}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => { setEditingId(c.id); setEditForm({ name: c.name, start_date: c.start_date, end_date: c.end_date }) }} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.editCoverage')}</button>
                        <button onClick={() => remove(c.id)} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-error)' }}>{t('warehouse.removeCoverage')}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {bindingMode && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t('warehouse.bindCoverageLine')}
                    <label style={{ fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="checkbox" checked={tenantWide} onChange={e => openBindPicker(e.target.checked)} style={{ width: 12, height: 12 }} />
                      {t('warehouse.coverageShowAllLines')}
                    </label>
                  </div>
                  {bindLoading ? (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('loading')}</div>
                  ) : bindLines.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('warehouse.coverageNoLines')}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      {bindLines.map(line => {
                        const remaining = line.qty - line.bound_count
                        return (
                          <label key={line.order_item_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: remaining <= 0 ? 'default' : 'pointer', fontSize: 11, opacity: remaining <= 0 ? 0.45 : 1 }}>
                            <input
                              type="radio" name={`bind-${unitId}`}
                              value={line.order_item_id}
                              checked={selectedLineId === line.order_item_id}
                              disabled={remaining <= 0}
                              onChange={() => setSelectedLineId(line.order_item_id)}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                            <span>
                              <span style={{ fontWeight: 600 }}>{line.name}</span>
                              {line.is_customer_match && <span style={{ marginLeft: 4, color: 'var(--primary)' }}>★</span>}
                              <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>#{line.order_no}</span>
                              {line.coverage_duration_days && <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>{line.coverage_duration_days}d</span>}
                              <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>{t('warehouse.coverageBoundCount', { count: line.bound_count })}/{line.qty}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={confirmBind} disabled={!selectedLineId || saving} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.saveCoverage')}</button>
                    <button onClick={() => { setBindingMode(false); setSelectedLineId(null) }} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.cancelCoverage')}</button>
                  </div>
                </div>
              )}

              {adHocMode && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{t('warehouse.addAdHocCoverage')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                    <input placeholder={t('warehouse.coverageNamePlaceholder')} value={adHocForm.name} onChange={e => setAdHocForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px', gridColumn: '1 / -1' }} />
                    <select value={adHocForm.issuer_type} onChange={e => setAdHocForm(f => ({ ...f, issuer_type: e.target.value as 'manufacturer' | 'shop' | 'third_party' }))} style={{ fontSize: 11, height: 26, padding: '2px 6px' }}>
                      <option value="manufacturer">{t('coverage.issuerManufacturer')}</option>
                      <option value="shop">{t('coverage.issuerShop')}</option>
                      <option value="third_party">{t('coverage.issuerThirdParty')}</option>
                    </select>
                    <input placeholder={t('coverage.issuerNamePlaceholder')} value={adHocForm.issuer_name} onChange={e => setAdHocForm(f => ({ ...f, issuer_name: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px' }} />
                    <input type="date" value={adHocForm.start_date} onChange={e => setAdHocForm(f => ({ ...f, start_date: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px' }} />
                    <input type="date" value={adHocForm.end_date} onChange={e => setAdHocForm(f => ({ ...f, end_date: e.target.value }))} style={{ fontSize: 11, height: 26, padding: '2px 6px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={confirmAdHoc} disabled={saving} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.saveCoverage')}</button>
                    <button onClick={() => setAdHocMode(false)} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>{t('warehouse.cancelCoverage')}</button>
                  </div>
                </div>
              )}

              {!bindingMode && !adHocMode && editingId === null && (
                <div style={{ display: 'flex', gap: 6, marginTop: cvrList.length > 0 ? 6 : 0 }}>
                  <button onClick={() => openBindPicker(false)} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    + {t('warehouse.bindCoverageLine')}
                  </button>
                  <button onClick={() => { setAdHocMode(true); setBindingMode(false) }} style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    + {t('warehouse.addAdHocCoverage')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

