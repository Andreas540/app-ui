// src/pages/TenantAdminPaymentProvidersTab.tsx

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

type Provider = 'stripe' | 'amp'

interface ProviderRow {
  provider: string
  publishable_key: string | null
  secret_key_set: boolean
  webhook_secret_set: boolean
  enabled: boolean
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

export default function TenantAdminPaymentProvidersTab() {
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  const [selectedProvider, setSelectedProvider] = useState<Provider>('stripe')
  const [storedRows, setStoredRows] = useState<ProviderRow[]>([])

  // Per-provider form fields
  const [publishableKey, setPublishableKey] = useState('')
  const [secretKey,      setSecretKey]      = useState('')
  const [webhookSecret,  setWebhookSecret]  = useState('')
  const [enabled,        setEnabled]        = useState(false)

  useEffect(() => { load() }, [])

  // Populate fields when provider selection changes
  useEffect(() => {
    const row = storedRows.find(r => r.provider === selectedProvider)
    setPublishableKey(row?.publishable_key || '')
    setSecretKey('')
    setWebhookSecret('')
    setEnabled(row?.enabled ?? false)
  }, [selectedProvider, storedRows])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-payment-providers`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to load')
      }
      const data = await res.json()
      const rows: ProviderRow[] = data.providers || []
      setStoredRows(rows)
      // Populate initial provider fields
      const stripe = rows.find(r => r.provider === 'stripe')
      setPublishableKey(stripe?.publishable_key || '')
      setEnabled(stripe?.enabled ?? false)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSaved(false)
      const res = await fetch(`${apiBase()}/api/save-payment-provider`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          provider:        selectedProvider,
          publishable_key: publishableKey.trim(),
          secret_key:      secretKey.trim(),
          webhook_secret:  webhookSecret.trim(),
          enabled,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to save')
      }
      await load()
      setSecretKey('')
      setWebhookSecret('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const storedRow = storedRows.find(r => r.provider === selectedProvider)
  const isConnected = storedRow?.enabled && !!storedRow?.publishable_key && storedRow?.secret_key_set && storedRow?.webhook_secret_set

  const base = apiBase() || window.location.origin
  const webhookUrl = `${base}/api/stripe-payment-webhook`

  if (loading) return <p className="helper">{t('common.loading')}</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Provider selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap' }}>
          {t('paymentProviders.selectProvider')}
        </label>
        <select
          value={selectedProvider}
          onChange={e => setSelectedProvider(e.target.value as Provider)}
          style={{ maxWidth: 220 }}
        >
          <option value="stripe">Stripe</option>
          <option value="amp">AMP Payments</option>
        </select>

        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 10,
            background: isConnected ? 'var(--color-success-bg, #d1fae5)' : 'var(--color-neutral-bg, #f3f4f6)',
            color:      isConnected ? 'var(--color-success, #065f46)'    : 'var(--color-muted, #6b7280)',
          }}
        >
          {isConnected ? t('paymentProviders.statusConnected') : t('paymentProviders.statusNotConfigured')}
        </span>
      </div>

      {/* Config fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Enabled toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14 }}>{t('paymentProviders.enabled')}</span>
        </label>

        {/* Provider description */}
        <p className="helper" style={{ margin: 0 }}>
          {selectedProvider === 'stripe'
            ? t('paymentProviders.stripeDescription')
            : t('paymentProviders.ampDescription')}
        </p>

        {/* Publishable key */}
        <div>
          <label className="label">{t('paymentProviders.publishableKey')}</label>
          <input
            type="text"
            className="input"
            placeholder={selectedProvider === 'stripe' ? 'pk_live_...' : ''}
            value={publishableKey}
            onChange={e => setPublishableKey(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, maxWidth: 480 }}
          />
        </div>

        {/* Secret key */}
        <div>
          <label className="label">{t('paymentProviders.secretKey')}</label>
          {storedRow?.secret_key_set && (
            <p className="helper" style={{ marginBottom: 4 }}>
              {t('paymentProviders.keySet')} — {t('paymentProviders.leaveBlankToKeep')}
            </p>
          )}
          <input
            type="password"
            className="input"
            placeholder={storedRow?.secret_key_set ? '••••••••' : selectedProvider === 'stripe' ? 'sk_live_...' : ''}
            value={secretKey}
            onChange={e => setSecretKey(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, maxWidth: 480 }}
          />
        </div>

        {/* Webhook secret */}
        <div>
          <label className="label">{t('paymentProviders.webhookSecret')}</label>
          {storedRow?.webhook_secret_set && (
            <p className="helper" style={{ marginBottom: 4 }}>
              {t('paymentProviders.keySet')} — {t('paymentProviders.leaveBlankToKeep')}
            </p>
          )}
          <input
            type="password"
            className="input"
            placeholder={storedRow?.webhook_secret_set ? '••••••••' : selectedProvider === 'stripe' ? 'whsec_...' : ''}
            value={webhookSecret}
            onChange={e => setWebhookSecret(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, maxWidth: 480 }}
          />
        </div>

        {/* Webhook URL (read-only) */}
        {selectedProvider === 'stripe' && (
          <div>
            <label className="label">{t('paymentProviders.webhookUrl')}</label>
            <p className="helper" style={{ marginBottom: 4 }}>
              {t('paymentProviders.webhookUrlHelper')}
            </p>
            <input
              type="text"
              className="input"
              value={webhookUrl}
              readOnly
              onClick={e => (e.target as HTMLInputElement).select()}
              style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 480, cursor: 'text' }}
            />
          </div>
        )}

      </div>

      {error && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{error}</p>}

      <div>
        <button
          className="primary"
          onClick={handleSave}
          disabled={saving}
          style={{ height: 36, padding: '0 20px', fontSize: 14 }}
        >
          {saving ? t('common.saving') : saved ? t('common.saved') : t('common.save')}
        </button>
      </div>

    </div>
  )
}
