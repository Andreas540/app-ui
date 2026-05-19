import { useLocale } from '../contexts/LocaleContext'

export function useCurrency() {
  const { locale, currency } = useLocale()

  function fmtMoney(n: number, decimals = 2): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number(n) || 0)
  }

  function fmtIntMoney(n: number): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n) || 0))
  }

  // Format a number for an input field: locale decimal separator, no currency symbol, no grouping
  function fmtInput(n: number | string | null | undefined, decimals = 2): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return ''
    return v.toLocaleString(locale, {
      useGrouping: false,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  // Parse a user-entered amount string to a number, handles both . and , as decimal separator
  function parseAmount(s: string | null | undefined): number {
    const str = (s ?? '').trim()
    if (!str) return 0
    const hasComma = str.includes(',')
    const hasDot = str.includes('.')
    let normalized = str
    if (hasComma && hasDot) {
      // Both present: the one appearing last is the decimal separator
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // "1.234,56" — comma is decimal
        normalized = str.replace(/\./g, '').replace(',', '.')
      } else {
        // "1,234.56" — dot is decimal
        normalized = str.replace(/,/g, '')
      }
    } else if (hasComma) {
      // Only comma — treat as decimal separator
      normalized = str.replace(',', '.')
    }
    normalized = normalized.replace(/[^\d.\-]/g, '')
    return parseFloat(normalized) || 0
  }

  function fmtCompact(n: number): string {
    if (Math.abs(n) >= 1000) {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).formatToParts(n / 1000)
      const isSuffix = parts[parts.length - 1].type === 'currency'
      const sym = parts.find(p => p.type === 'currency')?.value ?? ''
      const num = parts.filter(p => p.type !== 'currency').map(p => p.value).join('')
      return isSuffix ? `${num}K${sym}` : `${sym}${num.trimStart()}K`
    }
    return fmtMoney(n, 0)
  }

  return { fmtMoney, fmtIntMoney, fmtInput, fmtCompact, parseAmount }
}
