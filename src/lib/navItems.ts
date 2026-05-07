export interface NavItemDef {
  id: string
  section: 'sales' | 'reports' | 'supply' | 'labor' | 'booking' | 'admin'
  labelKey: string
}

export const NAV_ITEMS: NavItemDef[] = [
  // Sales / Cash Flow
  { id: 'dashboard',        section: 'sales',   labelKey: 'mainDashboard' },
  { id: 'customers',        section: 'sales',   labelKey: 'customers' },
  { id: 'partners',         section: 'sales',   labelKey: 'partners' },
  { id: 'price-checker',    section: 'sales',   labelKey: 'priceChecker' },
  { id: 'orders',           section: 'sales',   labelKey: 'newOrder' },
  { id: 'payments',         section: 'sales',   labelKey: 'newPayment' },
  { id: 'products',         section: 'sales',   labelKey: 'products' },
  { id: 'invoices',         section: 'sales',   labelKey: 'createInvoice' },
  { id: 'costs',            section: 'sales',   labelKey: 'newCost' },
  { id: 'cash-management', section: 'sales',   labelKey: 'cashMgmt' },
  // Reports
  { id: 'bizwiz',           section: 'reports', labelKey: 'reportsBizWiz' },
  { id: 'reports',          section: 'reports', labelKey: 'reportsSalesProfit' },
  { id: 'customer-reports', section: 'reports', labelKey: 'reportsCustomers' },
  // Supply Chain
  { id: 'supply-chain',     section: 'supply',  labelKey: 'supplyDemand' },
  { id: 'production',       section: 'supply',  labelKey: 'production' },
  { id: 'warehouse',        section: 'supply',  labelKey: 'warehouse' },
  { id: 'supplier-orders',  section: 'supply',  labelKey: 'newOrderSupplier' },
  { id: 'suppliers',        section: 'supply',  labelKey: 'suppliers' },
  // Employees
  { id: 'employees',        section: 'labor',   labelKey: 'employees' },
  { id: 'time-approval',    section: 'labor',   labelKey: 'timeApproval' },
  { id: 'time-entry',       section: 'labor',   labelKey: 'timeEntry' },
  // Booking
  { id: 'booking-dashboard',  section: 'booking', labelKey: 'bookingDashboard' },
  { id: 'new-booking',         section: 'booking', labelKey: 'newBooking' },
  { id: 'bookings',            section: 'booking', labelKey: 'bookingList' },
  { id: 'booking-customers',   section: 'booking', labelKey: 'bookingClients' },
  { id: 'booking-payments',    section: 'booking', labelKey: 'bookingPayments' },
  // Admin (contact has no feature gate — always accessible)
  { id: 'contact',          section: 'admin',   labelKey: 'contact' },
]

export const NAV_SECTIONS: { id: NavItemDef['section']; labelKey: string }[] = [
  { id: 'sales',   labelKey: 'salesCashFlow' },
  { id: 'reports', labelKey: 'reportsSection' },
  { id: 'supply',  labelKey: 'supplyChain' },
  { id: 'labor',   labelKey: 'employeeManagement' },
  { id: 'booking', labelKey: 'bookingSection' },
  { id: 'admin',   labelKey: 'admin' },
]

export function loadHiddenNavItems(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem('userSettings') || '{}')
    return new Set<string>(stored.hiddenNavItems || [])
  } catch {
    return new Set<string>()
  }
}
