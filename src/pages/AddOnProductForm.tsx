// src/pages/AddOnProductForm.tsx
// Create coverage products (product_kind='coverage'). Existing products shown in the lower table.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CoverageProduct,
  createCoverageProduct,
} from '../lib/api'

type IssuerType = 'manufacturer' | 'shop' | 'third_party'

const EMPTY_FORM = {
  name: '',
  cost: '',
  price_amount: '',
  coverage_duration_days: '',
  coverage_issuer_type: 'shop' as IssuerType,
  coverage_issuer_name: '',
  coverage_ref: '',
}

export default function AddOnProductForm({ onCreated }: { onCreated?: (p: CoverageProduct) => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const payload = {
        name: form.name.trim(),
        cost: Number(form.cost) || 0,
        price_amount: form.price_amount !== '' ? Number(form.price_amount) : null,
        coverage_duration_days: form.coverage_duration_days !== '' ? Math.max(1, parseInt(form.coverage_duration_days, 10)) : null,
        coverage_issuer_type: form.coverage_issuer_type,
        coverage_issuer_name: form.coverage_issuer_name.trim() || null,
        coverage_ref: form.coverage_ref.trim() || null,
      }
      if (!payload.name) { setMsg({ text: 'Name is required', ok: false }); setSaving(false); return }
      const res = await createCoverageProduct(payload)
      setForm({ ...EMPTY_FORM })
      setMsg({ text: t('coverage.saved'), ok: true })
      onCreated?.(res.coverage_product)
    } catch (e: any) {
      setMsg({ text: e.message ?? t('coverage.saveError'), ok: false })
    } finally {
      setSaving(false)
    }
  }

  const issuerLabel = (type: IssuerType) =>
    type === 'manufacturer' ? t('coverage.issuerManufacturer')
      : type === 'shop' ? t('coverage.issuerShop')
      : t('coverage.issuerThirdParty')

  const H = 36

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.nameLabel')}</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('coverage.namePlaceholder')}
            style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.costLabel')}</label>
            <input
              type="number" min="0" step="0.01"
              value={form.cost}
              onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.priceLabel')}</label>
            <input
              type="number" min="0" step="0.01"
              value={form.price_amount}
              onChange={e => setForm(f => ({ ...f, price_amount: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.durationLabel')}</label>
            <input
              type="number" min="1"
              value={form.coverage_duration_days}
              onChange={e => setForm(f => ({ ...f, coverage_duration_days: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.issuerTypeLabel')}</label>
            <select
              value={form.coverage_issuer_type}
              onChange={e => setForm(f => ({ ...f, coverage_issuer_type: e.target.value as IssuerType }))}
              style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
            >
              {(['manufacturer', 'shop', 'third_party'] as const).map(v => (
                <option key={v} value={v}>{issuerLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.issuerNameLabel')}</label>
            <input
              value={form.coverage_issuer_name}
              onChange={e => setForm(f => ({ ...f, coverage_issuer_name: e.target.value }))}
              placeholder={t('coverage.issuerNamePlaceholder')}
              style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('coverage.coverageRefLabel')}</label>
          <input
            value={form.coverage_ref}
            onChange={e => setForm(f => ({ ...f, coverage_ref: e.target.value }))}
            placeholder={t('coverage.coverageRefPlaceholder')}
            style={{ display: 'block', width: '100%', marginTop: 4, height: H, boxSizing: 'border-box' }}
          />
        </div>

        {msg && (
          <div style={{ fontSize: 12, color: msg.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{msg.text}</div>
        )}

        <div>
          <button className="primary" onClick={save} disabled={saving} style={{ height: H, padding: '0 16px', fontSize: 13 }}>
            {saving ? t('saving') : t('coverage.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
