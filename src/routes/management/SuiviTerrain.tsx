import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconMapPin, IconCheckCircle, IconClock, IconAlert } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Ligne = Database['public']['Views']['v_lignes_avec_statut']['Row']
type Visite = Database['public']['Tables']['visites']['Row'] & {
  clients: { nom: string; potentiel: string; specialite: string; centre: string | null; secteur: string } | null
  visite_produits: { produits: { nom: string } | null }[]
}
type Manquant = { programme_ligne_id: string; commentaire: string | null; motifs_non_visite: { libelle: string } | null }

const STATUT_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  REALISEE: 'success',
  NON_FAITE: 'warning',
  EN_ATTENTE: 'neutral'
}
const STATUT_LABEL: Record<string, string> = {
  REALISEE: 'Réalisée',
  NON_FAITE: 'Non faite',
  EN_ATTENTE: 'En attente'
}

export default function SuiviTerrain() {
  const { profile } = useAuth()
  const [vms, setVms] = useState<{ id: string; full_name: string; equipe_id: string | null }[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [vmId, setVmId] = useState('')
  const [date, setDate] = useState(todayBenin().format('YYYY-MM-DD'))
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [visites, setVisites] = useState<Visite[]>([])
  const [manquants, setManquants] = useState<Manquant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingJour, setLoadingJour] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    async function init() {
      const [{ data: vmList }, se] = await Promise.all([
        supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm').order('full_name'),
        profile?.role === 'superviseur'
          ? supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
          : Promise.resolve({ data: [] as { equipe_id: string }[] })
      ])
      setVms(vmList ?? [])
      setSupervisedIds((se.data ?? []).map((s) => s.equipe_id))
      setLoading(false)
    }
    init()
  }, [profile?.id, profile?.role])

  const vmsVisibles = useMemo(
    () => isAdmin ? vms : vms.filter((v) => v.equipe_id && supervisedIds.includes(v.equipe_id)),
    [vms, isAdmin, supervisedIds]
  )

  useEffect(() => {
    if (!vmId && vmsVisibles.length > 0) setVmId(vmsVisibles[0].id)
  }, [vmsVisibles, vmId])

  useEffect(() => {
    if (!vmId) return
    async function loadJour() {
      setLoadingJour(true)
      const [{ data: lignesData }, { data: visitesData }] = await Promise.all([
        supabase.from('v_lignes_avec_statut').select('*').eq('vm_id', vmId).eq('date_visite', date).order('type_visite'),
        supabase.from('visites').select('*, clients(nom, potentiel, specialite, centre, secteur), visite_produits(produits(nom))')
          .eq('vm_id', vmId).eq('jour', date)
      ])
      setLignes(lignesData ?? [])
      setVisites((visitesData as unknown as Visite[]) ?? [])

      const ligneIds = (lignesData ?? []).map((l) => l.programme_ligne_id).filter((id): id is string => !!id)
      if (ligneIds.length > 0) {
        const { data: manquantsData } = await supabase
          .from('visite_manquante_motifs')
          .select('programme_ligne_id, commentaire, motifs_non_visite(libelle)')
          .in('programme_ligne_id', ligneIds)
        setManquants((manquantsData as unknown as Manquant[]) ?? [])
      } else {
        setManquants([])
      }
      setLoadingJour(false)
    }
    loadJour()
  }, [vmId, date])

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const visiteParId = Object.fromEntries(visites.map((v) => [v.id, v]))
  const manquantParLigne = Object.fromEntries(manquants.map((m) => [m.programme_ligne_id, m]))
  const horsProgramme = visites.filter((v) => v.hors_programme)

  const total = lignes.length
  const realisees = lignes.filter((l) => l.statut_reel === 'REALISEE').length
  const nonFaites = lignes.filter((l) => l.statut_reel === 'NON_FAITE').length

  function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  function DetailVisite({ v }: { v: Visite }) {
    const produits = v.visite_produits.map((p) => p.produits?.nom).filter(Boolean)
    return (
      <div className="mt-2 space-y-1.5 rounded-xl bg-ink-50 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-500">
          <span className="flex items-center gap-1"><IconClock className="h-3 w-3" /> {dayjs(v.horodatage).format('HH:mm')}</span>
          <a href={mapsUrl(v.latitude, v.longitude)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-royal-600 underline">
            <IconMapPin className="h-3 w-3" /> Voir la localisation
          </a>
        </div>
        {v.type_visite === 'MEDICAL' ? (
          <>
            <p className="text-ink-600">
              Cachet prospect : <strong>{v.cachet_prospect ? 'Oui' : 'Non'}</strong> · Cachet centre : <strong>{v.cachet_centre ? 'Oui' : 'Non'}</strong> · Prescriptions constatées : <strong>{v.prescriptions_constatees}</strong>
            </p>
            {v.promesses_obtenues && <p className="text-ink-600">Promesses : {v.promesses_obtenues}{v.promesses_libre ? ` — ${v.promesses_libre}` : ''}</p>}
            {produits.length > 0 && <p className="text-ink-600">Produits présentés : {produits.join(', ')}</p>}
          </>
        ) : (
          <>
            {v.stock_disponible && <p className="text-ink-600">Stock disponible : <strong>{v.stock_disponible}</strong></p>}
            {v.commande_obtenue && <p className="text-ink-600">Commande obtenue : {v.commande_obtenue}</p>}
            {v.veille_concurrentielle && <p className="text-ink-600">Veille concurrentielle : {v.veille_concurrentielle}</p>}
            {produits.length > 0 && <p className="text-ink-600">Produits présentés : {produits.join(', ')}</p>}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Suivi terrain</h1>
        <p className="text-sm text-ink-400">Détail des visites d'un VM pour une journée donnée, avec localisation de chaque client visité</p>
      </div>

      {vmsVisibles.length === 0 ? (
        <Card className="text-sm text-ink-400 text-center py-8">Aucun VM dans votre périmètre.</Card>
      ) : (
        <>
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical</label>
                <select
                  value={vmId} onChange={(e) => setVmId(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  {vmsVisibles.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Jour</label>
                <input
                  type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
            </div>
          </Card>

          {loadingJour ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Prévues" value={total} tone="ink" icon={<IconClock className="h-4 w-4" />} />
                <StatCard label="Réalisées" value={realisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                <StatCard label="Non faites" value={nonFaites} tone="flame" icon={<IconAlert className="h-4 w-4" />} />
              </div>

              <div className="space-y-2">
                {lignes.length === 0 && horsProgramme.length === 0 && (
                  <Card className="text-sm text-ink-400 text-center py-8">Aucune visite prévue ni réalisée ce jour pour ce VM.</Card>
                )}
                {lignes.map((l) => {
                  const v = l.visite_id ? visiteParId[l.visite_id] : undefined
                  const manquant = l.programme_ligne_id ? manquantParLigne[l.programme_ligne_id] : undefined
                  return (
                    <Card key={l.programme_ligne_id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-800 truncate">{l.client_nom}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {l.potentiel && <PotentielBadge potentiel={l.potentiel} compact />}
                            <span className="text-[11px] text-ink-400">{l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
                          </div>
                        </div>
                        <Badge tone={STATUT_TONE[l.statut_reel ?? ''] ?? 'neutral'}>{STATUT_LABEL[l.statut_reel ?? ''] ?? l.statut_reel}</Badge>
                      </div>
                      {v && <DetailVisite v={v} />}
                      {!v && manquant && (
                        <p className="mt-2 text-xs text-flame-600">
                          Motif : {manquant.motifs_non_visite?.libelle ?? '—'}{manquant.commentaire ? ` — ${manquant.commentaire}` : ''}
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>

              {horsProgramme.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-ink-600 mb-3">Visites hors programme ({horsProgramme.length})</p>
                  <div className="space-y-2">
                    {horsProgramme.map((v) => (
                      <Card key={v.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-800 truncate">{v.clients?.nom}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {v.clients?.potentiel && <PotentielBadge potentiel={v.clients.potentiel as 'GROS' | 'MOYEN' | 'FAIBLE'} compact />}
                              <span className="text-[11px] text-ink-400">{v.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
                            </div>
                          </div>
                          <Badge tone="info">Hors programme</Badge>
                        </div>
                        <DetailVisite v={v} />
                        {v.motif_hors_programme_commentaire && (
                          <p className="mt-2 text-xs text-ink-500">Motif : {v.motif_hors_programme_commentaire}</p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
