// src/pages/TenantAdminOrderPageTab.tsx
// Order Page admin tab: two sub-tabs — content setup and URL/access configuration.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders, updateProduct } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import '../TenantAdmin.css'

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function sanitizeSlug(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 60)
}

// ── Country / state data ──────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'AF', label: 'Afghanistan' },     { code: 'AL', label: 'Albania' },
  { code: 'DZ', label: 'Algeria' },         { code: 'AD', label: 'Andorra' },
  { code: 'AO', label: 'Angola' },          { code: 'AR', label: 'Argentina' },
  { code: 'AM', label: 'Armenia' },         { code: 'AU', label: 'Australia' },
  { code: 'AT', label: 'Austria' },         { code: 'AZ', label: 'Azerbaijan' },
  { code: 'BS', label: 'Bahamas' },         { code: 'BH', label: 'Bahrain' },
  { code: 'BD', label: 'Bangladesh' },      { code: 'BB', label: 'Barbados' },
  { code: 'BY', label: 'Belarus' },         { code: 'BE', label: 'Belgium' },
  { code: 'BZ', label: 'Belize' },          { code: 'BJ', label: 'Benin' },
  { code: 'BT', label: 'Bhutan' },          { code: 'BO', label: 'Bolivia' },
  { code: 'BA', label: 'Bosnia & Herzegovina' }, { code: 'BW', label: 'Botswana' },
  { code: 'BR', label: 'Brazil' },          { code: 'BN', label: 'Brunei' },
  { code: 'BG', label: 'Bulgaria' },        { code: 'BF', label: 'Burkina Faso' },
  { code: 'BI', label: 'Burundi' },         { code: 'KH', label: 'Cambodia' },
  { code: 'CM', label: 'Cameroon' },        { code: 'CA', label: 'Canada' },
  { code: 'CV', label: 'Cape Verde' },      { code: 'CF', label: 'Central African Republic' },
  { code: 'TD', label: 'Chad' },            { code: 'CL', label: 'Chile' },
  { code: 'CN', label: 'China' },           { code: 'CO', label: 'Colombia' },
  { code: 'KM', label: 'Comoros' },         { code: 'CG', label: 'Congo' },
  { code: 'CR', label: 'Costa Rica' },      { code: 'HR', label: 'Croatia' },
  { code: 'CU', label: 'Cuba' },            { code: 'CY', label: 'Cyprus' },
  { code: 'CZ', label: 'Czech Republic' },  { code: 'CD', label: 'DR Congo' },
  { code: 'DK', label: 'Denmark' },         { code: 'DJ', label: 'Djibouti' },
  { code: 'DM', label: 'Dominica' },        { code: 'DO', label: 'Dominican Republic' },
  { code: 'EC', label: 'Ecuador' },         { code: 'EG', label: 'Egypt' },
  { code: 'SV', label: 'El Salvador' },     { code: 'GQ', label: 'Equatorial Guinea' },
  { code: 'ER', label: 'Eritrea' },         { code: 'EE', label: 'Estonia' },
  { code: 'SZ', label: 'Eswatini' },        { code: 'ET', label: 'Ethiopia' },
  { code: 'FJ', label: 'Fiji' },            { code: 'FI', label: 'Finland' },
  { code: 'FR', label: 'France' },          { code: 'GA', label: 'Gabon' },
  { code: 'GM', label: 'Gambia' },          { code: 'GE', label: 'Georgia' },
  { code: 'DE', label: 'Germany' },         { code: 'GH', label: 'Ghana' },
  { code: 'GR', label: 'Greece' },          { code: 'GD', label: 'Grenada' },
  { code: 'GT', label: 'Guatemala' },       { code: 'GN', label: 'Guinea' },
  { code: 'GW', label: 'Guinea-Bissau' },   { code: 'GY', label: 'Guyana' },
  { code: 'HT', label: 'Haiti' },           { code: 'HN', label: 'Honduras' },
  { code: 'HU', label: 'Hungary' },         { code: 'IS', label: 'Iceland' },
  { code: 'IN', label: 'India' },           { code: 'ID', label: 'Indonesia' },
  { code: 'IR', label: 'Iran' },            { code: 'IQ', label: 'Iraq' },
  { code: 'IE', label: 'Ireland' },         { code: 'IL', label: 'Israel' },
  { code: 'IT', label: 'Italy' },           { code: 'CI', label: 'Ivory Coast' },
  { code: 'JM', label: 'Jamaica' },         { code: 'JP', label: 'Japan' },
  { code: 'JO', label: 'Jordan' },          { code: 'KZ', label: 'Kazakhstan' },
  { code: 'KE', label: 'Kenya' },           { code: 'KI', label: 'Kiribati' },
  { code: 'KW', label: 'Kuwait' },          { code: 'KG', label: 'Kyrgyzstan' },
  { code: 'LA', label: 'Laos' },            { code: 'LV', label: 'Latvia' },
  { code: 'LB', label: 'Lebanon' },         { code: 'LS', label: 'Lesotho' },
  { code: 'LR', label: 'Liberia' },         { code: 'LY', label: 'Libya' },
  { code: 'LI', label: 'Liechtenstein' },   { code: 'LT', label: 'Lithuania' },
  { code: 'LU', label: 'Luxembourg' },      { code: 'MG', label: 'Madagascar' },
  { code: 'MW', label: 'Malawi' },          { code: 'MY', label: 'Malaysia' },
  { code: 'MV', label: 'Maldives' },        { code: 'ML', label: 'Mali' },
  { code: 'MT', label: 'Malta' },           { code: 'MH', label: 'Marshall Islands' },
  { code: 'MR', label: 'Mauritania' },      { code: 'MU', label: 'Mauritius' },
  { code: 'MX', label: 'Mexico' },          { code: 'FM', label: 'Micronesia' },
  { code: 'MD', label: 'Moldova' },         { code: 'MC', label: 'Monaco' },
  { code: 'MN', label: 'Mongolia' },        { code: 'ME', label: 'Montenegro' },
  { code: 'MA', label: 'Morocco' },         { code: 'MZ', label: 'Mozambique' },
  { code: 'MM', label: 'Myanmar' },         { code: 'NA', label: 'Namibia' },
  { code: 'NR', label: 'Nauru' },           { code: 'NP', label: 'Nepal' },
  { code: 'NL', label: 'Netherlands' },     { code: 'NZ', label: 'New Zealand' },
  { code: 'NI', label: 'Nicaragua' },       { code: 'NE', label: 'Niger' },
  { code: 'NG', label: 'Nigeria' },         { code: 'MK', label: 'North Macedonia' },
  { code: 'NO', label: 'Norway' },          { code: 'OM', label: 'Oman' },
  { code: 'PK', label: 'Pakistan' },        { code: 'PW', label: 'Palau' },
  { code: 'PS', label: 'Palestine' },       { code: 'PA', label: 'Panama' },
  { code: 'PG', label: 'Papua New Guinea' },{ code: 'PY', label: 'Paraguay' },
  { code: 'PE', label: 'Peru' },            { code: 'PH', label: 'Philippines' },
  { code: 'PL', label: 'Poland' },          { code: 'PT', label: 'Portugal' },
  { code: 'QA', label: 'Qatar' },           { code: 'RO', label: 'Romania' },
  { code: 'RU', label: 'Russia' },          { code: 'RW', label: 'Rwanda' },
  { code: 'KN', label: 'Saint Kitts & Nevis' }, { code: 'LC', label: 'Saint Lucia' },
  { code: 'VC', label: 'Saint Vincent' },   { code: 'WS', label: 'Samoa' },
  { code: 'SM', label: 'San Marino' },      { code: 'ST', label: 'São Tomé & Príncipe' },
  { code: 'SA', label: 'Saudi Arabia' },    { code: 'SN', label: 'Senegal' },
  { code: 'RS', label: 'Serbia' },          { code: 'SC', label: 'Seychelles' },
  { code: 'SL', label: 'Sierra Leone' },    { code: 'SG', label: 'Singapore' },
  { code: 'SK', label: 'Slovakia' },        { code: 'SI', label: 'Slovenia' },
  { code: 'SB', label: 'Solomon Islands' }, { code: 'SO', label: 'Somalia' },
  { code: 'ZA', label: 'South Africa' },    { code: 'KR', label: 'South Korea' },
  { code: 'SS', label: 'South Sudan' },     { code: 'ES', label: 'Spain' },
  { code: 'LK', label: 'Sri Lanka' },       { code: 'SD', label: 'Sudan' },
  { code: 'SR', label: 'Suriname' },        { code: 'SE', label: 'Sweden' },
  { code: 'CH', label: 'Switzerland' },     { code: 'SY', label: 'Syria' },
  { code: 'TW', label: 'Taiwan' },          { code: 'TJ', label: 'Tajikistan' },
  { code: 'TZ', label: 'Tanzania' },        { code: 'TH', label: 'Thailand' },
  { code: 'TL', label: 'Timor-Leste' },     { code: 'TG', label: 'Togo' },
  { code: 'TO', label: 'Tonga' },           { code: 'TT', label: 'Trinidad & Tobago' },
  { code: 'TN', label: 'Tunisia' },         { code: 'TR', label: 'Turkey' },
  { code: 'TM', label: 'Turkmenistan' },    { code: 'TV', label: 'Tuvalu' },
  { code: 'UG', label: 'Uganda' },          { code: 'UA', label: 'Ukraine' },
  { code: 'AE', label: 'UAE' },             { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },   { code: 'UY', label: 'Uruguay' },
  { code: 'UZ', label: 'Uzbekistan' },      { code: 'VU', label: 'Vanuatu' },
  { code: 'VE', label: 'Venezuela' },       { code: 'VN', label: 'Vietnam' },
  { code: 'YE', label: 'Yemen' },           { code: 'ZM', label: 'Zambia' },
  { code: 'ZW', label: 'Zimbabwe' },
]

