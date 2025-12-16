// src/pages/EditSupplier.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

interface Supplier {
  id: string
  name: string
  phone?: string
  email?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

export default function EditSupplier() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')

  // Load supplier data
  useEffect(() => {
    (async () => {
      try {
        if (!id) throw new Error('Supplier ID missing')
        setLoading(true)
        setErr(null)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const token = localStorage.getItem('authToken')
        const res = await fetch(`${base}/api/supplier?id=${id}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load supplier (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        const s = data.supplier

        setSupplier(s)
        setName(s.name || '')
        setPhone(s.phone || '')
        setEmail(s.email || '')
        setAddress1(s.address1 || '')
        setAddress2(s.address2 || '')
        setCity(s.city || '')
        setState(s.state || '')
        setPostalCode(s.postal_code || '')
        setCountry(s.country || '')
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function handleSave() {
    if (!name.trim()) {
      alert('Supplier name is required')
      return
    }

    try {
      setSaving(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')

      const res = await fetch(`${base}/api/supplier`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address1: address1.trim() || null,
          address2: address2.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          postal_code: postalCode.trim() || null,
          country: country.trim() || null,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to save (status ${res.status}) ${text?.slice(0, 140)}`)
      }

      alert('Supplier updated successfully')
      navigate(`/suppliers/${id}`)
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>
  if (!supplier) return null

  const CONTROL_H = 44

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Edit Supplier</h3>
        <Link to={`/suppliers/${id}`} className="helper">&larr; Back</Link>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Supplier Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Address line 1</label>
          <input
            type="text"
            value={address1}
            onChange={(e) => setAddress1(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label>Address line 2</label>
          <input
            type="text"
            value={address2}
            onChange={(e) => setAddress2(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label>State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label>ZIP</label>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Country</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          className="primary"
          onClick={handleSave}
          disabled={saving}
          style={{ height: CONTROL_H }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => navigate(`/suppliers/${id}`)}
          disabled={saving}
          style={{ height: CONTROL_H }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}