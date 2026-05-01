import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'
import { tPaymentType } from '../lib/api'

interface PaymentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  payment: any
  isPartnerPayment?: boolean
  isSupplierPayment?: boolean
}

export default function PaymentDetailModal({
  isOpen,
  onClose,
  payment,
  isPartnerPayment = false,
  isSupplierPayment = false
}: PaymentDetailModalProps) {
  const { t } = useTranslation()
  const { fmtIntMoney } = useCurrency()
  if (!payment) return null

  let paymentType = 'customer'
  if (isPartnerPayment) paymentType = 'partner'
  if (isSupplierPayment) paymentType = 'supplier'

  const fieldStyle = { marginBottom: 4 }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('paymentModal.title')}>
      <div style={{ display: 'grid', gap: 16 }}>

        {/* Date + Amount */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div className="helper" style={fieldStyle}>{t('paymentModal.paymentDate')}</div>
            <div style={{ fontWeight: 600 }}>{formatDate(payment.payment_date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="helper" style={fieldStyle}>{t('paymentModal.paymentAmount')}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(payment.amount)}</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, marginBottom: 4 }} />

        {/* Type + who */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div className="helper" style={fieldStyle}>{t('paymentModal.paymentType')}</div>
            <div style={{ fontWeight: 600 }}>{tPaymentType(payment.payment_type, t)}</div>
          </div>

          {payment.customer_name && (
            <div>
              <div className="helper" style={fieldStyle}>{t('customer')}</div>
              <div style={{ fontWeight: 600 }}>{payment.customer_name}</div>
            </div>
          )}
          {payment.partner_name && (
            <div>
              <div className="helper" style={fieldStyle}>{t('partner')}</div>
              <div style={{ fontWeight: 600 }}>{payment.partner_name}</div>
            </div>
          )}
          {payment.supplier_name && (
            <div>
              <div className="helper" style={fieldStyle}>{t('supplier')}</div>
              <div style={{ fontWeight: 600 }}>{payment.supplier_name}</div>
            </div>
          )}
        </div>

        {/* Linked order */}
        {payment.order_no && (
          <div>
            <div className="helper" style={fieldStyle}>{t('paymentModal.relatedOrder')}</div>
            <div style={{ fontWeight: 600 }}>#{payment.order_no}</div>
          </div>
        )}

        {/* Notes */}
        {payment.notes && (
          <>
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, marginBottom: 4 }} />
            <div>
              <div className="helper" style={fieldStyle}>{t('notes')}</div>
              <div>{payment.notes}</div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Link to={`/payments/${payment.id}/edit?type=${paymentType}`} style={{ flex: 1 }}>
            <button className="primary" style={{ width: '100%' }}>
              {t('paymentModal.editPayment')}
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
