import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'

export default function Customers() {
  const [all, setAll] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [showSug, setShowSug] = useState(false)

  const navigate = useNavigate()
  const CONTROL_H = 44 // keep input and buttons same height

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers } = await listCustomersWithOwed()
        setAll(customers)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return !s ? all : all.filter(c => c.name.toLowerCase().includes(s))
  }, [all, q])

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return all.filter(c => c.name.toLowerCase().includes(s)).slice(0, 5)
  }, [all, q])

  function fmt(n: number) {
    return `$${(Number(n) || 0).toFixed(2)}`
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>

  return (
    <div className="card" style={{maxWidth: 900}}>
      <h3>Customers</h3>

      {/* Top row: search (no label) + create button */}
      <div className="row" style={{ marginTop: 12, gridTemplateColumns: '1fr 1fr', alignItems:'end' }}>
        {/* Search */}
        <div style={{ position:'relative' }}>
          <input
            style={{ height: CONTROL_H }}
            type="text"
            placeholder="Search…"
            value={q}
            onChange={e => { setQ(e.target.value); setShowSug(true) }}
            onFocus={() => { if (q) setShowSug(true) }}
            onBlur={() => { setTimeout(() => setShowSug(false), 120) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); setShowSug(false) }
              if (e.key === 'Escape') { setShowSug(false) }
            }}
            autoCapitalize="none"
            autoCorrect="off"
          />

          {/* Suggestions: light blue bg, white text, above all */}
          {(q && showSug && suggestions.length > 0) && (
            <ul
              role="listbox"
              style={{
                position:'absolute',
                left:0, right:0, top:'calc(100% + 6px)',
                background:'rgba(59,130,246,0.95)',  // blue
                color:'#fff',
                border:'none',
                borderRadius:8,
                listStyle:'none', margin:0, padding:'6px 0',
                zIndex:10000,
                boxShadow:'0 8px 24px rgba(0,0,0,0.18)',
                maxHeight:260, overflowY:'auto'
              }}
            >
              {suggestions.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setQ(s.name)
                      setShowSug(false)
                    }}
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      padding:'10px 12px', border:'none',
                      background:'transparent', color:'#fff',
                      cursor:'pointer', fontSize:15
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create New Customer */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button
            className="primary"
            onClick={() => navigate('/customers/new')}
            style={{
              height: CONTROL_H,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              padding:'0 14px'
            }}
          >
            Create New Customer
          </button>
        </div>
      </div>

      {/* Results list */}
      <div style={{ marginTop: 16 }}>
        {filtered.length === 0 ? (
          <p>No matches.</p>
        ) : (
          <div style={{display:'grid'}}>
            {filtered.map(c => (
              <Link
                key={c.id}
                to={`/customers/${c.id}`}
                className="row-link"
                aria-label={`Open ${c.name}`}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="helper">{(c as any).customer_type ?? c.type}</div>
                </div>
                <div style={{ textAlign:'right', alignSelf:'center' }}>
                  <div style={{ fontWeight: 600 }}>{fmt(c.owed_to_me)}</div>
                  <div className="helper">Owed to me</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Clear search BELOW the results, primary button */}
      {q.trim() !== '' && (
        <div style={{ marginTop: 16, display:'flex', justifyContent:'center' }}>
          <button
            type="button"
            className="primary"
            onClick={() => { setQ(''); setShowSug(false) }}
            style={{ height: CONTROL_H, padding:'0 14px' }}
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}


