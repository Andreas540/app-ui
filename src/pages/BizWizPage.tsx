// src/pages/BizWizPage.tsx
// AI business assistant page — "Ask BizWiz"
// Loads a business snapshot on mount, generates suggested questions via Claude,
// then lets the user ask free-form questions answered with that snapshot as context.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

const API = '/api/ai-assistant'

interface QA {
  question: string
  answer: string
}

export default function BizWizPage() {
  const { t, i18n } = useTranslation('bizwiz')

  const [suggestions,  setSuggestions]  = useState<string[]>([])
  const [history,      setHistory]      = useState<QA[]>([])
  const [input,        setInput]        = useState('')
  const [loadingSnap,  setLoadingSnap]  = useState(true)
  const [loadingSugg,  setLoadingSugg]  = useState(false)
  const [loadingAsk,   setLoadingAsk]   = useState(false)
  const [error,        setError]        = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }

  // Load snapshot on mount
  useEffect(() => {
    setLoadingSnap(true)
    fetch(`${API}?action=snapshot&lang=${i18n.language}`, { headers })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        fetchSuggestions()
      })
      .catch(() => setError(t('errorLoading')))
      .finally(() => setLoadingSnap(false))
  }, [])

  async function fetchSuggestions() {
    setLoadingSugg(true)
    try {
      const res  = await fetch(`${API}?action=suggest&lang=${i18n.language}`, { headers })
      const data = await res.json()
      if (data.suggestions) setSuggestions(data.suggestions)
    } catch { /* non-critical */ }
    finally  { setLoadingSugg(false) }
  }

  async function ask(question: string) {
    if (!question.trim()) return
    setInput('')
    setLoadingAsk(true)
    setHistory(h => [...h, { question, answer: '' }])
    try {
      const params = new URLSearchParams({ action: 'ask', lang: i18n.language, q: question })
      const res  = await fetch(`${API}?${params}`, { headers })
      const data = await res.json()
      const answer = data.answer ?? data.error ?? t('errorAsk')
      setHistory(h => h.map((qa, i) => i === h.length - 1 ? { ...qa, answer } : qa))
    } catch {
      setHistory(h => h.map((qa, i) => i === h.length - 1 ? { ...qa, answer: t('errorAsk') } : qa))
    } finally {
      setLoadingAsk(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('pageTitle')}</h1>
        <p style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>{t('pageSubtitle')}</p>
      </div>

      {/* Loading state */}
      {loadingSnap && (
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('loadingData')}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 14, color: 'var(--color-error)', marginBottom: 20 }}>{error}</div>
      )}

      {/* Suggested questions */}
      {!loadingSnap && !error && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {loadingSugg ? t('generatingSuggestions') : t('suggestedQuestions')}
          </div>
          {loadingSugg ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>…</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => ask(s)}
                  disabled={loadingAsk}
                  style={{
                    padding: '7px 14px', borderRadius: 20, fontSize: 13,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                    color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Q&A history */}
      {history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
          {history.map((qa, i) => (
            <div key={i}>
              {/* Question */}
              <div style={{
                fontSize: 14, fontWeight: 600, marginBottom: 8,
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
              }}>
                {qa.question}
              </div>
              {/* Answer */}
              {qa.answer ? (
                <div style={{
                  fontSize: 13, lineHeight: 1.7, color: 'var(--text)',
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {qa.answer}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 14px' }}>
                  {t('thinking')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div ref={bottomRef} />

      {/* Input */}
      {!loadingSnap && !error && (
        <div style={{
          position: 'sticky', bottom: 16,
          background: 'var(--bg, white)',
          borderTop: history.length > 0 ? '1px solid var(--border, #e5e7eb)' : 'none',
          paddingTop: history.length > 0 ? 12 : 0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask(input)}
              placeholder={t('inputPlaceholder')}
              disabled={loadingAsk}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 14,
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--input-bg, white)', color: 'var(--text)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => ask(input)}
              disabled={loadingAsk || !input.trim()}
              style={{
                padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: 'var(--accent, #6366f1)', color: 'white', border: 'none',
                cursor: 'pointer', opacity: loadingAsk || !input.trim() ? 0.5 : 1,
              }}
            >
              {loadingAsk ? t('asking') : t('ask')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
