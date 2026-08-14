import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { IconChevronLeft, IconSend, IconPaperclip, IconMic, IconX, IconDownload, IconClipboard, IconAlert, IconPlay, IconPause, IconPhone, IconPhoneOff, IconPlus } from '@/components/ui/icons'
import { CallOverlay } from '@/components/calls/CallOverlay'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { BENIN_TZ, nowBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Message = Database['public']['Tables']['messages']['Row']
type Appel = Database['public']['Tables']['appels_programmes']['Row']
type Enregistrement = Database['public']['Tables']['appel_enregistrements']['Row']

function formatDuree(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function AudioBubble({ url, mine }: { url: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 min-w-[190px]">
      <audio
        ref={audioRef} src={url} preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="hidden"
      />
      <button
        onClick={toggle}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${mine ? 'bg-white/20 text-white' : 'bg-royal-600 text-white'}`}
      >
        {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1 rounded-full overflow-hidden ${mine ? 'bg-white/30' : 'bg-ink-200'}`}>
          <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-royal-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-ink-400'}`}>{formatDuree(playing || current > 0 ? current : duration)}</p>
      </div>
    </div>
  )
}

export default function Conversation() {
  const { conversationId } = useParams()
  const { session, profile } = useAuth()
  const estVm = profile?.role === 'vm'
  const base = estVm ? '/app/messages' : '/admin/messages'
  const [messages, setMessages] = useState<Message[]>([])
  const [texte, setTexte] = useState('')
  const [titre, setTitre] = useState('Conversation')
  const [estGroupe, setEstGroupe] = useState(false)
  const [convType, setConvType] = useState('DIRECT')
  const [equipeId, setEquipeId] = useState<string | null>(null)
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [nomsParId, setNomsParId] = useState<Record<string, string>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [appels, setAppels] = useState<Appel[]>([])
  const [enregistrements, setEnregistrements] = useState<Record<string, Enregistrement[]>>({})
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [activeCall, setActiveCall] = useState<{ appelId: string; url: string } | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleTitre, setScheduleTitre] = useState('')
  const [scheduleMotif, setScheduleMotif] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleHeure, setScheduleHeure] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleErreur, setScheduleErreur] = useState<string | null>(null)

  const peutProgrammer = profile?.role === 'admin'
    || (profile?.role === 'superviseur' && convType === 'EQUIPE' && !!equipeId && supervisedIds.includes(equipeId))
  const peutVoirEnregistrements = profile?.role === 'admin' || profile?.role === 'superviseur'

  useEffect(() => {
    if (!conversationId) return
    supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    supabase.from('conversations').select('*, conversation_participants(profile_id, profiles(full_name))').eq('id', conversationId).single()
      .then(({ data }: any) => {
        const autres = (data?.conversation_participants ?? []).filter((p: any) => p.profile_id !== session?.user.id)
        setTitre(data?.nom || autres.map((p: any) => p.profiles?.full_name).join(', ') || 'Conversation')
        setEstGroupe(data?.type !== 'DIRECT')
        setConvType(data?.type ?? 'DIRECT')
        setEquipeId(data?.equipe_id ?? null)
        setNomsParId(Object.fromEntries(
          (data?.conversation_participants ?? []).map((p: any) => [p.profile_id, p.profiles?.full_name ?? 'Utilisateur'])
        ))
      })

    loadAppels()

    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, session])

  useEffect(() => {
    if (profile?.role !== 'superviseur') return
    supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
      .then(({ data }) => setSupervisedIds((data ?? []).map((s) => s.equipe_id)))
  }, [profile?.id, profile?.role])

  async function loadAppels() {
    if (!conversationId) return
    const { data } = await supabase.from('appels_programmes').select('*').eq('conversation_id', conversationId).order('date_heure')
    setAppels(data ?? [])
    const termines = (data ?? []).filter((a) => a.statut === 'TERMINE')
    if (termines.length > 0) {
      const { data: enr } = await supabase.from('appel_enregistrements').select('*').in('appel_id', termines.map((a) => a.id))
      const groupes: Record<string, Enregistrement[]> = {}
      for (const e of enr ?? []) { (groupes[e.appel_id] ??= []).push(e) }
      setEnregistrements(groupes)
    }
  }

  async function programmerAppel() {
    if (!conversationId || !scheduleTitre.trim() || !scheduleDate || !scheduleHeure || !session) return
    setScheduleSaving(true)
    setScheduleErreur(null)
    const dateHeure = dayjs.tz(`${scheduleDate} ${scheduleHeure}`, BENIN_TZ)
    if (dateHeure.isBefore(nowBenin())) {
      setScheduleErreur('La date et l\'heure doivent être dans le futur.')
      setScheduleSaving(false)
      return
    }
    const { error } = await supabase.from('appels_programmes').insert({
      conversation_id: conversationId,
      titre: scheduleTitre.trim(),
      motif: scheduleMotif.trim() || null,
      programme_par: session.user.id,
      date_heure: dateHeure.toISOString()
    })
    setScheduleSaving(false)
    if (error) { setScheduleErreur(error.message); return }
    setShowSchedule(false)
    setScheduleTitre(''); setScheduleMotif(''); setScheduleDate(''); setScheduleHeure('')
    loadAppels()
  }

  async function rejoindre(appelId: string) {
    setJoiningId(appelId)
    setErreur(null)
    const { data, error } = await supabase.functions.invoke('create-daily-room', { body: { appel_id: appelId } })
    setJoiningId(null)
    if (error || !data?.url) { setErreur(data?.error ?? error?.message ?? "Impossible de rejoindre l'appel."); return }
    if (data.avertissement) setErreur(data.avertissement)
    setActiveCall({ appelId, url: data.url })
    loadAppels()
  }

  async function terminerAppel(appelId: string) {
    setEndingId(appelId)
    setErreur(null)
    const { error } = await supabase.from('appels_programmes').update({ statut: 'TERMINE' }).eq('id', appelId)
    setEndingId(null)
    if (error) { setErreur(error.message); return }
    loadAppels()
  }

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
    <div className={estVm
      ? 'fixed inset-0 z-50 flex flex-col graal-surface'
      : 'flex h-[75vh] min-h-[420px] flex-col overflow-hidden rounded-xl3 border border-ink-100 bg-white shadow-soft'
    }>
      <div className={`flex items-center gap-2 border-b border-ink-100/60 bg-white/70 px-4 py-3 backdrop-blur ${estVm ? 'pt-[calc(env(safe-area-inset-top)+0.75rem)]' : ''}`}>
        <Link to={base} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <p className="font-bold text-ink-800">{titre}</p>
      </div>

      {estGroupe && (
        <div className="border-b border-ink-100/60 bg-ink-50/60 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink-600"><IconPhone className="h-3.5 w-3.5" /> Appels programmés</p>
            {peutProgrammer && (
              <button onClick={() => setShowSchedule(true)} className="flex items-center gap-1 text-xs font-semibold text-royal-600">
                <IconPlus className="h-3.5 w-3.5" /> Programmer
              </button>
            )}
          </div>

          {appels.filter((a) => a.statut === 'PROGRAMME' || a.statut === 'EN_COURS').length === 0 ? (
            <p className="text-[11px] text-ink-400">Aucun appel programmé.</p>
          ) : (
            <div className="space-y-1.5">
              {appels.filter((a) => a.statut === 'PROGRAMME' || a.statut === 'EN_COURS').map((a) => {
                const peutTerminer = a.statut === 'EN_COURS' && (profile?.role === 'admin' || a.programme_par === session?.user.id)
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-800 truncate">{a.titre}</p>
                      <p className="text-[10px] text-ink-400 truncate">
                        {dayjs(a.date_heure).format('DD/MM/YYYY HH:mm')}{a.motif ? ` · ${a.motif}` : ''}
                        {a.statut === 'EN_COURS' && <span className="ml-1 font-semibold text-emerald-600">· en cours</span>}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {peutTerminer && (
                        <button
                          onClick={() => terminerAppel(a.id)} disabled={endingId === a.id}
                          title="Terminer l'appel pour tout le monde"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-flame-50 text-flame-600 transition disabled:opacity-40"
                        >
                          <IconPhoneOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <Button size="sm" loading={joiningId === a.id} icon={<IconPhone className="h-3 w-3" />} onClick={() => rejoindre(a.id)}>
                        Rejoindre
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {peutVoirEnregistrements && appels.some((a) => a.statut === 'TERMINE') && (
            <div className="border-t border-ink-100 pt-2 space-y-1">
              <p className="text-[11px] font-semibold text-ink-500">Enregistrements</p>
              {appels.filter((a) => a.statut === 'TERMINE').map((a) => {
                const enrs = enregistrements[a.id] ?? []
                // Un enregistrement met généralement quelques minutes à être traité par
                // Daily.co après la fin de l'appel — au-delà de 2h, on considère qu'il n'y en
                // aura pas plutôt que d'afficher indéfiniment "en attente".
                const depasseDelai = dayjs(a.date_heure).isBefore(dayjs().subtract(2, 'hour'))
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] text-ink-500">
                    <span className="truncate">{a.titre} — {dayjs(a.date_heure).format('DD/MM/YYYY')}</span>
                    <div className="flex flex-shrink-0 gap-2">
                      {enrs.length === 0 && a.recording_actif === false && (
                        <span className="text-ink-300 italic">non enregistré</span>
                      )}
                      {enrs.length === 0 && a.recording_actif !== false && (
                        <span className="text-ink-300 italic">{depasseDelai ? 'indisponible' : 'en attente'}</span>
                      )}
                      {enrs.map((e) => (
                        <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-royal-600 underline">Écouter</a>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
                  <AudioBubble url={url} mine={mine} />
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

      <Modal open={showSchedule} onClose={() => setShowSchedule(false)} title="Programmer un appel" description={titre}>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-500">Titre</label>
            <input
              value={scheduleTitre} onChange={(e) => setScheduleTitre(e.target.value)}
              placeholder="Ex : Point hebdomadaire"
              className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-500">Motif (optionnel)</label>
            <input
              value={scheduleMotif} onChange={(e) => setScheduleMotif(e.target.value)}
              placeholder="Ex : Suivi des objectifs du mois"
              className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Date</label>
              <input
                type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Heure</label>
              <input
                type="time" value={scheduleHeure} onChange={(e) => setScheduleHeure(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
          </div>
          <p className="text-[11px] text-ink-400">
            Les participants du forum recevront un rappel automatique 1h, 30min et 5min avant l'appel.
          </p>
          {scheduleErreur && <p className="text-xs text-red-600">{scheduleErreur}</p>}
          <Button
            fullWidth loading={scheduleSaving} onClick={programmerAppel}
            disabled={!scheduleTitre.trim() || !scheduleDate || !scheduleHeure}
          >
            Programmer l'appel
          </Button>
        </div>
      </Modal>

      {activeCall && (
        <CallOverlay
          roomUrl={activeCall.url}
          userName={profile?.full_name ?? 'Utilisateur'}
          onLeave={() => { setActiveCall(null); loadAppels() }}
        />
      )}
    </div>
  )
}
