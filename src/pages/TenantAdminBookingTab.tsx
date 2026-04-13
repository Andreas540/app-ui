// src/pages/TenantAdminBookingTab.tsx
// Booking configuration tab rendered inside TenantAdmin.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders, listProducts, type ProductWithCost } from '../lib/api'
import BookingSmsUsagePage from './BookingSmsUsagePage'
import BookingRemindersPage from './BookingRemindersPage'
import BookingIntegrationPage from './BookingIntegrationPage'

const DOWS = [1, 2, 3, 4, 5, 6, 0] // Mon–Sun

type DayState = { active: boolean; start: string; end: string }
type WeekState = Record<number, DayState>

const DEFAULT_DAY: DayState = { active: false, start: '09:00', end: '17:00' }

function defaultWeek(): WeekState {
  return Object.fromEntries(DOWS.map(d => [d, { ...DEFAULT_DAY }]))
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function sanitizeSlug(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').slice(0, 60)
}

// Returns the localised weekday name for a given day-of-week (0=Sun … 6=Sat)
function dowLabel(dow: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(2024, 0, dow === 0 ? 7 : 7 + dow)
  )
}

type BookingSubTab = 'availability' | 'booking-page' | 'sms' | 'simplybook'
type SmsView = 'usage' | 'reminders'

