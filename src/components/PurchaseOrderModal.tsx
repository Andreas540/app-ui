// src/components/PurchaseOrderModal.tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { DateInput } from './DateInput'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { buildGroupOptions } from '../lib/productOptions'
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

type Mode = 'breakdown' | 'total_only'

export default function PurchaseOrderModal({ isOpen, onClose, supplierId, supplierName, onSaved }: PurchaseOrderModalProps) {
  const { t } = useTranslation()
  const { fmtMoney, parseAmount } = useCurrency()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [poNumber, setPoNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayYMD())
  const [expDate, setExpDate] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<Mode>('breakdown')
  const [totalOnlyStr, setTotalOnlyStr] = useState('')
  const [lines, setLines] = useState<LineItem[]>([blankLine()])
  const [docData, setDocData] = useState<string | null>(null)
  const [docName, setDocName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => {
    if (!isOpen) return
    fetchBootstrap().then(({ products: all }) => {
      setProducts(all.filter(p =>
        (p.category ?? 'product') === 'product' && p.product_kind !== 'addon'
      ))
    }).catch(() => {})
  }, [isOpen])

  function reset() {
    setPoNumber('')
    setIssueDate(todayYMD())
    setExpDate('')
    setNotes('')
    setMode('breakdown')
    setTotalOnlyStr('')
    setLines([blankLine()])
    setDocData(null)
    setDocName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const lineTotal = (l: LineItem) => {
    const q = parseAmount(l.qty)
    const p = parseAmount(l.unit_price)
    return q > 0 && p > 0 ? q * p : null
  }

  const breakdownTotal = lines.reduce((sum, l) => {
    const t = lineTotal(l)
    return t != null ? sum + t : sum
  }, 0)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setDocData(ev.target?.result as string)
      setDocName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!poNumber.trim()) { alert('PO number is required'); return }
    if (!issueDate) { alert('Issue date is required'); return }
    if (mode === 'total_only' && !parseAmount(totalOnlyStr)) { alert('Total amount is required'); return }

    const validLines = mode === 'breakdown' ? lines.filter(l => l.qty && l.unit_price) : []
    const totalAmount = mode === 'total_only' ? parseAmount(totalOnlyStr) : breakdownTotal

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
          total_amount: totalAmount || null,
          doc_data: docData || null,
          doc_name: docName || null,
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
  const segBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '4px 14px',
        fontSize: 13,
        border: 'none',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : undefined,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`New Purchase Order — ${supplierName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* PO number + dates — 3 columns on desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
          <div>
            <label>Expiry Date <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>(optional)</span></label>
            <DateInput value={expDate} onChange={setExpDate} style={{ height: CONTROL_H }} />
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Products</label>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 12 }}>
            {segBtn('Product breakdown', mode === 'breakdown', () => setMode('breakdown'))}
            {segBtn('Total only', mode === 'total_only', () => setMode('total_only'))}
          </div>

          {mode === 'total_only' ? (
            <div style={{ maxWidth: 200 }}>
              <label>Total Amount</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={totalOnlyStr}
                onChange={e => setTotalOnlyStr(e.target.value)}
                style={{ height: CONTROL_H, textAlign: 'right' }}
              />
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 72px 100px 90px 28px', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>
                <div>Product (optional)</div>
                <div style={{ textAlign: 'right' }}>Qty</div>
                <div style={{ textAlign: 'right' }}>Unit Price</div>
                <div style={{ textAlign: 'right' }}>Total</div>
                <div />
              </div>

              {lines.map((l, idx) => {
                const total = lineTotal(l)
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 72px 100px 90px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
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
                      onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1}
                      style={{ height: CONTROL_H, padding: 0, background: 'none', border: 'none', cursor: lines.length === 1 ? 'default' : 'pointer', color: 'var(--color-error)', fontSize: 16, opacity: lines.length === 1 ? 0.3 : 1 }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button onClick={() => setLines(prev => [...prev, blankLine()])} style={{ fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)' }}>
                  + Add line
                </button>
                {breakdownTotal > 0 && (
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Total: {fmtMoney(breakdownTotal)}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Document upload */}
        <div>
          <label>Attach Document <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>(optional)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              style={{ fontSize: 13 }}
            />
            {docName && (
              <button
                onClick={() => { setDocData(null); setDocName(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 0 }}
              >
                ✕ Remove
              </button>
            )}
          </div>
          {docName && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{docName}</div>}
        </div>

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={save} disabled={saving} style={{ height: CONTROL_H }}>
            {saving ? t('saving') : t('save')}
          </button>
          <button onClick={onClose} style={{ height: CONTROL_H }}>{t('cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
