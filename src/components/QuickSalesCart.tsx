import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import { getAuthHeaders, fetchBootstrap, createCustomer, type ProductWithCost } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { useLocale } from '../contexts/LocaleContext'
import { todayYMD } from '../lib/time'
import QsProductPicker from './QsProductPicker'
import QsReceipt, { type QsReceiptData } from './QsReceipt'

export type QuickSalesCartHandle = {
  isActive: boolean
  addToCart: (product: ProductWithCost) => void
}

type QuickSaleLine = {
  product_id: string
  name: string
  variant: string | null
  variant_2: string | null
  qty: number
  unit_price: number
}

type QSTerminalState = 'idle' | 'initiating' | 'waiting' | 'cash-processing' | 'approved' | 'declined' | 'timeout'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

const QuickSalesCart = forwardRef<QuickSalesCartHandle>(function QuickSalesCart(_, ref) {
  const { timezone } = useLocale()
  const { fmtMoney } = useCurrency()

  const [lines, setLines] = useState<QuickSaleLine[]>([])
  const [open, setOpen] = useState(false)
  const [terminalState, setTerminalState] = useState<QSTerminalState>('idle')
  const [terminalMsg, setTerminalMsg] = useState('')
  const [cashOpen, setCashOpen] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [manualPickerOpen, setManualPickerOpen] = useState(false)
  const [receiptData, setReceiptData] = useState<QsReceiptData | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const receiptIdRef = useRef<string | null>(null)
  const orderIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootstrapRef = useRef<{ customerId: string | null } | null>(null)
  const companyRef = useRef<{ name?: string; address1?: string; address2?: string; phone?: string } | null>(null)
  const linesRef = useRef<QuickSaleLine[]>([])
  linesRef.current = lines

  function addProduct(product: ProductWithCost) {
    setLines(prev => {
      const idx = prev.findIndex(l => l.product_id === product.id)
      if (idx >= 0) return prev.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, {
        product_id: product.id,
        name: product.name,
        variant: product.variant ?? null,
        variant_2: product.variant_2 ?? null,
        qty: 1,
        unit_price: Number((product as any).price_amount ?? 0),
      }]
    })
    setOpen(true)
  }

  useImperativeHandle(ref, () => ({
    get isActive() { return linesRef.current.length > 0 },
    addToCart(product: ProductWithCost) { addProduct(product) },
  }), [])

  useEffect(() => {
    const handler = (e: Event) => addProduct((e as CustomEvent).detail as ProductWithCost)
    window.addEventListener('qs-add-to-cart', handler)
    return () => window.removeEventListener('qs-add-to-cart', handler)
  }, [])

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }

  async function deleteOrder() {
    const id = orderIdRef.current
    if (!id) return
    orderIdRef.current = null
    try {
      await fetch(`${BASE}/api/order`, {
        method: 'DELETE', headers: getAuthHeaders(),
        body: JSON.stringify({ id }),
      })
    } catch { /* best-effort */ }
  }

  async function chargeTerminal(orderId: string) {
    try {
      setTerminalState('initiating')
      setTerminalMsg('')
      const initRes = await fetch(`${BASE}/api/amp-terminal-initiate`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) throw new Error(initData.error || 'Failed to reach terminal')
      receiptIdRef.current = initData.receipt_id
      setTerminalState('waiting')
      timeoutRef.current = setTimeout(() => { stopPoll(); deleteOrder(); setTerminalState('timeout') }, 60_000)
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${BASE}/api/amp-terminal-poll`, {
            method: 'POST', headers: getAuthHeaders(),
            body: JSON.stringify({ receipt_id: receiptIdRef.current, order_id: orderId }),
          })
          const pd = await pr.json()
          if (pd.status === 'pending') return
          stopPoll()
          if (pd.status === 'approved') {
            orderIdRef.current = null
            setTerminalState('approved')
            setTerminalMsg(`Approved · ${pd.card_type || ''} ···${pd.last_four || ''}`.trim())
            window.dispatchEvent(new CustomEvent('qs-sale-completed'))
          } else {
            deleteOrder()
            setTerminalState('declined')
            setTerminalMsg(pd.message || 'Payment declined')
          }
        } catch { /* network hiccup */ }
      }, 3_000)
    } catch (e: any) {
      stopPoll(); setTerminalState('idle'); alert(e?.message || 'Terminal error')
    }
  }

  async function resolveCompanyInfo() {
    if (companyRef.current) return
    try {
      const res = await fetch(`${BASE}/api/tenant-admin?action=getInvoiceConfig`, { headers: getAuthHeaders() })
      if (!res.ok) { companyRef.current = {}; return }
      const data = await res.json()
      const ic = data.invoiceConfig ?? {}
      companyRef.current = {
        name:     ic.companyName     || undefined,
        address1: ic.companyAddress1 || undefined,
        address2: ic.companyAddress2 || undefined,
        phone:    ic.companyPhone    || undefined,
      }
    } catch { companyRef.current = {} }
  }

  async function resolveCustomer(): Promise<string> {
    if (!bootstrapRef.current) {
      const { customers } = await fetchBootstrap()
      const qsc = customers.find(c => c.name === 'Quick Sales')
      bootstrapRef.current = { customerId: qsc?.id ?? null }
    }
    let { customerId } = bootstrapRef.current
    if (!customerId) {
      const created = await createCustomer({ name: 'Quick Sales', customer_type: 'Direct', shipping_cost: 0 })
      customerId = created.id
      bootstrapRef.current = { customerId }
    }
    return customerId
  }

  async function createQsOrder(customerId: string): Promise<{ id: string; order_no: number }> {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({
        customer_id: customerId,
        date: todayYMD(timezone),
        delivered: true,
        delivered_at: todayYMD(timezone),
        items: linesRef.current.map(l => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })),
      }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || `Order creation failed (${res.status})`) }
    const data = await res.json()
    return { id: data.order_id ?? data.id, order_no: data.order_no }
  }

  async function handleCharge() {
    if (terminalState !== 'idle' || lines.length === 0) return
    try {
      const customerId = await resolveCustomer()
      const { id: orderId } = await createQsOrder(customerId)
      orderIdRef.current = orderId
      chargeTerminal(orderId)
    } catch (e: any) {
      setTerminalState('idle'); alert(e?.message || 'Failed to charge')
    }
  }

  async function handleCash() {
    if (terminalState !== 'idle' && terminalState !== 'cash-processing') return
    if (lines.length === 0) return
    try {
      const [customerId] = await Promise.all([resolveCustomer(), resolveCompanyInfo()])
      const snapLines = [...linesRef.current]
      const total = Math.round(snapLines.reduce((s, l) => s + Math.round(l.unit_price * 100) * l.qty, 0)) / 100
      const cashNum = parseFloat(cashAmount) || 0
      const { id: orderId, order_no } = await createQsOrder(customerId)
      orderIdRef.current = orderId
      const payRes = await fetch(`${BASE}/api/payments`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          customer_id: customerId,
          payment_type: 'Cash',
          amount: total,
          payment_date: todayYMD(timezone),
          order_id: orderId,
        }),
      })
      if (!payRes.ok) {
        await deleteOrder()
        const d = await payRes.json(); throw new Error(d.error || `Payment creation failed (${payRes.status})`)
      }
      orderIdRef.current = null
      setReceiptData({
        lines: snapLines,
        total,
        cashReceived: cashNum,
        change: Math.round((cashNum - total) * 100) / 100,
        orderNo: order_no,
        date: todayYMD(timezone),
        companyName:     companyRef.current?.name,
        companyAddress1: companyRef.current?.address1,
        companyAddress2: companyRef.current?.address2,
        companyPhone:    companyRef.current?.phone,
      })
      setTerminalState('approved')
      setTerminalMsg('Cash payment recorded')
      window.dispatchEvent(new CustomEvent('qs-sale-completed'))
    } catch (e: any) {
      setTerminalState('idle'); alert(e?.message || 'Failed to record cash payment')
    }
  }

  function resetAll() {
    setLines([])
    setOpen(false)
    setTerminalState('idle')
    setTerminalMsg('')
    setCashOpen(false)
    setCashAmount('')
    setManualPickerOpen(false)
    setReceiptData(null)
    setReceiptOpen(false)
  }

  const total = Math.round(lines.reduce((s, l) => s + Math.round(l.unit_price * 100) * l.qty, 0)) / 100

  return (
    <>
      {/* Floating cart button */}
      {lines.length > 0 && !open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 990,
            background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 28, padding: '10px 20px',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          <span style={{ fontSize: 18 }}>🛒</span>
          Cart ({lines.reduce((s, l) => s + l.qty, 0)}) · {fmtMoney(total)}
        </button>
      )}

      {/* Cart overlay */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '72px 16px 16px' }}
          onClick={() => { if (terminalState === 'idle') { setOpen(false); setCashOpen(false); setCashAmount('') } }}
        >
          <div
            className="card"
            style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 88px)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Quick Sale</h3>
              {terminalState === 'idle' && (
                <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1, color: 'var(--text-secondary)', padding: '0 4px' }}>✕</button>
              )}
            </div>

            {/* Items */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((line, i) => (
                <div key={line.product_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[line.name, line.variant, line.variant_2].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtMoney(line.unit_price)} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      disabled={terminalState !== 'idle'}
                      onClick={() => setLines(prev => prev.map((l, j) => j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l))}
                      style={{ width: 28, height: 28, padding: 0, fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{line.qty}</span>
                    <button
                      disabled={terminalState !== 'idle'}
                      onClick={() => setLines(prev => prev.map((l, j) => j === i ? { ...l, qty: l.qty + 1 } : l))}
                      style={{ width: 28, height: 28, padding: 0, fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >+</button>
                  </div>
                  <div style={{ minWidth: 90, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    {fmtMoney(line.qty * line.unit_price)}
                  </div>
                  {terminalState === 'idle' && (
                    <button
                      onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Add product manually */}
            {terminalState === 'idle' && (
              <div>
                <button
                  onClick={() => setManualPickerOpen(v => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{manualPickerOpen ? '▼' : '▶'}</span>
                  Add product manually
                </button>
                {manualPickerOpen && (
                  <QsProductPicker
                    onSelect={p => { addProduct(p); setManualPickerOpen(false) }}
                    maxHeight={220}
                  />
                )}
              </div>
            )}

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <span>Total</span>
              <span>{fmtMoney(total)}</span>
            </div>

            {/* Terminal / payment status */}
            {terminalState !== 'idle' && (
              <div style={{ textAlign: 'center', padding: '8px 0', color: terminalState === 'approved' ? 'var(--color-success)' : terminalState === 'declined' || terminalState === 'timeout' ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                {terminalState === 'initiating' && 'Initiating terminal…'}
                {terminalState === 'waiting' && 'Waiting for card…'}
                {terminalState === 'cash-processing' && 'Processing cash payment…'}
                {terminalState === 'approved' && `✓ ${terminalMsg}`}
                {terminalState === 'declined' && `✗ ${terminalMsg}`}
                {terminalState === 'timeout' && 'Terminal timed out'}
              </div>
            )}

            {/* Actions */}
            {terminalState === 'idle' && cashOpen ? (
              /* Cash entry step */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontWeight: 500 }}>Amount received</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    style={{ fontSize: 13, padding: '4px 10px', flexShrink: 0 }}
                    onClick={() => setCashAmount(String(total))}
                  >{fmtMoney(total)}</button>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    style={{ flex: 1, minWidth: 0, textAlign: 'right', padding: '8px 12px', fontSize: 24 }}
                  />
                </div>
                {cashAmount !== '' && (() => {
                  const cashNum = parseFloat(cashAmount) || 0
                  const valid = cashNum >= total
                  return (
                    <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 15, color: valid ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {valid ? `Change: ${fmtMoney(Math.round((cashNum - total) * 100) / 100)}` : 'Amount too low'}
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="primary"
                    style={{ flex: 1 }}
                    disabled={(parseFloat(cashAmount) || 0) < total}
                    onClick={() => { setTerminalState('cash-processing'); handleCash() }}
                  >Confirm</button>
                  <button onClick={() => { setCashOpen(false); setCashAmount('') }}>Back</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {terminalState === 'idle' && (
                  <>
                    <button className="primary" style={{ flex: 1 }} onClick={handleCharge} disabled={lines.length === 0}>Charge Terminal</button>
                    <button style={{ flex: 1 }} onClick={() => setCashOpen(true)} disabled={lines.length === 0}>Pay Cash</button>
                    <button onClick={() => { setLines([]); setOpen(false) }}>Clear</button>
                  </>
                )}
                {terminalState === 'approved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                    {receiptData && (
                      <button style={{ width: '100%' }} onClick={() => setReceiptOpen(true)}>Receipt</button>
                    )}
                    <button className="primary" style={{ width: '100%' }} onClick={resetAll}>Done</button>
                  </div>
                )}
                {(terminalState === 'declined' || terminalState === 'timeout') && (
                  <>
                    <button className="primary" style={{ flex: 1 }} onClick={() => { setTerminalState('idle'); setTerminalMsg('') }}>Try Again</button>
                    <button onClick={resetAll}>Cancel</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {receiptOpen && receiptData && (
        <QsReceipt {...receiptData} onClose={() => setReceiptOpen(false)} />
      )}
    </>
  )
})

export default QuickSalesCart
