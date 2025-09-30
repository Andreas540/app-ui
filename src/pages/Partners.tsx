import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPartnersWithOwed, type PartnerWithOwed } from '../lib/api'

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Partners() {
  const [query, setQuery] = useState('')
  const [partners, setPartners] = useState<PartnerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listPartnersWithOwed(query.trim() || undefined)
        setPartners(res.partners)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [query])

  // Suggestions from current results; show while typing/focused
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const uniq = new Set<string>()
    return partners
      .filter(p => p.name.toLowerCase().includes(q))
      .filter(p => (uniq.has(p.name.toLowerCase()) ? false : (uniq.add(p.name.toLowerCase()), true)))
      .slice(0, 5)
  }, [query, partners])

  function pickSuggestion(name: string) {
    setQuery(name)
    setFocused(false)
    inputRef.current?.blur()
  }

  // Calculate total owed to partners (net of payments already made)
  const totalPartnersOwed = useMemo(
    () => partners.reduce((sum, p) => sum + Number(p.total_owed || 0), 0),
    [partners]
  )

  // Filter partners based on search query
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return partners
    return partners.filter(p => p.name.toLowerCase().includes(q))
  }, [partners, query])

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      {/* Force 2 columns even on mobile */}
      <div className="row row-2col-mobile" style={{ alignItems: 'end' }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder="Search partners"
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
          <Link to="/partners/new">
            <button
              className="primary"
              style={{ width: '100%', height: 'var(--control-h)' }}
            >
              Create New Partner
            </button>
          </Link>
        </div>
      </div>

      {/* Blank row */}
      <div style={{ height: 20 }} />

      {/* Total owed to partners (net of payments) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>Owed to partners</div>
        <div style={{ textAlign: 'right', fontWeight: 600 }}>
          {fmtIntMoney(totalPartnersOwed)}
        </div>
      </div>

      {/* Blank row */}
      <div style={{ height: 8 }} />

      {err && <p style={{ color: 'salmon', marginTop: 8 }}>Error: {err}</p>}

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : visible.length === 0 ? (
          <p className="helper">No partners.</p>
        ) : (
          <div>
            {visible.map((p) => (
              <Link key={p.id} to={`/partners/${p.id}`} className="row-link">
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="helper">Partner</div>
                </div>
                <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                  {fmtIntMoney(p.total_owed)}
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