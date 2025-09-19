import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Customers() {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [filterType, setFilterType] = useState<'All' | 'BLV' | 'Partner'>('All')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed(query.trim() || undefined)
        setCustomers(res.customers)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [query])

  // Suggestions come from current results; show while typing/focused
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const uniq = new Set<string>()
    return customers
      .filter(c => c.name.toLowerCase().includes(q))
      .filter(c => (uniq.has(c.name.toLowerCase()) ? false : (uniq.add(c.name.toLowerCase()), true)))
      .slice(0, 5)
  }, [query, customers])

  function pickSuggestion(name: string) {
    setQuery(name)
    setFocused(false)
    inputRef.current?.blur()
  }

  // Apply customer_type filter locally
  const visible = useMemo(() => {
    if (filterType === 'All') return customers
    return customers.filter(c => {
      const t = (c as any).customer_type ?? c.type
      return t === filterType
    })
  }, [customers, filterType])

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      {/* Force 2 columns even on mobile */}
      <div className="row row-2col-mobile" style={{ alignItems: 'end' }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder="Search customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)} // allow click on suggestion
          />
          {(focused && query && suggestions.length > 0) && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                borderRadius: 10,
                background: 'rgba(47,109,246,0.90)',
                color: '#fff',
                padding: 6,
                zIndex: 50,
                boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
              }}
            >
              {suggestions.map(s => (
                <button
                  key={s.id}
                  className="primary"
                  onClick={() => pickSuggestion(s.name)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    padding: '8px 10px',
                    color: '#fff',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Link to="/customers/new">
            <button className="primary" style={{ width: '100%' }}>
              Create New Customer
            </button>
          </Link>
        </div>
      </div>

      {/* Filter row: All / BLV / Partner (3 equal columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          className="primary"
          onClick={() => setFilterType('All')}
          aria-pressed={filterType === 'All'}
          style={{ width: '100%' }}
        >
          All
        </button>
        <button
          className="primary"
          onClick={() => setFilterType('BLV')}
          aria-pressed={filterType === 'BLV'}
          style={{ width: '100%' }}
        >
          BLV
        </button>
        <button
          className="primary"
          onClick={() => setFilterType('Partner')}
          aria-pressed={filterType === 'Partner'}
          style={{ width: '100%' }}
        >
          Partner
        </button>
      </div>

      {err && <p style={{ color: 'salmon', marginTop: 8 }}>Error: {err}</p>}

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : visible.length === 0 ? (
          <p className="helper">No customers.</p>
        ) : (
          <div>
            {visible.map((c) => (
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

      {/* Clear search below the (single) result */}
      {query && visible.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>Clear Search</button>
        </div>
      )}
    </div>
  )
}






