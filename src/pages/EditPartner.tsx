// src/pages/EditPartner.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'

export default function EditPartner() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // form state
  const [name, setName] = useState('')
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
        
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const token = localStorage.getItem('authToken')
const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(id)}`, { 
  cache: 'no-store',
  headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
})
        
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load partner (status ${res.status}) ${text?.slice(0,140)}`)
        }
        
        const d = await res.json()
        const p = d.partner
        setName(p.name || '')
        setPhone(p.phone || '')
        setAddress1(p.address1 || '')
        setAddress2(p.address2 || '')
        setCity(p.city || '')
        setState(p.state || '')
        setPostal(p.postal_code || '')
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

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const token = localStorage.getItem('authToken')
const res = await fetch(`${base}/api/partner`, {
  method: 'PUT',
  headers: { 
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({
    id,
    name: name.trim(),
    phone: phone.trim() || null,
    address1: address1.trim() || null,
    address2: address2.trim() || null,
    city: city.trim() || null,
    state: state.trim() || null,
    postal_code: postal.trim() || null,
  }),
})
      
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to update partner (status ${res.status}) ${text?.slice(0,140)}`)
      }
      
      nav(`/partners/${id}`)
    } catch (e:any) {
      alert(e?.message || 'Failed to update partner')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>Edit Partner</h3>
        <Link to={id ? `/partners/${id}` : '/partners'} className="helper">Cancel</Link>
      </div>

      {/* Partner Name - full width */}
      <div style={{ marginTop: 12 }}>
        <label>Partner Name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" />
      </div>

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
        <Link to={id ? `/partners/${id}` : '/partners'} style={{ alignSelf:'center' }} className="helper">Cancel</Link>
      </div>
    </div>
  )
}