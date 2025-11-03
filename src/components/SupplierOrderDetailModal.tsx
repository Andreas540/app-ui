import { Link } from 'react-router-dom'
import Modal from './Modal'

interface SupplierOrderDetailModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
  supplierName: string
}

function fmtMoney(n: number) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtIntMoney(n: number) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

export default function SupplierOrderDetailModal({ isOpen, onClose, order, supplierName }: SupplierOrderDetailModalProps) {
  if (!order) return null

  const formatDate = (dateStr: string) => {
    // Parse as local date to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  // Determine status for display
  let statusText = 'Pending'
  let statusColor = '#d1d5db'
  let statusBgColor = '#f3f4f620'
  let statusIcon = '○'

  if (order.received) {
    statusText = 'Received'
    statusColor = '#22c55e'
    statusBgColor = '#22c55e20'
    statusIcon = '✓'
  } else if (order.in_customs) {
    statusText = 'In Customs'
    statusColor = '#f97316'
    statusBgColor = '#f9731620'
    statusIcon = '✈'
  } else if (order.delivered) {
    statusText = 'Delivered'
    statusColor = '#3b82f6'
    statusBgColor = '#3b82f620'
    statusIcon = '✓'
  }

  const totalShippingCost = order.items?.reduce((sum: number, item: any) => 
    sum + Number(item.shipping_total || 0), 0) || 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Order #${order.order_no}`}>
      <div style={{ display: 'grid', gap: 16 }}>
        
        {/* Order Status */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          padding: 12,
          backgroundColor: statusBgColor,
          borderRadius: 8,
          border: `1px solid ${statusColor}`
        }}>
          <span style={{ 
            fontSize: 18,
            color: statusColor
          }}>
            {statusIcon}
          </span>
          <span style={{ fontWeight: 600 }}>
            {statusText}
          </span>
        </div>

        {/* Order Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          
          {/* Left Column */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <div className="helper">Supplier</div>
              <div style={{ fontWeight: 600 }}>{supplierName}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="helper">Order Date</div>
              <div style={{ fontWeight: 600 }}>{formatDate(order.order_date)}</div>
            </div>

            {order.est_delivery_date && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Est. Delivery Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(order.est_delivery_date)}</div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div className="helper">Total Amount</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
            </div>
          </div>

          {/* Right Column */}
          <div>
            {order.delivery_date && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Delivery Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(order.delivery_date)}</div>
              </div>
            )}

            {order.in_customs_date && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">In Customs Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(order.in_customs_date)}</div>
              </div>
            )}

            {order.received_date && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Received Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(order.received_date)}</div>
              </div>
            )}

            {order.lines && (
              <div style={{ marginBottom: 12 }}>
                <div className="helper">Order Lines</div>
                <div style={{ fontWeight: 600 }}>{order.lines} item(s)</div>
              </div>
            )}
          </div>
        </div>

        {/* Products List */}
        {order.items && order.items.length > 0 && (
          <div style={{ 
            marginTop: 8,
            paddingTop: 16,
            borderTop: '1px solid var(--line)'
          }}>
            <div className="helper" style={{ marginBottom: 8 }}>Products</div>
            {order.items.map((item: any, idx: number) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: idx < order.items.length - 1 ? '1px solid #f0f0f0' : 'none'
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                  <div className="helper">
                    {Number(item.qty).toLocaleString('en-US')} × {fmtMoney(item.product_cost)}
                  </div>
                </div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>
                  {fmtMoney(item.product_total)}
                </div>
              </div>
            ))}
            
            {totalShippingCost > 0 && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                padding: '8px 0',
                marginTop: 8,
                borderTop: '1px solid var(--line)'
              }}>
                <div style={{ fontWeight: 600 }}>Shipping Cost</div>
                <div style={{ fontWeight: 600 }}>{fmtMoney(totalShippingCost)}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div style={{ 
            marginTop: 8,
            paddingTop: 16,
            borderTop: '1px solid var(--line)'
          }}>
            <div className="helper">Notes</div>
            <div>{order.notes}</div>
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
          <Link to={`/supplier-orders/${order.id}/edit`} style={{ flex: 1 }}>
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