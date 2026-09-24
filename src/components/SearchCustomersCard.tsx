import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

function isDirectType(ct: string | null | undefined) {
  return !!ct && ct !== 'Partner'
}

interface Props {
  defaultOpen?: boolean
  hideHeader?: boolean
}

export default function SearchCustomersCard({ defaultOpen = false, hideHeader = false }: Props) {
  const { t } = useTranslation()
  const { fmtIntMoney } = useCurrency()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const directLabel = config.labels.directLabel

  const [open, setOpen]           = useState(defaultOpen || hideHeader)
  const [query, setQuery]         = useState('')
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'All' | 'Direct' | 'Partner'>('All')
  const [sortBy, setSortBy]       = useState<'owed' | 'name'>('owed')
  const fetchedRef = useRef(false)
  const BTN_H = 'calc(var(--control-h) * 0.67)'

  async function fetchCustomers(q?: string) {
    setLoading(true); setErr(null)
    try {
      const res = await listCustomersWithOwed(q?.trim() || undefined)
      setCustomers(res.customers)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // Load on first open
  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    fetchCustomers()
  }, [open])

  // Re-fetch when query changes (debounced via re-render)
  useEffect(() => {
    if (!fetchedRef.current) return
    fetchCustomers(query)
  }, [query])

  const visible = useMemo(() => {
    if (filterType === 'All') return customers
    if (filterType === 'Direct') return customers.filter(c => isDirectType((c as any).customer_type))
    return customers.filter(c => (c as any).customer_type === filterType)
  }, [customers, filterType])

  const sortedVisible = useMemo(() => {
    const arr = [...visible]
    if (sortBy === 'owed') arr.sort((a, b) => Number(b.owed_to_me || 0) - Number(a.owed_to_me || 0))
    else arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return arr
  }, [visible, sortBy])

  return (
    <div className="card page-normal" style={{ marginTop: 12 }}>
      {!hideHeader && (
        <div
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 12 : 0 }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('customers.title')}</h3>
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Filter buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <button className="primary" onClick={() => setFilterType('All')}     aria-pressed={filterType === 'All'}     style={{ height: BTN_H }}>{t('customers.allFilter')}</button>
            <button className="primary" onClick={() => setFilterType('Direct')}  aria-pressed={filterType === 'Direct'}  style={{ height: BTN_H }}>{directLabel}</button>
            <button className="primary" onClick={() => setFilterType('Partner')} aria-pressed={filterType === 'Partner'} style={{ height: BTN_H }}>{t('customers.partnerFilter')}</button>
          </div>

          {/* Search + sort */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('customers.searchPlaceholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select
              aria-label="Sort customers by"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'owed' | 'name')}
              style={{ height: 'var(--control-h)', borderRadius: 8, padding: '0 10px' }}
            >
              <option value="owed">{t('customers.sortOwed')}</option>
              <option value="name">{t('customers.sortName')}</option>
            </select>
          </div>

          {err && <p style={{ color: 'var(--color-error)', margin: 0 }}>{t('error')} {err}</p>}

          {/* Customer list */}
          <div>
            {loading ? (
              <p style={{ margin: 0 }}>{t('loading')}</p>
            ) : sortedVisible.length === 0 ? (
              <p className="helper" style={{ margin: 0 }}>{t('customers.noCustomers')}</p>
            ) : (
              sortedVisible.map(c => (
                <Link key={c.id} to={`/customers/${c.id}`} className="row-link">
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="helper">
                      {(ct => (ct === 'Direct' || ct === 'BLV') ? directLabel : (ct ?? '—'))((c as any).customer_type)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                    {fmtIntMoney(c.owed_to_me)}
                  </div>
                </Link>
              ))
            )}
          </div>

          {query && sortedVisible.length === 1 && (
            <button className="primary" onClick={() => setQuery('')}>{t('clearSearch')}</button>
          )}
        </div>
      )}
    </div>
  )
}
