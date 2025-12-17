import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCustomersWithOwed, type CustomerWithOwed, getAuthHeaders } from '../lib/api'

function fmtIntMoney(n: number) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

export default function Customers() {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [partnerTotals, setPartnerTotals] = useState({ owed: 0, paid: 0, net: 0 })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [filterType, setFilterType] = useState<'All' | 'BLV' | 'Partner'>('All')
  const [sortBy, setSortBy] = useState<'owed' | 'name'>('owed') // sorting: default "Owed amount"
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Net owed for partner "JJ Boston" to exclude from Owed to partners
  const [jjNet, setJjNet] = useState<number>(0)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed(query.trim() || undefined)
        setCustomers(res.customers)
        if ((res as any).partner_totals) {
          setPartnerTotals((res as any).partner_totals)
        }
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [query])

  // Load JJ Boston's partner net so we can exclude it
  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const bootRes = await fetch(`${base}/api/bootstrap`, { 
  cache: 'no-store',
  headers: getAuthHeaders()
})
        if (!bootRes.ok) throw new Error('bootstrap failed')
        const boot = await bootRes.json()
        const partners: Array<{ id: string; name: string }> = boot.partners ?? []
        const jj = partners.find(p => (p.name || '').trim().toLowerCase() === 'jj boston')
        if (!jj) { setJjNet(0); return }
        const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(jj.id)}`, { 
  cache: 'no-store',
  headers: getAuthHeaders()
})
        if (!res.ok) throw new Error('partner fetch failed')
        const data = await res.json()
        const net = Number(data?.totals?.net_owed ?? 0)
        setJjNet(Number.isFinite(net) ? net : 0)
      } catch {
        setJjNet(0) // safe fallback
      }
    })()
  }, [])

  // Suggestions from current results; show while typing/focused
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
    return customers.filter(c => (c as any).customer_type === filterType)
  }, [customers, filterType])

  // Apply sorting to the visible set
  const sortedVisible = useMemo(() => {
    const arr = [...visible]
    if (sortBy === 'owed') {
      // Sort by owed amount (desc)
      arr.sort((a, b) => Number(b.owed_to_me || 0) - Number(a.owed_to_me || 0))
    } else {
      // Sort by customer name (A→Z)
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return arr
  }, [visible, sortBy])

  // Sum owed_to_me over the visible (filtered) set, BUT treat negatives as 0 for the total
  const totalVisibleOwed = useMemo(
    () =>
      visible.reduce((sum, c) => {
        const n = Number((c as any).owed_to_me || 0)
        return sum + Math.max(0, n)
      }, 0),
    [visible]
  )

  // Owed to partners: exclude JJ Boston; BLV filter shows 0
  const filteredPartnerNet = useMemo(() => {
    if (filterType === 'BLV') return 0
    const net = Number(partnerTotals.net) || 0
    const adjusted = net - (Number(jjNet) || 0)
    return adjusted < 0 ? 0 : adjusted
  }, [partnerTotals.net, filterType, jjNet])

  // "My $" = Total owed to me (filtered) - Owed to partners (filtered), never below 0
  const myDollars = useMemo(
    () => Math.max(0, Number(totalVisibleOwed) - Number(filteredPartnerNet)),
    [totalVisibleOwed, filteredPartnerNet]
  )

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
          <Link to="/customers/new">
            <button
              className="primary"
              style={{ width: '100%', height: 'var(--control-h)' }}
            >
              Create New Customer
            </button>
          </Link>
        </div>
      </div>

      {/* Filter row: All / BLV / Partner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 8,
        }}
      >
        <button className="primary" onClick={() => setFilterType('All')}     aria-pressed={filterType === 'All'}     style={{ height: 'calc(var(--control-h) * 0.67)' }}>All</button>
        <button className="primary" onClick={() => setFilterType('BLV')}     aria-pressed={filterType === 'BLV'}     style={{ height: 'calc(var(--control-h) * 0.67)' }}>BLV</button>
        <button className="primary" onClick={() => setFilterType('Partner')} aria-pressed={filterType === 'Partner'} style={{ height: 'calc(var(--control-h) * 0.67)' }}>Partner</button>
      </div>

      {/* Blank row */}
      <div style={{ height: 20 }} />

      {/* Total for filtered customers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>Total owed to me</div>
        <div style={{ textAlign: 'right', fontWeight: 600 }}>
          {fmtIntMoney(totalVisibleOwed)}
        </div>
      </div>

      {/* Blank row */}
      <div style={{ height: 8 }} />

      {/* Owed to partners (respects BLV/Partner filter, excludes JJ Boston) */}
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
          {fmtIntMoney(filteredPartnerNet)}
        </div>
      </div>

      {/* My $ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>My $</div>
        <div style={{ textAlign: 'right', fontWeight: 600 }}>
          {fmtIntMoney(myDollars)}
        </div>
      </div>

      {/* Spacer between "My $" and Sort by */}
      <div style={{ height: 8 }} />

      {/* Sort row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text)', textAlign: 'left' }}>Sort by</div>
        <div>
          <select
            aria-label="Sort customers by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'owed' | 'name')}
            style={{
              height: 'calc(var(--control-h) * 0.67)',
              borderRadius: 8,
              padding: '0 10px',
            }}
          >
            <option value="owed">Owed amount</option>
            <option value="name">Customer name</option>
          </select>
        </div>
      </div>

      {/* Same spacer below sorting as above */}
      <div style={{ height: 8 }} />

      {err && <p style={{ color: 'salmon', marginTop: 8 }}>Error: {err}</p>}

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : sortedVisible.length === 0 ? (
          <p className="helper">No customers.</p>
        ) : (
          <div>
            {sortedVisible.map((c) => (
              <Link key={c.id} to={`/customers/${c.id}`} className="row-link">
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="helper">{(c as any).customer_type ?? '—'}</div>
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
      {query && sortedVisible.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>Clear Search</button>
        </div>
      )}
    </div>
  )
}




















