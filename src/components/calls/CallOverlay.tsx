import { useEffect, useRef, useState } from 'react'
import Daily from '@daily-co/daily-js'
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js'
import { IconMic, IconMicOff, IconPhoneOff } from '@/components/ui/icons'

interface ParticipantInfo {
  id: string
  name: string
  muted: boolean
  local: boolean
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

// Interface d'appel audio maison (mode "Call Object" de daily-js) : pas d'iframe Daily,
// aucune sortie hors de l'application, texte entièrement en français, palette GRAAL.
export function CallOverlay({ roomUrl, userName, onLeave }: CallOverlayProps) {
  const callRef = useRef<DailyCall | null>(null)
  const audioElsRef = useRef<Record<string, HTMLAudioElement>>({})
  const [participants, setParticipants] = useState<ParticipantInfo[]>([])
  const [micMuted, setMicMuted] = useState(false)
  const [statut, setStatut] = useState<'connexion' | 'connecte' | 'erreur'>('connexion')
  const [erreur, setErreur] = useState<string | null>(null)
  const [duree, setDuree] = useState(0)

  useEffect(() => {
    const call = Daily.createCallObject()
    callRef.current = call

    function syncParticipants() {
      const all = call.participants()
      const list: ParticipantInfo[] = Object.values(all).map((p: DailyParticipant) => ({
        id: p.session_id,
        name: p.user_name || (p.local ? userName : 'Participant'),
        muted: !p.audio,
        local: p.local
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

    call
      .on('joined-meeting', () => setStatut('connecte'))
      .on('participant-joined', syncParticipants)
      .on('participant-updated', syncParticipants)
      .on('participant-left', syncParticipants)
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

  function toggleMic() {
    const call = callRef.current
    if (!call) return
    const nextMuted = !micMuted
    call.setLocalAudio(!nextMuted)
    setMicMuted(nextMuted)
  }

  function raccrocher() {
    callRef.current?.leave().catch(() => {})
    onLeave()
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-b from-royal-900 via-royal-800 to-ink-900 px-6 py-10 text-white">
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
          {statut === 'connexion' ? 'Connexion en cours…' : statut === 'erreur' ? 'Problème de connexion' : 'Appel GRAAL en cours'}
        </p>
        {statut === 'connecte' && <p className="text-lg font-bold tabular-nums">{formatDuree(duree)}</p>}
      </div>

      {erreur && (
        <div className="max-w-xs rounded-xl bg-red-500/20 px-4 py-2 text-center text-sm text-red-100">{erreur}</div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-6">
        {participants.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-2">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-xl font-bold">
              {p.name.slice(0, 1).toUpperCase()}
              {p.muted && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-flame-600">
                  <IconMicOff className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="max-w-[90px] truncate text-xs text-white/80">{p.local ? 'Vous' : p.name}</p>
          </div>
        ))}
        {participants.length === 0 && statut === 'connexion' && (
          <p className="text-sm text-white/50">Connexion à la salle d'appel…</p>
        )}
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={toggleMic}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95 ${micMuted ? 'bg-white text-ink-900' : 'bg-white/15 text-white'}`}
        >
          {micMuted ? <IconMicOff className="h-6 w-6" /> : <IconMic className="h-6 w-6" />}
        </button>
        <button
          onClick={raccrocher}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-flame-600 text-white shadow-lg transition active:scale-95"
        >
          <IconPhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}
