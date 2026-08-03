import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconCheckCircle, IconSearch } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

const ROLE_LABEL: Record<Role, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }
const ROLE_TONE: Record<Role, 'info' | 'success' | 'warning'> = { vm: 'info', superviseur: 'success', admin: 'warning' }
const EMPTY_FORM = { email: '', full_name: '', role: 'vm' as Role, secteur: 'A' as 'A' | 'B', equipe_id: '' }

export default function ManagementEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [creationMsg, setCreationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [search, setSearch] = useState('')
  const [equipeFilter, setEquipeFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')

  async function load() {
    const [{ data: eq }, { data: pr }] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('profiles').select('*').order('full_name')
    ])
    setEquipes(eq ?? [])
    setProfiles(pr ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function changerEquipe(profileId: string, equipeId: string) {
    await supabase.from('profiles').update({ equipe_id: equipeId || null }).eq('id', profileId)
    load()
  }

  async function changerSecteur(profileId: string, secteur: string) {
    await supabase.from('profiles').update({ secteur: (secteur || null) as 'A' | 'B' | null }).eq('id', profileId)
    load()
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
          equipe_id: form.role === 'vm' ? form.equipe_id || null : null
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles.filter((p) => {
      if (equipeFilter === '__none__' && p.equipe_id) return false
      if (equipeFilter && equipeFilter !== '__none__' && p.equipe_id !== equipeFilter) return false
      if (roleFilter && p.role !== roleFilter) return false
      if (q && !p.full_name.toLowerCase().includes(q) && !(p.email ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [profiles, search, equipeFilter, roleFilter])

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const totalVm = profiles.filter((p) => p.role === 'vm').length
  const totalSuperviseurs = profiles.filter((p) => p.role === 'superviseur').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Équipes & visiteurs médicaux</h1>
          <p className="text-sm text-ink-400">Gestion des comptes, secteurs et rattachements d'équipe</p>
        </div>
        <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
          Ajouter un membre
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Équipes" value={equipes.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Visiteurs médicaux" value={totalVm} tone="emerald" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Superviseurs" value={totalSuperviseurs} tone="flame" icon={<IconCheckCircle className="h-4 w-4" />} />
      </div>

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
          <option value="">Toutes les équipes</option>
          <option value="__none__">Sans équipe</option>
          {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <select
          value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        >
          <option value="">Tous les rôles</option>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="px-4 py-3 text-left font-semibold">Utilisateur</th>
                <th className="px-4 py-3 text-left font-semibold">Rôle</th>
                <th className="px-4 py-3 text-left font-semibold">Équipe</th>
                <th className="px-4 py-3 text-left font-semibold">Secteur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((p) => (
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
                      <select
                        value={p.equipe_id ?? ''} onChange={(e) => changerEquipe(p.id, e.target.value)}
                        className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Sans équipe</option>
                        {equipes.map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-ink-400">{p.equipe_id ? equipeNomById[p.equipe_id] : '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.role === 'vm' ? (
                      <select
                        value={p.secteur ?? ''} onChange={(e) => changerSecteur(p.id, e.target.value)}
                        className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="A">Secteur A</option>
                        <option value="B">Secteur B</option>
                      </select>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-ink-400">Aucun utilisateur ne correspond à ces filtres.</td></tr>
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
