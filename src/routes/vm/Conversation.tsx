import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IconChevronLeft, IconSend, IconPaperclip, IconEmoji, IconMic } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Message = Database['public']['Tables']['messages']['Row']

export default function Conversation() {
  const { conversationId } = useParams()
  const { session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [texte, setTexte] = useState('')
  const [titre, setTitre] = useState('Conversation')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId) return
    supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    supabase.from('conversations').select('*, conversation_participants(profile_id, profiles(full_name))').eq('id', conversationId).single()
      .then(({ data }: any) => {
        const autres = (data?.conversation_participants ?? []).filter((p: any) => p.profile_id !== session?.user.id)
        setTitre(data?.nom || autres.map((p: any) => p.profiles?.full_name).join(', ') || 'Conversation')
      })

    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, session])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function envoyer() {
    if (!texte.trim() || !session || !conversationId) return
    const contenu = texte
    setTexte('')
    await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, contenu })
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col graal-surface">
      <div className="flex items-center gap-2 border-b border-ink-100/60 bg-white/70 px-4 py-3 backdrop-blur pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <Link to="/app/messages" className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <p className="font-bold text-ink-800">{titre}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.map((m) => {
          const mine = m.sender_id === session?.user.id
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-softer ${mine ? 'bg-royal-600 text-white rounded-br-md' : 'bg-white text-ink-800 rounded-bl-md'}`}>
                <p>{m.contenu}</p>
                <p className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-ink-300'}`}>{dayjs(m.created_at).format('HH:mm')}</p>
              </div>
            </motion.div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 bg-white/80 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <button className="text-ink-400"><IconEmoji className="h-5 w-5" /></button>
        <button className="text-ink-400"><IconPaperclip className="h-5 w-5" /></button>
        <input
          value={texte} onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && envoyer()}
          placeholder="Message…"
          className="flex-1 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-royal-400"
        />
        {texte.trim() ? (
          <button onClick={envoyer} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-royal-600 text-white active:scale-95 transition">
            <IconSend className="h-4 w-4" />
          </button>
        ) : (
          <button className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-royal-600 text-white active:scale-95 transition">
            <IconMic className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
