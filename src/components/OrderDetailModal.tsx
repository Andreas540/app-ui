import { Link } from 'react-router-dom'
import Modal from './Modal'

interface OrderDetailModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
}

function fmtMoney(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function OrderDetailModal({ isOpen, onClose, order }: OrderDetailModalProps) {
  if (!order) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

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

        {/* Order Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          
          {/* Left Column */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <div className="helper">Order Date</div>
              <div style={{ fontWeight: 600 }}>{formatDate(order.order_date)}</div>
            </div>

            {order.customer_name && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Customer</div>
                <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div className="helper">Total Amount</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
            </div>

            {order.lines && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Order Lines</div>
                <div style={{ fontWeight: 600 }}>{order.lines} item(s)</div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div>
            {order.product_name && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Product</div>
                <div style={{ fontWeight: 600 }}>{order.product_name}</div>
              </div>
            )}

            {order.qty && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Quantity</div>
                <div style={{ fontWeight: 600 }}>{order.qty}</div>
              </div>
            )}

            {order.unit_price && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Unit Price</div>
                <div style={{ fontWeight: 600 }}>{fmtMoney(order.unit_price)}</div>
              </div>
            )}

            {order.partner_amount && Number(order.partner_amount) > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Partner Amount</div>
                <div style={{ fontWeight: 600 }}>{fmtIntMoney(order.partner_amount)}</div>
              </div>
            )}
          </div>
        </div>

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