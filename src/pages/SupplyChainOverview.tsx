// src/pages/SupplyChainOverview.tsx
import { useEffect, useMemo, useState } from 'react'
import { formatUSAny } from '../lib/time'
import { getAuthHeaders } from '../lib/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList,
  Cell,
} from 'recharts'

interface RecentDelivery {
  date: string
  customer: string
  product: string
  qty: number
}

interface NotDelivered {
  product: string
  qty: number
}

interface WarehouseInventory {
  product: string
  qty: number
}

interface InCustoms {
  product: string
  qty: number
}

interface OrderedFromSuppliers {
  product: string
  est_delivery_date: string | null
  delivery_date: string | null
  delivered: boolean
  qty: number
}

interface DemandData {
  product: string
  qty: number
}

interface SupplyChainData {
  recent_deliveries: RecentDelivery[]
  not_delivered: NotDelivered[]
  warehouse_inventory: WarehouseInventory[]
  in_customs: InCustoms[]
  ordered_from_suppliers: OrderedFromSuppliers[]
}

async function fetchSupplyChainData(): Promise<SupplyChainData> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/supply-chain-overview`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch supply chain data (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return res.json()
}

// Color palette for bars (aligned with app colors)
const CHART_COLORS = [
  '#f59e0b', // orange
  '#60a5fa', // light blue
  '#10b981', // green
  '#8b5cf6', // purple
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // dark orange
  '#3b82f6', // blue
  '#06b6d4', // cyan
]

export default function SupplyChainOverview() {
  const [data, setData] = useState<SupplyChainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [demandData, setDemandData] = useState<DemandData[]>([])
  const [demandLoading, setDemandLoading] = useState(true)
  const [demandErr, setDemandErr] = useState<string | null>(null)
  const [demandFilter, setDemandFilter] = useState<'30d' | '3m' | '6m' | 'custom'>('30d')
const [demandCustomFrom, setDemandCustomFrom] = useState('')
const [demandCustomTo, setDemandCustomTo] = useState('')

// Persistent color mapping for products
const [productColorMap] = useState(new Map<string, string>())
let colorIndex = 0

const getProductColor = (productName: string): string => {
  if (!productColorMap.has(productName)) {
    productColorMap.set(productName, CHART_COLORS[colorIndex % CHART_COLORS.length])
    colorIndex++
  }
  return productColorMap.get(productName)!
}

  // Track week offset for recently delivered chart (0 = current week, -1 = last week, etc.)
  const [weekOffset, setWeekOffset] = useState(0)

  // Track expanded state for each section
  const [expandedSections, setExpandedSections] = useState({
    demand: false,
    payAttention: false,
    recentDeliveries: false,
    notDelivered: false,
    warehouse: false,
    inCustoms: false,
    orderedFromSuppliers: false,
  })

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const d = await fetchSupplyChainData()
        setData(d)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Load demand data when filter changes
useEffect(() => {
  (async () => {
    try {
      setDemandLoading(true)
      setDemandErr(null)
      
      let url = ''
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      if (demandFilter === 'custom') {
        if (!demandCustomFrom || !demandCustomTo) {
          setDemandData([])
          setDemandLoading(false)
          return
        }
        url = `${base}/api/demand-by-product?from=${demandCustomFrom}&to=${demandCustomTo}`
      } else {
        const days = demandFilter === '30d' ? 30 : demandFilter === '3m' ? 90 : 180
        url = `${base}/api/demand-by-product?days=${days}`
      }
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to fetch demand data (status ${res.status}) ${text?.slice(0, 140)}`)
      }
      const d = await res.json()
      setDemandData(d)
    } catch (e: any) {
      setDemandErr(e?.message || String(e))
    } finally {
      setDemandLoading(false)
    }
  })()
}, [demandFilter, demandCustomFrom, demandCustomTo])

  // Calculate Monday-Sunday week range based on offset
  const getWeekRange = (offset: number): { start: Date; end: Date; startStr: string; endStr: string } => {
    const now = new Date()
    const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1 // Distance from Monday
    
    // Get this week's Monday at start of day
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - daysFromMonday + (offset * 7))
    thisMonday.setHours(0, 0, 0, 0)
    
    // Get this week's Sunday at end of day
    const thisSunday = new Date(thisMonday)
    thisSunday.setDate(thisMonday.getDate() + 6)
    thisSunday.setHours(23, 59, 59, 999)
    
    // Create YYYY-MM-DD strings for comparison (works with ISO date strings)
    const startStr = thisMonday.toISOString().split('T')[0]
    const endStr = thisSunday.toISOString().split('T')[0]
    
    return { start: thisMonday, end: thisSunday, startStr, endStr }
  }

  // Calculate weekly delivery data
  const weeklyDeliveryData = useMemo(() => {
    if (!data) return []
    
    const { startStr, endStr } = getWeekRange(weekOffset)
    
    // Filter deliveries for this week using string comparison
    const weekDeliveries = data.recent_deliveries.filter(item => {
      // Extract YYYY-MM-DD from the date string (handles various formats)
      const dateStr = item.date.split('T')[0]
      return dateStr >= startStr && dateStr <= endStr
    })
    
    // Aggregate by product
    const productMap = new Map<string, number>()
    weekDeliveries.forEach(item => {
      const current = productMap.get(item.product) || 0
      productMap.set(item.product, current + Math.abs(item.qty))
    })
    
    // Convert to array and sort by quantity descending
    return Array.from(productMap.entries())
      .map(([product, qty]) => ({ product, qty }))
      .sort((a, b) => b.qty - a.qty)
  }, [data, weekOffset])

  // Format week header
  const formatWeekHeader = () => {
    const { start, end } = getWeekRange(weekOffset)
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const totalQty = weeklyDeliveryData.reduce((sum, item) => sum + item.qty, 0)
    return {
      dateRange: `${startStr} - ${endStr}`,
      totalQty: intFmt.format(totalQty)
    }
  }

  // Create warehouse inventory lookup for color coding
  const warehouseInventoryMap = useMemo(() => {
  if (!data) return new Map<string, number>()
  const map = new Map<string, number>()
  data.warehouse_inventory.forEach(item => {
    map.set(item.product, Number(item.qty))
  })
  return map
}, [data])

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Print function for Not Delivered section
  const printNotDelivered = () => {
    if (!data || data.not_delivered.length === 0) {
      alert('No data to print')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print')
      return
    }

    const now = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Not Delivered - ${now}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              padding: 20px;
              color: #000;
              background: #fff;
            }
            .controls {
              display: flex;
              gap: 12px;
              margin-bottom: 20px;
            }
            .btn {
              padding: 10px 20px;
              border: 1px solid #ddd;
              border-radius: 6px;
              background: #f5f5f5;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            }
            .btn:hover {
              background: #e5e5e5;
            }
            .btn-primary {
              background: #2f6df6;
              color: white;
              border-color: #2f6df6;
            }
            .btn-primary:hover {
              background: #1e5ce6;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 8px;
            }
            .subtitle {
              font-size: 14px;
              color: #666;
              margin-bottom: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              text-align: left;
              padding: 12px 8px;
              border-bottom: 2px solid #000;
              font-weight: 600;
              font-size: 14px;
            }
            td {
              padding: 10px 8px;
              border-bottom: 1px solid #ddd;
              font-size: 14px;
            }
            .qty-col {
              text-align: right;
              font-variant-numeric: tabular-nums;
            }
            .total-row td {
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              font-weight: 600;
              padding-top: 16px;
              padding-bottom: 16px;
            }
            @media print {
              body {
                padding: 20px;
              }
              .controls {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="controls">
            <button class="btn btn-primary" onclick="window.print()">Print</button>
            <button class="btn" onclick="window.close()">Close</button>
          </div>

          <h1>Not Delivered</h1>
          <div class="subtitle">Generated: ${now}</div>
          
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th class="qty-col">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${data.not_delivered.map(item => `
                <tr>
                  <td>${item.product}</td>
                  <td class="qty-col">${intFmt.format(item.qty)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td>Total</td>
                <td class="qty-col">${intFmt.format(data.not_delivered.reduce((sum, item) => sum + Number(item.qty), 0))}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
    
    // Auto-print only on desktop (when window.matchMedia is available and not mobile)
    printWindow.onload = () => {
      printWindow.focus()
      // Check if device is likely desktop
      const isDesktop = printWindow.matchMedia && !printWindow.matchMedia('(max-width: 768px)').matches
      if (isDesktop) {
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }
    }
  }

  const intFmt = new Intl.NumberFormat('en-US')

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>
  if (!data) return null

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
    fontWeight: 700,
    color: 'white',
  }

  const expandIconStyle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 'bold',
    userSelect: 'none',
  }

  const tableHeaderStyle: React.CSSProperties = {
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--text-secondary)',
  }

  const tableRowStyle: React.CSSProperties = {
    borderBottom: '1px solid #eee',
    paddingTop: 8,
    paddingBottom: 8,
  }

  const weekHeader = formatWeekHeader()

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      <h3 style={{ margin: 0 }}>Supply Chain Overview</h3>

      {/* Section: Demand */}
<div style={{ marginTop: 20 }}>
  <div style={sectionHeaderStyle} onClick={() => toggleSection('demand')}>
    <span>Demand</span>
    <span style={expandIconStyle}>{expandedSections.demand ? '−' : '+'}</span>
  </div>

  {expandedSections.demand && (
    <div style={{ marginTop: 12 }}>
      {/* Filter buttons - First row: Quick filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <button
          className="primary"
          onClick={() => {
            setDemandFilter('30d')
            setDemandCustomFrom('')
            setDemandCustomTo('')
          }}
          aria-pressed={demandFilter === '30d'}
          style={{ height: 'calc(var(--control-h) * 0.67)' }}
        >
          Last 30 d
        </button>
        <button
          className="primary"
          onClick={() => {
            setDemandFilter('3m')
            setDemandCustomFrom('')
            setDemandCustomTo('')
          }}
          aria-pressed={demandFilter === '3m'}
          style={{ height: 'calc(var(--control-h) * 0.67)' }}
        >
          Last 3 m
        </button>
        <button
          className="primary"
          onClick={() => {
            setDemandFilter('6m')
            setDemandCustomFrom('')
            setDemandCustomTo('')
          }}
          aria-pressed={demandFilter === '6m'}
          style={{ height: 'calc(var(--control-h) * 0.67)' }}
        >
          Last 6 m
        </button>
      </div>

      {/* Filter row - Second row: Custom date range */}
      <div className="row row-2col-mobile" style={{ marginBottom: 16 }}>
        <div>
          <label>From</label>
          <input
            type="date"
            value={demandCustomFrom}
            onChange={(e) => {
              setDemandCustomFrom(e.target.value)
              if (e.target.value && demandCustomTo) {
                setDemandFilter('custom')
              }
            }}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          />
        </div>
        <div>
          <label>To</label>
          <input
            type="date"
            value={demandCustomTo}
            onChange={(e) => {
              setDemandCustomTo(e.target.value)
              if (demandCustomFrom && e.target.value) {
                setDemandFilter('custom')
              }
            }}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          />
        </div>
      </div>

      {/* Chart */}
      {demandLoading ? (
        <p className="helper">Loading demand data...</p>
      ) : demandErr ? (
        <p style={{ color: 'salmon' }}>Error: {demandErr}</p>
      ) : demandData.length === 0 ? (
        <p className="helper">No demand data for this period.</p>
      ) : (
        <div style={{ height: 300, marginTop: 12, outline: 'none' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={demandData}
              margin={{ top: 20, right: 0, bottom: 80, left: 0 }}
            >
              <XAxis
                dataKey="product"
                interval={0}
                angle={-90}
                textAnchor="end"
                tick={{ fontSize: 11, fill: '#fff' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={false}
                axisLine={false}
                width={0}
                domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.15)]}
              />
              <Bar dataKey="qty" isAnimationActive={false}>
                {demandData.map((entry, index) => {
                  // Get persistent color for this product
                  const color = getProductColor(entry.product)
                  return <Cell key={`cell-${index}`} fill={color} />
                })}
                <LabelList
                  dataKey="qty"
                  content={(props: any) => {
                    const { x, y, width, height, value } = props
                    if (!value || height <= 0) return null
                    
                    const formattedValue = intFmt.format(Number(value))
                    
                    // Center horizontally in the bar
                    const textX = x + width / 2
                    // Start from the BOTTOM of the bar (y + height), then go UP by 20px
                    const textY = y + height - 20
                    
                    return (
                      <text
                        x={textX}
                        y={textY}
                        fill="#fff"
                        fontSize={12}
                        fontWeight={700}
                        textAnchor="start"
                        dominantBaseline="middle"
                        transform={`rotate(-90 ${textX} ${textY})`}
                      >
                        {formattedValue}
                      </text>
                    )
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )}
</div>

      {/* Section: Pay attention to */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection('payAttention')}>
          <span>Pay attention to</span>
          <span style={expandIconStyle}>{expandedSections.payAttention ? '−' : '+'}</span>
        </div>

        {expandedSections.payAttention && (
          <div style={{ marginTop: 12 }}>
            <p className="helper">Content coming soon...</p>
          </div>
        )}
      </div>

      {/* Section 1: Recently delivered */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection('recentDeliveries')}>
          <span>Recently delivered</span>
          <span style={expandIconStyle}>{expandedSections.recentDeliveries ? '−' : '+'}</span>
        </div>

        {expandedSections.recentDeliveries && (
          <div style={{ marginTop: 12 }}>
            {/* Weekly delivery chart */}
            <div style={{ marginBottom: 24 }}>
              {/* Week navigation header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 12,
                gap: 12,
              }}>
                <button
                  onClick={() => setWeekOffset(offset => offset - 1)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: 18,
                    fontWeight: 'bold',
                  }}
                  title="Previous week"
                >
                  ←
                </button>
                
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {weekHeader.dateRange}
                  </div>
                  <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                    Total qty delivered: {weekHeader.totalQty}
                  </div>
                  {weeklyDeliveryData.length > 0 && (
                    <div className="helper" style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>
                      {weeklyDeliveryData.length} {weeklyDeliveryData.length === 1 ? 'product' : 'products'}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setWeekOffset(offset => offset + 1)}
                  disabled={weekOffset >= 0}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer',
                    color: weekOffset >= 0 ? 'var(--text-secondary)' : 'white',
                    fontSize: 18,
                    fontWeight: 'bold',
                    opacity: weekOffset >= 0 ? 0.4 : 1,
                  }}
                  title="Next week"
                >
                  →
                </button>
              </div>

              {/* Horizontal bar chart */}
              {weeklyDeliveryData.length === 0 ? (
                <p className="helper">No deliveries in this week.</p>
              ) : (
                <div style={{ height: Math.max(250, weeklyDeliveryData.length * 45), marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyDeliveryData}
                      layout="horizontal"
                      margin={{ top: 10, right: 80, bottom: 10, left: 10 }}
                    >
                      <XAxis
                        type="number"
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 'dataMax']}
                      />
                      <YAxis
                        type="category"
                        dataKey="product"
                        tick={{ fontSize: 13, fill: '#fff' }}
                        axisLine={false}
                        tickLine={false}
                        width={130}
                      />
                      <Bar 
                        dataKey="qty" 
                        isAnimationActive={false}
                        barSize={28}
                      >
                        {weeklyDeliveryData.map((entry, index) => {
                          const color = getProductColor(entry.product)
                          return <Cell key={`cell-${index}`} fill={color} />
                        })}
                        <LabelList
                          dataKey="qty"
                          position="right"
                          content={(props: any) => {
                            const { x, y, width, value } = props
                            if (!value) return null
                            
                            const formattedValue = intFmt.format(Number(value))
                            
                            return (
                              <text
                                x={x + width + 8}
                                y={y + 14}
                                fill="#fff"
                                fontSize={13}
                                fontWeight={700}
                                textAnchor="start"
                              >
                                {formattedValue}
                              </text>
                            )
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Original delivery list */}
            {data.recent_deliveries.length === 0 ? (
              <p className="helper">No deliveries in the last 30 days.</p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr 1fr 70px',
                    gap: 8,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>Del. date</div>
                  <div>Customer</div>
                  <div>Product</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                </div>

                {/* Data rows */}
                {data.recent_deliveries.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '70px 1fr 1fr 70px',
                      gap: 8,
                      ...tableRowStyle,
                    }}
                  >
                    <div className="helper" style={{ fontSize: 12 }}>{formatUSAny(item.date)}</div>
                    <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{item.customer}</div>
                    <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{item.product}</div>
                    <div style={{ textAlign: 'right', fontSize: 14 }}>{intFmt.format(Math.abs(item.qty))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Not delivered */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle}>
          <span onClick={() => toggleSection('notDelivered')} style={{ cursor: 'pointer', flex: 1 }}>
            Not delivered
          </span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                printNotDelivered()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 20,
                padding: '4px 8px',
                color: 'white',
              }}
              title="Print not delivered list"
            >
              🖨️
            </button>
            <span style={expandIconStyle} onClick={() => toggleSection('notDelivered')}>
              {expandedSections.notDelivered ? '−' : '+'}
            </span>
          </div>
        </div>

        {expandedSections.notDelivered && (
          <div style={{ marginTop: 12 }}>
            {data.not_delivered.length === 0 ? (
              <p className="helper">No undelivered orders.</p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px',
                    gap: 12,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>Product</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                </div>

                {/* Data rows */}
                {data.not_delivered.map((item, idx) => {
  const warehouseQty = Number(warehouseInventoryMap.get(item.product) ?? 0)
  const notDeliveredQty = Number(item.qty)
  
  // Green if warehouse has more than not delivered, red if less
  const rowColor = warehouseQty >= notDeliveredQty ? '#22c55e' : '#ef4444'

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px',
                        gap: 12,
                        ...tableRowStyle,
                        color: rowColor,
                        fontWeight: 500,
                      }}
                    >
                      <div>{item.product}</div>
                      <div style={{ textAlign: 'right' }}>{intFmt.format(item.qty)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: In the warehouse */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection('warehouse')}>
          <span>In the warehouse</span>
          <span style={expandIconStyle}>{expandedSections.warehouse ? '−' : '+'}</span>
        </div>

        {expandedSections.warehouse && (
          <div style={{ marginTop: 12 }}>
            {data.warehouse_inventory.length === 0 ? (
              <p className="helper">No inventory data.</p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px',
                    gap: 12,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>Product</div>
                  <div style={{ textAlign: 'right' }}>Quantity</div>
                </div>

                {/* Data rows */}
                {data.warehouse_inventory.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px',
                      gap: 12,
                      ...tableRowStyle,
                    }}
                  >
                    <div>{item.product}</div>
                    <div
                      style={{
                        textAlign: 'right',
                        color: item.qty < 0 ? 'salmon' : item.qty === 0 ? 'var(--text-secondary)' : undefined,
                        fontWeight: item.qty < 0 ? 600 : undefined,
                      }}
                    >
                      {intFmt.format(item.qty)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 4: In Customs */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection('inCustoms')}>
          <span>In Customs</span>
          <span style={expandIconStyle}>{expandedSections.inCustoms ? '−' : '+'}</span>
        </div>

        {expandedSections.inCustoms && (
          <div style={{ marginTop: 12 }}>
            {data.in_customs.length === 0 ? (
              <p className="helper">No orders in customs.</p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px',
                    gap: 12,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>Product</div>
                  <div style={{ textAlign: 'right' }}>Quantity</div>
                </div>

                {/* Data rows */}
                {data.in_customs.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px',
                      gap: 12,
                      ...tableRowStyle,
                    }}
                  >
                    <div>{item.product}</div>
                    <div style={{ textAlign: 'right' }}>{intFmt.format(item.qty)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 5: Ordered from suppliers */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection('orderedFromSuppliers')}>
          <span>Ordered from suppliers</span>
          <span style={expandIconStyle}>{expandedSections.orderedFromSuppliers ? '−' : '+'}</span>
        </div>

        {expandedSections.orderedFromSuppliers && (
          <div style={{ marginTop: 12 }}>
            {data.ordered_from_suppliers.length === 0 ? (
              <p className="helper">No supplier orders.</p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 80px',
                    gap: 8,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>Product</div>
                  <div>Date</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                </div>

                {/* Data rows */}
                {data.ordered_from_suppliers.map((item, idx) => {
                  let dateBadge = null

                  if (item.delivered && item.delivery_date) {
                    dateBadge = (
                      <span
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }}
                      >
                        Delivered: {formatUSAny(item.delivery_date)}
                      </span>
                    )
                  } else if (item.est_delivery_date) {
                    dateBadge = (
                      <span 
                        className="helper" 
                        style={{ 
                          fontSize: '11px', 
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }}
                      >
                        Est. delivery: {formatUSAny(item.est_delivery_date)}
                      </span>
                    )
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 80px',
                        gap: 8,
                        ...tableRowStyle,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ wordBreak: 'break-word' }}>{item.product}</div>
                      <div>{dateBadge}</div>
                      <div style={{ textAlign: 'right' }}>{intFmt.format(item.qty)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}