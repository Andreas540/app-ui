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

type Order = {
  order_id: string
  item_id: string
  product: string
  quantity: number
  unit_price: number
  amount: number
  order_date: string
}

export default function CreateInvoicePage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [confirmedOrders, setConfirmedOrders] = useState<Order[]>([])
  const [showingConfirmed, setShowingConfirmed] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('Wire Transfer')
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(false)
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

  useEffect(() => {
    if (!selectedCustomerId) {
      setOrders([])
      setSelectedOrders(new Set())
      return
    }

    (async () => {
      try {
        setOrdersLoading(true)
        setError(null)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/create-invoice?customerId=${selectedCustomerId}`, { cache: 'no-store' })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load orders (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setOrders(data.orders)
        setSelectedOrders(new Set())
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setOrdersLoading(false)
      }
    })()
  }, [selectedCustomerId])

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  const toggleOrder = (itemId: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedOrders(newSelected)
  }

  const handleChooseSelected = () => {
    const selected = orders.filter(o => selectedOrders.has(o.item_id))
    setConfirmedOrders(selected)
    setShowingConfirmed(true)
  }

  const handleNewSelection = () => {
    setShowingConfirmed(false)
    setSelectedOrders(new Set())
  }

  const fmtMoney = (n: number) => `$${Number(n).toFixed(2)}`
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`
  }

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
          <div style={{ display: 'flex', gap: 40, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
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
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8, height: 21 }}></div>
                <div style={{ fontSize: 14 }}>
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
          </div>

          {selectedCustomerId && (
            <>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Select orders to be included
              </label>
              
              {ordersLoading && <p>Loading orders...</p>}
              
              {!ordersLoading && orders.length === 0 && (
                <p className="helper">No orders found for this customer.</p>
              )}

              {!ordersLoading && orders.length > 0 && (
                <>
                  {!showingConfirmed ? (
                    <>
                      <div style={{
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        maxHeight: 300,
                        overflowY: 'auto',
                        marginBottom: 12
                      }}>
                        {orders.map(order => (
                          <div
                            key={order.item_id}
                            style={{
                              display: 'flex',
                              gap: 12,
                              padding: '12px 16px',
                              borderBottom: '1px solid #eee',
                              alignItems: 'flex-start',
                              fontSize: 14,
                              color: '#fff'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOrders.has(order.item_id)}
                              onChange={() => toggleOrder(order.item_id)}
                              style={{ 
                                cursor: 'pointer', 
                                width: 14, 
                                height: 14,
                                marginTop: 2,
                                flexShrink: 0
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '70px 1fr 80px',
                                gap: 12,
                                marginBottom: 4
                              }}>
                                <div style={{ whiteSpace: 'nowrap' }}>{formatDate(order.order_date)}</div>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.product}</div>
                                <div style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(order.amount)}</div>
                              </div>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '70px 1fr 80px',
                                gap: 12
                              }}>
                                <div>{order.quantity}</div>
                                <div>{fmtMoney(order.unit_price)}</div>
                                <div></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleChooseSelected}
                        disabled={selectedOrders.size === 0}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          borderRadius: 10,
                          background: selectedOrders.size === 0 ? '#ccc' : 'var(--accent)',
                          color: '#fff',
                          cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
                          fontSize: 14,
                          fontWeight: 500
                        }}
                      >
                        Choose selected
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, marginBottom: 20 }}>
                        {confirmedOrders.map(order => (
                          <div key={order.item_id} style={{ marginBottom: 8 }}>
                            <div>{formatDate(order.order_date)} - {order.product}</div>
                            <div style={{ marginLeft: 20 }}>
                              Qty: {order.quantity} × {fmtMoney(order.unit_price)} = {fmtMoney(order.amount)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleNewSelection}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          borderRadius: 10,
                          background: 'var(--accent)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 500,
                          marginBottom: 20
                        }}
                      >
                        New selection
                      </button>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <label htmlFor="invoice-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Invoice date
                          </label>
                          <input
                            id="invoice-date"
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>

                        <div>
                          <label htmlFor="due-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Due date
                          </label>
                          <input
                            id="due-date"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label htmlFor="delivery-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Est. delivery date
                          </label>
                          <input
                            id="delivery-date"
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>

                        <div>
                          <label htmlFor="payment-method" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Payment method
                          </label>
                          <select
                            id="payment-method"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          >
                            <option value="Wire Transfer">Wire Transfer</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

