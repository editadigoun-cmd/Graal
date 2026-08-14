import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IconChevronLeft, IconSend, IconPaperclip, IconMic, IconX, IconDownload, IconClipboard, IconAlert } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Message = Database['public']['Tables']['messages']['Row']

export default function Conversation() {
  const { conversationId } = useParams()
  const { session, profile } = useAuth()
  const estVm = profile?.role === 'vm'
  const base = estVm ? '/app/messages' : '/admin/messages'
  const [messages, setMessages] = useState<Message[]>([])
  const [texte, setTexte] = useState('')
  const [titre, setTitre] = useState('Conversation')
  const [estGroupe, setEstGroupe] = useState(false)
  const [nomsParId, setNomsParId] = useState<Record<string, string>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (!conversationId) return
    supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    supabase.from('conversations').select('*, conversation_participants(profile_id, profiles(full_name))').eq('id', conversationId).single()
      .then(({ data }: any) => {
        const autres = (data?.conversation_participants ?? []).filter((p: any) => p.profile_id !== session?.user.id)
        setTitre(data?.nom || autres.map((p: any) => p.profiles?.full_name).join(', ') || 'Conversation')
        setEstGroupe(data?.type !== 'DIRECT')
        setNomsParId(Object.fromEntries(
          (data?.conversation_participants ?? []).map((p: any) => [p.profile_id, p.profiles?.full_name ?? 'Utilisateur'])
        ))
      })

    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, session])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  useEffect(() => {
    const manquants = messages.filter((m) => m.piece_jointe_path && !signedUrls[m.piece_jointe_path])
    if (manquants.length === 0) return
    Promise.all(manquants.map(async (m) => {
      const { data } = await supabase.storage.from('messagerie').createSignedUrl(m.piece_jointe_path!, 3600)
      return [m.piece_jointe_path!, data?.signedUrl] as const
    })).then((pairs) => {
      setSignedUrls((cur) => {
        const next = { ...cur }
        pairs.forEach(([path, url]) => { if (url) next[path] = url })
        return next
      })
    })
  }, [messages, signedUrls])

  async function envoyer() {
    if (!texte.trim() || !session || !conversationId) return
    const contenu = texte
    setTexte('')
    await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: session.user.id, contenu, type: 'text' })
  }

  async function envoyerFichier(file: File) {
    if (!session || !conversationId) return
    setEnvoiEnCours(true)
    setErreur(null)
    const path = `${session.user.id}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('messagerie').upload(path, file, { contentType: file.type })
    if (uploadError) { setErreur(uploadError.message); setEnvoiEnCours(false); return }
    const type = file.type.startsWith('image/') ? 'image' : 'fichier'
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId, sender_id: session.user.id, contenu: file.name, type, piece_jointe_path: path
    })
    if (error) setErreur(error.message)
    setEnvoiEnCours(false)
  }

  function onFichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) envoyerFichier(file)
  }

  async function toggleEnregistrement() {
    if (enregistrement) {
      mediaRecorderRef.current?.stop()
      setEnregistrement(false)
      return
    }
    setErreur(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (!session || !conversationId) return
        setEnvoiEnCours(true)
        const path = `${session.user.id}/${crypto.randomUUID()}-message-vocal.webm`
        const { error: uploadError } = await supabase.storage.from('messagerie').upload(path, blob, { contentType: 'audio/webm' })
        if (uploadError) { setErreur(uploadError.message); setEnvoiEnCours(false); return }
        const { error } = await supabase.from('messages').insert({
          conversation_id: conversationId, sender_id: session.user.id, contenu: 'Message vocal', type: 'audio', piece_jointe_path: path
        })
        if (error) setErreur(error.message)
        setEnvoiEnCours(false)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setEnregistrement(true)
    } catch {
      setErreur("Microphone inaccessible — vérifiez les autorisations de l'appareil.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col graal-surface">
      <div className="flex items-center gap-2 border-b border-ink-100/60 bg-white/70 px-4 py-3 backdrop-blur pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <Link to={base} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <p className="font-bold text-ink-800">{titre}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.map((m) => {
          const mine = m.sender_id === session?.user.id
          const url = m.piece_jointe_path ? signedUrls[m.piece_jointe_path] : undefined
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-softer ${mine ? 'bg-royal-600 text-white rounded-br-md' : 'bg-white text-ink-800 rounded-bl-md'}`}>
                {estGroupe && !mine && (
                  <p className="mb-1 text-[11px] font-bold text-royal-500">{nomsParId[m.sender_id] ?? 'Utilisateur'}</p>
                )}
                {m.type === 'image' && url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={m.contenu ?? 'Image'} className="max-w-full rounded-xl mb-1" />
                  </a>
                ) : m.type === 'audio' && url ? (
                  <audio controls src={url} className="max-w-full" />
                ) : m.type === 'fichier' && url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${mine ? 'text-white' : 'text-royal-600'}`}>
                    <IconClipboard className="h-4 w-4 flex-shrink-0" />
                    <span className="underline truncate">{m.contenu ?? 'Fichier'}</span>
                    <IconDownload className="h-3.5 w-3.5 flex-shrink-0" />
                  </a>
                ) : m.piece_jointe_path && !url ? (
                  <p className="italic opacity-70">Chargement de la pièce jointe…</p>
                ) : (
                  <p>{m.contenu}</p>
                )}
                <p className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-ink-300'}`}>{dayjs(m.created_at).format('HH:mm')}</p>
              </div>
            </motion.div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {erreur && (
        <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-xs text-red-600">
          <IconAlert className="h-3.5 w-3.5 flex-shrink-0" /><span>{erreur}</span>
          <button onClick={() => setErreur(null)} className="ml-auto"><IconX className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex items-center gap-2 bg-white/80 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFichierChoisi} />
        <button
          onClick={() => fileInputRef.current?.click()} disabled={envoiEnCours || enregistrement}
          className="text-ink-400 disabled:opacity-40"
        >
          <IconPaperclip className="h-5 w-5" />
        </button>
        {enregistrement ? (
          <div className="flex-1 flex items-center gap-2 rounded-full border border-flame-300 bg-flame-50 px-4 py-2.5 text-sm text-flame-600">
            <span className="h-2 w-2 rounded-full bg-flame-500 animate-pulse" /> Enregistrement en cours…
          </div>
        ) : (
          <input
            value={texte} onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && envoyer()}
            placeholder="Message…"
            disabled={envoiEnCours}
            className="flex-1 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-royal-400 disabled:opacity-60"
          />
        )}
        {texte.trim() && !enregistrement ? (
          <button onClick={envoyer} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-royal-600 text-white active:scale-95 transition">
            <IconSend className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={toggleEnregistrement} disabled={envoiEnCours}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white active:scale-95 transition disabled:opacity-40 ${enregistrement ? 'bg-flame-600' : 'bg-royal-600'}`}
          >
            {enregistrement ? <IconX className="h-4 w-4" /> : <IconMic className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
