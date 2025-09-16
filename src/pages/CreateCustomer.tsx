import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCustomer, type CustomerType } from '../lib/api'

type ShipChoice = '0' | '0.35' | 'custom'

export default function CreateCustomer() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [ctype, setCtype] = useState<CustomerType>('BLV')  // BLV | Partner
  const [shipChoice, setShipChoice] = useState<ShipChoice>('0')
  const [shipCustom, setShipCustom] = useState('')          // string, if custom
  const [phone, setPhone] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postal, setPostal] = useState('')

  function resolvedShipping(): number {
    if (shipChoice === '0') return 0
    if (shipChoice === '0.35') return 0.35
    const n = Number(shipCustom.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }

  async function save() {
    if (!name.trim()) { alert('Enter a customer name'); return }
    const ship = resolvedShipping()
    if (!Number.isFinite(ship)) { alert('Enter a valid custom shipping cost (>= 0)'); return }

    try {
      await createCustomer({
        name: name.trim(),
        customer_type: ctype,
        shipping_cost: ship,
        phone: phone.trim() || undefined,
        address1: address1.trim() || undefined,
        address2: address2.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postal_code: postal.trim() || undefined,
      })
      alert('Customer created')
      navigate('/customers')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    }
  }

  const CONTROL_H = 44

  return (
    <div className="card" style={{maxWidth: 900}}>
      <h3>Create New Customer</h3>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Customer Name</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label>Customer Type</label>
          <select value={ctype} onChange={e=>setCtype(e.target.value as CustomerType)}>
            <option value="BLV">BLV</option>
            <option value="Partner">Partner</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Shipping Cost</label>
          <div style={{ display:'flex', gap:8 }}>
            <select
              value={shipChoice}
              onChange={e=>setShipChoice(e.target.value as ShipChoice)}
              style={{ height: CONTROL_H }}
            >
              <option value="0">0</option>
              <option value="0.35">0.35</option>
              <option value="custom">Custom…</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Custom"
              value={shipCustom}
              onChange={e=>setShipCustom(e.target.value)}
              disabled={shipChoice !== 'custom'}
              style={{ height: CONTROL_H, flex:1 }}
            />
          </div>
        </div>
        <div>
          <label>Phone</label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Address line 1</label>
          <input type="text" value={address1} onChange={e=>setAddress1(e.target.value)} />
        </div>
        <div>
          <label>Address line 2</label>
          <input type="text" value={address2} onChange={e=>setAddress2(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>City</label>
          <input type="text" value={city} onChange={e=>setCity(e.target.value)} />
        </div>
        <div>
          <label>State</label>
          <input type="text" value={state} onChange={e=>setState(e.target.value)} />
        </div>
        <div>
          <label>ZIP</label>
          <input type="text" value={postal} onChange={e=>setPostal(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop:16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>Save</button>
        <button onClick={()=>history.back()} style={{ height: CONTROL_H }}>Cancel</button>
      </div>
    </div>
  )
}
