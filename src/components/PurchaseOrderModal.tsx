// src/components/PurchaseOrderModal.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { DateInput } from './DateInput'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { buildGroupOptions, optLabel } from '../lib/productOptions'
import { todayYMD } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'

interface PurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  supplierId: string
  supplierName: string
  onSaved: () => void
}

type LineItem = {
  product_id: string
  qty: string
  unit_price: string
}

function blankLine(): LineItem {
  return { product_id: '', qty: '', unit_price: '' }
}

export default function PurchaseOrderModal({ isOpen, onClose, supplierId, supplierName, onSaved }: PurchaseOrderModalProps) {
  const { t } = useTranslation()
  const { fmtMoney, parseAmount } = useCurrency()

  const [poNumber, setPoNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayYMD())
  const [expDate, setExpDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([blankLine()])
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => {
    if (!isOpen) return
    fetchBootstrap().then(({ products: all }) => {
      const filtered = all.filter(p =>
        (p.category ?? 'product') === 'product' &&
        p.product_kind !== 'addon'
      )
      setProducts(filtered)
    }).catch(() => {})
  }, [isOpen])

  function reset() {
    setPoNumber('')
    setIssueDate(todayYMD())
    setExpDate('')
    setNotes('')
    setLines([blankLine()])
  }

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function addLine() {
    setLines(prev => [...prev, blankLine()])
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  const lineTotal = (l: LineItem) => {
    const q = parseAmount(l.qty)
    const p = parseAmount(l.unit_price)
    return Number.isFinite(q) && Number.isFinite(p) ? q * p : null
  }

  const grandTotal = lines.reduce((sum, l) => {
    const t = lineTotal(l)
    return t != null ? sum + t : sum
  }, 0)

  const hasLines = lines.some(l => l.product_id || l.qty || l.unit_price)

  async function save() {
    if (!poNumber.trim()) { alert('PO number is required'); return }
    if (!issueDate) { alert('Issue date is required'); return }

    const validLines = lines.filter(l => l.qty && l.unit_price)

    setSaving(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/.netlify/functions/purchase-orders`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          po_number: poNumber.trim(),
          issue_date: issueDate,
          exp_date: expDate || null,
          notes: notes.trim() || null,
          total_amount: hasLines ? grandTotal : null,
          items: validLines.map(l => ({
            product_id: l.product_id || null,
            qty: parseAmount(l.qty),
            unit_price: parseAmount(l.unit_price),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to save PO (${res.status})`)
      reset()
      onSaved()
      onClose()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const CONTROL_H = 40

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`New Purchase Order — ${supplierName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* PO number + dates */}
        <div className="row row-2col-mobile" style={{ gap: 10 }}>
          <div>
            <label>PO Number</label>
            <input
              type="text"
              placeholder="e.g. PO-2026-001"
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
          <div>
            <label>Issue Date</label>
            <DateInput value={issueDate} onChange={setIssueDate} style={{ height: CONTROL_H }} />
          </div>
        </div>

        <div style={{ maxWidth: 260 }}>
          <label>Expiry Date <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>(optional)</span></label>
          <DateInput value={expDate} onChange={setExpDate} style={{ height: CONTROL_H }} />
        </div>

        {/* Line items */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Products</div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 90px 28px', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>
            <div>Product (optional)</div>
            <div style={{ textAlign: 'right' }}>Qty</div>
            <div style={{ textAlign: 'right' }}>Unit Price</div>
            <div style={{ textAlign: 'right' }}>Total</div>
            <div />
          </div>

          {lines.map((l, idx) => {
            const total = lineTotal(l)
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 90px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <select
                    value={l.product_id}
                    onChange={e => updateLine(idx, { product_id: e.target.value })}
                    style={{ height: CONTROL_H, width: '100%' }}
                  >
                    <option value="">— Any product —</option>
                    {buildGroupOptions(products)}
                  </select>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={l.qty}
                  onChange={e => updateLine(idx, { qty: e.target.value })}
                  style={{ height: CONTROL_H, textAlign: 'right' }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={l.unit_price}
                  onChange={e => updateLine(idx, { unit_price: e.target.value })}
                  style={{ height: CONTROL_H, textAlign: 'right' }}
                />
                <div style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: total != null ? 'var(--text)' : 'var(--text-secondary)' }}>
                  {total != null ? fmtMoney(total) : '—'}
                </div>
                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  style={{ height: CONTROL_H, padding: 0, background: 'none', border: 'none', cursor: lines.length === 1 ? 'default' : 'pointer', color: 'var(--color-error)', fontSize: 16, opacity: lines.length === 1 ? 0.3 : 1 }}
                >
                  ✕
                </button>
              </div>
            )
          })}

          <button onClick={addLine} style={{ fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', marginTop: 2 }}>
            + Add line
          </button>
        </div>

        {/* Grand total */}
        {hasLines && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Total: {fmtMoney(grandTotal)}</span>
          </div>
        )}

        {/* Notes */}
        <div>
          <label>{t('notesOptional')}</label>
          <input
            type="text"
            placeholder="Internal notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="primary" onClick={save} disabled={saving} style={{ height: CONTROL_H }}>
            {saving ? t('saving') : t('save')}
          </button>
          <button onClick={onClose} style={{ height: CONTROL_H }}>{t('cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
