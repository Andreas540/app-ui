// src/pages/SupplyChainOverview.tsx
import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatShortMonthDay, formatShortMonthDayYear, formatDateTime } from '../lib/time'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { DateInput } from '../components/DateInput'
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
  pre_prod: number
  finished: number
  qty: number // total
}

interface InCustoms {
  product: string
  qty: number
}

interface NotDeliveredOrder {
  product: string
  order_id: string
  customer: string
  order_date: string
  qty: number
}

interface OrderedFromSuppliers {
  product: string
  est_delivery_date: string | null
  delivery_date: string | null
  delivered: boolean
  qty: number
}

interface ProductionData {
  date: string
  product: string
  qty: number
}

interface DemandData {
  product: string
  qty: number
}

interface SupplyChainData {
  recent_deliveries: RecentDelivery[]
  not_delivered: NotDelivered[]
  not_delivered_orders: NotDeliveredOrder[]
  warehouse_inventory: WarehouseInventory[]
  production_data?: ProductionData[]
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
function shouldHideProduct(name: string) {
  const n = (name || '').trim().toLowerCase()
  return (
    n.includes('refund') ||
    n.includes('discount') ||
    n.includes('other product') ||
    n.includes('other service')
  )
}
export default function SupplyChainOverview() {
  const { t } = useTranslation()
  const { t: ti } = useTranslation('info')
  const navigate = useNavigate()
  const { user } = useAuth()
  const showInfoIcons = getTenantConfig(user?.tenantId).ui.showInfoIconsPages
  const [data, setData] = useState<SupplyChainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [demandData, setDemandData] = useState<DemandData[]>([])
  const [demandLoading, setDemandLoading] = useState(true)
  const [demandErr, setDemandErr] = useState<string | null>(null)
  const [demandFilter, setDemandFilter] = useState<'30d' | '3m' | '6m' | 'custom'>('30d')
  const [demandCustomFrom, setDemandCustomFrom] = useState('')
  const [demandCustomTo, setDemandCustomTo] = useState('')

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const runDemandAnalysis = async () => {
    setAiLoading(true)
    setAiErr(null)
    setAiAnalysis(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/supply-chain-analyze`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Status ${res.status}`)
      setAiAnalysis(json.analysis)
    } catch (e: any) {
      setAiErr(e?.message || String(e))
    } finally {
      setAiLoading(false)
    }
  }

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
  
  // Track week offset for production chart
  const [productionWeekOffset, setProductionWeekOffset] = useState(0)

  const [expandedNotDeliveredProduct, setExpandedNotDeliveredProduct] = useState<string | null>(null)
  const [showWarehouseInfo, setShowWarehouseInfo] = useState(false)
  const [showOrderedInfo, setShowOrderedInfo] = useState(false)

