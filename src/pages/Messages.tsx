import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/api'

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

function formatSentAt(iso: string): string {
  const d   = new Date(iso)
  const m   = d.getMonth() + 1
  const day = d.getDate()
  const yy  = String(d.getFullYear() % 100).padStart(2, '0')
  const hh  = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day}/${yy} ${hh}:${min}`
}

export default function Messages() {
  const { user } = useAuth()

  const [messages, setMessages]   = useState<Message[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  // Guard — should never render for non-super-admin but just in case
  if (user?.role !== 'super_admin') {
    return <p style={{ padding: 16 }}>Access denied.</p>
  }

  async function fetchMessages() {
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
      // Update locally without re-fetching
      setMessages(prev => prev.map(m =>
        m.id === msg.id
          ? { ...m, answered_at: msg.answered_at ? null : new Date().toISOString() }
          : m
      ))
    } catch (err) {
      console.error('Failed to toggle answered:', err)
      alert('Failed to update message. Please try again.')
    } finally {
      setTogglingId(null)
    }
  }

  const unanswered = messages.filter(m => !m.answered_at)
  const answered   = messages.filter(m =>  m.answered_at)

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h3 style={{ margin: 0, marginBottom: 4 }}>Messages</h3>
      <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 24 }}>
        All incoming contact messages across tenants.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
      ) : messages.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>No messages yet.</p>
      ) : (
        <>
          {/* Unanswered */}
          {unanswered.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h4 style={{ margin: 0, marginBottom: 12 }}>
                Unanswered
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

          {/* Answered */}
          {answered.length > 0 && (
            <div style={{ paddingTop: unanswered.length > 0 ? 24 : 0, borderTop: unanswered.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <h4 style={{ margin: 0, marginBottom: 12, color: 'var(--muted)' }}>Answered</h4>
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

// ── Sub-component ─────────────────────────────────────────────────────────────

interface MessageListProps {
  messages:   Message[]
  expandedId: string | null
  togglingId: string | null
  onExpand:   (id: string | null) => void
  onToggle:   (msg: Message) => void
}

function MessageList({ messages, expandedId, togglingId, onExpand, onToggle }: MessageListProps) {
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
            {/* Header row — click to expand */}
            <div
              onClick={() => onExpand(isExpanded ? null : msg.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Topic + badge */}
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
                    Answered
                  </span>
                )}
              </div>

              {/* Meta row */}
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3, display: 'flex', gap: 12 }}>
                <span>{msg.user_email}</span>
                <span>{msg.tenant_name}</span>
                <span>Sent: {formatSentAt(msg.sent_at)}</span>
              </div>
            </div>

            {/* Expanded: message + checkbox */}
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

                {/* Answered checkbox */}
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
                  Mark as answered
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}