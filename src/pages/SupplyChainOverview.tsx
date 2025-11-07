// src/pages/SupplyChainOverview.tsx
import { useEffect, useState } from 'react'
import { formatUSAny } from '../lib/time'

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

export default function SupplyChainOverview() {
  const [data, setData] = useState<SupplyChainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Track expanded state for each section
  const [expandedSections, setExpandedSections] = useState({
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
                    gridTemplateColumns: '100px 1fr 1fr 80px',
                    gap: 12,
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
                      gridTemplateColumns: '100px 1fr 1fr 80px',
                      gap: 12,
                      ...tableRowStyle,
                    }}
                  >
                    <div className="helper">{formatUSAny(item.date)}</div>
                    <div>{item.customer}</div>
                    <div>{item.product}</div>
                    <div style={{ textAlign: 'right' }}>{intFmt.format(Math.abs(item.qty))}</div>
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
                {data.not_delivered.map((item, idx) => (
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
                    gridTemplateColumns: '1fr 180px 100px',
                    gap: 12,
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
                          fontSize: '12px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Delivered: {formatUSAny(item.delivery_date)}
                      </span>
                    )
                  } else if (item.est_delivery_date) {
                    dateBadge = (
                      <span className="helper" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                        Est. delivery: {formatUSAny(item.est_delivery_date)}
                      </span>
                    )
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 180px 100px',
                        gap: 12,
                        ...tableRowStyle,
                      }}
                    >
                      <div>{item.product}</div>
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