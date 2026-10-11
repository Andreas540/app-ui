import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExistingCosts } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

interface RecurringCostSummary {
  cost_type: string
  start_month: string
  total_amount: number
  details: Array<{ id: number | string; cost: string; amount: number; start_date?: string; end_date?: string; recur_kind?: string; recur_interval?: number }>
}

interface NonRecurringCostSummary {
  cost_type: string
  month: string
  total_amount: number
  details: Array<{ id: number | string; cost: string; amount: number; cost_date?: string }>
}

interface Props {
  hideHeader?: boolean
  defaultOpen?: boolean
  onEdit?: (id: number | string, costType: 'recurring' | 'non-recurring', detail: any, bp: 'B' | 'P') => void
  refreshKey?: number
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function SearchCostsCard({ hideHeader = false, defaultOpen = false, onEdit, refreshKey = 0 }: Props) {
  const { t } = useTranslation()
  const { fmtMoney } = useCurrency()

  const [open, setOpen] = useState(defaultOpen || hideHeader)

  const now = new Date()
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [filterType, setFilterType] = useState<'all' | 'B' | 'P'>('B')
  const [filterKind, setFilterKind] = useState<'all' | 'recurring' | 'non-recurring'>('all')

  const [bRecurring,    setBRecurring]    = useState<RecurringCostSummary[]>([])
  const [bNonRecurring, setBNonRecurring] = useState<NonRecurringCostSummary[]>([])
  const [pRecurring,    setPRecurring]    = useState<RecurringCostSummary[]>([])
  const [pNonRecurring, setPNonRecurring] = useState<NonRecurringCostSummary[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggleExpanded(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const y = selectedYear
    const m = selectedMonth
    if (filterType === 'all') {
      Promise.all([getExistingCosts('B', y, m), getExistingCosts('P', y, m)])
        .then(([b, p]) => {
          setBRecurring(b.recurring ?? [])
          setBNonRecurring(b.nonRecurring ?? [])
          setPRecurring(p.recurring ?? [])
          setPNonRecurring(p.nonRecurring ?? [])
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      getExistingCosts(filterType, y, m)
        .then(res => {
          if (filterType === 'B') {
            setBRecurring(res.recurring ?? [])
            setBNonRecurring(res.nonRecurring ?? [])
            setPRecurring([])
            setPNonRecurring([])
          } else {
            setPRecurring(res.recurring ?? [])
            setPNonRecurring(res.nonRecurring ?? [])
            setBRecurring([])
            setBNonRecurring([])
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [open, filterType, selectedYear, selectedMonth, refreshKey])

  const monthOptions: { year: number; month: number }[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  type Section =
    | { label: string; items: RecurringCostSummary[];    kind: 'recurring';     bp: 'B' | 'P' }
    | { label: string; items: NonRecurringCostSummary[]; kind: 'non-recurring'; bp: 'B' | 'P' }

  const sections: Section[] = []
  if (filterType !== 'P' && filterKind !== 'non-recurring' && bRecurring.length > 0)
    sections.push({ label: t('costs.businessRecurring'), items: bRecurring, kind: 'recurring', bp: 'B' })
  if (filterType !== 'P' && filterKind !== 'recurring' && bNonRecurring.length > 0)
    sections.push({ label: t('costs.businessNonRecurring'), items: bNonRecurring, kind: 'non-recurring', bp: 'B' })
  if (filterType !== 'B' && filterKind !== 'non-recurring' && pRecurring.length > 0)
    sections.push({ label: t('costs.privateRecurring'), items: pRecurring, kind: 'recurring', bp: 'P' })
  if (filterType !== 'B' && filterKind !== 'recurring' && pNonRecurring.length > 0)
    sections.push({ label: t('costs.privateNonRecurring'), items: pNonRecurring, kind: 'non-recurring', bp: 'P' })

  const detailCols = onEdit ? '80px 1fr auto 60px' : '80px 1fr auto'

  return (
    <div className="card page-normal" style={{ marginTop: 16 }}>
      {!hideHeader && (
        <div
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 16 : 0 }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('costs.allCosts', 'All Costs')}</h3>
        </div>
      )}

      {open && (
        <>
          {/* Year / Month */}
          <select
            value={`${selectedYear}-${selectedMonth}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSelectedYear(y); setSelectedMonth(m)
            }}
            style={{ marginBottom: 12 }}
          >
            {monthOptions.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {MONTH_NAMES[month - 1]} {year}
              </option>
            ))}
          </select>

          {/* Type filter */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 8 }}>
            {(['all', 'B', 'P'] as const).map(f => (
              <button key={f} onClick={() => { setFilterType(f); setFilterKind('all') }}
                style={{ padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                  background: filterType === f ? 'var(--primary)' : 'transparent',
                  color: filterType === f ? '#fff' : undefined }}>
                {f === 'all' ? t('costs.allCosts', 'All') : f === 'B' ? t('costs.business') : t('costs.private')}
              </button>
            ))}
          </div>

          {/* Kind filter */}
          {filterType !== 'all' && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 14 }}>
              {(['all', 'recurring', 'non-recurring'] as const).map(f => (
                <button key={f} onClick={() => setFilterKind(f)}
                  style={{ padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                    background: filterKind === f ? 'var(--primary)' : 'transparent',
                    color: filterKind === f ? '#fff' : undefined }}>
                  {f === 'all' ? t('all', 'All') : f === 'recurring' ? t('costs.recurring', 'Recurring') : t('costs.nonRecurring', 'Non-recurring')}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('costs.loadingCosts')}</div>
          ) : sections.length === 0 ? (
            <p className="helper">{t('costs.noCostsFound')}</p>
          ) : (
            sections.map((section, si) => (
              <div key={si} style={{ marginBottom: si < sections.length - 1 ? 28 : 0 }}>
                <h4 style={{ margin: '0 0 10px' }}>{section.label}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, paddingBottom: 8, borderBottom: '2px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
                  <div>{t('costs.monthColumn')}</div>
                  <div>{t('costs.costType')}</div>
                  <div style={{ textAlign: 'right' }}>{t('amount')}</div>
                </div>

                {section.kind === 'recurring'
                  ? (section.items as RecurringCostSummary[]).map((item, idx) => {
                      const key = `${si}-rec-${item.cost_type}-${item.start_month}`
                      const isExp = expandedKeys.has(key)
                      const hasDet = item.details?.length > 0
                      return (
                        <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10 }}>
                          <div onClick={() => hasDet && toggleExpanded(key)}
                            style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, cursor: hasDet ? 'pointer' : 'default' }}>
                            <div className="helper">{item.start_month || '—'}</div>
                            <div className="helper">{item.cost_type}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(item.total_amount)}</div>
                          </div>
                          {isExp && item.details.map((detail, di) => (
                            <div key={di} style={{ display: 'grid', gridTemplateColumns: detailCols, gap: 8, marginTop: 8, paddingLeft: 12, alignItems: 'center' }}>
                              <div />
                              <div className="helper">{detail.cost || t('costs.noDescription')}</div>
                              <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(detail.amount)}</div>
                              {onEdit && (
                                <button onClick={() => onEdit(detail.id, 'recurring', { ...detail, cost_type: item.cost_type }, section.bp)}
                                  style={{ padding: '4px 8px', fontSize: 12, height: 'auto', minHeight: 'unset' }}>{t('edit')}</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })
                  : (section.items as NonRecurringCostSummary[]).map((item, idx) => {
                      const key = `${si}-nr-${item.cost_type}-${item.month}`
                      const isExp = expandedKeys.has(key)
                      const hasDet = item.details?.length > 0
                      return (
                        <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10 }}>
                          <div onClick={() => hasDet && toggleExpanded(key)}
                            style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, cursor: hasDet ? 'pointer' : 'default' }}>
                            <div className="helper">{item.month || '—'}</div>
                            <div className="helper">{item.cost_type}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(item.total_amount)}</div>
                          </div>
                          {isExp && item.details.map((detail, di) => (
                            <div key={di} style={{ display: 'grid', gridTemplateColumns: detailCols, gap: 8, marginTop: 8, paddingLeft: 12, alignItems: 'center' }}>
                              <div />
                              <div className="helper">{detail.cost || t('costs.noDescription')}</div>
                              <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(detail.amount)}</div>
                              {onEdit && (
                                <button onClick={() => onEdit(detail.id, 'non-recurring', { ...detail, cost_type: item.cost_type }, section.bp)}
                                  style={{ padding: '4px 8px', fontSize: 12, height: 'auto', minHeight: 'unset' }}>{t('edit')}</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })
                }
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
