// src/pages/Suppliers.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

type Supplier = {
  id: string
  name: string
  country: string | null
  // placeholders until tables exist:
  total_amount?: number   // sum(qty*unit_price) - payments  [money]
  total_qty?: number      // sum(qty) - delivered           [units]
}

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Suppliers() {
  const [query, setQuery] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Fetch suppliers (name, country, placeholders)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const url = new URL(`${base}/api/suppliers`, window.location.origin)
        if (query.trim()) url.searchParams.set('q', query.trim())
        const res = await fetch(url.toString(), { cache: 'no-store' })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load suppliers (status ${res.status}) ${text?.slice(0,140)}`)
        }
        const data = await res.json()
        setSuppliers(Array.isArray(data.suppliers) ? data.suppliers : [])
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [query])

  // Suggestions (from current results)
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const uniq = new Set<string>()
    return suppliers
      .filter(s => s.name.toLowerCase().includes(q))
      .filter(s => (uniq.has(s.name.toLowerCase()) ? false : (uniq.add(s.name.toLowerCase()), true)))
      .slice(0, 5)
  }, [query, suppliers])

  function pickSuggestion(name: string) {
    setQuery(name)
    setFocused(false)
    inputRef.current?.blur()
  }

  // Visible items
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s => s.name.toLowerCase().includes(q))
  }, [suppliers, query])

  // Top totals (placeholders until tables exist)
  const totalAmount = useMemo(
    () => visible.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
    [visible]
  )
  const totalQty = useMemo(
    () => visible.reduce((sum, s) => sum + Number(s.total_qty || 0), 0),
    [visible]
  )

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      {/* Search + Create button */}
      <div className="row row-2col-mobile" style={{ alignItems: 'end' }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder="Search suppliers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
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
              {suggestions.map((s) => (
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
          <Link to="/suppliers/new">
            <button className="primary" style={{ width: '100%', height: 'var(--control-h)' }}>
              Create New Supplier
            </button>
          </Link>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: 20 }} />

      {/* Top totals (money & qty) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>Total (qty × unit price)</div>
        <div style={{ textAlign: 'right', fontWeight: 600 }}>
          {fmtIntMoney(totalAmount)} {/* placeholder sums */}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>Total Qty</div>
        <div style={{ textAlign: 'right', fontWeight: 600 }}>
          {(Number(totalQty) || 0).toLocaleString('en-US')}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: 8 }} />

      {err && <p style={{ color: 'salmon', marginTop: 8 }}>Error: {err}</p>}

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : visible.length === 0 ? (
          <p className="helper">No suppliers.</p>
        ) : (
          <div>
            {visible.map((s) => (
              <Link key={s.id} to={`/suppliers/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row-link" style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="helper">{s.country || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right', alignSelf: 'center', lineHeight: 1.2 }}>
                    {/* Right side: two numbers (placeholders until tables exist) */}
                    <div>{fmtIntMoney(s.total_amount ?? 0)}</div>
                    <div className="helper">{(Number(s.total_qty) || 0).toLocaleString('en-US')} units</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Clear search when exactly one match */}
      {query && visible.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>Clear Search</button>
        </div>
      )}
    </div>
  )
}
