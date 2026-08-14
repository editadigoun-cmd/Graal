import { useEffect, useRef, useState } from 'react'
import Daily from '@daily-co/daily-js'
import type { DailyCall, DailyParticipant, DailyEventObjectAppMessage } from '@daily-co/daily-js'
import {
  IconMic, IconMicOff, IconPhoneOff, IconVideo, IconVideoOff, IconScreenShare, IconChat, IconSend, IconX
} from '@/components/ui/icons'

interface ParticipantInfo {
  id: string
  name: string
  local: boolean
  audioMuted: boolean
  videoTrack: MediaStreamTrack | null
  audioTrack: MediaStreamTrack | null
  screenTrack: MediaStreamTrack | null
}

interface ChatMessage {
  id: string
  fromLocal: boolean
  nom: string
  texte: string
}

interface CallOverlayProps {
  roomUrl: string
  userName: string
  onLeave: () => void
}

function formatDuree(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function VideoTile({ track, mirror, className }: { track: MediaStreamTrack | null; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = track ? new MediaStream([track]) : null
  }, [track])
  return (
    <video
      ref={ref} autoPlay playsInline muted
      className={`${className ?? ''} ${mirror ? 'scale-x-[-1]' : ''} bg-ink-900 object-cover`}
    />
  )
}