  // Track expanded state for each section
  const [expandedSections, setExpandedSections] = useState({
    demand: false,
    payAttention: false,
    recentDeliveries: false,
    production: false,
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

  const toLocalYMD = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

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

    // Create YYYY-MM-DD strings for comparison using LOCAL dates (avoid UTC rollover overlap)
    const startStr = toLocalYMD(thisMonday)
    const endStr = toLocalYMD(thisSunday)

    return { start: thisMonday, end: thisSunday, startStr, endStr }
  }

  // Calculate weekly delivery data
  const weeklyDeliveryData = useMemo(() => {
    if (!data) return []

    const { startStr, endStr } = getWeekRange(weekOffset)

    // Filter deliveries for this week using string comparison
    const weekDeliveries = data.recent_deliveries.filter(item => {
      if (shouldHideProduct(item.product)) return false
      // Extract YYYY-MM-DD from the date string (handles various formats)
      const dateStr = item.date.split('T')[0]
      return dateStr >= startStr && dateStr <= endStr
    })

    // Aggregate by product
    const productMap = new Map<string, number>()
    weekDeliveries.forEach(item => {
      const current = productMap.get(item.product) || 0
      productMap.set(item.product, current + Math.abs(Number(item.qty)))
    })

    // Convert to array and sort by quantity descending
    const result = Array.from(productMap.entries())
      .map(([product, qty]) => ({
        product,
        qty: Number(qty)
      }))
      .sort((a, b) => b.qty - a.qty)

    return result
  }, [data, weekOffset])

  // Calculate weekly production data
  const weeklyProductionData = useMemo(() => {
    if (!data || !data.production_data || data.production_data.length === 0) return []

    const { startStr, endStr } = getWeekRange(productionWeekOffset)

    // Filter production for this week using string comparison
    const weekProduction = data.production_data.filter(item => {
      const dateStr = item.date.split('T')[0]
      return dateStr >= startStr && dateStr <= endStr
    })

    // Aggregate by product
    const productMap = new Map<string, number>()
    weekProduction.forEach(item => {
      const current = productMap.get(item.product) || 0
      productMap.set(item.product, current + Math.abs(Number(item.qty)))
    })

    // Convert to array and sort by quantity descending
    const result = Array.from(productMap.entries())
      .map(([product, qty]) => ({
        product,
        qty: Number(qty)
      }))
      .sort((a, b) => b.qty - a.qty)

    return result
  }, [data, productionWeekOffset])

  // Format week header
  const formatWeekHeader = (offset: number) => {
    const { start, end } = getWeekRange(offset)
    const startStr = formatShortMonthDay(start)
    const endStr = formatShortMonthDay(end)
    return `${startStr} - ${endStr}`
  }

  // Get demand title
  const getDemandTitle = () => {
    if (demandFilter === '30d') return t('supplyChain.demandTitle30Days')
    if (demandFilter === '3m') return t('supplyChain.demandTitle3Months')
    if (demandFilter === '6m') return t('supplyChain.demandTitle6Months')
    if (demandFilter === 'custom' && demandCustomFrom && demandCustomTo) {
      const from = formatShortMonthDayYear(demandCustomFrom)
      const to = formatShortMonthDayYear(demandCustomTo)
      return t('supplyChain.demandTitleCustomRange', { from, to })
    }
    return t('supplyChain.demand')
  }

  // Create warehouse inventory lookup for color coding
    const warehouseInventoryMap = useMemo(() => {
    if (!data) return new Map<string, number>()
    const map = new Map<string, number>()

    data.warehouse_inventory.forEach(item => {
      if (shouldHideProduct(item.product)) return
      const pre = Number(item.pre_prod ?? 0)
      const fin = Number(item.finished ?? 0)
      map.set(item.product, pre + fin) // Total
    })

    return map
  }, [data])

    const filteredDemandData = useMemo(() => {
    return demandData.filter(d => !shouldHideProduct(d.product))
  }, [demandData])

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

    const now = formatDateTime(new Date())

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
            <button class="btn btn-primary" onclick="window.print()">${t('print')}</button>
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

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    printWindow.location.href = url

    printWindow.onload = () => {
      URL.revokeObjectURL(url)
      printWindow.focus()
      const isDesktop = printWindow.matchMedia && !printWindow.matchMedia('(max-width: 768px)').matches
      if (isDesktop) {
        printWindow.print()
      }
    }
  }

  const intFmt = new Intl.NumberFormat('en-US')

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>
  if (!data) return null

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
    fontWeight: 700,
    color: 'var(--text, inherit)',
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

  const deliveryWeekHeader = formatWeekHeader(weekOffset)
  const deliveryTotalQty = weeklyDeliveryData.reduce((sum, item) => sum + item.qty, 0)

  const productionWeekHeader = formatWeekHeader(productionWeekOffset)
  const productionTotalQty = weeklyProductionData.reduce((sum, item) => sum + item.qty, 0)

