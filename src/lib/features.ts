export const AVAILABLE_FEATURES = {
  // Sales
  dashboard: { id: 'dashboard', name: 'Main Dashboard', route: '/', category: 'Sales' },
  customers: { id: 'customers', name: 'Customers', route: '/customers', category: 'Sales' },
  partners: { id: 'partners', name: 'Partners', route: '/partners', category: 'Sales' },
  'price-checker': { id: 'price-checker', name: 'Price Checker', route: '/price-checker', category: 'Sales' },
  orders: { id: 'orders', name: 'Orders', route: '/orders/new', category: 'Sales' },
  payments: { id: 'payments', name: 'Payments', route: '/payments', category: 'Sales' },
  products: { id: 'products', name: 'Products', route: '/products/new', category: 'Sales' },
  invoices: { id: 'invoices', name: 'Invoices', route: '/invoices/create', category: 'Sales' },
  
  // Inventory
  inventory: { id: 'inventory', name: 'Inventory Dashboard', route: '/inventory', category: 'Inventory' },
  'supply-chain': { id: 'supply-chain', name: 'Supply & Demand', route: '/supply-chain', category: 'Inventory' },
  suppliers: { id: 'suppliers', name: 'Suppliers', route: '/suppliers', category: 'Inventory' },
  'supplier-orders': { id: 'supplier-orders', name: 'Supplier Orders', route: '/supplier-orders/new', category: 'Inventory' },
  warehouse: { id: 'warehouse', name: 'Warehouse', route: '/warehouse', category: 'Inventory' },
  
  // Labor & Time
  production: { id: 'production', name: 'Production', route: '/labor-production', category: 'Labor' },
  'time-entry': { id: 'time-entry', name: 'Time Entry', route: '/time-entry', category: 'Labor' },
  employees: { id: 'employees', name: 'Employees', route: '/employees', category: 'Labor' },
  'time-approval': { id: 'time-approval', name: 'Time Approval', route: '/time-approval', category: 'Labor' },
  
  // Financial
  costs: { id: 'costs', name: 'Costs', route: '/costs/new', category: 'Financial' },
  
  // Admin & Settings
  'tenant-admin': { id: 'tenant-admin', name: 'Tenant Admin', route: '/admin', category: 'Admin' },
  settings: { id: 'settings', name: 'Settings', route: '/settings', category: 'Admin' },
} as const

export type FeatureId = keyof typeof AVAILABLE_FEATURES

// Categories for organizing features in the UI
export const FEATURE_CATEGORIES = {
  Sales: 'Sales',
  Inventory: 'Inventory',
  Labor: 'Labor & Time Tracking',
  Financial: 'Financial',
  Admin: 'Administration',
} as const

// Default features for new tenants (ALL features enabled)
export const DEFAULT_FEATURES: FeatureId[] = [
  'dashboard',
  'customers',
  'partners',
  'price-checker',
  'orders',
  'payments',
  'products',
  'invoices',
  'inventory',
  'supply-chain',
  'suppliers',
  'supplier-orders',
  'warehouse',
  'production',
  'time-entry',
  'employees',
  'time-approval',
  'costs',
  'tenant-admin',
  'settings',
]

// Get features by category
export function getFeaturesByCategory(category: keyof typeof FEATURE_CATEGORIES) {
  return Object.values(AVAILABLE_FEATURES).filter(f => f.category === category)
}

// Check if a feature ID is valid
export function isValidFeature(id: string): id is FeatureId {
  return id in AVAILABLE_FEATURES
}