// Interface d'appel maison (mode "Call Object" de daily-js) : audio, vidéo, partage d'écran et
// chat texte, sans iframe Daily ni sortie de l'application — texte entièrement en français,
// palette GRAAL.
export function CallOverlay({ roomUrl, userName, onLeave }: CallOverlayProps) {
  const callRef = useRef<DailyCall | null>(null)
  const audioElsRef = useRef<Record<string, HTMLAudioElement>>({})
  const [participants, setParticipants] = useState<ParticipantInfo[]>([])
  const [micMuted, setMicMuted] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [partageEcran, setPartageEcran] = useState(false)
  const [chatOuvert, setChatOuvert] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [nonLus, setNonLus] = useState(0)
  const [texteChat, setTexteChat] = useState('')
  const [statut, setStatut] = useState<'connexion' | 'connecte' | 'erreur'>('connexion')
  const [erreur, setErreur] = useState<string | null>(null)
  const [duree, setDuree] = useState(0)
  const chatFinRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const call = Daily.createCallObject()
    callRef.current = call

    function syncParticipants() {
      const all = call.participants()
      const list: ParticipantInfo[] = Object.values(all).map((p: DailyParticipant) => ({
        id: p.session_id,
        name: p.user_name || (p.local ? userName : 'Participant'),
        local: p.local,
        audioMuted: !p.audio,
        videoTrack: p.video ? p.tracks?.video?.persistentTrack ?? null : null,
        audioTrack: p.tracks?.audio?.persistentTrack ?? null,
        screenTrack: p.tracks?.screenVideo?.state === 'playable' ? p.tracks?.screenVideo?.persistentTrack ?? null : null
      }))
      setParticipants(list)

      for (const p of Object.values(all)) {
        if (p.local) continue
        const track = p.tracks?.audio?.persistentTrack
        if (track) {
          let el = audioElsRef.current[p.session_id]
          if (!el) {
            el = document.createElement('audio')
            el.autoplay = true
            document.body.appendChild(el)
            audioElsRef.current[p.session_id] = el
          }
          const stream = new MediaStream([track])
          if (el.srcObject !== stream) el.srcObject = stream
        } else if (audioElsRef.current[p.session_id]) {
          const el = audioElsRef.current[p.session_id]
          el.srcObject = null
          el.remove()
          delete audioElsRef.current[p.session_id]
        }
      }
    }

    function onAppMessage(e: DailyEventObjectAppMessage) {
      const data = e.data as { texte?: string; nom?: string }
      if (!data?.texte) return
      setMessages((m) => [...m, { id: crypto.randomUUID(), fromLocal: false, nom: data.nom ?? 'Participant', texte: data.texte! }])
      setChatOuvert((ouvert) => { if (!ouvert) setNonLus((n) => n + 1); return ouvert })
    }

    call
      .on('joined-meeting', () => setStatut('connecte'))
      .on('participant-joined', syncParticipants)
      .on('participant-updated', syncParticipants)
      .on('participant-left', syncParticipants)
      .on('app-message', onAppMessage)
      .on('error', (e) => {
        setErreur(e?.errorMsg ?? "Une erreur est survenue pendant l'appel.")
        setStatut('erreur')
      })
      .on('left-meeting', () => onLeave())

    call.join({ url: roomUrl, userName, startVideoOff: true }).catch((e: Error) => {
      setErreur(e?.message ?? "Impossible de rejoindre l'appel.")
      setStatut('erreur')
    })

    return () => {
      Object.values(audioElsRef.current).forEach((el) => { el.srcObject = null; el.remove() })
      audioElsRef.current = {}
      call.leave().catch(() => {})
      call.destroy().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl])

  useEffect(() => {
    if (statut !== 'connecte') return
    const debut = Date.now()
    const t = setInterval(() => setDuree(Math.floor((Date.now() - debut) / 1000)), 1000)
    return () => clearInterval(t)
  }, [statut])

  useEffect(() => { chatFinRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  function toggleMic() {
    const call = callRef.current
    if (!call) return
    const nextMuted = !micMuted
    call.setLocalAudio(!nextMuted)
    setMicMuted(nextMuted)
  }

  function toggleCamera() {
    const call = callRef.current
    if (!call) return
    const next = !camOn
    call.setLocalVideo(next)
    setCamOn(next)
  }

  function togglePartageEcran() {
    const call = callRef.current
    if (!call) return
    if (partageEcran) {
      call.stopScreenShare()
      setPartageEcran(false)
    } else {
      call.startScreenShare()
      setPartageEcran(true)
    }
  }

  function envoyerMessage() {
    const call = callRef.current
    const texte = texteChat.trim()
    if (!call || !texte) return
    call.sendAppMessage({ texte, nom: userName }, '*')
    setMessages((m) => [...m, { id: crypto.randomUUID(), fromLocal: true, nom: 'Vous', texte }])
    setTexteChat('')
  }

  function ouvrirChat() {
    setChatOuvert(true)
    setNonLus(0)
  }

  function raccrocher() {
    callRef.current?.leave().catch(() => {})
    onLeave()
  }

  const partageDistant = participants.find((p) => !p.local && p.screenTrack)
  const monPartage = participants.find((p) => p.local && p.screenTrack)
  const ecranActif = partageDistant?.screenTrack ?? monPartage?.screenTrack ?? null

  return (
    <div className="fixed inset-0 z-[70] flex bg-gradient-to-b from-royal-900 via-royal-800 to-ink-900 text-white">
      <div className="flex flex-1 flex-col items-center justify-between px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
            {statut === 'connexion' ? 'Connexion en cours…' : statut === 'erreur' ? 'Problème de connexion' : 'Appel GRAAL en cours'}
          </p>
          {statut === 'connecte' && <p className="text-lg font-bold tabular-nums">{formatDuree(duree)}</p>}
        </div>

        {erreur && (
          <div className="max-w-xs rounded-xl bg-red-500/20 px-4 py-2 text-center text-sm text-red-100">{erreur}</div>
        )}

        <div className="flex w-full flex-1 items-center justify-center overflow-hidden py-4">
          {ecranActif ? (
            <div className="flex h-full w-full flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
                <VideoTile track={ecranActif} className="h-full w-full" />
              </div>
              <div className="flex flex-shrink-0 gap-2 overflow-x-auto pb-1">
                {participants.map((p) => (
                  <ParticipantTuile key={p.id} p={p} taille="petite" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid w-full max-w-3xl auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3">
              {participants.map((p) => (
                <ParticipantTuile key={p.id} p={p} taille="grande" />
              ))}
              {participants.length === 0 && statut === 'connexion' && (
                <p className="col-span-full text-center text-sm text-white/50">Connexion à la salle d'appel…</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-5">
          <button
            onClick={toggleMic}
            className={`flex items-center justify-center rounded-full transition active:scale-95 ${micMuted ? 'bg-white text-ink-900' : 'bg-white/15 text-white'}`}
            style={{ height: 52, width: 52 }}
          >
            {micMuted ? <IconMicOff className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
          </button>
          <button
            onClick={toggleCamera}
            className={`flex items-center justify-center rounded-full transition active:scale-95 ${!camOn ? 'bg-white text-ink-900' : 'bg-white/15 text-white'}`}
            style={{ height: 52, width: 52 }}
          >
            {camOn ? <IconVideo className="h-5 w-5" /> : <IconVideoOff className="h-5 w-5" />}
          </button>
          <button
            onClick={togglePartageEcran}
            className={`hidden items-center justify-center rounded-full transition active:scale-95 sm:flex ${partageEcran ? 'bg-flame-500 text-white' : 'bg-white/15 text-white'}`}
            style={{ height: 52, width: 52 }}
          >
            <IconScreenShare className="h-5 w-5" />
          </button>
          <button
            onClick={ouvrirChat}
            className="relative flex items-center justify-center rounded-full bg-white/15 text-white transition active:scale-95"
            style={{ height: 52, width: 52 }}
          >
            <IconChat className="h-5 w-5" />
            {nonLus > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-flame-600 text-[10px] font-bold">{nonLus}</span>
            )}
          </button>
          <button
            onClick={raccrocher}
            className="flex items-center justify-center rounded-full bg-flame-600 text-white shadow-lg transition active:scale-95"
            style={{ height: 60, width: 60 }}
          >
            <IconPhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>

      {chatOuvert && (
        <div className="flex w-full max-w-xs flex-shrink-0 flex-col border-l border-white/10 bg-ink-900/95 sm:max-w-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-bold">Discussion de l'appel</p>
            <button onClick={() => setChatOuvert(false)}><IconX className="h-5 w-5 text-white/70" /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="text-center text-xs text-white/40">Aucun message pour l'instant.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.fromLocal ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.fromLocal ? 'bg-royal-500 text-white' : 'bg-white/10 text-white'}`}>
                  {!m.fromLocal && <p className="mb-0.5 text-[10px] font-bold text-royal-200">{m.nom}</p>}
                  <p>{m.texte}</p>
                </div>
              </div>
            ))}
            <div ref={chatFinRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
            <input
              value={texteChat} onChange={(e) => setTexteChat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && envoyerMessage()}
              placeholder="Message…"
              className="flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/30"
            />
            <button
              onClick={envoyerMessage} disabled={!texteChat.trim()}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-royal-500 text-white disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ParticipantTuile({ p, taille }: { p: ParticipantInfo; taille: 'petite' | 'grande' }) {
  const dims = taille === 'petite' ? 'h-20 w-28' : 'aspect-square w-full'
  return (
    <div className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5 ${dims}`}>
      {p.videoTrack ? (
        <VideoTile track={p.videoTrack} mirror={p.local} className="h-full w-full" />
      ) : (
        <div className={`flex items-center justify-center rounded-full bg-white/10 font-bold ${taille === 'petite' ? 'h-9 w-9 text-sm' : 'h-16 w-16 text-2xl'}`}>
          {p.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
        <p className="truncate text-[11px] font-medium text-white/90">{p.local ? 'Vous' : p.name}</p>
        {p.audioMuted && <IconMicOff className="h-3.5 w-3.5 flex-shrink-0 text-flame-300" />}
      </div>
    </div>
  )
}
