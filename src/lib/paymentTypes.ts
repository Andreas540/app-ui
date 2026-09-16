// src/lib/paymentTypes.ts
// All payment type definitions live here.
// api.ts re-exports everything for backward compatibility.

function sorted<T extends string>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.localeCompare(b, 'sv'))
}

// ── Customer payment types ────────────────────────────────────────────────────

export type PaymentType =
  // English (default)
  | 'ACH'
  | 'Cash payment'
  | 'Cash App payment'
  | 'Wire Transfer'
  | 'Zelle payment'
  | 'Partner credit'
  | 'Loan/Deposit'
  | 'Repayment'
  | 'Advance Payment'
  // Spanish / COP
  | 'Transferencias Bancarias / ACH'
  | 'Pagos Seguros en Línea / PSE'
  | 'Efectivo'
  | 'Cheques'
  | 'Crédito de socio'
  | 'Préstamo/Depósito'
  | 'Reembolso'
  | 'Pago anticipado'
  // Swedish / SEK
  | 'Bankgiro/Postgiro'
  | 'Banköverföring'
  | 'Kortbetalning'
  | 'Kontantbetalning'
  | 'Swish'
  | 'Partnerkrediter'
  | 'Lån/Deposition'
  | 'Återbetalning'
  | 'Förskottsbetalning'
  // Store credit redemption
  | 'Store Credit'
  // Auto-created by Stripe webhook
  | 'stripe'

export const PAYMENT_TYPES: PaymentType[] = sorted([
  'ACH',
  'Advance Payment',
  'Cash App payment',
  'Cash payment',
  'Loan/Deposit',
  'Partner credit',
  'Repayment',
  'Wire Transfer',
  'Zelle payment',
])

export const PAYMENT_TYPES_SEK: PaymentType[] = sorted([
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kontantbetalning',
  'Kortbetalning',
  'Swish',
  'Förskottsbetalning',
  'Lån/Deposition',
  'Partnerkrediter',
  'Återbetalning',
])

export const PAYMENT_TYPES_COP: PaymentType[] = sorted([
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Crédito de socio',
  'Préstamo/Depósito',
  'Reembolso',
  'Pago anticipado',
])

// ── Partner payment types ─────────────────────────────────────────────────────

export type PartnerPaymentType =
  // English (default)
  | 'ACH'
  | 'Cash'
  | 'Cash app'
  | 'Wire Transfer'
  | 'Other'
  | 'Add to debt'
  // Spanish / COP
  | 'Transferencias Bancarias / ACH'
  | 'Pagos Seguros en Línea / PSE'
  | 'Efectivo'
  | 'Cheques'
  | 'Otro'
  | 'Añadir a la deuda'
  // Swedish / SEK
  | 'Bankgiro/Postgiro'
  | 'Banköverföring'
  | 'Kortbetalning'
  | 'Swish'
  | 'Övrigt'
  | 'Lägg till skuld'

export const PARTNER_PAYMENT_TYPES: PartnerPaymentType[] = sorted([
  'ACH',
  'Add to debt',
  'Cash',
  'Cash app',
  'Other',
  'Wire Transfer',
])

export const PARTNER_PAYMENT_TYPES_SEK: PartnerPaymentType[] = sorted([
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kortbetalning',
  'Swish',
  'Övrigt',
  'Lägg till skuld',
])

export const PARTNER_PAYMENT_TYPES_COP: PartnerPaymentType[] = sorted([
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Otro',
  'Añadir a la deuda',
])

// ── Supplier payment types ────────────────────────────────────────────────────

export type SupplierPaymentType =
  // English (default)
  | 'ACH'
  | 'Cash'
  | 'Wire Transfer'
  | 'Check'
  | 'Credit card'
  | 'Add to debt'
  | 'Prepayment'
  | 'Other'
  // Spanish / COP
  | 'Transferencias Bancarias / ACH'
  | 'Pagos Seguros en Línea / PSE'
  | 'Efectivo'
  | 'Cheques'
  | 'Añadir a la deuda'
  | 'Prepago'
  | 'Otro'
  // Swedish / SEK
  | 'Bankgiro/Postgiro'
  | 'Banköverföring'
  | 'Kortbetalning'
  | 'Swish'
  | 'Lägg till skuld'
  | 'Förskottsbetalning'
  | 'Övrigt'

export const SUPPLIER_PAYMENT_TYPES: SupplierPaymentType[] = sorted([
  'ACH',
  'Add to debt',
  'Cash',
  'Check',
  'Credit card',
  'Other',
  'Prepayment',
  'Wire Transfer',
])

export const SUPPLIER_PAYMENT_TYPES_SEK: SupplierPaymentType[] = sorted([
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kortbetalning',
  'Swish',
  'Förskottsbetalning',
  'Lägg till skuld',
  'Övrigt',
])

export const SUPPLIER_PAYMENT_TYPES_COP: SupplierPaymentType[] = sorted([
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Prepago',
  'Añadir a la deuda',
  'Otro',
])

// ── Translation helper ────────────────────────────────────────────────────────
// Translates a stored payment_type string for display.
// Universal English keys (Partner credit etc.) are translated via i18n.
// Market-specific strings (Swish, Bankgiro, etc.) display as-is.
export function tPaymentType(type: string, tFn: (key: string, fallback: string) => string): string {
  return tFn(`paymentTypes.${type}`, type)
}
