import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export default function ManagementEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

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
        <p className="text-sm font-bold text-ink-800 mb-1">Créer un compte utilisateur</p>
        <p className="text-xs text-ink-400">
          La création de comptes (VM, superviseur, admin) se fait depuis le tableau de bord Supabase
          (Authentication → Add user), avec les métadonnées <code>role</code>, <code>secteur</code> et <code>equipe_id</code>.
          Le profil et les permissions sont ensuite créés automatiquement.
        </p>
      </Card>
    </div>
  )
}
