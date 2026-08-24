import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { formatDate } from '../lib/time'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { useLocale } from '../contexts/LocaleContext'

interface OrderDetailModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
  customerName?: string
  refreshKey?: number
  onReturnVoided?: (voidedItems: Array<{ order_item_id: string; qty_returned: number }>) => void
}

interface PartnerSplit {
  partner_id: string
  partner_name: string
  amount: number
}

function coverageDaysLeft(orderDateStr: string, durationDays: number, timezone: string): number {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const todayMs = Date.parse(todayStr)
  const expiryMs = Date.parse(orderDateStr) + durationDays * 86400000
  return Math.round((expiryMs - todayMs) / 86400000)
}

export default function OrderDetailModal({ isOpen, onClose, order: initialOrder, customerName, refreshKey, onReturnVoided }: OrderDetailModalProps) {
  const { t } = useTranslation()
  const { fmtMoney, fmtIntMoney } = useCurrency()
  const { timezone } = useLocale()
  const [order, setOrder] = useState(initialOrder)
  const [partnerSplits, setPartnerSplits] = useState<PartnerSplit[]>([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [bookings, setBookings] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [returns, setReturns] = useState<any[]>([])
  const [voidingReturnId, setVoidingReturnId] = useState<string | null>(null)

  // Reset local state whenever a new initialOrder is passed in
  useEffect(() => {
    setOrder(initialOrder)
    setPartnerSplits([])
    setBookings([])
    setItems([])
    setReturns([])
  }, [initialOrder])

    useEffect(() => {
    if (!initialOrder?.id || !isOpen) return

    const fetchOrderDetails = async () => {
      try {
        setLoadingPartners(true)
        // optional extra safety: clear here as well so nothing stale shows while loading
        // setPartnerSplits([])

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const res = await fetch(`${base}/api/order?id=${initialOrder.id}`, {
  headers: getAuthHeaders(),
})
        if (!res.ok) throw new Error('Failed to fetch order details')
        const data = await res.json()

        // Update order with profit data
        setOrder({ ...initialOrder, ...data.order })
        setItems(data.items || [])
        setBookings(data.bookings || [])
        setReturns(data.returns || [])

        // Handle partner splits
        if (data.partner_splits && data.partner_splits.length > 0) {
          const bootRes = await fetch(`${base}/api/bootstrap`, {
  headers: getAuthHeaders(),
})
          if (bootRes.ok) {
            const boot = await bootRes.json()
            const partners = boot.partners || []

            const enrichedSplits = data.partner_splits.map((split: any) => {
              const partner = partners.find((p: any) => p.id === split.partner_id)
              return {
                partner_id: split.partner_id,
                partner_name: partner?.name || 'Unknown Partner',
                amount: Number(split.amount)
              }
            })
            setPartnerSplits(enrichedSplits)
          } else {
            // if bootstrap fails, don't show stale data
            setPartnerSplits([])
          }
        } else {
          // IMPORTANT: clear partnerSplits when this order has no splits
          setPartnerSplits([])
        }
      } catch (e) {
        console.error('Failed to load order details:', e)
        // also clear on error to avoid showing data from a previous order
        setPartnerSplits([])
      } finally {
        setLoadingPartners(false)
      }
    }

    fetchOrderDetails()
  }, [initialOrder?.id, isOpen, refreshKey])

  if (!order) return null

  // Consistent spacing between label and value
  const fieldStyle = { marginBottom: 4 }

  const orderTotal = Number(order.total) || (Number(order.qty) || 0) * (Number(order.unit_price) || 0)
  const showProfit = orderTotal > 0
  const profit = Number(order.profit) || 0
  const profitPercent = Number(order.profitPercent) || 0

  const intFmt = new Intl.NumberFormat('en-US')

    // Tri-state delivery status
  const deliveredQty = Number(order.delivered_quantity ?? 0)
  const totalQty = items.length > 0
    ? items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    : Number(order.total_qty ?? order.qty ?? 0)

  let deliveryStatus: 'not_delivered' | 'partial' | 'delivered'

  if (order.delivery_status) {
    deliveryStatus = order.delivery_status as any
  } else if (totalQty > 0) {
    if (deliveredQty <= 0) {
      deliveryStatus = 'not_delivered'
    } else if (deliveredQty >= totalQty) {
      deliveryStatus = 'delivered'
    } else {
      deliveryStatus = 'partial'
    }
  } else {
    // Fallback if qty is missing: use boolean delivered
    deliveryStatus = order.delivered ? 'delivered' : 'not_delivered'
  }

  let deliverySymbol = '○'
  let deliveryColor = '#d1d5db'
  let deliveryText = t('notDelivered')

  if (deliveryStatus === 'delivered') {
    deliverySymbol = '✓'
    deliveryColor = '#10b981'
    deliveryText = totalQty
      ? t('orderModal.deliveredInFullQty', { delivered: deliveredQty, total: totalQty })
      : t('orderModal.deliveredInFull')
  } else if (deliveryStatus === 'partial') {
    deliverySymbol = '◐'
    deliveryColor = '#f59e0b'
    deliveryText = totalQty
      ? t('orderModal.partiallyDeliveredQty', { delivered: deliveredQty, total: totalQty })
      : t('orderModal.partiallyDelivered')
  }

  const paidAmount = Number(order.paid_amount ?? 0)
  const payStatus = paidAmount >= orderTotal && orderTotal > 0 ? 'paid'
    : paidAmount > 0 ? 'partial'
    : 'none'

  function printOrder() {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { alert('Please allow popups to print'); return }

    const rows = items.length > 0
      ? items.map((item: any) =>
          `<tr>
            <td>${item.product_name ?? ''}</td>
            <td class="qty-col">${intFmt.format(Number(item.qty))}</td>
            <td class="qty-col">${fmtMoney(item.unit_price ?? 0)}</td>
          </tr>`
        ).join('')
      : `<tr><td colspan="3">—</td></tr>`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t('orderModal.orderNumber', { number: order.order_no || order.id })}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; padding: 20px; color: #000; background: #fff; }
            .controls { display: flex; gap: 12px; margin-bottom: 20px; }
            .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 6px; background: #f5f5f5; cursor: pointer; font-size: 14px; font-weight: 500; }
            .btn:hover { background: #e5e5e5; }
            .btn-primary { background: #2f6df6; color: white; border-color: #2f6df6; }
            .btn-primary:hover { background: #1e5ce6; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            .subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; padding: 12px 8px; border-bottom: 2px solid #000; font-weight: 600; font-size: 14px; }
            td { padding: 10px 8px; border-bottom: 1px solid #ddd; font-size: 14px; }
            .qty-col { text-align: right; font-variant-numeric: tabular-nums; }
            .total-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: 600; padding-top: 16px; padding-bottom: 16px; }
            @media print { .controls { display: none; } }
          </style>
        </head>
        <body>
          <div class="controls">
            <button class="btn btn-primary" onclick="window.print()">${t('print')}</button>
            <button class="btn" onclick="window.close()">${t('close')}</button>
          </div>
          <h1>${t('orderModal.orderNumber', { number: order.order_no || order.id })}</h1>
          <div class="subtitle">${customerName ? `${customerName} · ` : ''}${formatDate(order.order_date)}</div>
          <table>
            <thead>
              <tr>
                <th>${t('product')}</th>
                <th class="qty-col">${t('quantity')}</th>
                <th class="qty-col">${t('orderModal.unitPrice')}</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="2">${t('supplierOrderModal.totalAmount')}</td>
                <td class="qty-col">${fmtMoney(orderTotal)}</td>
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
      if (isDesktop) printWindow.print()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            {`Order #${order.order_no || order.id}`}
            {payStatus === 'paid' && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#10b981', color: '#fff', fontWeight: 600 }}>{t('paymentStatus.paid')}</span>
            )}
            {payStatus === 'partial' && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f59e0b', color: '#fff', fontWeight: 600 }}>{t('paymentStatus.partiallyPaid')}</span>
            )}
          </span>
          <button onClick={printOrder} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 14, fontWeight: 500 }}>
            {t('print')}
          </button>
        </span>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>

        {/* Top row: delivery status (left) + profit (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            color: deliveryColor,
            marginTop: 2
          }}>
            <span>{deliverySymbol}</span>
            <span>{deliveryText}</span>
          </div>

          {showProfit && (
            <div style={{ textAlign: 'right', fontSize: 14 }}>
              <div style={{ color: 'var(--text-secondary)' }}>{t('orders.profit')}</div>
              <div style={{
                fontWeight: 600,
                fontSize: 16,
                color: profit >= 0 ? 'var(--primary)' : 'var(--color-error)'
              }}>
                {fmtMoney(profit)}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                {profitPercent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Separator: delivery/profit → order date */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, marginBottom: 4 }} />

        {/* Customer | Order Date | Total */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            {(customerName || order.customer_name) && <>
              <div className="helper" style={fieldStyle}>{t('customer')}</div>
              <div style={{ fontWeight: 600 }}>{customerName || order.customer_name}</div>
            </>}
          </div>

          <div>
            <div className="helper" style={fieldStyle}>{t('orderModal.orderDate')}</div>
            <div style={{ fontWeight: 600 }}>{formatDate(order.order_date)}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div className="helper" style={fieldStyle}>{t('orderModal.totalAmount')}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
          </div>
        </div>

        {/* Separator line */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, marginBottom: 4 }} />

        {/* Line items */}
        {items.length > 0 ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px', marginBottom: 4 }}>
              <div className="helper">{t('product')}</div>
              <div className="helper" style={{ textAlign: 'right' }}>{t('quantity')}</div>
              <div className="helper" style={{ textAlign: 'right' }}>{t('orderModal.unitPrice')}</div>
            </div>
            {items.map((item: any, idx: number) => {
              // Same-order connection via covers_product_id
              const sameOrderCoveredItem = item.covers_product_id
                ? items.find((i: any) => i.product_id === item.covers_product_id)
                : null
              // Resolved covered product name: same-order first, then cross-order from backend
              const coveredName = item.product_kind === 'addon'
                ? (sameOrderCoveredItem?.product_name ?? item.covered_product_name ?? null)
                : null
              // Resolved covered unit_id: same-order item's unit_id, or cross-order from backend
              const coveredUnitId = item.product_kind === 'addon'
                ? (sameOrderCoveredItem?.unit_identifier ?? item.covered_unit_identifier ?? null)
                : null
              return (
                <div key={idx} style={{ paddingTop: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500 }}>{item.product_name || '—'}</span>
                      {Number(item.qty_returned) > 0 && (
                        <span style={{ fontSize: 11, color: Number(item.qty_returned) >= Number(item.qty) ? 'var(--color-error, #ef4444)' : '#f59e0b' }}>↩</span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {intFmt.format(item.qty)}
                      {Number(item.qty_returned) > 0 && (
                        <span style={{ fontSize: 11, color: Number(item.qty_returned) >= Number(item.qty) ? 'var(--color-error, #ef4444)' : '#f59e0b', marginLeft: 4 }}>
                          −{intFmt.format(Number(item.qty_returned))}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>{fmtMoney(item.unit_price)}</div>
                  </div>
                  {(item.unit_serial || item.unit_identifier) && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 2 }}>
                      {t('orders.unitIdentifier')}: <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {item.unit_serial
                          ? [item.unit_serial, item.unit_condition].filter(Boolean).join(' — ')
                          : item.unit_identifier}
                      </span>
                    </div>
                  )}
                  {coveredName && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 2 }}>
                      {t('orders.coversProduct')}: {coveredName}
                    </div>
                  )}
                  {coveredUnitId && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 2 }}>
                      {t('orders.unitIdentifier')}: <span style={{ fontWeight: 500, color: 'var(--text)' }}>{coveredUnitId}</span>
                    </div>
                  )}
                  {item.product_kind === 'addon' && item.coverage_duration_days != null && order.order_date && (() => {
                    const days = coverageDaysLeft(order.order_date, item.coverage_duration_days, timezone)
                    const expired = days < 0
                    const color = expired ? 'var(--error, #dc2626)' : days <= 30 ? 'var(--warning, #d97706)' : 'var(--text-secondary)'
                    return (
                      <div style={{ fontSize: 12, color, paddingLeft: 2, fontWeight: 500 }}>
                        {expired
                          ? t('orders.coverageExpired', { days: Math.abs(days) })
                          : days === 0
                            ? t('orders.coverageExpiresToday')
                            : t('orders.coverageDaysLeft', { days })}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        ) : (order.product_name || order.qty || order.unit_price) ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px', marginBottom: 4 }}>
              <div className="helper">{t('product')}</div>
              <div className="helper" style={{ textAlign: 'right' }}>{t('quantity')}</div>
              <div className="helper" style={{ textAlign: 'right' }}>{t('orderModal.unitPrice')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px', paddingTop: 6 }}>
              <div style={{ fontWeight: 500 }}>{order.product_name || '—'}</div>
              <div style={{ textAlign: 'right' }}>{order.qty ? intFmt.format(order.qty) : '—'}</div>
              <div style={{ textAlign: 'right' }}>{order.unit_price ? fmtMoney(order.unit_price) : '—'}</div>
            </div>
          </div>
        ) : null}

        {/* Linked bookings */}
        {bookings.length > 0 && (
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div className="helper" style={{ marginBottom: 6 }}>{t('orderModal.linkedBookings')}</div>
            {bookings.map((b: any, idx: number) => {
              const start = new Date(b.start_at)
              const end = new Date(b.end_at)
              const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              const timeStr = `${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              return (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: idx < bookings.length - 1 ? '1px solid var(--line)' : 'none'
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.service_name || '—'}</div>
                    <div className="helper">{dateStr} · {timeStr}</div>
                  </div>
                  {b.total_amount != null && (
                    <div style={{ fontWeight: 600 }}>{fmtMoney(b.total_amount)}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Partner Information */}
        {partnerSplits.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            {/* Header Row - aligned with 3-column grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
              marginBottom: 4
            }}>
              <div className="helper" style={{ fontWeight: 600 }}>{t('partner')}</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>{t('orders.perItem')}</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>{t('orderModal.partnerAmount')}</div>
            </div>

            {/* Partner Rows - aligned with 3-column grid */}
            {loadingPartners ? (
              <div className="helper">{t('orderModal.loadingPartner')}</div>
            ) : (
              partnerSplits.map((split, idx) => {
                const perItem = order.qty > 0 ? split.amount / order.qty : 0
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 16,
                      paddingBottom: 8,
                      marginBottom: idx === partnerSplits.length - 1 ? 0 : 8
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{split.partner_name}</div>
                    <div style={{ textAlign: 'right' }}>{fmtMoney(perItem)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 600 }}>{fmtIntMoney(split.amount)}</div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Additional Information */}
        {(order.discount || order.notes) && (
          <div style={{
            marginTop: 8,
            paddingTop: 16,
            borderTop: '1px solid var(--line)'
          }}>
            {order.discount && (
              <div style={{ marginBottom: 8 }}>
                <div className="helper" style={fieldStyle}>{t('orderModal.discount')}</div>
                <div>{fmtMoney(order.discount)}</div>
              </div>
            )}

            {order.notes && (
              <div>
                <div className="helper" style={fieldStyle}>{t('notes')}</div>
                <div>{order.notes}</div>
              </div>
            )}
          </div>
        )}

        {/* Returns */}
        {returns.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div className="helper" style={{ marginBottom: 8 }}>Returns</div>
            {returns.map((ret: any) => {
              const settlement = ret.settlement_type === 'refund' ? 'Refund'
                : ret.settlement_type === 'store_credit' ? 'Store credit'
                : 'No settlement'
              const retItems: any[] = ret.items || []
              return (
                <div key={ret.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ color: 'var(--color-error, #ef4444)', fontWeight: 500, marginBottom: 4 }}>
                        ↩ Return · {formatDate(ret.return_date)}
                      </div>
                      {retItems.map((item: any, i: number) => (
                        <div key={i} style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>
                          {item.product_name} × {item.qty_returned}
                        </div>
                      ))}
                      <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                        {settlement}{Number(ret.settlement_amount) > 0 ? `: ${fmtMoney(Number(ret.settlement_amount))}` : ''}
                      </div>
                    </div>
                    <button
                      disabled={voidingReturnId === ret.id}
                      onClick={async () => {
                        if (!confirm('Void this return? This will restore the original balances.')) return
                        setVoidingReturnId(ret.id)
                        try {
                          const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
                          const res = await fetch(`${base}/api/returns?id=${ret.id}`, { method: 'DELETE', headers: getAuthHeaders() })
                          if (!res.ok) { alert('Failed to void return'); return }
                          // Decrement qty_returned on each affected item in modal state
                          const voidedItems: Array<{ order_item_id: string; qty_returned: number }> = ret.items || []
                          setItems(prev => prev.map((item: any) => {
                            const ri = voidedItems.find(v => v.order_item_id === item.order_item_id)
                            if (!ri) return item
                            return { ...item, qty_returned: Math.max(0, Number(item.qty_returned) - Number(ri.qty_returned)) }
                          }))
                          // Recalculate profit: voiding restores revenue (+settlement) but un-recovers product cost (-recoveredCost)
                          const itemCostMap = Object.fromEntries(
                            items.map((i: any) => [i.order_item_id,
                              order.product_cost != null
                                ? Number(order.product_cost)
                                : (Number(i.historical_product_cost) || 0)
                            ])
                          )
                          const recoveredCost = voidedItems.reduce((s: number, ri: any) =>
                            s + Number(ri.qty_returned) * (itemCostMap[ri.order_item_id] || 0), 0
                          )
                          const partnerReversalAmount = (ret.partner_adjustments || [])
                            .reduce((s: number, adj: any) => s + Number(adj.amount_reversed || 0), 0)
                          const profitDelta = Number(ret.settlement_amount || 0) - recoveredCost - partnerReversalAmount
                          const remainingSettlement = returns
                            .filter((r: any) => r.id !== ret.id)
                            .reduce((s: number, r: any) => s + Number(r.settlement_amount || 0), 0)
                          const newNetRevenue = (Number(order.total) || 0) - remainingSettlement
                          const newProfit = (Number(order.profit) || 0) + profitDelta
                          setOrder((prev: any) => ({
                            ...prev,
                            profit: newProfit,
                            profitPercent: newNetRevenue > 0 ? (newProfit / newNetRevenue) * 100 : 0,
                          }))
                          setReturns(prev => prev.filter((r: any) => r.id !== ret.id))
                          onReturnVoided?.(voidedItems)
                        } catch { alert('Network error') }
                        finally { setVoidingReturnId(null) }
                      }}
                      style={{ fontSize: 11, padding: '3px 10px', height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', flexShrink: 0, color: 'var(--color-error, #ef4444)' }}
                    >
                      {voidingReturnId === ret.id ? 'Voiding…' : 'Void'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
        }}>
          <Link to={`/orders/${order.id}/edit`} style={{ flex: 1 }}>
            <button
              className="primary"
              style={{ width: '100%' }}
            >
              {t('orderModal.editOrder')}
            </button>
          </Link>
          <button
            onClick={onClose}
            style={{ flex: 1 }}
          >
            {t('close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
