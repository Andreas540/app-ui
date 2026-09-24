import { useState } from 'react'
import SearchCustomersCard from '../components/SearchCustomersCard'
import SearchCustomerOrdersCard from '../components/SearchCustomerOrdersCard'
import SearchProductsCard from '../components/SearchProductsCard'
import SearchOrdersCard from '../components/SearchOrdersCard'

type SearchType = 'customers' | 'customer_orders' | 'products' | 'supply_orders'

const OPTIONS: Array<{ value: SearchType; label: string }> = [
  { value: 'customers',      label: 'Customers' },
  { value: 'customer_orders', label: 'Customer Orders' },
  { value: 'products',       label: 'Products' },
  { value: 'supply_orders',  label: 'Supply Orders' },
]

export default function Search() {
  const [type, setType] = useState<SearchType>('customers')

  return (
    <div className="card page-normal">
      <h3 style={{ margin: '0 0 16px' }}>Search</h3>

      {/* Search type selector — row on desktop, wraps on mobile */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginBottom: 20 }}>
        {OPTIONS.map(opt => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 15, whiteSpace: 'nowrap' }}>
            <input
              type="radio"
              name="search-type"
              value={opt.value}
              checked={type === opt.value}
              onChange={() => setType(opt.value)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {/* Selected search module */}
      {type === 'customers'       && <SearchCustomersCard hideHeader defaultOpen />}
      {type === 'customer_orders' && <SearchCustomerOrdersCard hideHeader defaultOpen />}
      {type === 'products'        && <SearchProductsCard hideHeader defaultOpen />}
      {type === 'supply_orders'   && <SearchOrdersCard hideHeader defaultOpen />}
    </div>
  )
}
