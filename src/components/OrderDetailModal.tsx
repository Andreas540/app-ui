import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Modal from './Modal'
import { formatUSAny } from '../lib/time'

interface OrderDetailModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
}

interface PartnerSplit {
  partner_id: string
  partner_name: string
  amount: number
}

function fmtMoney(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

function fmtMoneyWithThousands(n: number) {
  return (Number(n) || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export default function OrderDetailModal({ isOpen, onClose, order: initialOrder }: OrderDetailModalProps) {
  const [order, setOrder] = useState(initialOrder)
  const [partnerSplits, setPartnerSplits] = useState<PartnerSplit[]>([])
  const [loadingPartners, setLoadingPartners] = useState(false)

  useEffect(() => {
    if (!initialOrder?.id || !isOpen) return

    const fetchOrderDetails = async () => {
      try {
        setLoadingPartners(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/order?id=${initialOrder.id}`)
        if (!res.ok) throw new Error('Failed to fetch order details')
        const data = await res.json()
        
        // Update order with profit data
        setOrder({ ...initialOrder, ...data.order })
        
        // Fetch partner names
        if (data.partner_splits && data.partner_splits.length > 0) {
          const bootRes = await fetch(`${base}/api/bootstrap`)
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
          }
        }
      } catch (e) {
        console.error('Failed to load order details:', e)
      } finally {
        setLoadingPartners(false)
      }
    }

    fetchOrderDetails()
  }, [initialOrder?.id, isOpen])

  if (!order) return null

  // Consistent spacing between label and value
  const fieldStyle = { marginBottom: 4 }

  const orderValue = (order.qty || 0) * (order.unit_price || 0)
  const showProfit = Number.isFinite(orderValue) && orderValue > 0
  const profit = Number(order.profit) || 0
  const profitPercent = Number(order.profitPercent) || 0

  const intFmt = new Intl.NumberFormat('en-US')

    // Tri-state delivery status
  const deliveredQty = Number(order.delivered_quantity ?? 0)
  const totalQty = Number(order.total_qty ?? order.qty ?? 0)

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
  let deliveryText = 'Not delivered'

  if (deliveryStatus === 'delivered') {
    deliverySymbol = '✓'
    deliveryColor = '#10b981'
    deliveryText = totalQty
      ? `Delivered in full (${deliveredQty}/${totalQty})`
      : 'Delivered in full'
  } else if (deliveryStatus === 'partial') {
    deliverySymbol = '◐'
    deliveryColor = '#f59e0b'
    deliveryText = totalQty
      ? `Partially delivered (${deliveredQty}/${totalQty})`
      : 'Partially delivered'
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Order #${order.order_no || order.id}`}
    >
      <div style={{ display: 'grid', gap: 16, position: 'relative', marginTop: -16 }}>

        {/* Profit display - positioned absolutely in top right of modal */}
        {showProfit && (
          <div style={{ 
            position: 'absolute',
            top: -40,
            right: 40,
            textAlign: 'right', 
            fontSize: 14 
          }}>
            <div style={{ color: 'var(--text-secondary)' }}>Profit</div>
            <div style={{ 
              fontWeight: 600, 
              fontSize: 16, 
              color: profit >= 0 ? 'var(--primary)' : 'salmon' 
            }}>
              {fmtMoneyWithThousands(profit)}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
              {profitPercent.toFixed(1)}%
            </div>
          </div>
        )}

                {/* Delivered Status (tri-state) */}
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

        {/* First Row: Order Date, Total Amount, Order Lines */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 8 }}>
          <div>
            <div className="helper" style={fieldStyle}>Order Date</div>
            <div style={{ fontWeight: 600 }}>{formatUSAny(order.order_date)}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div className="helper" style={fieldStyle}>Total Amount</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
          </div>

          {order.lines && (
            <div style={{ textAlign: 'right' }}>
              <div className="helper" style={fieldStyle}>Order Lines</div>
              <div style={{ fontWeight: 600 }}>{order.lines} item(s)</div>
            </div>
          )}
        </div>

        {/* Separator line */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 4, marginBottom: 4 }} />

        {/* Second Row: Product, Quantity, Unit Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {order.product_name && (
            <div>
              <div className="helper" style={fieldStyle}>Product</div>
              <div style={{ fontWeight: 600 }}>{order.product_name}</div>
            </div>
          )}

          {order.qty && (
            <div style={{ textAlign: 'right' }}>
              <div className="helper" style={fieldStyle}>Quantity</div>
              <div style={{ fontWeight: 600 }}>{intFmt.format(order.qty)}</div>
            </div>
          )}

          {order.unit_price && (
            <div style={{ textAlign: 'right' }}>
              <div className="helper" style={fieldStyle}>Unit Price</div>
              <div style={{ fontWeight: 600 }}>{fmtMoney(order.unit_price)}</div>
            </div>
          )}
        </div>

        {/* Partner Information */}
        {partnerSplits.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            {/* Header Row - aligned with 3-column grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
              marginBottom: 4
            }}>
              <div className="helper" style={{ fontWeight: 600 }}>Partner</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>Per item</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>Partner Amount</div>
            </div>

            {/* Partner Rows - aligned with 3-column grid */}
            {loadingPartners ? (
              <div className="helper">Loading partner info...</div>
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
                <div className="helper" style={fieldStyle}>Discount</div>
                <div>{fmtMoney(order.discount)}</div>
              </div>
            )}
            
            {order.notes && (
              <div>
                <div className="helper" style={fieldStyle}>Notes</div>
                <div>{order.notes}</div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--line)'
        }}>
          <Link to={`/orders/${order.id}/edit`} style={{ flex: 1 }}>
            <button 
              className="primary"
              style={{ width: '100%' }}
            >
              Edit Order
            </button>
          </Link>
          <button 
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}