import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconMapPin, IconUsers, IconSearch, IconX } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Zone = Database['public']['Tables']['zones']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Equipe = Database['public']['Tables']['equipes']['Row']

export default function ManagementZones() {
  const [zones, setZones] = useState<Zone[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [nouvelleZone, setNouvelleZone] = useState('')
  const [ajoutBusy, setAjoutBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const [{ data: zo }, { data: pr }, { data: eq }] = await Promise.all([
      supabase.from('zones').select('*').order('nom'),
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name'),
      supabase.from('equipes').select('*').order('nom')
    ])
    setZones(zo ?? [])
    setProfiles(pr ?? [])
    setEquipes(eq ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function ajouterZone(e: React.FormEvent) {
    e.preventDefault()
    const nom = nouvelleZone.trim()
    if (!nom) return
    setAjoutBusy(true)
    setNotice(null)
    const { error } = await supabase.from('zones').insert({ nom })
    setAjoutBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNouvelleZone('')
      setNotice({ type: 'success', text: `La zone « ${nom} » a été créée.` })
      load()
    }
  }

  async function changerZone(profileId: string, zoneId: string) {
    setRowBusy(profileId)
    setNotice(null)
    const { error } = await supabase.from('profiles').update({ zone_id: zoneId || null }).eq('id', profileId)
    setRowBusy(null)
    if (error) setNotice({ type: 'error', text: error.message })
    else load()
  }

  async function supprimerZone(zone: Zone) {
    const assigned = profiles.filter((p) => p.zone_id === zone.id).length
    if (assigned > 0) {
      setNotice({ type: 'error', text: `Impossible de supprimer « ${zone.nom} » : ${assigned} VM y sont encore affectés. Réaffectez-les d'abord.` })
      return
    }
    if (!window.confirm(`Supprimer la zone « ${zone.nom} » ?`)) return
    setRowBusy(zone.id)
    setNotice(null)
    const { error } = await supabase.from('zones').delete().eq('id', zone.id)
    setRowBusy(null)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNotice({ type: 'success', text: `La zone « ${zone.nom} » a été supprimée.` })
      load()
    }
  }

  const equipeNomById = useMemo(() => Object.fromEntries(equipes.map((e) => [e.id, e.nom])), [equipes])
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles.filter((p) => !q || p.full_name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
  }, [profiles, search])
  const affectes = profiles.filter((p) => p.zone_id).length
  const sansZone = profiles.length - affectes

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Zones</h1>
          <p className="text-sm text-ink-400">Créez les zones et affectez les visiteurs médicaux depuis un espace dédié.</p>
        </div>
        <form onSubmit={ajouterZone} className="flex items-center gap-2">
          <input
            value={nouvelleZone}
            onChange={(e) => setNouvelleZone(e.target.value)}
            placeholder="Nom de la zone"
            className="w-full sm:w-52 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
          />
          <Button type="submit" size="sm" loading={ajoutBusy} icon={<IconPlus className="h-4 w-4" />}>Ajouter</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Zones" value={zones.length} tone="royal" icon={<IconMapPin className="h-4 w-4" />} />
        <StatCard label="VM affectés" value={affectes} tone="emerald" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Sans zone" value={sansZone} tone="flame" icon={<IconMapPin className="h-4 w-4" />} />
      </div>

      {notice && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {notice.text}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {zones.map((zone) => {
          const membres = profiles.filter((p) => p.zone_id === zone.id)
          return (
            <Card key={zone.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-600">
                    <IconMapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-ink-800 truncate">{zone.nom}</p>
                    <p className="text-xs text-ink-400">{membres.length} visiteur{membres.length > 1 ? 's' : ''} médical{membres.length > 1 ? 'aux' : ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => supprimerZone(zone)}
                  disabled={rowBusy === zone.id}
                  title="Supprimer la zone"
                  className="rounded-full p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {membres.length === 0 ? (
                  <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-400">Aucun VM affecté à cette zone.</p>
                ) : membres.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-800 truncate">{p.full_name}</p>
                      <p className="text-[10px] text-ink-400 truncate">{p.equipe_id ? equipeNomById[p.equipe_id] ?? 'Sans équipe' : 'Sans équipe'}</p>
                    </div>
                    <Badge tone={p.actif ? 'success' : 'neutral'}>{p.actif ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <p className="text-sm font-bold text-ink-800">Affectation des VM</p>
            <p className="text-xs text-ink-400">La zone d'un VM se modifie uniquement ici.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un VM…"
              className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
            />
          </div>
        </div>

        <div className="space-y-2">
          {filteredProfiles.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-ink-100 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-800 truncate">{p.full_name}</p>
                <p className="text-[11px] text-ink-400 truncate">{p.equipe_id ? equipeNomById[p.equipe_id] ?? 'Sans équipe' : 'Sans équipe'} · {p.email}</p>
              </div>
              <select
                value={p.zone_id ?? ''}
                onChange={(e) => changerZone(p.id, e.target.value)}
                disabled={rowBusy === p.id}
                className="w-full sm:w-56 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100 disabled:opacity-50"
              >
                <option value="">Sans zone</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
              </select>
            </div>
          ))}
          {filteredProfiles.length === 0 && <p className="py-6 text-center text-xs text-ink-400">Aucun VM ne correspond à la recherche.</p>}
        </div>
      </Card>
    </div>
  )
}
