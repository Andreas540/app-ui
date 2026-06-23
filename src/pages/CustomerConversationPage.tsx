// src/pages/CustomerConversationPage.tsx
// Admin-side conversation thread with a single customer.
// Route: /customers/:id/conversation
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
  read_at: string | null
}

export default function CustomerConversationPage() {
  const { id: customerId } = useParams<{ id: string }>()
  const navigate            = useNavigate()
  const { t }              = useTranslation()
  const bottomRef           = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)

  const [customerName,  setCustomerName]  = useState('')
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [customerPhone, setCustomerPhone] = useState<string | null>(null)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [loading,       setLoading]       = useState(true)
  const [body,          setBody]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [sendError,     setSendError]     = useState<string | null>(null)
  const [channelEmail,  setChannelEmail]  = useState(true)
  const [channelSms,    setChannelSms]    = useState(false)

  // ── Load thread ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!customerId) return
    setLoading(true)
    fetch(`${BASE}/api/customer-messages?customer_id=${customerId}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setCustomerName(data.customer_name ?? '')
          setCustomerEmail(data.customer_email ?? null)
          setCustomerPhone(data.customer_phone ?? null)
          setMessages(data.messages ?? [])
          setChannelEmail(!!data.customer_email)
          setChannelSms(false) // SMS disabled until 10DLC
          // Mark inbound as read
          if ((data.unread_count ?? 0) > 0) {
            fetch(`${BASE}/api/customer-messages`, {
              method: 'PATCH',
              headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
              body: JSON.stringify({ customer_id: customerId }),
            }).catch(() => {})
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [customerId])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send ──────────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    const channels: string[] = []
    if (channelEmail && customerEmail) channels.push('email')
    if (channelSms   && customerPhone) channels.push('sms')
    try {
      const res  = await fetch(`${BASE}/api/customer-messages`, {
        method:  'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body:    JSON.stringify({ customer_id: customerId, body: text, channels }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      // Optimistically append the sent message
      setMessages(prev => [...prev, {
        id:         data.message_id,
        direction:  'outbound',
        body:       text,
        created_at: new Date().toISOString(),
        read_at:    null,
      }])
      setBody('')
      textareaRef.current?.focus()
    } catch (e: any) {
      setSendError(e?.message || String(e))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-narrow">
      <button
        onClick={() => navigate(`/customers/${customerId}`)}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 0 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← {t('conversation.backToCustomer')}
      </button>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {customerName || '…'}
          </h2>
          {(customerEmail || customerPhone) && (
            <div className="helper" style={{ marginTop: 2 }}>
              {[customerEmail, customerPhone].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        {/* Thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 240, maxHeight: 'calc(100vh - 320px)' }}>
          {loading ? (
            <div className="helper" style={{ textAlign: 'center', paddingTop: 24 }}>{t('loading')}</div>
          ) : messages.length === 0 ? (
            <div className="helper" style={{ textAlign: 'center', paddingTop: 24 }}>{t('conversation.noMessages')}</div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%',
                  padding: '8px 12px',
                  borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.direction === 'outbound' ? 'var(--primary)' : 'var(--surface-subtle)',
                  color: msg.direction === 'outbound' ? '#fff' : 'var(--text)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.body}
                </div>
                <div className="helper" style={{ marginTop: 2, fontSize: 11 }}>
                  {new Date(msg.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('conversation.placeholder')}
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg, var(--card))', color: 'var(--text)', boxSizing: 'border-box' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Channel toggles */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="helper">{t('conversation.notifyVia')}</span>
              <label
                title={!customerEmail ? t('conversation.noEmail') : ''}
                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: customerEmail ? 'pointer' : 'default', opacity: customerEmail ? 1 : 0.4 }}
              >
                <input
                  type="checkbox"
                  checked={channelEmail && !!customerEmail}
                  disabled={!customerEmail}
                  onChange={e => setChannelEmail(e.target.checked)}
                  style={{ width: 14, height: 14 }}
                />
                <span style={{ fontSize: 13 }}>✉️ {t('conversation.email')}</span>
              </label>
              <label
                title={t('conversation.smsComing')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default', opacity: 0.35 }}
              >
                <input type="checkbox" checked={false} disabled style={{ width: 14, height: 14 }} />
                <span style={{ fontSize: 13 }}>📱 {t('conversation.sms')}</span>
              </label>
            </div>

            <div style={{ flex: 1 }} />

            {sendError && (
              <span style={{ fontSize: 13, color: 'var(--color-error)' }}>{sendError}</span>
            )}
            <button
              className="primary"
              onClick={handleSend}
              disabled={sending || !body.trim()}
              style={{ height: 36, padding: '0 20px', opacity: sending ? 0.7 : 1 }}
            >
              {sending ? t('conversation.sending') : t('conversation.send')}
            </button>
          </div>
          <div className="helper" style={{ fontSize: 11 }}>{t('conversation.sendHint')}</div>
        </div>
      </div>
    </div>
  )
}
