import { AVAILABLE_FEATURES, type FeatureId } from './features'

// Feature IDs excluded from the quick-access shortcut picker
export const EXCLUDED_FROM_SHORTCUTS: FeatureId[] = ['tenant-admin', 'settings']

export const DEFAULT_SHORTCUTS: FeatureId[] = []

// Maps each feature ID to its key in the 'navigation' i18n namespace
export const FEATURE_NAV_KEY: Record<string, string> = {
  'dashboard':            'mainDashboard',
  'customers':            'customers',
  'orders':               'newOrder',
  'payments':             'newPayment',
  'partners':             'partners',
  'products':             'products',
  'price-checker':        'priceChecker',
  'invoices':             'createInvoice',
  'costs':                'newCost',
  'supply-chain':         'supplyDemand',
  'production':           'production',
  'warehouse':            'warehouse',
  'supplier-orders':      'newOrderSupplier',
  'suppliers':            'suppliers',
  'employees':            'employees',
  'time-approval':        'timeApproval',
  'time-entry':           'timeEntry',
  'booking-dashboard':    'bookingDashboard',
  'bookings':             'bookingList',
  'booking-customers':    'bookingClients',
  'booking-payments':     'bookingPayments',
  'booking-reminders':    'bookingReminders',
  'booking-sms-usage':    'bookingSmsUsage',
  'booking-integration':  'bookingIntegrationNav',
  'new-booking':          'newBooking',
  'reports':              'reportsSalesProfit',
  'customer-reports':     'reportsCustomers',
  'bizwiz':               'reportsBizWiz',
  'tenant-admin':         'accountAdmin',
  'settings':             'settings',
  'contact':              'contact',
}

// ── Letter assignment ──────────────────────────────────────────────────────────
// Rules:
//   Multi-word  → initials of first two words, both caps   (e.g. "New Order"  → NO)
//   Single-word → first letter, caps                       (e.g. "Warehouse"  → W)
//   Duplicate   → first + second char of name              (e.g. "Payments" / "Products" → Pa / Pr)

export function buildLetterMap(items: Array<{ id: FeatureId; name: string }>): Map<FeatureId, string> {
  // Pass 1 — naive assignment
  const naive = items.map(({ name }) => {
    const words = name.split(' ').filter(w => /^[a-zA-Z]/.test(w))
    return words.length >= 2
      ? words[0][0].toUpperCase() + words[1][0].toUpperCase()
      : name[0].toUpperCase()
  })

  // Pass 2 — expand single-char duplicates to 2 chars
  const resolved = naive.map((letter, i) => {
    if (letter.length === 1 && naive.some((l, j) => j !== i && l === letter)) {
      return items[i].name[0].toUpperCase() + items[i].name[1].toLowerCase()
    }
    return letter
  })

  const map = new Map<FeatureId, string>()
  items.forEach(({ id }, i) => map.set(id, resolved[i]))
  return map
}

// Build the full shortcut list (all non-excluded features, in declaration order)
const _rawShortcuts = (
  Object.values(AVAILABLE_FEATURES) as Array<{ id: FeatureId; name: string; route: string; category: string }>
).filter(f => !EXCLUDED_FROM_SHORTCUTS.includes(f.id))

const _letterMap = buildLetterMap(_rawShortcuts)

export const ALL_SHORTCUTS = _rawShortcuts.map(f => ({
  id:       f.id,
  label:    f.name,
  letter:   _letterMap.get(f.id) ?? f.name[0].toUpperCase(),
  route:    f.route,
  category: f.category,
}))

// Convenience lookup: given a feature ID, return the display letter
export function getShortcutLetter(featureId: FeatureId): string {
  return _letterMap.get(featureId) ?? featureId[0].toUpperCase()
}