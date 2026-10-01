export interface Country {
  code: string  // ISO 3166-1 alpha-2
  name: string
  dial: string  // e.g. '+1'
}

export const COUNTRIES: Country[] = [
  { code: 'AE', name: 'UAE',                 dial: '+971' },
  { code: 'AR', name: 'Argentina',           dial: '+54'  },
  { code: 'AT', name: 'Austria',             dial: '+43'  },
  { code: 'AU', name: 'Australia',           dial: '+61'  },
  { code: 'BD', name: 'Bangladesh',          dial: '+880' },
  { code: 'BE', name: 'Belgium',             dial: '+32'  },
  { code: 'BR', name: 'Brazil',              dial: '+55'  },
  { code: 'CA', name: 'Canada',              dial: '+1'   },
  { code: 'CH', name: 'Switzerland',         dial: '+41'  },
  { code: 'CL', name: 'Chile',               dial: '+56'  },
  { code: 'CN', name: 'China',               dial: '+86'  },
  { code: 'CO', name: 'Colombia',            dial: '+57'  },
  { code: 'CR', name: 'Costa Rica',          dial: '+506' },
  { code: 'CZ', name: 'Czech Republic',      dial: '+420' },
  { code: 'DE', name: 'Germany',             dial: '+49'  },
  { code: 'DK', name: 'Denmark',             dial: '+45'  },
  { code: 'DO', name: 'Dominican Republic',  dial: '+1'   },
  { code: 'EC', name: 'Ecuador',             dial: '+593' },
  { code: 'EG', name: 'Egypt',               dial: '+20'  },
  { code: 'ES', name: 'Spain',               dial: '+34'  },
  { code: 'FI', name: 'Finland',             dial: '+358' },
  { code: 'FR', name: 'France',              dial: '+33'  },
  { code: 'GB', name: 'United Kingdom',      dial: '+44'  },
  { code: 'GH', name: 'Ghana',               dial: '+233' },
  { code: 'GR', name: 'Greece',              dial: '+30'  },
  { code: 'GT', name: 'Guatemala',           dial: '+502' },
  { code: 'HU', name: 'Hungary',             dial: '+36'  },
  { code: 'ID', name: 'Indonesia',           dial: '+62'  },
  { code: 'IE', name: 'Ireland',             dial: '+353' },
  { code: 'IL', name: 'Israel',              dial: '+972' },
  { code: 'IN', name: 'India',               dial: '+91'  },
  { code: 'IT', name: 'Italy',               dial: '+39'  },
  { code: 'JP', name: 'Japan',               dial: '+81'  },
  { code: 'KE', name: 'Kenya',               dial: '+254' },
  { code: 'KR', name: 'South Korea',         dial: '+82'  },
  { code: 'MA', name: 'Morocco',             dial: '+212' },
  { code: 'MX', name: 'Mexico',              dial: '+52'  },
  { code: 'MY', name: 'Malaysia',            dial: '+60'  },
  { code: 'NG', name: 'Nigeria',             dial: '+234' },
  { code: 'NL', name: 'Netherlands',         dial: '+31'  },
  { code: 'NO', name: 'Norway',              dial: '+47'  },
  { code: 'NZ', name: 'New Zealand',         dial: '+64'  },
  { code: 'PA', name: 'Panama',              dial: '+507' },
  { code: 'PE', name: 'Peru',                dial: '+51'  },
  { code: 'PH', name: 'Philippines',         dial: '+63'  },
  { code: 'PK', name: 'Pakistan',            dial: '+92'  },
  { code: 'PL', name: 'Poland',              dial: '+48'  },
  { code: 'PT', name: 'Portugal',            dial: '+351' },
  { code: 'RO', name: 'Romania',             dial: '+40'  },
  { code: 'SA', name: 'Saudi Arabia',        dial: '+966' },
  { code: 'SE', name: 'Sweden',              dial: '+46'  },
  { code: 'SG', name: 'Singapore',           dial: '+65'  },
  { code: 'TH', name: 'Thailand',            dial: '+66'  },
  { code: 'TR', name: 'Turkey',              dial: '+90'  },
  { code: 'US', name: 'United States',       dial: '+1'   },
  { code: 'UY', name: 'Uruguay',             dial: '+598' },
  { code: 'VE', name: 'Venezuela',           dial: '+58'  },
  { code: 'VN', name: 'Vietnam',             dial: '+84'  },
  { code: 'ZA', name: 'South Africa',        dial: '+27'  },
]

/** Best-guess country name from a tenant currency, used as a form default. */
export const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'United States',
  CAD: 'Canada',
  MXN: 'Mexico',
  GBP: 'United Kingdom',
  SEK: 'Sweden',
  NOK: 'Norway',
  DKK: 'Denmark',
  EUR: 'Germany', // fallback; EUR is multi-country
  CHF: 'Switzerland',
  PLN: 'Poland',
  CZK: 'Czech Republic',
  HUF: 'Hungary',
  RON: 'Romania',
  TRY: 'Turkey',
  COP: 'Colombia',
  BRL: 'Brazil',
  ARS: 'Argentina',
  CLP: 'Chile',
  PEN: 'Peru',
  AUD: 'Australia',
  NZD: 'New Zealand',
  JPY: 'Japan',
  CNY: 'China',
  KRW: 'South Korea',
  INR: 'India',
  SGD: 'Singapore',
  MYR: 'Malaysia',
  AED: 'UAE',
  SAR: 'Saudi Arabia',
  ILS: 'Israel',
  ZAR: 'South Africa',
  NGN: 'Nigeria',
  KES: 'Kenya',
  EGP: 'Egypt',
  MAD: 'Morocco',
}

/** Returns the dial code for a given country name, or '' if not found. */
export function dialForCountryName(name: string): string {
  return COUNTRIES.find(c => c.name === name)?.dial ?? ''
}

/** @deprecated Use dialForCountryName. Returns the dial code for a given ISO code. */
export function dialForCountry(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.dial ?? ''
}

/**
 * Given a stored full phone string, splits it into { dialCode, local }.
 * Tries to match known dial codes (longest first to avoid false matches).
 */
export function parseStoredPhone(stored: string): { dialCode: string; local: string } {
  if (!stored) return { dialCode: '', local: '' }
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of sorted) {
    if (stored.startsWith(c.dial)) {
      return { dialCode: c.dial, local: stored.slice(c.dial.length).trimStart() }
    }
  }
  return { dialCode: '', local: stored }
}

/** Combines dial code and local number into a storable phone string. */
export function buildPhone(dialCode: string, local: string): string {
  const l = local.trim()
  if (!l) return ''
  return dialCode ? `${dialCode} ${l}` : l
}
