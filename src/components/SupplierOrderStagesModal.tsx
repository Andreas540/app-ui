import { useState, useEffect } from 'react'

const CONDITION_OPTIONS = ['New', 'Like New', 'Good', 'Used', 'Fair', 'Poor']
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { formatDate } from '../lib/time'

interface RowDraft {
  id: string
  product_id: string
  product_name: string
  qty: number
  shippedStr: string
  customsStr: string
  receivedStr: string
  unit_tracking: 'none' | 'on_promote' | 'serialized_intake'
  units_registered: number
}

interface UnitSlot {
  product_id: string
  product_name: string
  serial: string
  condition: string
  skipped: boolean
}

interface StageEvent {
  id: string
  stage: 'shipped' | 'in_customs' | 'received'
  product_name: string
  qty_delta: number
  event_date: string
}

interface SupplierOrderStagesModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
  onSaved: () => void
}

function toStr(n: number): string {
  return n > 0 ? String(n) : ''
}

function mapToRow(item: any): RowDraft {
  return {
    id:               item.id,
    product_id:       item.product_id,
    product_name:     item.product_name,
    qty:              Number(item.qty) || 0,
    shippedStr:       toStr(Number(item.qty_shipped)    || 0),
    customsStr:       toStr(Number(item.qty_in_customs) || 0),
    receivedStr:      toStr(Number(item.qty_received)   || 0),
    unit_tracking:    item.unit_tracking || 'none',
    units_registered: Number(item.units_registered) || 0,
  }
}

function buildUnitSlots(items: any[]): UnitSlot[] {
  return items
    .filter(item => item.unit_tracking === 'serialized_intake')
    .flatMap(item => {
      const pending = Math.max(0, Number(item.qty_received) - Number(item.units_registered || 0))
      return Array.from({ length: pending }, () => ({
        product_id:   item.product_id,
        product_name: item.product_name,
        serial:       '',
        condition:    '',
        skipped:      false,
      }))
    })
}

const STAGE_META = {
  received:   { icon: '✓', color: '#10b981' },
  in_customs: { icon: '◑', color: '#f97316' },
  shipped:    { icon: '►', color: '#3b82f6' },
} as const

