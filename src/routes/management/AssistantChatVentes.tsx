import { useEffect, useRef, useState } from 'react'
import type { ReactNode, KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { IconSparkles, IconSend, IconPlus, IconX } from '@/components/ui/icons'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  metadata?: Record<string, any>
  status?: string
}
type Conversation = { id: string; title: string; updated_at: string }

const AI_URL = import.meta.env.VITE_GRAAL_SALES_AI_URL || 'https://graal-sales-ai.ccds22431.workers.dev'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const db = supabase as any

const sourceLabels: Record<string, string> = {
  ventes_hebdomadaires: 'Ventes',
  objectifs_mensuels_produits: 'Objectifs',
  produits_pilotage: 'Produits / PGHT',
  produits: 'Catalogue',
  grossistes: 'Grossistes',
  laboratoires: 'Laboratoires',
  equipes: 'Équipes',
  imports_ventes_ia: 'Imports'
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-ink-100 px-1 py-0.5 text-[0.92em]">{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function parseTableRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}

function MarkdownContent({ content }: { content: string }) {
  const lines = String(content || '').split(/\r?\n/)
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) tableLines.push(lines[i++].trim())
      const parsed = tableLines.map(parseTableRow)
      const hasSeparator = parsed.length > 1 && parsed[1].every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
      const head = hasSeparator ? parsed[0] : null
      const body = hasSeparator ? parsed.slice(2) : parsed
      blocks.push(
        <div key={blocks.length} className="my-2 overflow-x-auto rounded-xl border border-ink-100">
          <table className="min-w-full text-left text-xs">
            {head && <thead className="bg-ink-50"><tr>{head.map((cell, j) => <th key={j} className="px-3 py-2 font-bold text-ink-600">{inlineMarkdown(cell)}</th>)}</tr></thead>}
            <tbody>{body.map((row, r) => <tr key={r} className="border-t border-ink-50">{row.map((cell, j) => <td key={j} className="px-3 py-2 text-ink-600">{inlineMarkdown(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = Math.min(3, line.match(/^#+/)?.[0].length || 2)
      const text = line.replace(/^#{1,3}\s+/, '')
      blocks.push(level === 1 ? <h2 key={blocks.length} className="mt-3 text-base font-extrabold text-ink-800">{inlineMarkdown(text)}</h2> : <h3 key={blocks.length} className="mt-2 text-sm font-bold text-ink-800">{inlineMarkdown(text)}</h3>)
      i++
      continue
    }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line)
      const items: string[] = []
      while (i < lines.length && (/^[-*]\s/.test(lines[i].trim()) || /^\d+\.\s/.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
        i++
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={blocks.length} className={ordered ? 'my-2 list-decimal space-y-1 pl-5' : 'my-2 list-disc space-y-1 pl-5'}>{items.map((item, j) => <li key={j}>{inlineMarkdown(item)}</li>)}</List>)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !/^#{1,3}\s/.test(lines[i].trim()) && !/^[-*]\s/.test(lines[i].trim()) && !/^\d+\.\s/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim())
      i++
    }
    blocks.push(<p key={blocks.length} className="my-1.5 leading-relaxed">{paragraph.map(inlineMarkdown).reduce((a, b) => [...a, ' ', b], [] as React.ReactNode[])}</p>)
  }
  return <div className="text-sm text-ink-700">{blocks}</div>
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function parseSseFrame(frame: string) {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trim())
  }
  if (!data.length) return null
  try { return { event, payload: JSON.parse(data.join('\n')) } } catch { return null }
}

export default function AssistantChatVentes() {
  const { session, profile } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<{requests: number; reserved: number; actual: number} | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function createConversation() {
    if (!session?.user?.id) return
    const { data, error: createError } = await db.from('sales_ai_conversations')
      .insert({ owner_id: user.id, title: 'Nouvelle conversation' })
      .select('id,title,updated_at').single()
    if (createError || !data) {
      setError(createError?.message || 'Impossible de créer une conversation.')
      return
    }
    setConversations(prev => [data, ...prev])
    setConversationId(data.id)
    setMessages([])
    setError('')
  }

  async function loadConversations() {
    if (!session?.user?.id) return
    setLoadingConversations(true)
    const { data, error: loadError } = await db.from('sales_ai_conversations')
      .select('id,title,updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (loadError) {
      setError(loadError.message)
      setLoadingConversations(false)
      return
    }
    const list = (data || []) as Conversation[]
    setConversations(list)
    if (!conversationId || !list.some(c => c.id === conversationId)) {
      if (list[0]) setConversationId(list[0].id)
      else await createConversation()
    }
    setLoadingConversations(false)
  }

  async function loadMessages(id: string) {
    setLoadingMessages(true)
    const { data, error: loadError } = await db.from('sales_ai_messages')
      .select('id,role,content,created_at,metadata')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100)
    if (loadError) {
      setError(loadError.message)
      setMessages([])
    } else {
      setMessages((data || []) as ChatMessage[])
    }
    setLoadingMessages(false)
  }

  async function loadUsage() {
    if (!session?.user?.id) return
    setUsageLoading(true)
    const { data, error: usageError } = await db.from('sales_ai_usage_reservations')
      .select('reserved_neurons,actual_neurons,status')
      .eq('user_id', user.id)
      .eq('usage_day', todayUTC())
    if (!usageError && data) {
      setUsage({
        requests: data.length,
        reserved: data.reduce((sum: number, row: any) => sum + Number(row.reserved_neurons || 0), 0),
        actual: data.reduce((sum: number, row: any) => sum + Number(row.actual_neurons || 0), 0)
      })
    }
    setUsageLoading(false)
  }

  useEffect(() => { loadConversations(); loadUsage() }, [session?.user?.id])
  useEffect(() => { if (conversationId) loadMessages(conversationId) }, [conversationId])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, status])

  async function selectConversation(id: string) {
    if (sending) return
    setConversationId(id)
    setError('')
  }

  async function deleteConversation() {
    if (!conversationId || sending || !window.confirm('Supprimer cette conversation et son historique ?')) return
    const { error: deleteError } = await db.from('sales_ai_conversations').delete().eq('id', conversationId).eq('owner_id', session?.user?.id)
    if (deleteError) { setError(deleteError.message); return }
    const rest = conversations.filter(c => c.id !== conversationId)
    setConversations(rest)
    setConversationId('')
    setMessages([])
    if (rest[0]) setConversationId(rest[0].id)
    else await createConversation()
  }

  async function sendMessage(text = message) {
    const content = text.trim()
    if (!content || sending || !conversationId || !session?.user?.id) return
    const accessToken = session?.access_token
    if (!accessToken || !SUPABASE_KEY) {
      setError('Session ou clé Supabase indisponible. Reconnectez-vous.')
      return
    }
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    setError('')
    setMessage('')
    setSending(true)
    setStatus('Connexion à l’agent…')
    setMessages(prev => [...prev, { id: userId, role: 'user', content }, { id: assistantId, role: 'assistant', content: '', status: 'Connexion à l’agent…' }])
    try {
      const response = await fetch(AI_URL + '/api/chat', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ conversation_id: conversationId, message: content })
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'L’agent IA est indisponible.')
      }
      if (!response.body) throw new Error('Flux de réponse indisponible.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''
      let donePayload: any = null
      let streamError = ''
      const dispatch = (frame: string) => {
        const parsed = parseSseFrame(frame)
        if (!parsed) return
        if (parsed.event === 'status') {
          const next = String(parsed.payload?.message || '')
          setStatus(next)
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, status: next } : m))
        } else if (parsed.event === 'token') {
          const token = String(parsed.payload?.text || '')
          assistantText += token
          setStatus('')
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText, status: '' } : m))
        } else if (parsed.event === 'done') {
          donePayload = parsed.payload
        } else if (parsed.event === 'error') {
          streamError = String(parsed.payload?.message || 'L’analyse a échoué.')
        }
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          dispatch(frame)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) dispatch(buffer)
      if (streamError) throw new Error(streamError)
      if (!assistantText) assistantText = 'Réponse terminée.'
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText, status: '', metadata: donePayload || {} } : m))
      await Promise.all([loadMessages(conversationId), loadUsage(), loadConversations()])
    } catch (sendError: any) {
      const textError = sendError?.message || 'Une erreur est survenue.'
      setError(textError)
      setStatus('')
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: textError, status: '', metadata: { error: true } } : m))
    } finally {
      setSending(false)
      setStatus('')
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const quickPrompts = [
    'Fais la synthèse des ventes de la dernière semaine disponible.',
    'Classe les produits par chiffre d’affaires sur le dernier mois disponible.',
    'Compare les deux dernières semaines de ventes disponibles.',
    'Vérifie la fraîcheur des données commerciales.'
  ]

  if (profile?.role !== 'admin') return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">L’assistant IA est réservé aux administrateurs.</div>

  return (
    <div className="flex h-[68vh] min-h-[430px] max-h-[700px] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal-100 text-royal-700"><IconSparkles className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink-800">Agent commercial Provisit</p>
            <p className="text-[11px] text-ink-400">Données réelles · lecture seule · GLM-4.7-Flash</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={conversationId} onChange={e => selectConversation(e.target.value)} disabled={sending || loadingConversations} className="max-w-[170px] rounded-xl border border-ink-200 bg-white px-2 py-1.5 text-xs font-semibold text-ink-600">
            {conversations.map(c => <option key={c.id} value={c.id}>{c.title || 'Conversation'}</option>)}
          </select>
          <button type="button" onClick={createConversation} disabled={sending} title="Nouvelle conversation" className="rounded-lg border border-ink-200 bg-white p-2 text-ink-500 hover:bg-royal-50 hover:text-royal-700 disabled:opacity-40"><IconPlus className="h-4 w-4" /></button>
          <button type="button" onClick={deleteConversation} disabled={sending || !conversationId} title="Supprimer la conversation" className="rounded-lg border border-ink-200 bg-white p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><IconX className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-ink-50/30 p-3 sm:p-4">
        {loadingMessages && <div className="flex items-center justify-center py-8 text-sm text-ink-400"><IconSparkles className="mr-2 h-4 w-4 animate-spin" />Chargement de la conversation…</div>}
        {!loadingMessages && messages.length === 0 && (
          <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-royal-100 to-cyan-100 text-royal-700"><IconSparkles className="h-7 w-7" /></div>
            <h3 className="text-lg font-extrabold text-ink-800">Votre analyste commercial IA</h3>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-500">Posez vos questions sur les ventes, les objectifs, les produits, les grossistes et les laboratoires. L’agent consulte les données autorisées avant de répondre.</p>
            <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
              {quickPrompts.map((prompt, i) => <button key={i} type="button" onClick={() => sendMessage(prompt)} disabled={sending} className="rounded-xl2 border border-ink-100 bg-white p-3 text-left text-xs font-semibold text-ink-600 shadow-sm transition hover:border-royal-200 hover:bg-royal-50 disabled:opacity-50">{prompt}</button>)}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map(m => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={m.role === 'user' ? 'max-w-[88%] rounded-2xl rounded-br-md bg-royal-600 px-3.5 py-2.5 text-white shadow-sm' : 'max-w-[94%] rounded-2xl rounded-bl-md border border-ink-100 bg-white px-3.5 py-2.5 text-ink-700 shadow-sm'}>
                {m.role === 'assistant' && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-royal-600"><IconSparkles className="h-3 w-3" /> Assistant IA</div>}
                {m.content ? <MarkdownContent content={m.content} /> : m.status && <div className="flex items-center gap-2 text-xs text-ink-400"><IconSparkles className="h-3.5 w-3.5 animate-spin" />{m.status}</div>}
                {m.role === 'assistant' && Array.isArray(m.metadata?.sources) && m.metadata.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.metadata.sources.map((s: string) => <span key={s} className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] text-ink-400">{sourceLabels[s] || s}</span>)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="mx-3 mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      <div className="border-t border-ink-100 bg-white p-3">
        <form onSubmit={e => { e.preventDefault(); sendMessage() }} className="flex items-end gap-2">
          <textarea ref={inputRef} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={onKeyDown} disabled={sending} rows={2} placeholder="Ex. Compare les ventes de cette semaine à la semaine précédente…" className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl2 border border-ink-200 bg-ink-50/50 px-3 py-2.5 text-sm text-ink-700 outline-none transition focus:border-royal-300 focus:bg-white focus:ring-2 focus:ring-royal-100 disabled:opacity-60" />
          <button type="submit" disabled={sending || !message.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-royal-700 to-royal-500 text-white shadow-lg shadow-royal-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Envoyer">
            {sending ? <IconSparkles className="h-5 w-5 animate-spin" /> : <IconSend className="h-5 w-5" />}
          </button>
        </form>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-ink-400">
          <span>Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</span>
          <span>{usageLoading ? 'Quota…' : usage ? `Aujourd’hui : ${usage.requests}/10 requêtes · ${Math.round(usage.reserved)} Neurons réservés` : 'Quota quotidien limité'}</span>
        </div>
      </div>
    </div>
  )
}
