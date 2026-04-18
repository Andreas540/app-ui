import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { formatDate } from '../lib/time'

interface ProviderConnection {
  id: string
  provider: string
  connection_status: string
  external_account_id: string
  external_account_name: string
  currency: string | null
  country: string | null
  last_sync_at: string | null
  onboarding_completed_at: string | null
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

export default function BookingIntegrationPage() {
  const { t } = useTranslation()

  const [connections, setConnections] = useState<ProviderConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Connect form state
  const [companyLogin, setCompanyLogin] = useState('')
  const [userLogin, setUserLogin] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [disconnecting, setDisconnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const activeConnection = connections.find(c => c.connection_status === 'connected')

  useEffect(() => {
    fetchIntegration()
  }, [])

  async function fetchIntegration() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-booking-integration`, {
        headers: getAuthHeaders()
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setConnections(data.connections || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load integration status')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!companyLogin.trim() || !userLogin.trim() || !apiKey.trim()) return
    try {
      setConnecting(true)
      setConnectError(null)
      const res = await fetch(`${apiBase()}/api/connect-booking-provider`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'simplybook', company_login: companyLogin.trim(), user_login: userLogin.trim(), api_key: apiKey.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setCompanyLogin('')
      setUserLogin('')
      setApiKey('')
      await fetchIntegration()
    } catch (e: any) {
      setConnectError(e.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    if (!activeConnection) return
    try {
      setSyncing(true)
      setSyncResult(null)
      const res = await fetch(`${apiBase()}/api/sync-booking-provider`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeConnection.provider })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSyncResult(t('bookingIntegration.syncSuccess', { count: data.records_processed ?? 0 }))
      await fetchIntegration()
    } catch (e: any) {
      setSyncResult(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!activeConnection) return
    if (!confirm(t('bookingIntegration.disconnectConfirm'))) return
    try {
      setDisconnecting(true)
      const res = await fetch(`${apiBase()}/api/connect-booking-provider`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeConnection.provider })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await fetchIntegration()
    } catch (e: any) {
      setError(e.message || 'Disconnect failed')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>

  return (
    <div className="card page-narrow">
      <h3 style={{ marginBottom: 8 }}>{t('bookingIntegration.title')}</h3>
      <p className="helper" style={{ marginBottom: 24 }}>{t('bookingIntegration.subtitle')}</p>

      {error && (
        <div style={{ color: 'var(--color-error)', marginBottom: 16 }}>{error}</div>
      )}

      {activeConnection ? (
        /* ── Connected state ── */
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{
                  display: 'inline-block',
                  width: 10, height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#10b981'
                }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>{t('bookingIntegration.connected')}</span>
              </div>
              <div className="helper">{t('bookingIntegration.provider')}: SimplyBook.me</div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{ opacity: disconnecting ? 0.6 : 1 }}
            >
              {disconnecting ? t('bookingIntegration.disconnecting') : t('bookingIntegration.disconnect')}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <div className="helper">{t('bookingIntegration.accountName')}</div>
              <div style={{ fontWeight: 600 }}>{activeConnection.external_account_name || activeConnection.external_account_id}</div>
            </div>
            <div>
              <div className="helper">{t('bookingIntegration.connectedSince')}</div>
              <div style={{ fontWeight: 600 }}>
                {activeConnection.onboarding_completed_at
                  ? formatDate(activeConnection.onboarding_completed_at)
                  : '—'}
              </div>
            </div>
            {activeConnection.currency && (
              <div>
                <div className="helper">{t('bookingIntegration.currency')}</div>
                <div style={{ fontWeight: 600 }}>{activeConnection.currency}</div>
              </div>
            )}
            <div>
              <div className="helper">{t('bookingIntegration.lastSync')}</div>
              <div style={{ fontWeight: 600 }}>
                {activeConnection.last_sync_at
                  ? new Date(activeConnection.last_sync_at).toLocaleString()
                  : t('bookingIntegration.neverSynced')}
              </div>
            </div>
          </div>

          {/* Manual sync */}
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div className="helper" style={{ marginBottom: 8 }}>{t('bookingIntegration.syncHelp')}</div>
            {syncResult && (
              <div style={{ marginBottom: 8, fontSize: 14, color: syncResult.includes('ailed') ? 'var(--color-error)' : '#10b981' }}>
                {syncResult}
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{ opacity: syncing ? 0.6 : 1 }}
            >
              {syncing ? t('bookingIntegration.syncing') : t('bookingIntegration.syncNow')}
            </button>
          </div>
        </div>
      ) : (
        /* ── Not connected state ── */
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{
              display: 'inline-block',
              width: 10, height: 10,
              borderRadius: '50%',
              backgroundColor: '#9ca3af'
            }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{t('bookingIntegration.notConnected')}</span>
          </div>

          <p className="helper" style={{ marginBottom: 20 }}>{t('bookingIntegration.connectInstructions')}</p>

          <form onSubmit={handleConnect} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>
                {t('bookingIntegration.companyLogin')}
              </label>
              <input
                type="text"
                value={companyLogin}
                onChange={e => setCompanyLogin(e.target.value)}
                placeholder={t('bookingIntegration.companyLoginPlaceholder')}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>
                {t('bookingIntegration.userLogin')}
              </label>
              <input
                type="email"
                value={userLogin}
                onChange={e => setUserLogin(e.target.value)}
                placeholder={t('bookingIntegration.userLoginPlaceholder')}
                required
                style={{ width: '100%' }}
              />
              <div className="helper" style={{ marginTop: 4 }}>
                {t('bookingIntegration.userLoginHelp')}
              </div>
            </div>

            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>
                {t('bookingIntegration.apiKey')}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={t('bookingIntegration.apiKeyPlaceholder')}
                required
                style={{ width: '100%' }}
              />
              <div className="helper" style={{ marginTop: 4 }}>
                {t('bookingIntegration.apiKeyHelp')}
              </div>
            </div>

            {connectError && (
              <div style={{ color: 'var(--color-error)', fontSize: 14 }}>{connectError}</div>
            )}

            <button
              type="submit"
              className="primary"
              disabled={connecting || !companyLogin.trim() || !userLogin.trim() || !apiKey.trim()}
              style={{ opacity: connecting ? 0.6 : 1 }}
            >
              {connecting ? t('bookingIntegration.connecting') : t('bookingIntegration.connectButton')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
