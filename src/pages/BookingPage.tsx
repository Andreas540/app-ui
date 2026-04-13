// src/pages/BookingPage.tsx
// Public booking page — no auth required.
// Accessed via /book/:slug
// Steps: service → date → time → contact → confirmation

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Vibrant } from 'node-vibrant/browser'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Service {
  id: string
  name: string
  duration_minutes: number | null
  price_amount: string | null
  currency: string | null
}

type Step = 'loading' | 'error' | 'service' | 'date' | 'time' | 'contact' | 'confirm'

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDate(d: string, locale: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString(locale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatDateShort(d: string, locale: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString(locale, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(hm: string, locale: string) {
  const [h, m] = hm.split(':').map(Number)
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(2000, 0, 1, h, m)
  )
}

function formatPrice(amount: string | number | null, currency: string | null, locale: string) {
  if (amount == null) return ''
  const num = Number(amount)
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(num)
  } catch {
    return `${num.toFixed(2)} ${cur}`
  }
}

// ── Calendar picker ───────────────────────────────────────────────────────────

interface CalendarProps {
  availableDows: number[]       // 0–6 days of week that have slots
  selectedDate: string          // YYYY-MM-DD or ''
  onSelect: (d: string) => void
  locale: string
}

function CalendarPicker({ availableDows, selectedDate, onSelect, locale }: CalendarProps) {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-based

  const todayStr = todayYMD()

  function prevMonth() {
    if (year === today.getFullYear() && month === today.getMonth()) return
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Locale-aware month name and DOW labels
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  // Sun=0 … Sat=6; 2024-01-07 is a Sunday
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + i))
  )

  // Build grid: first week may have leading blanks
  const firstDow   = new Date(year, month, 1).getDay()   // 0=Sun
  const daysInMon  = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMon }, (_, i) => i + 1),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const canGoPrev = !(year === today.getFullYear() && month === today.getMonth())

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          style={{
            background: 'none', border: 'none', fontSize: 20, cursor: canGoPrev ? 'pointer' : 'default',
            color: canGoPrev ? '#1a1a1a' : '#ccc', padding: '4px 8px', borderRadius: 6,
          }}
          aria-label="Previous month"
        >‹</button>
        <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{monthName}</span>
        <button
          onClick={nextMonth}
          style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: '#1a1a1a', padding: '4px 8px', borderRadius: 6,
          }}
          aria-label="Next month"
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {dowLabels.map((l, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#999', padding: '2px 0' }}>
            {l}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />

          const dateStr  = ymd(year, month, day)
          const dow      = new Date(year, month, day).getDay()
          const isPast   = dateStr < todayStr
          const isAvail  = availableDows.includes(dow)
          const disabled = isPast || !isAvail
          const isSelected = dateStr === selectedDate
          const isToday  = dateStr === todayStr

          let bg = 'transparent'
          let color = '#1a1a1a'
          let border = '1.5px solid transparent'
          let cursor = 'default'

          if (disabled) {
            color = '#ccc'
          } else if (isSelected) {
            bg = '#2563eb'
            color = '#fff'
            border = '1.5px solid #2563eb'
            cursor = 'pointer'
          } else {
            cursor = 'pointer'
            if (isToday) border = '1.5px solid #2563eb'
          }

          return (
            <button
              key={dateStr}
              disabled={disabled}
              onClick={() => !disabled && onSelect(dateStr)}
              style={{
                background: bg,
                color,
                border,
                borderRadius: 7,
                padding: '7px 2px',
                fontSize: 14,
                fontWeight: isToday ? 700 : 400,
                cursor,
                textAlign: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!disabled && !isSelected) e.currentTarget.style.background = '#f0f4ff' }}
              onMouseLeave={e => { if (!disabled && !isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()

  // Page data
  const [tenantName, setTenantName]     = useState('')
  const [tenantIcon, setTenantIcon]     = useState<string | null>(null)
  const [bgColor, setBgColor]           = useState('#f5f5f5')
  const [services, setServices]         = useState<Service[]>([])
  const [availability, setAvailability] = useState<Record<string, number[]>>({})

  // Step
  const [step, setStep]       = useState<Step>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // Selections
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate]       = useState('')
  const [selectedTime, setSelectedTime]       = useState('')
  const [slots, setSlots]                     = useState<string[]>([])
  const [loadingSlots, setLoadingSlots]       = useState(false)

  // Contact form
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [smsConsent, setSmsConsent] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    booking_id: string
    service_name: string
    date: string
    start_time: string
    duration_minutes: number
    price: number
    currency: string
    tenant_name: string
  } | null>(null)

  const topRef = useRef<HTMLDivElement>(null)

  // Extract dominant color from tenant icon for page background tint
  useEffect(() => {
    if (!tenantIcon) return
    new Vibrant(tenantIcon).getPalette()
      .then(palette => {
        const swatch = palette.Vibrant ?? palette.LightVibrant ?? palette.Muted
        if (!swatch) return
        const { r, g, b } = swatch
        // Blend 12% of the dominant color into white for a subtle tint
        const tint = `rgb(${Math.round(r * 0.12 + 255 * 0.88)}, ${Math.round(g * 0.12 + 255 * 0.88)}, ${Math.round(b * 0.12 + 255 * 0.88)})`
        setBgColor(tint)
      })
      .catch(() => {}) // keep default on CORS or any failure
  }, [tenantIcon])

  // Scroll to top on step change
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  // Load initial page data
  useEffect(() => {
    if (!slug) { setStep('error'); setErrorMsg(t('bookingPage.invalidLink')); return }
    fetch(`${apiBase()}/.netlify/functions/public-booking?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setStep('error'); setErrorMsg(d.error || t('bookingPage.notFound')); return }
        setTenantName(d.tenant?.name || '')
        setTenantIcon(d.tenant?.icon_url || null)
        if (d.tenant?.language) i18n.changeLanguage(d.tenant.language)
        setServices(d.services || [])
        setAvailability(d.availability || {})
        setStep('service')
      })
      .catch(() => { setStep('error'); setErrorMsg(t('bookingPage.loadFailed')) })
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load time slots when date is picked
  useEffect(() => {
    if (!selectedService || !selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    fetch(
      `${apiBase()}/.netlify/functions/public-booking?slug=${encodeURIComponent(slug || '')}&service_id=${selectedService.id}&date=${selectedDate}`
    )
      .then(r => r.json())
      .then(d => { setSlots(d.slots || []) })
      .catch(() => { setSlots([]) })
      .finally(() => setLoadingSlots(false))
  }, [selectedService, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ───────────────────────────────────────────────────────────

  function selectService(svc: Service) {
    setSelectedService(svc)
    setSelectedDate('')
    setSelectedTime('')
    setSlots([])
    setStep('date')
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedTime('')
    setSlots([])
    setLoadingSlots(true) // prevents flash of "no times" before effect fires
    setStep('time')
  }

  function selectTime(time: string) {
    setSelectedTime(time)
    setStep('contact')
  }

  async function submitBooking() {
    if (!name.trim())  { alert(t('bookingPage.pleaseEnterName')); return }
    if (!email.trim()) { alert(t('bookingPage.pleaseEnterEmail')); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/public-booking`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          service_id:  selectedService!.id,
          date:        selectedDate,
          start_time:  selectedTime,
          name:        name.trim(),
          email:       email.trim(),
          phone:       phone.trim() || undefined,
          sms_consent: smsConsent,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || t('bookingPage.bookingFailed'))
        if (res.status === 409) {
          // Slot taken — reload slots and go back to time selection
          setSelectedTime('')
          setSlots([])
          setLoadingSlots(true)
          setStep('time')
        }
        return
      }
      setConfirmation(data)
      setStep('confirm')
    } catch {
      alert(t('bookingPage.bookingFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const availableDows = selectedService ? (availability[selectedService.id] || []) : []
  const locale = i18n.language || 'en'

  // ── Styles ───────────────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: bgColor,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a1a',
    fontSize: 16,
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 24px',
    maxWidth: 520,
    margin: '0 auto',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  }


  const h2Style: React.CSSProperties = {
    margin: '0 0 4px',
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a1a',
  }

  const mutedStyle: React.CSSProperties = {
    color: '#666',
    fontSize: 14,
    margin: 0,
  }

  const primaryBtn: React.CSSProperties = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  }

  const ghostBtn: React.CSSProperties = {
    background: 'transparent',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 20,
  }

  // Explicit light-mode colors so mobile dark-mode system themes don't override
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid #ddd',
    borderRadius: 8,
    boxSizing: 'border-box',
    outline: 'none',
    background: '#fff',
    color: '#1a1a1a',
    WebkitTextFillColor: '#1a1a1a',
    appearance: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: '#333',
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div ref={topRef} style={{ padding: '24px 16px 40px' }}>

        {/* Header — icon left, name+subtitle centered in remaining space */}
        {step !== 'loading' && step !== 'error' && (
          <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            {tenantIcon ? (
              <img
                src={tenantIcon}
                alt={tenantName}
                style={{
                  width: 78, height: 78,
                  borderRadius: 14,
                  background: '#fff',
                  padding: 2,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.10)',
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
            ) : null}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={h2Style}>{tenantName}</h2>
              <p style={mutedStyle}>{t('bookingPage.onlineBooking')}</p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
            <p style={{ color: '#888' }}>{t('bookingPage.loading')}</p>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
            <p style={{ color: '#c00', fontSize: 15 }}>{errorMsg}</p>
          </div>
        )}

        {/* ── Step 1: Service ── */}
        {step === 'service' && (
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>{t('bookingPage.selectService')}</h3>
            {services.length === 0 ? (
              <p style={{ color: '#888' }}>{t('bookingPage.noServices')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => selectService(svc)}
                    style={{
                      background: '#fff',
                      border: '1.5px solid #e0e0e0',
                      borderRadius: 10,
                      padding: '14px 16px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0e0e0')}
                  >
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{svc.name}</div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 4, display: 'flex', gap: 12 }}>
                      {svc.duration_minutes != null && <span>{t('bookingPage.min', { n: svc.duration_minutes })}</span>}
                      {svc.price_amount != null && Number(svc.price_amount) > 0 && (
                        <span>{formatPrice(svc.price_amount, svc.currency, locale)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Date (calendar) ── */}
        {step === 'date' && selectedService && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('service')}>{t('bookingPage.back')}</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{t('bookingPage.selectDate')}</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>{selectedService.name}</p>
            {availableDows.length === 0 ? (
              <p style={{ color: '#888' }}>{t('bookingPage.noAvailability')}</p>
            ) : (
              <CalendarPicker
                availableDows={availableDows}
                selectedDate={selectedDate}
                onSelect={selectDate}
                locale={locale}
              />
            )}
          </div>
        )}

        {/* ── Step 3: Time ── */}
        {step === 'time' && selectedService && selectedDate && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('date')}>{t('bookingPage.back')}</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{t('bookingPage.selectTime')}</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>{formatDate(selectedDate, locale)}</p>
            {loadingSlots ? (
              <p style={{ color: '#888' }}>{t('bookingPage.loadingTimes')}</p>
            ) : slots.length === 0 ? (
              <p style={{ color: '#888' }}>
                {t('bookingPage.noTimes')}{' '}
                <button
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: 14 }}
                  onClick={() => setStep('date')}
                >
                  {t('bookingPage.chooseAnotherDate')}
                </button>
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                {slots.map(s => (
                  <button
                    key={s}
                    onClick={() => selectTime(s)}
                    style={{
                      background: '#fff',
                      border: '1.5px solid #e0e0e0',
                      borderRadius: 8,
                      padding: '10px 8px',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#1a1a1a',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {formatTime(s, locale)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Contact ── */}
        {step === 'contact' && selectedService && selectedDate && selectedTime && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('time')}>{t('bookingPage.back')}</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{t('bookingPage.yourDetails')}</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>
              {selectedService.name} · {formatDateShort(selectedDate, locale)} · {formatTime(selectedTime, locale)}
            </p>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={labelStyle}>{t('bookingPage.fullName')}</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder={t('bookingPage.namePlaceholder')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <label style={labelStyle}>{t('bookingPage.emailAddress')}</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder={t('bookingPage.emailPlaceholder')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label style={labelStyle}>{t('bookingPage.phoneOptional')}</label>
                <input
                  style={inputStyle}
                  type="tel"
                  placeholder={t('bookingPage.phonePlaceholder')}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>

              {/* SMS opt-in */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                fontSize: 13,
                color: '#444',
                lineHeight: 1.4,
              }}>
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={e => setSmsConsent(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: 'pointer', accentColor: '#2563eb' }}
                />
                {t('bookingPage.smsConsent')}
              </label>
            </div>

            <button
              style={{ ...primaryBtn, marginTop: 24, opacity: submitting ? 0.7 : 1 }}
              onClick={submitBooking}
              disabled={submitting}
            >
              {submitting ? t('bookingPage.confirming') : t('bookingPage.confirmBooking')}
            </button>
          </div>
        )}

        {/* ── Step 5: Confirmation ── */}
        {step === 'confirm' && confirmation && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#166534' }}>
              {t('bookingPage.confirmed')}
            </h3>
            <p style={{ color: '#555', marginBottom: 24 }}>
              {t('bookingPage.seeYouOn', {
                date: formatDate(confirmation.date, locale),
                time: formatTime(confirmation.start_time, locale),
              })}
            </p>

            <div style={{
              background: '#f9f9f9',
              borderRadius: 10,
              padding: '16px 20px',
              textAlign: 'left',
              fontSize: 14,
              lineHeight: 1.8,
            }}>
              <div><strong>{t('bookingPage.labelService')}</strong> {confirmation.service_name}</div>
              <div><strong>{t('bookingPage.labelDate')}</strong> {formatDate(confirmation.date, locale)}</div>
              <div><strong>{t('bookingPage.labelTime')}</strong> {formatTime(confirmation.start_time, locale)}</div>
              {confirmation.duration_minutes > 0 && (
                <div><strong>{t('bookingPage.labelDuration')}</strong> {t('bookingPage.durationMin', { min: confirmation.duration_minutes })}</div>
              )}
              {confirmation.price > 0 && (
                <div><strong>{t('bookingPage.labelPrice')}</strong> {formatPrice(confirmation.price, confirmation.currency, locale)}</div>
              )}
              <div><strong>{t('bookingPage.labelReference')}</strong> #{confirmation.booking_id.slice(0, 8).toUpperCase()}</div>
            </div>

            <p style={{ color: '#888', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              {t('bookingPage.contactFor', { name: confirmation.tenant_name })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
