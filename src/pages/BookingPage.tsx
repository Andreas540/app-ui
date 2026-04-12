// src/pages/BookingPage.tsx
// Public booking page — no auth required.
// Accessed via /book/:slug
// Steps: service → date → time → contact → confirmation

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

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

function formatDate(ymd: string) {
  // "2025-03-14" → "Friday, March 14, 2025"
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(hm: string) {
  // "14:30" → "2:30 PM"
  const [h, m] = hm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// Generate list of dates for the next N days (YYYY-MM-DD)
function upcomingDates(n: number): string[] {
  const dates: string[] = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return dates
}

// Parse YYYY-MM-DD and return JS day-of-week (0=Sun, 1=Mon, …)
function dowOfDate(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function formatPrice(amount: string | number | null, currency: string | null) {
  if (amount == null) return ''
  const num = Number(amount)
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(num)
  } catch {
    return `${num.toFixed(2)} ${cur}`
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>()

  // Page data
  const [tenantName, setTenantName]       = useState('')
  const [services, setServices]           = useState<Service[]>([])
  const [availability, setAvailability]   = useState<Record<string, number[]>>({})

  // Step
  const [step, setStep] = useState<Step>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // Selections
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate]       = useState('')
  const [selectedTime, setSelectedTime]       = useState('')
  const [slots, setSlots]                     = useState<string[]>([])
  const [loadingSlots, setLoadingSlots]       = useState(false)

  // Contact form
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

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

  // Scroll to top on step change
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  // Load initial page data
  useEffect(() => {
    if (!slug) { setStep('error'); setErrorMsg('Invalid booking link.'); return }
    fetch(`${apiBase()}/.netlify/functions/public-booking?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setStep('error'); setErrorMsg(d.error || 'Booking page not found.'); return }
        setTenantName(d.tenant?.name || '')
        setServices(d.services || [])
        setAvailability(d.availability || {})
        setStep('service')
      })
      .catch(() => { setStep('error'); setErrorMsg('Could not load booking page. Please try again.') })
  }, [slug])

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
  }, [selectedService, selectedDate])

  // ── Event handlers ──────────────────────────────────────────────────────────

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
    setStep('time')
  }

  function selectTime(time: string) {
    setSelectedTime(time)
    setStep('contact')
  }

  async function submitBooking() {
    if (!name.trim()) { alert('Please enter your name.'); return }
    if (!email.trim()) { alert('Please enter your email address.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/public-booking`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          service_id: selectedService!.id,
          date:       selectedDate,
          start_time: selectedTime,
          name:       name.trim(),
          email:      email.trim(),
          phone:      phone.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Booking failed. Please try again.')
        if (res.status === 409) {
          // Slot taken — go back to time selection
          setSelectedTime('')
          setSlots([])
          setStep('time')
        }
        return
      }
      setConfirmation(data)
      setStep('confirm')
    } catch {
      alert('Booking failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const availableDates = upcomingDates(60).filter(d => {
    if (!selectedService) return false
    const dow = dowOfDate(d)
    const dows = availability[selectedService.id] || []
    return dows.includes(dow)
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f5f5f5',
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

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '32px 24px 0',
    maxWidth: 520,
    margin: '0 auto',
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid #ddd',
    borderRadius: 8,
    boxSizing: 'border-box',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: '#333',
  }

  return (
    <div style={pageStyle}>
      <div ref={topRef} style={{ padding: '24px 16px 40px' }}>

        {/* Header */}
        {step !== 'loading' && step !== 'error' && (
          <div style={headerStyle}>
            <h2 style={h2Style}>{tenantName}</h2>
            <p style={mutedStyle}>Online booking</p>
            <div style={{ height: 24 }} />
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
            <p style={{ color: '#888' }}>Loading…</p>
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
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Select a service</h3>
            {services.length === 0 ? (
              <p style={{ color: '#888' }}>No services available at this time.</p>
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
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0e0e0')}
                  >
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{svc.name}</div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 4, display: 'flex', gap: 12 }}>
                      {svc.duration_minutes != null && (
                        <span>{svc.duration_minutes} min</span>
                      )}
                      {svc.price_amount != null && Number(svc.price_amount) > 0 && (
                        <span>{formatPrice(svc.price_amount, svc.currency)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Date ── */}
        {step === 'date' && selectedService && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('service')}>← Back</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Select a date</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>{selectedService.name}</p>
            {availableDates.length === 0 ? (
              <p style={{ color: '#888' }}>No available dates in the next 60 days.</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {availableDates.map(d => (
                  <button
                    key={d}
                    onClick={() => selectDate(d)}
                    style={{
                      background: '#fff',
                      border: '1.5px solid #e0e0e0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: '#1a1a1a',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0e0e0')}
                  >
                    {formatDate(d)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Time ── */}
        {step === 'time' && selectedService && selectedDate && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('date')}>← Back</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Select a time</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>{formatDate(selectedDate)}</p>
            {loadingSlots ? (
              <p style={{ color: '#888' }}>Loading available times…</p>
            ) : slots.length === 0 ? (
              <p style={{ color: '#888' }}>
                No available times for this date.{' '}
                <button
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: 14 }}
                  onClick={() => setStep('date')}
                >
                  Choose another date
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
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0e0e0')}
                  >
                    {formatTime(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Contact ── */}
        {step === 'contact' && selectedService && selectedDate && selectedTime && (
          <div style={cardStyle}>
            <button style={ghostBtn} onClick={() => setStep('time')}>← Back</button>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Your details</h3>
            <p style={{ ...mutedStyle, marginBottom: 20 }}>
              {selectedService.name} · {formatDate(selectedDate)} · {formatTime(selectedTime)}
            </p>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={labelStyle}>Full name *</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <label style={labelStyle}>Email address *</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label style={labelStyle}>Phone (optional)</label>
                <input
                  style={inputStyle}
                  type="tel"
                  placeholder="+1 555 000 0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>

            <button
              style={{ ...primaryBtn, marginTop: 24, opacity: submitting ? 0.7 : 1 }}
              onClick={submitBooking}
              disabled={submitting}
            >
              {submitting ? 'Confirming…' : 'Confirm booking'}
            </button>

            <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
              By confirming, you agree to receive a booking confirmation by email.
            </p>
          </div>
        )}

        {/* ── Step 5: Confirmation ── */}
        {step === 'confirm' && confirmation && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#166534' }}>
              Booking confirmed!
            </h3>
            <p style={{ color: '#555', marginBottom: 24 }}>
              See you on {formatDate(confirmation.date)} at {formatTime(confirmation.start_time)}.
            </p>

            <div style={{
              background: '#f9f9f9',
              borderRadius: 10,
              padding: '16px 20px',
              textAlign: 'left',
              fontSize: 14,
              lineHeight: 1.8,
            }}>
              <div><strong>Service:</strong> {confirmation.service_name}</div>
              <div><strong>Date:</strong> {formatDate(confirmation.date)}</div>
              <div><strong>Time:</strong> {formatTime(confirmation.start_time)}</div>
              {confirmation.duration_minutes > 0 && (
                <div><strong>Duration:</strong> {confirmation.duration_minutes} min</div>
              )}
              {confirmation.price > 0 && (
                <div><strong>Price:</strong> {formatPrice(confirmation.price, confirmation.currency)}</div>
              )}
              <div><strong>Reference:</strong> #{confirmation.booking_id.slice(0, 8).toUpperCase()}</div>
            </div>

            <p style={{ color: '#888', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              A confirmation has been recorded. Contact {confirmation.tenant_name} if you need to make changes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
