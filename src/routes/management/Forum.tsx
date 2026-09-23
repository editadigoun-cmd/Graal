import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChat, IconPlus, IconUsers } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

type Topic = {
  id: string
  nom: string | null
  created_at: string
  dernierMessage: string | null
  dernierAt: string | null
  nonLus: number
}

export default function ManagementForum() {
  const { session, profile } = useAuth()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data: parts, error: partError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', session.user.id)

    if (partError) {
      setError(partError.message)
      setLoading(false)
      return
    }

    const ids = (parts ?? []).map((p) => p.conversation_id)
    if (!ids.length) {
      setTopics([])
      setLoading(false)
      return
    }

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, nom, type, created_at')
      .in('id', ids)
      .eq('type', 'FORUM_MANAGER')
      .order('created_at', { ascending: false })

    if (convError) {
      setError(convError.message)
      setLoading(false)
      return
    }

    const forumIds = (conversations ?? []).map((c) => c.id)
    if (!forumIds.length) {
      setTopics([])
      setLoading(false)
      return
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, contenu, type, created_at')
      .in('conversation_id', forumIds)
      .order('created_at', { ascending: false })

    const messageIds = (messages ?? []).map((m) => m.id)
    const { data: lectures } = messageIds.length
      ? await supabase.from('message_lectures').select('message_id').eq('profile_id', session.user.id).in('message_id', messageIds)
      : { data: [] }

    const read = new Set((lectures ?? []).map((l) => l.message_id))

    setTopics((conversations ?? []).map((c) => {
      const list = (messages ?? []).filter((m) => m.conversation_id === c.id)
      const last = list[0]
      return {
        id: c.id,
        nom: c.nom,
        created_at: c.created_at,
        dernierMessage: last?.type === 'image' ? '📷 Photo' : last?.contenu ?? null,
        dernierAt: last?.created_at ?? c.created_at,
        nonLus: list.filter((m) => m.sender_id !== session.user.id && !read.has(m.id)).length
      }
    }))
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (!session) return
    const channel = supabase
      .channel('forum-manager-liste')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user.id])

  async function creerForum() {
    if (!session || profile?.role !== 'admin') return
    setCreating(true)
    setError(null)

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        nom: 'Forum Managers',
        type: 'FORUM_MANAGER',
        created_by: session.user.id
      })
      .select('id')
      .single()

    if (convError || !conv) {
      setError(convError?.message ?? 'Impossible de créer le forum.')
      setCreating(false)
      return
    }

    const { data: managers, error: managersError } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'superviseur'])

    if (managersError) {
      setError(managersError.message)
      setCreating(false)
      return
    }

    const participants = (managers ?? []).map((m) => ({ conversation_id: conv.id, profile_id: m.id }))
    if (participants.length) {
      const { error } = await supabase.from('conversation_participants').insert(participants)
      if (error) {
        setError(error.message)
        setCreating(false)
        return
      }
    }

    setCreating(false)
    await load()
  }

  const forum = topics[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-royal-600">Espace managers</p>
          <h1 className="mt-1 text-xl font-bold text-ink-800 font-display">Forum Managers</h1>
          <p className="mt-1 text-sm text-ink-400">Un espace commun de discussion réservé aux managers et administrateurs.</p>
        </div>
        {profile?.role === 'admin' && !forum && (
          <Button size="sm" loading={creating} icon={<IconPlus className="h-4 w-4" />} onClick={creerForum}>
            Créer le forum
          </Button>
        )}
      </div>

      {error && <Card className="border-red-100 bg-red-50"><p className="text-sm font-semibold text-red-600">{error}</p></Card>}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : forum ? (
        <Link to={`/admin/forum/${forum.id}`}>
          <Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-600">
              <IconUsers className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink-800">{forum.nom ?? 'Forum Managers'}</p>
              <p className="mt-1 text-xs text-ink-400">{forum.dernierMessage ?? 'Aucune discussion pour le moment'}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-ink-300">{dayjs(forum.dernierAt).format('DD/MM HH:mm')}</span>
              {forum.nonLus > 0 && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">{forum.nonLus > 99 ? '99+' : forum.nonLus}</span>}
            </div>
          </Card>
        </Link>
      ) : (
        <Card className="flex flex-col items-center py-14 text-center">
          <IconChat className="h-9 w-9 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-600">Le forum n'est pas encore créé</p>
          <p className="mt-1 max-w-sm text-xs text-ink-400">L'administrateur peut le créer. Il sera automatiquement accessible aux administrateurs et superviseurs.</p>
        </Card>
      )}
    </div>
  )
}
