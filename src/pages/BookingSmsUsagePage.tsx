import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'

interface MonthStats {
  billable_count: number
  reported_count: number
  pending_count: number
  delivered_count: number
  failed_count: number
  queued_count: number
  estimated_cost: number
  cap_percent: number
}

interface BillingSettings {
  sms_price_per_unit: number
  sms_monthly_cap_amount: number
  stripe_sms_subscription_item_id: string | null
  stripe_subscription_id: string | null
  booking_addon_enabled: boolean
}

interface HistoryRow {
  period_start: string
  period_end: string
  sms_billable_count: number
  sms_billed_amount: number
  stripe_invoice_id: string | null
}

interface JobRow {
  id: string
  status: string
  billable: boolean
  stripe_reported: boolean
  scheduled_for: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  error_message: string | null
  template_key: string
  customer_name: string | null
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

const JOB_STATUS_COLORS: Record<string, string> = {
  queued:    '#9ca3af',
  sending:   '#f59e0b',
  accepted:  '#6366f1',
  sent:      '#6366f1',
  delivered: '#10b981',
  failed:    '#ef4444',
  canceled:  '#9ca3af',
}

function CapBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ background: 'var(--line)', borderRadius: 4, height: 8, marginTop: 8 }}>
      <div style={{ background: color, borderRadius: 4, height: 8, width: `${Math.min(100, percent)}%`, transition: 'width 0.3s' }} />
    </div>
  )
}

