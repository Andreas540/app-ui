// src/pages/InvoicePreview.tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

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

  useEffect(() => {
    // Add print-specific styles to body
    document.body.style.background = '#fff'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    
    return () => {
      document.body.style.background = ''
      document.body.style.margin = ''
      document.body.style.padding = ''
    }
  }, [])

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
    <>
      {/* Print buttons - only visible on screen */}
      <div className="no-print" style={{ 
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
        gap: 12
      }}>
        <button
          onClick={handlePrint}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 10,
            background: '#007bff',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        >
          Print Invoice
        </button>
        <button
          onClick={() => navigate('/invoices/create')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 10,
            background: '#6c757d',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        >
          Back
        </button>
      </div>

      {/* Invoice - this IS the page */}
      <div className="invoice-page" style={{ 
        width: '8.5in',
        height: '11in',
        margin: '0 auto',
        padding: '0.5in',
        fontFamily: 'Arial, sans-serif',
        color: '#333',
        background: '#fff',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 2.8in', gap: '0.25in', marginBottom: '0.3in' }}>
          <div style={{ 
            width: 100, 
            height: 100, 
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 20
          }}>
            BLV
          </div>

          <div style={{ fontSize: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>BLV Pack Design LLC</div>
            <div>13967 SW 119th Ave</div>
            <div>Miami, FL 33186</div>
            <div style={{ marginTop: 8 }}>(305) 798-3317</div>
          </div>

          <div style={{ fontSize: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2.8in', gap: '0.25in', marginBottom: '0.3in' }}>
          <div style={{ fontSize: 14 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Invoice for</div>
            <div>{customer.name}</div>
            {customer.address1 && <div>{customer.address1}</div>}
            {customer.address2 && <div>{customer.address2}</div>}
            <div>{[customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}</div>
          </div>

          <div style={{ fontSize: 14 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Payment method</div>
            <div style={{ marginBottom: 16 }}>{paymentMethod}</div>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Our contact</div>
            <div>Julian de Armas</div>
          </div>

          <div style={{ fontSize: 14 }}>
            <div style={{ fontWeight: 'bold', color: '#1a4d8f', marginBottom: 8 }}>Wire Transfer Instructions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 13 }}>
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ borderTop: '1px solid #ddd' }}>
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

          <div style={{ flex: 1 }}></div>

          <div style={{ borderTop: '2px solid #333', paddingTop: 16, marginTop: 16 }}>
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

      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { 
            display: none !important; 
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          .invoice-page {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
        @media screen and (max-width: 900px) {
          .invoice-page {
            transform: scale(0.45);
            transform-origin: top center;
            margin-bottom: -500px;
          }
        }
      `}</style>
    </>
  )
}