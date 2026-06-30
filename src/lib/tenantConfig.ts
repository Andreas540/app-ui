// src/lib/tenantConfig.ts
// Controls HOW the app looks and behaves per tenant.
// DB controls WHO can access WHAT — this controls everything else.

export interface TenantConfig {
  payments: {
    showOrderSelection: boolean
    visibleCustomerPaymentTypes: string[] | null  // null = all visible (default)
    visiblePartnerPaymentTypes: string[] | null
    visibleSupplierPaymentTypes: string[] | null
    showPartnerTransfer: boolean
  }
  labels: {
    customer: string        // "Customer" | "Client" | "Member" etc
    customers: string       // plural
    order: string           // "Order" | "Job" | "Booking" etc
    orders: string          // plural
    directLabel: string           // display label for direct customers everywhere, e.g. "Direct" or "BLV"
  }
  ui: {
    showCostEffectiveness: boolean  // defined but not yet wired in UI
    requiresApproval: boolean       // defined but not yet wired in UI
    showOrderNumberInList: boolean
    showWelcomeModal: boolean
    showInfoIconsPages: boolean
    showInfoIconsReports: boolean
    showNavArrowsMobile: boolean
    showNavArrowsDesktop: boolean
    showOwedToSuppliers: boolean
    compactCustomerOrderRows: boolean
    multipleOrderRows: boolean
    dashboardCards: string[]
    customerDetailShowNewOrder: boolean
    customerDetailShowNewPayment: boolean
    customerDetailShowNewInvoice: boolean
    customerDetailShowNewBooking: boolean
    customerDetailShowShareBooking: boolean
    customerDetailShowShareOrder: boolean
    customerDetailShowConversation: boolean
  }
  booking: {
    serviceTypeLabel: string         // e.g. "Lesson", "Session", "Appointment"
    bookingProviderName: string      // display name of connected provider, e.g. "SimplyBook"
    smsRemindersEnabled: boolean     // show/hide reminder settings UI
    showBookingParticipants: boolean // show participant management for group bookings
    paymentProvider: 'none' | 'stripe' | 'amp'  // payment provider for public booking page
  }
  invoice: {
    autoInvoiceNumber: boolean       // generate invoice number from dates + customer initials
    companyName: string | null
    companyAddress1: string | null
    companyAddress2: string | null
    companyPhone: string | null
    contactName: string | null
    enabledPaymentMethods: string[]
    bankName: string | null
    bankAccountName: string | null
    bankAccountNumber: string | null
    bankRoutingNumber: string | null
    achBankName: string | null
    achBranch: string | null
    achCityState: string | null
    achAccountNumber: string | null
    achAba: string | null
  }
  pages: {
    [pageKey: string]: {
      hiddenFields?: string[]
      visibleFields?: string[]
      fields?: Record<string, boolean>
    }
  }
  theme: {
    defaultSkin: 'default' | 'vintage'
    defaultMode: 'dark' | 'light'
    selectableSkins: ('default' | 'vintage')[]
    selectableModes: ('dark' | 'light')[]
  }
  frontPageKey: string | null
}

export const defaultConfig: TenantConfig = {
  payments: {
    showOrderSelection: true,
    visibleCustomerPaymentTypes: null,
    visiblePartnerPaymentTypes: null,
    visibleSupplierPaymentTypes: null,
    showPartnerTransfer: false,
  },
  labels: {
    customer: 'Customer',
    customers: 'Customers',
    order: 'Order',
    orders: 'Orders',
    directLabel: 'Direct',
  },
  ui: {
    showCostEffectiveness: true,
    requiresApproval: false,
    showOrderNumberInList: true,
    showWelcomeModal: true,
    showInfoIconsPages: true,
    showInfoIconsReports: true,
    showNavArrowsMobile: true,
    showNavArrowsDesktop: false,
    showOwedToSuppliers: true,
    compactCustomerOrderRows: true,
    multipleOrderRows: true,
    dashboardCards: ['financials', 'charts'],
    customerDetailShowNewOrder: true,
    customerDetailShowNewPayment: true,
    customerDetailShowNewInvoice: false,
    customerDetailShowNewBooking: false,
    customerDetailShowShareBooking: false,
    customerDetailShowShareOrder: false,
    customerDetailShowConversation: true,
  },
  booking: {
    serviceTypeLabel: 'Session',
    bookingProviderName: '',
    smsRemindersEnabled: false,
    showBookingParticipants: false,
    paymentProvider: 'none' as const,
  },
  invoice: {
    autoInvoiceNumber: false,
    companyName: null,
    companyAddress1: null,
    companyAddress2: null,
    companyPhone: null,
    contactName: null,
    enabledPaymentMethods: [],
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankRoutingNumber: null,
    achBankName: null,
    achBranch: null,
    achCityState: null,
    achAccountNumber: null,
    achAba: null,
  },
  pages: {},
  theme: {
    defaultSkin: 'default',
    defaultMode: 'dark',
    selectableSkins: ['default', 'vintage'],
    selectableModes: ['dark', 'light'],
  },
  frontPageKey: null,
}

const tenantOverrides: Record<string, DeepPartial<TenantConfig>> = {
  // Tenant-specific overrides are now managed via DB (ui_config column on tenants table)
  // and edited through the UI Customization page in SuperAdmin.
}

export function getTenantConfig(tenantId: string | null | undefined): TenantConfig {
  if (!tenantId) return defaultConfig

  // Code-level overrides (backwards compat — removed once fully migrated to DB)
  const codeOverrides = tenantOverrides[tenantId]

  // Business-type defaults (from business_types.config_defaults, delivered on auth payload)
  let businessTypeOverrides: DeepPartial<TenantConfig> = {}
  // Per-tenant UI overrides (from tenants.ui_config)
  let dbOverrides: DeepPartial<TenantConfig> = {}
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}')
    if (userData.businessTypeConfig && typeof userData.businessTypeConfig === 'object') {
      businessTypeOverrides = userData.businessTypeConfig
    }
    if (userData.uiConfig && typeof userData.uiConfig === 'object') {
      dbOverrides = userData.uiConfig
    }
  } catch { /* ignore */ }

  // Merge order: platform defaults → business-type defaults → per-tenant overrides
  let result = defaultConfig
  if (codeOverrides) result = deepMerge(result, codeOverrides)
  if (Object.keys(businessTypeOverrides).length > 0) result = deepMerge(result, businessTypeOverrides)
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
        result[key] = deepMerge((base as any)?.[key], val as any)
      } else {
        result[key] = val as any
      }
    }
  }
  return result
}