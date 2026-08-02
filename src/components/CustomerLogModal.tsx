// src/components/CustomerLogModal.tsx
// Chronological activity log: orders + payments merged by date, notes anchored
// to a specific order/payment by after_item_id so they stay in place.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import Modal from './Modal'
import OrderDetailModal from './OrderDetailModal'
import PaymentDetailModal from './PaymentDetailModal'
import { formatDate } from '../lib/time'

interface LogItem {
  id: string
  kind: 'order' | 'payment' | 'note'
  date: string
  // order
  order_no?: number
  delivered_at?: string | null
  total_amount?: number
  product_name?: string
  notes?: string
  // payment
  amount?: number
  payment_type?: string
  payment_notes?: string
  payment_date?: string
  order_id?: string
  // note
  note_text?: string
  created_by?: string
  after_item_id?: string | null
}

async function fetchLog(customerId: string): Promise<LogItem[]> {
  const res = await fetch(`/.netlify/functions/customer-log?customer_id=${customerId}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()).items as LogItem[]
}

async function deleteNote(noteId: string): Promise<void> {
  const res = await fetch(`/.netlify/functions/customer-log?id=${noteId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function postNote(
  customerId: string,
  noteText: string,
  afterItemId: string | null,
): Promise<LogItem> {
  const res = await fetch('/.netlify/functions/customer-log', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, note_text: noteText, after_item_id: afterItemId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()).item as LogItem
}

// Scan backwards from idx to find the nearest non-note item (order or payment).
// That is the anchor for any note added after position idx.
function findAnchorId(items: LogItem[], afterIdx: number): string | null {
  for (let i = afterIdx; i >= 0; i--) {
    if (items[i].kind !== 'note') return items[i].id
  }
  return null
}

// ── NoteInput ──────────────────────────────────────────────────────────────────

function NoteInput({ onSave }: { onSave: (text: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true); setErr(null)
    try { await onSave(trimmed); setText('') }
    catch (e: any) { setErr(e.message ?? 'Error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t('customerLog.notePlaceholder')}
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }}
      />
      {err && <div style={{ fontSize: 12, color: 'var(--color-error)' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="primary" onClick={handleSave} disabled={saving || !text.trim()} style={{ height: 30, padding: '0 14px', fontSize: 12 }}>
          {saving ? t('saving') : t('customerLog.saveNote')}
        </button>
      </div>
    </div>
  )
}

// ── InlineNoteAdder ────────────────────────────────────────────────────────────

function InlineNoteAdder({ onSave }: { onSave: (text: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true); setErr(null)
    try { await onSave(trimmed); setText(''); setOpen(false) }
    catch (e: any) { setErr(e.message ?? 'Error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '2px 0' }}>
      {!open ? (
        <div onClick={() => setOpen(true)}
          style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '2px 0', textAlign: 'center', opacity: 0.5 }}>
          + {t('customerLog.addNoteHere')}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg)', marginBottom: 2 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('customerLog.notePlaceholder')}
            rows={2}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', resize: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }}
          />
          {err && <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={() => { setOpen(false); setText(''); setErr(null) }} style={{ height: 26, padding: '0 10px', fontSize: 11 }}>
              {t('cancel')}
            </button>
            <button className="primary" onClick={handleSave} disabled={saving || !text.trim()} style={{ height: 26, padding: '0 10px', fontSize: 11 }}>
              {saving ? t('saving') : t('customerLog.saveNote')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LogItemCard ────────────────────────────────────────────────────────────────

function LogItemCard({ item, onOrderClick, onPaymentClick, onDeleteNote }: {
  item: LogItem
  onOrderClick: (order: any) => void
  onPaymentClick: (payment: any) => void
  onDeleteNote: (id: string) => void
}) {
  const { t } = useTranslation()

  if (item.kind === 'note') {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg)', position: 'relative' }}>
        <button
          onClick={() => onDeleteNote(item.id)}
          title="Delete note"
          style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--muted)', lineHeight: 1, padding: '0 2px' }}
        >×</button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, paddingRight: 20 }}>
          {t('customerLog.note')} · {formatDate(item.date)}
          {item.created_by ? ` · ${item.created_by}` : ''}
        </div>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.note_text}</div>
      </div>
    )
  }

  if (item.kind === 'order') {
    return (
      <div onClick={() => onOrderClick(item)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              {t('customerLog.order')} · {formatDate(item.date)}
              {item.delivered_at && <span style={{ marginLeft: 6 }}>· {t('customerLog.delivered')}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {item.order_no != null ? `#${item.order_no}` : t('customerLog.orderNoNumber')}
              {item.product_name && <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--muted)' }}>{item.product_name}</span>}
            </div>
            {item.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{item.notes}</div>}
          </div>
          {item.total_amount != null && (
            <div style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{item.total_amount.toFixed(2)}</div>
          )}
        </div>
      </div>
    )
  }

  if (item.kind === 'payment') {
    return (
      <div onClick={() => onPaymentClick(item)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              {t('customerLog.payment')} · {formatDate(item.date)}
              {item.order_no != null && <span style={{ marginLeft: 6 }}>· {t('order')} #{item.order_no}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{item.payment_type ?? ''}</div>
            {item.payment_notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{item.payment_notes}</div>}
          </div>
          {item.amount != null && (
            <div style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{item.amount.toFixed(2)}</div>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ── CustomerLogModal ───────────────────────────────────────────────────────────

export default function CustomerLogModal({
  isOpen, onClose, customerId, customerName,
}: {
  isOpen: boolean
  onClose: () => void
  customerId: string
  customerName: string
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true); setErr(null)
    fetchLog(customerId)
      .then(setItems)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [isOpen, customerId])

  // Save a note and insert it at the correct local position.
  // afterItemId = null → top of list.
  // afterItemId = id  → right after that item (and after any notes already there).
  async function handleSaveNote(noteText: string, afterItemId: string | null) {
    const newItem = await postNote(customerId, noteText, afterItemId)
    setItems(prev => {
      if (afterItemId === null) {
        // Top note: prepend (newest first among top notes)
        return [newItem, ...prev]
      }
      // Find the anchor, then skip past any notes already after it
      const anchorIdx = prev.findIndex(it => it.id === afterItemId)
      if (anchorIdx === -1) return [...prev, newItem]
      let insertAt = anchorIdx + 1
      while (insertAt < prev.length && prev[insertAt].kind === 'note') insertAt++
      const next = [...prev]
      next.splice(insertAt, 0, newItem)
      return next
    })
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`${t('customerLog.title')} — ${customerName}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('customerLog.addNote')}
            </div>
            <NoteInput onSave={text => handleSaveNote(text, null)} />
          </div>

          <div style={{ borderTop: '1px solid var(--line)' }} />

          {loading && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>{t('loading')}</div>}
          {err && <div style={{ fontSize: 13, color: 'var(--color-error)' }}>{err}</div>}
          {!loading && !err && items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>{t('customerLog.empty')}</div>
          )}

          {!loading && !err && items.length > 0 && (
            <div>
              {items.map((item, idx) => {
                // The anchor for any note added after this item is the nearest
                // order or payment at or above this position (never a note).
                const anchorId = findAnchorId(items, idx)
                return (
                  <div key={item.id}>
                    <div style={{ marginBottom: 4 }}>
                      <LogItemCard
                        item={item}
                        onOrderClick={o => { setSelectedOrder(o); setShowOrderModal(true) }}
                        onPaymentClick={p => {
                          // PaymentDetailModal reads payment_date and notes; log item uses date and payment_notes
                          setSelectedPayment({ ...p, payment_date: p.date, notes: p.payment_notes })
                          setShowPaymentModal(true)
                        }}
                        onDeleteNote={async id => {
                          await deleteNote(id)
                          setItems(prev => prev.filter(it => it.id !== id))
                        }}
                      />
                    </div>
                    <InlineNoteAdder onSave={text => handleSaveNote(text, anchorId)} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      <OrderDetailModal isOpen={showOrderModal} onClose={() => setShowOrderModal(false)} order={selectedOrder} />
      <PaymentDetailModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} payment={selectedPayment} isPartnerPayment={false} />
    </>
  )
}
