import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const TOPICS = [
  { value: '', label: 'How can we help you?' },
  { value: 'questions',     label: 'I have questions about the app' },
  { value: 'subscription',  label: 'Changes in subscription' },
  { value: 'improvements',  label: 'I want to suggest improvements' },
  { value: 'other',         label: 'Something else' },
]

type Status = 'idle' | 'sending' | 'success' | 'error'

export default function Contact() {
  const { user } = useAuth()

  const [topic, setTopic]     = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus]   = useState<Status>('idle')

  const userEmail = user?.email || ''
  const canSubmit = topic !== '' && message.trim() !== '' && status !== 'sending'

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('sending')

    try {
      const body = new URLSearchParams({
        'form-name': 'contact',
        topic,
        email: userEmail,
        message: message.trim(),
      })

      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!res.ok) throw new Error(`status ${res.status}`)

      setStatus('success')
      setTopic('')
      setMessage('')
    } catch (err) {
      console.error('Contact form error:', err)
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Message sent ✓</h3>
        <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 20 }}>
          Thanks for reaching out! We'll get back to you at <strong>{userEmail}</strong> within an hour.
        </p>
        <button className="primary" onClick={() => setStatus('idle')}>
          Send another message
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ margin: 0, marginBottom: 4 }}>Contact</h3>
      <p style={{ color: 'var(--muted)', margin: 0, marginBottom: 20 }}>
        We try to answer within an hour.
      </p>

      {/* Topic */}
      <div>
        <label>Topic</label>
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

      {/* Email (read-only, shown for transparency) */}
      <div style={{ marginTop: 16 }}>
        <label>Your email</label>
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

      {/* Message */}
      <div style={{ marginTop: 16 }}>
        <label>Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your question or feedback…"
          rows={5}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>

      {status === 'error' && (
        <p style={{ color: 'var(--danger, #ff6b6b)', marginTop: 8, marginBottom: 0 }}>
          Something went wrong. Please try again.
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
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </div>
  )
}