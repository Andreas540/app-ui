// src/pages/ReturnsPage.tsx
// Return registration form, rendered as the "Return" tab inside /orders/new.
// Pre-fillable via URL params: ?tab=return&customer_id=X&order_id=Y

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders, listCustomersWithOwed } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'
import { todayYMD, formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'

type Reason         = 'changed_mind' | 'wrong_item' | 'defective' | 'damaged_delivery' | 'duplicate' | 'other' | ''
type Condition      = 'resellable' | 'damaged' | 'not_returned' | ''
type SettlementType = 'refund' | 'store_credit' | 'none' | ''

type OrderItem = {
  id: string
  product_name: string
  qty: number
  unit_price: number
}

type Order = {
  id: string
  order_no: number
  order_date: string
  total: number
  partner_amount: number
  items: OrderItem[]
}

type PartnerSplit = {
  partner_id: string
  partner_name: string
  amount: number
}

type CustomerRow = {
  id: string
  name: string
}

const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--separator)' }}>
    {children}
  </div>
)

const RadioRow = ({
  label, desc, name, value, checked, onChange,
}: { label: string; desc?: string; name: string; value: string; checked: boolean; onChange: () => void }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange}
      style={{ marginTop: 3, flexShrink: 0 }} />
    <span>
      <span style={{ fontWeight: checked ? 600 : 400 }}>{label}</span>
      {desc && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{desc}</span>}
    </span>
  </label>
)

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 6,
  background: 'var(--input-bg)', color: 'var(--text)', fontSize: 14,
  width: '100%', boxSizing: 'border-box',
}

const sectionStyle: React.CSSProperties = { marginBottom: 20 }

