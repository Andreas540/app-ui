// src/pages/Payments.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DateInput } from '../components/DateInput'
import {
  fetchBootstrap,
  getAuthHeaders,
  PAYMENT_TYPES,
  PAYMENT_TYPES_COP,
  PARTNER_PAYMENT_TYPES,
  PARTNER_PAYMENT_TYPES_COP,
  SUPPLIER_PAYMENT_TYPES,
  SUPPLIER_PAYMENT_TYPES_COP,
  type PaymentType,
  type PartnerPaymentType,
  type SupplierPaymentType,
  createPayment,
  createPartnerPayment,
  createSupplierPayment
} from '../lib/api'
import { todayYMD } from '../lib/time'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { useLocale } from '../contexts/LocaleContext'

type CustomerLite = { id: string; name: string; customer_type?: 'BLV' | 'Direct' | 'Partner' }
type PartnerLite = { id: string; name: string }
type SupplierLite = { id: string; name: string }

export default function Payments() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const { currency } = useLocale()
  const isCOP = currency === 'COP'

  const activePaymentTypes = useMemo(
    () => isCOP ? PAYMENT_TYPES_COP : PAYMENT_TYPES,
    [isCOP]
  )
  const activePartnerPaymentTypes = useMemo(
    () => isCOP ? PARTNER_PAYMENT_TYPES_COP : PARTNER_PAYMENT_TYPES,
    [isCOP]
  )
  const activeSupplierPaymentTypes = useMemo(
    () => isCOP ? SUPPLIER_PAYMENT_TYPES_COP : SUPPLIER_PAYMENT_TYPES,
    [isCOP]
  )

  const [people, setPeople] = useState<CustomerLite[]>([])
  const [partners, setPartners] = useState<PartnerLite[]>([])
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Payment direction: 'customer' | 'partner' | 'supplier'
  const [paymentDirection, setPaymentDirection] = useState<'customer' | 'partner' | 'supplier'>('customer')

  // form - customer payments
  const [entityId, setEntityId] = useState('')
  const [orders, setOrders] = useState<{ id: string; order_no: number; product_name: string; amount: number; balance: number }[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash payment')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState<string>(todayYMD())
  const [notes, setNotes] = useState('')
  // Partner selector shown only when PaymentType === "Partner credit"
  const [partnerForCreditId, setPartnerForCreditId] = useState('')

  // form - partner payments
  const [partnerId, setPartnerId] = useState('')
  const [partnerOrders, setPartnerOrders] = useState<{ id: string; order_no: number; product_name: string; amount: number; balance: number }[]>([])
  const [selectedPartnerOrderId, setSelectedPartnerOrderId] = useState('')
  const [partnerPaymentType, setPartnerPaymentType] = useState<PartnerPaymentType>('Cash')
  const [partnerAmountStr, setPartnerAmountStr] = useState('')
  const [partnerDate, setPartnerDate] = useState<string>(todayYMD())
  const [partnerNotes, setPartnerNotes] = useState('')

  // form - supplier payments
  const [supplierId, setSupplierId] = useState('')
  const [supplierOrders, setSupplierOrders] = useState<{ id: string; order_no: number; product_name: string; amount: number; balance: number }[]>([])
  const [selectedSupplierOrderId, setSelectedSupplierOrderId] = useState('')
  const [supplierPaymentType, setSupplierPaymentType] = useState<SupplierPaymentType>('Cash')
  const [supplierAmountStr, setSupplierAmountStr] = useState('')
  const [supplierDate, setSupplierDate] = useState<string>(todayYMD())
  const [supplierNotes, setSupplierNotes] = useState('')

  // Reset payment type defaults when currency changes
  useEffect(() => {
    setPaymentType(activePaymentTypes[0])
    setPartnerPaymentType(activePartnerPaymentTypes[0])
    setSupplierPaymentType(activeSupplierPaymentTypes[0])
  }, [currency]) // eslint-disable-line react-hooks/exhaustive-deps



useEffect(() => {
  (async () => {
    try {
      setLoading(true); setErr(null)
      const { customers, partners: bootPartners, suppliers: bootSuppliers } = await fetchBootstrap()
      setPeople(customers as unknown as CustomerLite[])
      setPartners(bootPartners ?? [])
      setSuppliers(bootSuppliers ?? [])
      
      // Check URL params for preselection
      const params = new URLSearchParams(location.search)
      const preselectedCustomerId = params.get('customer_id')
      const preselectedSupplierId = params.get('supplier_id')
      
      if (preselectedCustomerId) {
        setEntityId(preselectedCustomerId)
        setPaymentDirection('customer')
      } else if (preselectedSupplierId) {
        setSupplierId(preselectedSupplierId)
        setPaymentDirection('supplier')
      } else {
        setEntityId((customers[0]?.id as string) ?? '')
      }
      
      if (bootPartners && bootPartners.length > 0) {
        setPartnerId(bootPartners[0].id)
        setPartnerForCreditId(bootPartners[0].id)
      }
      if (bootSuppliers && bootSuppliers.length > 0) {
        if (!preselectedSupplierId) {
          setSupplierId(bootSuppliers[0].id)
        }
      }
    } catch (e:any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  })()
}, [location.search])

useEffect(() => {
    if (!entityId || !config.payments.showOrderSelection) {
      setOrders([])
      setSelectedOrderId('')
      return
    }
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/orders?customer_id=${entityId}`, { headers: getAuthHeaders() })
        if (!res.ok) return
        const data = await res.json()
        setOrders(data.orders || [])
        setSelectedOrderId('')
        setAmountStr('')
      } catch { /* silent */ }
    })()
  }, [entityId, config.payments.showOrderSelection])

  useEffect(() => {
    if (!partnerId || !config.payments.showOrderSelection) {
      setPartnerOrders([])
      setSelectedPartnerOrderId('')
      return
    }
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/orders?partner_id=${partnerId}`, { headers: getAuthHeaders() })
        if (!res.ok) return
        const data = await res.json()
        setPartnerOrders(data.orders || [])
        setSelectedPartnerOrderId('')
      } catch { /* silent */ }
    })()
  }, [partnerId, config.payments.showOrderSelection])

  useEffect(() => {
    if (!supplierId || !config.payments.showOrderSelection) {
      setSupplierOrders([])
      setSelectedSupplierOrderId('')
      return
    }
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/orders?supplier_id=${supplierId}`, { headers: getAuthHeaders() })
        if (!res.ok) return
        const data = await res.json()
        setSupplierOrders(data.orders || [])
        setSelectedSupplierOrderId('')
      } catch { /* silent */ }
    })()
  }, [supplierId, config.payments.showOrderSelection])

  const customer = useMemo(() => people.find(p => p.id === entityId), [people, entityId])
  const partner = useMemo(() => partners.find(p => p.id === partnerId), [partners, partnerId])
  const supplier = useMemo(() => suppliers.find(p => p.id === supplierId), [suppliers, supplierId])

  // Detect Partner credit (From customer flow)
  const isPartnerCredit = useMemo(
    () => (paymentType || '').trim().toLowerCase() === 'partner credit',
    [paymentType]
  )

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

  // --- Supplier side: Add to debt (same minus behavior) ---
  const isSupplierAddToDebt = useMemo(
    () => (supplierPaymentType || '').trim().toLowerCase() === 'add to debt',
    [supplierPaymentType]
  )

  useEffect(() => {
    if (isSupplierAddToDebt) {
      setSupplierAmountStr(prev => {
        const cleaned = (prev ?? '').replace(/^-+/, '')
        const next = '-' + cleaned
        return next === '-' ? '-' : next
      })
    } else {
      setSupplierAmountStr(prev => (prev ?? '').replace(/^-+/, ''))
    }
  }, [isSupplierAddToDebt])

  const onSupplierAmountKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isSupplierAddToDebt) return
    const target = e.currentTarget
    const { selectionStart, selectionEnd, value } = target
    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) {
      e.preventDefault(); return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) {
      e.preventDefault(); return
    }
  }
  const onSupplierAmountChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value
    if (isSupplierAddToDebt) {
      const withoutSigns = raw.replace(/^[+-]+/, '')
      const v = '-' + withoutSigns
      setSupplierAmountStr(v === '-' ? '-' : v)
    } else {
      setSupplierAmountStr(raw)
    }
  }
  const onSupplierAmountSelect: React.ReactEventHandler<HTMLInputElement> = (e) => {
    if (!isSupplierAddToDebt) return
    keepCaretAfterMinus(e.currentTarget)
  }
  const onSupplierAmountFocusOrClick: React.MouseEventHandler<HTMLInputElement> & React.FocusEventHandler<HTMLInputElement> = (e: any) => {
    if (!isSupplierAddToDebt) return
    requestAnimationFrame(() => keepCaretAfterMinus(e.currentTarget))
  }
  const isSupplierMinusOnly = isSupplierAddToDebt && supplierAmountStr.trim() === '-'

  // --- Save handlers ---
  async function saveCustomerPayment() {
    if (!customer) { alert(t('payments.alertSelectCustomer')); return }

    // Require partner selection when "Partner credit"
    if (isPartnerCredit) {
      if (!partnerForCreditId) {
        alert(t('payments.alertChoosePartner'))
        return
      }
    }

    const amountNum = Number((amountStr || '').replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert(t('payments.alertEnterAmount'))
      return
    }

    try {
      // 1) Save the customer payment
      await createPayment({
        customer_id: customer.id,
        payment_type: paymentType,
        amount: amountNum,
        payment_date: date,
        notes: notes.trim() || null,
        order_id: selectedOrderId || null,
      })

      // 2) If Partner credit, also save a partner payment (type Other, note prefixed)
      if (isPartnerCredit) {
        const partnerNote = `Partner credit${notes.trim() ? ` - ${notes.trim()}` : ''}`
        await createPartnerPayment({
          partner_id: partnerForCreditId,
          payment_type: 'Other' as PartnerPaymentType,
          amount: amountNum,
          payment_date: date,
          notes: partnerNote,
        })
      }

      alert(t('payments.saved'))
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
      setSelectedOrderId('')
      // Reset partner-for-credit to first partner for convenience
      if (partners.length) setPartnerForCreditId(partners[0].id)
    } catch (e:any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  async function savePartnerPayment() {
    if (!partner) { alert(t('payments.alertSelectPartner')); return }
    const amountNum = Number((partnerAmountStr || '').replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert(t('payments.alertEnterAmountSimple'))
      return
    }
    try {
      await createPartnerPayment({
        partner_id: partner.id,
        payment_type: partnerPaymentType,
        amount: amountNum,
        payment_date: partnerDate,
        notes: partnerNotes.trim() || null,
        order_id: selectedPartnerOrderId || null,
      })
      alert(t('payments.partnerSaved'))
      setPartnerAmountStr('')
      setPartnerPaymentType('Cash')
      setPartnerNotes('')
      setSelectedPartnerOrderId('')
    } catch (e:any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  async function saveSupplierPayment() {
  if (!supplier) { alert(t('payments.alertSelectSupplier')); return }
  const amountNum = Number((supplierAmountStr || '').replace(',', '.'))
  if (!Number.isFinite(amountNum) || amountNum === 0) {
    alert(t('payments.alertEnterAmountSimple'))
    return
  }
  try {
    await createSupplierPayment({
      supplier_id: supplier.id,
      payment_type: supplierPaymentType,
      amount: amountNum,
      payment_date: supplierDate,
      notes: supplierNotes.trim() || null,
      order_id: selectedSupplierOrderId || null,
    })
    alert(t('payments.supplierSaved'))
    
    // Check if we should return to supplier detail
    const params = new URLSearchParams(location.search)
    const returnTo = params.get('return_to')
    const returnId = params.get('return_id')
    if (returnTo === 'supplier' && returnId) {
      navigate(`/suppliers/${returnId}`)
      return
    }
    
    setSupplierAmountStr('')
    setSupplierPaymentType('Cash')
    setSupplierNotes('')
    setSelectedSupplierOrderId('')
  } catch (e:any) {
    alert(e?.message || t('payments.alertSaveFailed'))
  }
}

  if (loading) return <div className="card"><p>{t('loading')}</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>{t('error')} {err}</p></div>
  if (!people.length) return <div className="card"><p>{t('payments.noCustomersFound')}</p></div>

  const CONTROL_H = 44
  const directCustomers = people.filter(p => p.customer_type === 'BLV' || p.customer_type === 'Direct')
const viaPartner = people.filter(p => p.customer_type === 'Partner')
const hasCustomerType = directCustomers.length + viaPartner.length > 0

  return (
    <div className="card" style={{maxWidth:720}}>
      {/* Payment direction checkboxes */}
      <div style={{ display:'flex', gap:24, marginBottom:16 }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input
            type="checkbox"
            checked={paymentDirection === 'customer'}
            onChange={e => { if (e.target.checked) setPaymentDirection('customer') }}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('payments.fromCustomer')}</span>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input
            type="checkbox"
            checked={paymentDirection === 'partner'}
            onChange={e => { if (e.target.checked) setPaymentDirection('partner') }}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('payments.toPartner')}</span>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input
            type="checkbox"
            checked={paymentDirection === 'supplier'}
            onChange={e => { if (e.target.checked) setPaymentDirection('supplier') }}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('payments.toSupplier')}</span>
        </label>
      </div>

      {paymentDirection === 'customer' ? (
        <>
          <h3>{t('payments.title')}</h3>

          <div className="row row-2col-mobile" style={{marginTop:12}}>
            <div>
              <label>{t('customer')}</label>
              <select value={entityId} onChange={e=>setEntityId(e.target.value)} style={{ height: CONTROL_H }}>
                {hasCustomerType ? (
                  <>
                    <optgroup label={config.labels.directCustomerGroup}>
  {directCustomers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
</optgroup>
                    <optgroup label={t('payments.customerViaPartner')}>
                      {viaPartner.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  </>
                ) : (
                  people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                )}
              </select>
            </div>
            <div>
              <label>{t('payments.paymentDate')}</label>
              <DateInput value={date} onChange={v => setDate(v)} style={{ height: CONTROL_H }} />
            </div>
          </div>

          {config.payments.showOrderSelection && (
            <div className="row" style={{ marginTop: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>{t('payments.orderOptional')}</label>
                <select
                  value={selectedOrderId}
                  onChange={e => {
                    const orderId = e.target.value
                    setSelectedOrderId(orderId)
                    if (orderId) {
                      const order = orders.find(o => o.id === orderId)
                      if (order) {
                        const fill = Number(order.balance) > 0 ? order.balance : order.amount
                        setAmountStr(String(fill))
                      }
                    } else {
                      setAmountStr('')
                    }
                  }}
                  style={{ height: CONTROL_H }}
                >
                  <option value="">{t('payments.chooseOrder')}</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      #{o.order_no} · {o.product_name} · ${Number(o.amount).toFixed(2)} · Due: ${Number(o.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="row row-2col-mobile" style={{marginTop:12}}>
            <div>
              <label>{t('payments.paymentType')}</label>
              <select
                value={paymentType}
                onChange={e=>{
                  setPaymentType(e.target.value as PaymentType)
                  // If switching into Partner credit and no partner chosen yet, default to first partner
                  if ((e.target.value || '').toLowerCase() === 'partner credit' && !partnerForCreditId && partners.length) {
                    setPartnerForCreditId(partners[0].id)
                  }
                }}
                style={{ height: CONTROL_H }}
              >
                {activePaymentTypes.filter(type => !config.payments.visibleCustomerPaymentTypes || config.payments.visibleCustomerPaymentTypes.includes(type)).map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label>{t('payments.amountUSD')}</label>
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

          {/* Partner selector shown only for Partner credit */}
          {isPartnerCredit && (
            <div className="row" style={{marginTop:12}}>
              <div style={{gridColumn:'1 / -1'}}>
                <label>{t('partner')}</label>
                <select
                  value={partnerForCreditId}
                  onChange={e=>setPartnerForCreditId(e.target.value)}
                  style={{ height: CONTROL_H, width: '100%' }}
                >
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="row" style={{marginTop:12}}>
            <div style={{gridColumn:'1 / -1'}}>
              <label>{t('notesOptional')}</label>
              <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} style={{ height: CONTROL_H }} />
            </div>
          </div>

          <div style={{marginTop:16, display:'flex', gap:8}}>
            <button className="primary" onClick={saveCustomerPayment} style={{ height: CONTROL_H }}>{t('payments.savePayment')}</button>
            <button
              onClick={()=>{
                setAmountStr('');
                setPaymentType('Cash payment');
                setNotes('');
                if (partners.length) setPartnerForCreditId(partners[0].id)
              }}
              style={{ height: CONTROL_H }}
            >
              {t('clear')}
            </button>
          </div>

          <p className="helper" style={{marginTop:12}}>
            {t('payments.helpText')}
          </p>
        </>
      ) : paymentDirection === 'partner' ? (
        <>
          <h3>{t('payments.paymentToPartner')}</h3>

          {partners.length === 0 ? (
            <p className="helper" style={{marginTop:12}}>{t('payments.noPartners')}</p>
          ) : (
            <>
              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>{t('partner')}</label>
                  <select value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{ height: CONTROL_H }}>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>{t('payments.paymentDate')}</label>
                  <DateInput value={partnerDate} onChange={v => setPartnerDate(v)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              {config.payments.showOrderSelection && (
                <div className="row" style={{ marginTop: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>{t('payments.orderOptional')}</label>
                    <select
                      value={selectedPartnerOrderId}
                      onChange={e => {
                        const orderId = e.target.value
                        setSelectedPartnerOrderId(orderId)
                        if (orderId) {
                          const order = partnerOrders.find(o => o.id === orderId)
                          if (order) {
                            const fill = Number(order.balance) > 0 ? order.balance : order.amount
                            setPartnerAmountStr(String(fill))
                          }
                        } else {
                          setPartnerAmountStr('')
                        }
                      }}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="">{t('payments.chooseOrder')}</option>
                      {partnerOrders.map(o => (
                        <option key={o.id} value={o.id}>
                          #{o.order_no} · {o.product_name} · ${Number(o.amount).toFixed(2)} · Due: ${Number(o.balance).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>{t('payments.paymentType')}</label>
                  <select value={partnerPaymentType} onChange={e=>setPartnerPaymentType(e.target.value as PartnerPaymentType)} style={{ height: CONTROL_H }}>
                    {activePartnerPaymentTypes.filter(type => !config.payments.visiblePartnerPaymentTypes || config.payments.visiblePartnerPaymentTypes.includes(type)).map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label>{t('payments.amountUSD')}</label>
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
                  <label>{t('notesOptional')}</label>
                  <input type="text" value={partnerNotes} onChange={e=>setPartnerNotes(e.target.value)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              <div style={{marginTop:16, display:'flex', gap:8}}>
                <button className="primary" onClick={savePartnerPayment} style={{ height: CONTROL_H }}>{t('payments.savePayment')}</button>
                <button onClick={()=>{ setPartnerAmountStr(''); setPartnerPaymentType('Cash'); setPartnerNotes(''); setSelectedPartnerOrderId(''); }} style={{ height: CONTROL_H }}>{t('clear')}</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <h3>{t('payments.paymentToSupplier')}</h3>

          {suppliers.length === 0 ? (
            <p className="helper" style={{marginTop:12}}>{t('payments.noSuppliers')}</p>
          ) : (
            <>
              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>{t('supplier')}</label>
                  <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} style={{ height: CONTROL_H }}>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>{t('payments.paymentDate')}</label>
                  <DateInput value={supplierDate} onChange={v => setSupplierDate(v)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              {config.payments.showOrderSelection && (
                <div className="row" style={{ marginTop: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>{t('payments.orderOptional')}</label>
                    <select
                      value={selectedSupplierOrderId}
                      onChange={e => {
                        const orderId = e.target.value
                        setSelectedSupplierOrderId(orderId)
                        if (orderId) {
                          const order = supplierOrders.find(o => o.id === orderId)
                          if (order) {
                            const fill = Number(order.balance) > 0 ? order.balance : order.amount
                            setSupplierAmountStr(String(fill))
                          }
                        } else {
                          setSupplierAmountStr('')
                        }
                      }}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="">{t('payments.chooseOrder')}</option>
                      {supplierOrders.map(o => (
                        <option key={o.id} value={o.id}>
                          #{o.order_no} · {o.product_name} · ${Number(o.amount).toFixed(2)} · Due: ${Number(o.balance).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="row row-2col-mobile" style={{marginTop:12}}>
                <div>
                  <label>{t('payments.paymentType')}</label>
                  <select value={supplierPaymentType} onChange={e=>setSupplierPaymentType(e.target.value as SupplierPaymentType)} style={{ height: CONTROL_H }}>
                    {activeSupplierPaymentTypes.filter(type => !config.payments.visibleSupplierPaymentTypes || config.payments.visibleSupplierPaymentTypes.includes(type)).map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label>{t('payments.amountUSD')}</label>
                  <input
                    type="text"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={supplierAmountStr}
                    onChange={onSupplierAmountChange}
                    onKeyDown={onSupplierAmountKeyDown}
                    onSelect={onSupplierAmountSelect}
                    onFocus={onSupplierAmountFocusOrClick}
                    onClick={onSupplierAmountFocusOrClick}
                    style={{
                      height: CONTROL_H,
                      color: isSupplierMinusOnly ? 'var(--text-secondary)' : undefined,
                      opacity: isSupplierMinusOnly ? 0.6 : undefined,
                    }}
                  />
                </div>
              </div>

              <div className="row" style={{marginTop:12}}>
                <div style={{gridColumn:'1 / -1'}}>
                  <label>{t('notesOptional')}</label>
                  <input type="text" value={supplierNotes} onChange={e=>setSupplierNotes(e.target.value)} style={{ height: CONTROL_H }} />
                </div>
              </div>

              <div style={{marginTop:16, display:'flex', gap:8}}>
                <button className="primary" onClick={saveSupplierPayment} style={{ height: CONTROL_H }}>{t('payments.savePayment')}</button>
                <button onClick={()=>{ setSupplierAmountStr(''); setSupplierPaymentType('Cash'); setSupplierNotes(''); setSelectedSupplierOrderId(''); }} style={{ height: CONTROL_H }}>{t('clear')}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}









