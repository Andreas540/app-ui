import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

interface RowDraft {
  id: string
  product_name: string
  qty: number
  shippedStr: string
  customsStr: string
  receivedStr: string
}

interface SupplierOrderStagesModalProps {
  isOpen: boolean
  onClose: () => void
  order: any
  onSaved: () => void
}

function toStr(n: number): string {
  return n > 0 ? String(n) : ''
}

export default function SupplierOrderStagesModal({
  isOpen, onClose, order, onSaved,
}: SupplierOrderStagesModalProps) {
  const { t } = useTranslation()
  const { fmtQty } = useCurrency()
  const [rows, setRows] = useState<RowDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !order) return
    setError(null)
    setRows((order.items || []).map((item: any) => ({
      id:           item.id,
      product_name: item.product_name,
      qty:          Number(item.qty) || 0,
      shippedStr:   toStr(Number(item.qty_shipped)    || 0),
      customsStr:   toStr(Number(item.qty_in_customs) || 0),
      receivedStr:  toStr(Number(item.qty_received)   || 0),
    })))
  }, [isOpen, order])

  function update(idx: number, field: 'shippedStr' | 'customsStr' | 'receivedStr', val: string) {
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  function pendingFor(r: RowDraft) {
    return Math.max(0, r.qty - (Number(r.shippedStr) || 0) - (Number(r.customsStr) || 0) - (Number(r.receivedStr) || 0))
  }

  function rowError(r: RowDraft) {
    return (Number(r.shippedStr) || 0) + (Number(r.customsStr) || 0) + (Number(r.receivedStr) || 0) > r.qty
  }

  const hasErrors = rows.some(rowError)

  async function save() {
    if (hasErrors) return
    setSaving(true)
    setError(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order-supplier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          order_id: order.id,
          items: rows.map(r => ({
            id:             r.id,
            qty_shipped:    Number(r.shippedStr)  || 0,
            qty_in_customs: Number(r.customsStr)  || 0,
            qty_received:   Number(r.receivedStr) || 0,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || t('suppliers.stagesSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: 64, textAlign: 'right', padding: '3px 6px',
    border: '1px solid var(--border)', borderRadius: 4,
  }
  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 6px', borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('suppliers.stagesModalTitle')} #${order?.order_no}`}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {t('suppliers.stagesModalHint')}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>{t('product')}</th>
              <th style={thStyle}>{t('suppliers.stageOrdered')}</th>
              <th style={thStyle}>{t('suppliers.stagePending')}</th>
              <th style={thStyle}>{t('suppliers.stageShipped')}</th>
              <th style={thStyle}>{t('suppliers.stageInCustoms')}</th>
              <th style={thStyle}>{t('suppliers.stageReceived')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const err = rowError(r)
              const errBorder = err ? 'var(--error, #dc2626)' : undefined
              return (
                <tr key={r.id} style={{ background: err ? 'var(--error-bg, #fef2f2)' : undefined }}>
                  <td style={{ ...tdStyle, paddingLeft: 0, fontWeight: 500 }}>{r.product_name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtQty(r.qty)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {fmtQty(pendingFor(r))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <input
                      type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                      value={r.shippedStr}
                      onChange={e => update(idx, 'shippedStr', e.target.value)}
                      style={{ ...inputStyle, borderColor: errBorder }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <input
                      type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                      value={r.customsStr}
                      onChange={e => update(idx, 'customsStr', e.target.value)}
                      style={{ ...inputStyle, borderColor: errBorder }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <input
                      type="number" inputMode="decimal" min={0} max={r.qty} step="any"
                      value={r.receivedStr}
                      onChange={e => update(idx, 'receivedStr', e.target.value)}
                      style={{ ...inputStyle, borderColor: errBorder }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasErrors && (
        <div style={{ color: 'var(--error, #dc2626)', fontSize: 12, marginTop: 8 }}>
          {t('suppliers.stagesExceedsQty')}
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--error, #dc2626)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="primary" onClick={save} disabled={saving || hasErrors}>
          {saving ? t('saving') : t('save')}
        </button>
        <button onClick={onClose} disabled={saving}>{t('cancel')}</button>
      </div>
    </Modal>
  )
}
