// src/pages/TenantAdminCustomerOffersTab.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders, fetchBootstrap } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

// ── Shared helpers ────────────────────────────────────────────────────────────

const DOWS = [1, 2, 3, 4, 5, 6, 0] // Mon–Sun

type DayState = { active: boolean; start: string; end: string }
type WeekState = Record<number, DayState>

const DEFAULT_DAY: DayState = { active: false, start: '09:00', end: '17:00' }
function defaultWeek(): WeekState {
  return Object.fromEntries(DOWS.map(d => [d, { ...DEFAULT_DAY }]))
}
function dowLabel(dow: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(2024, 0, dow === 0 ? 7 : 7 + dow)
  )
}

interface CustomerOption { id: string; name: string }

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

interface Props {
  initialCustomerId?: string
  initialSubTab?: 'order-form' | 'booking-form'
}

// ── Order-form tab ────────────────────────────────────────────────────────────

interface ProductOffer {
  id: string; name: string; price_amount: number
  offer_price_amount: number | null; offer_is_available: boolean
}
interface ProductEdit { available: boolean; price: string }

function OrderFormTab({ customerId, customers }: { customerId: string; customers: CustomerOption[] }) {
  const { t } = useTranslation()
  const { fmtMoney } = useCurrency()

  const [products, setProducts]             = useState<ProductOffer[]>([])
  const [edits, setEdits]                   = useState<Record<string, ProductEdit>>({})
  const [loading, setLoading]               = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    if (!customerId) { setProducts([]); setEdits({}); return }
    setLoading(true); setError(null)
    fetch(`${apiBase()}/api/get-customer-offers?customer_id=${customerId}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        const rows: ProductOffer[] = d.products || []
        setProducts(rows)
        const init: Record<string, ProductEdit> = {}
        for (const p of rows) {
          init[p.id] = {
            available: p.offer_is_available,
            price: p.offer_price_amount != null ? String(p.offer_price_amount) : String(p.price_amount ?? ''),
          }
        }
        setEdits(init)
      })
      .catch(() => setError(t('customerOffers.errorLoad')))
      .finally(() => setLoading(false))
  }, [customerId])

  async function handleSave() {
    if (!customerId) return
    setSaving(true); setSaved(false); setError(null)
    try {
      const offers = products.map(p => {
        const e = edits[p.id]
        const priceNum = parseFloat(e?.price ?? '')
        const priceChanged = Number.isFinite(priceNum) && Math.abs(priceNum - p.price_amount) > 0.001
        return { product_id: p.id, is_available: e?.available ?? true, price_amount: priceChanged ? priceNum : null }
      })
      const res = await fetch(`${apiBase()}/api/save-customer-offers`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ customer_id: customerId, offers }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  if (!customerId) return null
  if (loading) return <p className="helper">{t('loading')}</p>
  if (products.length === 0) return <p className="helper">{t('customerOffers.noProducts')}</p>

  const selectedCustomer = customers.find(c => c.id === customerId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="helper" style={{ margin: 0 }}>
        {t('customerOffers.description', { name: selectedCustomer?.name ?? '' })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 160px', gap: '0 12px', paddingBottom: 6, borderBottom: '1px solid var(--line)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <div /><div>{t('customerOffers.product')}</div><div>{t('customerOffers.price')}</div>
      </div>
      {products.map(p => {
        const e = edits[p.id]; const hidden = !(e?.available ?? true)
        return (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 160px', gap: '0 12px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', opacity: hidden ? 0.4 : 1 }}>
            <input type="checkbox" checked={e?.available ?? true} onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], available: ev.target.checked } }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <div style={{ fontSize: 14, fontWeight: hidden ? 400 : 500 }}>
              {p.name}
              <span className="helper" style={{ marginLeft: 6 }}>({t('customerOffers.default')}: {fmtMoney(p.price_amount)})</span>
            </div>
            <input type="number" step="0.01" min="0" value={e?.price ?? ''} onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], price: ev.target.value } }))} disabled={hidden} style={{ height: 36, padding: '0 8px' }} />
          </div>
        )
      })}
      {error && <p style={{ color: 'var(--color-error)', fontSize: 13 }}>{error}</p>}
      <div>
        <button className="primary" onClick={handleSave} disabled={saving} style={{ height: 36, padding: '0 20px', fontSize: 14 }}>
          {saving ? t('saving') : saved ? t('saved') : t('save')}
        </button>
      </div>
    </div>
  )
}

// ── Booking-form tab ──────────────────────────────────────────────────────────

interface ServiceOffer {
  id: string; name: string; duration_minutes: number; price_amount: number
  offer_price_amount: number | null; offer_duration_minutes: number | null; offer_is_available: boolean
}
interface ServiceEdit { available: boolean; price: string; duration: string }

function BookingFormTab({ customerId, customers }: { customerId: string; customers: CustomerOption[] }) {
  const { t, i18n } = useTranslation()
  const { fmtMoney } = useCurrency()

  const [services, setServices]                   = useState<ServiceOffer[]>([])
  const [edits, setEdits]                         = useState<Record<string, ServiceEdit>>({})
  // availability per service: service_id → WeekState
  const [availability, setAvailability]           = useState<Record<string, WeekState>>({})
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [loading, setLoading]                     = useState(false)
  const [saving, setSaving]                       = useState(false)
  const [saved, setSaved]                         = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  useEffect(() => {
    if (!customerId) { setServices([]); setEdits({}); setAvailability({}); setSelectedServiceId(''); return }
    setLoading(true); setError(null)
    fetch(`${apiBase()}/api/get-customer-booking-offers?customer_id=${customerId}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        const rows: ServiceOffer[] = d.services || []
        setServices(rows)
        if (rows.length && !selectedServiceId) setSelectedServiceId(rows[0].id)

        const initEdits: Record<string, ServiceEdit> = {}
        for (const s of rows) {
          initEdits[s.id] = {
            available: s.offer_is_available,
            price:     s.offer_price_amount    != null ? String(s.offer_price_amount)    : String(s.price_amount    ?? ''),
            duration:  s.offer_duration_minutes != null ? String(s.offer_duration_minutes) : String(s.duration_minutes ?? ''),
          }
        }
        setEdits(initEdits)

        // Build availability state: prefer customer override, fall back to service default
        const custAvail: Record<string, { day_of_week: number; start_time: string; end_time: string }[]> = d.customer_availability || {}
        const defAvail:  Record<string, { day_of_week: number; start_time: string; end_time: string }[]> = d.default_availability  || {}
        const initAvail: Record<string, WeekState> = {}
        for (const s of rows) {
          const w = defaultWeek()
          const rows2 = custAvail[s.id]?.length ? custAvail[s.id] : (defAvail[s.id] || [])
          for (const r of rows2) {
            w[r.day_of_week] = { active: true, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5) }
          }
          initAvail[s.id] = w
        }
        setAvailability(initAvail)
      })
      .catch(() => setError(t('customerOffers.errorLoad')))
      .finally(() => setLoading(false))
  }, [customerId])

  function setDay(serviceId: string, dow: number, patch: Partial<DayState>) {
    setAvailability(prev => ({
      ...prev,
      [serviceId]: { ...prev[serviceId], [dow]: { ...prev[serviceId]?.[dow], ...patch } },
    }))
  }

  async function handleSave() {
    if (!customerId) return
    setSaving(true); setSaved(false); setError(null)
    try {
      const servicesToSave = services.map(s => {
        const e = edits[s.id]
        const priceNum    = parseFloat(e?.price ?? '')
        const durationNum = parseInt(e?.duration ?? '', 10)
        const priceChanged    = Number.isFinite(priceNum)    && Math.abs(priceNum    - s.price_amount)    > 0.001
        const durationChanged = Number.isFinite(durationNum) && durationNum !== s.duration_minutes
        return {
          service_id:       s.id,
          is_available:     e?.available ?? true,
          price_amount:     priceChanged    ? priceNum    : null,
          duration_minutes: durationChanged ? durationNum : null,
        }
      })

      // Build availability payload: only services that have at least one active day
      const availPayload: Record<string, { day_of_week: number; start_time: string; end_time: string }[]> = {}
      for (const s of services) {
        const w = availability[s.id] || defaultWeek()
        const rows = DOWS.filter(d => w[d]?.active).map(d => ({ day_of_week: d, start_time: w[d].start, end_time: w[d].end }))
        if (rows.length) availPayload[s.id] = rows
      }

      const res = await fetch(`${apiBase()}/api/save-customer-booking-offers`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ customer_id: customerId, services: servicesToSave, availability: availPayload }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  if (!customerId) return null
  if (loading) return <p className="helper">{t('loading')}</p>
  if (services.length === 0) return <p className="helper">{t('customerOffers.noServices')}</p>

  const selectedCustomer = customers.find(c => c.id === customerId)
  const week = availability[selectedServiceId] || defaultWeek()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="helper" style={{ margin: 0 }}>
        {t('customerOffers.bookingDescription', { name: selectedCustomer?.name ?? '' })}
      </p>

      {/* Services list */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px', gap: '0 12px', paddingBottom: 6, borderBottom: '1px solid var(--line)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <div /><div>{t('customerOffers.service')}</div><div>{t('customerOffers.duration')}</div><div>{t('customerOffers.price')}</div>
      </div>
      {services.map(s => {
        const e = edits[s.id]; const hidden = !(e?.available ?? true)
        return (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px', gap: '0 12px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', opacity: hidden ? 0.4 : 1 }}>
            <input type="checkbox" checked={e?.available ?? true} onChange={ev => setEdits(prev => ({ ...prev, [s.id]: { ...prev[s.id], available: ev.target.checked } }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <div style={{ fontSize: 14, fontWeight: hidden ? 400 : 500 }}>
              {s.name}
              <div className="helper">
                {t('customerOffers.defaultDuration', { min: s.duration_minutes })}
                {s.price_amount != null && ` · ${fmtMoney(s.price_amount)}`}
              </div>
            </div>
            <input type="number" min="5" step="5" value={e?.duration ?? ''} onChange={ev => setEdits(prev => ({ ...prev, [s.id]: { ...prev[s.id], duration: ev.target.value } }))} disabled={hidden} style={{ height: 36, padding: '0 8px' }} />
            <input type="number" step="0.01" min="0" value={e?.price ?? ''} onChange={ev => setEdits(prev => ({ ...prev, [s.id]: { ...prev[s.id], price: ev.target.value } }))} disabled={hidden} style={{ height: 36, padding: '0 8px' }} />
          </div>
        )
      })}

      {/* Availability section */}
      <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>{t('customerOffers.availability')}</h4>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{t('customerOffers.service')}</label>
          <select value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)} style={{ maxWidth: 280 }}>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {DOWS.map(dow => {
            const day = week[dow]
            return (
              <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input type="checkbox" id={`cust-day-${dow}`} checked={day?.active ?? false}
                  onChange={e => setDay(selectedServiceId, dow, { active: e.target.checked })}
                  style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                <label htmlFor={`cust-day-${dow}`} style={{ width: 110, fontSize: 14, margin: 0, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}>
                  {dowLabel(dow, i18n.language)}
                </label>
                {day?.active ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="time" value={day.start} onChange={e => setDay(selectedServiceId, dow, { start: e.target.value })} style={{ width: 120, height: 36, padding: '0 8px' }} />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('tenantAdmin.booking.to')}</span>
                    <input type="time" value={day.end} onChange={e => setDay(selectedServiceId, dow, { end: e.target.value })} style={{ width: 120, height: 36, padding: '0 8px' }} />
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('tenantAdmin.booking.closed')}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-error)', fontSize: 13 }}>{error}</p>}
      <div>
        <button className="primary" onClick={handleSave} disabled={saving} style={{ height: 36, padding: '0 20px', fontSize: 14 }}>
          {saving ? t('saving') : saved ? t('saved') : t('save')}
        </button>
      </div>
    </div>
  )
}

// ── Main tab component ────────────────────────────────────────────────────────

export default function TenantAdminCustomerOffersTab({ initialCustomerId, initialSubTab }: Props) {
  const { t } = useTranslation()

  const [customers, setCustomers]               = useState<CustomerOption[]>([])
  const [customerId, setCustomerId]             = useState(initialCustomerId || '')
  const [subTab, setSubTab]                     = useState<'order-form' | 'booking-form'>(initialSubTab || 'order-form')
  const [loadingCustomers, setLoadingCustomers] = useState(true)

  useEffect(() => {
    fetchBootstrap()
      .then(d => setCustomers(
        (d.customers || [])
          .map((c: any) => ({ id: c.id, name: c.name }))
          .sort((a: CustomerOption, b: CustomerOption) => a.name.localeCompare(b.name))
      ))
      .catch(() => {})
      .finally(() => setLoadingCustomers(false))
  }, [])

  const SUB_TABS = [
    { id: 'order-form'   as const, label: t('customerOffers.tabOrderForm') },
    { id: 'booking-form' as const, label: t('customerOffers.tabBookingForm') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Customer selector */}
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {t('customerOffers.selectCustomer')}
        </label>
        <select
          value={customerId}
          onChange={e => setCustomerId(e.target.value)}
          style={{ maxWidth: 320 }}
          disabled={loadingCustomers}
        >
          <option value="">{loadingCustomers ? t('loading') : t('customerOffers.selectCustomerPlaceholder')}</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Sub-tabs */}
      <div className="booking-subtab-bar">
        <select className="booking-subtab-select" value={subTab} onChange={e => setSubTab(e.target.value as typeof subTab)}>
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

      {/* Tab content */}
      {subTab === 'order-form'   && <OrderFormTab   customerId={customerId} customers={customers} />}
      {subTab === 'booking-form' && <BookingFormTab customerId={customerId} customers={customers} />}
    </div>
  )
}
