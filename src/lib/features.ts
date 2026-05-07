export const AVAILABLE_FEATURES = {
  // Sales & Cash Flow
  dashboard:       { id: 'dashboard',       name: 'Dashboard',      route: '/',                   category: 'Sales',  module: 'sales' },
  customers:       { id: 'customers',       name: 'Customers',      route: '/customers',           category: 'Sales',  module: 'sales' },
  orders:          { id: 'orders',          name: 'New Order',      route: '/orders/new',          category: 'Sales',  module: 'sales' },
  payments:        { id: 'payments',        name: 'New Payment',    route: '/payments',            category: 'Sales',  module: 'sales' },
  partners:        { id: 'partners',        name: 'Partners',       route: '/partners',            category: 'Sales',  module: 'sales' },
  products:        { id: 'products',        name: 'Products',       route: '/products/new',        category: 'Sales',  module: 'sales' },
  'price-checker': { id: 'price-checker',   name: 'Price Checker',  route: '/price-checker',       category: 'Sales',  module: 'sales' },
  invoices:        { id: 'invoices',        name: 'Create Invoice', route: '/invoices/create',     category: 'Sales',  module: 'sales' },
  costs:             { id: 'costs',             name: 'Costs',            route: '/costs/new',           category: 'Sales',  module: 'sales' },
  'cash-management': { id: 'cash-management', name: 'Cash Management',  route: '/cash/money-in-out',   category: 'Sales',  module: 'sales' },

  // Supply Chain
  'supply-chain':    { id: 'supply-chain',    name: 'Supply & Demand', route: '/supply-chain',        category: 'Supply', module: 'supply-chain' },
  production:        { id: 'production',      name: 'Production',      route: '/labor-production',    category: 'Supply', module: 'supply-chain' },
  warehouse:         { id: 'warehouse',       name: 'Warehouse',        route: '/warehouse',           category: 'Supply', module: 'supply-chain' },
  'supplier-orders': { id: 'supplier-orders', name: 'New Order (S)',    route: '/supplier-orders/new', category: 'Supply', module: 'supply-chain' },
  suppliers:         { id: 'suppliers',       name: 'Suppliers',        route: '/suppliers',           category: 'Supply', module: 'supply-chain' },

  // Employee Management
  employees:       { id: 'employees',       name: 'Employees',      route: '/employees',           category: 'Labor',  module: 'labor' },
  'time-approval': { id: 'time-approval',   name: 'Time Approval',  route: '/time-approval',       category: 'Labor',  module: 'labor' },
  'time-entry':    { id: 'time-entry',      name: 'Time Entry',     route: '/time-entry',          category: 'Labor',  module: 'labor' },

  // Booking
  'booking-dashboard':   { id: 'booking-dashboard',   name: 'Booking Dashboard',  route: '/bookings',            category: 'Booking', module: 'booking' },
  'bookings':            { id: 'bookings',             name: 'Bookings',           route: '/bookings/list',       category: 'Booking', module: 'booking' },
  'booking-customers':   { id: 'booking-customers',   name: 'Booking Clients',    route: '/bookings/clients',    category: 'Booking', module: 'booking' },
  'booking-payments':    { id: 'booking-payments',    name: 'Booking Payments',   route: '/bookings/payments',   category: 'Booking', module: 'booking' },
  'booking-reminders':   { id: 'booking-reminders',   name: 'Reminders',          route: '/bookings/reminders',  category: 'Booking', module: 'booking' },
  'booking-sms-usage':   { id: 'booking-sms-usage',   name: 'SMS Usage',          route: '/bookings/sms-usage',  category: 'Booking', module: 'booking' },
  'booking-integration': { id: 'booking-integration', name: 'Integration',        route: '/bookings/integration',category: 'Booking', module: 'booking' },
  'new-booking':         { id: 'new-booking',         name: 'New Booking',        route: '/bookings/new',        category: 'Booking', module: 'booking' },

  // Reports
  reports:             { id: 'reports',              name: 'Sales & Profit',    route: '/reports',             category: 'Reports', module: 'reports' },
  'customer-reports':  { id: 'customer-reports',     name: 'Customer Reports',  route: '/reports/customers',   category: 'Reports', module: 'reports' },
  bizwiz:              { id: 'bizwiz',               name: 'Ask BizWiz',        route: '/reports/bizwiz',      category: 'Reports', module: 'reports' },

  // Admin (always included, not a paid module)
  'tenant-admin':  { id: 'tenant-admin',    name: 'Account Admin',  route: '/admin',               category: 'Admin',  module: 'admin' },
  settings:        { id: 'settings',        name: 'Settings',       route: '/settings',            category: 'Admin',  module: 'admin' },
  contact:         { id: 'contact',         name: 'Contact',        route: '/contact',             category: 'Admin',  module: 'admin' },
} as const

export type FeatureId = keyof typeof AVAILABLE_FEATURES
export type ModuleId = 'sales' | 'supply-chain' | 'labor' | 'reports' | 'admin' | 'booking'

export const FEATURE_CATEGORIES = {
  Sales:   'Sales & Cash Flow',
  Supply:  'Supply Chain',
  Labor:   'Employee Management',
  Booking: 'Bookings',
  Reports: 'Reports',
  Admin:   'Administration',
} as const

export function getFeaturesByModule(moduleId: ModuleId): (typeof AVAILABLE_FEATURES)[FeatureId][] {
  return Object.values(AVAILABLE_FEATURES).filter(f => f.module === moduleId) as any
}

export function isValidFeature(id: string): id is FeatureId {
  return id in AVAILABLE_FEATURES
}

// Backward compatible — all non-admin features
export const DEFAULT_FEATURES: FeatureId[] = Object.values(AVAILABLE_FEATURES)
  .filter(f => f.module !== 'admin')
  .map(f => f.id) as FeatureId[]