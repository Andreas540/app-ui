import { useTranslation } from 'react-i18next'

export default function BookingsPage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingsList.title', 'Bookings')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingsList.comingSoon', 'Bookings list coming in Sprint 3.')}</p>
    </div>
  )
}
