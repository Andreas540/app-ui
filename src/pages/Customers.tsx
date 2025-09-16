import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'

export default function Customers() {
  const [all, setAll] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers } = await listCustomersWithOwed() // load all; we filter client-side
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

      {/* Top row: 50/50 search + create */}
      <div className="row" style={{ marginTop: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ position:'relative' }}>
          <label>Search Customer</label>
          <input
            type="text"
            placeholder="Type a name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {/* suggestions */}
          {q && suggestions.length > 0 && (
            <ul style={{
              position:'absolute', left:0, right:0, top:'100%',
              background:'white', border:'1px solid #ddd', borderTop:'none',
              listStyle:'none', margin:0, padding:0, zIndex:5, maxHeight:200, overflowY:'auto'
            }}>
              {suggestions.map(s => (
                <li key={s.id}>
                  <button
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      padding:'8px 10px', border:'none', background:'white'
                    }}
                    onClick={() => setQ(s.name)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label>&nbsp;</label>
          <button className="primary" onClick={() => navigate('/customers/new')}>
            Create New Customer
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ marginTop: 16 }}>
        {filtered.length === 0 ? (
          <p>No matches.</p>
        ) : (
          <div>
            {filtered.map(c => (
              <div
                key={c.id}
                style={{
                  display:'grid',
                  gridTemplateColumns:'1fr auto',
                  gap:8,
                  padding:'10px 0',
                  borderBottom:'1px solid #eee'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="helper">{c.type}</div>
                </div>
                <div style={{ textAlign:'right', alignSelf:'center' }}>
                  <div style={{ fontWeight: 600 }}>{fmt(c.owed_to_me)}</div>
                  <div className="helper">Owed to me</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
