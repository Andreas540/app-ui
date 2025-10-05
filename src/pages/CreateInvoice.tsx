// src/pages/CreateInvoice.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Customer = {
  id: string
  name: string
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

export default function CreateInvoicePage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/create-invoice`, { cache: 'no-store' })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load customers (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setCustomers(data.customers)
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Create Invoice</h2>
        <Link to="/" className="helper">&larr; Back</Link>
      </div>

      {loading && <p>Loading customers...</p>}
      {error && <p style={{ color: 'salmon' }}>Error: {error}</p>}

      {!loading && !error && (
        <>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="customer-select" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Select customer
            </label>
            <select
              id="customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #ddd',
                borderRadius: 4,
              }}
            >
              <option value="">-- Select a customer --</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCustomer && (
            <div style={{ padding: 16, backgroundColor: 'var(--panel)', borderRadius: 4 }}>
              <h4 style={{ margin: '0 0 12px 0' }}>Customer Address</h4>
              <div>
                {selectedCustomer.address1 && <div>{selectedCustomer.address1}</div>}
                {selectedCustomer.address2 && <div>{selectedCustomer.address2}</div>}
                {(selectedCustomer.city || selectedCustomer.state || selectedCustomer.postal_code) && (
                  <div>
                    {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.postal_code]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                )}
                {!selectedCustomer.address1 && !selectedCustomer.address2 && !selectedCustomer.city && (
                  <div className="helper">No address on file</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

