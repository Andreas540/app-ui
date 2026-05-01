// src/lib/paymentTypes.ts
// All payment type definitions live here.
// api.ts re-exports everything for backward compatibility.

// ── Customer payment types ────────────────────────────────────────────────────

export type PaymentType =
  // English (default)
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
  // Auto-created by Stripe webhook
  | 'stripe'

export const PAYMENT_TYPES: PaymentType[] = [
  'Advance Payment',
  'Cash App payment',
  'Cash payment',
  'Loan/Deposit',
  'Partner credit',
  'Repayment',
  'Wire Transfer',
  'Zelle payment',
]

export const PAYMENT_TYPES_SEK: PaymentType[] = [
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kontantbetalning',
  'Kortbetalning',
  'Swish',
  'Förskottsbetalning',
  'Lån/Deposition',
  'Partnerkrediter',
  'Återbetalning',
]

export const PAYMENT_TYPES_COP: PaymentType[] = [
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Crédito de socio',
  'Préstamo/Depósito',
  'Reembolso',
  'Pago anticipado',
]

// ── Partner payment types ─────────────────────────────────────────────────────

export type PartnerPaymentType =
  // English (default)
  | 'Cash'
  | 'Cash app'
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

export const PARTNER_PAYMENT_TYPES: PartnerPaymentType[] = [
  'Cash',
  'Cash app',
  'Other',
  'Add to debt',
]

export const PARTNER_PAYMENT_TYPES_SEK: PartnerPaymentType[] = [
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kortbetalning',
  'Swish',
  'Övrigt',
  'Lägg till skuld',
]

export const PARTNER_PAYMENT_TYPES_COP: PartnerPaymentType[] = [
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Otro',
  'Añadir a la deuda',
]

// ── Supplier payment types ────────────────────────────────────────────────────

export type SupplierPaymentType =
  // English (default)
  | 'Cash'
  | 'Bank transfer'
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

export const SUPPLIER_PAYMENT_TYPES: SupplierPaymentType[] = [
  'Cash',
  'Bank transfer',
  'Check',
  'Credit card',
  'Add to debt',
  'Prepayment',
  'Other',
]

export const SUPPLIER_PAYMENT_TYPES_SEK: SupplierPaymentType[] = [
  'Bankgiro/Postgiro',
  'Banköverföring',
  'Kortbetalning',
  'Swish',
  'Förskottsbetalning',
  'Lägg till skuld',
  'Övrigt',
]

export const SUPPLIER_PAYMENT_TYPES_COP: SupplierPaymentType[] = [
  'Transferencias Bancarias / ACH',
  'Pagos Seguros en Línea / PSE',
  'Efectivo',
  'Cheques',
  'Prepago',
  'Añadir a la deuda',
  'Otro',
]

// ── Translation helper ────────────────────────────────────────────────────────
// Translates a stored payment_type string for display.
// Universal English keys (Partner credit etc.) are translated via i18n.
// Market-specific strings (Swish, Bankgiro, etc.) display as-is.
export function tPaymentType(type: string, tFn: (key: string, fallback: string) => string): string {
  return tFn(`paymentTypes.${type}`, type)
}
