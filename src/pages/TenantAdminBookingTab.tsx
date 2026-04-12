// src/pages/TenantAdminBookingTab.tsx
// Booking configuration tab rendered inside TenantAdmin.
// Step 3 will add: booking slug + payment provider selection.

import { useEffect, useState } from 'react'
import { getAuthHeaders, listProducts, type ProductWithCost } from '../lib/api'

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

export default function TenantAdminBookingTab() {
  const [services, setServices]     = useState<ProductWithCost[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [week, setWeek]             = useState<WeekState>(defaultWeek())
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  // Load services on mount
  useEffect(() => {
    listProducts().then(({ products }) => {
      const svcs = products.filter(p => p.category === 'service')
      setServices(svcs)
      if (svcs.length) setSelectedId(svcs[0].id)
    }).catch(console.error)
  }, [])

  // Load availability when service selection changes
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
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
      .finally(() => setLoading(false))
  }, [selectedId])

  function setDay(dow: number, patch: Partial<DayState>) {
    setWeek(prev => ({ ...prev, [dow]: { ...prev[dow], ...patch } }))
  }

  async function save() {
    if (!selectedId) return
    setSaving(true)
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
      setSaving(false)
    }
  }

  const selected = services.find(s => s.id === selectedId)

  return (
    <div>
      <h4 style={{ margin: '0 0 16px' }}>Availability</h4>

      {services.length === 0 && !loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          No services found. Add services on the Products &amp; Services page first.
        </p>
      ) : (
        <>
          {/* Service selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Service
            </label>
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

          {/* Weekly schedule */}
          {loading ? (
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
            onClick={save}
            disabled={saving || loading}
            style={{ marginTop: 20 }}
          >
            {saving ? 'Saving…' : 'Save availability'}
          </button>
        </>
      )}
    </div>
  )
}
