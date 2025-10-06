// src/pages/EditCustomer.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, updateCustomer, type CustomerType } from '../lib/api'

export default function EditCustomer() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // form state
  const [name, setName] = useState('')
  const [customerType, setCustomerType] = useState<CustomerType>('BLV')
  const [shippingCost, setShippingCost] = useState<string>('') // string input, will parse to number/null
  const [applyHistory, setApplyHistory] = useState(false)

  // ✨ NEW: company name state
  const [companyName, setCompanyName] = useState('')   // ✨ NEW

  const [phone, setPhone] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postal, setPostal] = useState('')

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchCustomerDetail(id)
        const c = d.customer
        setName(c.name || '')
        setCustomerType((c.customer_type as CustomerType) || 'BLV')
        setShippingCost(c.shipping_cost != null ? String(c.shipping_cost) : '')
        // ✨ NEW: prefill company name
        setCompanyName(c.company_name || '')           // ✨ NEW
        setPhone(c.phone || '')
        setAddress1(c.address1 || '')
        setAddress2(c.address2 || '')
        setCity(c.city || '')
        setState(c.state || '')
        setPostal(c.postal_code || '')
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function save() {
    if (!id) return
    if (!name.trim()) { alert('Name is required'); return }

    // parse shipping cost: empty -> null; otherwise number
    const sc = shippingCost.trim() === '' ? null : Number(shippingCost.replace(',', '.'))
    if (sc != null && !Number.isFinite(sc)) { alert('Shipping cost must be a number (or leave empty)'); return }

    try {
      await updateCustomer({
        id,
        name: name.trim(),
        customer_type: customerType,
        shipping_cost: sc,
        apply_to_history: applyHistory,
        // ✨ NEW: include company_name when saving
        company_name: companyName.trim() || null,      // ✨ NEW
        phone: phone.trim() || null,
        address1: address1.trim() || null,
        address2: address2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postal_code: postal.trim() || null,
      })
      nav(`/customers/${id}`)
    } catch (e:any) {
      alert(e?.message || 'Failed to update customer')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>Edit Customer</h3>
        <Link to={id ? `/customers/${id}` : '/customers'} className="helper">Cancel</Link>
      </div>

      {/* Customer Name (2/3) | Customer Type (1/3) */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label>Customer Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <label>Customer Type</label>
          <select value={customerType} onChange={e=>setCustomerType(e.target.value as CustomerType)}>
            <option value="BLV">BLV</option>
            <option value="Partner">Partner</option>
          </select>
        </div>
      </div>

      {/* Shipping cost (1/3) | Apply to previous checkbox (2/3) */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <div>
          <label>Shipping cost</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 0.35"
            value={shippingCost}
            onChange={e=>setShippingCost(e.target.value)}
          />
        </div>
        <div style={{ display:'flex', alignItems:'end' }}>
          <label style={{ width:'100%' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, height: '100%' }}>
              <input
                type="checkbox"
                checked={applyHistory}
                onChange={e => setApplyHistory(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Apply new cost to previous orders</span>
            </div>
          </label>
        </div>
      </div>

      {/* ✨ NEW: Company name — placed BETWEEN Shipping cost and Phone */}
      <div style={{ marginTop: 12 }}>
        <div>
          <label>Company name</label>
          <input
            value={companyName}
            onChange={e=>setCompanyName(e.target.value)}
            placeholder="e.g. Acme Corp"
          />
        </div>
      </div>
      {/* ✨ END NEW */}

      {/* Phone | Address line 1 - 2 columns equal width */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Phone</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 555-123-4567" />
        </div>
        <div>
          <label>Address line 1</label>
          <input value={address1} onChange={e=>setAddress1(e.target.value)} />
        </div>
      </div>

      {/* Address line 2 | City - 2 columns equal width */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Address line 2</label>
          <input value={address2} onChange={e=>setAddress2(e.target.value)} />
        </div>
        <div>
          <label>City</label>
          <input value={city} onChange={e=>setCity(e.target.value)} />
        </div>
      </div>

      {/* State | Postal code - 2 columns equal width */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>State</label>
          <input value={state} onChange={e=>setState(e.target.value)} />
        </div>
        <div>
          <label>Postal code</label>
          <input value={postal} onChange={e=>setPostal(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save}>Save changes</button>
        <Link to={id ? `/customers/${id}` : '/customers'} style={{ alignSelf:'center' }} className="helper">Cancel</Link>
      </div>
    </div>
  )
}

