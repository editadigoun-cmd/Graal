import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

const ROLE_LABEL: Record<Role, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }

export default function ManagementEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', full_name: '', role: 'vm' as Role, secteur: 'A' as 'A' | 'B', equipe_id: '' })
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
      setForm({ email: '', full_name: '', role: 'vm', secteur: 'A', equipe_id: '' })
      load()
    } catch (err) {
      setCreationMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink-800 font-display">Équipes & visiteurs médicaux</h1>

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
                    <p className="text-[10px] text-ink-400 capitalize">{m.role}</p>
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
              {membres.length === 0 && <p className="text-xs text-ink-400">Aucun membre.</p>}
            </div>
          </Card>
        )
      })}

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Créer un compte utilisateur</p>
        <form onSubmit={creerCompte} className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <input
              required type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
            />
            <input
              required placeholder="Nom complet" value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
            />
            <select
              value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {form.role === 'vm' && (
              <>
                <select
                  value={form.secteur} onChange={(e) => setForm((f) => ({ ...f, secteur: e.target.value as 'A' | 'B' }))}
                  className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
                >
                  <option value="A">Secteur A</option>
                  <option value="B">Secteur B</option>
                </select>
                <select
                  required value={form.equipe_id} onChange={(e) => setForm((f) => ({ ...f, equipe_id: e.target.value }))}
                  className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
                >
                  <option value="">Équipe…</option>
                  {equipes.map((e2) => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                </select>
              </>
            )}
          </div>
          {creationMsg && (
            <p className={`text-xs rounded-xl px-3 py-2 ${creationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {creationMsg.text}
            </p>
          )}
          <Button type="submit" size="sm" loading={creating}>Envoyer l'invitation</Button>
          <p className="text-[11px] text-ink-400">
            Un email d'invitation est envoyé à l'adresse indiquée pour définir le mot de passe. Le profil (rôle, secteur, équipe) est créé automatiquement à l'acceptation.
          </p>
        </form>
      </Card>
    </div>
  )
}
