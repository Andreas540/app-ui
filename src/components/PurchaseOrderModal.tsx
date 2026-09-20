// src/components/PurchaseOrderModal.tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import SupplierOrderDetailModal from './SupplierOrderDetailModal'
import { DateInput } from './DateInput'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { buildGroupOptions } from '../lib/productOptions'
import { formatDate, todayYMD } from '../lib/time'
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

type POItem = {
  id: string
  product_id: string | null
  product_name: string | null
  variant: string | null
  variant_2: string | null
  qty: number | null
  unit_price: number | null
  item_total: number | null
  consumed: number
}

type LinkedOrder = {
  id: string
  order_no: string
  order_date: string | null
  delivered: boolean
  in_customs: boolean
  received: boolean
  total: number
  paid_amount: number
  products: string | null
}

type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string | null
  issue_date: string
  exp_date: string | null
  notes: string | null
  total_amount: number | null
  remaining_amount: number | null
  doc_name: string | null
  items: POItem[]
  linked_orders: LinkedOrder[]
}

export default function PurchaseOrderModal({ isOpen, onClose, supplierId, supplierName, onSaved }: PurchaseOrderModalProps) {
  const { t } = useTranslation()
  const { fmtMoney, fmtNumber, parseAmount } = useCurrency()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tab
  const [tab, setTab] = useState<'new' | 'existing'>('new')

  // New PO form state
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

  // Existing POs state
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [posLoading, setPosLoading] = useState(false)
  const [posErr, setPosErr] = useState<string | null>(null)
  const fetchedRef = useRef(false)
  const [includeCompleted, setIncludeCompleted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Order modal state (stacked on top at zIndex 1050)
  const [modalOrder, setModalOrder] = useState<any | null>(null)
  const [modalSupplierName, setModalSupplierName] = useState('')
  const [modalLoadingId, setModalLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetchBootstrap().then(({ products: all }) => {
      setProducts(all.filter(p =>
        (p.category ?? 'product') === 'product' && p.product_kind !== 'addon'
      ))
    }).catch(() => {})
  }, [isOpen])

  // Lazy-fetch existing POs when tab switches to 'existing'
  useEffect(() => {
    if (tab !== 'existing' || !isOpen || fetchedRef.current) return
    fetchedRef.current = true
    setPosLoading(true)
    setPosErr(null)
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    fetch(`${base}/.netlify/functions/purchase-orders?supplier_id=${supplierId}`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setPos(d?.purchase_orders ?? []))
      .catch(() => setPosErr('Failed to load purchase orders'))
      .finally(() => setPosLoading(false))
  }, [tab, isOpen, supplierId])

  function reset() {
    setTab('new')
    setPoNumber('')
    setIssueDate(todayYMD())
    setExpDate('')
    setNotes('')
    setMode('breakdown')
    setTotalOnlyStr('')
    setLines([blankLine()])
    setDocData(null)
    setDocName(null)
    fetchedRef.current = false
    setPos([])
    setExpandedId(null)
    setIncludeCompleted(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
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

  async function openOrderModal(orderId: string, sName: string) {
    setModalLoadingId(orderId)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order-supplier?id=${orderId}`, {
        cache: 'no-store',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const itemsWithTotals = (data.items ?? []).map((i: any) => ({
        ...i,
        shipping_total: Number(i.qty ?? 0) * Number(i.shipping_cost ?? 0),
      }))
      const total = itemsWithTotals.reduce((s: number, i: any) => s + Number(i.qty ?? 0) * Number(i.product_cost ?? 0), 0)
      setModalOrder({ ...data.order, items: itemsWithTotals, total, paid_amount: data.order?.paid_amount ?? 0 })
      setModalSupplierName(sName)
    } catch {
      alert('Failed to load order')
    } finally {
      setModalLoadingId(null)
    }
  }

  const today = todayYMD()

  const filteredPos = pos.filter(po => {
    if (includeCompleted) return true
    const isCompleted = po.remaining_amount != null && po.remaining_amount <= 0
    const isExpired = po.exp_date != null && po.exp_date < today
    return !isCompleted && !isExpired
  })

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

  const remainingColor = (remaining: number | null, total: number | null) => {
    if (remaining == null || total == null || total === 0) return undefined
    const pct = remaining / total
    if (pct <= 0) return 'var(--color-error)'
    if (pct < 0.2) return 'var(--color-warning, #f59e0b)'
    return 'var(--color-success)'
  }

  function productLabel(item: POItem) {
    return [item.product_name, item.variant, item.variant_2].filter(Boolean).join(' · ') || '—'
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title={`Purchase Orders — ${supplierName}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tab toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
            {segBtn('New', tab === 'new', () => setTab('new'))}
            {segBtn('Existing', tab === 'existing', () => setTab('existing'))}
          </div>

          {/* ── New PO form ── */}
          {tab === 'new' && (
            <>
              {/* PO number + dates */}
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
                <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <button onClick={() => fileInputRef.current?.click()} style={{ height: CONTROL_H, padding: '0 14px', fontSize: 13 }}>
                    {docName ? 'Replace file' : 'Choose file'}
                  </button>
                  {docName && (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{docName}</span>
                      <button
                        onClick={() => { setDocData(null); setDocName(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 0, flexShrink: 0 }}
                      >
                        ✕ Remove
                      </button>
                    </>
                  )}
                </div>
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
                <button onClick={handleClose} style={{ height: CONTROL_H }}>{t('cancel')}</button>
              </div>
            </>
          )}

          {/* ── Existing POs ── */}
          {tab === 'existing' && (
            <div>
              {/* Include completed/expired checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={e => setIncludeCompleted(e.target.checked)}
                />
                Include Completed/Expired
              </label>

              {posLoading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('loading')}</p>}
              {posErr && <p style={{ fontSize: 13, color: 'var(--color-error)' }}>{posErr}</p>}

              {!posLoading && !posErr && filteredPos.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {pos.length === 0 ? 'No purchase orders for this supplier yet.' : 'No active purchase orders. Check "Include Completed/Expired" to see all.'}
                </p>
              )}

              {!posLoading && filteredPos.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px 6px 0' }}>PO #</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px 6px' }}>Issue date</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px 6px' }}>Expiry</th>
                        <th style={{ textAlign: 'right', padding: '4px 0 6px 8px' }}>Total</th>
                        <th style={{ textAlign: 'right', padding: '4px 0 6px 8px' }}>Remaining</th>
                        <th style={{ width: 20 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPos.map(po => {
                        const isExpanded = expandedId === po.id
                        return (
                          <>
                            <tr
                              key={po.id}
                              onClick={() => setExpandedId(isExpanded ? null : po.id)}
                              style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
                            >
                              <td style={{ padding: '7px 8px 7px 0', fontWeight: 600 }}>{po.po_number}</td>
                              <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatDate(po.issue_date)}</td>
                              <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>
                                {po.exp_date ? formatDate(po.exp_date) : '—'}
                              </td>
                              <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {po.total_amount != null ? fmtMoney(po.total_amount) : '—'}
                              </td>
                              <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: remainingColor(po.remaining_amount, po.total_amount) }}>
                                {po.remaining_amount != null ? fmtMoney(po.remaining_amount) : '—'}
                              </td>
                              <td style={{ padding: '7px 0 7px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 11 }}>
                                {isExpanded ? '▲' : '▼'}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr key={`${po.id}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={6} style={{ padding: '0 0 10px 0' }}>
                                  <div style={{ background: 'var(--surface-subtle, var(--bg-subtle, #f8f8f8))', borderRadius: 6, padding: '10px 12px', marginTop: 4 }}>

                                    {/* Meta */}
                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: po.items.length > 0 ? 10 : 0 }}>
                                      {po.notes && (
                                        <div style={{ fontSize: 12 }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>Notes: </span>
                                          {po.notes}
                                        </div>
                                      )}
                                      {po.doc_name && (
                                        <div style={{ fontSize: 12 }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>Document: </span>
                                          {po.doc_name}
                                        </div>
                                      )}
                                    </div>

                                    {/* Line items */}
                                    {po.items.length > 0 && (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            <th style={{ textAlign: 'left', padding: '2px 8px 4px 0' }}>Product</th>
                                            <th style={{ textAlign: 'right', padding: '2px 8px 4px' }}>Qty</th>
                                            <th style={{ textAlign: 'right', padding: '2px 8px 4px' }}>Unit price</th>
                                            <th style={{ textAlign: 'right', padding: '2px 8px 4px' }}>Total</th>
                                            <th style={{ textAlign: 'right', padding: '2px 0 4px 8px' }}>Remaining</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {po.items.map(item => {
                                            const itemRemaining = item.item_total != null
                                              ? item.item_total - (item.consumed ?? 0) : null
                                            return (
                                              <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: '4px 8px 4px 0' }}>{productLabel(item)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {item.qty != null ? fmtNumber(item.qty) : '—'}
                                                </td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {item.unit_price != null ? fmtMoney(item.unit_price) : '—'}
                                                </td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {item.item_total != null ? fmtMoney(item.item_total) : '—'}
                                                </td>
                                                <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: remainingColor(itemRemaining, item.item_total) }}>
                                                  {itemRemaining != null ? fmtMoney(itemRemaining) : '—'}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    )}

                                    {po.items.length === 0 && (
                                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total only — no product breakdown.</div>
                                    )}

                                    {/* Linked supplier orders */}
                                    {po.linked_orders?.length > 0 && (
                                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          Supplier Orders
                                        </div>
                                        {po.linked_orders.map(so => {
                                          const status = so.received ? 'Received' : so.in_customs ? 'In customs' : so.delivered ? 'Shipped' : 'Pending'
                                          const statusColor = so.received ? 'var(--color-success)' : so.in_customs ? 'var(--color-warning, #f59e0b)' : so.delivered ? 'var(--primary)' : 'var(--text-secondary)'
                                          const isLoading = modalLoadingId === so.id
                                          return (
                                            <div key={so.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                                <button
                                                  onClick={() => openOrderModal(so.id, supplierName)}
                                                  disabled={isLoading}
                                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: 12 }}
                                                >
                                                  {isLoading ? '…' : `#${so.order_no}`}
                                                </button>
                                                {so.order_date && <span style={{ color: 'var(--text-secondary)' }}>{formatDate(so.order_date)}</span>}
                                                <span style={{ color: statusColor }}>{status}</span>
                                                {so.total > 0 && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(so.total)}</span>}
                                                {so.paid_amount > 0 && (
                                                  <span style={{ color: so.paid_amount >= so.total ? 'var(--color-success)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {so.paid_amount >= so.total ? 'Paid' : `${fmtMoney(so.paid_amount)} paid`}
                                                  </span>
                                                )}
                                              </div>
                                              {so.products && (
                                                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                                                  {so.products}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Stacked order modal — higher z-index so it renders on top of the PO modal */}
      <SupplierOrderDetailModal
        isOpen={!!modalOrder}
        onClose={() => setModalOrder(null)}
        order={modalOrder}
        supplierName={modalSupplierName}
        zIndex={1050}
      />
    </>
  )
}