export default function SupplierOrderStagesModal({
  isOpen, onClose, order, onSaved,
}: SupplierOrderStagesModalProps) {
  const { t } = useTranslation()
  const { fmtQty } = useCurrency()

  const [rows, setRows] = useState<RowDraft[]>([])
  const [events, setEvents] = useState<StageEvent[]>([])
  const [unitSlots, setUnitSlots] = useState<UnitSlot[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [registeringSaving, setRegisteringSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  async function fetchData(orderId: string) {
    const res = await fetch(`${base}/api/order-supplier?id=${orderId}`, { headers: getAuthHeaders() })
    const data = await res.json()
    return data
  }

  useEffect(() => {
    if (!isOpen || !order?.id) return
    setError(null)
    setSaving(false)
    setLoading(true)
    fetchData(order.id)
      .then(data => {
        setRows((data.items || []).map(mapToRow))
        setEvents(data.events || [])
        setUnitSlots(buildUnitSlots(data.items || []))
      })
      .catch(e => setError(e.message || t('suppliers.stagesSaveFailed')))
      .finally(() => setLoading(false))
  }, [isOpen, order?.id])

  function update(idx: number, field: 'shippedStr' | 'customsStr' | 'receivedStr', val: string) {
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  function updateSlot(idx: number, field: 'serial' | 'condition', val: string): void
  function updateSlot(idx: number, field: 'skipped', val: boolean): void
  function updateSlot(idx: number, field: keyof UnitSlot, val: any) {
    setUnitSlots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  function pendingFor(r: RowDraft) {
    return Math.max(0, r.qty - (Number(r.shippedStr) || 0) - (Number(r.customsStr) || 0) - (Number(r.receivedStr) || 0))
  }

  function rowError(r: RowDraft) {
    return (Number(r.shippedStr) || 0) + (Number(r.customsStr) || 0) + (Number(r.receivedStr) || 0) > r.qty
  }

  const hasErrors = rows.some(rowError)
  const activeSlots = unitSlots.filter(s => !s.skipped)

  async function save() {
    if (hasErrors) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${base}/api/order-supplier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          order_id: order.id,
          items: rows.map(r => ({
            id:             r.id,
            qty_shipped:    Number(r.shippedStr)  || 0,
            qty_in_customs: Number(r.customsStr)  || 0,
            qty_received:   Number(r.receivedStr) || 0,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onSaved()
      // Re-fetch to get updated units_registered counts and recompute slots
      const fresh = await fetchData(order.id)
      const freshItems = fresh.items || []
      setRows(freshItems.map(mapToRow))
      setEvents(fresh.events || [])
      const newSlots = buildUnitSlots(freshItems)
      setUnitSlots(newSlots)
      if (newSlots.length === 0) onClose()
    } catch (e: any) {
      setError(e.message || t('suppliers.stagesSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function registerUnits() {
    setRegisteringSaving(true)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      for (const slot of activeSlots) {
        const res = await fetch(`${base}/api/inventory-units`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            product_id:        slot.product_id,
            supplier_order_id: order.id,
            serial_number:     slot.serial.trim()    || null,
            condition:         slot.condition.trim() || null,
            acquired_at:       today,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
      }
      // Re-fetch — if all registered, slots become empty and modal closes
      const fresh = await fetchData(order.id)
      const freshItems = fresh.items || []
      setRows(freshItems.map(mapToRow))
      setEvents(fresh.events || [])
      const newSlots = buildUnitSlots(freshItems)
      setUnitSlots(newSlots)
      if (newSlots.length === 0) onClose()
    } catch (e: any) {
      setError(e.message || t('suppliers.unitRegError'))
    } finally {
      setRegisteringSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: 64, textAlign: 'right', padding: '3px 6px',
    border: '1px solid var(--border)', borderRadius: 4,
  }
  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 6px', borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('suppliers.stagesModalTitle')} #${order?.order_no}`}>
      {loading ? (
        <div className="helper" style={{ textAlign: 'center', padding: 24 }}>{t('loading')}</div>
      ) : (
        <>
          {/* ── Stage editing table ── */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('suppliers.stagesModalHint')}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>{t('product')}</th>
                  <th style={thStyle}>{t('suppliers.stageOrdered')}</th>
                  <th style={thStyle}>{t('suppliers.stagePending')}</th>
                  <th style={thStyle}>{t('suppliers.stageShipped')}</th>
                  <th style={thStyle}>{t('suppliers.stageInCustoms')}</th>
                  <th style={thStyle}>{t('suppliers.stageReceived')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const err = rowError(r)
                  const errBorder = err ? 'var(--error, #dc2626)' : undefined
                  return (
                    <tr key={r.id} style={{ background: err ? 'var(--error-bg, #fef2f2)' : undefined }}>
                      <td style={{ ...tdStyle, paddingLeft: 0, fontWeight: 500 }}>{r.product_name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtQty(r.qty)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        {fmtQty(pendingFor(r))}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                          value={r.shippedStr}
                          onChange={e => update(idx, 'shippedStr', e.target.value)}
                          style={{ ...inputStyle, borderColor: errBorder }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                          value={r.customsStr}
                          onChange={e => update(idx, 'customsStr', e.target.value)}
                          style={{ ...inputStyle, borderColor: errBorder }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                          value={r.receivedStr}
                          onChange={e => update(idx, 'receivedStr', e.target.value)}
                          style={{ ...inputStyle, borderColor: errBorder }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {hasErrors && (
            <div style={{ color: 'var(--error, #dc2626)', fontSize: 12, marginTop: 8 }}>
              {t('suppliers.stagesExceedsQty')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="primary" onClick={save} disabled={saving || hasErrors}>
              {saving ? t('saving') : t('save')}
            </button>
            <button onClick={onClose} disabled={saving || registeringSaving}>{t('cancel')}</button>
          </div>

          {/* ── Unit registration ── */}
          {unitSlots.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 20 }} />
              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                }}>
                  {t('suppliers.unitRegTitle')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  {t('suppliers.unitRegHint')}
                </div>

                {unitSlots.reduce((acc: React.ReactElement[], slot, i) => {
                  // Product header when product changes
                  if (i === 0 || slot.product_id !== unitSlots[i - 1].product_id) {
                    acc.push(
                      <div key={`hdr-${slot.product_id}-${i}`} style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, marginTop: i > 0 ? 12 : 0 }}>
                        {slot.product_name}
                      </div>
                    )
                  }
                  acc.push(
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', opacity: slot.skipped ? 0.4 : 1 }}>
                      <input
                        placeholder={t('suppliers.unitRegSerial')}
                        value={slot.serial}
                        disabled={slot.skipped || registeringSaving}
                        onChange={e => updateSlot(i, 'serial', e.target.value)}
                        style={{ flex: 2, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
                      />
                      <select
                        value={slot.condition}
                        disabled={slot.skipped || registeringSaving}
                        onChange={e => updateSlot(i, 'condition', e.target.value)}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
                      >
                        <option value="">{t('suppliers.unitRegCondition')}</option>
                        {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        onClick={() => updateSlot(i, 'skipped', !slot.skipped)}
                        disabled={registeringSaving}
                        style={{ fontSize: 11, padding: '3px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                      >
                        {slot.skipped ? t('suppliers.unitRegUnskip') : t('suppliers.unitRegSkip')}
                      </button>
                    </div>
                  )
                  return acc
                }, [])}

                {error && (
                  <div style={{ color: 'var(--error, #dc2626)', fontSize: 12, marginTop: 4 }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className="primary"
                    onClick={registerUnits}
                    disabled={registeringSaving || activeSlots.length === 0}
                  >
                    {registeringSaving ? t('suppliers.unitRegSaving') : t('suppliers.unitRegSave', { n: activeSlots.length })}
                  </button>
                  <button onClick={onClose} disabled={registeringSaving}>
                    {t('suppliers.unitRegSkipAll')}
                  </button>
                </div>
              </div>
            </>
          )}

          {!unitSlots.length && error && (
            <div style={{ color: 'var(--error, #dc2626)', fontSize: 12, marginTop: 8 }}>{error}</div>
          )}

          {/* ── Stage history ── */}
          {events.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 20 }} />
              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                }}>
                  {t('suppliers.stageHistory')}
                </div>
                {events.map(ev => {
                  const meta = STAGE_META[ev.stage]
                  const stageLabel = t(`suppliers.stage${ev.stage === 'in_customs' ? 'InCustoms' : ev.stage === 'received' ? 'Received' : 'Shipped'}`)
                  const deltaPositive = Number(ev.qty_delta) >= 0
                  return (
                    <div
                      key={ev.id}
                      style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr auto', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}
                    >
                      <span className="helper">{formatDate(ev.event_date)}</span>
                      <span style={{ color: meta.color, fontWeight: 500 }}>{meta.icon} {stageLabel}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                        {ev.product_name}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 600, color: deltaPositive ? '#10b981' : '#ef4444' }}>
                        {deltaPositive ? `+${ev.qty_delta}` : String(ev.qty_delta)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
