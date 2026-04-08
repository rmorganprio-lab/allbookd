import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

function renderInline(text) {
  const parts = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0, m, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] != null) parts.push(<strong key={k++}>{m[1]}</strong>)
    else parts.push(<em key={k++}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function renderMarkdown(text) {
  return text.split(/\n{2,}/).map((block, bi) => {
    const lines = block.split('\n')
    const bulletLines = lines.filter(l => l.trim())
    if (bulletLines.length > 0 && bulletLines.every(l => /^[-•*]\s+/.test(l.trim()))) {
      return (
        <ul key={bi} className={`list-disc pl-4 space-y-0.5${bi > 0 ? ' mt-2' : ''}`}>
          {bulletLines.map((item, ii) => (
            <li key={ii}>{renderInline(item.replace(/^[-•*]\s+/, ''))}</li>
          ))}
        </ul>
      )
    }
    return (
      <p key={bi} className={bi > 0 ? 'mt-2' : ''}>
        {lines.map((line, li) => (
          <span key={li}>{li > 0 && <br />}{renderInline(line)}</span>
        ))}
      </p>
    )
  })
}

function LangToggle() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  function toggle(code) {
    i18n.changeLanguage(code)
    localStorage.setItem('timelyops_language', code)
  }
  return (
    <div className="flex items-center gap-1 text-xs font-semibold">
      <button
        onClick={() => toggle('en')}
        className={`px-2 py-1 rounded-md transition-colors ${lang === 'en' ? 'bg-emerald-700 text-white' : 'text-stone-400 hover:text-stone-600'}`}
      >
        EN
      </button>
      <span className="text-stone-300">|</span>
      <button
        onClick={() => toggle('es')}
        className={`px-2 py-1 rounded-md transition-colors ${lang === 'es' ? 'bg-emerald-700 text-white' : 'text-stone-400 hover:text-stone-600'}`}
      >
        ES
      </button>
    </div>
  )
}

function PoweredBy() {
  const { t } = useTranslation()
  return (
    <div className="py-5 text-center text-xs text-stone-400">
      {t('booking.powered_by')}{' '}
      <a href="https://timelyops.com" className="text-emerald-700 font-semibold hover:underline">
        TimelyOps
      </a>
    </div>
  )
}

export default function BookingPage() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const [pageState, setPageState] = useState('loading') // loading | not_found | chat | confirmed
  const [orgName, setOrgName] = useState('')
  const [messages, setMessages] = useState([]) // [{ role: 'user'|'assistant', content }]
  const [conversationId, setConversationId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Validate org and start conversation via the Edge Function (uses service role — no RLS issue)
  useEffect(() => {
    async function init() {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('booking-agent', {
          body: { org_slug: slug, message: 'Hello' },
        })

        if (fnErr || data?.error) {
          setPageState('not_found')
          return
        }

        if (data.org_name) setOrgName(data.org_name)
        if (data.conversation_id) setConversationId(data.conversation_id)
        setMessages([{ role: 'assistant', content: data.reply }])
        setPageState('chat')
      } catch {
        setPageState('not_found')
      }
    }
    init()
  }, [slug])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function sendMessage(text) {
    setError(null)

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('booking-agent', {
        body: {
          org_slug: slug,
          conversation_id: conversationId,
          message: text,
        },
      })

      if (fnErr || data?.error) {
        setError(data?.error || t('booking.error_generic'))
        return
      }

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id)
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])

      if (data.job_created) {
        setTimeout(() => setPageState('confirmed'), 1800)
      }
    } catch {
      setError(t('booking.error_connection'))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setSending(true)
    sendMessage(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAF8' }}>
        <div className="text-stone-400 text-sm">{t('booking.loading')}</div>
      </div>
    )
  }

  // ── Not found / not enabled ──────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen py-10 px-4" style={{ background: '#FAFAF8' }}>
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <div className="font-semibold text-stone-800 mb-2">{t('booking.not_found_title')}</div>
            <div className="text-sm text-stone-500">{t('booking.not_found_body')}</div>
          </div>
          <PoweredBy />
        </div>
      </div>
    )
  }

  // ── Confirmed ────────────────────────────────────────────────────
  if (pageState === 'confirmed') {
    return (
      <div className="min-h-screen py-10 px-4" style={{ background: '#FAFAF8' }}>
        <div className="max-w-lg mx-auto">
          {orgName && (
            <div className="mb-6 text-center">
              <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">{t('booking.booking_with')}</div>
              <div className="text-2xl font-extrabold text-stone-900 tracking-tight">{orgName}</div>
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="font-semibold text-stone-800 mb-2">{t('booking.confirmed_title')}</div>
            <div className="text-sm text-stone-500">
              {orgName
                ? t('booking.confirmed_body_org', { org: orgName })
                : t('booking.confirmed_body')}
            </div>
          </div>
          <PoweredBy />
        </div>
      </div>
    )
  }

  // ── Chat ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAF8' }}>

      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-4 pt-5 pb-4 relative">
        {/* Language toggle — top-right */}
        <div className="absolute top-4 right-4">
          <LangToggle />
        </div>

        <div className="text-center max-w-lg mx-auto pr-16">
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">{t('booking.booking_with')}</div>
          <div className="text-2xl font-extrabold text-stone-900 tracking-tight leading-tight">{orgName}</div>
          <div className="mt-2 text-base text-stone-600 font-medium">{t('booking.welcome')}</div>
        </div>

        {/* Trust signal */}
        <div className="mt-3 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {t('booking.trust_signal')}
          </span>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-lg mx-auto w-full">
        {messages.length === 0 && !sending && (
          <div className="text-center text-stone-400 text-sm mt-8">{t('booking.starting')}</div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : 'text-stone-800 rounded-bl-sm'
              }`}
              style={
                msg.role === 'user'
                  ? { background: '#1D9E75' }
                  : { background: '#F0FAF5', border: '1px solid #D1FAE5' }
              }
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="mb-3 flex justify-start">
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center"
              style={{ background: '#F0FAF5', border: '1px solid #D1FAE5' }}
            >
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 mx-1 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-stone-200 px-4 pt-3 pb-4 max-w-lg mx-auto w-full">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:border-transparent max-h-32"
            style={{ '--tw-ring-color': '#1D9E75' }}
            placeholder={t('booking.input_placeholder')}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-11 h-11 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: '#1D9E75' }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#17876A' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1D9E75' }}
          >
            <svg className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>

        <div className="mt-2 text-center text-xs text-stone-400">
          {t('booking.powered_by')}{' '}
          <a href="https://timelyops.com" className="text-emerald-700 font-semibold hover:underline">
            TimelyOps
          </a>
        </div>
      </div>

    </div>
  )
}
