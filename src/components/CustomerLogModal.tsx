// src/components/CustomerLogModal.tsx
// Chronological activity log for a customer: orders, payments, and notes.
// Notes can be added at the top or between any two records.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import OrderDetailModal from './OrderDetailModal'
import PaymentDetailModal from './PaymentDetailModal'
import { formatDate } from '../lib/time'

interface LogItem {
  id: string
  kind: 'order' | 'payment' | 'note'
  date: string
  // order fields
  order_number?: string
  status?: string
  total_amount?: number
  // payment fields
  amount?: number
  payment_type?: string
  payment_notes?: string
  // note fields
  note_text?: string
  created_by?: string
}

async function fetchLog(customerId: string): Promise<LogItem[]> {
  const res = await fetch(`/.netlify/functions/customer-log?customer_id=${customerId}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.items as LogItem[]
}

async function postNote(customerId: string, noteText: string): Promise<LogItem> {
  const res = await fetch('/.netlify/functions/customer-log', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, note_text: noteText }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.item as LogItem
}

function NoteInput({ onSave }: { onSave: (text: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onSave(trimmed)
      setText('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t('customerLog.notePlaceholder')}
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="primary" onClick={handleSave} disabled={saving || !text.trim()} style={{ height: 30, padding: '0 14px', fontSize: 12 }}>
          {saving ? t('saving') : t('customerLog.saveNote')}
        </button>
      </div>
    </div>
  )
}

function InlineNoteAdder({ onSave }: { onSave: (text: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onSave(trimmed)
      setText('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: 2 }}>
      {!open ? (
        <div
          onClick={() => setOpen(true)}
          style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '4px 0', textAlign: 'center', opacity: 0.6 }}
        >
          + {t('customerLog.addNoteHere')}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface-alt, var(--surface))', marginBottom: 6 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('customerLog.notePlaceholder')}
            rows={2}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', resize: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={() => { setOpen(false); setText('') }} style={{ height: 26, padding: '0 10px', fontSize: 11 }}>
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

function LogItemCard({ item, onOrderClick, onPaymentClick }: {
  item: LogItem
  onOrderClick: (order: any) => void
  onPaymentClick: (payment: any) => void
}) {
  const { t } = useTranslation()

  if (item.kind === 'note') {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-alt, var(--surface))' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
          {t('customerLog.note')} · {formatDate(item.date)}{item.created_by ? ` · ${item.created_by}` : ''}
        </div>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.note_text}</div>
      </div>
    )
  }

  if (item.kind === 'order') {
    return (
      <div
        onClick={() => onOrderClick(item)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t('customerLog.order')} · {formatDate(item.date)}</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {item.order_number ? `#${item.order_number}` : t('customerLog.orderNoNumber')}
            {item.status && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{item.status}</span>}
          </div>
        </div>
        {item.total_amount != null && (
          <div style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{item.total_amount.toFixed(2)}</div>
        )}
      </div>
    )
  }

  if (item.kind === 'payment') {
    return (
      <div
        onClick={() => onPaymentClick(item)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t('customerLog.payment')} · {formatDate(item.date)}</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {item.payment_type && <span style={{ marginRight: 6 }}>{item.payment_type}</span>}
            {item.payment_notes && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.payment_notes}</span>}
          </div>
        </div>
        {item.amount != null && (
          <div style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{item.amount.toFixed(2)}</div>
        )}
      </div>
    )
  }

  return null
}

export default function CustomerLogModal({
  isOpen,
  onClose,
  customerId,
  customerName,
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
    setLoading(true)
    setErr(null)
    fetchLog(customerId)
      .then(setItems)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [isOpen, customerId])

  async function handleSaveNote(noteText: string) {
    const newItem = await postNote(customerId, noteText)
    setItems(prev => {
      const merged = [...prev, newItem].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      return merged
    })
  }

  function handleOrderClick(order: any) {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  function handlePaymentClick(payment: any) {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000 }}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 'min(520px, 95vw)', maxHeight: '85vh',
        background: 'var(--surface)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{t('customerLog.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{customerName}</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
          {/* Top note input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('customerLog.addNote')}</div>
            <NoteInput onSave={handleSaveNote} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 12 }} />

          {loading && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>{t('loading')}</div>}
          {err && <div style={{ fontSize: 13, color: 'var(--color-error)', padding: '12px 0' }}>{err}</div>}
          {!loading && !err && items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>{t('customerLog.empty')}</div>
          )}

          {!loading && !err && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {items.map((item) => (
                <div key={item.id}>
                  <div style={{ marginBottom: 6 }}>
                    <LogItemCard item={item} onOrderClick={handleOrderClick} onPaymentClick={handlePaymentClick} />
                  </div>
                  <InlineNoteAdder onSave={handleSaveNote} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <OrderDetailModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />
      <PaymentDetailModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        payment={selectedPayment}
        isPartnerPayment={false}
      />
    </>
  )
}
