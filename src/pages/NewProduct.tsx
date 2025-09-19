import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createProduct } from '../lib/api'

export default function NewProduct() {
  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')  // decimal string
  const [saving, setSaving] = useState(false)

  function parseCostInput(s: string) {
    // allow digits, one dot or comma
    const cleaned = s.replace(/[^\d.,]/g, '')
    // normalize comma to dot
    const normalized = cleaned.replace(',', '.')
    return normalized
  }

  async function save() {
    const nm = name.trim()
    const costNum = Number((costStr || '').replace(',', '.'))
    if (!nm) { alert('Enter product name'); return }
    if (!Number.isFinite(costNum) || costNum < 0) { alert('Enter a valid cost ≥ 0'); return }

    try {
      setSaving(true)
      await createProduct({ name: nm, cost: costNum })
      alert('Product created!')
      setName('')
      setCostStr('')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>New Product</h3>
        <Link to="/products/edit">
          <button className="primary" style={{ height: BTN_H }}>Edit Product(s)</button>
        </Link>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Product name</label>
          <input
            type="text"
            placeholder="e.g. ACE Ultra"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label>Product cost (USD)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={costStr}
            onChange={e => setCostStr(parseCostInput(e.target.value))}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save product'}
        </button>
        <button onClick={() => { setName(''); setCostStr(''); }} disabled={saving}>
          Clear
        </button>
      </div>
    </div>
  )
}
