// src/pages/Suppliers.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

type Supplier = {
  id: string
  name: string
  country: string | null
  owed_to_supplier: number
}

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Suppliers() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const url = new URL(`${base}/api/suppliers`, window.location.origin)
        if (query.trim()) url.searchParams.set('q', query.trim())
        const res = await fetch(url.toString(), {
          cache: 'no-store',
          headers: getAuthHeaders(),
        })
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s => s.name.toLowerCase().includes(q))
  }, [suppliers, query])

  const totalOwed = useMemo(
    () => visible.reduce((sum, s) => sum + Number(s.owed_to_supplier || 0), 0),
    [visible]
  )

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card page-normal">
      <h3 style={{ margin: '0 0 12px' }}>{t('suppliers.title')}</h3>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Create New button */}
        <Link to="/suppliers/new" style={{ display: 'block' }}>
          <button className="primary" style={{ height: BTN_H, width: '100%' }}>{t('suppliers.createNew')}</button>
        </Link>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder={t('suppliers.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
          />
          {(focused && query && suggestions.length > 0) && (
            <div style={{
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
            }}>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  className="primary"
                  onClick={() => pickSuggestion(s.name)}
                  style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', padding: '8px 10px', color: '#fff', borderRadius: 8, cursor: 'pointer' }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

      {/* Total owed to suppliers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('suppliers.owedToSuppliers')}</div>
        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(totalOwed)}</div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

      {err && <p style={{ color: 'var(--color-error)', marginTop: 8 }}>{t('error')} {err}</p>}

      {/* List */}
      <div>
        {loading ? (
          <p>{t('loading')}</p>
        ) : visible.length === 0 ? (
          <p className="helper">{t('suppliers.noSuppliers')}</p>
        ) : (
          <div>
            {visible.map((s) => (
              <Link key={s.id} to={`/suppliers/${s.id}`} className="row-link">
                <div>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="helper">{s.country || '—'}</div>
                </div>
                <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                  {fmtIntMoney(s.owed_to_supplier ?? 0)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {query && visible.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>{t('clearSearch')}</button>
        </div>
      )}
    </div>
  )
}
