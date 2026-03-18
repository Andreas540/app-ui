import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

interface ReminderRule {
  id: string
  rule_name: string
  trigger_event: string
  minutes_offset: number
  channel: string
  template_key: string
  active: boolean
  service_name: string | null
}

interface MessageTemplate {
  id: string
  template_key: string
  channel: string
  subject: string | null
  body: string
}

interface Service {
  id: string
  name: string
}

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

const TRIGGER_EVENTS = [
  { value: 'before_start',      label: 'Before booking start' },
  { value: 'booking_confirmed', label: 'After booking confirmed' },
  { value: 'unpaid_balance',    label: 'After start (if unpaid)' },
]

const CHANNELS = [
  { value: 'sms',   label: 'SMS' },
  { value: 'email', label: 'Email' },
]

function offsetLabel(minutes: number, trigger: string) {
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  const duration = parts.join(' ') || '0m'
  if (trigger === 'before_start') return minutes < 0 ? `${duration} before` : `${duration} after`
  if (trigger === 'booking_confirmed') return `${duration} after confirmation`
  return `${duration} after start`
}

const TEMPLATE_VARS = '{{customer_name}}, {{service_name}}, {{start_date}}, {{start_time}}, {{staff_name}}'
const BLANK_RULE = { rule_name: '', trigger_event: 'before_start', minutes_offset: -1440, channel: 'sms', template_key: '', service_id: '' }

