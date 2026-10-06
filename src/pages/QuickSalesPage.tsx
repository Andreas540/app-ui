import { useEffect, useState } from 'react'
import { fetchBootstrap, createCustomer } from '../lib/api'

export default function QuickSalesPage() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  useEffect(() => {
    ;(async () => {
      try {
        const { customers } = await fetchBootstrap()
        if (!customers.find(c => c.name === 'Quick Sales')) {
          await createCustomer({ name: 'Quick Sales' })
        }
        setStatus('ready')
      } catch {
        setStatus('ready') // non-fatal — charge flow will auto-create if still missing
      }
    })()
  }, [])

  return (
    <div className="card page-narrow" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🛒</div>
      <h2 style={{ margin: '0 0 10px' }}>Quick Sale</h2>
      {status === 'checking' ? (
        <p className="helper">Setting up…</p>
      ) : (
        <p className="helper" style={{ fontSize: 16 }}>Scan a product barcode to add it to the cart.</p>
      )}
    </div>
  )
}
