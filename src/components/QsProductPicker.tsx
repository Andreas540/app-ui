import { useEffect, useMemo, useRef, useState } from 'react'
import { listProducts, type ProductWithCost } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

interface Props {
  onSelect: (product: ProductWithCost) => void
  maxHeight?: number
}

export default function QsProductPicker({ onSelect, maxHeight = 320 }: Props) {
  const { fmtMoney } = useCurrency()
  const { user } = useAuth()
  const pageFields = getTenantConfig(user?.tenantId).pages['new-product']?.fields ?? {}
  const showVariant = pageFields.variant !== false

  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [q, setQ] = useState('')
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    listProducts()
      .then(({ products: raw }) => setProducts(raw.filter(p => p.product_kind !== 'addon' && (p.category ?? 'product') === 'product')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.variant ?? '').toLowerCase().includes(query) ||
      (p.variant_2 ?? '').toLowerCase().includes(query) ||
      (p.sku ?? '').toLowerCase().includes(query) ||
      (p.barcode ?? '').toLowerCase().includes(query)
    )
  }, [products, q])

  return (
    <div style={{ marginTop: 10 }}>
      <input
        type="text"
        placeholder="Search by name, variant, SKU…"
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
        autoFocus
      />
      <div style={{ overflowY: 'auto', maxHeight }}>
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 13 }}>{q ? 'No products match.' : 'No products found.'}</div>
        )}
        {!loading && filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thSt}>Name</th>
                {showVariant && <th style={thSt}>Variant</th>}
                {showVariant && <th style={thSt}>Variant 2</th>}
                <th style={{ ...thSt, textAlign: 'right' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={tdSt}>{p.name}</td>
                  {showVariant && <td style={{ ...tdSt, color: p.variant ? undefined : 'var(--text-secondary)' }}>{p.variant || '—'}</td>}
                  {showVariant && <td style={{ ...tdSt, color: p.variant_2 ? undefined : 'var(--text-secondary)' }}>{p.variant_2 || '—'}</td>}
                  <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {p.price_amount != null ? fmtMoney(p.price_amount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const thSt: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  padding: '3px 8px 3px 0',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdSt: React.CSSProperties = {
  padding: '5px 8px 5px 0',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}
