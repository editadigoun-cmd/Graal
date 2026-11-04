import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { TrajetCarte, type PointTrajet } from '@/components/ui/TrajetCarte'
import { IconMapPin, IconCheckCircle, IconClock, IconAlert, IconMoon, IconCamera } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Ligne = Database['public']['Views']['v_lignes_avec_statut']['Row']
type Visite = Database['public']['Tables']['visites']['Row'] & {
  client_nom_libre?: string | null
  client_specialite_libre?: string | null
  client_centre_libre?: string | null
  activites_menees?: string | null
  motif_hors_programme_commentaire?: string | null
  commande_photo_path?: string | null
  clients: { nom: string; potentiel: string; specialite: string; centre: string | null; secteur: string } | null
  visite_produits: { produits: { nom: string } | null }[]
}
type Manquant = { programme_ligne_id: string; commentaire: string | null; motifs_non_visite: { libelle: string } | null }
type ClotureRow = Database['public']['Tables']['clotures_journalieres']['Row']
type GardeRow = Database['public']['Tables']['gardes']['Row']

function afficherSpecialite(specialite: string): string {
  return specialite
    .replace(/[_-]+/g, ' ')
    .toLocaleLowerCase('fr')
    .replace(/(^|\s)\p{L}/gu, (lettre) => lettre.toLocaleUpperCase('fr'))
}

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
  const [specialitesClients, setSpecialitesClients] = useState<Record<string, string>>({})
  const [centresClients, setCentresClients] = useState<Record<string, string>>({})
  const [visites, setVisites] = useState<Visite[]>([])
  const [lignesSemaine, setLignesSemaine] = useState<Ligne[]>([])
  const [visitesSemaine, setVisitesSemaine] = useState<Visite[]>([])
  const [manquants, setManquants] = useState<Manquant[]>([])
  const [cloture, setCloture] = useState<ClotureRow | null>(null)
  const [garde, setGarde] = useState<GardeRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingJour, setLoadingJour] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'semaine' | 'LUNDI' | 'MARDI' | 'MERCREDI' | 'JEUDI' | 'VENDREDI' | 'visites'>('semaine')

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
      const dateChoisie = dayjs(date)
      const lundi = dateChoisie.subtract((dateChoisie.day() + 6) % 7, 'day').format('YYYY-MM-DD')
      const vendredi = dayjs(lundi).add(4, 'day').format('YYYY-MM-DD')
      const [{ data: lignesData }, { data: visitesData }, { data: clotureData }, { data: gardeData }, { data: lignesSemaineData }, { data: visitesSemaineData }] = await Promise.all([
        supabase.from('v_lignes_avec_statut').select('*').eq('vm_id', vmId).eq('date_visite', date).order('type_visite'),
        supabase.from('visites').select('*, clients(nom, potentiel, specialite, centre, secteur), visite_produits(produits(nom))')
          .eq('vm_id', vmId).eq('jour', date),
        supabase.from('clotures_journalieres').select('*').eq('vm_id', vmId).eq('jour', date).maybeSingle(),
        supabase.from('gardes').select('*').eq('vm_id', vmId).eq('jour', date).maybeSingle(),
        supabase.from('v_lignes_avec_statut').select('*').eq('vm_id', vmId).gte('date_visite', lundi).lte('date_visite', vendredi),
        supabase.from('visites').select('*, clients(nom, potentiel, specialite, centre, secteur), visite_produits(produits(nom))')
          .eq('vm_id', vmId).gte('jour', lundi).lte('jour', vendredi)
      ])
      setLignes(lignesData ?? [])
      const clientIds = [...new Set((lignesData ?? []).map((ligne) => ligne.client_id).filter((id): id is string => !!id))]
      if (clientIds.length > 0) {
        const { data: clientsSpecialites } = await supabase.from('clients').select('id, specialite, centre').in('id', clientIds)
        setSpecialitesClients(Object.fromEntries((clientsSpecialites ?? []).map((client) => [client.id, client.specialite ?? ''])))
        setCentresClients(Object.fromEntries((clientsSpecialites ?? []).map((client) => [client.id, client.centre ?? ''])))
      } else {
        setSpecialitesClients({})
        setCentresClients({})
      }
      setVisites((visitesData as unknown as Visite[]) ?? [])
      setLignesSemaine(lignesSemaineData ?? [])
      setVisitesSemaine((visitesSemaineData as unknown as Visite[]) ?? [])
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

  const visiteParId = Object.fromEntries(visites.map((v) => [v.id, v]))
  const manquantParLigne = Object.fromEntries(manquants.map((m) => [m.programme_ligne_id, m]))
  const horsProgramme = visites.filter((v) => v.hors_programme)
  const visitesGarde = visites.filter((v) => v.garde_id)

  const total = lignes.length
  const realisees = lignes.filter((l) => l.statut_reel === 'REALISEE').length
  const nonFaites = lignes.filter((l) => l.statut_reel === 'NON_FAITE').length
  const enAttente = lignes.filter((l) => !l.statut_reel || l.statut_reel === 'EN_ATTENTE').length
  const potentiels = ['GROS', 'MOYEN', 'FAIBLE'] as const
  const potentielRecap = potentiels.map((potentiel) => {
    const groupe = lignes.filter((l) => l.potentiel === potentiel)
    return {
      potentiel,
      total: groupe.length,
      realisees: groupe.filter((l) => l.statut_reel === 'REALISEE').length,
      nonFaites: groupe.filter((l) => l.statut_reel === 'NON_FAITE').length,
      restantes: groupe.filter((l) => l.statut_reel !== 'REALISEE' && l.statut_reel !== 'NON_FAITE').length
    }
  })
  const visitesParSpecialite = Object.entries(visites.reduce<Record<string, number>>((acc, visite) => {
    const specialite = visite.clients?.specialite
    if (specialite) acc[afficherSpecialite(specialite)] = (acc[afficherSpecialite(specialite)] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  const joursSemaine = Array.from({ length: 5 }, (_, index) => {
    const dateJour = dayjs(date).subtract((dayjs(date).day() + 6) % 7, 'day').add(index, 'day').format('YYYY-MM-DD')
    const jourLignes = lignesSemaine.filter((ligne) => ligne.date_visite === dateJour)
    const jourVisites = visitesSemaine.filter((visite) => visite.jour === dateJour)
    const potentiel = (nom: 'GROS' | 'MOYEN' | 'FAIBLE') => {
      const groupe = jourLignes.filter((ligne) => ligne.potentiel === nom)
      return { total: groupe.length, realisees: groupe.filter((ligne) => ligne.statut_reel === 'REALISEE').length,
        nonFaites: groupe.filter((ligne) => ligne.statut_reel === 'NON_FAITE').length,
        restantes: groupe.filter((ligne) => ligne.statut_reel !== 'REALISEE' && ligne.statut_reel !== 'NON_FAITE').length }
    }
    const specialites = Object.entries(jourVisites.reduce<Record<string, number>>((acc, visite) => {
      const specialite = visite.clients?.specialite
      if (specialite) acc[afficherSpecialite(specialite)] = (acc[afficherSpecialite(specialite)] ?? 0) + 1
      return acc
    }, {})).sort((a, b) => b[1] - a[1])
    return { date: dateJour, lignes: jourLignes, visites: jourVisites, total: jourLignes.length,
      realisees: jourLignes.filter((l) => l.statut_reel === 'REALISEE').length,
      nonFaites: jourLignes.filter((l) => l.statut_reel === 'NON_FAITE').length,
      restantes: jourLignes.filter((l) => l.statut_reel !== 'REALISEE' && l.statut_reel !== 'NON_FAITE').length,
      gros: potentiel('GROS'), moyen: potentiel('MOYEN'), faible: potentiel('FAIBLE'), specialites }
  })
  const recapSemaine = {
    total: lignesSemaine.length,
    realisees: lignesSemaine.filter((l) => l.statut_reel === 'REALISEE').length,
    nonFaites: lignesSemaine.filter((l) => l.statut_reel === 'NON_FAITE').length,
    restantes: lignesSemaine.filter((l) => l.statut_reel !== 'REALISEE' && l.statut_reel !== 'NON_FAITE').length,
    potentiel: (nom: 'GROS' | 'MOYEN' | 'FAIBLE') => {
      const groupe = lignesSemaine.filter((l) => l.potentiel === nom)
      return { total: groupe.length, realisees: groupe.filter((l) => l.statut_reel === 'REALISEE').length,
        nonFaites: groupe.filter((l) => l.statut_reel === 'NON_FAITE').length,
        restantes: groupe.filter((l) => l.statut_reel !== 'REALISEE' && l.statut_reel !== 'NON_FAITE').length }
    },
    specialites: Object.entries(visitesSemaine.reduce<Record<string, number>>((acc, visite) => {
      const specialite = visite.clients?.specialite
      if (specialite) acc[afficherSpecialite(specialite)] = (acc[afficherSpecialite(specialite)] ?? 0) + 1
      return acc
    }, {})).sort((a, b) => b[1] - a[1])
  }

  const pointsTrajet: PointTrajet[] = [
    ...[...visites].filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude) && v.latitude !== 0 && v.longitude !== 0).sort((a, b) => a.horodatage.localeCompare(b.horodatage)).map((v) => ({
      id: v.id, lat: v.latitude, lng: v.longitude,
      label: [v.clients?.nom ?? v.client_nom_libre ?? (v.type_visite === 'PHARMACIE' ? 'Pharmacie' : 'Client'), v.clients?.centre ?? v.client_centre_libre, v.clients?.specialite ? afficherSpecialite(v.clients.specialite) : v.client_specialite_libre, v.type_visite === 'PHARMACIE' ? 'Pharmacie' : 'Visite médicale'].filter(Boolean).join(' · '), heure: dayjs(v.horodatage).format('HH:mm'),
      type: (v.garde_id ? 'garde' : v.type_visite === 'PHARMACIE' ? 'pharmacie' : 'visite') as PointTrajet['type']
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

  async function voirPreuveCommande(path: string) {
    const { data, error } = await supabase.storage.from('preuves-commandes').createSignedUrl(path, 3600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function DetailVisite({ v }: { v: Visite }) {
    const produits = v.visite_produits.map((p: { produits: { nom: string } | null }) => p.produits?.nom).filter(Boolean)
    return (
      <div className="mt-2 space-y-1.5 rounded-xl bg-ink-50 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-500">
          <span className="flex items-center gap-1"><IconClock className="h-3 w-3" /> {dayjs(v.horodatage).format('HH:mm')}</span>
          <a href={mapsUrl(v.latitude, v.longitude)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-royal-600 underline">
            <IconMapPin className="h-3 w-3" /> Voir la localisation
          </a>
        </div>
        {v.client_nom_libre && <p className="text-ink-700"><strong>Client hors portefeuille :</strong> {v.client_nom_libre}</p>}
        {v.client_specialite_libre && <p className="text-ink-600"><strong>Spécialité :</strong> {v.client_specialite_libre}</p>}
        {v.client_centre_libre && <p className="text-ink-600"><strong>Centre :</strong> {v.client_centre_libre}</p>}
        {v.hors_programme && v.motif_hors_programme_commentaire && <p className="text-ink-600 whitespace-pre-wrap"><strong>Raison hors programme :</strong> {v.motif_hors_programme_commentaire}</p>}
        {v.activites_menees && <p className="text-ink-600 whitespace-pre-wrap"><strong>Activités menées :</strong> {v.activites_menees}</p>}
        {v.type_visite === 'MEDICAL' ? (
          <>
            {v.cachets_obtenus
              ? <p className="text-ink-600">Cachets / documents obtenus : {v.cachets_obtenus}</p>
              : (v.cachet_prospect || v.cachet_centre) && <p className="text-ink-600">Ancien compte rendu — cachet prospect : {v.cachet_prospect ? 'Oui' : 'Non'} · cachet centre : {v.cachet_centre ? 'Oui' : 'Non'}</p>}
            {v.engagements_prescription
              ? <p className="text-ink-600 whitespace-pre-wrap"><strong>Engagements de prescription :</strong> {v.engagements_prescription}</p>
              : v.promesses_obtenues && <p className="text-ink-600">Anciennes promesses : {v.promesses_obtenues}{v.promesses_libre ? ` — ${v.promesses_libre}` : ''}</p>}
            {v.produits_habituels_prescription && <p className="text-ink-600 whitespace-pre-wrap"><strong>Produits habituels de prescription :</strong> {v.produits_habituels_prescription}</p>}
            {v.constats_prescription
              ? <p className="text-ink-600 whitespace-pre-wrap"><strong>Constats de prescription :</strong> {v.constats_prescription}</p>
              : v.prescriptions_constatees > 0 && <p className="text-ink-600">Ancien compte rendu : {v.prescriptions_constatees} prescription(s) indiquée(s), sans détail produit.</p>}
            {v.resume_visite && <p className="text-ink-600 whitespace-pre-wrap"><strong>Résumé de la visite :</strong> {v.resume_visite}</p>}
            {produits.length > 0 && <p className="text-ink-600"><strong>Produits présentés :</strong> {produits.join(', ')}</p>}
          </>
        ) : (
          <>
            {v.stock_observe
              ? <p className="text-ink-600 whitespace-pre-wrap"><strong>Stock observé :</strong> {v.stock_observe}</p>
              : v.stock_disponible && <p className="text-ink-600">Ancien relevé de stock : <strong>{v.stock_disponible}</strong></p>}
            {v.commande_obtenue && <p className="text-ink-600 whitespace-pre-wrap"><strong>Commande obtenue :</strong> {v.commande_obtenue}</p>}
            {(v as Visite & { commande_photo_path?: string | null }).commande_photo_path && (
              <button type="button" onClick={() => voirPreuveCommande((v as Visite & { commande_photo_path?: string | null }).commande_photo_path!)} className="inline-flex items-center gap-1.5 rounded-lg bg-royal-50 px-3 py-2 text-xs font-semibold text-royal-700 hover:bg-royal-100">
                <IconCamera className="h-3.5 w-3.5" /> Voir la photo justificative
              </button>
            )}
            {v.veille_concurrentielle && <p className="text-ink-600 whitespace-pre-wrap"><strong>Veille concurrentielle :</strong> {v.veille_concurrentielle}</p>}
            {v.resume_visite && <p className="text-ink-600 whitespace-pre-wrap"><strong>Résumé de la visite :</strong> {v.resume_visite}</p>}
            {produits.length > 0 && <p className="text-ink-600"><strong>Produits présentés :</strong> {produits.join(', ')}</p>}
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

          <div className="flex gap-2 overflow-x-auto rounded-xl border border-ink-100 bg-white p-1.5">
            {([
              { id: 'semaine', label: 'Semaine' },
              { id: 'LUNDI', label: 'Lundi', date: joursSemaine[0]?.date },
              { id: 'MARDI', label: 'Mardi', date: joursSemaine[1]?.date },
              { id: 'MERCREDI', label: 'Mercredi', date: joursSemaine[2]?.date },
              { id: 'JEUDI', label: 'Jeudi', date: joursSemaine[3]?.date },
              { id: 'VENDREDI', label: 'Vendredi', date: joursSemaine[4]?.date },
              { id: 'visites', label: 'Visites & trajet' },
            ] as const).map((tab) => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); if ('date' in tab && tab.date) setDate(tab.date) }} className={`shrink-0 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === tab.id ? 'bg-royal-600 text-white shadow-sm' : 'text-ink-500 hover:bg-ink-50'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          {loadingJour ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              {activeTab === 'semaine' && (
              <div className="space-y-3">
                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink-800">Récapitulatif global de la semaine</p>
                      <p className="text-xs text-ink-400">{dayjs(joursSemaine[0].date).format('DD/MM')} – {dayjs(joursSemaine[4].date).format('DD/MM/YYYY')}</p>
                    </div>
                    <Badge tone="info">{recapSemaine.total} clients programmés</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                    <StatCard label="Visités" value={recapSemaine.realisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                    <StatCard label="À visiter" value={recapSemaine.restantes} tone="royal" icon={<IconClock className="h-4 w-4" />} />
                    <StatCard label="Taux de réalisation" value={recapSemaine.total > 0 ? Math.round((recapSemaine.realisees / recapSemaine.total) * 100) : 0} suffix="%" tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                  </div>
                  <p className="mb-2 text-xs font-bold text-ink-600">Répartition par potentiel — global</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([{key:'GROS',label:'Gros potentiel',value:recapSemaine.potentiel('GROS')},{key:'MOYEN',label:'Potentiel moyen',value:recapSemaine.potentiel('MOYEN')},{key:'FAIBLE',label:'Faible potentiel',value:recapSemaine.potentiel('FAIBLE')}] as const).map((item) => (
                      <div key={item.key} className="rounded-xl border border-ink-100 p-3">
                        <p className="text-xs font-bold text-ink-700">{item.label}</p>
                        <p className="mt-1 text-lg font-extrabold text-ink-800">{item.value.total} <span className="text-xs font-normal text-ink-400">programmés</span></p>
                        <p className="text-xs text-ink-500">{item.value.realisees} visités · {item.value.restantes} à visiter · {item.value.nonFaites} non faites</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 mb-2 text-xs font-bold text-ink-600">Visites réalisées par spécialité — global</p>
                  {recapSemaine.specialites.length === 0 ? <p className="text-xs text-ink-400">Aucune visite enregistrée cette semaine.</p> : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {recapSemaine.specialites.map(([specialite, count]) => <div key={specialite} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2"><span className="text-xs text-ink-600">{specialite}</span><span className="text-sm font-bold text-ink-800">{count}</span></div>)}
                    </div>
                  )}
                </Card>
              </div>
              )}
              {activeTab !== 'semaine' && activeTab !== 'visites' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatCard label="Prévues" value={total} tone="ink" icon={<IconClock className="h-4 w-4" />} />
                  <StatCard label="Réalisées" value={realisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                  <StatCard label="Restantes" value={enAttente} tone="royal" icon={<IconClock className="h-4 w-4" />} />
                  <StatCard label="Taux de réalisation" value={total > 0 ? Math.round((realisees / total) * 100) : 0} suffix="%" tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
                </div>
                <Card>
                  <p className="text-sm font-bold text-ink-800 mb-3">Récapitulatif par potentiel</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {potentielRecap.map((item) => (
                      <div key={item.potentiel} className="rounded-xl border border-ink-100 p-3">
                        <p className="text-xs font-bold text-ink-700">{item.potentiel === 'GROS' ? 'Gros potentiel' : item.potentiel === 'MOYEN' ? 'Potentiel moyen' : 'Faible potentiel'}</p>
                        <p className="mt-1 text-lg font-extrabold text-ink-800">{item.realisees} <span className="text-xs font-normal text-ink-400">/ {item.total} réalisés</span></p>
                        <p className="text-xs text-ink-500">{item.restantes} restantes · {item.nonFaites} non faites</p>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <p className="text-sm font-bold text-ink-800 mb-3">Visites par spécialité</p>
                  {visitesParSpecialite.length === 0 ? (
                    <p className="text-xs text-ink-400">Aucune visite réalisée enregistrée pour cette journée.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visitesParSpecialite.map(([specialite, count]) => (
                        <div key={specialite} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                          <span className="text-xs text-ink-600">{specialite}</span>
                          <span className="text-sm font-bold text-ink-800">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
              )}

              {activeTab === 'visites' && (
              <div className="space-y-3">
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
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1d4ed8]" /> Médical</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#059669]" /> Pharmacie</span>
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
                            {l.type_visite === 'MEDICAL' && specialitesClients[l.client_id ?? ''] && <Badge tone="info">{afficherSpecialite(specialitesClients[l.client_id ?? ''])}</Badge>}
                            {l.client_id && centresClients[l.client_id] && <span className="text-[11px] text-ink-500">{centresClients[l.client_id]}</span>}
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
                            <p className="text-sm font-semibold text-ink-800 truncate">{v.clients?.nom ?? v.client_nom_libre ?? 'Client non renseigné'}</p>
                            {(v.clients?.centre ?? v.client_centre_libre) && <p className="mt-0.5 text-xs text-ink-500">{v.clients?.centre ?? v.client_centre_libre}</p>}}
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
                            <p className="text-sm font-semibold text-ink-800 truncate">{v.clients?.nom ?? v.client_nom_libre ?? 'Client non renseigné'}</p>
                            {(v.clients?.centre ?? v.client_centre_libre) && <p className="mt-0.5 text-xs text-ink-500">{v.clients?.centre ?? v.client_centre_libre}</p>
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
              </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}