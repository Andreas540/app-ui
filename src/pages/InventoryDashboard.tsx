import { useTranslation } from 'react-i18next'

export default function InventoryDashboard() {
  const { t } = useTranslation()
  return (
    <div className="card page-normal">
      <h3>{t('inventoryDashboard.title')}</h3>

      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <h4>{t('inventoryDashboard.stockOverview')}</h4>
          <div className="big">1,247</div>
          <div className="helper">{t('inventoryDashboard.totalInStock')}</div>
        </div>

        <div className="card">
          <h4>{t('inventoryDashboard.lowStockAlerts')}</h4>
          <div className="big" style={{ color: '#ff6b6b' }}>23</div>
          <div className="helper">{t('inventoryDashboard.itemsBelowThreshold')}</div>
        </div>

        <div className="card">
          <h4>{t('inventoryDashboard.recentDeliveries')}</h4>
          <div className="big">5</div>
          <div className="helper">{t('inventoryDashboard.thisWeek')}</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>{t('inventoryDashboard.quickActions')}</h4>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="primary">{t('inventoryDashboard.addNewProduct')}</button>
          <button className="primary">{t('inventoryDashboard.recordDelivery')}</button>
          <button className="primary">{t('inventoryDashboard.updateStock')}</button>
          <button className="primary">{t('inventoryDashboard.generateReport')}</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>{t('inventoryDashboard.recentActivity')}</h4>
        <div style={{ marginTop: 12 }}>
          <div className="helper">This is a placeholder for inventory functionality that will be built later.</div>
          <ul style={{ marginTop: 8, paddingLeft: 16 }}>
            <li>Stock update: ACE Ultra (+500 units)</li>
            <li>Low stock alert: Cool Breeze (15 remaining)</li>
            <li>New delivery: Favorites (+1000 units)</li>
            <li>Stock adjustment: Boutiq (-25 units)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
