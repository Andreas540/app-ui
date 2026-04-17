import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/api'
import { formatDateTime } from '../lib/time'

const TOPIC_LABEL: Record<string, string> = {
  questions:    'I have questions about the app',
  subscription: 'Changes in subscription',
  improvements: 'I want to suggest improvements',
  other:        'Something else',
}

interface Message {
  id: string
  topic: string
  message: string
  sent_at: string
  answered_at: string | null
  user_email: string
  tenant_name: string
}


export default function Messages() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [messages, setMessages]     = useState<Message[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  if (user?.role !== 'super_admin') {
    return <p style={{ padding: 16 }}>{t('messages.accessDenied')}</p>
  }

  async function fetchMessages() {
    setLoading(true)
    try {
      const res = await fetch(`${base}/api/contact`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [])

  const toggleAnswered = async (msg: Message) => {
    setTogglingId(msg.id)
    try {
      const res = await fetch(`${base}/api/contact`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: msg.id, answered: !msg.answered_at }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setMessages(prev => prev.map(m =>
        m.id === msg.id
          ? { ...m, answered_at: msg.answered_at ? null : new Date().toISOString() }
          : m
      ))
    } catch (err) {
      console.error('Failed to toggle answered:', err)
      alert(t('messages.updateFailed'))
    } finally {
      setTogglingId(null)
    }
  }

  const unanswered = messages.filter(m => !m.answered_at)
  const answered   = messages.filter(m =>  m.answered_at)

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h3 style={{ margin: 0, marginBottom: 4 }}>{t('messages.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 24 }}>
        {t('messages.description')}
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</p>
      ) : messages.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('messages.noMessages')}</p>
      ) : (
        <>
          {unanswered.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h4 style={{ margin: 0, marginBottom: 12 }}>
                {t('messages.unanswered')}
                <span style={{
                  marginLeft: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '2px 8px',
                }}>
                  {unanswered.length}
                </span>
              </h4>
              <MessageList
                messages={unanswered}
                expandedId={expandedId}
                togglingId={togglingId}
                onExpand={setExpandedId}
                onToggle={toggleAnswered}
              />
            </div>
          )}

          {answered.length > 0 && (
            <div style={{
              paddingTop: unanswered.length > 0 ? 24 : 0,
              borderTop: unanswered.length > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <h4 style={{ margin: 0, marginBottom: 12, color: 'var(--muted)' }}>{t('messages.answered')}</h4>
              <MessageList
                messages={answered}
                expandedId={expandedId}
                togglingId={togglingId}
                onExpand={setExpandedId}
                onToggle={toggleAnswered}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface MessageListProps {
  messages:   Message[]
  expandedId: string | null
  togglingId: string | null
  onExpand:   (id: string | null) => void
  onToggle:   (msg: Message) => void
}

function MessageList({ messages, expandedId, togglingId, onExpand, onToggle }: MessageListProps) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map(msg => {
        const isExpanded = expandedId === msg.id
        const isAnswered = !!msg.answered_at
        const isToggling = togglingId === msg.id

        return (
          <div
            key={msg.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 14px',
              background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <div
              onClick={() => onExpand(isExpanded ? null : msg.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Topic + badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

              {/* Meta — stacked vertically for mobile */}
              <div style={{
                color: 'var(--muted)',
                fontSize: 12,
                marginTop: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                <span>{msg.user_email} · {msg.tenant_name}</span>
                <span>{t('messages.sentDate', { date: formatDateTime(msg.sent_at) })}</span>
                {isAnswered && msg.answered_at && (
                  <span style={{ color: '#22c55e' }}>
                    {t('messages.answeredDate', { date: formatDateTime(msg.answered_at) })}
                  </span>
                )}
              </div>
            </div>

            {isExpanded && (
              <div style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}>
                <div style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text, #fff)',
                  marginBottom: 14,
                }}>
                  {msg.message}
                </div>

                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: isToggling ? 'not-allowed' : 'pointer',
                    opacity: isToggling ? 0.5 : 1,
                    fontSize: 14,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAnswered}
                    disabled={isToggling}
                    onChange={() => onToggle(msg)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  {t('messages.markAsAnswered')}
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}