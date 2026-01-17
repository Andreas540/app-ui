// src/pages/Warehouse.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBootstrap, type Product, getAuthHeaders } from '../lib/api'
import { todayYMD } from '../lib/time'

type InventoryItem = {
  product: string
  product_id: string
  qty: number
}

export default function Warehouse() {
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form fields
  const [productId, setProductId] = useState('')
  const [qtyStr, setQtyStr] = useState('')
  const [date, setDate] = useState<string>(todayYMD())
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

      // Filter out Refund/Discount, Other Products, and Other Services
      const filtered = bootProducts.filter((p) => {
        const name = p.name.trim().toLowerCase()
        return (
          !name.includes('refund') &&
          !name.includes('discount') &&
          !name.includes('other product') &&
          !name.includes('other service')
        )
      })

      setProducts(filtered)
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
      }
    } catch (e) {
      console.error('Failed to fetch inventory:', e)
    }
  }

  // Parse quantity (allow negative with minus sign)
  function parseQtyToNumber(s: string): number {
    if (!s || s.trim() === '' || s.trim() === '-') return NaN
    const cleaned = s.trim().replace(/,/g, '')
    const num = parseInt(cleaned, 10)
    return isNaN(num) ? NaN : num
  }

  // Parse decimal (allow starting with . or ,)
  function parseDecimalToNumber(s: string): number {
    if (!s || s.trim() === '') return NaN
    let t = s.trim().replace(',', '.')
    t = t.replace(/^(-)?\.(\d+)/, '$10.$2')
    const m = t.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)$/)
    if (m) return Number(m[0])
    const fallback = t.match(/-?(?:\d+\.\d+|\d+)/)
    return fallback ? Number(fallback[0]) : NaN
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
  const productCost = useMemo(() => parseDecimalToNumber(productCostStr), [productCostStr])
  const laborCost = useMemo(() => parseDecimalToNumber(laborCostStr), [laborCostStr])

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId])

  const currentInventoryQty = useMemo(() => {
    const item = inventory.find((i) => i.product_id === productId)
    return item ? item.qty : 0
  }, [inventory, productId])

  const newInventoryQty = useMemo(() => {
    if (!Number.isInteger(qtyInt)) return currentInventoryQty
    return currentInventoryQty + qtyInt
  }, [currentInventoryQty, qtyInt])

  const willGoNegative = useMemo(() => {
    return Number.isInteger(qtyInt) && qtyInt < 0 && newInventoryQty < 0
  }, [qtyInt, newInventoryQty])

  const intFmt = useMemo(() => new Intl.NumberFormat('en-US'), [])

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>
  if (!products.length) return <div className="card"><p>No products available.</p></div>

  return (
    <>
      {/* Adjust Warehouse Inventory Card */}
      <div className="card" style={{ maxWidth: 720 }}>
        <h3 style={{ margin: 0 }}>Adjust Warehouse Inventory</h3>

        {/* Row 1: Product */}
        <div style={{ marginTop: 12 }}>
          <label>Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{ height: CONTROL_H }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Row 2: Quantity | Date (50/50) */}
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          {/* LEFT: Qty */}
          <div>
            <label>Qty (- if reducing inv.)</label>

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
                  background: qtyStr.trim().startsWith('-') ? 'salmon' : 'transparent',
                  color: qtyStr.trim().startsWith('-') ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Toggle negative"
                aria-label="Toggle negative quantity"
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
                  borderColor: willGoNegative ? 'salmon' : undefined,
                }}
              />
            </div>

            {willGoNegative && (
              <div style={{ color: 'salmon', fontSize: 13, marginTop: 4 }}>
                ⚠️ This will reduce {selectedProduct?.name} below zero (New qty: {newInventoryQty})
              </div>
            )}
          </div>

          {/* RIGHT: Date */}
          <div>
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
        </div>

        {/* Row 3: Product cost | Labor cost (50/50) */}
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
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

        {/* Row 4: Notes */}
        <div style={{ marginTop: 12 }}>
          <label>Notes (optional)</label>
          <input
            type="text"
            placeholder="Add notes about this entry..."
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
                alert('Select a product first')
                return
              }

              const qty = parseQtyToNumber(qtyStr)
              if (!Number.isInteger(qty) || qty === 0) {
                alert('Enter a valid quantity (cannot be 0)')
                return
              }

              if (!date) {
                alert('Select a date')
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
                    product_cost: productCostToSend,
                    labor_cost: laborCostToSend,
                    notes: notes.trim() || undefined,
                  }),
                })

                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}))
                  throw new Error(errData.error || `Save failed (${res.status})`)
                }

                alert('Warehouse entry saved!')

                setQtyStr('')
                setDate(todayYMD())
                setProductCostStr('')
                setLaborCostStr('')
                setNotes('')
                await loadInventory()
              } catch (e: any) {
                alert(e?.message || 'Save failed')
              }
            }}
            style={{ height: CONTROL_H }}
          >
            Save
          </button>

          <button
            onClick={() => {
              setQtyStr('')
              setDate(todayYMD())
              setProductCostStr('')
              setLaborCostStr('')
              setNotes('')
            }}
            style={{ height: CONTROL_H }}
          >
            Clear
          </button>

          <button
            onClick={() => navigate(-1)}
            style={{ height: CONTROL_H }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Current Inventory Card */}
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>Current Inventory</h4>
        {inventory.length === 0 ? (
          <p className="helper">No inventory data yet</p>
        ) : (
          <div style={{ display: 'grid' }}>
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
              .map((item) => (
                <div
                  key={item.product_id}
                  style={{
                    borderBottom: '1px solid #eee',
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div className="helper">{item.product}</div>
                    <div
                      className="helper"
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color:
                          item.qty < 0
                            ? 'salmon'
                            : item.qty === 0
                              ? undefined
                              : 'var(--primary)',
                      }}
                    >
                      {intFmt.format(item.qty)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  )
}

