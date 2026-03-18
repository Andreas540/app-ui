import { useTranslation } from 'react-i18next'

export default function BookingCustomersPage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingClients.title', 'Booking Clients')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingClients.comingSoon', 'Client management coming in Sprint 3.')}</p>
    </div>
  )
}