export default function ReturnsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { timezone } = useLocale()
  const { fmtMoney } = useCurrency()

  const params = new URLSearchParams(location.search)
  const preCustomerId = params.get('customer_id') || ''
  const preOrderId    = params.get('order_id')    || ''

  // ── Customer ─────────────────────────────────────────────────────────────
  const [custSearch,  setCustSearch]  = useState('')
  const [custResults, setCustResults] = useState<CustomerRow[]>([])
  const [customer,    setCustomer]    = useState<CustomerRow | null>(null)
  const [custLoading, setCustLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Orders ────────────────────────────────────────────────────────────────
  const [orders,        setOrders]        = useState<Order[]>([])
  const [orderId,       setOrderId]       = useState(preOrderId)
  const [ordersLoading, setOrdersLoading] = useState(false)

  // ── Items ─────────────────────────────────────────────────────────────────
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})

  // ── Partners ──────────────────────────────────────────────────────────────
  const [partnerSplits,      setPartnerSplits]      = useState<PartnerSplit[]>([])
  const [reversePartner,     setReversePartner]      = useState<Record<string, boolean>>({})
  const [partnerReverseAmts, setPartnerReverseAmts]  = useState<Record<string, string>>({})

  // ── Return details ────────────────────────────────────────────────────────
  const [returnDate,    setReturnDate]    = useState(todayYMD(timezone))
  const [reason,        setReason]        = useState<Reason>('')
  const [reasonNotes,   setReasonNotes]   = useState('')
  const [condition,     setCondition]     = useState<Condition>('')
  const [supplierFault, setSupplierFault] = useState(false)

  // ── Settlement ────────────────────────────────────────────────────────────
  const [settlementType,   setSettlementType]   = useState<SettlementType>('')
  const [settlementAmount, setSettlementAmount] = useState('')
  const [settlementDate,   setSettlementDate]   = useState(todayYMD(timezone))

  // ── Submission ────────────────────────────────────────────────────────────
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err,        setErr]        = useState<string | null>(null)
  const [successId,  setSuccessId]  = useState<string | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedOrder = useMemo(
    () => orders.find(o => o.id === orderId) ?? null,
    [orders, orderId],
  )

  const suggestedAmount = useMemo(() => {
    if (!selectedOrder) return 0
    return selectedOrder.items.reduce((sum, item) => {
      const q = returnQtys[item.id] ?? 0
      return sum + q * Number(item.unit_price)
    }, 0)
  }, [selectedOrder, returnQtys])

  const hasAnyQty = Object.values(returnQtys).some(q => q > 0)

  // ── Pre-fill from URL params ──────────────────────────────────────────────
  useEffect(() => {
    if (!preCustomerId) return
    fetch(`${base}/api/customer?id=${preCustomerId}`, { cache: 'no-store', headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.customer) {
          setCustomer({ id: d.customer.id, name: d.customer.name })
          setOrders(d.orders ?? [])
          if (preOrderId) setOrderId(preOrderId)
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Customer search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (customer || !custSearch.trim()) { setCustResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setCustLoading(true)
      try {
        const { customers } = await listCustomersWithOwed(custSearch)
        setCustResults(customers.slice(0, 8))
      } catch {}
      setCustLoading(false)
    }, 300)
  }, [custSearch, customer])

  async function selectCustomer(c: CustomerRow) {
    setCustomer(c)
    setCustSearch('')
    setCustResults([])
    setOrders([])
    setOrderId('')
    setReturnQtys({})
    setOrdersLoading(true)
    try {
      const res = await fetch(`${base}/api/customer?id=${c.id}`, { cache: 'no-store', headers: getAuthHeaders() })
      const d = await res.json()
      setOrders(d.orders ?? [])
    } catch {}
    setOrdersLoading(false)
  }

  // ── Load partner splits when order changes; reset downstream fields ──────
  useEffect(() => {
    setPartnerSplits([])
    setReversePartner({})
    setPartnerReverseAmts({})
    setReturnQtys({})
    setReason('')
    setReasonNotes('')
    setCondition('')
    setSupplierFault(false)
    setSettlementType('')
    setSettlementAmount('')
    if (!orderId) return
    fetch(`${base}/api/order?id=${orderId}`, { cache: 'no-store', headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.partner_splits?.length) setPartnerSplits(d.partner_splits) })
      .catch(() => {})
  }, [orderId])

  // ── Auto-fill settlement amount when type chosen ──────────────────────────
  useEffect(() => {
    if (settlementType !== 'none' && settlementType !== '' && settlementAmount === '') {
      setSettlementAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '')
    }
  }, [settlementType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Suggest partner reversal proportional to returned items ───────────────
  useEffect(() => {
    if (!partnerSplits.length || !selectedOrder) return
    const ratio = Math.min(suggestedAmount / (Number(selectedOrder.total) || 1), 1)
    const amts: Record<string, string> = {}
    for (const ps of partnerSplits) {
      amts[ps.partner_id] = (Number(ps.amount) * ratio).toFixed(2)
    }
    setPartnerReverseAmts(amts)
  }, [suggestedAmount, partnerSplits, selectedOrder])

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer || !orderId || !reason || !condition || !settlementType) return
    if (!hasAnyQty) { setErr('Select at least one item with a return quantity.'); return }

    setErr(null)
    setSubmitting(true)

    const items = (selectedOrder?.items ?? [])
      .filter(i => (returnQtys[i.id] ?? 0) > 0)
      .map(i => ({
        order_item_id: i.id,
        product_id:    null,
        qty_returned:  returnQtys[i.id],
        unit_price:    Number(i.unit_price),
      }))

    const partner_adjustments = partnerSplits
      .filter(ps => reversePartner[ps.partner_id])
      .map(ps => ({
        partner_id:      ps.partner_id,
        amount_reversed: Number(partnerReverseAmts[ps.partner_id] ?? 0),
      }))

    try {
      const res = await fetch(`${base}/api/returns`, {
        method:  'POST',
        headers: { 'content-type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          customer_id:       customer.id,
          order_id:          orderId,
          return_date:       returnDate,
          reason,
          reason_notes:      reason === 'other' ? reasonNotes : null,
          condition,
          restock_requested: false,
          supplier_fault:    supplierFault,
          settlement_type:   settlementType,
          settlement_amount: settlementType === 'none' ? 0 : Number(settlementAmount) || 0,
          settlement_date:   settlementType === 'none' ? null : settlementDate,
          notes:             notes || null,
          items,
          partner_adjustments,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Failed to save return'); setSubmitting(false); return }
      setSuccessId(d.id)
    } catch (ex: any) {
      setErr(ex?.message ?? 'Network error')
    }
    setSubmitting(false)
  }

  function resetForm() {
    setSuccessId(null)
    setOrderId(''); setReturnQtys({})
    setReason(''); setCondition(''); setSettlementType('')
    setSettlementAmount(''); setNotes(''); setSupplierFault(false)
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (successId) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12, color: 'var(--color-success, #10b981)' }}>✓</div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--color-success, #10b981)' }}>Return registered</h3>
        <p className="helper" style={{ marginBottom: 24 }}>
          Saved and the customer balance updated.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {customer && (
            <button className="primary" onClick={() => navigate(`/customers/${customer.id}`)}>
              Go to {customer.name}
            </button>
          )}
          <button onClick={resetForm}>
            Register another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>

      {/* ── 1. Customer ── */}
      <div className="card" style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px' }}>Register New Return</h3>
        <SectionHeading>Customer</SectionHeading>
        {customer ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontWeight: 600 }}>{customer.name}</span>
            {!preCustomerId && (
              <button type="button" className="helper" onClick={() => { setCustomer(null); setOrders([]); setOrderId('') }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                Change
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              style={inputStyle}
              placeholder="Search customer by name…"
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              autoFocus
            />
            {custLoading && <p className="helper" style={{ marginTop: 6 }}>Searching…</p>}
            {custResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 4,
              }}>
                {custResults.map(c => (
                  <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. Order ── */}
      {customer && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Order</SectionHeading>
          {ordersLoading ? (
            <p className="helper">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="helper">No orders found for this customer.</p>
          ) : (
            <select value={orderId} onChange={e => setOrderId(e.target.value)} style={inputStyle} required>
              <option value="">Select an order…</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  #{o.order_no} — {formatDate(o.order_date)} — {fmtMoney(o.total)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── 3. Items ── */}
      {selectedOrder && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Items to return</SectionHeading>
          <div style={{ display: 'grid', gap: 10 }}>
            {selectedOrder.items.map(item => {
              const qty = returnQtys[item.id] ?? 0
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                    <div className="helper">{fmtMoney(item.unit_price)} × {item.qty} ordered</div>
                  </div>
                  <span className="helper" style={{ whiteSpace: 'nowrap' }}>Return qty</span>
                  <input
                    type="number" min={0} max={item.qty} step="0.01"
                    value={qty === 0 ? '' : qty} placeholder="0"
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      setReturnQtys(prev => ({ ...prev, [item.id]: isNaN(v) ? 0 : Math.min(v, item.qty) }))
                    }}
                    style={{ ...inputStyle, width: 80 }}
                  />
                </div>
              )
            })}
          </div>
          {hasAnyQty && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--separator)', display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">Return value</span>
              <span style={{ fontWeight: 600 }}>{fmtMoney(suggestedAmount)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Return details ── */}
      {selectedOrder && hasAnyQty && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Return details</SectionHeading>

          <div style={{ marginBottom: 16 }}>
            <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Return date</label>
            <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
              style={{ ...inputStyle, width: 180 }} required />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="helper" style={{ marginBottom: 6 }}>Reason</div>
            {([
              ['changed_mind',     'Changed mind / no longer needed'],
              ['wrong_item',       'Wrong item received'],
              ['defective',        'Defective / not working'],
              ['damaged_delivery', 'Damaged in delivery'],
              ['duplicate',        'Duplicate order'],
              ['other',            'Other'],
            ] as [Reason, string][]).map(([val, label]) => (
              <RadioRow key={val} name="reason" value={val} label={label}
                checked={reason === val} onChange={() => setReason(val)} />
            ))}
            {reason === 'other' && (
              <input style={{ ...inputStyle, marginTop: 8 }} placeholder="Please describe…"
                value={reasonNotes} onChange={e => setReasonNotes(e.target.value)} required />
            )}
          </div>

          <div>
            <div className="helper" style={{ marginBottom: 6 }}>Condition of returned goods</div>
            <RadioRow name="condition" value="resellable" label="Resellable"
              desc="Goods are in sellable condition and can go back to stock"
              checked={condition === 'resellable'} onChange={() => setCondition('resellable')} />
            <RadioRow name="condition" value="damaged" label="Damaged / not resellable"
              desc="Goods are damaged or written off"
              checked={condition === 'damaged'} onChange={() => setCondition('damaged')} />
            <RadioRow name="condition" value="not_returned" label="Not returned physically"
              desc="Customer keeps the item (e.g. goodwill refund on defective)"
              checked={condition === 'not_returned'} onChange={() => setCondition('not_returned')} />
          </div>
        </div>
      )}

      {/* ── 5. Inventory (greyed out / coming soon) ── */}
      {condition === 'resellable' && (
        <div className="card" style={{ ...sectionStyle, opacity: 0.5 }}>
          <SectionHeading>Inventory</SectionHeading>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'not-allowed' }}>
            <input type="checkbox" disabled />
            <span>
              Restock to inventory
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
                Automatic inventory restocking — coming soon
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── 6. Supplier fault ── */}
      {(reason === 'defective' || reason === 'damaged_delivery') && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Supplier</SectionHeading>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={supplierFault}
              onChange={e => setSupplierFault(e.target.checked)} />
            <span>
              Mark as supplier defect
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
                Tags this return for a future supplier claim — no action taken now
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── 7. Financial settlement ── */}
      {condition !== '' && reason !== '' && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Financial settlement</SectionHeading>
          <RadioRow name="settlement" value="refund" label="Refund"
            desc="Return money to the customer (cash, transfer, etc.)"
            checked={settlementType === 'refund'} onChange={() => setSettlementType('refund')} />
          <RadioRow name="settlement" value="store_credit" label="Store credit"
            desc="Credit the customer's account — reduces their balance on future orders"
            checked={settlementType === 'store_credit'} onChange={() => setSettlementType('store_credit')} />
          <RadioRow name="settlement" value="none" label="No financial settlement"
            desc="Return accepted with no money back (warranty replacement, policy decision, etc.)"
            checked={settlementType === 'none'} onChange={() => setSettlementType('none')} />

          {settlementType !== '' && settlementType !== 'none' && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>
                  Amount {settlementType === 'store_credit' ? '(store credit)' : '(refund)'}
                </label>
                <input type="number" min={0} step="0.01" value={settlementAmount}
                  onChange={e => setSettlementAmount(e.target.value)}
                  placeholder={suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '0.00'}
                  style={inputStyle} required />
              </div>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={settlementDate}
                  onChange={e => setSettlementDate(e.target.value)} style={inputStyle} required />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 8. Partner share reversal ── */}
      {partnerSplits.length > 0 && settlementType !== '' && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Partner share</SectionHeading>
          <p className="helper" style={{ marginBottom: 12 }}>
            This order had partner splits. Choose whether to reverse each partner's share for the returned items.
          </p>
          {partnerSplits.map(ps => (
            <div key={ps.partner_id} style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 6 }}>
                <input type="checkbox" checked={!!reversePartner[ps.partner_id]}
                  onChange={e => setReversePartner(prev => ({ ...prev, [ps.partner_id]: e.target.checked }))} />
                <span>
                  Reverse {ps.partner_name}'s share
                  <span className="helper" style={{ marginLeft: 8 }}>(original: {fmtMoney(ps.amount)})</span>
                </span>
              </label>
              {reversePartner[ps.partner_id] && (
                <div style={{ paddingLeft: 26 }}>
                  <input type="number" min={0} step="0.01"
                    value={partnerReverseAmts[ps.partner_id] ?? ''}
                    onChange={e => setPartnerReverseAmts(prev => ({ ...prev, [ps.partner_id]: e.target.value }))}
                    style={{ ...inputStyle, width: 140 }} placeholder="Amount reversed" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 9. Notes ── */}
      {settlementType !== '' && (
        <div className="card" style={sectionStyle}>
          <SectionHeading>Notes</SectionHeading>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any additional information…" rows={3}
            style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical' }} />
        </div>
      )}

      {/* ── Error + Submit ── */}
      {err && <p style={{ color: 'var(--color-error)', marginBottom: 12 }}>{err}</p>}

      {settlementType !== '' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={submitting || !customer || !orderId || !reason || !condition || !hasAnyQty}
            style={{
              height: 40, padding: '0 24px', borderRadius: 6, border: 'none',
              background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 14,
              cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving…' : 'Register return'}
          </button>
          <button type="button" onClick={resetForm}
            style={{ height: 40, padding: '0 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>
            {t('clear')}
          </button>
        </div>
      )}

    </form>
  )
}
