import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'

export default function Customers() {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed(query.trim() || undefined)
        setCustomers(res.customers)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [query])

  // suggestions based on current results
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const uniq = new Set<string>()
    return customers
      .filter(c => c.name.toLowerCase().includes(q))
      .filter(c => (uniq.has(c.name.toLowerCase()) ? false : (uniq.add(c.name.toLowerCase()), true)))
      .slice(0, 5)
  }, [query, customers])

  // INTEGER dollars with commas
  function fmtIntMoney(n: number) {
    return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
  }

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      {/* Top controls: search + create */}
      <div className="row" style={{ alignItems: 'end' }}>
        <div style={{ position: 'relative' }}>
          <label>Search</label>
          <input
            placeholder="Search customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && suggestions.length > 0 && (
            <div
              className="suggestions"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                borderRadius: 8,
                background: 'rgba(47,109,246,.15)',
                color: '#fff',
                padding: 6,
                zIndex: 50
              }}
            >
              {suggestions.map((s) => (
                <div key={s.id}>
                  <button
                    className="primary"
                    style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', padding: '8px 10px' }}
                    onClick={() => setQuery(s.name)}
                  >
                    {s.name}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label>&nbsp;</label>
          <Link to="/customers/new">
            <button className="primary" style={{ width: '100%' }}>Create New Customer</button>
          </Link>
        </div>
      </div>

      {err && <p style={{ color: 'salmon' }}>Error: {err}</p>}

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : customers.length === 0 ? (
          <p className="helper">No customers.</p>
        ) : (
          <div>
            {customers.map((c) => (
              <Link key={c.id} to={`/customers/${c.id}`} className="row-link">
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="helper">{(c as any).customer_type ?? c.type}</div>
                </div>
                <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                  {fmtIntMoney(c.owed_to_me)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Clear search (only when narrowed to one match) */}
      {query && customers.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>Clear Search</button>
        </div>
      )}
    </div>
  )
}



