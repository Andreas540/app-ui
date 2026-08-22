// src/pages/SimulationsPage.tsx
import { useTranslation } from 'react-i18next'

export default function SimulationsPage() {
  const { t } = useTranslation('reports')

  return (
    <div className="page-narrow">
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        {t('simulationsTitle', 'Simulations')}
      </h1>
    </div>
  )
}