export default function BookingRemindersPage() {
  const { t } = useTranslation()
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [showAddRule, setShowAddRule] = useState(false)
  const [newRule, setNewRule] = useState({ ...BLANK_RULE })

  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [tmplKey, setTmplKey] = useState('')
  const [tmplBody, setTmplBody] = useState('')
  const [tmplSubject, setTmplSubject] = useState('')
  const [tmplChannel, setTmplChannel] = useState('sms')

  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${apiBase()}/api/get-reminder-settings`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRules(data.rules || [])
      setTemplates(data.templates || [])
      setServices(data.services || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function callSave(payload: object) {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase()}/api/save-reminder-settings`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await loadSettings()
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    await callSave({ action: 'create_rule', ...newRule, service_id: newRule.service_id || null })
    setNewRule({ ...BLANK_RULE })
    setShowAddRule(false)
  }

  function openTemplateEditor(templateKey: string, channel: string) {
    const existing = templates.find(t => t.template_key === templateKey && t.channel === channel)
    setTmplKey(templateKey)
    setTmplChannel(channel)
    setTmplBody(existing?.body ?? '')
    setTmplSubject(existing?.subject ?? '')
    setEditingTemplate(existing ?? { id: '', template_key: templateKey, channel, subject: null, body: '' })
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    await callSave({ action: 'upsert_template', template_key: tmplKey, channel: tmplChannel, subject: tmplSubject || null, body: tmplBody })
    setEditingTemplate(null)
  }

  async function handleGenerateReminders() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch(`${apiBase()}/api/generate-booking-reminders`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGenerateResult(`${data.created ?? 0} jobs scheduled across ${data.bookings_processed ?? 0} upcoming bookings.`)
    } catch (e: any) {
      setGenerateResult(`Error: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ marginBottom: 8 }}>Reminders</h2>
      <p className="helper" style={{ marginBottom: 24 }}>
        Automatic SMS reminders for bookings. Available variables: <code style={{ fontSize: 12 }}>{TEMPLATE_VARS}</code>
      </p>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {/* ── Rules ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Rules</h3>
        <button onClick={() => setShowAddRule(v => !v)} disabled={saving}>+ Add rule</button>
      </div>

      {showAddRule && (
        <form onSubmit={handleAddRule} className="card" style={{ padding: 20, marginBottom: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Rule name</label>
              <input value={newRule.rule_name} onChange={e => setNewRule(r => ({ ...r, rule_name: e.target.value }))} placeholder="e.g. 24h SMS reminder" required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Trigger</label>
              <select value={newRule.trigger_event} onChange={e => setNewRule(r => ({ ...r, trigger_event: e.target.value }))} style={{ width: '100%' }}>
                {TRIGGER_EVENTS.map(te => <option key={te.value} value={te.value}>{te.label}</option>)}
              </select>
            </div>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Offset in minutes (negative = before)</label>
              <input type="number" value={newRule.minutes_offset} onChange={e => setNewRule(r => ({ ...r, minutes_offset: parseInt(e.target.value, 10) || 0 }))} style={{ width: '100%' }} />
              <div className="helper" style={{ marginTop: 4 }}>{offsetLabel(newRule.minutes_offset, newRule.trigger_event)}</div>
            </div>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Channel</label>
              <select value={newRule.channel} onChange={e => setNewRule(r => ({ ...r, channel: e.target.value }))} style={{ width: '100%' }}>
                {CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
              </select>
            </div>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Template key</label>
              <input value={newRule.template_key} onChange={e => setNewRule(r => ({ ...r, template_key: e.target.value }))} placeholder="e.g. reminder_24h" required style={{ width: '100%' }} />
              <div className="helper" style={{ marginTop: 4 }}>Must match a template below.</div>
            </div>
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Service (optional)</label>
              <select value={newRule.service_id} onChange={e => setNewRule(r => ({ ...r, service_id: e.target.value }))} style={{ width: '100%' }}>
                <option value="">All services</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="primary" disabled={saving}>Save rule</button>
            <button type="button" onClick={() => setShowAddRule(false)}>Cancel</button>
          </div>
        </form>
      )}

      {rules.length === 0 ? (
        <div className="helper" style={{ marginBottom: 24 }}>No rules yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 24 }}>
          {rules.map(rule => (
            <div key={rule.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{rule.rule_name}</div>
                <div className="helper">
                  {TRIGGER_EVENTS.find(te => te.value === rule.trigger_event)?.label}
                  {' · '}{offsetLabel(rule.minutes_offset, rule.trigger_event)}
                  {' · '}{rule.channel.toUpperCase()}
                  {' · '}{rule.service_name ?? 'All services'}
                </div>
              </div>
              <button onClick={() => openTemplateEditor(rule.template_key, rule.channel)} style={{ fontSize: 12 }}>
                Edit template
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={rule.active} onChange={() => callSave({ action: 'toggle_rule', id: rule.id, active: !rule.active })} />
                {rule.active ? 'Active' : 'Paused'}
              </label>
              <button
                onClick={() => { if (confirm(`Delete "${rule.rule_name}"?`)) callSave({ action: 'delete_rule', id: rule.id }) }}
                style={{ fontSize: 12, color: 'salmon', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Template editor ───────────────────────────────────────── */}
      {editingTemplate && (
        <form onSubmit={handleSaveTemplate} className="card" style={{ padding: 20, marginBottom: 24, display: 'grid', gap: 12 }}>
          <h3 style={{ marginTop: 0 }}>
            Template: <code style={{ fontSize: 13 }}>{tmplKey}</code> · {tmplChannel.toUpperCase()}
          </h3>
          {tmplChannel === 'email' && (
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Subject</label>
              <input value={tmplSubject} onChange={e => setTmplSubject(e.target.value)} style={{ width: '100%' }} placeholder="Email subject" />
            </div>
          )}
          <div>
            <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Body</label>
            <textarea
              value={tmplBody}
              onChange={e => setTmplBody(e.target.value)}
              required rows={5}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              placeholder={`Hi {{customer_name}}, reminder: {{service_name}} on {{start_date}} at {{start_time}}.`}
            />
            <div className="helper" style={{ marginTop: 4 }}>Variables: {TEMPLATE_VARS}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="primary" disabled={saving}>Save template</button>
            <button type="button" onClick={() => setEditingTemplate(null)}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Templates list ────────────────────────────────────────── */}
      {templates.length > 0 && !editingTemplate && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Message templates</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {templates.map(tmpl => (
              <div key={tmpl.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    <code>{tmpl.template_key}</code> · {tmpl.channel.toUpperCase()}
                  </div>
                  {tmpl.subject && <div className="helper">Subject: {tmpl.subject}</div>}
                  <div className="helper" style={{ marginTop: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>{tmpl.body}</div>
                </div>
                <button onClick={() => openTemplateEditor(tmpl.template_key, tmpl.channel)} style={{ fontSize: 12, flexShrink: 0 }}>Edit</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Generate reminders ────────────────────────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Schedule reminders now</div>
        <div className="helper" style={{ marginBottom: 12 }}>
          Creates reminder jobs for all upcoming bookings based on active rules. The sync does this automatically — use this button after editing rules.
        </div>
        {generateResult && (
          <div style={{ marginBottom: 12, fontSize: 14, color: generateResult.startsWith('Error') ? 'salmon' : '#10b981' }}>
            {generateResult}
          </div>
        )}
        <button onClick={handleGenerateReminders} disabled={generating}>
          {generating ? 'Scheduling…' : 'Schedule reminders now'}
        </button>
      </div>
    </div>
  )
}
