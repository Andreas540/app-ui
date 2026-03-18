import { useTranslation } from 'react-i18next'

export default function BookingRemindersPage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingReminders.title', 'Reminders')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingReminders.comingSoon', 'Reminder rules coming in Sprint 4.')}</p>
    </div>
  )
}
