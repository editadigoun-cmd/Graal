import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChat, IconUsers } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import dayjs from 'dayjs'

interface ConvSummary {
  id: string
  nom: string | null
  type: string
  dernierMessage: string | null
  dernierAt: string | null
  autreNom: string
}

function apercuMessage(type: string, contenu: string | null) {
  if (type === 'image') return '📷 Photo'
  if (type === 'audio') return '🎤 Message vocal'
  if (type === 'fichier') return `📎 ${contenu ?? 'Fichier'}`
  return contenu ?? ''
}

export default function Messages() {
  const { session, profile } = useAuth()
  const base = profile?.role === 'vm' ? '/app/messages' : '/admin/messages'
  const [convs, setConvs] = useState<ConvSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    async function load() {
      const { data: parts } = await supabase.from('conversation_participants').select('conversation_id').eq('profile_id', session!.user.id)
      const ids = (parts ?? []).map((p) => p.conversation_id)
      if (ids.length === 0) { setConvs([]); setLoading(false); return }

      const { data: conversations } = await supabase.from('conversations').select('*, conversation_participants(profile_id, profiles(full_name))').in('id', ids)
      const { data: lastMessages } = await supabase.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false })

      const result: ConvSummary[] = (conversations ?? []).map((c: any) => {
        const last = lastMessages?.find((m) => m.conversation_id === c.id)
        const autres = (c.conversation_participants ?? []).filter((p: any) => p.profile_id !== session!.user.id)
        const autreNom = c.nom || autres.map((p: any) => p.profiles?.full_name).join(', ') || 'Conversation'

        let dernierMessage: string | null = null
        if (last) {
          const apercu = apercuMessage(last.type, last.contenu)
          if (c.type !== 'DIRECT') {
            const expediteur = last.sender_id === session!.user.id
              ? 'Vous'
              : (c.conversation_participants ?? []).find((p: any) => p.profile_id === last.sender_id)?.profiles?.full_name ?? 'Quelqu\'un'
            dernierMessage = `${expediteur} : ${apercu}`
          } else {
            dernierMessage = apercu
          }
        }

        return { id: c.id, nom: c.nom, type: c.type, dernierMessage, dernierAt: last?.created_at ?? c.created_at, autreNom }
      })
      result.sort((a, b) => {
        const forumA = a.type !== 'DIRECT' ? 1 : 0
        const forumB = b.type !== 'DIRECT' ? 1 : 0
        if (forumA !== forumB) return forumB - forumA
        return dayjs(b.dernierAt).diff(dayjs(a.dernierAt))
      })
      setConvs(result)
      setLoading(false)
    }
    load()
  }, [session])

  return (
    <div className="space-y-4 mt-2 pb-4">
      <h1 className="text-lg font-bold text-ink-800 font-display">Messages</h1>

      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}

      {!loading && convs.length === 0 && (
        <Card className="flex flex-col items-center py-12 text-center">
          <IconChat className="h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-500">Aucune conversation</p>
        </Card>
      )}

      {convs.map((c) => (
        <Link key={c.id} to={`${base}/${c.id}`}>
          <Card className="flex items-center gap-4 py-4">
            {c.type !== 'DIRECT' ? (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-royal-100 text-royal-600">
                <IconUsers className="h-5 w-5" />
              </div>
            ) : (
              <Avatar name={c.autreNom} size={48} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-800 truncate">{c.autreNom}</p>
              <p className="mt-0.5 text-xs text-ink-400 truncate">{c.dernierMessage ?? 'Nouvelle conversation'}</p>
            </div>
            {c.dernierAt && <span className="text-[10px] text-ink-300 flex-shrink-0">{dayjs(c.dernierAt).format('HH:mm')}</span>}
          </Card>
        </Link>
      ))}
    </div>
  )
}
