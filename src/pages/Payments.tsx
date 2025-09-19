import { useEffect, useMemo, useState } from 'react'
import { fetchBootstrap, PAYMENT_TYPES, type PaymentType, createPayment, type Person } from '../lib/api'
import { todayYMD } from '../lib/time'

export default function Payments() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // form
  const [entityId, setEntityId] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash payment')
  const [amountStr, setAmountStr] = useState('') // allow negative
  const [date, setDate] = useState<string>(todayYMD())
  const [notes, setNotes] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers } = await fetchBootstrap()
        setPeople(customers)
        setEntityId(customers[0]?.id ?? '')
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const customer = useMemo(() => people.find(p => p.id === entityId), [people, entityId])

  async function save() {
    if (!customer) { alert('Select a customer/partner'); return }
    const amountNum = Number(amountStr.replace(',', '.'))
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      alert('Enter a non-zero amount (use negative for discounts/fees if you like)')
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
      setAmountStr('')
      setPaymentType('Cash payment')
      setNotes('')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!people.length) return <div className="card"><p>No customers/partners found.</p></div>

  return (
    <div className="card" style={{maxWidth:720}}>
      <h3>Payments</h3>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Customer / Partner</label>
          <select value={entityId} onChange={e=>setEntityId(e.target.value)}>
            <optgroup label="Customers">
              {people.filter(p=>p.type==='Customer').map(p=>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
            <optgroup label="Partners">
              {people.filter(p=>p.type==='Partner').map(p=>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
          </select>
        </div>
        <div>
          <label>Payment date</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Payment Type</label>
          <select value={paymentType} onChange={e=>setPaymentType(e.target.value as PaymentType)}>
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
            onChange={e=>setAmountStr(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div style={{gridColumn:'1 / -1'}}>
          <label>Notes (optional)</label>
          <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
      </div>

      <div style={{marginTop:16, display:'flex', gap:8}}>
        <button className="primary" onClick={save}>Save payment</button>
        <button onClick={()=>{ setAmountStr(''); setPaymentType('Cash payment'); setNotes(''); }}>Clear</button>
      </div>

      <p className="helper" style={{marginTop:12}}>
        Positive = money received; negative = credit/discount/fee if you choose to represent it that way.
      </p>
    </div>
  )
}

