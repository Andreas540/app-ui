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

type SortCol = 'name' | 'type' | 'owed'

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
  // When used from Search page (hideHeader), sort by column clicks only; no dropdown
  // When used from Customers page, the sort dropdown is shown (default: owed desc)
  const [sortCol, setSortCol]     = useState<SortCol>('owed')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
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

  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    fetchCustomers()
  }, [open])

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
    arr.sort((a, b) => {
      let v = 0
      if (sortCol === 'name')   v = (a.name || '').localeCompare(b.name || '')
      else if (sortCol === 'type') v = ((a as any).customer_type || '').localeCompare((b as any).customer_type || '')
      else                      v = Number(a.owed_to_me || 0) - Number(b.owed_to_me || 0)
      return sortDir === 'asc' ? v : -v
    })
    return arr
  }, [visible, sortCol, sortDir])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'owed' ? 'desc' : 'asc') }
  }

  function colTh(col: SortCol, label: string, align: 'left' | 'right' = 'left') {
    const active = sortCol === col
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{
          fontSize: 12, fontWeight: 600, color: active ? 'var(--primary)' : 'var(--text-secondary)',
          padding: align === 'right' ? '4px 0 4px 8px' : '4px 8px 4px 0',
          borderBottom: '1px solid var(--border)', textAlign: align,
          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        }}
      >{label}{arrow}</th>
    )
  }

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

          {/* Search + optional sort dropdown (only when not on Search page) */}
          <div style={{ display: 'grid', gridTemplateColumns: hideHeader ? '1fr' : '1fr auto', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('customers.searchPlaceholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {!hideHeader && (
              <select
                aria-label="Sort customers by"
                value={sortCol === 'name' ? 'name' : 'owed'}
                onChange={e => { setSortCol(e.target.value as SortCol); setSortDir('desc') }}
                style={{ height: 'var(--control-h)', borderRadius: 8, padding: '0 10px' }}
              >
                <option value="owed">{t('customers.sortOwed')}</option>
                <option value="name">{t('customers.sortName')}</option>
              </select>
            )}
          </div>

          {err && <p style={{ color: 'var(--color-error)', margin: 0 }}>{t('error')} {err}</p>}

          {/* Customer table */}
          {loading ? (
            <p style={{ margin: 0 }}>{t('loading')}</p>
          ) : sortedVisible.length === 0 ? (
            <p className="helper" style={{ margin: 0 }}>{t('customers.noCustomers')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {colTh('name', t('name'))}
                    {colTh('type', t('customers.type', { defaultValue: 'Type' }))}
                    {colTh('owed', t('customers.totalOwedToMe'), 'right')}
                  </tr>
                </thead>
                <tbody>
                  {sortedVisible.map(c => {
                    const ct = (c as any).customer_type
                    const typeLabel = (ct === 'Direct' || ct === 'BLV') ? directLabel : (ct ?? '—')
                    return (
                      <tr key={c.id} style={{ cursor: 'pointer' }}>
                        <td style={{ padding: '6px 8px 6px 0', borderBottom: '1px solid var(--border)' }}>
                          <Link to={`/customers/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600, display: 'block' }}>
                            {c.name}
                          </Link>
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <Link to={`/customers/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                            {typeLabel}
                          </Link>
                        </td>
                        <td style={{ padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <Link to={`/customers/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                            {fmtIntMoney(c.owed_to_me)}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {query && sortedVisible.length === 1 && (
            <button className="primary" onClick={() => setQuery('')}>{t('clearSearch')}</button>
          )}
        </div>
      )}
    </div>
  )
}
