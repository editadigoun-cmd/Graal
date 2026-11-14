import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconCheckCircle, IconX, IconClock, IconCalendar, IconPill, IconUsers, IconAlert, IconSend, IconEye } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday, nowBenin, deadlineSoumission } from '@/lib/time'
import { JOURS } from '@/lib/rules'
import { JOUR_LABEL } from '@/lib/theme'
import dayjs from 'dayjs'

interface ProgrammeRow {
  id: string
  semaine_debut: string
  statut: string
  soumis_at: string | null
  vm_id: string
  mode_pharmacie_uniquement?: boolean
  profiles: { full_name: string; equipe_id?: string | null } | null
  programme_conformite: { cible: string; quota_attendu: number; quantite_programmee: number; statut: string }[]
}

interface BrouillonRow {
  id: string
  semaine_debut: string
  mode_pharmacie_uniquement: boolean
  vm_id: string
  delai_supplementaire_jusqu_a: string | null
  profiles: { full_name: string } | null
}

interface FusionRow {
  id: string
  semaine_debut: string
  potentiels: string[]
  actif: boolean
}

interface LigneRow {
  id: string
  jour: string
  type_visite: string
  clients: { id: string; nom: string; potentiel: string; specialite: string | null; centre: string | null } | null
}

interface DerogationPlanningRow {
  id: string
  semaine_debut: string
  vm_id: string | null
  equipe_id: string | null
  lever_zone: boolean
  lever_potentiel: boolean
  specialite_autorisee?: string | null
  actif: boolean
}

type Potentiel = 'G+' | 'GROS' | 'MOYEN' | 'FAIBLE'
const POTENTIELS: Potentiel[] = ['G+', 'GROS', 'MOYEN', 'FAIBLE']

