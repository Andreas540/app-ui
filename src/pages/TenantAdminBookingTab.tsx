// src/pages/TenantAdminBookingTab.tsx
// Booking configuration tab rendered inside TenantAdmin.

import { useEffect, useState } from 'react'
import { getAuthHeaders, listProducts, type ProductWithCost } from '../lib/api'
import BookingSmsUsagePage from './BookingSmsUsagePage'
import BookingRemindersPage from './BookingRemindersPage'
import BookingIntegrationPage from './BookingIntegrationPage'

const DAYS = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
  { dow: 6, label: 'Saturday' },
  { dow: 0, label: 'Sunday' },
]

type DayState = { active: boolean; start: string; end: string }
type WeekState = Record<number, DayState>

const DEFAULT_DAY: DayState = { active: false, start: '09:00', end: '17:00' }

function defaultWeek(): WeekState {
  return Object.fromEntries(DAYS.map(d => [d.dow, { ...DEFAULT_DAY }]))
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function sanitizeSlug(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').slice(0, 60)
}

type BookingSubTab = 'availability' | 'booking-page' | 'sms' | 'simplybook'
type SmsView = 'usage' | 'reminders'

export default function TenantAdminBookingTab({ initialSubTab }: { initialSubTab?: BookingSubTab }) {
  const [subTab, setSubTab] = useState<BookingSubTab>(initialSubTab ?? 'availability')
  const [smsView, setSmsView] = useState<SmsView>('usage')

  // ── Booking settings ──────────────────────────────────────────────────────
  const [slug, setSlug]                     = useState('')
  const [paymentProvider, setPaymentProvider] = useState<'none' | 'stripe' | 'amp'>('none')
  const [savingConfig, setSavingConfig]     = useState(false)
  const [configLoaded, setConfigLoaded]     = useState(false)

  // ── Availability ──────────────────────────────────────────────────────────
  const [services, setServices]     = useState<ProductWithCost[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [week, setWeek]             = useState<WeekState>(defaultWeek())
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [savingAvail, setSavingAvail]   = useState(false)

  // Load booking config + services on mount
  useEffect(() => {
    fetch(`${apiBase()}/api/tenant-admin?action=getBookingConfig`, {
      headers: getAuthHeaders(),
    })
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
    fetch(`${apiBase()}/api/booking-availability?service_id=${selectedId}`, {
      headers: getAuthHeaders(),
    })
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
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSlug(data.slug || '')
      alert('Booking settings saved!')
    } catch (e: any) {
      alert(e?.message || 'Failed to save')
    } finally {
      setSavingConfig(false)
    }
  }

  async function saveAvailability() {
    if (!selectedId) return
    setSavingAvail(true)
    try {
      const availability = DAYS
        .filter(d => week[d.dow].active)
        .map(d => ({
          day_of_week: d.dow,
          start_time:  week[d.dow].start,
          end_time:    week[d.dow].end,
        }))

      const res = await fetch(`${apiBase()}/api/booking-availability`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ service_id: selectedId, availability }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      alert('Availability saved!')
    } catch (e: any) {
      alert(e?.message || 'Failed to save')
    } finally {
      setSavingAvail(false)
    }
  }

  const [copiedUrl, setCopiedUrl] = useState(false)

  const siteOrigin = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
  const selected = services.find(s => s.id === selectedId)
  const publicUrl = slug ? `${siteOrigin}/book/${slug}` : ''

  function copyPublicUrl() {
    navigator.clipboard.writeText(publicUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const SUB_TABS: { id: BookingSubTab; label: string }[] = [
    { id: 'availability',  label: 'Availability' },
    { id: 'booking-page',  label: 'Booking page' },
    { id: 'sms',           label: 'SMS' },
    { id: 'simplybook',    label: 'Simply Book' },
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
              background: 'none',
              border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subTab === tab.id ? 600 : 400,
              fontSize: 14,
              padding: '6px 14px 10px',
              cursor: 'pointer',
              marginBottom: -1,
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
              No services found. Add services on the Products &amp; Services page first.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <label>Service</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    style={{ maxWidth: 280 }}
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {selected?.duration_minutes != null && (
                    <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {selected.duration_minutes} min slots
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
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {DAYS.map(({ dow, label }) => {
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
                          style={{ width: 92, fontSize: 14, margin: 0, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}
                        >
                          {label}
                        </label>
                        {day.active ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="time"
                              value={day.start}
                              onChange={e => setDay(dow, { start: e.target.value })}
                              style={{ width: 120, height: 36, fontSize: 14, padding: '0 8px' }}
                            />
                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>to</span>
                            <input
                              type="time"
                              value={day.end}
                              onChange={e => setDay(dow, { end: e.target.value })}
                              style={{ width: 120, height: 36, fontSize: 14, padding: '0 8px' }}
                            />
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Closed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <button
                className="primary"
                onClick={saveAvailability}
                disabled={savingAvail || loadingAvail}
                style={{ marginTop: 20 }}
              >
                {savingAvail ? 'Saving…' : 'Save availability'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Booking page ── */}
      {subTab === 'booking-page' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label>Booking page URL</label>
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
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your external booking site:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <a href={publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', wordBreak: 'break-all' }}>{publicUrl}</a>
                  <button type="button" onClick={copyPublicUrl} style={{ height: 32, padding: '0 12px', fontSize: 12, flexShrink: 0 }}>
                    {copiedUrl ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label>Payment provider</label>
            <select
              value={paymentProvider}
              onChange={e => setPaymentProvider(e.target.value as 'none' | 'stripe' | 'amp')}
              style={{ maxWidth: 280 }}
            >
              <option value="none">None (manual / pay on arrival)</option>
              <option value="stripe">Stripe</option>
              <option value="amp">AMP Payment Systems</option>
            </select>
          </div>

          <button
            className="primary"
            onClick={saveConfig}
            disabled={savingConfig || !configLoaded}
          >
            {savingConfig ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}

      {/* ── SMS ── */}
      {subTab === 'sms' && (
        <div>
          {/* Toggle between SMS Usage and Reminders */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
            {(['usage', 'reminders'] as const).map(v => (
              <button
                key={v}
                onClick={() => setSmsView(v)}
                style={{
                  padding: '6px 18px',
                  border: 'none',
                  borderRadius: 0,
                  background: smsView === v ? 'var(--primary, #2563eb)' : 'transparent',
                  color: smsView === v ? '#fff' : 'inherit',
                  cursor: 'pointer',
                  fontWeight: smsView === v ? 600 : 400,
                }}
              >
                {v === 'usage' ? 'SMS Usage' : 'Reminders'}
              </button>
            ))}
          </div>

          {smsView === 'usage'     && <BookingSmsUsagePage />}
          {smsView === 'reminders' && <BookingRemindersPage />}
        </div>
      )}

      {/* ── SimplyBook ── */}
      {subTab === 'simplybook' && <BookingIntegrationPage />}
    </div>
  )
}
