import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconCheckCircle, IconSearch, IconSend, IconLock, IconX, IconMapPin } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Zone = Database['public']['Tables']['zones']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']
type SuperviseurEquipe = Database['public']['Tables']['superviseur_equipes']['Row']

const ROLE_LABEL: Record<Role, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }
const ROLE_TONE: Record<Role, 'info' | 'success' | 'warning'> = { vm: 'info', superviseur: 'success', admin: 'warning' }
const EMPTY_FORM = { email: '', full_name: '', role: 'vm' as Role, secteur: 'A' as 'A' | 'B', equipe_id: '', zone_id: '' }

export default function ManagementEquipes() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [superviseurEquipes, setSuperviseurEquipes] = useState<SuperviseurEquipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [creationMsg, setCreationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [nouvelleZone, setNouvelleZone] = useState('')
  const [ajoutZoneBusy, setAjoutZoneBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [equipeFilter, setEquipeFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')

  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const [{ data: eq }, { data: zo }, { data: pr }, { data: se }] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('zones').select('*').order('nom'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('superviseur_equipes').select('*')
    ])
    setEquipes(eq ?? [])
    setZones(zo ?? [])
    setProfiles(pr ?? [])
    setSuperviseurEquipes(se ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function ajouterZone(e: React.FormEvent) {
    e.preventDefault()
    const nom = nouvelleZone.trim()
    if (!nom) return
    setAjoutZoneBusy(true)
    const { error } = await supabase.from('zones').insert({ nom })
    setAjoutZoneBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else { setNouvelleZone(''); load() }
  }

  async function changerZone(profileId: string, zoneId: string) {
    const { error } = await supabase.from('profiles').update({ zone_id: zoneId || null }).eq('id', profileId)
    if (error) setNotice({ type: 'error', text: error.message })
    load()
  }

  async function assignerEquipe(superviseurId: string, equipeId: string) {
    if (!equipeId) return
    const { error } = await supabase.from('superviseur_equipes').insert({ superviseur_id: superviseurId, equipe_id: equipeId })
    if (error) setNotice({ type: 'error', text: error.message })
    load()
  }

  async function retirerEquipe(superviseurId: string, equipeId: string) {
    const { error } = await supabase.from('superviseur_equipes').delete().eq('superviseur_id', superviseurId).eq('equipe_id', equipeId)
    if (error) setNotice({ type: 'error', text: error.message })
    load()
  }

  async function changerEquipe(profileId: string, equipeId: string) {
    const { error } = await supabase.from('profiles').update({ equipe_id: equipeId || null }).eq('id', profileId)
    if (error) setNotice({ type: 'error', text: error.message })
    load()
  }

  async function changerSecteur(profileId: string, secteur: string) {
    const { error } = await supabase.from('profiles').update({ secteur: (secteur || null) as 'A' | 'B' | null }).eq('id', profileId)
    if (error) setNotice({ type: 'error', text: error.message })
    load()
  }

  async function toggleActif(p: Profile) {
    setRowBusy(p.id)
    setNotice(null)
    const { error } = await supabase.from('profiles').update({ actif: !p.actif }).eq('id', p.id)
    setRowBusy(null)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNotice({ type: 'success', text: p.actif ? `${p.full_name} a été désactivé(e).` : `${p.full_name} a été réactivé(e).` })
      load()
    }
  }

  async function supprimerDefinitivement(p: Profile) {
    const confirme = window.confirm(
      `Supprimer définitivement le compte de ${p.full_name} ?\n\nCela efface aussi tout son historique (visites, programmes, clôtures, reporting). Cette action est irréversible.\n\nSi ce compte a de l'activité, la suppression sera refusée — utilisez plutôt "Désactiver".`
    )
    if (!confirme) return
    setRowBusy(p.id)
    setNotice(null)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: p.id })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setNotice({ type: 'success', text: `${p.full_name} a été supprimé(e) définitivement.` })
      load()
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setRowBusy(null)
    }
  }

  async function renvoyerInvitation(p: Profile) {
    if (!p.email) return
    setRowBusy(p.id)
    setNotice(null)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: p.email, resend: true })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setNotice({ type: 'success', text: `Invitation renvoyée à ${p.email}.` })
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setRowBusy(null)
    }
  }

  function fermerModal() {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setCreationMsg(null)
  }

  async function creerCompte(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreationMsg(null)
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: form.email, full_name: form.full_name, role: form.role,
          secteur: form.role === 'vm' ? form.secteur : null,
          equipe_id: form.role === 'vm' ? form.equipe_id || null : null,
          zone_id: form.role === 'vm' ? form.zone_id || null : null
        })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setCreationMsg({ type: 'success', text: `Invitation envoyée à ${body.email}.` })
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      setCreationMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setCreating(false)
    }
  }

  const equipeNomById = useMemo(() => Object.fromEntries(equipes.map((e) => [e.id, e.nom])), [equipes])
  const zoneNomById = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.nom])), [zones])

  // Un superviseur ne voit que les VM de ses propres équipes : ni les autres équipes,
  // ni les autres superviseurs/admins, ni la gestion des comptes (réservée à l'admin).
  const mesEquipeIds = useMemo(
    () => (profile ? superviseurEquipes.filter((se) => se.superviseur_id === profile.id).map((se) => se.equipe_id) : []),
    [superviseurEquipes, profile]
  )
  const equipesVisibles = isAdmin ? equipes : equipes.filter((e) => mesEquipeIds.includes(e.id))
  const profilesVisibles = isAdmin ? profiles : profiles.filter((p) => p.role === 'vm' && p.equipe_id && mesEquipeIds.includes(p.equipe_id))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profilesVisibles.filter((p) => {
      if (equipeFilter === '__none__' && p.equipe_id) return false
      if (equipeFilter && equipeFilter !== '__none__' && p.equipe_id !== equipeFilter) return false
      if (roleFilter && p.role !== roleFilter) return false
      if (q && !p.full_name.toLowerCase().includes(q) && !(p.email ?? '').toLowerCase().includes(q)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesVisibles, search, equipeFilter, roleFilter])

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const totalVm = profilesVisibles.filter((p) => p.role === 'vm').length
  const totalSuperviseurs = profilesVisibles.filter((p) => p.role === 'superviseur').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Équipes & visiteurs médicaux</h1>
          <p className="text-sm text-ink-400">{isAdmin ? "Gestion des comptes, secteurs et rattachements d'équipe" : 'Les visiteurs médicaux de vos équipes'}</p>
        </div>
        {isAdmin && (
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Ajouter un membre
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Équipes" value={equipesVisibles.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Visiteurs médicaux" value={totalVm} tone="emerald" icon={<IconUsers className="h-4 w-4" />} />
        {isAdmin && <StatCard label="Superviseurs" value={totalSuperviseurs} tone="flame" icon={<IconCheckCircle className="h-4 w-4" />} />}
      </div>

      {isAdmin && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconMapPin className="h-4 w-4 text-ink-400" />
            <p className="text-sm font-bold text-ink-800">Zones</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {zones.length === 0 && <p className="text-xs text-ink-400">Aucune zone pour l'instant.</p>}
            {zones.map((z) => (
              <span key={z.id} className="inline-flex items-center rounded-full bg-royal-50 px-3 py-1 text-xs font-semibold text-royal-700">
                {z.nom}
              </span>
            ))}
          </div>
          <form onSubmit={ajouterZone} className="flex items-center gap-2">
            <input
              value={nouvelleZone} onChange={(e) => setNouvelleZone(e.target.value)}
              placeholder="Ex : Atlantique 3"
              className="flex-1 max-w-xs rounded-xl border border-ink-200 px-3.5 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
            />
            <Button type="submit" size="sm" variant="secondary" loading={ajoutZoneBusy} icon={<IconPlus className="h-3.5 w-3.5" />}>
              Ajouter une zone
            </Button>
          </form>
        </Card>
      )}

      <Card className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un email…"
            className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
          />
        </div>
        <select
          value={equipeFilter} onChange={(e) => setEquipeFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        >
          <option value="">{isAdmin ? 'Toutes les équipes' : 'Mes équipes'}</option>
          {isAdmin && <option value="__none__">Sans équipe</option>}
          {equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        {isAdmin && (
          <select
            value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')}
            className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
          >
            <option value="">Tous les rôles</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        )}
      </Card>

      {notice && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {notice.text}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="px-4 py-3 text-left font-semibold">Utilisateur</th>
                <th className="px-4 py-3 text-left font-semibold">Rôle</th>
                <th className="px-4 py-3 text-left font-semibold">Équipe</th>
                <th className="px-4 py-3 text-left font-semibold">Zone</th>
                <th className="px-4 py-3 text-left font-semibold">Secteur</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((p) => {
                const isSelf = p.id === session?.user.id
                const busy = rowBusy === p.id
                return (
                  <tr key={p.id} className="transition hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.full_name} url={p.avatar_url} size={32} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink-800 truncate">{p.full_name}</p>
                          <p className="text-[11px] text-ink-400 truncate">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ROLE_TONE[p.role]}>{ROLE_LABEL[p.role]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {p.role === 'vm' ? (
                        isAdmin ? (
                          <select
                            value={p.equipe_id ?? ''} onChange={(e) => changerEquipe(p.id, e.target.value)}
                            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Sans équipe</option>
                            {equipes.map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-ink-600">{p.equipe_id ? equipeNomById[p.equipe_id] ?? '—' : '—'}</span>
                        )
                      ) : p.role === 'superviseur' ? (
                        isAdmin ? (
                          <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                            {superviseurEquipes.filter((se) => se.superviseur_id === p.id).map((se) => (
                              <button
                                key={se.equipe_id}
                                onClick={() => retirerEquipe(p.id, se.equipe_id)}
                                title="Retirer cette équipe"
                                className="inline-flex items-center gap-1 rounded-full bg-royal-50 px-2 py-0.5 text-[10px] font-semibold text-royal-700 hover:bg-red-50 hover:text-red-600 transition"
                              >
                                {equipeNomById[se.equipe_id]} <IconX className="h-2.5 w-2.5" />
                              </button>
                            ))}
                            <select
                              value="" onChange={(e) => assignerEquipe(p.id, e.target.value)}
                              className="rounded-lg border border-ink-200 bg-white px-1.5 py-0.5 text-[10px]"
                            >
                              <option value="">+ ajouter…</option>
                              {equipes
                                .filter((e2) => !superviseurEquipes.some((se) => se.superviseur_id === p.id && se.equipe_id === e2.id))
                                .map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                            {superviseurEquipes.filter((se) => se.superviseur_id === p.id).map((se) => (
                              <span key={se.equipe_id} className="inline-flex items-center rounded-full bg-royal-50 px-2 py-0.5 text-[10px] font-semibold text-royal-700">
                                {equipeNomById[se.equipe_id]}
                              </span>
                            ))}
                            {superviseurEquipes.filter((se) => se.superviseur_id === p.id).length === 0 && <span className="text-xs text-ink-400">—</span>}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.role === 'vm' ? (
                        isAdmin ? (
                          <select
                            value={p.zone_id ?? ''} onChange={(e) => changerZone(p.id, e.target.value)}
                            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Sans zone</option>
                            {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-ink-600">{p.zone_id ? zoneNomById[p.zone_id] ?? '—' : '—'}</span>
                        )
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.role === 'vm' ? (
                        isAdmin ? (
                          <select
                            value={p.secteur ?? ''} onChange={(e) => changerSecteur(p.id, e.target.value)}
                            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="A">Secteur A</option>
                            <option value="B">Secteur B</option>
                          </select>
                        ) : (
                          <span className="text-xs text-ink-600">{p.secteur ? `Secteur ${p.secteur}` : '—'}</span>
                        )
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.actif ? 'success' : 'neutral'}>{p.actif ? 'Actif' : 'Inactif'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => renvoyerInvitation(p)} disabled={busy}
                            title="Renvoyer l'invitation"
                            className="rounded-full p-2 bg-royal-50 text-royal-600 hover:bg-royal-100 transition disabled:opacity-50"
                          >
                            <IconSend className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => toggleActif(p)} disabled={busy || isSelf}
                            title={isSelf ? 'Vous ne pouvez pas désactiver votre propre compte' : p.actif ? 'Désactiver le compte' : 'Réactiver le compte'}
                            className={`rounded-full p-2 transition disabled:opacity-40 ${p.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                          >
                            {p.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => supprimerDefinitivement(p)} disabled={busy || isSelf}
                            title={isSelf ? 'Vous ne pouvez pas supprimer votre propre compte' : 'Supprimer définitivement'}
                            className="rounded-full p-2 bg-ink-100 text-ink-500 hover:bg-red-100 hover:text-red-600 transition disabled:opacity-40"
                          >
                            <IconX className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-[10px] text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-ink-400">Aucun utilisateur ne correspond à ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={fermerModal} title="Ajouter un membre" description="Une invitation par email sera envoyée pour définir le mot de passe.">
        <form onSubmit={creerCompte} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Email</label>
              <input
                required type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Nom complet</label>
              <input
                required value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            <div className={form.role === 'vm' ? '' : 'sm:col-span-2'}>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Rôle</label>
              <select
                value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {form.role === 'vm' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Secteur</label>
                <select
                  value={form.secteur} onChange={(e) => setForm((f) => ({ ...f, secteur: e.target.value as 'A' | 'B' }))}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  <option value="A">Secteur A</option>
                  <option value="B">Secteur B</option>
                </select>
              </div>
            )}
            {form.role === 'vm' && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
                <select
                  required value={form.equipe_id} onChange={(e) => setForm((f) => ({ ...f, equipe_id: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  <option value="">Sélectionner une équipe…</option>
                  {equipes.map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                </select>
              </div>
            )}
            {form.role === 'vm' && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Zone</label>
                <select
                  required value={form.zone_id} onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  <option value="">Sélectionner une zone…</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
                </select>
              </div>
            )}
          </div>

          {creationMsg && (
            <p className={`text-xs rounded-xl px-3 py-2.5 ${creationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {creationMsg.text}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={creating}>Envoyer l'invitation</Button>
            <Button type="button" variant="ghost" onClick={fermerModal}>Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
