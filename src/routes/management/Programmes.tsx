import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconCheckCircle, IconX, IconClock, IconCalendar, IconPill, IconUsers, IconAlert, IconSend } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday, nowBenin, deadlineSoumission } from '@/lib/time'
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
  profiles: { full_name: string } | null
}

interface FusionRow {
  id: string
  semaine_debut: string
  potentiels: string[]
  actif: boolean
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

  async function load() {
    const semaineProchaine = isoWeekMonday(nowBenin().add(1, 'week')).format('YYYY-MM-DD')
    const semaineCourante = isoWeekMonday().format('YYYY-MM-DD')
    const [{ data }, { data: br }, { data: fu }] = await Promise.all([
      supabase
        .from('programmes_hebdomadaires')
        .select('*, profiles(full_name), programme_conformite(cible, quota_attendu, quantite_programmee, statut)')
        .in('statut', ['SOUMIS', 'VALIDE', 'VERROUILLE'])
        .order('soumis_at', { ascending: false })
        .limit(30),
      supabase
        .from('programmes_hebdomadaires')
        .select('id, semaine_debut, mode_pharmacie_uniquement, vm_id, profiles(full_name)')
        .eq('statut', 'BROUILLON')
        .in('semaine_debut', [semaineCourante, semaineProchaine]),
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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const deadlinePassee = (semaineDebut: string) => nowBenin().isAfter(deadlineSoumission(semaineDebut))

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
    const { error } = await supabase.rpc('valider_programme_hebdomadaire', { p_programme_id: id })
    setBusy(null)
    if (!error) load()
  }

  async function rejeter(id: string) {
    setBusy(id)
    const { error } = await supabase.rpc('rejeter_programme_hebdomadaire', { p_programme_id: id, p_motif: 'À revoir avec votre superviseur.' })
    setBusy(null)
    if (!error) load()
  }

  async function togglePharmacieUniquement(programmeId: string, actif: boolean) {
    setBusy(programmeId)
    await supabase.rpc('definir_mode_pharmacie_uniquement', { p_programme_id: programmeId, p_actif: !actif })
    setBusy(null)
    load()
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Validation des programmes</h1>
        <p className="text-sm text-ink-400">Programmes hebdomadaires soumis par les visiteurs médicaux</p>
      </div>

      {brouillonsEnRetard.length > 0 && (
        <div>
          <p className="text-sm font-bold text-flame-700 mb-3 flex items-center gap-2">
            <IconAlert className="h-4 w-4" /> Programmes bloqués — délai de soumission dépassé ({brouillonsEnRetard.length})
          </p>
          <div className="space-y-2">
            {brouillonsEnRetard.map((b) => (
              <Card key={b.id} className="flex items-center justify-between border border-flame-200 bg-flame-50/50">
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
              </Card>
            ))}
          </div>
          {forceMsg && (
            <p className={`mt-2 text-xs rounded-xl px-3.5 py-2.5 ${forceMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {forceMsg.text}
            </p>
          )}
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
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink-800">{p.profiles?.full_name}</p>
                    <p className="text-xs text-ink-400">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')} · soumis le {dayjs(p.soumis_at).format('DD/MM HH:mm')}</p>
                  </div>
                  <div className="flex gap-2">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {autres.map((p) => (
                    <tr key={p.id} className="transition hover:bg-ink-50/60">
                      <td className="px-4 py-3 font-semibold text-ink-800">{p.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-ink-500">{dayjs(p.semaine_debut).format('DD/MM/YYYY')}</td>
                      <td className="px-4 py-3"><Badge tone={p.statut === 'VERROUILLE' ? 'info' : 'success'}>{p.statut}</Badge></td>
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
    </div>
  )
}
