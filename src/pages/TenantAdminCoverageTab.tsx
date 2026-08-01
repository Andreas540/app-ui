// src/pages/TenantAdminCoverageTab.tsx
// Manage coverage products (product_kind='coverage') — create and edit.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CoverageProduct,
  listCoverageProducts,
  createCoverageProduct,
  updateCoverageProduct,
} from '../lib/api'

const ISSUER_TYPES = ['manufacturer', 'shop', 'third_party'] as const
type IssuerType = typeof ISSUER_TYPES[number]

const EMPTY_FORM = {
  name: '',
  cost: '',
  price_amount: '',
  coverage_duration_days: '',
  coverage_issuer_type: 'shop' as IssuerType,
  coverage_issuer_name: '',
  coverage_ref: '',
}

function productToForm(p: CoverageProduct) {
  return {
    name: p.name,
    cost: p.cost != null ? String(p.cost) : '',
    price_amount: p.price_amount != null ? String(p.price_amount) : '',
    coverage_duration_days: p.coverage_duration_days != null ? String(p.coverage_duration_days) : '',
    coverage_issuer_type: (p.coverage_issuer_type ?? 'shop') as IssuerType,
    coverage_issuer_name: p.coverage_issuer_name ?? '',
    coverage_ref: p.coverage_ref ?? '',
  }
}

export default function TenantAdminCoverageTab() {
  const { t } = useTranslation()
  const [products, setProducts] = useState<CoverageProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>('new')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await listCoverageProducts()
      setProducts(data.coverage_products)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(p: CoverageProduct) {
    setForm(productToForm(p))
    setEditingId(p.id)
    setMsg(null)
  }

  function cancel() {
    setEditingId(null)
    setMsg(null)
  }

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

      if (editingId === 'new') {
        const res = await createCoverageProduct(payload)
        setProducts(prev => [...prev, res.coverage_product].sort((a, b) => a.name.localeCompare(b.name)))
        setForm({ ...EMPTY_FORM })
        setEditingId('new')
      } else {
        const res = await updateCoverageProduct({ id: editingId!, ...payload })
        setProducts(prev => prev.map(p => p.id === editingId ? res.coverage_product : p))
        setEditingId(null)
      }
      setMsg({ text: t('coverage.saved'), ok: true })
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
    <div>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t('coverage.description')}
      </p>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
      ) : (
        <>
          {/* Product list */}
          {products.length === 0 && editingId !== 'new' && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('coverage.noProducts')}</p>
          )}

          {products.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
              {editingId === p.id ? (
                <CoverageForm
                  form={form} setForm={setForm}
                  onSave={save} onCancel={cancel}
                  saving={saving} msg={msg}
                  t={t} H={H} issuerLabel={issuerLabel}
                  title={t('coverage.editProduct')}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                      {p.coverage_duration_days != null && <span>{p.coverage_duration_days}d</span>}
                      {p.coverage_issuer_type && <span>{issuerLabel(p.coverage_issuer_type as IssuerType)}{p.coverage_issuer_name ? ` — ${p.coverage_issuer_name}` : ''}</span>}
                      {p.coverage_ref && (
                        p.coverage_ref.startsWith('http')
                          ? <a href={p.coverage_ref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{p.coverage_ref}</a>
                          : <span>{p.coverage_ref}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => startEdit(p)} style={{ fontSize: 12, padding: '4px 12px', height: 28, flexShrink: 0 }}>
                    {t('edit')}
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* New product form — always open, no cancel */}
          {editingId === 'new' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 14px 10px', marginBottom: 10 }}>
              <CoverageForm
                form={form} setForm={setForm}
                onSave={save} onCancel={cancel}
                saving={saving} msg={msg}
                t={t} H={H} issuerLabel={issuerLabel}
                title={t('coverage.newProduct')}
                hideCancel
              />
            </div>
          )}

        </>
      )}
    </div>
  )
}

function CoverageForm({ form, setForm, onSave, onCancel, saving, msg, t, H, issuerLabel, title, hideCancel }: {
  form: typeof EMPTY_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
  msg: { text: string; ok: boolean } | null
  t: (k: string) => string
  H: number
  issuerLabel: (type: 'manufacturer' | 'shop' | 'third_party') => string
  title: string
  hideCancel?: boolean
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{title}</div>
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
              onChange={e => setForm(f => ({ ...f, coverage_issuer_type: e.target.value as 'manufacturer' | 'shop' | 'third_party' }))}
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={onSave} disabled={saving} style={{ height: H, padding: '0 16px', fontSize: 13 }}>
            {saving ? t('saving') : t('coverage.save')}
          </button>
          {!hideCancel && (
            <button onClick={onCancel} style={{ height: H, padding: '0 16px', fontSize: 13 }}>
              {t('coverage.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
