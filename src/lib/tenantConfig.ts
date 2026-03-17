// src/lib/tenantConfig.ts
// Controls HOW the app looks and behaves per tenant.
// DB controls WHO can access WHAT — this controls everything else.

export interface TenantConfig {
  payments: {
    showOrderSelection: boolean
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
  }
  booking: {
    serviceTypeLabel: string         // e.g. "Lesson", "Session", "Appointment"
    bookingProviderName: string      // display name of connected provider, e.g. "SimplyBook"
    smsRemindersEnabled: boolean     // show/hide reminder settings UI
    showBookingParticipants: boolean // show participant management for group bookings
  }
  pages: {
    [pageKey: string]: {
      hiddenFields?: string[]
      visibleFields?: string[]
    }
  }
}

const defaultConfig: TenantConfig = {
  payments: {
    showOrderSelection: true
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
  },
  booking: {
    serviceTypeLabel: 'Session',
    bookingProviderName: '',
    smsRemindersEnabled: false,
    showBookingParticipants: false,
  },
  pages: {}
}

const tenantOverrides: Record<string, DeepPartial<TenantConfig>> = {
  'c00e0058-3dec-4300-829d-cca7e3033ca6': {
    payments: {
      showOrderSelection: false
    },
    labels: {
      directCustomerGroup: 'BLV customers'
    }
  },
  // Add tenant-specific overrides here keyed by tenantId
  // 'uuid-here': {
  //   labels: { customer: 'Client', customers: 'Clients' }
  // }
}

export function getTenantConfig(tenantId: string | null | undefined): TenantConfig {
  if (!tenantId) return defaultConfig
  const overrides = tenantOverrides[tenantId]
  if (!overrides) return defaultConfig
  return deepMerge(defaultConfig, overrides)
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