export default function BookingSmsUsagePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { locale, timezone, currency: tenantCurrency } = useLocale()
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'super_admin'

  const [monthStats, setMonthStats] = useState<MonthStats | null>(null)
  const [settings, setSettings] = useState<BillingSettings | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Settings form
  const [editSettings, setEditSettings] = useState(false)
  const [capAmount, setCapAmount] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [stripeItemId, setStripeItemId] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => { loadUsage() }, [])

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: timezone })
  }

  function fmtCurrency(amount: number) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: tenantCurrency }).format(amount)
  }

  async function loadUsage() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-sms-usage`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMonthStats(data.current_month)
      setSettings(data.settings)
      setHistory(data.history || [])
      setJobs(data.recent_jobs || [])
      setCapAmount(String(data.settings?.sms_monthly_cap_amount ?? 25))
      setPricePerUnit(String(data.settings?.sms_price_per_unit ?? 0.02))
      setStripeItemId(data.settings?.stripe_sms_subscription_item_id ?? '')
    } catch (e: any) {
      setError(e.message || t('smsUsagePage.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await fetch(`${apiBase()}/api/save-billing-settings`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sms_monthly_cap_amount: parseFloat(capAmount),
          sms_price_per_unit: parseFloat(pricePerUnit),
          stripe_sms_subscription_item_id: stripeItemId.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setEditSettings(false)
      await loadUsage()
    } catch (e: any) {
      setError(e.message || t('smsUsagePage.saveFailed'))
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>
  if (error && !monthStats) return <div style={{ padding: 32, color: 'salmon' }}>{error}</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 24 }}>{t('smsUsagePage.title')}</h2>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {/* ── Current month summary ────────────────────────────────── */}
      {monthStats && settings && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          <div className="card" style={{ padding: 20, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div className="helper">{t('smsUsagePage.thisMonthSms')}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{monthStats.billable_count}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="helper">{t('smsUsagePage.estimatedCost')}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtCurrency(monthStats.estimated_cost)}</div>
                <div className="helper">{t('smsUsagePage.ofCap', { cap: fmtCurrency(Number(settings.sms_monthly_cap_amount)) })}</div>
              </div>
            </div>
            <CapBar percent={monthStats.cap_percent} />
            <div className="helper" style={{ marginTop: 6 }}>{t('smsUsagePage.capUsed', { percent: monthStats.cap_percent })}</div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="helper" style={{ marginBottom: 4 }}>{t('smsUsagePage.deliveryStatus')}</div>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#10b981' }}>{t('smsUsagePage.delivered')}</span>
                <strong>{monthStats.delivered_count}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>{t('smsUsagePage.queued')}</span>
                <strong>{monthStats.queued_count}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#ef4444' }}>{t('smsUsagePage.failed')}</span>
                <strong>{monthStats.failed_count}</strong>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="helper" style={{ marginBottom: 4 }}>{t('smsUsagePage.stripeReporting')}</div>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('smsUsagePage.reported')}</span>
                <strong>{monthStats.reported_count}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#f59e0b' }}>{t('pending')}</span>
                <strong>{monthStats.pending_count}</strong>
              </div>
              <div className="helper" style={{ marginTop: 4 }}>
                {settings.stripe_sms_subscription_item_id
                  ? t('smsUsagePage.stripeConfigured')
                  : t('smsUsagePage.stripeNotConfigured')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Billing settings (admin only) ───────────────────────── */}
      {isAdmin && (
        <div className="card" style={{ padding: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t('smsUsagePage.billingSettings')}</h3>
            {!editSettings && <button onClick={() => setEditSettings(true)}>{t('edit')}</button>}
          </div>

          {editSettings ? (
            <form onSubmit={handleSaveSettings} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('smsUsagePage.monthlyCap')}</label>
                  <input type="number" step="0.01" min="0" value={capAmount} onChange={e => setCapAmount(e.target.value)} style={{ width: '100%' }} required />
                  <div className="helper" style={{ marginTop: 4 }}>{t('smsUsagePage.monthlyCapHelp')}</div>
                </div>
                <div>
                  <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('smsUsagePage.pricePerSms')}</label>
                  <input type="number" step="0.0001" min="0" value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)} style={{ width: '100%' }} required />
                </div>
              </div>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('smsUsagePage.stripeItemId')}</label>
                <input type="text" value={stripeItemId} onChange={e => setStripeItemId(e.target.value)} placeholder="si_xxxxxxxxxxxx" style={{ width: '100%' }} />
                <div className="helper" style={{ marginTop: 4 }}>{t('smsUsagePage.stripeItemHelp')}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="primary" disabled={savingSettings}>{t('save')}</button>
                <button type="button" onClick={() => setEditSettings(false)}>{t('cancel')}</button>
              </div>
            </form>
          ) : settings && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
              <div><div className="helper">{t('smsUsagePage.monthlyCap')}</div><div style={{ fontWeight: 600 }}>{fmtCurrency(Number(settings.sms_monthly_cap_amount))}</div></div>
              <div><div className="helper">{t('smsUsagePage.pricePerSms')}</div><div style={{ fontWeight: 600 }}>{fmtCurrency(Number(settings.sms_price_per_unit))}</div></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="helper">{t('smsUsagePage.stripeItemId')}</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{settings.stripe_sms_subscription_item_id || '—'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly history ──────────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ marginBottom: 12 }}>{t('smsUsagePage.monthlyHistory')}</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {history.map(row => (
              <div key={row.period_start} className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 90, fontSize: 13, fontWeight: 600 }}>
                  {new Date(row.period_start).toLocaleDateString(locale, { month: 'short', year: 'numeric' })}
                </div>
                <div style={{ flex: 1 }}>
                  <span className="helper">{row.sms_billable_count} SMS</span>
                </div>
                <div style={{ fontWeight: 600 }}>{fmtCurrency(Number(row.sms_billed_amount))}</div>
                {row.stripe_invoice_id && (
                  <div className="helper" style={{ fontSize: 11, fontFamily: 'monospace' }}>{row.stripe_invoice_id}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent jobs ──────────────────────────────────────────── */}
      <div>
        <h3 style={{ marginBottom: 12 }}>{t('smsUsagePage.recentJobs')}</h3>
        {jobs.length === 0 ? (
          <div className="helper">{t('smsUsagePage.noJobs')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {jobs.map(job => (
              <div key={job.id} className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 75, fontSize: 12, color: 'var(--muted)' }}>{fmtDate(job.sent_at ?? job.scheduled_for)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.customer_name ?? '—'}
                  </div>
                  <div className="helper" style={{ fontSize: 11 }}><code>{job.template_key}</code></div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                    fontSize: 11, fontWeight: 600,
                    background: (JOB_STATUS_COLORS[job.status] ?? '#9ca3af') + '22',
                    color: JOB_STATUS_COLORS[job.status] ?? '#9ca3af',
                  }}>
                    {job.status}
                  </span>
                  {job.billable && (
                    <span style={{ fontSize: 11, color: job.stripe_reported ? '#10b981' : '#f59e0b' }}>
                      {job.stripe_reported ? t('smsUsagePage.stripeReported') : t('smsUsagePage.stripePending')}
                    </span>
                  )}
                  {job.error_message && (
                    <span className="helper" style={{ fontSize: 11, color: '#ef4444', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.error_message}>
                      {job.error_message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
