import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { formatUSAny } from '../lib/time'  // ADD THIS IMPORT

interface PaymentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  payment: any
  isPartnerPayment?: boolean
  isSupplierPayment?: boolean
}

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function PaymentDetailModal({
  isOpen,
  onClose,
  payment,
  isPartnerPayment = false,
  isSupplierPayment = false
}: PaymentDetailModalProps) {
  const { t } = useTranslation()
  if (!payment) return null

  // REMOVE the old formatDate function and use formatUSAny instead

  // Determine payment type for edit link
  let paymentType = 'customer'
  if (isPartnerPayment) paymentType = 'partner'
  if (isSupplierPayment) paymentType = 'supplier'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('paymentModal.title')}>
      <div style={{ display: 'grid', gap: 16 }}>

        {/* Payment Amount - Highlighted */}
        <div style={{
          textAlign: 'center',
          padding: 20,
          backgroundColor: 'var(--panel)',
          borderRadius: 12,
          border: '1px solid var(--line)'
        }}>
          <div className="helper" style={{ marginBottom: 8 }}>{t('paymentModal.paymentAmount')}</div>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--primary)'
          }}>
            {fmtIntMoney(payment.amount)}
          </div>
        </div>

        {/* Payment Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left Column */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="helper">{t('paymentModal.paymentDate')}</div>
              <div style={{ fontWeight: 600 }}>{formatUSAny(payment.payment_date)}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="helper">{t('paymentModal.paymentType')}</div>
              <div style={{
                fontWeight: 600,
                padding: '4px 8px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                borderRadius: 6,
                display: 'inline-block',
                fontSize: 14
              }}>
                {payment.payment_type}
              </div>
            </div>

            {payment.payment_id && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('paymentModal.paymentId')}</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {payment.payment_id}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div>
            {payment.customer_name && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('customer')}</div>
                <div style={{ fontWeight: 600 }}>{payment.customer_name}</div>
              </div>
            )}

            {payment.partner_name && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('partner')}</div>
                <div style={{ fontWeight: 600 }}>{payment.partner_name}</div>
              </div>
            )}

            {payment.supplier_name && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('supplier')}</div>
                <div style={{ fontWeight: 600 }}>{payment.supplier_name}</div>
              </div>
            )}

            {payment.order_id && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('paymentModal.relatedOrder')}</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {payment.order_id}
                </div>
              </div>
            )}

            {payment.created_at && (
              <div style={{ marginBottom: 16 }}>
                <div className="helper">{t('paymentModal.recorded')}</div>
                <div style={{ fontSize: 14 }}>
                  {new Date(payment.created_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes Section */}
        {payment.notes && (
          <div style={{
            marginTop: 8,
            paddingTop: 16,
            borderTop: '1px solid var(--line)'
          }}>
            <div className="helper" style={{ marginBottom: 8 }}>{t('notes')}</div>
            <div style={{
              padding: 12,
              backgroundColor: 'var(--panel)',
              borderRadius: 8,
              fontStyle: 'italic'
            }}>
              {payment.notes}
            </div>
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
          <Link to={`/payments/${payment.id}/edit?type=${paymentType}`} style={{ flex: 1 }}>
            <button
              className="primary"
              style={{ width: '100%' }}
            >
              {t('paymentModal.editPayment')}
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