export default function TenantAdminBookingTab({ initialSubTab }: { initialSubTab?: BookingSubTab }) {
  const { t, i18n } = useTranslation()
  const [subTab, setSubTab] = useState<BookingSubTab>(initialSubTab ?? 'availability')
  const [smsView, setSmsView] = useState<SmsView>('usage')

  // ── Booking settings ──────────────────────────────────────────────────────
  const [slug, setSlug]                       = useState('')
  const [paymentProvider, setPaymentProvider] = useState<'none' | 'stripe' | 'amp'>('none')
  const [savingConfig, setSavingConfig]       = useState(false)
  const [configLoaded, setConfigLoaded]       = useState(false)

  // ── Availability ──────────────────────────────────────────────────────────
  const [services, setServices]         = useState<ProductWithCost[]>([])
  const [selectedId, setSelectedId]     = useState('')
  const [week, setWeek]                 = useState<WeekState>(defaultWeek())
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [savingAvail, setSavingAvail]   = useState(false)

  // Load booking config + services on mount
  useEffect(() => {
    fetch(`${apiBase()}/api/tenant-admin?action=getBookingConfig`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        setSlug(data.slug || '')
        setPaymentProvider(data.paymentProvider || 'none')
        setConfigLoaded(true)
      })
      .catch(console.error)

    listProducts().then(({ products }) => {
      const svcs = products.filter(p => p.category === 'service')
      setServices(svcs)
      if (svcs.length) setSelectedId(svcs[0].id)
    }).catch(console.error)
  }, [])

  // Load availability when service selection changes
  useEffect(() => {
    if (!selectedId) return
    setLoadingAvail(true)
    fetch(`${apiBase()}/api/booking-availability?service_id=${selectedId}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const w = defaultWeek()
        for (const row of (data.availability || [])) {
          w[row.day_of_week] = {
            active: true,
            start: String(row.start_time).slice(0, 5),
            end:   String(row.end_time).slice(0, 5),
          }
        }
        setWeek(w)
      })
      .catch(console.error)
      .finally(() => setLoadingAvail(false))
  }, [selectedId])

  function setDay(dow: number, patch: Partial<DayState>) {
    setWeek(prev => ({ ...prev, [dow]: { ...prev[dow], ...patch } }))
  }

  async function saveConfig() {
    setSavingConfig(true)
    try {
      const res = await fetch(`${apiBase()}/api/tenant-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateBookingConfig', slug, paymentProvider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('tenantAdmin.booking.failedSave'))
      setSlug(data.slug || '')
      alert(t('tenantAdmin.booking.settingsSaved'))
    } catch (e: any) {
      alert(e?.message || t('tenantAdmin.booking.failedSave'))
    } finally {
      setSavingConfig(false)
    }
  }

  async function saveAvailability() {
    if (!selectedId) return
    setSavingAvail(true)
    try {
      const availability = DOWS
        .filter(d => week[d].active)
        .map(d => ({ day_of_week: d, start_time: week[d].start, end_time: week[d].end }))

      const res = await fetch(`${apiBase()}/api/booking-availability`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ service_id: selectedId, availability }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      alert(t('tenantAdmin.booking.availabilitySaved'))
    } catch (e: any) {
      alert(e?.message || t('tenantAdmin.booking.failedSave'))
    } finally {
      setSavingAvail(false)
    }
  }

  const [copiedUrl, setCopiedUrl] = useState(false)

  const siteOrigin = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
  const selected   = services.find(s => s.id === selectedId)
  const publicUrl  = slug ? `${siteOrigin}/book/${slug}` : ''

  function copyPublicUrl() {
    navigator.clipboard.writeText(publicUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const SUB_TABS: { id: BookingSubTab; label: string }[] = [
    { id: 'availability', label: t('tenantAdmin.booking.tabAvailability') },
    { id: 'booking-page', label: t('tenantAdmin.booking.tabBookingPage') },
    { id: 'sms',          label: t('tenantAdmin.booking.tabSms') },
    { id: 'simplybook',   label: t('tenantAdmin.booking.tabSimplyBook') },
  ]

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--separator)', paddingBottom: 0 }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              background: 'none', border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subTab === tab.id ? 600 : 400,
              fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Availability ── */}
      {subTab === 'availability' && (
        <div>
          {services.length === 0 && !loadingAvail ? (
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
              {t('tenantAdmin.booking.noServices')}
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <label>{t('tenantAdmin.booking.serviceLabel')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ maxWidth: 280 }}>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {selected?.duration_minutes != null && (
                    <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {t('tenantAdmin.booking.minSlots', { min: selected.duration_minutes })}
                    </span>
                  )}
                  {selected?.price_amount != null && (
                    <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      · {Number(selected.price_amount).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {loadingAvail ? (
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {DOWS.map(dow => {
                    const day = week[dow]
                    return (
                      <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <input
                          type="checkbox"
                          id={`day-${dow}`}
                          checked={day.active}
                          onChange={e => setDay(dow, { active: e.target.checked })}
                          style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                        />
                        <label
                          htmlFor={`day-${dow}`}
                          style={{ width: 110, fontSize: 14, margin: 0, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}
                        >
                          {dowLabel(dow, i18n.language)}
                        </label>
                        {day.active ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="time" value={day.start} onChange={e => setDay(dow, { start: e.target.value })}
                              style={{ width: 120, height: 36, fontSize: 14, padding: '0 8px' }} />
                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('tenantAdmin.booking.to')}</span>
                            <input type="time" value={day.end} onChange={e => setDay(dow, { end: e.target.value })}
                              style={{ width: 120, height: 36, fontSize: 14, padding: '0 8px' }} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('tenantAdmin.booking.closed')}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <button className="primary" onClick={saveAvailability} disabled={savingAvail || loadingAvail} style={{ marginTop: 20 }}>
                {savingAvail ? t('tenantAdmin.booking.saving') : t('tenantAdmin.booking.saveAvailability')}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Booking page ── */}
      {subTab === 'booking-page' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label>{t('tenantAdmin.booking.bookingPageUrl')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{
                padding: '0 10px', height: 'var(--control-h)', display: 'flex', alignItems: 'center',
                fontSize: 14, color: 'var(--muted)', background: 'var(--btn-bg)',
                border: '1px solid var(--border)', borderRight: 'none', borderRadius: '10px 0 0 10px',
                whiteSpace: 'nowrap',
              }}>
                /book/
              </span>
              <input
                value={slug}
                onChange={e => setSlug(sanitizeSlug(e.target.value))}
                placeholder="your-business-name"
                style={{ borderRadius: '0 10px 10px 0', flex: 1, maxWidth: 260 }}
              />
            </div>
            {publicUrl && (
              <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('tenantAdmin.booking.yourBookingSite')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <a href={publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', wordBreak: 'break-all' }}>{publicUrl}</a>
                  <button type="button" onClick={copyPublicUrl} style={{ height: 32, padding: '0 12px', fontSize: 12, flexShrink: 0 }}>
                    {copiedUrl ? t('tenantAdmin.booking.copied') : t('tenantAdmin.booking.copyUrl')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label>{t('tenantAdmin.booking.paymentProvider')}</label>
            <select value={paymentProvider} onChange={e => setPaymentProvider(e.target.value as 'none' | 'stripe' | 'amp')} style={{ maxWidth: 280 }}>
              <option value="none">{t('tenantAdmin.booking.paymentNone')}</option>
              <option value="stripe">{t('tenantAdmin.booking.paymentStripe')}</option>
              <option value="amp">{t('tenantAdmin.booking.paymentAmp')}</option>
            </select>
          </div>

          <button className="primary" onClick={saveConfig} disabled={savingConfig || !configLoaded}>
            {savingConfig ? t('tenantAdmin.booking.saving') : t('tenantAdmin.booking.saveSettings')}
          </button>
        </div>
      )}

      {/* ── SMS ── */}
      {subTab === 'sms' && (
        <div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
            {(['usage', 'reminders'] as const).map(v => (
              <button key={v} onClick={() => setSmsView(v)} style={{
                padding: '6px 18px', border: 'none', borderRadius: 0,
                background: smsView === v ? 'var(--primary, #2563eb)' : 'transparent',
                color: smsView === v ? '#fff' : 'inherit',
                cursor: 'pointer', fontWeight: smsView === v ? 600 : 400,
              }}>
                {v === 'usage' ? t('tenantAdmin.booking.smsUsageTab') : t('tenantAdmin.booking.remindersTab')}
              </button>
            ))}
          </div>
          {smsView === 'usage'     && <BookingSmsUsagePage />}
          {smsView === 'reminders' && <BookingRemindersPage />}
        </div>
      )}

      {/* ── Simply Book ── */}
      {subTab === 'simplybook' && <BookingIntegrationPage />}
    </div>
  )
}
