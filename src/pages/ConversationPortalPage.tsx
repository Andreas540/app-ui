// src/pages/ConversationPortalPage.tsx
// No-login customer-facing conversation portal.
// Accessed via /conversation/:token  (customer_links type='message')
// Standalone — rendered outside the authenticated app shell; no CSS variables.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

// ── Inline translations ───────────────────────────────────────────────────────

type Lang = 'en' | 'sv' | 'es'

const T: Record<Lang, Record<string, string>> = {
  en: {
    loading:      'Loading…',
    invalidToken: 'This link is invalid or has expired.',
    noMessages:   'No messages yet.',
    placeholder:  'Write a message…',
    send:         'Send',
    sending:      'Sending…',
    sendError:    'Could not send. Please try again.',
    poweredBy:    'Powered by Bizniz Optimizer',
  },
  sv: {
    loading:      'Laddar…',
    invalidToken: 'Den här länken är ogiltig eller har gått ut.',
    noMessages:   'Inga meddelanden ännu.',
    placeholder:  'Skriv ett meddelande…',
    send:         'Skicka',
    sending:      'Skickar…',
    sendError:    'Kunde inte skicka. Försök igen.',
    poweredBy:    'Drivs av Bizniz Optimizer',
  },
  es: {
    loading:      'Cargando…',
    invalidToken: 'Este enlace no es válido o ha expirado.',
    noMessages:   'Aún no hay mensajes.',
    placeholder:  'Escribe un mensaje…',
    send:         'Enviar',
    sending:      'Enviando…',
    sendError:    'No se pudo enviar. Inténtalo de nuevo.',
    poweredBy:    'Desarrollado por Bizniz Optimizer',
  },
}

type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
}

export default function ConversationPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [lang,        setLang]        = useState<Lang>('en')
  const [tenantName,  setTenantName]  = useState('')
  const [tenantIcon,  setTenantIcon]  = useState<string | null>(null)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [loadError,   setLoadError]   = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [body,        setBody]        = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const t = (key: string) => T[lang]?.[key] ?? T.en[key] ?? key

  // ── Load thread ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) { setLoadError(true); setLoading(false); return }
    fetch(`${BASE}/api/customer-messages?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setLoadError(true); return }
        setTenantName(data.tenant_name ?? '')
        setTenantIcon(data.tenant_icon ?? null)
        setMessages(data.messages ?? [])
        // Detect language from browser, fallback to en
        const bl = (navigator.language || '').toLowerCase()
        if (bl.startsWith('sv')) setLang('sv')
        else if (bl.startsWith('es')) setLang('es')
        else setLang('en')
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? 'instant' : 'smooth' } as any)
  }, [messages])

  // ── Send ──────────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = body.trim()
    if (!text || sending || !token) return
    setSending(true)
    setSendError(false)
    try {
      const res  = await fetch(`${BASE}/api/customer-messages`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ token, body: text }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      setMessages(prev => [...prev, {
        id:         data.message_id,
        direction:  'inbound',  // customer-authored = inbound in DB
        body:       text,
        created_at: new Date().toISOString(),
      }])
      setBody('')
      textareaRef.current?.focus()
    } catch {
      setSendError(true)
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
  }

  // ── Styles — explicit values, no CSS vars, works outside app theme ─────────

  const page: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', flexDirection: 'column',
    background: '#f0f4fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a2e',
  }

  const header: React.CSSProperties = {
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  }

  const thread: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: 680,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  }

  const composer: React.CSSProperties = {
    background: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
    maxWidth: 680,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ ...page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666', fontSize: 15 }}>{t('loading')}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ ...page, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ color: '#c0392b', fontSize: 15, textAlign: 'center' }}>{t('invalidToken')}</p>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={page}>

      {/* Header — tenant branding */}
      <div style={header}>
        {tenantIcon && (
          <img
            src={tenantIcon}
            alt={tenantName}
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: '#f8f8f8' }}
          />
        )}
        <span style={{ fontWeight: 700, fontSize: 16 }}>{tenantName}</span>
      </div>

      {/* Thread */}
      <div style={thread}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, marginTop: 32 }}>{t('noMessages')}</p>
        ) : (
          messages.map(msg => {
            // From the customer's perspective: outbound (admin sent) = left; inbound (customer sent) = right
            const isMe = msg.direction === 'inbound'
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%',
                  padding: '9px 13px',
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isMe ? '#3b82f6' : '#ffffff',
                  color: isMe ? '#ffffff' : '#1a1a2e',
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.body}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: '#999' }}>
                  {new Date(msg.created_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ background: '#f0f4fa', padding: '0 0 0 0' }}>
        <div style={composer}>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('placeholder')}
            rows={3}
            style={{
              width: '100%', resize: 'vertical', fontSize: 16,
              padding: '10px 12px', borderRadius: 8,
              border: '1px solid #d0d0d0', outline: 'none',
              background: '#ffffff', color: '#1a1a2e',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            {sendError
              ? <span style={{ fontSize: 13, color: '#c0392b' }}>{t('sendError')}</span>
              : <span />
            }
            <button
              onClick={handleSend}
              disabled={sending || !body.trim()}
              style={{
                height: 40, padding: '0 24px', borderRadius: 8,
                background: sending || !body.trim() ? '#93c5fd' : '#3b82f6',
                color: '#ffffff', border: 'none', cursor: sending || !body.trim() ? 'default' : 'pointer',
                fontSize: 15, fontWeight: 600, flexShrink: 0,
              }}
            >
              {sending ? t('sending') : t('send')}
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#aaa', padding: '4px 0 12px', margin: 0 }}>
          {t('poweredBy')}
        </p>
      </div>
    </div>
  )
}
