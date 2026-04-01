// src/lib/tenantConfig.ts
// Controls HOW the app looks and behaves per tenant.
// DB controls WHO can access WHAT — this controls everything else.

export interface TenantConfig {
  payments: {
    showOrderSelection: boolean
    showAdvancePayment: boolean
  }
  labels: {
    customer: string        // "Customer" | "Client" | "Member" etc
    customers: string       // plural
    order: string           // "Order" | "Job" | "Booking" etc
    orders: string          // plural
    directCustomerGroup: string
  }
  ui: {
    showCostEffectiveness: boolean
    requiresApproval: boolean
    showOrderNumberInList: boolean
  }
  booking: {
    serviceTypeLabel: string         // e.g. "Lesson", "Session", "Appointment"
    bookingProviderName: string      // display name of connected provider, e.g. "SimplyBook"
    smsRemindersEnabled: boolean     // show/hide reminder settings UI
    showBookingParticipants: boolean // show participant management for group bookings
  }
  invoice: {
    autoInvoiceNumber: boolean       // generate invoice number from dates + customer initials
    companyName: string | null
    companyAddress1: string | null
    companyAddress2: string | null
    companyPhone: string | null
    contactName: string | null
    bankName: string | null
    bankAccountName: string | null
    bankAccountNumber: string | null
    bankRoutingNumber: string | null
  }
  pages: {
    [pageKey: string]: {
      hiddenFields?: string[]
      visibleFields?: string[]
    }
  }
}

export const defaultConfig: TenantConfig = {
  payments: {
    showOrderSelection: true,
    showAdvancePayment: true,
  },
  labels: {
    customer: 'Customer',
    customers: 'Customers',
    order: 'Order',
    orders: 'Orders',
    directCustomerGroup: 'Direct customers',
  },
  ui: {
    showCostEffectiveness: true,
    requiresApproval: false,
    showOrderNumberInList: true,
  },
  booking: {
    serviceTypeLabel: 'Session',
    bookingProviderName: '',
    smsRemindersEnabled: false,
    showBookingParticipants: false,
  },
  invoice: {
    autoInvoiceNumber: false,
    companyName: null,
    companyAddress1: null,
    companyAddress2: null,
    companyPhone: null,
    contactName: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankRoutingNumber: null,
  },
  pages: {}
}

const tenantOverrides: Record<string, DeepPartial<TenantConfig>> = {
  'c00e0058-3dec-4300-829d-cca7e3033ca6': {
    payments: {
      showOrderSelection: false,
      showAdvancePayment: false,
    },
    labels: {
      directCustomerGroup: 'BLV customers'
    },
    ui: {
      showOrderNumberInList: false,
    },
    invoice: {
      autoInvoiceNumber: true,
      companyName: 'BLV Pack Design LLC',
      companyAddress1: '13967 SW 119th Ave',
      companyAddress2: 'Miami, FL 33186',
      companyPhone: '(305) 798-3317',
      contactName: 'Julian de Armas',
      bankName: 'Bank of America',
      bankAccountName: 'BLV Pack Design LLC',
      bankAccountNumber: '898161854242',
      bankRoutingNumber: '026009593',
    },
  },
  // Add tenant-specific overrides here keyed by tenantId
  // 'uuid-here': {
  //   labels: { customer: 'Client', customers: 'Clients' }
  // }
}

export function getTenantConfig(tenantId: string | null | undefined): TenantConfig {
  if (!tenantId) return defaultConfig

  // Code-level overrides (backwards compat — removed once fully migrated to DB)
  const codeOverrides = tenantOverrides[tenantId]

  // DB overrides stored in userData after login (synchronous localStorage read)
  let dbOverrides: DeepPartial<TenantConfig> = {}
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}')
    if (userData.uiConfig && typeof userData.uiConfig === 'object') {
      dbOverrides = userData.uiConfig
    }
  } catch { /* ignore */ }

  let result = defaultConfig
  if (codeOverrides) result = deepMerge(result, codeOverrides)
  if (Object.keys(dbOverrides).length > 0) result = deepMerge(result, dbOverrides)
  return result
}

// ---- Utility types and functions ----

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const result = { ...base }
  for (const key in override) {
    const val = override[key]
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        result[key] = deepMerge(base[key] as any, val as any)
      } else {
        result[key] = val as any
      }
    }
  }
  return result
}