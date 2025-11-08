// src/pages/SupplyChainOverview.tsx
import { useEffect, useMemo, useState } from 'react'
import { formatUSAny } from '../lib/time'
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
  const res = await fetch(`${base}/api/supply-chain-overview`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch supply chain data (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return res.json()
}

async function fetchDemandData(days: number): Promise<DemandData[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/demand-by-product?days=${days}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch demand data (status ${res.status}) ${text?.slice(0, 140)}`)
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
  const [demandFilter, setDemandFilter] = useState<30 | 90>(30)

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
        const d = await fetchDemandData(demandFilter)
        setDemandData(d)
      } catch (e: any) {
        setDemandErr(e?.message || String(e))
      } finally {
        setDemandLoading(false)
      }
    })()
  }, [demandFilter])

  // Create warehouse inventory lookup for color coding
  const warehouseInventoryMap = useMemo(() => {
    if (!data) return new Map<string, number>()
    const map = new Map<string, number>()
    data.warehouse_inventory.forEach(item => {
      map.set(item.product, item.qty)
    })
    return map
  }, [data])

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
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
            {/* Filter buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <button
                className="primary"
                onClick={() => setDemandFilter(30)}
                aria-pressed={demandFilter === 30}
                style={{ height: 'calc(var(--control-h) * 0.67)' }}
              >
                Last 30 days
              </button>
              <button
                className="primary"
                onClick={() => setDemandFilter(90)}
                aria-pressed={demandFilter === 90}
                style={{ height: 'calc(var(--control-h) * 0.67)' }}
              >
                Last 90 days
              </button>
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
                    margin={{ top: 20, right: 0, bottom: 10, left: 0 }}
                  >
                    <XAxis
                      dataKey="product"
                      tick={false}
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
                      {demandData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                      <LabelList
                        dataKey="qty"
                        position="top"
                        offset={8}
                        formatter={(v: any) => intFmt.format(Number(v))}
                        fill="#fff"
                        style={{ fontSize: 12, fontWeight: 700 }}
                      />
                      <LabelList
                        dataKey="product"
                        position="inside"
                        angle={-90}
                        offset={0}
                        fill="#fff"
                        style={{ 
                          fontSize: 10, 
                          fontWeight: 600,
                          textAnchor: 'end',
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
        <div style={sectionHeaderStyle} onClick={() => toggleSection('notDelivered')}>
          <span>Not delivered</span>
          <span style={expandIconStyle}>{expandedSections.notDelivered ? '−' : '+'}</span>
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
                  const warehouseQty = warehouseInventoryMap.get(item.product) ?? 0
                  const notDeliveredQty = item.qty
                  
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