import { useTranslation } from 'react-i18next'

export default function BookingPaymentsPage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingPayments.title', 'Booking Payments')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingPayments.comingSoon', 'Payment tracking coming in Sprint 3.')}</p>
    </div>
  )
}
