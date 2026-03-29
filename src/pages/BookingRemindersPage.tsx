import { useEffect, useRef, useState } from 'react'
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
  service_id: string | null
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

const TEMPLATE_VAR_LIST = [
  '{{customer_name}}', '{{service_name}}', '{{start_date}}', '{{start_time}}', '{{staff_name}}',
]

const BLANK_RULE_FORM = {
  rule_name: '',
  trigger_event: 'before_start',
  offset_hours: 24,
  channel: 'sms',
  template_key: '',
  service_id: '',
}

const sectionLabel: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 12,
}

export default function BookingRemindersPage() {
  const { t } = useTranslation()
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // SimplyBook setting
  const [hasSimplybook, setHasSimplybook] = useState(false)
  const [simplybookSmsConfirmation, setSimplybookSmsConfirmation] = useState(true)

  // Rule form state
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState({ ...BLANK_RULE_FORM })

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [tmplKey, setTmplKey] = useState('')
  const [tmplBody, setTmplBody] = useState('')
  const [tmplSubject, setTmplSubject] = useState('')
  const [tmplChannel, setTmplChannel] = useState('sms')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      setHasSimplybook(!!data.has_simplybook)
      setSimplybookSmsConfirmation(data.simplybook_sms_confirmation ?? true)
    } catch (e: any) {
      setError(e.message || t('remindersPage.loadFailed'))
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
      setError(e.message || t('remindersPage.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function openAddRule() {
    setRuleForm({ ...BLANK_RULE_FORM })
    setEditingRuleId(null)
    setShowRuleForm(true)
  }

  function openEditRule(rule: ReminderRule) {
    setRuleForm({
      rule_name: rule.rule_name,
      trigger_event: rule.trigger_event,
      offset_hours: Math.round(Math.abs(rule.minutes_offset) / 60),
      channel: rule.channel,
      template_key: rule.template_key,
      service_id: rule.service_id ?? '',
    })
    setEditingRuleId(rule.id)
    setShowRuleForm(true)
  }

  function closeRuleForm() {
    setShowRuleForm(false)
    setEditingRuleId(null)
    setRuleForm({ ...BLANK_RULE_FORM })
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault()
    const minutes_offset = ruleForm.trigger_event === 'booking_confirmed'
      ? 0
      : ruleForm.trigger_event === 'before_start'
        ? -(ruleForm.offset_hours * 60)
        : ruleForm.offset_hours * 60
    await callSave({
      action: editingRuleId ? 'update_rule' : 'create_rule',
      ...(editingRuleId ? { id: editingRuleId } : {}),
      rule_name: ruleForm.rule_name,
      trigger_event: ruleForm.trigger_event,
      minutes_offset,
      channel: ruleForm.channel,
      template_key: ruleForm.template_key,
      service_id: ruleForm.service_id || null,
    })
    closeRuleForm()
  }

  function openTemplateEditor(templateKey: string, channel: string) {
    const existing = templates.find(t => t.template_key === templateKey && t.channel === channel)
    setTmplKey(templateKey)
    setTmplChannel(channel)
    setTmplBody(existing?.body ?? '')
    setTmplSubject(existing?.subject ?? '')
    setEditingTemplate(existing ?? { id: '', template_key: templateKey, channel, subject: null, body: '' })
    setShowAddTemplate(false)
  }

  function openNewTemplate() {
    setTmplKey('')
    setTmplChannel('sms')
    setTmplBody('')
    setTmplSubject('')
    setEditingTemplate({ id: '', template_key: '', channel: 'sms', subject: null, body: '' })
    setShowAddTemplate(true)
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    await callSave({ action: 'upsert_template', template_key: tmplKey, channel: tmplChannel, subject: tmplSubject || null, body: tmplBody })
    setEditingTemplate(null)
    setShowAddTemplate(false)
  }

  async function handleDeleteTemplate(tmpl: MessageTemplate) {
    const using = rules.filter(r => r.template_key === tmpl.template_key && r.channel === tmpl.channel)
    if (using.length) {
      alert(t('remindersPage.templateInUse', { rules: using.map(r => r.rule_name).join(', ') }))
      return
    }
    if (!confirm(t('remindersPage.deleteTemplateConfirm'))) return
    await callSave({ action: 'delete_template', template_key: tmpl.template_key, channel: tmpl.channel })
  }

  function insertVariable(variable: string) {
    const el = textareaRef.current
    if (!el) {
      setTmplBody(b => b + variable)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const newValue = tmplBody.slice(0, start) + variable + tmplBody.slice(end)
    setTmplBody(newValue)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
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
      setGenerateResult(t('remindersPage.scheduleResult', { count: data.created ?? 0, bookings: data.bookings_processed ?? 0 }))
    } catch (e: any) {
      setGenerateResult(`${t('error')} ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="helper" style={{ padding: 32 }}>{t('loading')}</div>

  const TRIGGER_EVENTS = [
    { value: 'booking_confirmed', label: t('remindersPage.triggerBookingCreated') },
    { value: 'before_start',      label: t('remindersPage.triggerBeforeStart') },
    { value: 'unpaid_balance',    label: t('remindersPage.triggerUnpaid') },
  ]

  const CHANNELS = [
    { value: 'sms',   label: 'SMS' },
    { value: 'email', label: t('remindersPage.channelEmail') },
  ]

  const triggerLabel = (rule: ReminderRule) => {
    if (rule.trigger_event === 'booking_confirmed') {
      const hours = Math.round(rule.minutes_offset / 60)
      return hours === 0 ? t('remindersPage.immediately') : t('remindersPage.hoursAfterCreated', { hours })
    }
    const hours = Math.round(Math.abs(rule.minutes_offset) / 60)
    if (rule.trigger_event === 'before_start') return t('remindersPage.offsetBefore', { duration: `${hours}h` })
    return t('remindersPage.offsetAfterStart', { duration: `${hours}h` })
  }

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <h3 style={{ marginBottom: 8 }}>{t('remindersPage.title')}</h3>
      <p className="helper" style={{ marginBottom: 24 }}>{t('remindersPage.subtitle')}</p>

      {error && <div style={{ color: 'salmon', marginBottom: 16 }}>{error}</div>}

      {/* ── 1. Create message ─────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'nowrap' }}>
          <div style={sectionLabel}>{t('remindersPage.sectionTemplates')}</div>
          {!editingTemplate && (
            <button onClick={openNewTemplate} disabled={saving}>{t('remindersPage.addTemplate')}</button>
          )}
        </div>

        {templates.length === 0 && !editingTemplate && (
          <div className="helper" style={{ marginBottom: 12 }}>{t('remindersPage.noTemplates')}</div>
        )}

        {!editingTemplate && templates.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {templates.map(tmpl => (
              <div key={tmpl.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tmpl.subject || tmpl.template_key.replace(/_/g, ' ')}
                    <span style={{ fontSize: 11, fontWeight: 400, background: 'var(--line)', borderRadius: 4, padding: '1px 6px' }}>
                      {tmpl.channel.toUpperCase()}
                    </span>
                  </div>
                  <div className="helper" style={{ marginTop: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>{tmpl.body}</div>
                </div>
                <button onClick={() => openTemplateEditor(tmpl.template_key, tmpl.channel)} style={{ fontSize: 12, flexShrink: 0 }}>{t('edit')}</button>
                <button
                  onClick={() => handleDeleteTemplate(tmpl)}
                  disabled={saving}
                  style={{ fontSize: 12, flexShrink: 0, color: 'salmon', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >{t('delete')}</button>
              </div>
            ))}
          </div>
        )}

        {editingTemplate && (
          <form onSubmit={handleSaveTemplate} className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {showAddTemplate ? t('remindersPage.newTemplate') : `${t('remindersPage.editTemplate')} · ${tmplChannel.toUpperCase()}`}
            </div>
            {showAddTemplate && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.templateName')}</label>
                  <input value={tmplKey} onChange={e => setTmplKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))} required placeholder={t('remindersPage.templateNamePlaceholder')} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.channel')}</label>
                  <select value={tmplChannel} onChange={e => setTmplChannel(e.target.value)} style={{ width: '100%' }}>
                    {CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            {tmplChannel === 'email' && (
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.subject')}</label>
                <input value={tmplSubject} onChange={e => setTmplSubject(e.target.value)} style={{ width: '100%' }} placeholder={t('remindersPage.subjectPlaceholder')} />
              </div>
            )}
            <div>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.body')}</label>
              <textarea
                ref={textareaRef}
                value={tmplBody}
                onChange={e => setTmplBody(e.target.value)}
                required rows={5}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                placeholder={t('remindersPage.bodyPlaceholder')}
              />
              <div className="helper" style={{ marginTop: 6 }}>{t('remindersPage.variablesClickHint')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {TEMPLATE_VAR_LIST.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                  >{v}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="primary" disabled={saving}>{t('remindersPage.saveTemplate')}</button>
              <button type="button" onClick={() => { setEditingTemplate(null); setShowAddTemplate(false) }}>{t('cancel')}</button>
            </div>
          </form>
        )}
      </div>

      {/* ── 2. Set rule for when to send ─────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'nowrap' }}>
          <div style={sectionLabel}>{t('remindersPage.sectionRules')}</div>
          {!showRuleForm && (
            <button onClick={openAddRule} disabled={saving}>{t('remindersPage.addRule')}</button>
          )}
        </div>

        {hasSimplybook && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={simplybookSmsConfirmation}
              onChange={async e => {
                const val = e.target.checked
                setSimplybookSmsConfirmation(val)
                await callSave({ action: 'update_simplybook_setting', simplybook_sms_confirmation: val })
              }}
            />
            {t('remindersPage.simplybookSmsConfirmation')}
          </label>
        )}

        {showRuleForm && (
          <form onSubmit={handleSaveRule} className="card" style={{ padding: 20, marginBottom: 12, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {editingRuleId ? t('remindersPage.editRuleTitle') : t('remindersPage.addRuleTitle')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.ruleName')}</label>
                <input value={ruleForm.rule_name} onChange={e => setRuleForm(r => ({ ...r, rule_name: e.target.value }))} placeholder={t('remindersPage.ruleNamePlaceholder')} required style={{ width: '100%' }} />
              </div>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.trigger')}</label>
                <select value={ruleForm.trigger_event} onChange={e => setRuleForm(r => ({ ...r, trigger_event: e.target.value }))} style={{ width: '100%' }}>
                  {TRIGGER_EVENTS.map(te => <option key={te.value} value={te.value}>{te.label}</option>)}
                </select>
              </div>
              {ruleForm.trigger_event !== 'booking_confirmed' && (
                <div>
                  <label className="helper" style={{ display: 'block', marginBottom: 4 }}>
                    {ruleForm.trigger_event === 'before_start' ? t('remindersPage.hoursBefore') : t('remindersPage.hoursAfter')}
                  </label>
                  <input
                    type="number" min={1}
                    value={ruleForm.offset_hours}
                    onChange={e => setRuleForm(r => ({ ...r, offset_hours: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.channel')}</label>
                <select value={ruleForm.channel} onChange={e => setRuleForm(r => ({ ...r, channel: e.target.value, template_key: '' }))} style={{ width: '100%' }}>
                  {CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                </select>
              </div>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.messageTemplate')}</label>
                {templates.filter(tmpl => tmpl.channel === ruleForm.channel).length === 0 ? (
                  <div className="helper" style={{ color: 'salmon', fontSize: 12 }}>{t('remindersPage.noTemplatesForChannel')}</div>
                ) : (
                  <select value={ruleForm.template_key} onChange={e => setRuleForm(r => ({ ...r, template_key: e.target.value }))} required style={{ width: '100%' }}>
                    <option value="">{t('remindersPage.selectTemplate')}</option>
                    {templates.filter(tmpl => tmpl.channel === ruleForm.channel).map(tmpl => (
                      <option key={tmpl.id} value={tmpl.template_key}>
                        {tmpl.subject || tmpl.template_key.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>{t('remindersPage.service')}</label>
                <select value={ruleForm.service_id} onChange={e => setRuleForm(r => ({ ...r, service_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">{t('remindersPage.allServices')}</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="primary" disabled={saving}>{t('remindersPage.saveRule')}</button>
              <button type="button" onClick={closeRuleForm}>{t('cancel')}</button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <div className="helper">{t('remindersPage.noRules')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {rules.map(rule => (
              <div key={rule.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{rule.rule_name}</div>
                  <div className="helper">
                    {TRIGGER_EVENTS.find(te => te.value === rule.trigger_event)?.label}
                    {' · '}{triggerLabel(rule)}
                    {' · '}{rule.channel.toUpperCase()}
                    {rule.service_name ? ` · ${rule.service_name}` : ''}
                  </div>
                </div>
                <button onClick={() => openEditRule(rule)} style={{ fontSize: 12 }}>{t('edit')}</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={rule.active} onChange={() => callSave({ action: 'toggle_rule', id: rule.id, active: !rule.active })} />
                  {rule.active ? t('remindersPage.active') : t('remindersPage.paused')}
                </label>
                <button
                  onClick={() => { if (confirm(t('remindersPage.deleteConfirm', { name: rule.rule_name }))) callSave({ action: 'delete_rule', id: rule.id }) }}
                  style={{ fontSize: 12, color: 'salmon', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >{t('delete')}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Apply updates ─────────────────────────────────────── */}
      <div style={{ marginBottom: 0 }}>
        <div style={{ ...sectionLabel, marginBottom: 12 }}>{t('remindersPage.sectionApply')}</div>
        <div className="card" style={{ padding: 20 }}>
          <div className="helper" style={{ marginBottom: 12 }}>{t('remindersPage.scheduleNowHelp')}</div>
          {generateResult && (
            <div style={{ marginBottom: 12, fontSize: 14, color: generateResult.startsWith(t('error')) ? 'salmon' : '#10b981' }}>
              {generateResult}
            </div>
          )}
          <button onClick={handleGenerateReminders} disabled={generating}>
            {generating ? t('remindersPage.scheduling') : t('remindersPage.scheduleNow')}
          </button>
        </div>
      </div>
    </div>
  )
}
