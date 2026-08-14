import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'

interface SupplierOrderDetailModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
  supplierName: string
}

export default function SupplierOrderDetailModal({ isOpen, onClose, order, supplierName }: SupplierOrderDetailModalProps) {
  const { t } = useTranslation()
  const { fmtMoney, fmtIntMoney, fmtNumber } = useCurrency()
  if (!order) return null

  const ds = order.derived_status
    || (order.received ? 'received' : order.in_customs ? 'in_customs' : order.delivered ? 'shipped' : 'pending')

  const statusMap: Record<string, { text: string; color: string; icon: string }> = {
    received:   { text: t('received'),                color: '#10b981', icon: '✓' },
    in_customs: { text: t('inCustoms'),               color: '#f97316', icon: '◑' },
    shipped:    { text: t('shipped'),                 color: '#3b82f6', icon: '►' },
    partial:    { text: t('suppliers.statusPartial'), color: '#f59e0b', icon: '◐' },
    pending:    { text: t('pending'),                 color: '#d1d5db', icon: '○' },
  }
  const { text: statusText, color: statusColor, icon: statusIcon } = statusMap[ds] ?? statusMap.pending

  const totalShippingCost = order.items?.reduce((s: number, i: any) => s + Number(i.shipping_total || 0), 0) || 0

  const fieldStyle = { marginBottom: 4 }

  // Relevant dates to show (only those with a value)
  const dates = [
    order.est_delivery_date && { label: t('supplierOrderModal.estDeliveryDate'), value: order.est_delivery_date },
    order.delivery_date     && { label: t('supplierOrderModal.deliveryDate'),    value: order.delivery_date },
    order.in_customs_date   && { label: t('supplierOrderModal.inCustomsDate'),   value: order.in_customs_date },
    order.received_date     && { label: t('supplierOrderModal.receivedDate'),    value: order.received_date },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Order #${order.order_no}`}>
      <div style={{ display: 'grid', gap: 16 }}>

        {/* Status row — inline, no box */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: statusColor }}>
          <span>{statusIcon}</span>
          <span>{statusText}</span>
        </div>

        <div style={{ borderTop: '1px solid var(--line)' }} />

        {/* Supplier | Order Date | Total */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div className="helper" style={fieldStyle}>{t('supplier')}</div>
            <div style={{ fontWeight: 600 }}>{supplierName}</div>
          </div>
          <div>
            <div className="helper" style={fieldStyle}>{t('supplierOrderModal.orderDate')}</div>
            <div style={{ fontWeight: 600 }}>{formatDate(order.order_date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="helper" style={fieldStyle}>{t('supplierOrderModal.totalAmount')}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(order.total)}</div>
          </div>
        </div>

        {/* Dates row — only rendered if there are dates */}
        {dates.length > 0 && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {dates.map(d => (
              <div key={d.label}>
                <div className="helper" style={fieldStyle}>{d.label}</div>
                <div style={{ fontWeight: 600 }}>{formatDate(d.value)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)' }} />

        {/* Products */}
        {order.items && order.items.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 16px', marginBottom: 4 }}>
              <div className="helper">{t('product')}</div>
              <div className="helper" style={{ textAlign: 'right' }}>{t('quantity')}</div>
              <div className="helper" style={{ textAlign: 'right', minWidth: 70 }}>{t('orderModal.unitPrice')}</div>
            </div>
            {order.items.map((item: any, idx: number) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 16px', paddingTop: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                </div>
                <div style={{ textAlign: 'right', paddingTop: 2 }}>{fmtNumber(item.qty)}</div>
                <div style={{ textAlign: 'right', paddingTop: 2, minWidth: 70 }}>{fmtMoney(item.product_cost)}</div>
              </div>
            ))}

            {totalShippingCost > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 16px', paddingTop: 8, marginTop: 8, borderTop: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600 }}>{t('supplierOrderModal.shippingCost')}</div>
                <div />
                <div style={{ textAlign: 'right', minWidth: 70 }}>{fmtMoney(totalShippingCost)}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <>
            <div style={{ borderTop: '1px solid var(--line)' }} />
            <div>
              <div className="helper">{t('notes')}</div>
              <div>{order.notes}</div>
            </div>
          </>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <Link to={`/supplier-orders/${order.id}/edit`} style={{ flex: 1 }}>
            <button className="primary" style={{ width: '100%' }}>
              {t('supplierOrderModal.editOrder')}
            </button>
          </Link>
          <button onClick={onClose} style={{ flex: 1 }}>
            {t('close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