export default function ManagementProgrammes() {
  const { profile } = useAuth()
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([])
  const [brouillons, setBrouillons] = useState<BrouillonRow[]>([])
  const [fusions, setFusions] = useState<FusionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [forceMsg, setForceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [fusionSemaine, setFusionSemaine] = useState(isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD'))
  const [fusionPotentiels, setFusionPotentiels] = useState<Potentiel[]>(['GROS'])
  const [fusionBusy, setFusionBusy] = useState(false)

  const [vmOptions, setVmOptions] = useState<{ id: string; full_name: string }[]>([])
  const [equipeOptions, setEquipeOptions] = useState<{ id: string; nom: string }[]>([])
  const [derogationsPlanning, setDerogationsPlanning] = useState<DerogationPlanningRow[]>([])
  const [derogCibleType, setDerogCibleType] = useState<'vm' | 'equipe'>('vm')
  const [derogVmId, setDerogVmId] = useState('fd879be3-1200-48be-a1ff-77d15bd4dc06')
  const [derogEquipeId, setDerogEquipeId] = useState('')
  const [derogSemaine, setDerogSemaine] = useState(isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD'))
  const [derogZone, setDerogZone] = useState(false)
  const [derogPotentiel, setDerogPotentiel] = useState(false)
  const [derogGeneralistes, setDerogGeneralistes] = useState(false)
  const [derogPlanningBusy, setDerogPlanningBusy] = useState(false)

  const [detail, setDetail] = useState<ProgrammeRow | null>(null)
  const [detailLignes, setDetailLignes] = useState<LigneRow[]>([])
  const [detailQuotas, setDetailQuotas] = useState<{ cible: string; libelle: string; quota_hebdomadaire: number }[]>([])
  const [detailEquipeNom, setDetailEquipeNom] = useState('')
  const [detailJours, setDetailJours] = useState<Record<string, { statut: string; soumis_at?: string | null }>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailJourActif, setDetailJourActif] = useState<string>(JOURS[0])
  const [samediClients, setSamediClients] = useState<{ id: string; nom: string; potentiel: string; specialite: string | null; centre: string | null }[]>([])
  const [samediClientId, setSamediClientId] = useState('')
  const [samediLoading, setSamediLoading] = useState(false)
  const [samediSaving, setSamediSaving] = useState(false)

  const [delaiValeur, setDelaiValeur] = useState<Record<string, string>>({})
  const semaineCourante = isoWeekMonday(nowBenin()).format('YYYY-MM-DD')
  const semaineProchaine = isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD')
  const [semaineSelectionnee, setSemaineSelectionnee] = useState(semaineProchaine)

  const [derogProgrammeId, setDerogProgrammeId] = useState('')
  const [derogClients, setDerogClients] = useState<{ id: string; nom: string }[]>([])
  const [derogClientId, setDerogClientId] = useState('')
  const [derogMotif, setDerogMotif] = useState('')
  const [derogBusy, setDerogBusy] = useState(false)

  async function load() {
    const [{ data }, { data: br }, { data: fu }, vms, equipes, derogs] = await Promise.all([
      supabase
        .from('programmes_hebdomadaires')
        .select('*, profiles!programmes_hebdomadaires_vm_id_fkey(full_name, equipe_id), programme_conformite(cible, quota_attendu, quantite_programmee, statut)')
        .in('statut', ['BROUILLON', 'SOUMIS', 'VALIDE', 'VERROUILLE'])
        .order('semaine_debut', { ascending: false })
        .limit(100),
      supabase
        .from('programmes_hebdomadaires')
        .select('id, semaine_debut, mode_pharmacie_uniquement, vm_id, delai_supplementaire_jusqu_a, profiles!programmes_hebdomadaires_vm_id_fkey(full_name)')
        .eq('statut', 'BROUILLON')
        .order('semaine_debut', { ascending: false })
        .limit(100),
      supabase.from('fusions_secteurs').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('profiles').select('id, full_name').eq('role', 'vm').eq('actif', true).order('full_name'),
      supabase.from('equipes').select('id, nom').order('nom'),
      (supabase as any).from('derogations_planning').select('*').order('semaine_debut', { ascending: false }).limit(100)
    ])
    setProgrammes((data as unknown as ProgrammeRow[]) ?? [])
    setBrouillons((br as unknown as BrouillonRow[]) ?? [])
    setFusions((fu as unknown as FusionRow[]) ?? [])
    setVmOptions(((vms as any)?.data ?? []) as { id: string; full_name: string }[])
    setEquipeOptions(((equipes as any)?.data ?? []) as { id: string; nom: string }[])
    setDerogationsPlanning((((derogs as any)?.data ?? []) as DerogationPlanningRow[]))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Sans ceci, un programme fraîchement soumis par un VM n'apparaît qu'après un
    // rechargement manuel de la page — l'admin/superviseur voit la notification arriver
    // mais pas le programme tant que l'écran n'est pas rouvert.
    const channel = supabase
      .channel('programmes-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programmes_hebdomadaires' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const deadlinePassee = (semaineDebut: string) => nowBenin().isAfter(deadlineSoumission(semaineDebut))
  const delaiActif = (b: BrouillonRow) => !!b.delai_supplementaire_jusqu_a && dayjs(b.delai_supplementaire_jusqu_a).isAfter(nowBenin())

  async function accorderDelai(programmeId: string) {
    const valeur = delaiValeur[programmeId]
    if (!valeur) return
    setBusy(programmeId)
    setForceMsg(null)
    const { error } = await supabase.rpc('accorder_delai_supplementaire_programme', {
      p_programme_id: programmeId, p_nouvelle_limite: dayjs(valeur).toISOString()
    })
    setBusy(null)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else { setForceMsg({ type: 'success', text: 'Délai supplémentaire accordé.' }); load() }
  }

  async function retirerDelai(programmeId: string) {
    if (!window.confirm('Retirer immédiatement le délai supplémentaire de ce programme ?')) return
    setBusy(programmeId)
    setForceMsg(null)
    const { error } = await supabase.rpc('retirer_delai_supplementaire_programme', {
      p_programme_id: programmeId
    })
    setBusy(null)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else {
      setForceMsg({ type: 'success', text: 'Délai supplémentaire retiré.' })
      await load()
    }
  }

  async function ouvrirDetail(p: ProgrammeRow) {
    setDetail(p)
    setDetailJourActif(JOURS[0])
    setSamediClients([])
    setSamediClientId('')
    setDetailLoading(true)
    setDetailLignes([])
    setDetailQuotas([])
    setDetailEquipeNom('')
    const equipeId = p.profiles?.equipe_id
    const [{ data }, { data: validations }, { data: quotas }, { data: equipe }] = await Promise.all([
      supabase.from('programme_lignes')
        .select('id, jour, type_visite, clients(id, nom, potentiel, specialite, centre)')
        .eq('programme_id', p.id).order('ordre'),
      supabase.from('programme_jours_validation').select('jour, statut, soumis_at').eq('programme_id', p.id),
      equipeId ? supabase.from('quotas_cibles').select('cible, libelle, quota_hebdomadaire').eq('equipe_id', equipeId).order('ordre') : Promise.resolve({ data: [] as any[] }),
      equipeId ? supabase.from('equipes').select('nom').eq('id', equipeId).maybeSingle() : Promise.resolve({ data: null as any })
    ])
    setDetailLignes((data as unknown as LigneRow[]) ?? [])
    setDetailQuotas((quotas ?? []) as { cible: string; libelle: string; quota_hebdomadaire: number }[])
    setDetailEquipeNom(equipe?.nom ?? '')
    setDetailJours(Object.fromEntries((validations ?? []).map((v: any) => [v.jour, { statut: v.statut, soumis_at: v.soumis_at }])))
    setDetailLoading(false)
  }

  async function chargerClientsSamedi(programme: ProgrammeRow) {
    setSamediLoading(true)
    setSamediClientId('')
    const { data, error } = await supabase
      .from('portefeuille')
      .select('clients(id, nom, potentiel, specialite, centre, secteur, actif)')
      .eq('vm_id', programme.vm_id)
      .order('client_id')
    if (error) {
      setForceMsg({ type: 'error', text: 'Impossible de charger le portefeuille de Chadrac : ' + error.message })
      setSamediClients([])
    } else {
      const dejaProgrammes = new Set(detailLignes.map((ligne) => ligne.clients?.id).filter(Boolean))
      const clients = ((data ?? []) as unknown as { clients: { id: string; nom: string; potentiel: string; specialite: string | null; centre: string | null; secteur: string | null; actif: boolean } | null }[])
        .map((row) => row.clients)
        .filter((client): client is NonNullable<typeof client> => !!client && client.actif && client.secteur === 'A' && !dejaProgrammes.has(client.id))
        .map(({ id, nom, potentiel, specialite, centre }) => ({ id, nom, potentiel, specialite, centre }))
      setSamediClients(clients)
    }
    setSamediLoading(false)
  }

  async function ajouterClientSamedi() {
    if (!detail || !samediClientId || profile?.role !== 'admin') return
    setSamediSaving(true)
    setForceMsg(null)
    const { error } = await supabase.from('programme_lignes').insert({
      programme_id: detail.id,
      client_id: samediClientId,
      jour: 'SAMEDI' as any,
      type_visite: samediClients.find((client) => client.id === samediClientId)?.specialite === 'PHARMACIE' ? 'PHARMACIE' : 'MEDICAL',
      ordre: detailLignes.filter((ligne) => ligne.jour === 'SAMEDI').length
    })
    setSamediSaving(false)
    if (error) {
      setForceMsg({ type: 'error', text: 'Visite non ajoutée : ' + error.message })
      return
    }
    const { data, error: reloadError } = await supabase.from('programme_lignes')
      .select('id, jour, type_visite, clients(id, nom, potentiel, specialite, centre)')
      .eq('programme_id', detail.id).order('ordre')
    if (reloadError) setForceMsg({ type: 'error', text: 'Visite ajoutée, mais actualisation impossible : ' + reloadError.message })
    else {
      setDetailLignes((data as unknown as LigneRow[]) ?? [])
      setSamediClientId('')
      setForceMsg({ type: 'success', text: 'Visite ajoutée au samedi de Chadrac.' })
      await chargerClientsSamedi(detail)
    }
  }

  async function validerJour(programmeId: string, jour: string) {
    setBusy(programmeId + ':' + jour)
    setForceMsg(null)
    const { data, error } = await supabase.rpc('valider_jour_programme', {
      p_programme_id: programmeId, p_jour: jour, p_date_limite: null
    })
    setBusy(null)
    if (error) {
      setForceMsg({ type: 'error', text: error.message })
      return
    }

    // Recharger les validations depuis la base : ne pas supposer que la journée
    // est validée uniquement à partir du clic, et refléter le statut hebdomadaire.
    const { data: validations, error: validationError } = await supabase
      .from('programme_jours_validation')
      .select('jour, statut, soumis_at')
      .eq('programme_id', programmeId)
    if (validationError) {
      setForceMsg({ type: 'error', text: 'Journée validée, mais impossible d’actualiser son statut : ' + validationError.message })
      await load()
      return
    }
    setDetailJours(Object.fromEntries((validations ?? []).map((v: any) => [v.jour, { statut: v.statut, soumis_at: v.soumis_at }])))
    const resultat = data as { programme_valide?: boolean } | null
    setForceMsg({
      type: 'success',
      text: resultat?.programme_valide ? 'Les cinq journées ouvrables sont validées : programme validé.' : 'Journée validée.'
    })
    await load()
  }

  async function invaliderJour(programmeId: string, jour: string) {
    if (!window.confirm(`Invalider la validation du ${JOUR_LABEL[jour as keyof typeof JOUR_LABEL]} ? Le VM pourra à nouveau modifier cette journée.`)) return
    setBusy(programmeId + ':' + jour)
    setForceMsg(null)
    const { error } = await supabase.rpc('invalider_jour_programme', {
      p_programme_id: programmeId, p_jour: jour as any
    })
    if (error) {
      setBusy(null)
      setForceMsg({ type: 'error', text: error.message })
      return
    }
    const { data: validations, error: validationError } = await supabase
      .from('programme_jours_validation')
      .select('jour, statut, soumis_at')
      .eq('programme_id', programmeId)
    setBusy(null)
    if (validationError) {
      setForceMsg({ type: 'error', text: 'Journée invalidée, mais impossible d’actualiser son statut : ' + validationError.message })
      await load()
      return
    }
    setDetailJours(Object.fromEntries((validations ?? []).map((v: any) => [v.jour, { statut: v.statut, soumis_at: v.soumis_at }])))
    setForceMsg({ type: 'success', text: 'Validation annulée. Le VM peut de nouveau modifier cette journée.' })
    await load()
  }

  async function forcerSoumission(programmeId: string) {
    setBusy(programmeId)
    setForceMsg(null)
    const { data, error } = await supabase.rpc('soumettre_programme_hebdomadaire', { p_programme_id: programmeId })
    setBusy(null)
    if (error) { setForceMsg({ type: 'error', text: error.message }); return }
    const res = data as { statut: string; message?: string }
    if (res.statut !== 'SOUMIS') setForceMsg({ type: 'error', text: res.message ?? 'Soumission refusée.' })
    else { setForceMsg({ type: 'success', text: 'Programme soumis en votre nom.' }); load() }
  }

  async function valider(id: string) {
    setBusy(id)
    setForceMsg(null)
    const { error } = await supabase.rpc('valider_programme_hebdomadaire', { p_programme_id: id })
    setBusy(null)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else load()
  }

  async function rejeter(id: string) {
    setBusy(id)
    setForceMsg(null)
    const { error } = await supabase.rpc('rejeter_programme_hebdomadaire', { p_programme_id: id, p_motif: 'À revoir avec votre superviseur.' })
    setBusy(null)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else load()
  }

  async function togglePharmacieUniquement(programmeId: string, actif: boolean) {
    setBusy(programmeId)
    await supabase.rpc('definir_mode_pharmacie_uniquement', { p_programme_id: programmeId, p_actif: !actif })
    setBusy(null)
    load()
  }

  async function choisirProgrammeDerogation(programmeId: string) {
    setDerogProgrammeId(programmeId)
    setDerogClientId('')
    setDerogClients([])
    const vmId = brouillons.find((b) => b.id === programmeId)?.vm_id
    if (!vmId) return
    const { data } = await supabase.from('portefeuille').select('clients(id, nom)').eq('vm_id', vmId).order('client_id')
    setDerogClients(((data ?? []) as unknown as { clients: { id: string; nom: string } | null }[])
      .map((r) => r.clients).filter((c): c is { id: string; nom: string } => !!c))
  }

  async function accorderDerogation() {
    if (!derogProgrammeId || !derogClientId) return
    setDerogBusy(true)
    setForceMsg(null)
    const { error } = await supabase.rpc('accorder_derogation_doublon_client', {
      p_programme_id: derogProgrammeId, p_client_id: derogClientId, p_motif: derogMotif || undefined
    })
    setDerogBusy(false)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else {
      setForceMsg({ type: 'success', text: 'Dérogation accordée : ce client peut désormais être programmé deux fois cette semaine.' })
      setDerogProgrammeId(''); setDerogClientId(''); setDerogMotif(''); setDerogClients([])
    }
  }

  function togglePotentiel(p: Potentiel) {
    setFusionPotentiels((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])
  }

  async function activerFusion() {
    if (fusionPotentiels.length === 0) return
    setFusionBusy(true)
    await supabase.rpc('definir_fusion_secteurs', {
      p_semaine_debut: fusionSemaine, p_potentiels: fusionPotentiels, p_actif: true
    })
    setFusionBusy(false)
    load()
  }

  async function desactiverFusion(f: FusionRow) {
    setBusy(f.id)
    await supabase.from('fusions_secteurs').update({ actif: false }).eq('id', f.id)
    setBusy(null)
    load()
  }

  async function enregistrerDerogationPlanning() {
    if ((!derogVmId && derogCibleType === 'vm') || (!derogEquipeId && derogCibleType === 'equipe') || (!derogZone && !derogPotentiel && !derogGeneralistes) || (derogGeneralistes && derogCibleType !== 'vm')) return
    setDerogPlanningBusy(true)
    setForceMsg(null)
    const { error } = await (supabase as any).rpc('definir_derogation_planning', {
      p_semaine_debut: derogSemaine,
      p_vm_id: derogCibleType === 'vm' ? derogVmId : null,
      p_equipe_id: derogCibleType === 'equipe' ? derogEquipeId : null,
      p_lever_zone: derogZone,
      p_lever_potentiel: derogPotentiel,
      p_actif: true
    })
    setDerogPlanningBusy(false)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else {
      setForceMsg({ type: 'success', text: 'Dérogation de planning enregistrée pour la semaine sélectionnée.' })
      setDerogZone(false); setDerogPotentiel(false); setDerogGeneralistes(false)
      await load()
    }
  }

  async function desactiverDerogationPlanning(d: DerogationPlanningRow) {
    setBusy(d.id)
    const { error } = await (supabase as any).from('derogations_planning').update({ actif: false }).eq('id', d.id)
    setBusy(null)
    if (error) setForceMsg({ type: 'error', text: error.message })
    else await load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  const semainesDisponibles = Array.from(new Set([
    semaineCourante, semaineProchaine,
    ...programmes.map((p) => p.semaine_debut),
    ...brouillons.map((b) => b.semaine_debut)
  ])).sort((a, b) => b.localeCompare(a))
  const programmesSemaine = programmes.filter((p) => p.semaine_debut === semaineSelectionnee)
  const brouillonsSemaine = brouillons.filter((b) => b.semaine_debut === semaineSelectionnee)
  const soumis = programmesSemaine.filter((p) => p.statut === 'SOUMIS')
  const enCours = programmesSemaine.filter((p) => p.statut === 'BROUILLON')
  const autres = programmesSemaine.filter((p) => p.statut !== 'SOUMIS' && p.statut !== 'BROUILLON')
  const valides = programmesSemaine.filter((p) => p.statut === 'VALIDE' || p.statut === 'VERROUILLE').length
  const brouillonsEnRetard = brouillonsSemaine.filter((b) => deadlinePassee(b.semaine_debut))

  const detailPotentiels = POTENTIELS.map((potentiel) => ({
    potentiel,
    total: detailLignes.filter((l) => l.clients?.potentiel === potentiel).length,
  }))
  const detailSpecialites = Object.entries(detailLignes.reduce<Record<string, number>>((acc, ligne) => {
    const specialite = ligne.clients?.specialite
    if (specialite) acc[specialite.replace(/[_-]+/g, ' ')] = (acc[specialite.replace(/[_-]+/g, ' ')] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])
  const demoSamediChadrac = detail?.vm_id === 'd0be68dd-eba0-4b9e-8215-df216d6a7963' && detail.semaine_debut === '2026-11-02'
  const joursDetail = demoSamediChadrac ? [...JOURS, 'SAMEDI'] : JOURS
  const lignesJourActif = detailLignes.filter((l) => l.jour === detailJourActif)
  const potentielsJourActif = POTENTIELS.map((potentiel) => ({
    potentiel,
    total: lignesJourActif.filter((l) => l.clients?.potentiel === potentiel).length,
  }))
  const specialitesJourActif = Object.entries(lignesJourActif.reduce<Record<string, number>>((acc, ligne) => {
    const specialite = ligne.clients?.specialite
    if (specialite) acc[specialite.replace(/[_-]+/g, ' ')] = (acc[specialite.replace(/[_-]+/g, ' ')] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  if (detail) return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setDetail(null)}>← Retour aux programmes</Button>
        <div className="min-w-0 flex-1">
          <h1 className="provisit-page-title">Programme hebdomadaire</h1>
          <p className="text-sm text-ink-500">{detail.profiles?.full_name ?? 'VM/PM'} · Semaine du {dayjs(detail.semaine_debut).format('DD/MM/YYYY')}</p>
        </div>
        <Badge tone={detail.statut === 'VALIDE' || detail.statut === 'VERROUILLE' ? 'success' : detail.statut === 'SOUMIS' ? 'info' : 'warning'}>{detail.statut}</Badge>
      </div>

      {forceMsg && <p className={`rounded-xl px-3.5 py-2.5 text-xs ${forceMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{forceMsg.text}</p>}

      <Card>
        <div className="mb-4">
          <h2 className="text-base font-bold text-ink-800">Récapitulatif hebdomadaire</h2>
          <p className="text-xs text-ink-400">{detailLignes.length} client(s) programmé(s) sur la semaine</p>
        </div>
        {detail.programme_conformite?.length > 0 && <div className="mb-4 flex flex-wrap gap-1.5">{detail.programme_conformite.map((x) => <Badge key={x.cible} tone={x.statut === 'CONFORME' ? 'success' : x.statut === 'SOUS_COUVERT' ? 'warning' : 'info'}>{x.cible.replace(/_/g, ' ')} : {x.quantite_programmee}/{x.quota_attendu}</Badge>)}</div>}
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Répartition par potentiel</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {detailPotentiels.map((x) => <div key={x.potentiel} className="rounded-xl border border-ink-100 p-3"><p className="text-xs text-ink-500">{x.potentiel === 'G+' ? 'Très gros potentiel (G+)' : x.potentiel === 'G+' ? 'Très gros potentiel (G+)' : x.potentiel === 'GROS' ? 'Gros potentiel' : x.potentiel === 'MOYEN' ? 'Potentiel moyen' : 'Faible potentiel'}</p><p className="mt-1 text-xl font-extrabold text-ink-800">{x.total}</p><p className="text-[11px] text-ink-400">clients programmés</p></div>)}
        </div>
        <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-ink-500">Programmé / objectif par spécialité</p>{detailEquipeNom && <span className="rounded-full bg-royal-50 px-2.5 py-1 text-[10px] font-semibold text-royal-700">Équipe {detailEquipeNom}</span>}</div>
        {detailQuotas.length > 0 ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{detailQuotas.map((q) => {
          const specialitesCible: Record<string, string[]> = {
            MEDECINS_GENERALISTES: ['GENERALISTE'], DISPENSAIRES: ['DISPENSAIRE'], MATERNITES: ['MATERNITE'],
            PEDIATRES: ['PEDIATRE'], GYNECOLOGUES: ['GYNECOLOGUE'], PHARMACIES: ['PHARMACIE'],
            CARDIOLOGUES: ['CARDIOLOGUE'], AUTRES_SPECIALITES: ['ORL', 'RHUMATOLOGUE', 'AUTRE_SPECIALITE']
          }
          const spec = specialitesCible[q.cible] ?? []
          const programme = detailLignes.filter((l) => !!l.clients?.specialite && spec.includes(l.clients.specialite)).length
          const atteint = q.quota_hebdomadaire > 0 && programme >= q.quota_hebdomadaire
          return <div key={q.cible} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2"><span className="min-w-0 text-xs text-ink-600">{q.libelle}</span><span className={`shrink-0 text-sm font-extrabold tabular-nums ${atteint ? 'text-emerald-700' : 'text-ink-800'}`}>{programme}/{q.quota_hebdomadaire}</span></div>
        })}</div> : detailSpecialites.length === 0 ? <p className="text-xs text-ink-400">Aucune spécialité renseignée.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{detailSpecialites.map(([nom, n]) => <div key={nom} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2"><span className="text-xs text-ink-600">{nom}</span><span className="text-sm font-bold text-ink-800">{n}</span></div>)}</div>}
      </Card>

      <div>
        <p className="mb-2 text-sm font-bold text-ink-700">Détail par journée</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {joursDetail.map((j) => {
            const count = detailLignes.filter((l) => l.jour === j).length
            const statut = detailJours[j]?.statut ?? 'EN_COURS'
            return <button key={j} onClick={() => setDetailJourActif(j)} className={`min-w-[108px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${detailJourActif === j ? 'border-royal-500 bg-royal-50 text-royal-700 ring-2 ring-royal-100' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'}`}>
              <span className="block text-xs font-bold">{JOUR_LABEL[j]}</span><span className="mt-1 block text-[11px]">{count} client(s)</span><span className="mt-1 block text-[10px]">{statut === 'VALIDE' ? '✓ Validée' : statut === 'SOUMIS' ? 'Soumise' : 'En cours'}</span>
            </button>
          })}
        </div>
      </div>

      {profile?.role === 'admin' && demoSamediChadrac && detailJourActif === 'SAMEDI' && detail.statut === 'BROUILLON' && detailJours.SAMEDI?.statut !== 'VALIDE' && (
        <Card className="border border-royal-200 bg-royal-50/40">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-ink-800">Planifier les visites du samedi — Chadrac</h2>
            <p className="mt-1 text-xs text-ink-500">Choisis un client actif de son portefeuille (secteur A). Les contrôles de la base restent appliqués lors de l’ajout.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={samediClientId} onChange={(e) => setSamediClientId(e.target.value)} onFocus={() => { if (samediClients.length === 0 && !samediLoading) void chargerClientsSamedi(detail) }}
              className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm">
              <option value="">{samediLoading ? 'Chargement du portefeuille…' : 'Sélectionner un client…'}</option>
              {samediClients.map((client) => <option key={client.id} value={client.id}>{client.nom} · {client.potentiel}</option>)}
            </select>
            <Button size="sm" loading={samediSaving} disabled={!samediClientId || samediSaving} onClick={ajouterClientSamedi}>Ajouter la visite</Button>
          </div>
          {samediClients.length === 0 && !samediLoading && <p className="mt-2 text-[11px] text-ink-400">Ouvre la liste pour charger les clients disponibles.</p>}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-bold text-ink-800">{JOUR_LABEL[detailJourActif]}</h2><p className="text-xs text-ink-400">{lignesJourActif.length} client(s) programmé(s)</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={detailJours[detailJourActif]?.statut === 'VALIDE' ? 'success' : detailJours[detailJourActif]?.statut === 'SOUMIS' ? 'info' : 'warning'}>{detailJours[detailJourActif]?.statut === 'VALIDE' ? 'Journée validée' : detailJours[detailJourActif]?.statut === 'SOUMIS' ? 'Soumise' : 'En cours / non soumise'}</Badge>
            {profile?.role === 'admin' && detailJours[detailJourActif]?.statut === 'VALIDE' && <Button size="sm" variant="secondary" loading={busy === detail.id + ':' + detailJourActif} onClick={() => void invaliderJour(detail.id, detailJourActif)}>Invalider cette journée</Button>}
            {(profile?.role === 'admin' || profile?.role === 'superviseur') && detailJours[detailJourActif]?.statut !== 'VALIDE' && lignesJourActif.length > 0 && <Button size="sm" variant="secondary" loading={busy === detail.id + ':' + detailJourActif} onClick={() => void validerJour(detail.id, detailJourActif)}>Valider cette journée</Button>}
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Récapitulatif par potentiel</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {potentielsJourActif.map((x) => <div key={x.potentiel} className="rounded-xl border border-ink-100 p-3"><p className="text-xs text-ink-500">{x.potentiel === 'G+' ? 'Très gros potentiel (G+)' : x.potentiel === 'GROS' ? 'Gros potentiel' : x.potentiel === 'MOYEN' ? 'Potentiel moyen' : 'Faible potentiel'}</p><p className="mt-1 text-xl font-extrabold text-ink-800">{x.total}</p><p className="text-[11px] text-ink-400">clients programmés</p></div>)}
          </div>
          <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Récapitulatif par spécialité</p>
          {specialitesJourActif.length === 0 ? <p className="text-xs text-ink-400">Aucune spécialité renseignée pour cette journée.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{specialitesJourActif.map(([nom, n]) => <div key={nom} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2"><span className="text-xs text-ink-600">{nom}</span><span className="text-sm font-bold text-ink-800">{n}</span></div>)}</div>}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-bold text-ink-800">Liste des clients — {JOUR_LABEL[detailJourActif]}</h2><Badge tone="neutral">{lignesJourActif.length}</Badge></div>
        {detailLoading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : lignesJourActif.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">Aucun client programmé pour cette journée.</p> : <div className="space-y-2">{lignesJourActif.map((l) => <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3.5 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{l.clients?.nom ?? 'Client'}</p><p className="truncate text-[11px] text-ink-500">{l.clients?.centre || l.clients?.specialite || 'Spécialité non renseignée'} · {l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</p></div>{l.clients?.potentiel && <PotentielBadge potentiel={l.clients.potentiel as Potentiel} compact />}</div>)}</div>}
      </Card>
    </div>
  )

  return (
    <div className="space-y-6 pb-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Pilotage opérationnel</p><h1 className="provisit-page-title mt-1">Validation des programmes</h1>
        <p className="mt-1 text-sm text-ink-400">Examinez les programmes hebdomadaires et validez les journées de vos équipes.</p>
      </div>

      {forceMsg && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${forceMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {forceMsg.text}
        </p>
      )}

      <Card className="border border-ink-100 bg-white shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink-800">Navigation par semaine</h2>
            <p className="text-xs text-ink-400">Les brouillons, validations et délais affichés ci-dessous correspondent à la semaine choisie.</p>
          </div>
          <Badge tone="info">{programmesSemaine.length} programme(s)</Badge>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {semainesDisponibles.map((semaine) => (
            <button key={semaine} type="button" onClick={() => setSemaineSelectionnee(semaine)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${semaineSelectionnee === semaine ? 'border-royal-600 bg-royal-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'}`}>
              Semaine du {dayjs(semaine).format('DD/MM/YYYY')}
            </button>
          ))}
        </div>
      </Card>

      {brouillonsEnRetard.length > 0 && (
        <div>
          <p className="text-sm font-bold text-flame-700 mb-3 flex items-center gap-2">
            <IconAlert className="h-4 w-4" /> Programmes bloqués — délai de soumission dépassé ({brouillonsEnRetard.length})
          </p>
          <div className="space-y-2">
            {brouillonsEnRetard.map((b) => (
              <Card key={b.id} className="border border-flame-200 bg-flame-50/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-800">{b.profiles?.full_name}</p>
                    <p className="text-xs text-ink-500">
                      Semaine du {dayjs(b.semaine_debut).format('DD/MM/YYYY')} — resté en brouillon, le VM n'a pas pu soumettre à temps.
                    </p>
                  </div>
                  {profile?.role === 'admin' ? (
                    <Button size="sm" variant="secondary" loading={busy === b.id} icon={<IconSend className="h-3.5 w-3.5" />} onClick={() => forcerSoumission(b.id)}>
                      Soumettre en son nom
                    </Button>
                  ) : (
                    <span className="text-[11px] text-ink-400">Contactez l'administrateur</span>
                  )}
                </div>
                {(profile?.role === 'admin' || profile?.role === 'superviseur') && (
                  delaiActif(b) ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-flame-200 pt-3">
                      <p className="text-xs font-semibold text-emerald-700">
                        Délai supplémentaire accordé jusqu'au {dayjs(b.delai_supplementaire_jusqu_a).format('DD/MM/YYYY HH:mm')} — le VM peut encore soumettre lui-même.
                      </p>
                      <Button size="sm" variant="danger" loading={busy === b.id} onClick={() => retirerDelai(b.id)}>
                        Retirer le délai
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-flame-200 pt-3">
                      <label className="text-xs text-ink-500">Ou donner un délai supplémentaire jusqu'au :</label>
                      <input
                        type="datetime-local"
                        value={delaiValeur[b.id] ?? ''}
                        onChange={(e) => setDelaiValeur((cur) => ({ ...cur, [b.id]: e.target.value }))}
                        className="rounded-xl border border-ink-200 px-3 py-1.5 text-xs outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                      />
                      <Button size="sm" variant="secondary" loading={busy === b.id} disabled={!delaiValeur[b.id]} onClick={() => accorderDelai(b.id)}>
                        Accorder
                      </Button>
                    </div>
                  )
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="En attente" value={soumis.length} tone="flame" icon={<IconClock className="h-4 w-4" />} />
        <StatCard label="Validés" value={valides} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Total récent" value={programmes.length} tone="royal" icon={<IconCalendar className="h-4 w-4" />} />
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">En attente de validation ({soumis.length})</p>
        {soumis.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Rien à valider pour le moment.</Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {soumis.map((p) => (
              <Card key={p.id} className="border border-ink-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink-800">{p.profiles?.full_name}</p>
                    <p className="provisit-page-subtitle">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')} · soumis le {dayjs(p.soumis_at).format('DD/MM HH:mm')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => ouvrirDetail(p)} className="rounded-full p-2 bg-royal-50 text-royal-600 hover:bg-royal-100 transition"><IconEye className="h-4 w-4" /></button>
                    <button onClick={() => rejeter(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"><IconX className="h-4 w-4" /></button>
                    <button onClick={() => valider(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition disabled:opacity-50"><IconCheckCircle className="h-4 w-4" /></button>
                  </div>
                </div>
                {p.programme_conformite?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.programme_conformite.map((c) => (
                      <Badge key={c.cible} tone={c.statut === 'CONFORME' ? 'success' : c.statut === 'SOUS_COUVERT' ? 'warning' : 'info'}>
                        {c.cible.replace(/_/g, ' ')}: {c.quantite_programmee}/{c.quota_attendu}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Programmes en cours de programmation ({enCours.length})</p>
        {enCours.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-5">Aucun programme en cours de programmation.</Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {enCours.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-800 truncate">{p.profiles?.full_name}</p>
                    <p className="text-xs text-ink-500">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')}</p>
                    <p className="mt-1 text-[11px] text-amber-700">Brouillon — le VM/PM peut encore programmer ses journées.</p>
                  </div>
                  <Button size="sm" variant="secondary" icon={<IconEye className="h-3.5 w-3.5" />} onClick={() => ouvrirDetail(p)}>
                    Ouvrir
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Historique récent</p>
        {autres.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Aucun programme dans l'historique récent.</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                    <th className="px-4 py-3 text-left font-semibold">Visiteur médical</th>
                    <th className="px-4 py-3 text-left font-semibold">Semaine</th>
                    <th className="px-4 py-3 text-left font-semibold">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {autres.map((p) => (
                    <tr key={p.id} className="cursor-pointer transition hover:bg-ink-50/60" onClick={() => ouvrirDetail(p)}>
                      <td className="px-4 py-3 font-semibold text-ink-800">{p.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-ink-500">{dayjs(p.semaine_debut).format('DD/MM/YYYY')}</td>
                      <td className="px-4 py-3"><Badge tone={p.statut === 'VERROUILLE' ? 'info' : 'success'}>{p.statut}</Badge></td>
                      <td className="px-4 py-3 text-right"><IconEye className="h-4 w-4 text-ink-300 inline-block" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <IconPill className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold text-ink-800">Semaines pharmacie uniquement</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">
            Active ou désactive le mode "pharmacie uniquement" pour les brouillons de la semaine sélectionnée.
          </p>
          {brouillonsSemaine.length === 0 ? (
            <p className="text-xs text-ink-400 py-2">Aucun programme en brouillon pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {brouillonsSemaine.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl bg-ink-50 p-2.5">
                  <div>
                    <p className="text-xs font-semibold text-ink-800">{b.profiles?.full_name}</p>
                    <p className="text-[10px] text-ink-400">Semaine du {dayjs(b.semaine_debut).format('DD/MM/YYYY')}</p>
                  </div>
                  <Button
                    size="sm" variant={b.mode_pharmacie_uniquement ? 'success' : 'secondary'}
                    loading={busy === b.id}
                    onClick={() => togglePharmacieUniquement(b.id, b.mode_pharmacie_uniquement)}
                  >
                    {b.mode_pharmacie_uniquement ? 'Activé' : 'Activer'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-1">
            <IconUsers className="h-4 w-4 text-royal-600" />
            <p className="text-sm font-bold text-ink-800">Fusion stratégique de secteurs</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">
            Lève temporairement le verrouillage sectoriel pour un ou plusieurs potentiels, sur une semaine donnée.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Semaine (lundi)</label>
              <input
                type="date" value={fusionSemaine} onChange={(e) => setFusionSemaine(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Potentiels concernés</label>
              <div className="flex gap-2">
                {POTENTIELS.map((p) => (
                  <button
                    key={p} type="button" onClick={() => togglePotentiel(p)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      fusionPotentiels.includes(p) ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" loading={fusionBusy} onClick={activerFusion}>Activer la fusion</Button>
          </div>

          {fusions.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-3">
              {fusions.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-600">
                    {dayjs(f.semaine_debut).format('DD/MM/YYYY')} — {f.potentiels.join(', ')}
                  </span>
                  {f.actif ? (
                    <button onClick={() => desactiverFusion(f)} disabled={busy === f.id} className="text-flame-600 font-semibold hover:underline">
                      Désactiver
                    </button>
                  ) : (
                    <Badge tone="neutral">Inactive</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {profile?.role === 'admin' && (
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <IconCheckCircle className="h-4 w-4 text-royal-600" />
            <p className="text-sm font-bold text-ink-800">Dérogations de planning par semaine</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">
            Autorise un VM ou une équipe à programmer hors zone/portefeuille, à lever les contraintes de potentiel, ou les deux, uniquement pour la semaine choisie.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Semaine (lundi)</label>
              <input type="date" value={derogSemaine} onChange={(e) => e.target.value && setDerogSemaine(isoWeekMonday(dayjs(e.target.value)).format('YYYY-MM-DD'))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Portée</label>
              <select value={derogCibleType} onChange={(e) => setDerogCibleType(e.target.value as 'vm' | 'equipe')}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">
                <option value="vm">Un visiteur médical</option><option value="equipe">Une équipe</option>
              </select>
            </div>
            {derogCibleType === 'vm' ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical</label>
                <select value={derogVmId} onChange={(e) => setDerogVmId(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">
                  <option value="">Sélectionner…</option>{vmOptions.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
                <select value={derogEquipeId} onChange={(e) => setDerogEquipeId(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">
                  <option value="">Sélectionner…</option>{equipeOptions.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 rounded-xl border border-ink-100 p-3 text-xs text-ink-700">
              <input type="checkbox" checked={derogZone} onChange={(e) => setDerogZone(e.target.checked)} />
              Lever la contrainte de zone / portefeuille
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-ink-100 p-3 text-xs text-ink-700">
              <input type="checkbox" checked={derogPotentiel} onChange={(e) => setDerogPotentiel(e.target.checked)} />
              Lever les contraintes GROS / MOYEN / FAIBLE
            </label>
          </div>
          <div className="mt-3"><Button size="sm" loading={derogPlanningBusy}
            disabled={(!derogVmId && derogCibleType === 'vm') || (!derogEquipeId && derogCibleType === 'equipe') || (!derogZone && !derogPotentiel && !derogGeneralistes) || (derogGeneralistes && derogCibleType !== 'vm')}
            onClick={enregistrerDerogationPlanning}>Enregistrer la dérogation</Button></div>
          {derogationsPlanning.length > 0 && <div className="mt-4 space-y-2 border-t border-ink-100 pt-3">
            {derogationsPlanning.filter((d) => d.semaine_debut === semaineSelectionnee).map((d) => {
              const vm = vmOptions.find((v) => v.id === d.vm_id)
              const equipe = equipeOptions.find((e) => e.id === d.equipe_id)
              return <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-3">
                <div className="min-w-0"><p className="text-xs font-semibold text-ink-800">{vm?.full_name ?? equipe?.nom ?? 'Cible'}</p>
                  <p className="text-[11px] text-ink-500">{[d.specialite_autorisee ? `Spécialité : ${d.specialite_autorisee}` : null, d.lever_zone ? 'Zone' : null, d.lever_potentiel ? 'Potentiels' : null].filter(Boolean).join(' + ')} · {d.actif ? 'Active' : 'Inactive'}</p></div>
                {d.actif ? <button onClick={() => desactiverDerogationPlanning(d)} disabled={busy === d.id} className="text-xs font-semibold text-flame-600">Désactiver</button> : <Badge tone="neutral">Inactive</Badge>}
              </div>
            })}
          </div>}
        </Card>
      )}

      {profile?.role === 'admin' && (
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <IconCheckCircle className="h-4 w-4 text-royal-600" />
            <p className="text-sm font-bold text-ink-800">Dérogation doublon client</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">
            Autorise exceptionnellement un client à être programmé deux fois dans la même semaine pour un VM.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Programme (VM · semaine)</label>
              <select
                value={derogProgrammeId} onChange={(e) => choisirProgrammeDerogation(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              >
                <option value="">Sélectionner…</option>
                {brouillons.map((b) => (
                  <option key={b.id} value={b.id}>{b.profiles?.full_name} · {dayjs(b.semaine_debut).format('DD/MM/YYYY')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Client</label>
              <select
                value={derogClientId} onChange={(e) => setDerogClientId(e.target.value)}
                disabled={!derogProgrammeId} required
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100 disabled:opacity-50"
              >
                <option value="">Sélectionner…</option>
                {derogClients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Motif (optionnel)</label>
              <input
                value={derogMotif} onChange={(e) => setDerogMotif(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" loading={derogBusy} disabled={!derogProgrammeId || !derogClientId} onClick={accorderDerogation}>
              Accorder la dérogation
            </Button>
          </div>
        </Card>
      )}

    </div>
  )
}
