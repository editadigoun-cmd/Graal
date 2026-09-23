import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChat, IconUsers } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Message = Database['public']['Tables']['messages']['Row']

interface ConvSummary {
  id: string
  nom: string | null
  type: string
  dernierMessage: string | null
  dernierAt: string | null
  autreNom: string
  nonLus: number
  noms: Record<string, string>
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

  function trier(liste: ConvSummary[]): ConvSummary[] {
    return [...liste].sort((a, b) => {
      const forumA = a.type !== 'DIRECT' ? 1 : 0
      const forumB = b.type !== 'DIRECT' ? 1 : 0
      if (forumA !== forumB) return forumB - forumA
      return dayjs(b.dernierAt).diff(dayjs(a.dernierAt))
    })
  }

  useEffect(() => {
    if (!session) return
    async function load() {
      const { data: parts } = await supabase.from('conversation_participants').select('conversation_id').eq('profile_id', session!.user.id)
      let ids = (parts ?? []).map((p) => p.conversation_id)

      // Discussion interne réservée aux managers (superviseurs) et à l'administration.
      // Elle n'est pas un élément du menu : elle apparaît directement dans Messages.
      if (profile?.role === 'admin' || profile?.role === 'superviseur') {
        const { data: forum } = await supabase.from('conversations').select('id').eq('type', 'FORUM_MANAGER').maybeSingle()
        if (forum) {
          const { data: membership } = await supabase.from('conversation_participants').select('conversation_id').eq('conversation_id', forum.id).eq('profile_id', session!.user.id).maybeSingle()
          if (!membership) await supabase.from('conversation_participants').insert({ conversation_id: forum.id, profile_id: session!.user.id })
          ids = ids.includes(forum.id) ? ids : [...ids, forum.id]
        } else if (profile?.role === 'admin') {
          const { data: created } = await supabase.from('conversations').insert({
            nom: 'Managers & Administration',
            type: 'FORUM_MANAGER',
            created_by: session!.user.id,
          }).select('id').single()
          if (created) {
            const { data: managers } = await supabase.from('profiles').select('id').in('role', ['admin', 'superviseur'])
            if (managers?.length) await supabase.from('conversation_participants').insert(managers.map((m) => ({ conversation_id: created.id, profile_id: m.id })))
            ids = [...ids, created.id]
          }
        }
      }

      if (ids.length === 0) { setConvs([]); setLoading(false); return }

      const { data: conversations } = await supabase.from('conversations').select('*, conversation_participants(profile_id, profiles(full_name))').in('id', ids)
      const { data: allMessages } = await supabase.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false })
      const messageIds = (allMessages ?? []).map((m) => m.id)
      const { data: lectures } = messageIds.length
        ? await supabase.from('message_lectures').select('message_id').eq('profile_id', session!.user.id).in('message_id', messageIds)
        : { data: [] }
      const luSet = new Set((lectures ?? []).map((l) => l.message_id))

      const result: ConvSummary[] = (conversations ?? []).map((c: any) => {
        const messagesConv = (allMessages ?? []).filter((m) => m.conversation_id === c.id)
        const last = messagesConv[0]
        const autres = (c.conversation_participants ?? []).filter((p: any) => p.profile_id !== session!.user.id)
        const autreNom = c.type === 'FORUM_MANAGER' ? 'Managers & Administration' : (c.nom || autres.map((p: any) => p.profiles?.full_name).join(', ') || 'Conversation')
        const noms: Record<string, string> = Object.fromEntries(
          (c.conversation_participants ?? []).map((p: any) => [p.profile_id, p.profiles?.full_name ?? 'Utilisateur'])
        )
        const nonLus = messagesConv.filter((m) => m.sender_id !== session!.user.id && !luSet.has(m.id)).length

        let dernierMessage: string | null = null
        if (last) {
          const apercu = apercuMessage(last.type, last.contenu)
          if (c.type !== 'DIRECT') {
            const expediteur = last.sender_id === session!.user.id ? 'Vous' : (noms[last.sender_id] ?? 'Quelqu\'un')
            dernierMessage = `${expediteur} : ${apercu}`
          } else {
            dernierMessage = apercu
          }
        }

        return { id: c.id, nom: c.nom, type: c.type, dernierMessage, dernierAt: last?.created_at ?? c.created_at, autreNom, nonLus, noms }
      })
      setConvs(trier(result))
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('messages-liste-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        setConvs((prev) => {
          if (!prev.some((c) => c.id === m.conversation_id)) return prev
          const next = prev.map((c) => {
            if (c.id !== m.conversation_id) return c
            const apercu = apercuMessage(m.type, m.contenu)
            const expediteur = m.sender_id === session!.user.id ? 'Vous' : (c.noms[m.sender_id] ?? 'Quelqu\'un')
            const dernierMessage = c.type !== 'DIRECT' ? `${expediteur} : ${apercu}` : apercu
            return {
              ...c,
              dernierMessage,
              dernierAt: m.created_at,
              nonLus: m.sender_id !== session!.user.id ? c.nonLus + 1 : c.nonLus
            }
          })
          return trier(next)
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session])

  return (
    <div className="space-y-6 mt-2 pb-4">
      <h1 className="text-lg font-bold text-ink-800 font-display">Messages</h1>

      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}

      {!loading && convs.length === 0 && (
        <Card className="flex flex-col items-center py-12 text-center">
          <IconChat className="h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-500">Aucune conversation</p>
        </Card>
      )}

      {convs.map((c) => (
        <Link key={c.id} to={`${base}/${c.id}`}>
          <Card className="flex items-center gap-4 py-5">
            {c.type !== 'DIRECT' ? (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-royal-100 text-royal-600">
                <IconUsers className="h-5 w-5" />
              </div>
            ) : (
              <Avatar name={c.autreNom} size={48} />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm truncate ${c.nonLus > 0 ? 'font-bold text-ink-900' : 'font-semibold text-ink-800'}`}>{c.autreNom}</p>
              <p className={`mt-0.5 text-xs truncate ${c.nonLus > 0 ? 'font-semibold text-ink-700' : 'text-ink-400'}`}>{c.dernierMessage ?? 'Nouvelle conversation'}</p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              {c.dernierAt && <span className={`text-[10px] ${c.nonLus > 0 ? 'font-bold text-emerald-600' : 'text-ink-300'}`}>{dayjs(c.dernierAt).format('HH:mm')}</span>}
              {c.nonLus > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                  {c.nonLus > 99 ? '99+' : c.nonLus}
                </span>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
