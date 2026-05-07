import type { FeatureId, ModuleId } from './features'
import { AVAILABLE_FEATURES } from './features'

export interface ModuleDef {
  id: ModuleId
  name: string
  pricePerUser: number
  description: string
  alwaysIncluded: boolean
  features: FeatureId[]
}

const ALL_FEATURES = Object.values(AVAILABLE_FEATURES)

function featuresForModule(moduleId: ModuleId): FeatureId[] {
  return ALL_FEATURES.filter(f => f.module === moduleId).map(f => f.id) as FeatureId[]
}

export const MODULES: ModuleDef[] = [
  {
    id: 'sales',
    name: 'Sales & Cash Flow',
    pricePerUser: 9.99,
    description: 'Orders, payments, invoices, customers and products',
    alwaysIncluded: false,
    features: featuresForModule('sales'),
  },
  {
    id: 'cash-management',
    name: 'Cash Management',
    pricePerUser: 9.99,
    description: 'Per-user cash in/out tracking with weekly balance overview',
    alwaysIncluded: false,
    features: featuresForModule('cash-management'),
  },
  {
    id: 'reports',
    name: 'Reports',
    pricePerUser: 9.99,
    description: 'Financial reports and analytics',
    alwaysIncluded: false,
    features: featuresForModule('reports'),
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain',
    pricePerUser: 9.99,
    description: 'Suppliers, warehouse, production and inventory',
    alwaysIncluded: false,
    features: featuresForModule('supply-chain'),
  },
  {
    id: 'labor',
    name: 'Employee Management',
    pricePerUser: 9.99,
    description: 'Employees, time entry and time approval',
    alwaysIncluded: false,
    features: featuresForModule('labor'),
  },
  {
    id: 'booking',
    name: 'Bookings',
    pricePerUser: 9.99,
    description: 'Booking management, client records, payment tracking and SMS reminders',
    alwaysIncluded: false,
    features: featuresForModule('booking'),
  },
  {
    id: 'admin',
    name: 'Administration',
    pricePerUser: 0,
    description: 'Account admin, settings and contact',
    alwaysIncluded: true,
    features: featuresForModule('admin'),
  },
]

export function getModule(id: ModuleId): ModuleDef | undefined {
  return MODULES.find(m => m.id === id)
}

export function getPaidModules(): ModuleDef[] {
  return MODULES.filter(m => !m.alwaysIncluded)
}