// src/pages/Payments.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { fetchBootstrap, PAYMENT_TYPES, PARTNER_PAYMENT_TYPES, type PaymentType, type PartnerPaymentType, createPayment, createPartnerPayment } from '../lib/api'
import { todayYMD } from '../lib/time'

type CustomerLite = { id: string; name: string; customer_type?: 'BLV' | 'Partner' }
type PartnerLite = { id: string; name: string }

export default function Payments() {
  const navigate = useNavigate()
  const location = useLocation()

  const [people, setPeople] = useState<CustomerLite[]>([])
  const [partners, setPartners] = useState<PartnerLite[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Payment direction
  const [isFromCustomer, setIsFromCustomer] = useState(true)

  // form - customer payments
  const [entityId, setEntityId] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash payment')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState<string>(todayYMD())
  const [notes, setNotes] = useState('')

  // form - partner payments
  const [partnerId, setPartnerId] = useState('')
  const [partnerPaymentType, setPartnerPaymentType] = useState<PartnerPaymentType>('Cash')
  const [partnerAmountStr, setPartnerAmountStr] = useState('')
  const [partnerDate, setPartnerDate] = useState<string>(todayYMD())
  const [partnerNotes, setPartnerNotes] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers, partners: bootPartners } = await fetchBootstrap()
        setPeople(customers as unknown as CustomerLite[])
        setPartners(bootPartners ?? [])
        
        // Preselect customer if coming from detail page
        const params = new URLSearchParams(location.search)
        const preselectedCustomerId = params.get('customer_id')
        if (preselectedCustomerId) {
          setEntityId(preselectedCustomerId)
          setIsFromCustomer(true)
        } else {
          setEntityId((customers[0]?.id as string) ?? '')
        }
        if (bootPartners && bootPartners.length > 0) {
          setPartnerId(bootPartners[0].id)
        }
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [location.search])

  const customer = useMemo(() => people.find(p => p.id === entityId), [people, entityId])
  const partner = useMemo(() => partners.find(p => p.id === partnerId), [partners, partnerId])

  // ---- Minus handling helpers (keep caret to the right of '-') ----
  function keepCaretAfterMinus(input: HTMLInputElement | null) {
    if (!input) return
    if (input.value.startsWith('-')) {
      const s = input.selectionStart ?? 0
      const e = input.selectionEnd ?? 0
      if (s < 1 || e < 1) {
        const pos = Math.max(1, s, e)
        input.setSelectionRange(pos, pos)
      }
    }
  }

  // --- Customer side: Loan/Deposit & Repayment (same minus behavior) ---
  const isCustomerMinusType = useMemo(() => {
    const t = (paymentType || '').trim().toLowerCase()
    return t === 'loan/deposit' || t === 'repayment'
  }, [paymentType])

  // Show "-" immediately when selecting minus-type; remove when switching away
  useEffect(() => {
    if (isCustomerMinusType) {
      setAmountStr(prev => {
        const cleaned = (prev ?? '').replace(/^-+/, '')
        const next = '-' + cleaned
        return next === '-' ? '-' : next
      })
    } else {
      setAmountStr(prev => (prev ?? '').replace(/^-+/, ''))
    }
  }, [isCustomerMinusType])

  // Prevent deleting the leading "-" when minus-type is selected
  const onAmountKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isCustomerMinusType) return
    const target = e.currentTarget
    const { selectionStart, selectionEnd, value } = target
    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) {
      e.preventDefault(); return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) {
      e.preventDefault(); return
    }
  }
  const onAmountChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value
    if (isCustomerMinusType) {
      const withoutSigns = raw.replace(/^[+-]+/, '')
      const v = '-' + withoutSigns
      setAmountStr(v === '-' ? '-' : v)
    } else {
      setAmountStr(raw)
    }
  }
  const onAmountSelect: React.ReactEventHandler<HTMLInputElement> = (e) => {
    if (!isCustomerMinusType) return
    keepCaretAfterMinus(e.currentTarget)
  }
  const onAmountFocusOrClick: React.MouseEventHandler<HTMLInputElement> & React.FocusEventHandler<HTMLInputElement> = (e: any) => {
    if (!isCustomerMinusType) return
    requestAnimationFrame(() => keepCaretAfterMinus(e.currentTarget))
  }
  const isMinusOnly = isCustomerMinusType && amountStr.trim() === '-'

  // --- Partner side: Add to debt (same minus behavior) ---
  const isAddToDebt = useMemo(
    () => (partnerPaymentType || '').trim().toLowerCase() === 'add to debt',
    [partnerPaymentType]
  )

  useEffect(() => {
    if (isAddToDebt) {
      setPartnerAmountStr(prev => {
        const cleaned = (prev ?? '').replace(/^-+/, '')
        const next = '-' + cleaned
        return next === '-' ? '-' : next
      })
    } else {
      setPartnerAmountStr(prev => (prev ?? '').replace(/^-+/, ''))
    }
  }, [isAddToDebt])

  const onPartnerAmountKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isAddToDebt) return
    const target = e.currentTarget
    const { selectionStart, selectionEnd, value } = target
    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) {
      e.preventDefault(); return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) {
      e.preventDefault(); return
    }
  }
  const onPartnerAmountChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value
    if (isAddToDebt) {
      const withoutSigns = raw.replace(/^[+-]+/, '')
      const v = '-' + withoutSigns
      setPartnerAmountStr(v === '-' ? '-' : v)
    } else {
      setPartnerAmountStr(raw)
    }
  }
  const onPartnerAmountSelect: React.ReactEventHandler<HTMLInputElement> = (e) => {
    if (!isAddToDebt) return
    keepCaretAfterMinus(e.currentTarget)
  }
  const onPartnerAmountFocusOrClick: React.MouseEventHandler<HTMLInputElement> & React.FocusEventHandler<HTMLInputElement> = (e: any) => {
    if (!isAddToDebt) return
    requestAnimationFrame(() => keepCaretAfterMinus(e.currentTarget))
  }
  const isPartnerMinusOnly = isAddToDebt && partnerAmountStr.trim() === '-'

  // --- Save handlers ---
  async function saveCustomerPayment() {
    if (!customer) { alert('Select a customer'); return }
    const amountNum = Number((amountStr || '').replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert('Enter a non-zero amount (use negative for credits if desired)')
      return
    }
    try {
      await createPayment({
        customer_id: customer.id,
        payment_type: paymentType,
        amount: amountNum,
        payment_date: date,
        notes: notes.trim() || null,
      })
      alert('Payment saved!')
      const params = new URLSearchParams(location.search)
      const returnTo = params.get('return_to')
      const returnId = params.get('return_id')
      if (returnTo === 'customer' && returnId) {
        navigate(`/customers/${returnId}`)
        return
      }
      setAmountStr('')
      setPaymentType('Cash payment')
      setNotes('')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function savePartnerPayment() {
    if (!partner) { alert('Select a partner'); return }
    const amountNum = Number((partnerAmountStr || '').replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert('Enter a non-zero amount')
      return
    }
    try {
      await createPartnerPayment({
        partner_id: partner.id,
        payment_type: partnerPaymentType,
        amount: amountNum,
        payment_date: partnerDate,
        notes: partnerNotes.trim() || null,
      })
      alert('Partner payment saved!')
      setPartnerAmountStr('')
      setPartnerPaymentType('Cash')
      setPartnerNotes('')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!people.length) return <div className="card"><p>No customers found.</p></div>

  const CONTROL_H = 44
  const blv = people.filter(p => p.customer_type === 'BLV')
  const viaPartner = people.filter(p => p.customer_type === 'Partner')
  const hasCustomerType = blv.length + viaPartner.length > 0

  return (
    <div className="card" style={{maxWidth:720}}>
      {/* Payment direction checkboxes */}
      <div style={{ display:'flex', gap:24, marginBottom:16 }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input
            type="checkbox"
            checked={isFromCustomer}
            onChange={e => { if (e.target.checked) setIsFromCustomer(true) }}
            style={{ width: 18, height: 18 }}
          />
        <span>From customer</span>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input
            type="checkbox"
            checked={!isFromCustomer}
            onChange={e => { if (e.target.checked) setIsFromCustomer(false) }}
            style={{ width: 18, height: 18 }}
          />
          <span>To partner</span>
        </label>
      </div>

      {isFromCustomer ? (
        <>
          <h3>Payments</h3>
          
          <div className="row row-2col-mobile" style={{marginTop:12}}>
            <div>
              <label>Customer</label>
              <select value={entityId} onChange={e=>setEntityId(e.target.value)} style={{ height: CONTROL_H }}>
                {hasCustomerType ? (
                  <>
                    <optgroup label="BLV customers">
                      {blv.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                    <optgroup label="Customer via Partner">
                      {viaPartner.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  </>
                ) : (
                  people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                )}
              </select>
            </div>
            <div>
              <label>Payment date</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ height: CONTROL_H }} />
            </div>
          </div>

          <div className="row row-2col-mobile" style={{marginTop:12}}>
            <div>
              <label>Payment Type</label>
              <select
                value={paymentType}
                onChange={e=>setPaymentType(e.target.value as PaymentType)}
                style={{ height: CONTROL_H }}
              >
                {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label>Amount (USD)</label>
              <input
                type="text"
                placeholder="0.00"
                inputMode="decimal"
                value={amountStr}
                onChange={onAmountChange}
                onKeyDown={onAmountKeyDown}
                onSelect={onAmountSelect}
                onFocus={onAmountFocusOrClick}
                onClick={onAmountFocusOrClick}
                style={{
                  height: CONTROL_H,
                  color: isMinusOnly ? 'var(--text-secondary)' : undefined,
                  opacity: isMinusOnly ? 0.6 : undefined,
                }}
              />
            </div>
          </div>

          <div className="row" style={{marginTop:12}}>
            <div style={{gridColumn:'1 / -1'}}>
              <label>Notes (optional)</label>
              <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} style={{ height: CONTROL_H }} />
            </div>
          </div>

          <div style={{marginTop:16, display:'flex', gap:8}}>
            <button className="primary" onClick={saveCustomerPayment} style={{ height: CONTROL_H }}>Save payment</button>
            <button onClick={()=>{ setAmountStr(''); setPaymentType('Cash payment'); setNotes(''); }} style={{ height: CONTROL_H }}>Clear</button>
          </div>

          <p className="helper" style={{marginTop:12}}>
            Positive = money received; negative = credit/discount/fee if you choose to represent it that way.
          </p>
        </>
      ) : (
        <>
          <h3>Payment to Partner</h3>

          {partners.length === 0 ? (
            <p className="helper" style={{marginTop:12}}>No partners found. Create partners first.</p>
          ) : (
            <>
              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>Partner</label>
                  <select value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{ height: CONTROL_H }}>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Payment date</label>
                  <input type="date" value={partnerDate} onChange={e=>setPartnerDate(e.target.value)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>Payment Type</label>
                  <select value={partnerPaymentType} onChange={e=>setPartnerPaymentType(e.target.value as PartnerPaymentType)} style={{ height: CONTROL_H }}>
                    {PARTNER_PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label>Amount (USD)</label>
                  <input
                    type="text"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={partnerAmountStr}
                    onChange={onPartnerAmountChange}
                    onKeyDown={onPartnerAmountKeyDown}
                    onSelect={onPartnerAmountSelect}
                    onFocus={onPartnerAmountFocusOrClick}
                    onClick={onPartnerAmountFocusOrClick}
                    style={{
                      height: CONTROL_H,
                      color: isPartnerMinusOnly ? 'var(--text-secondary)' : undefined,
                      opacity: isPartnerMinusOnly ? 0.6 : undefined,
                    }}
                  />
                </div>
              </div>

              <div className="row" style={{marginTop:12}}>
                <div style={{gridColumn:'1 / -1'}}>
                  <label>Notes (optional)</label>
                  <input type="text" value={partnerNotes} onChange={e=>setPartnerNotes(e.target.value)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              <div style={{marginTop:16, display:'flex', gap:8}}>
                <button className="primary" onClick={savePartnerPayment} style={{ height: CONTROL_H }}>Save payment</button>
                <button onClick={()=>{ setPartnerAmountStr(''); setPartnerPaymentType('Cash'); setPartnerNotes(''); }} style={{ height: CONTROL_H }}>Clear</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}








