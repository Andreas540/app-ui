import { useTranslation } from 'react-i18next'

export default function BookingDashboardPage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingDashboard.title', 'Booking Dashboard')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingDashboard.comingSoon', 'Dashboard coming in Sprint 3.')}</p>
    </div>
  )
}
