import { type ModuleId } from './features'

export interface DashboardCard {
  readonly id: string
  readonly labelKey: string
  readonly module: ModuleId
}

export const ALL_DASHBOARD_CARDS: DashboardCard[] = [
  { id: 'financials',    labelKey: 'dashboard.cardFinancials',   module: 'sales'   },
  { id: 'charts',        labelKey: 'dashboard.cardCharts',       module: 'reports' },
  { id: 'orders',        labelKey: 'dashboard.cardOrders',       module: 'sales'   },
  { id: 'price-checker', labelKey: 'dashboard.cardPriceChecker', module: 'sales'   },
  { id: 'bookings',      labelKey: 'dashboard.cardBookings',     module: 'booking' },
]

export const ALL_DASHBOARD_CARD_IDS = ALL_DASHBOARD_CARDS.map(c => c.id)
