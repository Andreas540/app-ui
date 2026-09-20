// src/components/SearchOrdersCard.tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { formatDate } from '../lib/time'
import { useCurrency } from '../lib/useCurrency'

type Supplier = { id: string; name: string }

type POItem = {
  id: string
  product_id: string | null
  product_name: string | null
  variant: string | null
  variant_2: string | null
  qty: number | null
  unit_price: number | null
}

type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string | null
  supplier_name: string | null
  issue_date: string
  exp_date: string | null
  notes: string | null
  total_amount: number | null
  remaining_amount: number | null
  doc_name: string | null
  items: POItem[]
}

type Tab = 'po' | 'supplier'

interface SearchOrdersCardProps {
  suppliers: Supplier[]
}

export default function SearchOrdersCard({ suppliers }: SearchOrdersCardProps) {
  const { t } = useTranslation()
  const { fmtMoney, fmtNumber } = useCurrency()

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('po')

  // PO state
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [posLoading, setPosLoading] = useState(false)
  const [posErr, setPosErr] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  const [search, setSearch] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fetch all POs once when the card opens
  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    setPosLoading(true)
    setPosErr(null)
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    fetch(`${base}/.netlify/functions/purchase-orders`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setPos(d?.purchase_orders ?? []))
      .catch(() => setPosErr('Failed to load purchase orders'))
      .finally(() => setPosLoading(false))
  }, [open])

  const filteredPos = pos.filter(po => {
    if (filterSupplier && po.supplier_id !== filterSupplier) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return (
        po.po_number.toLowerCase().includes(q) ||
        (po.supplier_name ?? '').toLowerCase().includes(q) ||
        (po.notes ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const CONTROL_H = 36

  const segBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '4px 14px',
        fontSize: 13,
        border: 'none',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : undefined,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const remainingColor = (remaining: number | null, total: number | null) => {
    if (remaining == null || total == null || total === 0) return undefined
    const pct = remaining / total
    if (pct <= 0) return 'var(--color-error)'
    if (pct < 0.2) return 'var(--color-warning, #f59e0b)'
    return 'var(--color-success)'
  }

  function productLabel(item: POItem) {
    return [item.product_name, item.variant, item.variant_2].filter(Boolean).join(' · ') || '—'
  }

  return (
    <div className="card page-normal" style={{ marginTop: 12 }}>
      {/* Header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
        <h3 style={{ margin: 0 }}>Search Orders</h3>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Sub-tab toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 14 }}>
            {segBtn('Purchase Orders', tab === 'po', () => setTab('po'))}
            {segBtn('Supplier Orders', tab === 'supplier', () => setTab('supplier'))}
          </div>

          {tab === 'po' && (
            <>
              {/* Filters */}
              <div className="row" style={{ marginBottom: 10 }}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <input
                    type="text"
                    placeholder="Search by PO number, supplier, notes…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ height: CONTROL_H }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <select
                    value={filterSupplier}
                    onChange={e => setFilterSupplier(e.target.value)}
                    style={{ height: CONTROL_H }}
                  >
                    <option value="">All suppliers</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Results */}
              {posLoading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('loading')}</p>}
              {posErr && <p style={{ fontSize: 13, color: 'var(--color-error)' }}>{posErr}</p>}

              {!posLoading && !posErr && filteredPos.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {pos.length === 0 ? 'No purchase orders yet.' : 'No results match your search.'}
                </p>
              )}

              {!posLoading && filteredPos.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <th style={{ textAlign: 'left',  padding: '4px 8px 6px 0' }}>PO #</th>
                        <th style={{ textAlign: 'left',  padding: '4px 8px 6px' }}>Supplier</th>
                        <th style={{ textAlign: 'left',  padding: '4px 8px 6px' }}>Issue date</th>
                        <th style={{ textAlign: 'right', padding: '4px 0 6px 8px' }}>Total</th>
                        <th style={{ textAlign: 'right', padding: '4px 0 6px 8px' }}>Remaining</th>
                        <th style={{ width: 20 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPos.map(po => {
                        const isExpanded = expandedId === po.id
                        return (
                          <>
                            <tr
                              key={po.id}
                              onClick={() => setExpandedId(isExpanded ? null : po.id)}
                              style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
                            >
                              <td style={{ padding: '7px 8px 7px 0', fontWeight: 600 }}>{po.po_number}</td>
                              <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{po.supplier_name ?? '—'}</td>
                              <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatDate(po.issue_date)}</td>
                              <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {po.total_amount != null ? fmtMoney(po.total_amount) : '—'}
                              </td>
                              <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: remainingColor(po.remaining_amount, po.total_amount) }}>
                                {po.remaining_amount != null ? fmtMoney(po.remaining_amount) : '—'}
                              </td>
                              <td style={{ padding: '7px 0 7px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 11 }}>
                                {isExpanded ? '▲' : '▼'}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr key={`${po.id}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={6} style={{ padding: '0 0 10px 0' }}>
                                  <div style={{ background: 'var(--surface-subtle, var(--bg-subtle, #f8f8f8))', borderRadius: 6, padding: '10px 12px', marginTop: 4 }}>

                                    {/* Meta row */}
                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: po.items.length > 0 ? 10 : 0 }}>
                                      {po.exp_date && (
                                        <div style={{ fontSize: 12 }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>Expiry: </span>
                                          {formatDate(po.exp_date)}
                                        </div>
                                      )}
                                      {po.notes && (
                                        <div style={{ fontSize: 12 }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>Notes: </span>
                                          {po.notes}
                                        </div>
                                      )}
                                      {po.doc_name && (
                                        <div style={{ fontSize: 12 }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>Document: </span>
                                          {po.doc_name}
                                        </div>
                                      )}
                                    </div>

                                    {/* Line items */}
                                    {po.items.length > 0 && (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            <th style={{ textAlign: 'left', padding: '2px 8px 4px 0' }}>Product</th>
                                            <th style={{ textAlign: 'right', padding: '2px 8px 4px' }}>Qty</th>
                                            <th style={{ textAlign: 'right', padding: '2px 0 4px 8px' }}>Unit price</th>
                                            <th style={{ textAlign: 'right', padding: '2px 0 4px 8px' }}>Line total</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {po.items.map(item => {
                                            const lineTotal = item.qty != null && item.unit_price != null
                                              ? item.qty * item.unit_price : null
                                            return (
                                              <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: '4px 8px 4px 0' }}>{productLabel(item)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {item.qty != null ? fmtNumber(item.qty) : '—'}
                                                </td>
                                                <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {item.unit_price != null ? fmtMoney(item.unit_price) : '—'}
                                                </td>
                                                <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                  {lineTotal != null ? fmtMoney(lineTotal) : '—'}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    )}

                                    {po.items.length === 0 && (
                                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total only — no product breakdown.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'supplier' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Supplier order search — coming soon.</p>
          )}
        </div>
      )}
    </div>
  )
}
