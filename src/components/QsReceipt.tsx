import { useLocale } from '../contexts/LocaleContext'
import { useCurrency } from '../lib/useCurrency'

type ReceiptLine = {
  name: string
  variant: string | null
  variant_2: string | null
  qty: number
  unit_price: number
}

export type QsReceiptData = {
  lines: ReceiptLine[]
  total: number
  cashReceived: number
  change: number
  orderNo: number | null
  date: string
}

interface Props extends QsReceiptData {
  onClose: () => void
}

export default function QsReceipt({ lines, total, cashReceived, change, orderNo, date, onClose }: Props) {
  const { currency } = useLocale()
  const { fmtMoney } = useCurrency()

  const [y, m, d] = date.split('-')
  const dateStr = `${m}/${d}/${y}`
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  function handlePrint() {
    const lineRows = lines.map(l => `
      <tr>
        <td>${[l.name, l.variant, l.variant_2].filter(Boolean).join(' · ')}</td>
        <td style="text-align:center">${l.qty}</td>
        <td style="text-align:right">${fmtMoney(l.unit_price)}</td>
        <td style="text-align:right">${fmtMoney(Math.round(l.qty * l.unit_price * 100) / 100)}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Receipt${orderNo ? ` #${orderNo}` : ''}</title>
      <style>
        body { font-family: monospace; font-size: 13px; width: 300px; margin: 0 auto; padding: 16px; }
        h2 { text-align: center; margin: 0 0 2px; font-size: 16px; }
        .center { text-align: center; }
        .placeholder { color: #888; font-style: italic; }
        hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; }
        .total-row td { font-weight: bold; font-size: 15px; padding-top: 6px; }
        .footer { text-align: center; margin-top: 12px; }
      </style>
    </head><body>
      <h2 class="placeholder">[Business Name]</h2>
      <div class="center placeholder">[Address]</div>
      <div class="center placeholder">[Phone]</div>
      <hr>
      <div style="display:flex;justify-content:space-between">
        <span>${dateStr} ${timeStr}</span>
        ${orderNo ? `<span>Receipt #${orderNo}</span>` : ''}
      </div>
      <hr>
      <table>
        <thead>
          <tr style="color:#666;font-size:11px">
            <th style="text-align:left">Item</th>
            <th style="text-align:center">Qty</th>
            <th style="text-align:right">Price</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
      <hr>
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${fmtMoney(total)}</td></tr>
        <tr style="color:#888"><td>Tax</td><td style="text-align:right">—</td></tr>
        <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmtMoney(total)}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td>Cash</td><td style="text-align:right">${fmtMoney(cashReceived)}</td></tr>
        <tr><td>Change</td><td style="text-align:right">${fmtMoney(change)}</td></tr>
      </table>
      <hr>
      <div class="footer">Thank you!</div>
    </body></html>`

    const win = window.open('', '_blank', 'width=420,height=620')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1010, padding: '72px 16px 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', color: '#111', borderRadius: 12, padding: 24, width: '100%', maxWidth: 340, fontFamily: 'monospace', fontSize: 13 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
          {currency === 'USD' && (
            <button onClick={handlePrint} className="primary">Print</button>
          )}
          <button onClick={onClose}>Close</button>
        </div>

        {currency !== 'USD' ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#666' }}>
            Receipt not yet available for your region.
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16, fontStyle: 'italic', color: '#888' }}>[Business Name]</div>
              <div style={{ color: '#888', fontStyle: 'italic' }}>[Address]</div>
              <div style={{ color: '#888', fontStyle: 'italic' }}>[Phone]</div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            {/* Date + receipt no */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{dateStr} {timeStr}</span>
              {orderNo && <span>Receipt #{orderNo}</span>}
            </div>

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            {/* Column headers */}
            <div style={{ display: 'flex', gap: 8, color: '#888', fontSize: 11, marginBottom: 4 }}>
              <span style={{ flex: 1 }}>Item</span>
              <span style={{ minWidth: 24, textAlign: 'center' }}>Qty</span>
              <span style={{ minWidth: 56, textAlign: 'right' }}>Price</span>
              <span style={{ minWidth: 64, textAlign: 'right' }}>Amount</span>
            </div>

            {/* Line items */}
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[l.name, l.variant, l.variant_2].filter(Boolean).join(' · ')}
                </div>
                <span style={{ minWidth: 24, textAlign: 'center', flexShrink: 0 }}>{l.qty}</span>
                <span style={{ minWidth: 56, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(l.unit_price)}</span>
                <span style={{ minWidth: 64, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Math.round(l.qty * l.unit_price * 100) / 100)}</span>
              </div>
            ))}

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            {/* Subtotal + tax */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#888' }}>
              <span>Tax</span>
              <span>—</span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              <span>TOTAL</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(total)}</span>
            </div>

            {/* Cash + change */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Cash</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(cashReceived)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span>Change</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(change)}</span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            <div style={{ textAlign: 'center', marginTop: 8 }}>Thank you!</div>
          </>
        )}
      </div>
    </div>
  )
}