const US_STATES = [
  { code: 'AL', label: 'Alabama' },     { code: 'AK', label: 'Alaska' },
  { code: 'AZ', label: 'Arizona' },     { code: 'AR', label: 'Arkansas' },
  { code: 'CA', label: 'California' },  { code: 'CO', label: 'Colorado' },
  { code: 'CT', label: 'Connecticut' }, { code: 'DE', label: 'Delaware' },
  { code: 'FL', label: 'Florida' },     { code: 'GA', label: 'Georgia' },
  { code: 'HI', label: 'Hawaii' },      { code: 'ID', label: 'Idaho' },
  { code: 'IL', label: 'Illinois' },    { code: 'IN', label: 'Indiana' },
  { code: 'IA', label: 'Iowa' },        { code: 'KS', label: 'Kansas' },
  { code: 'KY', label: 'Kentucky' },    { code: 'LA', label: 'Louisiana' },
  { code: 'ME', label: 'Maine' },       { code: 'MD', label: 'Maryland' },
  { code: 'MA', label: 'Massachusetts' }, { code: 'MI', label: 'Michigan' },
  { code: 'MN', label: 'Minnesota' },   { code: 'MS', label: 'Mississippi' },
  { code: 'MO', label: 'Missouri' },    { code: 'MT', label: 'Montana' },
  { code: 'NE', label: 'Nebraska' },    { code: 'NV', label: 'Nevada' },
  { code: 'NH', label: 'New Hampshire' }, { code: 'NJ', label: 'New Jersey' },
  { code: 'NM', label: 'New Mexico' },  { code: 'NY', label: 'New York' },
  { code: 'NC', label: 'North Carolina' }, { code: 'ND', label: 'North Dakota' },
  { code: 'OH', label: 'Ohio' },        { code: 'OK', label: 'Oklahoma' },
  { code: 'OR', label: 'Oregon' },      { code: 'PA', label: 'Pennsylvania' },
  { code: 'RI', label: 'Rhode Island' }, { code: 'SC', label: 'South Carolina' },
  { code: 'SD', label: 'South Dakota' }, { code: 'TN', label: 'Tennessee' },
  { code: 'TX', label: 'Texas' },       { code: 'UT', label: 'Utah' },
  { code: 'VT', label: 'Vermont' },     { code: 'VA', label: 'Virginia' },
  { code: 'WA', label: 'Washington' },  { code: 'WV', label: 'West Virginia' },
  { code: 'WI', label: 'Wisconsin' },   { code: 'WY', label: 'Wyoming' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderPageConfig {
  slug: string
  is_active: boolean
  has_password: boolean
  session_minutes: number
  geo_countries: string[]
  geo_states: string[]
  cap_qty_at_available: boolean
  show_available: boolean
  show_price: boolean
  show_image: boolean
  show_label_text: boolean
  show_label_badge: boolean
  available_wording: 'available' | 'in_stock'
}

interface OrderProduct {
  id: string
  name: string
  product_price: number
  has_image: boolean
  image_version: number | null
  inventory_qty: number | null
  display_price: number | null
  display_qty: number | null
  is_visible: boolean
  label_text: string | null
  label_text_style: 'plain' | 'badge'
  label_text_color: 'orange' | 'green' | 'grey' | 'black' | 'none'
  label_image_data: string | null
  sort_order: number | null
}

type SubTab = 'content' | 'setup'

// ── Main component ────────────────────────────────────────────────────────────

export default function TenantAdminOrderPageTab() {
  const { t } = useTranslation()
  const { fmtInput, parseAmount } = useCurrency()
  const [subTab, setSubTab] = useState<SubTab>('content')

  // ── Content tab state ─────────────────────────────────────────────────────
  const [products, setProducts] = useState<OrderProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [savingProduct, setSavingProduct] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [uploadingProductImage, setUploadingProductImage] = useState<string | null>(null)
  const [priceStrings, setPriceStrings] = useState<Record<string, string>>({})

  // Per-product row edits (keyed by product id)
  const [edits, setEdits] = useState<Record<string, Partial<OrderProduct>>>({})

  // ── Setup tab state ───────────────────────────────────────────────────────
  const [config, setConfig] = useState<OrderPageConfig>({
    slug: '', is_active: false, has_password: false,
    session_minutes: 60, geo_countries: [], geo_states: [],
    cap_qty_at_available: true, show_available: true, show_price: true,
    show_image: true, show_label_text: true, show_label_badge: true, available_wording: 'available',
  })
  const [configLoaded, setConfigLoaded] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [geoEnabled, setGeoEnabled] = useState(false)
  const [sessionMinutesStr, setSessionMinutesStr] = useState('60')
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const countryDropdownRef = useRef<HTMLDivElement>(null)
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false)
  const [stateSearch, setStateSearch] = useState('')
  const stateDropdownRef = useRef<HTMLDivElement>(null)

  const siteOrigin = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
  const publicUrl  = config.slug ? `${siteOrigin}/order/${config.slug}` : ''
  const [copiedUrl, setCopiedUrl] = useState(false)

  useEffect(() => { loadConfig(); loadProducts() }, [])

  useEffect(() => {
    if (!countryDropdownOpen) return
    function onOutside(e: MouseEvent) {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [countryDropdownOpen])

  useEffect(() => {
    if (!stateDropdownOpen) return
    function onOutside(e: MouseEvent) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setStateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [stateDropdownOpen])

  async function loadConfig() {
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin?action=getOrderPageConfig`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.config) {
        setConfig({
          slug:                 data.config.slug || '',
          is_active:            !!data.config.is_active,
          has_password:         !!data.config.has_password,
          session_minutes:      data.config.session_minutes || 60,
          geo_countries:        data.config.geo_countries || [],
          geo_states:           data.config.geo_states || [],
          cap_qty_at_available: data.config.cap_qty_at_available !== false,
          show_available:       data.config.show_available !== false,
          show_price:           data.config.show_price !== false,
          show_image:           data.config.show_image !== false,
          show_label_text:      data.config.show_label_text !== false,
          show_label_badge:     data.config.show_label_badge !== false,
          available_wording:    data.config.available_wording === 'in_stock' ? 'in_stock' : 'available',
        })
        setGeoEnabled((data.config.geo_countries || []).length > 0)
        setSessionMinutesStr(String(data.config.session_minutes || 60))
        setConfigLoaded(true)
      }
    } catch (e) { console.error(e) }
  }

  async function loadProducts() {
    setProductsLoading(true)
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin?action=getOrderPageProducts`, { headers: getAuthHeaders() })
      const data = await res.json()
      setProducts(data.products || [])
      const initial: Record<string, Partial<OrderProduct>> = {}
      const initialPrices: Record<string, string> = {}
      for (const p of (data.products || [])) {
        initial[p.id] = {
          display_price:    p.display_price,
          display_qty:      p.display_qty,
          is_visible:       p.is_visible !== false,
          label_text:       p.label_text || '',
          label_image_data: p.label_image_data || '',
          sort_order:       p.sort_order ?? 0,
          label_text_style: p.label_text_style || 'plain',
          label_text_color: p.label_text_color || 'orange',
        }
        initialPrices[p.id] = p.display_price != null ? Number(p.display_price).toFixed(2) : ''
      }
      setEdits(initial)
      setPriceStrings(initialPrices)
    } catch (e) { console.error(e) } finally { setProductsLoading(false) }
  }

  function patchEdit(productId: string, patch: Partial<OrderProduct>) {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }))
  }

  async function saveProduct(product: OrderProduct) {
    const e = edits[product.id] || {}
    setSavingProduct(product.id)
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action:         'saveOrderPageProduct',
          productId:      product.id,
          displayPrice:   e.display_price != null ? e.display_price : null,
          displayQty:     e.display_qty != null ? e.display_qty : null,
          isVisible:      e.is_visible !== false,
          labelText:      e.label_text || null,
          labelImageData: e.label_image_data || null,
          sortOrder:      e.sort_order ?? 0,
          labelTextStyle: e.label_text_style || 'plain',
          labelTextColor: e.label_text_color || 'orange',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    } finally { setSavingProduct(null) }
  }

  async function saveAllProducts() {
    setSavingAll(true)
    try {
      for (const product of products) {
        await saveProduct(product)
      }
    } finally { setSavingAll(false) }
  }

  async function handleSaveConfig() {
    setSavingConfig(true)
    try {
      const body: any = {
        action:              'saveOrderPageConfig',
        slug:                config.slug,
        isActive:            config.is_active,
        sessionMinutes:      Math.max(1, parseInt(sessionMinutesStr, 10) || 60),
        geoCountries:        geoEnabled ? config.geo_countries : [],
        geoStates:           geoEnabled && config.geo_countries.includes('US') ? config.geo_states : [],
        capQtyAtAvailable:   config.cap_qty_at_available,
        showAvailable:       config.show_available,
        showPrice:           config.show_price,
        showImage:           config.show_image,
        showLabelText:       config.show_label_text,
        showLabelBadge:      config.show_label_badge,
        availableWording:    config.available_wording,
      }
      if (newPassword) {
        body.password = newPassword
      } else if (!config.has_password && !newPassword) {
        body.clearPassword = true
      }

      const res = await fetch(`${apiBase()}/api/tenant-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      if (newPassword) {
        setConfig(c => ({ ...c, has_password: true }))
        setNewPassword('')
      }
      alert(t('tenantAdmin.orderPage.settingsSaved'))
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    } finally { setSavingConfig(false) }
  }

  function handleLabelImage(productId: string, file: File | null) {
    if (!file) { patchEdit(productId, { label_image_data: '' }); return }
    const reader = new FileReader()
    reader.onload = e => patchEdit(productId, { label_image_data: String(e.target?.result || '') })
    reader.readAsDataURL(file)
  }

  const imgInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const productImgInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleProductImageUpload(productId: string, file: File | null) {
    if (!file) return
    setUploadingProductImage(productId)
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => resolve(String(ev.target?.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await updateProduct({ id: productId, image_data: imageData })
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, has_image: true, image_version: Math.floor(Date.now() / 1000) } : p
      ))
    } catch (err: any) {
      alert(err?.message || 'Failed to upload image')
    } finally {
      setUploadingProductImage(null)
    }
  }

  function toggleCountry(code: string) {
    setConfig(c => {
      const list = c.geo_countries.includes(code)
        ? c.geo_countries.filter(x => x !== code)
        : [...c.geo_countries, code]
      const states = code === 'US' && !list.includes('US') ? [] : c.geo_states
      return { ...c, geo_countries: list, geo_states: states }
    })
  }

  function toggleState(code: string) {
    setConfig(c => ({
      ...c,
      geo_states: c.geo_states.includes(code)
        ? c.geo_states.filter(x => x !== code)
        : [...c.geo_states, code],
    }))
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'content', label: t('tenantAdmin.orderPage.tabContent') },
    { id: 'setup',   label: t('tenantAdmin.orderPage.tabSetup') },
  ]

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as SubTab)}
        >
          {SUB_TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        <div className="booking-subtab-tabs" style={{ gap: 4, borderBottom: '1px solid var(--separator)' }}>
          {SUB_TABS.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
              background: 'none', border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subTab === tab.id ? 600 : 400,
              fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 1: Order page content ── */}
      {subTab === 'content' && (
        <div>
          {productsLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('loading')}</p>
          ) : products.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('tenantAdmin.orderPage.noProducts')}</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button onClick={saveAllProducts} disabled={savingAll || savingProduct !== null} style={{ minWidth: 140 }}>
                  {savingAll ? t('saving') : t('tenantAdmin.orderPage.saveAll')}
                </button>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                {products.map(product => {
                const e = edits[product.id] || {}
                const isVisible = e.is_visible !== false
                return (
                  <div key={product.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    opacity: isVisible ? 1 : 0.6,
                    display: 'grid',
                    gap: 10,
                  }}>

                    {/* Row 1: CSS grid — label headers thin row, inputs row, visible spans both */}
                    <div className="op-row1">

                      {/* Image — own grid cell, spans both rows, top-aligned */}
                      <div className="op-r1-img" style={{ position: 'relative' }}>
                        {product.has_image ? (
                          <img
                            src={`${apiBase()}/.netlify/functions/serve-product-image?id=${product.id}&v=${product.image_version || 0}`}
                            alt=""
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                          />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 8, border: '2px dashed var(--border)', background: 'var(--btn-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 18 }}>+</div>
                        )}
                        <button
                          type="button"
                          onClick={() => productImgInputRefs.current[product.id]?.click()}
                          disabled={uploadingProductImage === product.id}
                          title={t('tenantAdmin.orderPage.changeImage')}
                          style={{ position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: '2px solid var(--bg)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                        >
                          {uploadingProductImage === product.id ? '…' : '✎'}
                        </button>
                        <input
                          ref={el => { productImgInputRefs.current[product.id] = el }}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={ev => handleProductImageUpload(product.id, ev.target.files?.[0] || null)}
                        />
                      </div>

                      {/* Name — col 2, spans both rows, top-aligned */}
                      <div className="op-r1-info">
                        <div className="op-r1-name-text">{product.name}</div>
                        <div className="op-r1-base-price">{t('tenantAdmin.orderPage.productPrice')}: {fmtInput(product.product_price)}</div>
                      </div>

                      {/* Position label — row 1, col 3 */}
                      <label className="op-r1-poslabel">{t('tenantAdmin.orderPage.position')}</label>

                      {/* Position select — row 2, col 3 */}
                      <div className="op-r1-pos">
                        <select
                          value={e.sort_order ?? 0}
                          onChange={ev => patchEdit(product.id, { sort_order: Number(ev.target.value) })}
                          style={{ width: 52, height: 'var(--control-h)', fontSize: 12, textAlign: 'center' }}
                        >
                          {products.map((_, idx) => (
                            <option key={idx + 1} value={idx + 1}>{idx + 1}</option>
                          ))}
                        </select>
                      </div>

                      {/* Price + qty — display:contents on desktop (labels+inputs become direct grid items);
                              2×2 grid on mobile (label row + input row, 50/50) */}
                      <div className="op-r1-overrides">
                        {/* labels: row 1 col 4/5 on desktop; row 1 col 1/2 of overrides grid on mobile */}
                        <label className="op-r1-plabel">{t('tenantAdmin.orderPage.overridePrice')}</label>
                        <label className="op-r1-qlabel">{t('tenantAdmin.orderPage.overrideQty')}</label>
                        <div className="op-r1-price">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={priceStrings[product.id] ?? ''}
                            onChange={ev => setPriceStrings(prev => ({ ...prev, [product.id]: ev.target.value }))}
                            onBlur={ev => {
                              const raw = ev.target.value.trim()
                              if (!raw) {
                                patchEdit(product.id, { display_price: null })
                                setPriceStrings(prev => ({ ...prev, [product.id]: '' }))
                              } else {
                                const n = parseAmount(raw)
                                patchEdit(product.id, { display_price: n })
                                setPriceStrings(prev => ({ ...prev, [product.id]: n != null ? n.toFixed(2) : raw }))
                              }
                            }}
                            placeholder={fmtInput(product.product_price)}
                          />
                        </div>

                        <div className="op-r1-qty">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={e.display_qty != null ? e.display_qty : ''}
                            onChange={ev => patchEdit(product.id, { display_qty: ev.target.value === '' ? null : Math.max(0, Math.floor(Number(ev.target.value))) })}
                            placeholder={product.inventory_qty != null ? String(product.inventory_qty) : t('tenantAdmin.orderPage.qtyPlaceholder')}
                          />
                        </div>
                      </div>

                      {/* Visible checkbox — spans both grid rows, col 4 */}
                      <div className="op-r1-vis">
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {isVisible ? t('tenantAdmin.orderPage.visible') : t('tenantAdmin.orderPage.hidden')}
                        </label>
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={ev => patchEdit(product.id, { is_visible: ev.target.checked })}
                          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                      </div>

                    </div>

                    {/* Row 2: Label text (50%) | Label background colors (50%) */}
                    <div className="op-label-row">
                      <div>
                        <label style={{ fontSize: 12 }}>{t('tenantAdmin.orderPage.labelText')}</label>
                        <input
                          type="text"
                          value={e.label_text || ''}
                          onChange={ev => patchEdit(product.id, { label_text: ev.target.value })}
                          placeholder={t('tenantAdmin.orderPage.labelTextPlaceholder')}
                          style={{ marginTop: 4, width: '100%', display: 'block' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12 }}>{t('tenantAdmin.orderPage.labelBackground')}</label>
                        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                          {([
                            { key: 'none',   bg: '#fff',    isNone: true  },
                            { key: 'orange', bg: '#ff6b35', isNone: false },
                            { key: 'green',  bg: '#22a861', isNone: false },
                            { key: 'grey',   bg: '#888',    isNone: false },
                            { key: 'black',  bg: '#1a1a2e', isNone: false },
                          ] as { key: string; bg: string; isNone: boolean }[]).map(({ key, bg, isNone }) => {
                            const currentColor = e.label_text_color || 'none'
                            const currentStyle = e.label_text_style || 'plain'
                            const selected = isNone ? currentStyle === 'plain' : (currentStyle === 'badge' && currentColor === key)
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  if (isNone) {
                                    patchEdit(product.id, { label_text_style: 'plain' })
                                  } else {
                                    patchEdit(product.id, { label_text_style: 'badge', label_text_color: key as 'orange' | 'green' | 'grey' | 'black' })
                                  }
                                }}
                                title={isNone ? t('tenantAdmin.orderPage.labelStylePlain') : t(`tenantAdmin.orderPage.labelColor${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                                style={{
                                  position: 'relative',
                                  width: 24, height: 24, borderRadius: 5,
                                  border: 'none',
                                  background: isNone ? '#fff' : bg,
                                  cursor: 'pointer',
                                  outline: selected ? '2px solid var(--primary)' : 'none',
                                  outlineOffset: 2,
                                  boxShadow: key === 'black' ? '0 0 0 1px #777' : key === 'none' ? '0 0 0 1px #bbb' : undefined,
                                  overflow: 'hidden',
                                }}
                              >
                                {isNone && (
                                  <svg viewBox="0 0 26 26" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                                    <line x1="4" y1="22" x2="22" y2="4" stroke="#e53" strokeWidth="2.5" />
                                  </svg>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: badge img — — — Save */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {e.label_image_data ? (
                          <>
                            <img src={e.label_image_data} alt="" style={{ height: 26, maxWidth: 70, objectFit: 'contain', borderRadius: 4 }} />
                            <button
                              onClick={() => { patchEdit(product.id, { label_image_data: '' }); if (imgInputRefs.current[product.id]) imgInputRefs.current[product.id]!.value = '' }}
                              style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                            >✕</button>
                          </>
                        ) : (
                          <button
                            onClick={() => imgInputRefs.current[product.id]?.click()}
                            style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                          >
                            {t('tenantAdmin.orderPage.labelBadge')}
                          </button>
                        )}
                        <input
                          ref={el => { imgInputRefs.current[product.id] = el }}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={ev => handleLabelImage(product.id, ev.target.files?.[0] || null)}
                        />
                      </div>
                      <button
                        className="primary"
                        onClick={() => saveProduct(product)}
                        disabled={savingProduct === product.id}
                        style={{ marginLeft: 'auto', flexShrink: 0, height: 30, padding: '0 14px', fontSize: 12 }}
                      >
                        {savingProduct === product.id ? t('saving') : t('save')}
                      </button>
                    </div>

                  </div>
                )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={saveAllProducts} disabled={savingAll || savingProduct !== null} style={{ minWidth: 140 }}>
                  {savingAll ? t('saving') : t('tenantAdmin.orderPage.saveAll')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab 2: Order page set up ── */}
      {subTab === 'setup' && (
        <div style={{ maxWidth: 520 }}>

          {/* Slug */}
          <div style={{ marginBottom: 20 }}>
            <label>{t('tenantAdmin.orderPage.pageUrl')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 4 }}>
              <span style={{
                padding: '0 10px', height: 'var(--control-h)', display: 'flex', alignItems: 'center',
                fontSize: 14, color: 'var(--text-secondary)', background: 'var(--btn-bg)',
                border: '1px solid var(--border)', borderRight: 'none', borderRadius: '10px 0 0 10px',
                whiteSpace: 'nowrap',
              }}>
                /order/
              </span>
              <input
                value={config.slug}
                onChange={e => setConfig(c => ({ ...c, slug: sanitizeSlug(e.target.value) }))}
                placeholder="your-business-name"
                style={{ borderRadius: '0 10px 10px 0', flex: 1 }}
              />
            </div>
            {publicUrl && (
              <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('tenantAdmin.orderPage.yourOrderPage')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <a href={publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', wordBreak: 'break-all' }}>{publicUrl}</a>
                  <button onClick={copyUrl} style={{ height: 30, padding: '0 12px', fontSize: 12, flexShrink: 0 }}>
                    {copiedUrl ? t('tenantAdmin.booking.copied') : t('tenantAdmin.booking.copyUrl')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={config.is_active}
                onChange={e => setConfig(c => ({ ...c, is_active: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.active')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.activeHelp')}</p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '0 0 20px' }} />

          {/* Password protection */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={config.has_password || !!newPassword}
                onChange={e => {
                  if (!e.target.checked) {
                    setNewPassword('')
                    setConfig(c => ({ ...c, has_password: false }))
                  } else {
                    setShowPassword(true)
                  }
                }}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.loginProtected')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.loginProtectedHelp')}</p>

            {(config.has_password || showPassword) && (
              <div style={{ marginTop: 12, marginLeft: 28 }}>
                <label style={{ fontSize: 13 }}>
                  {config.has_password ? t('tenantAdmin.orderPage.changePassword') : t('tenantAdmin.orderPage.setPassword')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder={config.has_password ? t('tenantAdmin.orderPage.passwordPlaceholderChange') : t('tenantAdmin.orderPage.passwordPlaceholder')}
                  style={{ marginTop: 4, maxWidth: 280 }}
                  autoComplete="new-password"
                />
                {config.has_password && !newPassword && (
                  <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>{t('tenantAdmin.orderPage.passwordKeepExisting')}</p>
                )}
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 13 }}>{t('tenantAdmin.orderPage.autoLogoutMinutes')}</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={sessionMinutesStr}
                    onChange={e => setSessionMinutesStr(e.target.value)}
                    onBlur={e => {
                      const n = Math.max(1, parseInt(e.target.value, 10) || 60)
                      setSessionMinutesStr(String(n))
                    }}
                    style={{ marginTop: 4, maxWidth: 100 }}
                  />
                  <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>{t('tenantAdmin.orderPage.autoLogoutHelp')}</p>
                </div>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '0 0 20px' }} />

          {/* Geo location */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={geoEnabled}
                onChange={e => {
                  setGeoEnabled(e.target.checked)
                  if (!e.target.checked) setConfig(c => ({ ...c, geo_countries: [], geo_states: [] }))
                }}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>{t('tenantAdmin.orderPage.locationAccess')}</span>
            </label>
            <p className="helper" style={{ marginTop: 4, marginLeft: 28 }}>{t('tenantAdmin.orderPage.locationAccessHelp')}</p>

            {geoEnabled && (
              <div style={{ marginTop: 14, marginLeft: 28 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>{t('tenantAdmin.orderPage.allowedCountries')}</div>

                {/* Country dropdown */}
                <div ref={countryDropdownRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => { setCountryDropdownOpen(o => !o); setCountrySearch('') }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0 12px', height: 'var(--control-h)', fontSize: 14,
                      border: '1px solid var(--border)', borderRadius: 10,
                      background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>
                      {config.geo_countries.length === 0
                        ? t('tenantAdmin.orderPage.selectCountries')
                        : config.geo_countries.length === 1
                          ? COUNTRIES.find(c => c.code === config.geo_countries[0])?.label ?? config.geo_countries[0]
                          : `${config.geo_countries.length} ${t('tenantAdmin.orderPage.countriesSelected')}`
                      }
                    </span>
                    <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.6 }}>▾</span>
                  </button>

                  {countryDropdownOpen && (
                    <div style={{
                      position: 'absolute', zIndex: 200, left: 0, right: 0, top: 'calc(100% + 4px)',
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                      display: 'flex', flexDirection: 'column', maxHeight: 280, overflow: 'hidden',
                    }}>
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                        <input
                          type="text"
                          value={countrySearch}
                          onChange={e => setCountrySearch(e.target.value)}
                          placeholder={t('tenantAdmin.orderPage.searchCountries')}
                          autoFocus
                          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                        />
                      </div>
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {COUNTRIES
                          .filter(c => c.label.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
                          .map(c => (
                            <label
                              key={c.code}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                                cursor: 'pointer', margin: 0, padding: '7px 12px',
                                background: config.geo_countries.includes(c.code) ? 'var(--hover)' : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={config.geo_countries.includes(c.code)}
                                onChange={() => toggleCountry(c.code)}
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                              />
                              {c.label}
                            </label>
                          ))}
                      </div>
                      {config.geo_countries.length > 0 && (
                        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => setConfig(c => ({ ...c, geo_countries: [], geo_states: [] }))}
                            style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                            {t('tenantAdmin.orderPage.clearAll')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected country tags */}
                {config.geo_countries.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {config.geo_countries.map(code => {
                      const label = COUNTRIES.find(c => c.code === code)?.label ?? code
                      return (
                        <span key={code} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'var(--btn-bg)', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '2px 8px', fontSize: 12,
                        }}>
                          {label}
                          <button type="button" onClick={() => toggleCountry(code)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1 }}>
                            ✕
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {config.geo_countries.includes('US') && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>
                      {t('tenantAdmin.orderPage.allowedStates')}
                    </div>

                    {/* State dropdown */}
                    <div ref={stateDropdownRef} style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => { setStateDropdownOpen(o => !o); setStateSearch('') }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0 12px', height: 'var(--control-h)', fontSize: 14,
                          border: '1px solid var(--border)', borderRadius: 10,
                          background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span>
                          {config.geo_states.length === 0
                            ? t('tenantAdmin.orderPage.allStates')
                            : config.geo_states.length === 1
                              ? US_STATES.find(s => s.code === config.geo_states[0])?.label ?? config.geo_states[0]
                              : `${config.geo_states.length} ${t('tenantAdmin.orderPage.statesSelected')}`
                          }
                        </span>
                        <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.6 }}>▾</span>
                      </button>

                      {stateDropdownOpen && (
                        <div style={{
                          position: 'absolute', zIndex: 200, left: 0, right: 0, top: 'calc(100% + 4px)',
                          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                          display: 'flex', flexDirection: 'column', maxHeight: 280, overflow: 'hidden',
                        }}>
                          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                            <input
                              type="text"
                              value={stateSearch}
                              onChange={e => setStateSearch(e.target.value)}
                              placeholder={t('tenantAdmin.orderPage.searchStates')}
                              autoFocus
                              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {/* All States option */}
                            {!stateSearch && (
                              <label style={{
                                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                                cursor: 'pointer', margin: 0, padding: '7px 12px',
                                borderBottom: '1px solid var(--border)',
                                background: config.geo_states.length === 0 ? 'var(--hover)' : 'transparent',
                              }}>
                                <input
                                  type="checkbox"
                                  checked={config.geo_states.length === 0}
                                  onChange={() => setConfig(c => ({ ...c, geo_states: [] }))}
                                  style={{ cursor: 'pointer', flexShrink: 0 }}
                                />
                                <span style={{ fontWeight: 500 }}>{t('tenantAdmin.orderPage.allStates')}</span>
                              </label>
                            )}
                            {US_STATES
                              .filter(s => s.label.toLowerCase().includes(stateSearch.toLowerCase()) || s.code.toLowerCase().includes(stateSearch.toLowerCase()))
                              .map(s => (
                                <label key={s.code} style={{
                                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                                  cursor: 'pointer', margin: 0, padding: '7px 12px',
                                  background: config.geo_states.includes(s.code) ? 'var(--hover)' : 'transparent',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={config.geo_states.includes(s.code)}
                                    onChange={() => toggleState(s.code)}
                                    style={{ cursor: 'pointer', flexShrink: 0 }}
                                  />
                                  {s.label}
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected state tags */}
                    {config.geo_states.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {config.geo_states.map(code => {
                          const label = US_STATES.find(s => s.code === code)?.label ?? code
                          return (
                            <span key={code} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: 'var(--btn-bg)', border: '1px solid var(--border)',
                              borderRadius: 6, padding: '2px 8px', fontSize: 12,
                            }}>
                              {label}
                              <button type="button" onClick={() => toggleState(code)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1 }}>
                                ✕
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '0 0 20px' }} />

          {/* Visibility checkboxes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('tenantAdmin.orderPage.visibilitySection')}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {([
                { key: 'show_available', label: 'showAvailable' },
                { key: 'show_price',     label: 'showPrice' },
                { key: 'show_image',     label: 'showImage' },
                { key: 'show_label_text',  label: 'showLabelText' },
                { key: 'show_label_badge', label: 'showLabelBadge' },
              ] as const).map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={e => {
                      const checked = e.target.checked
                      setConfig(c => ({
                        ...c,
                        [key]: checked,
                        // When hiding # Available, also uncheck cap
                        ...(key === 'show_available' && !checked ? { cap_qty_at_available: false } : {}),
                      }))
                    }}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14 }}>{t(`tenantAdmin.orderPage.${label}`)}</span>
                </label>
              ))}
            </div>

            {/* Cap qty — always shown, auto-unchecked when show_available is off */}
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: config.show_available ? 'pointer' : 'default', margin: 0, opacity: config.show_available ? 1 : 0.45 }}>
                <input
                  type="checkbox"
                  checked={config.cap_qty_at_available}
                  disabled={!config.show_available}
                  onChange={e => setConfig(c => ({ ...c, cap_qty_at_available: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: config.show_available ? 'pointer' : 'default' }}
                />
                <span style={{ fontSize: 14 }}>{t('tenantAdmin.orderPage.capQtyAtAvailable')}</span>
              </label>
              <p className="helper" style={{ marginTop: 4, marginLeft: 26, fontSize: 12 }}>{t('tenantAdmin.orderPage.capQtyHelp')}</p>
            </div>
          </div>

          {/* Available wording */}
          {config.show_available && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('tenantAdmin.orderPage.availableWording')}</div>
              <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['available', 'in_stock'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setConfig(c => ({ ...c, available_wording: opt }))}
                    style={{
                      padding: '0 16px', height: 36, fontSize: 13, border: 'none', cursor: 'pointer',
                      background: config.available_wording === opt ? 'var(--primary)' : 'var(--btn-bg)',
                      color: config.available_wording === opt ? '#fff' : 'var(--text)',
                      fontWeight: config.available_wording === opt ? 600 : 400,
                    }}
                  >
                    {opt === 'available' ? t('tenantAdmin.orderPage.wordingAvailable') : t('tenantAdmin.orderPage.wordingInStock')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <button
            className="primary"
            onClick={handleSaveConfig}
            disabled={savingConfig || !configLoaded}
            style={{ height: 'var(--control-h)', padding: '0 32px', marginTop: 4 }}
          >
            {savingConfig ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </div>
  )
}
