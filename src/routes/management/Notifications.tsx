import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconBell, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

type NotificationRow = {
  id: string
  type: string
  titre: string
  corps: string | null
  lue: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export default function ManagementNotifications() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const { data: me } = await supabase.from('profiles').select('role').eq('id', profile.id).maybeSingle()
    const { data, error } = await supabase
      .from('notifications')
      .select('id,type,titre,corps,lue,metadata,created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setError(error.message)
    else if (me?.role === 'superviseur') {
      const { data: teamIds, error: teamError } = await supabase.rpc('supervised_equipe_ids')
      if (teamError || !teamIds?.length) setRows([])
      else {
        const { data: members } = await supabase.from('profiles').select('id').eq('role', 'vm').in('equipe_id', teamIds)
        const memberIds = new Set((members ?? []).map(member => member.id))
        const allowed = (data ?? []).filter((row: NotificationRow) => {
          if (row.type === 'ANNIVERSAIRE_J2') return false
          const meta = row.metadata ?? {}
          const equipeId = String(meta.equipe_id ?? meta.team_id ?? '')
          const memberId = String(meta.vm_id ?? meta.profile_id ?? meta.collaborateur_id ?? meta.actor_id ?? '')
          return teamIds.includes(equipeId) || memberIds.has(memberId)
        })
        setRows(allowed as NotificationRow[])
      }
      setError('')
    } else { setRows((data ?? []) as NotificationRow[]); setError('') }
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { void load() }, [load])

  async function markRead(id: string) {
    setBusy(true)
    const { error } = await supabase.from('notifications').update({ lue: true }).eq('id', id)
    if (error) setError(error.message)
    else setRows(current => current.map(row => row.id === id ? { ...row, lue: true } : row))
    setBusy(false)
  }

  async function markAllRead() {
    const unread = rows.filter(row => !row.lue)
    if (!unread.length) return
    setBusy(true)
    const { error } = await supabase.from('notifications').update({ lue: true }).eq('lue', false)
    if (error) setError(error.message)
    else setRows(current => current.map(row => ({ ...row, lue: true })))
    setBusy(false)
  }

  const unread = rows.filter(row => !row.lue).length

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Notifications</h1>
        <p className="text-sm text-ink-400">Alertes et rappels destinés à votre compte.</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={unread ? 'info' : 'success'}>{unread} non lue{unread > 1 ? 's' : ''}</Badge>
        <Button size="sm" variant="secondary" onClick={markAllRead} disabled={!unread || busy}>Tout marquer comme lu</Button>
      </div>
    </div>
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {loading ? <Card><p className="text-sm text-ink-400">Chargement des notifications…</p></Card>
      : rows.length === 0 ? <Card className="flex flex-col items-center py-12 text-center"><IconBell className="h-8 w-8 text-ink-300"/><p className="mt-3 text-sm font-semibold text-ink-600">Aucune notification</p><p className="mt-1 text-xs text-ink-400">Les alertes importantes apparaîtront ici.</p></Card>
      : <div className="space-y-3">{rows.map(row => {
        const birthday = row.type === 'ANNIVERSAIRE_J2'
        return <Card key={row.id} className={!row.lue ? 'border border-royal-200' : ''}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-700"><IconBell className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-ink-800">{row.titre}</p>{!row.lue && <Badge tone="info">Nouvelle</Badge>}</div>
              {row.corps && <p className="mt-1 text-sm leading-relaxed text-ink-600">{row.corps}</p>}
              <p className="mt-2 text-[11px] text-ink-400">{new Date(row.created_at).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {birthday && <Link to="/admin/anniversaires" className="inline-flex items-center gap-1.5 rounded-xl bg-royal-600 px-3 py-2 text-xs font-semibold text-white"><IconGift className="h-3.5 w-3.5"/> Ouvrir les anniversaires</Link>}
                {!row.lue && <Button size="sm" variant="secondary" onClick={() => markRead(row.id)} disabled={busy}><IconCheckCircle className="h-4 w-4"/> Marquer comme lue</Button>}
              </div>
            </div>
          </div>
        </Card>
      })}</div>}
  </div>
}
