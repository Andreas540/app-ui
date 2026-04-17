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
  reply: string | null
  replied_at: string | null
}


export default function Messages() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [messages, setMessages]             = useState<Message[]>([])
  const [loading, setLoading]               = useState(true)
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [togglingId, setTogglingId]         = useState<string | null>(null)
  const [replyingId, setReplyingId]         = useState<string | null>(null)
  const [replyTexts, setReplyTexts]         = useState<Record<string, string>>({})
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null)

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

  const sendReply = async (msg: Message) => {
    const text = replyTexts[msg.id]?.trim()
    if (!text) return
    setSendingReplyId(msg.id)
    try {
      const res = await fetch(`${base}/api/contact`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: msg.id, reply: text, answered: true }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const now = new Date().toISOString()
      setMessages(prev => prev.map(m =>
        m.id === msg.id
          ? { ...m, answered_at: now, reply: text, replied_at: now }
          : m
      ))
      setReplyingId(null)
      setReplyTexts(prev => { const next = { ...prev }; delete next[msg.id]; return next })
    } catch (err) {
      console.error('Failed to send reply:', err)
      alert(t('messages.replyFailed'))
    } finally {
      setSendingReplyId(null)
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
                replyingId={replyingId}
                replyTexts={replyTexts}
                sendingReplyId={sendingReplyId}
                onReply={setReplyingId}
                onReplyTextChange={(id, text) => setReplyTexts(prev => ({ ...prev, [id]: text }))}
                onSendReply={sendReply}
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
                replyingId={replyingId}
                replyTexts={replyTexts}
                sendingReplyId={sendingReplyId}
                onReply={setReplyingId}
                onReplyTextChange={(id, text) => setReplyTexts(prev => ({ ...prev, [id]: text }))}
                onSendReply={sendReply}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface MessageListProps {
  messages:          Message[]
  expandedId:        string | null
  togglingId:        string | null
  onExpand:          (id: string | null) => void
  onToggle:          (msg: Message) => void
  replyingId:        string | null
  replyTexts:        Record<string, string>
  sendingReplyId:    string | null
  onReply:           (id: string | null) => void
  onReplyTextChange: (id: string, text: string) => void
  onSendReply:       (msg: Message) => void
}

function MessageList({
  messages, expandedId, togglingId, onExpand, onToggle,
  replyingId, replyTexts, sendingReplyId, onReply, onReplyTextChange, onSendReply,
}: MessageListProps) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map(msg => {
        const isExpanded     = expandedId === msg.id
        const isAnswered     = !!msg.answered_at
        const isToggling     = togglingId === msg.id
        const isReplying     = replyingId === msg.id
        const isSendingReply = sendingReplyId === msg.id

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

              {/* Meta */}
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
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {/* Message body */}
                <div style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text, #fff)',
                  marginBottom: 14,
                }}>
                  {msg.message}
                </div>

                {/* Existing reply */}
                {msg.reply && (
                  <div style={{
                    marginBottom: 14,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.25)',
                  }}>
                    <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>
                      {t('messages.yourReply')}
                      {msg.replied_at && ` · ${formatDateTime(msg.replied_at)}`}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.reply}
                    </div>
                  </div>
                )}

                {/* Checkbox */}
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

                {/* Answer message link */}
                <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onReply(isReplying ? null : msg.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--primary)',
                      textDecoration: 'underline',
                      fontSize: 13,
                    }}
                  >
                    {t('messages.answerMessage')}
                  </button>
                </div>

                {/* Reply textarea */}
                {isReplying && (
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <textarea
                      value={replyTexts[msg.id] || ''}
                      onChange={e => onReplyTextChange(msg.id, e.target.value)}
                      placeholder={t('messages.replyPlaceholder')}
                      style={{ width: '100%', minHeight: 100, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button
                        className="primary"
                        disabled={!replyTexts[msg.id]?.trim() || isSendingReply}
                        onClick={() => onSendReply(msg)}
                        style={{ fontSize: 13 }}
                      >
                        {isSendingReply ? t('messages.sendingReply') : t('messages.sendReply')}
                      </button>
                      <button onClick={() => onReply(null)} style={{ fontSize: 13 }}>
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
