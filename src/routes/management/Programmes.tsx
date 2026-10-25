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
  profiles: { full_name: string } | null
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

interface JourValidationRow { jour: string; statut: string; valide_at: string | null; date_limite: string | null }

interface LigneRow {
  id: string
  jour: string
  type_visite: string
  clients: { id: string; nom: string; potentiel: string; specialite: string | null; centre: string | null } | null
}

type Potentiel = 'GROS' | 'MOYEN' | 'FAIBLE'
const POTENTIELS: Potentiel[] = ['GROS', 'MOYEN', 'FAIBLE']

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

  const [detail, setDetail] = useState<ProgrammeRow | null>(null)
  const [detailLignes, setDetailLignes] = useState<LigneRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [jourDetail, setJourDetail] = useState<string>('LUNDI')
  const [validationsJour, setValidationsJour] = useState<JourValidationRow[]>([])
  const [validationJourBusy, setValidationJourBusy] = useState<string | null>(null)

  const [delaiValeur, setDelaiValeur] = useState<Record<string, string>>({})

  const [derogProgrammeId, setDerogProgrammeId] = useState('')
  const [derogClients, setDerogClients] = useState<{ id: string; nom: string }[]>([])
  const [derogClientId, setDerogClientId] = useState('')
  const [derogMotif, setDerogMotif] = useState('')
  const [derogBusy, setDerogBusy] = useState(false)

  async function load() {
    const semaineProchaine = isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD')
    const semaineCourante = isoWeekMonday().format('YYYY-MM-DD')
    const [{ data }, { data: br }, { data: fu }] = await Promise.all([
      supabase
        .from('programmes_hebdomadaires')
        .select('*, profiles!programmes_hebdomadaires_vm_id_fkey(full_name), programme_conformite(cible, quota_attendu, quantite_programmee, statut)')
        .in('statut', ['SOUMIS', 'VALIDE', 'VERROUILLE'])
        .order('soumis_at', { ascending: false })
        .limit(30),
      supabase
        .from('programmes_hebdomadaires')
        .select('id, semaine_debut, mode_pharmacie_uniquement, vm_id, delai_supplementaire_jusqu_a, profiles!programmes_hebdomadaires_vm_id_fkey(full_name)')
        .eq('statut', 'BROUILLON')
        .eq('semaine_debut', semaineProchaine),
      supabase.from('fusions_secteurs').select('*').order('created_at', { ascending: false }).limit(10)
    ])
    setProgrammes((data as unknown as ProgrammeRow[]) ?? [])
    setBrouillons((br as unknown as BrouillonRow[]) ?? [])
    setFusions((fu as unknown as FusionRow[]) ?? [])
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programme_lignes' }, load)
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

  async function ouvrirDetail(p: ProgrammeRow) {
    setDetail(p)
    setJourDetail('LUNDI')
    setDetailLoading(true)
    setDetailLignes([])
    const [{ data }, { data: validations }] = await Promise.all([
      supabase.from('programme_lignes')
        .select('id, jour, type_visite, clients(id, nom, potentiel, specialite, centre)')
        .eq('programme_id', p.id).order('ordre'),
      (supabase as any).from('programme_jours_validation')
        .select('jour, statut, valide_at, date_limite').eq('programme_id', p.id)
    ])
    setDetailLignes((data as unknown as LigneRow[]) ?? [])
    setValidationsJour((validations as JourValidationRow[]) ?? [])
    setDetailLoading(false)
  }

  async function validerJour(jour: string) {
    if (!detail || validationJourBusy) return
    setValidationJourBusy(jour)
    setForceMsg(null)
    const { data, error } = await (supabase as any).rpc('valider_jour_programme', {
      p_programme_id: detail.id, p_jour: jour, p_date_limite: null
    })
    setValidationJourBusy(null)
    if (error) { setForceMsg({ type: 'error', text: error.message }); return }
    const { data: validations } = await supabase.from('programme_jours_validation')
      .select('jour, statut, valide_at, date_limite').eq('programme_id', detail.id)
    setValidationsJour((validations as JourValidationRow[]) ?? [])
    const result = data as { programme_valide?: boolean }
    setForceMsg({ type: 'success', text: result.programme_valide ? 'Les cinq journées sont validées : programme validé.' : 'Journée validée.' })
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
    // definir_fusion_secteurs() n'insère que de nouvelles lignes : fusion_active() vérifie
    // l'existence d'une ligne actif=true pour la semaine, donc désactiver revient à mettre
    // à jour la ligne existante directement (RLS déjà restreinte à superviseur/admin).
    setBusy(f.id)
    await supabase.from('fusions_secteurs').update({ actif: false }).eq('id', f.id)
    setBusy(null)
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  const soumis = programmes.filter((p) => p.statut === 'SOUMIS')
  const autres = programmes.filter((p) => p.statut !== 'SOUMIS')
  const valides = programmes.filter((p) => p.statut === 'VALIDE' || p.statut === 'VERROUILLE').length
  const brouillonsEnRetard = brouillons.filter((b) => deadlinePassee(b.semaine_debut))

  if (detail) {
    const lignesJour = detailLignes.filter((l) => l.jour === jourDetail)
    const nombreMedical = detailLignes.filter((l) => l.type_visite === 'MEDICAL').length
    const nombrePharmacie = detailLignes.filter((l) => l.type_visite !== 'MEDICAL').length
    return (
      <div className="space-y-5">
        <button onClick={() => setDetail(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-royal-600 hover:text-royal-800">
          ← Retour aux programmes
        </button>
        <div className="rounded-2xl bg-gradient-to-r from-royal-700 to-royal-500 p-5 sm:p-7 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Programme hebdomadaire · {detail.statut}</p>
          <h1 className="mt-2 text-2xl font-bold">{detail.profiles?.full_name ?? 'Visiteur médical'}</h1>
          <p className="mt-1 text-sm text-white/80">Semaine du {dayjs(detail.semaine_debut).format('DD/MM/YYYY')}</p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
            <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{detailLignes.length}</p><p className="text-xs text-white/75">Visites prévues</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{nombreMedical}</p><p className="text-xs text-white/75">Médicales</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{nombrePharmacie}</p><p className="text-xs text-white/75">Pharmacies</p></div>
          </div>
        </div>
        {detail.programme_conformite?.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {detail.programme_conformite.map((c) => (
              <Card key={c.cible}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-ink-600">{c.cible.replace(/_/g, ' ')}</p>
                  <Badge tone={c.statut === 'CONFORME' ? 'success' : c.statut === 'SOUS_COUVERT' ? 'warning' : 'info'}>{c.quantite_programmee}/{c.quota_attendu}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-ink-800">Programme jour par jour</h2>
          <p className="text-sm text-ink-400">Sélectionnez un jour pour consulter les clients programmés.</p>
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {JOURS.map((j) => {
            const count = detailLignes.filter((l) => l.jour === j).length
            const dayValidation = validationsJour.find((v) => v.jour === j && v.statut === 'VALIDE')
            return <button key={j} onClick={() => setJourDetail(j)} className={`rounded-xl border px-1 py-3 text-center transition ${jourDetail === j ? 'border-royal-600 bg-royal-600 text-white shadow-sm' : 'border-ink-100 bg-white text-ink-600 hover:border-royal-300'}`}>
              <span className="block text-[11px] sm:text-xs font-semibold">{JOUR_LABEL[j].slice(0, 3)}</span>
              <span className="mt-1 block text-lg font-bold">{count}</span>
              <span className="block text-[10px] opacity-75">{dayValidation ? '✓ Validée' : 'À valider'}</span>
            </button>
          })}
        </div>
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-bold text-ink-800">{JOUR_LABEL[jourDetail]}</h3><p className="text-xs text-ink-400">{lignesJour.length} visite(s) programmée(s)</p></div>
            <Badge tone={validationsJour.some((v) => v.jour === jourDetail && v.statut === 'VALIDE') ? 'success' : 'info'}>{validationsJour.some((v) => v.jour === jourDetail && v.statut === 'VALIDE') ? 'Validée' : 'En attente'}</Badge>
          </div>
          {lignesJour.length > 0 && <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-ink-50 p-3"><p className="text-lg font-bold">{lignesJour.length}</p><p className="text-[11px] text-ink-500">Visites prévues</p></div>
            <div className="rounded-xl bg-ink-50 p-3"><p className="text-lg font-bold">{lignesJour.filter((l) => l.type_visite === 'MEDICAL').length}</p><p className="text-[11px] text-ink-500">Médicales</p></div>
            <div className="rounded-xl bg-ink-50 p-3"><p className="text-lg font-bold">{lignesJour.filter((l) => l.type_visite !== 'MEDICAL').length}</p><p className="text-[11px] text-ink-500">Pharmacies</p></div>
            <div className="rounded-xl bg-ink-50 p-3"><p className="text-lg font-bold">{lignesJour.filter((l) => l.clients?.potentiel === 'GROS').length}/{lignesJour.filter((l) => l.clients?.potentiel === 'MOYEN').length}/{lignesJour.filter((l) => l.clients?.potentiel === 'FAIBLE').length}</p><p className="text-[11px] text-ink-500">Gros / Moyen / Faible</p></div>
          </div>}
          {detailLoading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> :
            lignesJour.length === 0 ? <p className="py-8 text-center text-sm text-ink-400">Aucun client programmé pour ce jour.</p> :
            <div className="space-y-2">{lignesJour.map((l, index) => <div key={l.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-sm font-bold text-royal-700">{index + 1}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-ink-800">{l.clients?.nom ?? 'Client non renseigné'}</p><p className="mt-0.5 text-xs text-ink-400">{l.clients?.centre || l.clients?.specialite || 'Centre non renseigné'}</p><p className="mt-1 text-xs text-ink-500">{l.type_visite === 'MEDICAL' ? 'Visite médicale' : 'Visite pharmacie'}</p></div>
              {l.clients?.potentiel && <PotentielBadge potentiel={l.clients.potentiel as 'GROS' | 'MOYEN' | 'FAIBLE'} compact />}
            </div>)}</div>
          }
          {profile?.role === 'admin' && lignesJour.length > 0 && !validationsJour.some((v) => v.jour === jourDetail && v.statut === 'VALIDE') && (
            <div className="mt-5 border-t border-ink-100 pt-4">
              <Button loading={validationJourBusy === jourDetail} disabled={validationJourBusy !== null || detailLoading} onClick={() => validerJour(jourDetail)} fullWidth>
                Valider la journée du {JOUR_LABEL[jourDetail]}
              </Button>
              <p className="mt-2 text-center text-[11px] text-ink-400">La validation vérifie aussi les quotas de potentiel du jour.</p>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Validation des programmes</h1>
        <p className="text-sm text-ink-400">Programmes hebdomadaires soumis par les visiteurs médicaux</p>
      </div>

      {forceMsg && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${forceMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {forceMsg.text}
        </p>
      )}

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
                {profile?.role === 'admin' && (
                  delaiActif(b) ? (
                    <p className="mt-3 text-xs font-semibold text-emerald-700 border-t border-flame-200 pt-3">
                      Délai supplémentaire accordé jusqu'au {dayjs(b.delai_supplementaire_jusqu_a).format('DD/MM/YYYY HH:mm')} — le VM peut encore soumettre lui-même.
                    </p>
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
        <p className="text-sm font-bold text-ink-600 mb-3">Programmations en cours — semaine du {dayjs(isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD')).format('DD/MM/YYYY')} ({brouillons.length})</p>
        {brouillons.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-5">Aucun brouillon pour la semaine prochaine pour le moment.</Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {brouillons.map((b) => (
              <Card key={b.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-800 truncate">{b.profiles?.full_name}</p>
                    <p className="text-xs text-ink-400">Semaine du {dayjs(b.semaine_debut).format('DD/MM/YYYY')} · Brouillon en cours</p>
                  </div>
                  <Button size="sm" variant="secondary" icon={<IconEye className="h-4 w-4" />} onClick={() => ouvrirDetail({
                    id: b.id, vm_id: b.vm_id, semaine_debut: b.semaine_debut, statut: 'BROUILLON',
                    soumis_at: null, mode_pharmacie_uniquement: b.mode_pharmacie_uniquement,
                    profiles: b.profiles, programme_conformite: []
                  })}>Voir le programme</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">En attente de validation ({soumis.length})</p>
        {soumis.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Rien à valider pour le moment.</Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {soumis.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink-800">{p.profiles?.full_name}</p>
                    <p className="text-xs text-ink-400">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')} · soumis le {dayjs(p.soumis_at).format('DD/MM HH:mm')}</p>
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
            Bascule un programme en brouillon (semaine en cours ou prochaine) en mode "pharmacie uniquement".
          </p>
          {brouillons.length === 0 ? (
            <p className="text-xs text-ink-400 py-2">Aucun programme en brouillon pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {brouillons.map((b) => (
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
