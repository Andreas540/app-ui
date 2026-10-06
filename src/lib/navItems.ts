import type { FeatureId } from './features'

export interface NavItemDef {
  id: string
  section: 'top' | 'pos' | 'sales' | 'cash-management' | 'reports' | 'supply' | 'labor' | 'booking' | 'admin'
  labelKey: string
  /** Pass end={true} to the NavLink (prevents /foo matching /foo/bar) */
  end?: boolean
}

export const NAV_ITEMS: NavItemDef[] = [
  // Top-level (rendered before any section header)
  { id: 'search',           section: 'top',            labelKey: 'search' },
  // POS
  { id: 'quick-sales',      section: 'pos',            labelKey: 'quickSales' },
  // Sales / Cash Flow
  { id: 'dashboard',        section: 'sales',          labelKey: 'mainDashboard',     end: true },
  { id: 'customers',        section: 'sales',          labelKey: 'customers' },
  { id: 'partners',         section: 'sales',          labelKey: 'partners' },
  { id: 'price-checker',    section: 'sales',          labelKey: 'priceChecker' },
  { id: 'orders',           section: 'sales',          labelKey: 'newOrder' },
  { id: 'payments',         section: 'sales',          labelKey: 'newPayment' },
  { id: 'products',         section: 'sales',          labelKey: 'products' },
  { id: 'invoices',         section: 'sales',          labelKey: 'createInvoice' },
  { id: 'costs',            section: 'sales',          labelKey: 'newCost' },
  // Cash Management
  { id: 'cash-management',  section: 'cash-management', labelKey: 'cashMgmt' },
  { id: 'cash-overview',    section: 'cash-management', labelKey: 'cashOverviewLink' },
  // Reports
  { id: 'bizwiz',           section: 'reports',        labelKey: 'reportsBizWiz' },
  { id: 'reports',          section: 'reports',        labelKey: 'reportsSalesProfit', end: true },
  { id: 'customer-reports', section: 'reports',        labelKey: 'reportsCustomers' },
  { id: 'timeline-overview',section: 'reports',        labelKey: 'reportsTimeline' },
  { id: 'simulations',      section: 'reports',        labelKey: 'reportsSimulations' },
  // Supply Chain
  { id: 'supply-chain',     section: 'supply',         labelKey: 'supplyDemand' },
  { id: 'production',       section: 'supply',         labelKey: 'production' },
  { id: 'warehouse',        section: 'supply',         labelKey: 'warehouse' },
  { id: 'supplier-orders',  section: 'supply',         labelKey: 'newOrderSupplier' },
  { id: 'suppliers',        section: 'supply',         labelKey: 'suppliers',          end: true },
  // Employees
  { id: 'employees',        section: 'labor',          labelKey: 'employees' },
  { id: 'time-approval',    section: 'labor',          labelKey: 'timeApproval' },
  { id: 'time-entry',       section: 'labor',          labelKey: 'timeEntry' },
  // Booking
  { id: 'booking-dashboard', section: 'booking',       labelKey: 'bookingDashboard',  end: true },
  { id: 'new-booking',       section: 'booking',       labelKey: 'newBooking' },
  { id: 'bookings',          section: 'booking',       labelKey: 'bookingList' },
  { id: 'booking-customers', section: 'booking',       labelKey: 'bookingClients' },
  { id: 'booking-payments',  section: 'booking',       labelKey: 'bookingPayments' },
  // Admin
  { id: 'tenant-admin',     section: 'admin',          labelKey: 'accountAdmin' },
  { id: 'settings',         section: 'admin',          labelKey: 'settings' },
  { id: 'contact',          section: 'admin',          labelKey: 'contact' },
]

export interface NavSectionDef {
  id: Exclude<NavItemDef['section'], 'top'>
  labelKey: string
  /** Show section header even when no items are accessible */
  alwaysShow?: boolean
}

export const NAV_SECTIONS: NavSectionDef[] = [
  { id: 'pos',             labelKey: 'posSection' },
  { id: 'sales',           labelKey: 'salesCashFlow',      alwaysShow: true },
  { id: 'cash-management', labelKey: 'cashMgmtSection' },
  { id: 'reports',         labelKey: 'reportsSection' },
  { id: 'supply',          labelKey: 'supplyChain',        alwaysShow: true },
  { id: 'labor',           labelKey: 'employeeManagement', alwaysShow: true },
  { id: 'booking',         labelKey: 'bookingSection' },
  { id: 'admin',           labelKey: 'admin',              alwaysShow: true },
]

/** Returns the i18n labelKey for a feature, or undefined if it has no nav entry. */
export function getFeatureLabelKey(featureId: string): string | undefined {
  return NAV_ITEMS.find(n => n.id === featureId)?.labelKey
}

export function loadHiddenNavItems(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem('userSettings') || '{}')
    return new Set<string>(stored.hiddenNavItems || [])
  } catch {
    return new Set<string>()
  }
}

// Keep backward-compat: NAV_ITEMS also used by modules.ts for sort order
export type { FeatureId }
