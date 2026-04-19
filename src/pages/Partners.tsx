import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listPartnersWithOwed, type PartnerWithOwed } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

export default function Partners() {
  const { t } = useTranslation()
  const { fmtIntMoney } = useCurrency()
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

  const totalPartnersOwed = useMemo(
    () => partners.reduce((sum, p) => sum + Number(p.total_owed || 0), 0),
    [partners]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return partners
    return partners.filter(p => p.name.toLowerCase().includes(q))
  }, [partners, query])

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card page-normal">
      <h3 style={{ margin: '0 0 12px' }}>{t('partners.title')}</h3>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Create New button */}
        <Link to="/partners/new" style={{ display: 'block' }}>
          <button className="primary" style={{ height: BTN_H, width: '100%' }}>{t('partners.createNew')}</button>
        </Link>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder={t('partners.searchPlaceholder')}
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
              {suggestions.map(s => (
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

      {/* Total owed to partners */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('partners.owedToPartners')}</div>
        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(totalPartnersOwed)}</div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

      {err && <p style={{ color: 'var(--color-error)', marginTop: 8 }}>{t('error')} {err}</p>}

      {/* List */}
      <div>
        {loading ? (
          <p>{t('loading')}</p>
        ) : visible.length === 0 ? (
          <p className="helper">{t('partners.noPartners')}</p>
        ) : (
          <div>
            {visible.map((p) => (
              <Link key={p.id} to={`/partners/${p.id}`} className="row-link">
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="helper">{t('partner')}</div>
                </div>
                <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                  {fmtIntMoney(p.total_owed)}
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