  return (
    <div className="card page-normal">
      <h3 style={{ margin: 0 }}>{t('supplyChain.title')}</h3>

      {/* AI analysis overlay */}
      {(aiAnalysis !== null || aiLoading || aiErr) && (
        <div
          onClick={() => { setAiAnalysis(null); setAiErr(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'var(--backdrop)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 520,
              width: '100%',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <strong style={{ fontSize: 15 }}>{t('supplyChain.aiDemandAnalysis')}</strong>
              <button
                onClick={() => { setAiAnalysis(null); setAiErr(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', padding: '0 4px' }}
              >✕</button>
            </div>
            {aiLoading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{t('loading')}</p>}
            {aiErr    && <p style={{ color: 'var(--color-error)', margin: 0 }}>{aiErr}</p>}
            {aiAnalysis && <p style={{ margin: 0, lineHeight: 1.6 }}>{aiAnalysis}</p>}
          </div>
        </div>
      )}

      {/* Section: Demand */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle}>
          <span onClick={() => toggleSection('demand')} style={{ cursor: 'pointer', flex: 1 }}>
            {t('supplyChain.demand')}
          </span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={e => { e.stopPropagation(); runDemandAnalysis() }}
              disabled={aiLoading}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: aiLoading ? 'default' : 'pointer',
                fontSize: 18,
                padding: '4px 8px',
                color: 'var(--text)',
                opacity: aiLoading ? 0.5 : 1,
              }}
              title={t('supplyChain.aiAnalyze')}
            >
              🤖
            </button>
            <span style={expandIconStyle} onClick={() => toggleSection('demand')}>
              {expandedSections.demand ? '−' : '+'}
            </span>
          </div>
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
                {t('supplyChain.last30d')}
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
                {t('supplyChain.last3m')}
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
                {t('supplyChain.last6m')}
              </button>
            </div>

            {/* Filter row - Second row: Custom date range */}
            <div className="row row-2col-mobile" style={{ marginBottom: 16 }}>
              <div>
                <label>{t('supplyChain.from')}</label>
                <DateInput
                  value={demandCustomFrom}
                  onChange={(v) => {
                    setDemandCustomFrom(v)
                    if (v && demandCustomTo) {
                      setDemandFilter('custom')
                    }
                  }}
                  style={{ height: 'calc(var(--control-h) * 0.67)' }}
                />
              </div>
              <div>
                <label>{t('supplyChain.to')}</label>
                <DateInput
                  value={demandCustomTo}
                  onChange={(v) => {
                    setDemandCustomTo(v)
                    if (demandCustomFrom && v) {
                      setDemandFilter('custom')
                    }
                  }}
                  style={{ height: 'calc(var(--control-h) * 0.67)' }}
                />
              </div>
            </div>

            {/* Title */}
            <h4 style={{ 
              margin: '16px 0 12px 0', 
              fontSize: 16, 
              fontWeight: 600,
              color: 'var(--primary)',
            }}>
              {getDemandTitle()}
            </h4>

            {/* Chart */}
            {demandLoading ? (
              <p className="helper">{t('supplyChain.loadingDemand')}</p>
            ) : demandErr ? (
              <p style={{ color: 'var(--color-error)' }}>{t('error')} {demandErr}</p>
            ) : filteredDemandData.length === 0 ? (
              <p className="helper">{t('supplyChain.noDemandData')}</p>
            ) : (
              <div style={{ height: 300, marginTop: 12, outline: 'none' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredDemandData}
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
                      {filteredDemandData.map((entry, index) => {
                        const color = getProductColor(entry.product)
                        return <Cell key={`cell-${index}`} fill={color} />
                      })}
                      <LabelList
                        dataKey="qty"
                        content={(props: any) => {
                          const { x, y, width, height, value } = props
                          if (!value || height <= 0) return null

                          const formattedValue = intFmt.format(Number(value))
                          const textX = x + width / 2
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
          <span>{t('supplyChain.payAttentionTo')}</span>
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
          <span>{t('supplyChain.recentlyDelivered')}</span>
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
                    color: 'var(--text, inherit)',
                    fontSize: 18,
                    fontWeight: 'bold',
                  }}
                  title={t('supplyChain.previousWeek')}
                >
                  ←
                </button>

                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {deliveryWeekHeader}
                  </div>
                  <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                    {t('supplyChain.totalQtyDelivered', { qty: intFmt.format(deliveryTotalQty) })}
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
                    color: weekOffset >= 0 ? 'var(--text-secondary)' : 'var(--text, inherit)',
                    fontSize: 18,
                    fontWeight: 'bold',
                    opacity: weekOffset >= 0 ? 0.4 : 1,
                  }}
                  title={t('supplyChain.nextWeek')}
                >
                  →
                </button>
              </div>

              {/* Horizontal bar chart */}
              {weeklyDeliveryData.length === 0 ? (
                <p className="helper">{t('supplyChain.noDeliveriesThisWeek')}</p>
              ) : (
                <div style={{
                  width: '100%',
                  height: Math.max(220, weeklyDeliveryData.length * 40),
                  marginTop: 12,
                }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyDeliveryData}
                      layout="vertical"
                      margin={{ top: 5, right: 40, bottom: 5, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={false}
                        axisLine={false}
                        width={0}
                        domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.15)]}
                      />
                      <YAxis
                        type="category"
                        dataKey="product"
                        tick={{ fontSize: 12, fill: '#fff' }}
                        axisLine={false}
                        tickLine={false}
                        width={120}
                      />
                      <Bar dataKey="qty" isAnimationActive={false} barSize={18}>
                        {weeklyDeliveryData.map((entry, index) => {
                          const color = getProductColor(entry.product)
                          return <Cell key={`cell-${index}`} fill={color} />
                        })}
                        <LabelList
                          dataKey="qty"
                          position="right"
                          content={(props: any) => {
                            const { x, y, width, value, height } = props
                            if (!value) return null

                            const formattedValue = intFmt.format(Number(value))

                            return (
                              <text
                                x={x + width + 10}
                                y={y + height / 2}
                                fill="#fff"
                                fontSize={12}
                                fontWeight={700}
                                dominantBaseline="middle"
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
            {data.recent_deliveries.filter(item => !shouldHideProduct(item.product)).length === 0 ? (
              <p className="helper">{t('supplyChain.noDeliveriesLast30Days')}</p>
            ) : (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr 1fr 70px',
                    gap: 8,
                    ...tableHeaderStyle,
                  }}
                >
                  <div>{t('supplyChain.delDateColumn')}</div>
                  <div>Customer</div>
                  <div>Product</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                </div>

                {data.recent_deliveries
                  .filter(item => !shouldHideProduct(item.product))
                  .map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '70px 1fr 1fr 70px',
                        gap: 8,
                        ...tableRowStyle,
                      }}
                    >
                      <div className="helper" style={{ fontSize: 12 }}>{formatDate(item.date)}</div>
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

      {/* NEW SECTION: Production */}
<div style={{ marginTop: 20 }}>
  <div style={sectionHeaderStyle} onClick={() => toggleSection('production')}>
    <span>{t('supplyChain.production')}</span>
    <span style={expandIconStyle}>{expandedSections.production ? '−' : '+'}</span>
  </div>

  {expandedSections.production && (
    <div style={{ marginTop: 12 }}>
      {/* Week navigation header - ALWAYS show */}
<>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  }}>
    <button
      onClick={() => setProductionWeekOffset(offset => offset - 1)}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '8px 12px',
        cursor: 'pointer',
        color: 'var(--text, inherit)',
        fontSize: 18,
        fontWeight: 'bold',
      }}
      title={t('supplyChain.previousWeek')}
    >
      ←
    </button>

    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {productionWeekHeader}
      </div>
      <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
        {t('supplyChain.totalQtyProduced', { qty: intFmt.format(productionTotalQty) })}
      </div>
      {weeklyProductionData.length > 0 && (
        <div className="helper" style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>
          {weeklyProductionData.length} {weeklyProductionData.length === 1 ? 'product' : 'products'}
        </div>
      )}
    </div>

    <button
      onClick={() => setProductionWeekOffset(offset => offset + 1)}
      disabled={productionWeekOffset >= 0}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '8px 12px',
        cursor: productionWeekOffset >= 0 ? 'not-allowed' : 'pointer',
        color: productionWeekOffset >= 0 ? 'var(--text-secondary)' : 'var(--text, inherit)',
        fontSize: 18,
        fontWeight: 'bold',
        opacity: productionWeekOffset >= 0 ? 0.4 : 1,
      }}
      title={t('supplyChain.nextWeek')}
    >
      →
    </button>
  </div>

  {/* Horizontal bar chart */}
  {weeklyProductionData.length === 0 ? (
    <p className="helper">{t('supplyChain.noDeliveriesThisWeek')}</p>
  ) : (
    <div style={{
      width: '100%',
      height: Math.max(220, weeklyProductionData.length * 40),
      marginTop: 12,
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={weeklyProductionData}
          layout="vertical"
          margin={{ top: 5, right: 40, bottom: 5, left: 0 }}
        >
          <XAxis
            type="number"
            tick={false}
            axisLine={false}
            width={0}
            domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.15)]}
          />
          <YAxis
            type="category"
            dataKey="product"
            tick={{ fontSize: 12, fill: '#fff' }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Bar dataKey="qty" isAnimationActive={false} barSize={18}>
            {weeklyProductionData.map((entry, index) => {
              const color = getProductColor(entry.product)
              return <Cell key={`cell-${index}`} fill={color} />
            })}
            <LabelList
              dataKey="qty"
              position="right"
              content={(props: any) => {
                const { x, y, width, value, height } = props
                if (!value) return null

                const formattedValue = intFmt.format(Number(value))

                return (
                  <text
                    x={x + width + 10}
                    y={y + height / 2}
                    fill="#fff"
                    fontSize={12}
                    fontWeight={700}
                    dominantBaseline="middle"
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
</>
    </div>
  )}
</div>

      {/* Section 2: Not delivered */}
      <div style={{ marginTop: 20 }}>
        <div style={sectionHeaderStyle}>
          <span onClick={() => toggleSection('notDelivered')} style={{ cursor: 'pointer', flex: 1 }}>
            {t('supplyChain.notDelivered')}
          </span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={(e) => { e.stopPropagation(); printNotDelivered() }}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: 'var(--accent)',
                textDecoration: 'underline', fontSize: 14, fontWeight: 500,
              }}
            >
              {t('print')}
            </button>
            <span style={expandIconStyle} onClick={() => toggleSection('notDelivered')}>
              {expandedSections.notDelivered ? '−' : '+'}
            </span>
          </div>
        </div>

        {expandedSections.notDelivered && (
          <div style={{ marginTop: 12 }}>
            {data.not_delivered.length === 0 ? (
              <p className="helper">{t('supplyChain.noUndeliveredOrders')}</p>
            ) : (
              <div>
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

                {data.not_delivered
  .filter(item => !shouldHideProduct(item.product))
  .map((item, idx) => {
                  const warehouseQty = Number(warehouseInventoryMap.get(item.product) ?? 0)
                  const notDeliveredQty = Number(item.qty)
                  const rowColor = warehouseQty >= notDeliveredQty ? '#22c55e' : '#ef4444'
                  const isExpanded = expandedNotDeliveredProduct === item.product
                  const orders = (data.not_delivered_orders ?? []).filter(o => o.product === item.product)

                  return (
                    <div key={idx}>
                      <div
                        onClick={() => setExpandedNotDeliveredProduct(isExpanded ? null : item.product)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 100px',
                          gap: 12,
                          ...tableRowStyle,
                          color: rowColor,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        <div>{item.product}</div>
                        <div style={{ textAlign: 'right' }}>{intFmt.format(item.qty)}</div>
                      </div>

                      {isExpanded && orders.length > 0 && (
                        <div style={{ background: 'var(--panel)', borderRadius: 6, margin: '4px 0 8px 0', overflow: 'hidden' }}>
                          {orders.map((o, oidx) => (
                            <div
                              key={oidx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '70px 1fr 80px',
                                gap: 8,
                                padding: '8px 12px',
                                borderBottom: oidx < orders.length - 1 ? '1px solid var(--border)' : 'none',
                                alignItems: 'center',
                              }}
                            >
                              <div className="helper" style={{ fontSize: 12 }}>{formatDate(o.order_date)}</div>
                              <div style={{ fontSize: 14 }}><strong>{o.customer}</strong></div>
                              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: rowColor }}>{intFmt.format(Number(o.qty))}</div>
                            </div>
                          ))}
                        </div>
                      )}
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
  <div style={sectionHeaderStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => toggleSection('warehouse')}>
      <span>{t('supplyChain.inWarehouse')}</span>
      {showInfoIcons && (
        <button
          onClick={e => { e.stopPropagation(); setShowWarehouseInfo(v => !v) }}
          style={{
            width: 20, height: 20, padding: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', cursor: 'pointer',
            background: 'var(--border, rgba(0,0,0,0.08))',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
          }}
        >i</button>
      )}
    </div>
    <span style={expandIconStyle} onClick={() => toggleSection('warehouse')}>
      {expandedSections.warehouse ? '−' : '+'}
    </span>
  </div>

  {showWarehouseInfo && (
    <div style={{
      marginTop: 8, background: 'var(--card, #fff)',
      border: '1px solid var(--border)', borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t('supplyChain.inWarehouse')}</div>
        <button
          onClick={() => setShowWarehouseInfo(false)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
        >✕</button>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0 }}>
          <Trans i18nKey="supplyChain.warehouse.p1" ns="info" components={{
            productionLink: <button onClick={() => { setShowWarehouseInfo(false); navigate('/labor-production') }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }} />,
          }} />
        </p>
        <p style={{ margin: 0 }}>
          <Trans i18nKey="supplyChain.warehouse.p2" ns="info" components={{
            inventoryLink: <button onClick={() => { setShowWarehouseInfo(false); navigate('/warehouse') }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }} />,
          }} />
        </p>
      </div>
    </div>
  )}

  {expandedSections.warehouse && (
    <div style={{ marginTop: 12 }}>
      {data.warehouse_inventory.length === 0 ? (
        <p className="helper">{t('supplyChain.noInventoryData')}</p>
      ) : (
        <div>
          {/* Header: 4 columns 25/25/25/25 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 8,
              ...tableHeaderStyle,
              fontSize: 12,
            }}
          >
            <div>Product</div>
            <div style={{ textAlign: 'right' }}>{t('supplyChain.preProdColumn')}</div>
            <div style={{ textAlign: 'right' }}>{t('supplyChain.finishedColumn')}</div>
            <div style={{ textAlign: 'right' }}>Total Qty</div>
          </div>

          {data.warehouse_inventory
  .filter(item => !shouldHideProduct(item.product))
  .map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: 8,
                ...tableRowStyle,
                fontSize: 13,
                alignItems: 'start',
              }}
            >
              {/* Product wraps to 2 lines if needed */}
              <div style={{ wordBreak: 'break-word', lineHeight: 1.2 }}>
                {item.product}
              </div>

              <div
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: item.pre_prod < 0 ? 'var(--color-error)' : undefined,
                  fontWeight: item.pre_prod < 0 ? 600 : undefined,
                }}
              >
                {intFmt.format(Number(item.pre_prod))}
              </div>

              <div
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {intFmt.format(Number(item.finished))}
              </div>

              <div
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: item.qty < 0 ? 'var(--color-error)' : item.qty === 0 ? 'var(--text-secondary)' : undefined,
                  fontWeight: item.qty < 0 ? 600 : undefined,
                }}
              >
                {intFmt.format(Number(item.qty))}
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
          <span>{t('supplyChain.inCustoms')}</span>
          <span style={expandIconStyle}>{expandedSections.inCustoms ? '−' : '+'}</span>
        </div>

        {expandedSections.inCustoms && (
          <div style={{ marginTop: 12 }}>
            {data.in_customs.length === 0 ? (
              <p className="helper">{t('supplyChain.noOrdersInCustoms')}</p>
            ) : (
              <div>
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
        <div style={sectionHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => toggleSection('orderedFromSuppliers')}>
            <span>{t('supplyChain.orderedFromSuppliers')}</span>
            {showInfoIcons && (
              <button
                onClick={e => { e.stopPropagation(); setShowOrderedInfo(v => !v) }}
                style={{
                  width: 20, height: 20, padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', cursor: 'pointer',
                  background: 'var(--border, rgba(0,0,0,0.08))',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >i</button>
            )}
          </div>
          <span style={expandIconStyle} onClick={() => toggleSection('orderedFromSuppliers')}>
            {expandedSections.orderedFromSuppliers ? '−' : '+'}
          </span>
        </div>

        {showOrderedInfo && (
          <div style={{
            marginTop: 8, background: 'var(--card, #fff)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('supplyChain.orderedFromSuppliers')}</div>
              <button
                onClick={() => setShowOrderedInfo(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
              >✕</button>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>{ti('supplyChain.orderedFromSuppliers')}</p>
            </div>
          </div>
        )}

        {expandedSections.orderedFromSuppliers && (
          <div style={{ marginTop: 12 }}>
            {data.ordered_from_suppliers.length === 0 ? (
              <p className="helper">{t('supplyChain.noSupplierOrders')}</p>
            ) : (
              <div>
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
                        {t('shipped')}: {formatDate(item.delivery_date)}
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
                        Est. delivery: {formatDate(item.est_delivery_date)}
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
