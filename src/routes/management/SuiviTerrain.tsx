import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { TrajetCarte, type PointTrajet } from '@/components/ui/TrajetCarte'
import { IconMapPin, IconCheckCircle, IconClock, IconAlert, IconMoon, IconCamera, IconTrendingUp } from '@/components/ui/icons'
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
type ClotureRow = Database['public']['Tables']['clotures_journalieres']['Row']
type GardeRow = Database['public']['Tables']['gardes']['Row']

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
  const [vms, setVms] = useState<{ id: string; full_name: string; equipe_id: string | null; equipes: { nom: string } | null }[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [vmId, setVmId] = useState('')
  const [date, setDate] = useState(todayBenin().format('YYYY-MM-DD'))
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [lignesSemaine, setLignesSemaine] = useState<Ligne[]>([])
  const [visites, setVisites] = useState<Visite[]>([])
  const [manquants, setManquants] = useState<Manquant[]>([])
  const [cloture, setCloture] = useState<ClotureRow | null>(null)
  const [garde, setGarde] = useState<GardeRow | null>(null)
  const [scoreJour, setScoreJour] = useState<number | null>(null)
  const [scoreSemaine, setScoreSemaine] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingJour, setLoadingJour] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    async function init() {
      const [{ data: vmList }, se] = await Promise.all([
        supabase.from('profiles').select('id, full_name, equipe_id, equipes(nom)').eq('role', 'vm').order('full_name'),
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
      const semaineDebut = dayjs(date).isoWeekday(1).format('YYYY-MM-DD')
      const [{ data: lignesData }, { data: visitesData }, { data: clotureData }, { data: gardeData }, { data: scoreJourData }, { data: scoreSemaineData }] = await Promise.all([
        supabase.from('v_lignes_avec_statut').select('*').eq('vm_id', vmId).eq('date_visite', date).order('type_visite'),
        supabase.from('visites').select('*, clients(nom, potentiel, specialite, centre, secteur), visite_produits(produits(nom))')
          .eq('vm_id', vmId).eq('jour', date),
        supabase.from('clotures_journalieres').select('*').eq('vm_id', vmId).eq('jour', date).maybeSingle(),
        supabase.from('gardes').select('*').eq('vm_id', vmId).eq('jour', date).maybeSingle(),
        supabase.from('v_taux_realisation_journalier').select('taux_realisation').eq('vm_id', vmId).eq('jour', date).maybeSingle(),
        supabase.from('v_score_hebdomadaire_pondere').select('score_pondere_pourcentage').eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()
      ])
      setScoreJour(scoreJourData?.taux_realisation == null ? null : Math.round(Number(scoreJourData.taux_realisation) * 100))
      setScoreSemaine(scoreSemaineData?.score_pondere_pourcentage == null ? null : Number(scoreSemaineData.score_pondere_pourcentage))
      setLignes(lignesData ?? [])\n      setLignesSemaine(semaineData ?? [])
      setVisites((visitesData as unknown as Visite[]) ?? [])
      setCloture(clotureData ?? null)
      setGarde(gardeData ?? null)

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

  const vmSelectionne = vmsVisibles.find((v) => v.id === vmId)
  const equipeNom = (vmSelectionne?.equipes?.nom ?? '').toUpperCase()
  const joursGarde: Record<string, number[]> = { PROPHADIS: [1, 3], ODYPAHARM: [2, 4], 'TIL HEALTH CARE': [2, 3, 4] }
  const joursEquipe = joursGarde[equipeNom] ?? []
  const jourSemaine = dayjs(date).day() || 7
  const gardePrevue = joursEquipe.includes(jourSemaine)

  const visiteParId = Object.fromEntries(visites.map((v) => [v.id, v]))
  const manquantParLigne = Object.fromEntries(manquants.map((m) => [m.programme_ligne_id, m]))
  const horsProgramme = visites.filter((v) => v.hors_programme)
  const visitesGarde = visites.filter((v) => v.garde_id)

  const total = lignes.length
  const realisees = lignes.filter((l) => l.statut_reel === 'REALISEE').length
  const nonFaites = lignes.filter((l) => l.statut_reel === 'NON_FAITE').length\n  const recapPotentiel = ['GROS', 'MOYEN', 'FAIBLE'].map((potentiel) => {\n    const group = lignesSemaine.filter((l) => l.potentiel === potentiel)\n    const specialites = [...new Set(group.map((l) => l.specialite || (l.type_visite === 'PHARMACIE' ? 'Pharmacie' : 'Autre spécialité')))]\n    return { potentiel, total: group.length, realisees: group.filter((l) => l.statut_reel === 'REALISEE').length, specialites: specialites.map((specialite) => { const rows = group.filter((l) => (l.specialite || (l.type_visite === 'PHARMACIE' ? 'Pharmacie' : 'Autre spécialité')) === specialite); return { specialite, total: rows.length, realisees: rows.filter((l) => l.statut_reel === 'REALISEE').length } }) }\n  })

  const pointsTrajet: PointTrajet[] = [
    ...[...visites].sort((a, b) => a.horodatage.localeCompare(b.horodatage)).map((v) => ({
      id: v.id, lat: v.latitude, lng: v.longitude,
      label: v.clients?.nom ?? 'Client', heure: dayjs(v.horodatage).format('HH:mm'),
      type: (v.garde_id ? 'garde' : 'visite') as PointTrajet['type']
    })),
    ...(cloture?.photo_latitude != null && cloture.photo_longitude != null
      ? [{ id: 'cloture', lat: cloture.photo_latitude, lng: cloture.photo_longitude, label: 'Clôture de journée', heure: cloture.heure_cloture ? dayjs(cloture.heure_cloture).format('HH:mm') : '', type: 'cloture' as const }]
      : [])
  ]

  function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  async function voirPhotoCloture() {
    if (!cloture?.photo_path) return
    setPhotoBusy(true)
    const { data, error } = await supabase.storage.from('fiches-papier').createSignedUrl(cloture.photo_path, 3600)
    setPhotoBusy(false)
    if (!error && data) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
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
              <Card className={gardePrevue ? 'border border-royal-200 bg-royal-50/50' : ''}>
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-ink-100 p-2"><IconMoon className="h-4 w-4 text-ink-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-800">Planning des gardes</p>
                    <p className="mt-1 text-xs text-ink-500">{vmSelectionne?.equipes?.nom ?? 'Équipe non renseignée'} · {joursEquipe.length ? joursEquipe.map((j) => ({1:'lundi',2:'mardi',3:'mercredi',4:'jeudi',5:'vendredi',6:'samedi',7:'dimanche'}[j])).join(', ') : 'jours de garde à configurer'}</p>
                    <p className={gardePrevue ? 'mt-2 text-xs font-semibold text-royal-700' : 'mt-2 text-xs text-ink-500'}>{gardePrevue ? 'Garde prévue pour la date sélectionnée' : 'Pas de garde prévue pour la date sélectionnée'}</p>
                  </div>
                </div>
              </Card>

              <Card>
                <p className="text-sm font-bold text-ink-800">Récapitulatif hebdomadaire par potentiel</p>
                <p className="mt-1 text-xs text-ink-500">Semaine du {dayjs(date).isoWeekday(1).format('DD/MM/YYYY')} · {lignesSemaine.length} visites programmées</p>
                <div className="mt-3 space-y-3">
                  {recapPotentiel.map((g) => (
                    <div key={g.potentiel} className="rounded-xl border border-ink-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink-800">{g.potentiel === 'GROS' ? 'Gros potentiel' : g.potentiel === 'MOYEN' ? 'Potentiel moyen' : 'Faible potentiel'}</span>
                        <span className="text-xs font-semibold text-ink-600">{g.realisees}/{g.total} visites</span>
                      </div>
                      {g.specialites.length > 0 ? <div className="mt-2 space-y-1.5">{g.specialites.map((s) => <div key={s.specialite} className="flex items-center justify-between gap-3 text-xs"><span className="text-ink-500">{s.specialite}</span><span className="font-medium text-ink-700">{s.realisees}/{s.total} réalisées</span></div>)}</div> : <p className="mt-2 text-xs text-ink-400">Aucune visite programmée pour ce potentiel.</p>}
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard label="Prévues" value={total} tone="ink" icon={<IconClock className="h-4 w-4" />} />
                <StatCard label="Réalisées" value={realisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                <StatCard label="Non faites" value={nonFaites} tone="flame" icon={<IconAlert className="h-4 w-4" />} />
                <Card className="relative overflow-hidden rounded-xl3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-ink-500">Scores</p>
                    <div className="rounded-xl bg-gradient-to-br from-royal-600 to-royal-500 p-1.5 text-white"><IconTrendingUp className="h-4 w-4" /></div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-bold text-ink-800">Jour : <span className="text-royal-600">{scoreJour == null ? '—' : `${scoreJour}%`}</span></p>
                    <p className="text-sm font-bold text-ink-800">Semaine : <span className="text-emerald-600">{scoreSemaine == null ? '—' : `${Math.round(scoreSemaine)}%`}</span></p>
                  </div>
                </Card>
              </div>

              {cloture && (
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-800">Fiche de clôture</p>
                    <p className="text-xs text-ink-400">
                      {cloture.heure_cloture ? `Clôturée à ${dayjs(cloture.heure_cloture).format('HH:mm')}` : 'Clôture enregistrée'}
                      {cloture.en_retard && ' · en retard'}
                      {cloture.statut === 'CLOTUREE_FORCEE' && ' · clôture forcée'}
                    </p>
                  </div>
                  {cloture.photo_path ? (
                    <Button size="sm" variant="secondary" loading={photoBusy} icon={<IconCamera className="h-3.5 w-3.5" />} onClick={voirPhotoCloture}>
                      Voir la photo
                    </Button>
                  ) : (
                    <span className="text-[10px] text-ink-400 shrink-0">Sans photo</span>
                  )}
                </Card>
              )}

              {pointsTrajet.length > 0 && (
                <Card className="p-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="text-sm font-bold text-ink-800">Zones parcourues</p>
                    <div className="flex items-center gap-3 text-[10px] text-ink-400">
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1d4ed8]" /> Visite</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" /> Garde</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#f97316]" /> Clôture</span>
                    </div>
                  </div>
                  <TrajetCarte points={pointsTrajet} />
                </Card>
              )}

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
                          {l.type_visite === 'MEDICAL' && l.specialite && <p className="mt-1 text-xs text-royal-600">Spécialité : {l.specialite}</p>}
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
                            {v.type_visite === 'MEDICAL' && v.clients?.specialite && <p className="mt-1 text-xs text-royal-600">Spécialité : {v.clients.specialite}</p>}
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

              {(visitesGarde.length > 0 || garde) && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-ink-600 flex items-center gap-1.5"><IconMoon className="h-4 w-4 text-royal-500" /> Garde ({visitesGarde.length})</p>
                    {garde && (
                      <Badge tone={garde.statut === 'TERMINEE' ? 'success' : 'info'}>
                        {garde.statut === 'TERMINEE' ? `Terminée${garde.terminee_at ? ' à ' + dayjs(garde.terminee_at).format('HH:mm') : ''}` : 'En cours'}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {visitesGarde.map((v) => (
                      <Card key={v.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-800 truncate">{v.clients?.nom}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {v.clients?.potentiel && <PotentielBadge potentiel={v.clients.potentiel as 'GROS' | 'MOYEN' | 'FAIBLE'} compact />}
                              <span className="text-[11px] text-ink-400">{v.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
                            </div>
                          </div>
                          <Badge tone="info">Garde</Badge>
                        </div>
                        <DetailVisite v={v} />
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
