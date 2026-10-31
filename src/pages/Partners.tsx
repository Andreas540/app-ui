import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listPartnersWithOwed, type PartnerWithOwed } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../lib/useCurrency'

export default function Partners() {
  const { t } = useTranslation()
  const { fmtIntMoney } = useCurrency()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [partners, setPartners] = useState<PartnerWithOwed[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [sortBy, setSortBy] = useState<'owed' | 'name' | 'custom'>('name')
  const [sortTouched, setSortTouched] = useState(false)
  const [customAvailable, setCustomAvailable] = useState(false)
  const [baseSort, setBaseSort] = useState<'owed' | 'name'>('name')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Admins get a shortcut to set the order up; everyone else just gets the result.
  const effectiveRole = user?.impersonatingUser?.role ?? user?.role
  const canEditSorting = effectiveRole === 'tenant_admin' || effectiveRole === 'super_admin'

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listPartnersWithOwed(query.trim() || undefined)
        setPartners(res.partners)
        // Settings arrive with every fetch, so admin changes land without a re-login.
        const hasPositions = res.partners.some(p => p.sort_order != null)
        const base = res.defaultSort === 'owed' ? 'owed' : 'name'
        setCustomAvailable(hasPositions)
        setBaseSort(base)
        if (!sortTouched) setSortBy(res.useCustom && hasPositions ? 'custom' : base)
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

  // Apply sorting to the visible set. Under 'custom', positioned rows lead in position
  // order and everything unpositioned follows in the tenant's base sort.
  const sortedVisible = useMemo(() => {
    const byName = (a: PartnerWithOwed, b: PartnerWithOwed) => (a.name || '').localeCompare(b.name || '')
    const byOwed = (a: PartnerWithOwed, b: PartnerWithOwed) => Number(b.total_owed || 0) - Number(a.total_owed || 0)
    const base = baseSort === 'owed' ? byOwed : byName
    const arr = [...visible]
    if (sortBy === 'custom') {
      arr.sort((a, b) => {
        const ap = a.sort_order ?? null, bp = b.sort_order ?? null
        if (ap != null && bp != null) return ap - bp || base(a, b)
        if (ap != null) return -1
        if (bp != null) return 1
        return base(a, b)
      })
    } else {
      arr.sort(sortBy === 'owed' ? byOwed : byName)
    }
    return arr
  }, [visible, sortBy, baseSort])

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

      {/* Sort row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('sortBy')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {canEditSorting && (
            <Link to="/admin?tab=partner-settings&sub=sorting" className="helper" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {t('sorting.editOrder')}
            </Link>
          )}
          <select aria-label="Sort partners by" value={sortBy}
            onChange={(e) => { setSortTouched(true); setSortBy(e.target.value as 'owed' | 'name' | 'custom') }}
            style={{ height: BTN_H, borderRadius: 8, padding: '0 10px' }}>
            <option value="owed">{t('partners.sortOwed')}</option>
            <option value="name">{t('partners.sortName')}</option>
            {customAvailable && <option value="custom">{t('sorting.custom')}</option>}
          </select>
        </div>
      </div>

      <div style={{ height: 8 }} />

      {err && <p style={{ color: 'var(--color-error)', marginTop: 8 }}>{t('error')} {err}</p>}

      {/* List */}
      <div>
        {loading ? (
          <p>{t('loading')}</p>
        ) : sortedVisible.length === 0 ? (
          <p className="helper">{t('partners.noPartners')}</p>
        ) : (
          <div>
            {sortedVisible.map((p) => (
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

      {query && sortedVisible.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setQuery('')}>{t('clearSearch')}</button>
        </div>
      )}
    </div>
  )
}
