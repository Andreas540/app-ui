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

export default function OrderDetailModal({ isOpen, onClose, order }: OrderDetailModalProps) {
  const [partnerSplits, setPartnerSplits] = useState<PartnerSplit[]>([])
  const [loadingPartners, setLoadingPartners] = useState(false)

  useEffect(() => {
    if (!order?.id || !isOpen) return

    const fetchPartners = async () => {
      try {
        setLoadingPartners(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/order?id=${order.id}`)
        if (!res.ok) throw new Error('Failed to fetch order details')
        const data = await res.json()
        
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
        console.error('Failed to load partner info:', e)
      } finally {
        setLoadingPartners(false)
      }
    }

    fetchPartners()
  }, [order?.id, isOpen])

  if (!order) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Order #${order.order_no || order.id}`}>
      <div style={{ display: 'grid', gap: 16 }}>
        
        {/* Order Status */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          padding: 12,
          backgroundColor: order.delivered ? '#10b98120' : '#f3f4f620',
          borderRadius: 8,
          border: `1px solid ${order.delivered ? '#10b981' : '#d1d5db'}`
        }}>
          <span style={{ 
            fontSize: 18,
            color: order.delivered ? '#10b981' : '#d1d5db'
          }}>
            {order.delivered ? '✓' : '○'}
          </span>
          <span style={{ fontWeight: 600 }}>
            {order.delivered ? 'Delivered' : 'Not Delivered'}
          </span>
        </div>

        {/* First Row: Order Date, Total Amount, Order Lines */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div className="helper">Order Date</div>
            <div style={{ fontWeight: 600 }}>{formatUSAny(order.order_date)}</div>
          </div>

          <div>
            <div className="helper">Total Amount</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
          </div>

          {order.lines && (
            <div>
              <div className="helper">Order Lines</div>
              <div style={{ fontWeight: 600 }}>{order.lines} item(s)</div>
            </div>
          )}
        </div>

        {/* Second Row: Product, Quantity, Unit Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {order.product_name && (
            <div>
              <div className="helper">Product</div>
              <div style={{ fontWeight: 600 }}>{order.product_name}</div>
            </div>
          )}

          {order.qty && (
            <div>
              <div className="helper">Quantity</div>
              <div style={{ fontWeight: 600 }}>{order.qty}</div>
            </div>
          )}

          {order.unit_price && (
            <div>
              <div className="helper">Unit Price</div>
              <div style={{ fontWeight: 600 }}>{fmtMoney(order.unit_price)}</div>
            </div>
          )}
        </div>

        {/* Customer Info (if needed separately) */}
        {order.customer_name && (
          <div>
            <div className="helper">Customer</div>
            <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
          </div>
        )}

        {/* Partner Information */}
        {partnerSplits.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            {/* Header Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 120px',
              gap: 12,
              paddingBottom: 8,
              marginBottom: 8
            }}>
              <div className="helper" style={{ fontWeight: 600 }}>Partner</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>Per item</div>
              <div className="helper" style={{ fontWeight: 600, textAlign: 'right' }}>Partner Amount</div>
            </div>

            {/* Partner Rows */}
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
                      gridTemplateColumns: '1fr 100px 120px',
                      gap: 12,
                      paddingBottom: 8,
                      marginBottom: 8
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
                <div className="helper">Discount</div>
                <div>{fmtMoney(order.discount)}</div>
              </div>
            )}
            
            {order.notes && (
              <div>
                <div className="helper">Notes</div>
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