import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

const ROLE_LABEL: Record<Role, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }
const EMPTY_FORM = { email: '', full_name: '', role: 'vm' as Role, secteur: 'A' as 'A' | 'B', equipe_id: '' }

export default function ManagementEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [creationMsg, setCreationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

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

      <div className="grid lg:grid-cols-2 gap-4">
        {equipes.map((eq) => {
          const membres = profiles.filter((p) => p.equipe_id === eq.id)
          return (
            <Card key={eq.id}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-ink-800">{eq.nom}</p>
                <Badge tone="info">{membres.length} membre{membres.length > 1 ? 's' : ''}</Badge>
              </div>
              <div className="space-y-2">
                {membres.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl bg-ink-50 p-2.5">
                    <Avatar name={m.full_name} url={m.avatar_url} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink-800 truncate">{m.full_name}</p>
                      <p className="text-[10px] text-ink-400 capitalize">{ROLE_LABEL[m.role]}</p>
                    </div>
                    {m.role === 'vm' && (
                      <select value={m.secteur ?? ''} onChange={(e) => changerSecteur(m.id, e.target.value)} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs">
                        <option value="A">Secteur A</option>
                        <option value="B">Secteur B</option>
                      </select>
                    )}
                    <select value={m.equipe_id ?? ''} onChange={(e) => changerEquipe(m.id, e.target.value)} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs">
                      <option value="">Sans équipe</option>
                      {equipes.map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                    </select>
                  </div>
                ))}
                {membres.length === 0 && <p className="text-xs text-ink-400 py-2">Aucun membre pour l'instant.</p>}
              </div>
            </Card>
          )
        })}
      </div>

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
