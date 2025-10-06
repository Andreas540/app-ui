// src/pages/InvoicePreview.tsx
import { useLocation, useNavigate } from 'react-router-dom'

type InvoiceData = {
  invoiceNo: string
  invoiceDate: string
  dueDate: string
  deliveryDate: string
  paymentMethod: string
  customer: {
    name: string
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
  }
  orders: Array<{
    product: string
    quantity: number
    unit_price: number
    amount: number
  }>
}

export default function InvoicePreview() {
  const location = useLocation()
  const navigate = useNavigate()
  const invoiceData = location.state as InvoiceData

  if (!invoiceData) {
    return (
      <div className="card">
        <p>No invoice data found. Please create an invoice first.</p>
        <button onClick={() => navigate('/invoices/create')}>Create Invoice</button>
      </div>
    )
  }

  const { invoiceNo, invoiceDate, dueDate, deliveryDate, paymentMethod, customer, orders } = invoiceData

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  const fmtMoney = (n: number) => `$${Number(n).toFixed(2)}`

  const subtotal = orders.reduce((sum, order) => sum + order.amount, 0)
  const total = subtotal

  const handlePrint = () => {
    window.print()
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      {/* Print button - only visible on screen */}
      <div className="no-print" style={{ padding: 20, borderBottom: '1px solid #ddd' }}>
        <button
          onClick={handlePrint}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            marginRight: 12
          }}
        >
          Print Invoice
        </button>
        <button
          onClick={() => navigate('/invoices/create')}
          style={{
            padding: '10px 20px',
            border: '1px solid #ddd',
            borderRadius: 10,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          Back to Create
        </button>
      </div>

      {/* Invoice content - US Letter proportions */}
      <div style={{ 
        maxWidth: '100%',
        width: '100%',
        margin: '0 auto', 
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        color: '#333',
        background: '#fff',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Logo placeholder */}
            <div style={{ 
              width: 100, 
              height: 100, 
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: 20,
              flexShrink: 0
            }}>
              BLV
            </div>

            {/* Company info */}
            <div style={{ fontSize: 12, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 6 }}>BLV Pack Design LLC</div>
              <div>13967 SW 119th Ave</div>
              <div>Miami, FL 33186</div>
              <div style={{ marginTop: 4 }}>(305) 798-3317</div>
            </div>
          </div>

          {/* Invoice details */}
          <div style={{ fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', maxWidth: 300 }}>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice #</div>
              <div>{invoiceNo}</div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Invoice date</div>
              <div>{formatDate(invoiceDate)}</div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Due date</div>
              <div>{formatDate(dueDate)}</div>
              <div style={{ fontWeight: 'bold', color: '#1a4d8f' }}>Est. delivery date</div>
              <div>{formatDate(deliveryDate)}</div>
            </div>
          </div>
        </div>

        {/* Invoice for, Payment method, Wire Transfer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {/* Invoice for */}
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 6 }}>Invoice for</div>
            <div>{customer.name}</div>
            {customer.address1 && <div>{customer.address1}</div>}
            {customer.address2 && <div>{customer.address2}</div>}
            <div>{[customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}</div>
          </div>

          {/* Payment method + Our contact */}
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 6 }}>Payment method</div>
            <div style={{ marginBottom: 12 }}>{paymentMethod}</div>
            
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 6 }}>Our contact</div>
            <div>Julian de Armas</div>
          </div>

          {/* Wire Transfer Instructions */}
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 6 }}>Wire Transfer Instructions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 11 }}>
              <div>Company Name:</div>
              <div>BLV Pack Design LLC</div>
              <div>Bank Name:</div>
              <div>Bank of America</div>
              <div>Account Name:</div>
              <div>BLV Pack Design LLC</div>
              <div>Account Number:</div>
              <div>898161854242</div>
              <div style={{ whiteSpace: 'nowrap' }}>Routing Number (ABA):</div>
              <div>026009593</div>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div style={{ marginTop: 40, borderTop: '1px solid #ddd' }}>
          {/* Table header */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 100px 120px 140px',
            gap: 16,
            padding: '12px 0',
            fontWeight: 'bold',
            color: '#1a4d8f',
            fontSize: 14,
            borderBottom: '1px solid #ddd'
          }}>
            <div>Description</div>
            <div style={{ textAlign: 'right' }}>Qty</div>
            <div style={{ textAlign: 'right' }}>Unit price</div>
            <div style={{ textAlign: 'right' }}>Total price</div>
          </div>

          {/* Table rows */}
          {orders.map((order, index) => (
            <div 
              key={index}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 100px 120px 140px',
                gap: 16,
                padding: '12px 0',
                fontSize: 14,
                borderBottom: '1px solid #eee'
              }}
            >
              <div>{order.product}</div>
              <div style={{ textAlign: 'right' }}>{order.quantity}</div>
              <div style={{ textAlign: 'right' }}>{fmtMoney(order.unit_price)}</div>
              <div style={{ textAlign: 'right' }}>{fmtMoney(order.amount)}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginTop: 40, borderTop: '2px solid #333', paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, fontSize: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: 12 }}>Subtotal</div>
              <div style={{ marginBottom: 12 }}>Adjustments/Discount</div>
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>Total</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 140 }}>
              <div style={{ marginBottom: 12 }}>{fmtMoney(subtotal)}</div>
              <div style={{ marginBottom: 12 }}>-</div>
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>{fmtMoney(total)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}