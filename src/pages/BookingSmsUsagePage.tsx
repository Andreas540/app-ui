import { useTranslation } from 'react-i18next'

export default function BookingSmsUsagePage() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 24 }}>
      <h2>{t('bookingSmsUsage.title', 'SMS Usage')}</h2>
      <p style={{ color: 'var(--muted)' }}>{t('bookingSmsUsage.comingSoon', 'SMS usage reporting coming in Sprint 5.')}</p>
    </div>
  )
}
