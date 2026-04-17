import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/api'
import { formatDateTime } from '../lib/time'

const TOPICS = [
  { value: '',             label: 'How can we help you?' },
  { value: 'questions',    label: 'I have questions about the app' },
  { value: 'subscription', label: 'Changes in subscription' },
  { value: 'improvements', label: 'I want to suggest improvements' },
  { value: 'other',        label: 'Something else' },
]

const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
  TOPICS.filter(t => t.value).map(t => [t.value, t.label])
)

interface SentMessage {
  id: string
  topic: string
  message: string
  sent_at: string
  answered_at: string | null
  reply: string | null
  replied_at: string | null
}

type Status = 'idle' | 'sending' | 'success' | 'error'


export default function Contact() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [topic, setTopic]     = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus]   = useState<Status>('idle')
  const [sentMessages, setSentMessages]     = useState<SentMessage[]>([])
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [expandedReplyId, setExpandedReplyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const userEmail = user?.email || ''
  const canSubmit = topic !== '' && message.trim() !== '' && status !== 'sending'
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  async function fetchMessages() {
    try {
      const res = await fetch(`${base}/api/contact`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setSentMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load contact messages:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [])

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('sending')
    try {
      const res = await fetch(`${base}/api/contact`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ topic, message: message.trim() }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      await fetchMessages()
      setStatus('success')
      setTopic('')
      setMessage('')
    } catch (err) {
      console.error('Contact form error:', err)
      setStatus('error')
    }
  }

  return (
    <>
      {/* Success modal */}
      {status === 'success' && (
        <div
          onClick={() => setStatus('idle')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 360, width: '90%', textAlign: 'center' }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <h3 style={{ margin: 0, marginBottom: 12 }}>{t('contact.thankYou')}</h3>
            <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 24 }}>
              {t('contact.successMessage')}
            </p>
            <button className="primary" style={{ width: '100%' }} onClick={() => setStatus('idle')}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>{t('contact.title')}</h3>
        <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 24 }}>
          {t('contact.subheading')}
        </p>

        <div>
          <label>{t('contact.topic')}</label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ width: '100%' }}
          >
            {TOPICS.map(t => (
              <option key={t.value} value={t.value} disabled={t.value === ''}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 16 }}>
          <label>{t('contact.yourEmail')}</label>
          <input
            value={userEmail}
            disabled
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--primary)',
              color: '#999',
              cursor: 'not-allowed',
            }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label>{t('contact.message')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('contact.messagePlaceholder')}
            style={{ width: '100%', minHeight: 180, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {status === 'error' && (
          <p style={{ color: 'var(--danger, #ff6b6b)', marginTop: 8, marginBottom: 0 }}>
            {t('contact.submitError')}
          </p>
        )}

        <button
          className="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            marginTop: 20,
            width: '100%',
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {status === 'sending' ? t('contact.sending') : t('contact.sendMessage')}
        </button>

        {/* Sent messages history */}
        {(loading || sentMessages.length > 0) && (
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>{t('contact.sentMessages')}</h4>

            {loading ? (
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sentMessages.map(msg => {
                  const isExpanded = expandedId === msg.id
                  const isAnswered = !!(msg.answered_at || msg.replied_at)
                  return (
                    <div
                      key={msg.id}
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Topic + answered badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {TOPIC_LABEL[msg.topic] ?? msg.topic}
                        </span>
                        {isAnswered && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#fff',
                            background: '#22c55e',
                            borderRadius: 6,
                            padding: '2px 7px',
                            letterSpacing: '0.02em',
                          }}>
                            {t('messages.answeredBadge')}
                          </span>
                        )}
                      </div>

                      {/* Sent date */}
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                        {t('contact.sentDate', { date: formatDateTime(msg.sent_at) })}
                      </div>

                      {/* Expanded message */}
                      {isExpanded && (
                        <div style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: '1px solid var(--border)',
                          fontSize: 14,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          color: 'var(--text, #fff)',
                        }}>
                          {msg.message}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Received messages (replies from support) */}
      {!loading && sentMessages.some(m => m.reply) && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <h4 style={{ margin: 0, marginBottom: 12 }}>{t('contact.receivedMessages')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sentMessages.filter(m => m.reply).map(msg => {
              const isExpanded = expandedReplyId === msg.id
              return (
                <div
                  key={msg.id}
                  onClick={() => setExpandedReplyId(isExpanded ? null : msg.id)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Re: {TOPIC_LABEL[msg.topic] ?? msg.topic}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                    {t('contact.receivedDate', { date: formatDateTime(msg.replied_at!) })}
                  </div>
                  {isExpanded && (
                    <div style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text, #fff)',
                    }}>
                      {msg.reply}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}