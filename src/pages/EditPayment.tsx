// src/pages/EditPayment.tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { 
  fetchBootstrap, 
  PAYMENT_TYPES, 
  PARTNER_PAYMENT_TYPES, 
  SUPPLIER_PAYMENT_TYPES,
  type PaymentType, 
  type PartnerPaymentType,
  type SupplierPaymentType,
  getAuthHeaders 
} from '../lib/api'
import { todayYMD } from '../lib/time'

type CustomerLite = { id: string; name: string }
type PartnerLite = { id: string; name: string }
type SupplierLite = { id: string; name: string }

export default function EditPayment() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const paymentTypeParam = searchParams.get('type')
  const isPartnerPayment = paymentTypeParam === 'partner'
  const isSupplierPayment = paymentTypeParam === 'supplier'

  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [partners, setPartners] = useState<PartnerLite[]>([])
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form fields
  const [entityId, setEntityId] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType | PartnerPaymentType | SupplierPaymentType>('Cash payment')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState<string>(todayYMD())
  const [notes, setNotes] = useState('')

  // Load payment data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        
        // Load bootstrap data
        const { customers: bootCustomers, partners: bootPartners, suppliers: bootSuppliers } = await fetchBootstrap()
        setCustomers(bootCustomers as unknown as CustomerLite[])
        setPartners(bootPartners ?? [])
        setSuppliers(bootSuppliers ?? [])

        // Fetch payment details
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        let endpoint = 'payment'
        if (isPartnerPayment) endpoint = 'partner-payment'
        if (isSupplierPayment) endpoint = 'supplier-payment'
        
        const res = await fetch(`${base}/api/${endpoint}?id=${paymentId}`, {
          headers: getAuthHeaders(),
        })
        if (!res.ok) throw new Error('Failed to load payment')
        
        const data = await res.json()
        const payment = data.payment

        // Populate form
        if (isPartnerPayment) {
          setEntityId(payment.partner_id)
        } else if (isSupplierPayment) {
          setEntityId(payment.supplier_id)
        } else {
          setEntityId(payment.customer_id)
        }
        
        setPaymentType(payment.payment_type)
        setAmountStr(String(payment.amount))
        setDate(payment.payment_date)
        setNotes(payment.notes || '')
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [paymentId, isPartnerPayment, isSupplierPayment])

  // ---------- Minus handling (Loan/Deposit & Add to debt) ----------
  const requiresMinus = useMemo(() => {
    const t = String(paymentType || '').trim().toLowerCase()
    if (isPartnerPayment || isSupplierPayment) {
      return t === 'add to debt'
    }
    return t === 'loan/deposit' || t === 'repayment'
  }, [paymentType, isPartnerPayment, isSupplierPayment])

  // Ensure minus is present/removed when type toggles
  useEffect(() => {
    setAmountStr(prev => {
      const curr = prev ?? ''
      if (requiresMinus) {
        const cleaned = curr.replace(/^-+/, '')
        const next = '-' + cleaned
        return next === '-' ? '-' : next
      } else {
        return curr.replace(/^-+/, '')
      }
    })
  }, [requiresMinus])

  // Keep caret after the leading '-'
  function keepCaretAfterMinus(input: HTMLInputElement | null) {
    if (!input || !requiresMinus) return
    if (input.value.startsWith('-')) {
      const s = input.selectionStart ?? 0
      const e = input.selectionEnd ?? 0
      if (s < 1 || e < 1) {
        const pos = Math.max(1, s, e)
        input.setSelectionRange(pos, pos)
      }
    }
  }

  const onAmountKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!requiresMinus) return
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
    if (requiresMinus) {
      const withoutSigns = raw.replace(/^[+-]+/, '')
      const v = '-' + withoutSigns
      setAmountStr(v === '-' ? '-' : v)
    } else {
      setAmountStr(raw)
    }
  }

  const onAmountSelect: React.ReactEventHandler<HTMLInputElement> = (e) => {
    if (!requiresMinus) return
    keepCaretAfterMinus(e.currentTarget)
  }

  const onAmountFocusOrClick: React.MouseEventHandler<HTMLInputElement> & React.FocusEventHandler<HTMLInputElement> = (e: any) => {
    if (!requiresMinus) return
    requestAnimationFrame(() => keepCaretAfterMinus(e.currentTarget))
  }

  const isMinusOnly = requiresMinus && amountStr.trim() === '-'

  async function save() {
    const amountNum = Number((amountStr || '').replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert('Enter a valid non-zero amount')
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      let endpoint = 'payment'
      let body: any = {
        id: paymentId,
        payment_type: paymentType,
        amount: amountNum,
        payment_date: date,
        notes: notes.trim() || null
      }

      if (isPartnerPayment) {
        endpoint = 'partner-payment'
        body.partner_id = entityId
      } else if (isSupplierPayment) {
        endpoint = 'supplier-payment'
        body.supplier_id = entityId
      } else {
        body.customer_id = entityId
      }

      const res = await fetch(`${base}/api/${endpoint}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      })

      if (!res.ok) throw new Error('Failed to update payment')
      
      alert('Payment updated!')
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function deletePayment() {
    if (!confirm('Delete this payment? This cannot be undone.')) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      let endpoint = 'payment'
      if (isPartnerPayment) endpoint = 'partner-payment'
      if (isSupplierPayment) endpoint = 'supplier-payment'
      
      const res = await fetch(`${base}/api/${endpoint}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: paymentId })
      })

      if (!res.ok) throw new Error('Failed to delete payment')
      
      alert('Payment deleted')
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>

  const CONTROL_H = 44
  let paymentTypes, entityList, entityLabel
  
  if (isPartnerPayment) {
    paymentTypes = PARTNER_PAYMENT_TYPES
    entityList = partners
    entityLabel = 'Partner'
  } else if (isSupplierPayment) {
    paymentTypes = SUPPLIER_PAYMENT_TYPES
    entityList = suppliers
    entityLabel = 'Supplier'
  } else {
    paymentTypes = PAYMENT_TYPES
    entityList = customers
    entityLabel = 'Customer'
  }

  return (
    <div className="card" style={{maxWidth:720}}>
      <h3>Edit Payment</h3>

      <div className="row row-2col-mobile" style={{marginTop:12}}>
        <div>
          <label>{entityLabel}</label>
          <select value={entityId} onChange={e=>setEntityId(e.target.value)} style={{ height: CONTROL_H }}>
            {entityList.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
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
          <select value={paymentType} onChange={e=>setPaymentType(e.target.value as any)} style={{ height: CONTROL_H }}>
            {paymentTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
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
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>Save changes</button>
        <button onClick={() => navigate(-1)} style={{ height: CONTROL_H }}>Cancel</button>
        <button
          onClick={deletePayment}
          style={{ 
            height: CONTROL_H, 
            marginLeft: 'auto',
            backgroundColor: 'salmon',
            color: 'white',
            border: 'none'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
