import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconClock, IconTrendingUp, IconCheck, IconUsers } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Parametre = Database['public']['Tables']['parametres']['Row']
type FieldType = 'time' | 'day' | 'percentage' | 'number' | 'boolean' | 'json'

type FieldMeta = { key: string; label: string; type: FieldType }
type Group = {
  title: string
  description: string
  icon: typeof IconCalendar
  tone: 'royal' | 'flame' | 'emerald'
  fields: FieldMeta[]
  custom?: boolean
}

type QuotaCible = Database['public']['Tables']['quotas_cibles']['Row']
type PoidsSpecialite = Database['public']['Tables']['poids_specialite_visite']['Row']
type Specialite = Database['public']['Enums']['specialite_client']
type Equipe = Database['public']['Tables']['equipes']['Row']

const GROUPS: Group[] = [
  {
    title: 'Programme hebdomadaire',
    description: 'Règles de constitution et de soumission du planning hebdomadaire.',
    icon: IconCalendar,
    tone: 'royal',
    fields: [
      { key: 'jour_limite_soumission_programme', label: 'Jour limite de soumission', type: 'day' },
      { key: 'heure_limite_soumission_programme', label: 'Heure limite de soumission', type: 'time' },
      { key: 'seuil_faible_jeudi_pourcentage_max', label: 'Part max. de clients FAIBLE potentiel le jeudi', type: 'percentage' },
      { key: 'visites_minimum_medical_jour', label: 'Visites médicales minimum / jour', type: 'number' },
      { key: 'visites_minimum_pharmacie_jour', label: 'Visites pharmacie minimum / jour', type: 'number' },
      { key: 'jour_limite_plan_activites', label: 'Jour limite des activités (jour du mois)', type: 'number' },
      { key: 'max_visites_jour', label: 'Maximum total de visites / jour', type: 'number' },
      { key: 'nb_max_moyen_lun_mar_mer_jour', label: 'Maximum MOYEN lundi à mercredi', type: 'number' },
      { key: 'max_gros_jeudi', label: 'Maximum GROS le jeudi', type: 'number' },
      { key: 'max_gros_vendredi', label: 'Maximum GROS le vendredi', type: 'number' },
      { key: 'max_faible_jeudi', label: 'Maximum FAIBLE le jeudi', type: 'number' },
      { key: 'max_faible_vendredi', label: 'Maximum FAIBLE le vendredi', type: 'number' },
      { key: 'poids_visite_moyen_reduit_pourcentage', label: 'Poids d’une visite MOYEN (lundi à mercredi)', type: 'percentage' }
    ]
  },
  {
    title: 'Clôture de journée',
    description: 'Horaires de verrouillage des déclarations quotidiennes (heure du Bénin).',
    icon: IconClock,
    tone: 'flame',
    fields: [
      { key: 'heure_cloture_journee', label: 'Heure de clôture normale', type: 'time' },
      { key: 'heure_cloture_forcee', label: 'Heure de clôture automatique forcée', type: 'time' }
    ]
  },
  {
    title: 'Performance & conformité',
    description: 'Seuils utilisés pour évaluer le score mensuel des visiteurs médicaux.',
    icon: IconTrendingUp,
    tone: 'emerald',
    fields: [
      { key: 'score_mensuel_minimal', label: 'Score mensuel global minimal exigé', type: 'percentage' },
      { key: 'seuil_conformite_journaliere_pourcentage', label: 'Taux minimal déclaré / programmé par jour', type: 'percentage' },
      { key: 'objectif_visites_superviseur_journalier', label: 'Objectif de visites superviseur / jour', type: 'number' },
      { key: 'evaluation_superviseurs_poids', label: 'Pondérations de l’évaluation des superviseurs (JSON)', type: 'json' },
      { key: 'notifications_email_actives', label: 'Activer les notifications par e-mail', type: 'boolean' },
      { key: 'penalite_desequilibre_pourcentage', label: 'Pénalité de déséquilibre', type: 'percentage' },
      { key: 'ratio_gros_minimum', label: 'Ratio minimum de clients GROS', type: 'percentage' }
    ]
  },
  {
    title: 'Cibles & pondérations par équipe',
    description: 'Nombre de visites hebdomadaires attendu par cible et poids des spécialités propres à chaque équipe.',
    icon: IconUsers,
    tone: 'royal',
    fields: [],
    custom: true
  }
]

const SPECIALITE_LABEL: Record<Specialite, string> = {
  GENERALISTE: 'Généraliste', GYNECOLOGUE: 'Gynécologue', PEDIATRE: 'Pédiatre', CARDIOLOGUE: 'Cardiologue',
  RHUMATOLOGUE: 'Rhumatologue', ORL: 'ORL', AUTRE_SPECIALITE: 'Autre spécialité',
  MATERNITE: 'Maternité', DISPENSAIRE: 'Dispensaire', PHARMACIE: 'Pharmacie'
}

function CiblesPonderationsPanel() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [equipeId, setEquipeId] = useState('')
  const [quotas, setQuotas] = useState<QuotaCible[]>([])
  const [poids, setPoids] = useState<PoidsSpecialite[]>([])
  const [vms, setVms] = useState<{ id: string; full_name: string; equipe_id: string | null }[]>([])
  const [vmId, setVmId] = useState('')
  const [vmQuotas, setVmQuotas] = useState<{ cible: string; libelle: string; quota_hebdomadaire: number; ordre: number }[]>([])
  const [vmPoids, setVmPoids] = useState<{ specialite: Specialite; poids: number }[]>([])
  const [hasVmOverride, setHasVmOverride] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingQuotas, setSavingQuotas] = useState(false)
  const [savingPoids, setSavingPoids] = useState(false)
  const [savingVm, setSavingVm] = useState(false)
  const [savedQuotas, setSavedQuotas] = useState(false)
  const [savedPoids, setSavedPoids] = useState(false)
  const [savedVm, setSavedVm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm').eq('actif', true).order('full_name')
    ]).then(([e, v]) => {
      setEquipes(e.data ?? [])
      setVms(v.data ?? [])
      if (e.data?.length) setEquipeId(e.data[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!equipeId) return
    void Promise.all([
      supabase.from('quotas_cibles').select('*').eq('equipe_id', equipeId).order('ordre'),
      supabase.from('poids_specialite_visite').select('*').eq('equipe_id', equipeId)
    ]).then(([q, p]) => {
      setQuotas(q.data ?? [])
      setPoids((p.data ?? []).sort((a, b) => SPECIALITE_LABEL[a.specialite].localeCompare(SPECIALITE_LABEL[b.specialite])))
    })
  }, [equipeId])

  useEffect(() => {
    if (!vmId) { setVmQuotas([]); setVmPoids([]); setHasVmOverride(false); return }
    let alive = true
    async function charger() {
      const vm = vms.find(x => x.id === vmId)
      const [q, p] = await Promise.all([
        supabase.from('vm_quotas_cibles').select('*').eq('vm_id', vmId).order('ordre'),
        supabase.from('vm_poids_specialite_visite').select('*').eq('vm_id', vmId)
      ])
      if (!alive) return
      const overrides = (q.data?.length ?? 0) > 0 || (p.data?.length ?? 0) > 0
      setHasVmOverride(overrides)
      const teamQ = quotas.length ? quotas : []
      const teamP = poids.length ? poids : []
      setVmQuotas(q.data?.length ? q.data : teamQ.map(x => ({ cible: x.cible, libelle: x.libelle, quota_hebdomadaire: x.quota_hebdomadaire, ordre: x.ordre })))
      setVmPoids(p.data?.length ? p.data : teamP.map(x => ({ specialite: x.specialite, poids: x.poids })))
      if (vm?.equipe_id && vm.equipe_id !== equipeId) setError('Le VM sélectionné appartient à une autre équipe. Sélectionnez son équipe pour afficher ses valeurs héritées.')
    }
    void charger()
    return () => { alive = false }
  }, [vmId, quotas, poids, vms, equipeId])

  async function sauvegarderQuotas() {
    setSavingQuotas(true); setError(null)
    const resultats = await Promise.all(quotas.map(q => supabase.from('quotas_cibles').update({ quota_hebdomadaire: q.quota_hebdomadaire }).eq('equipe_id', q.equipe_id).eq('cible', q.cible)))
    setSavingQuotas(false)
    const erreur = resultats.find(r => r.error)?.error
    if (erreur) { setError(erreur.message); return }
    setSavedQuotas(true); setTimeout(() => setSavedQuotas(false), 2000)
  }

  async function sauvegarderPoids() {
    setSavingPoids(true); setError(null)
    const resultats = await Promise.all(poids.map(p => supabase.from('poids_specialite_visite').update({ poids: p.poids }).eq('equipe_id', p.equipe_id).eq('specialite', p.specialite)))
    setSavingPoids(false)
    const erreur = resultats.find(r => r.error)?.error
    if (erreur) { setError(erreur.message); return }
    setSavedPoids(true); setTimeout(() => setSavedPoids(false), 2000)
  }

  async function sauvegarderVm() {
    if (!vmId) return
    setSavingVm(true); setError(null)
    const [delQ, delP] = await Promise.all([
      supabase.from('vm_quotas_cibles').delete().eq('vm_id', vmId),
      supabase.from('vm_poids_specialite_visite').delete().eq('vm_id', vmId)
    ])
    if (delQ.error || delP.error) { setSavingVm(false); setError(delQ.error?.message ?? delP.error?.message ?? 'Erreur de suppression'); return }
    const [q, p] = await Promise.all([
      supabase.from('vm_quotas_cibles').insert(vmQuotas.map(x => ({ ...x, vm_id: vmId }))),
      supabase.from('vm_poids_specialite_visite').insert(vmPoids.map(x => ({ ...x, vm_id: vmId })))
    ])
    setSavingVm(false)
    if (q.error || p.error) { setError(q.error?.message ?? p.error?.message ?? 'Enregistrement impossible'); return }
    setHasVmOverride(true); setSavedVm(true); setTimeout(() => setSavedVm(false), 2000)
  }

  async function reinitialiserVm() {
    if (!vmId) return
    setSavingVm(true); setError(null)
    const [q, p] = await Promise.all([
      supabase.from('vm_quotas_cibles').delete().eq('vm_id', vmId),
      supabase.from('vm_poids_specialite_visite').delete().eq('vm_id', vmId)
    ])
    setSavingVm(false)
    if (q.error || p.error) { setError(q.error?.message ?? p.error?.message ?? 'Réinitialisation impossible'); return }
    setHasVmOverride(false)
    const vm = vms.find(x => x.id === vmId)
    const teamQ = quotas
    const teamP = poids
    setVmQuotas(vm?.equipe_id === equipeId ? teamQ.map(x => ({ cible: x.cible, libelle: x.libelle, quota_hebdomadaire: x.quota_hebdomadaire, ordre: x.ordre })) : [])
    setVmPoids(vm?.equipe_id === equipeId ? teamP.map(x => ({ specialite: x.specialite, poids: x.poids })) : [])
  }

  if (loading) return <Skeleton className="h-48" />

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
        <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="w-full max-w-xs rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm">
          {equipes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
      </div>
      <Card>
        <p className="text-sm font-bold text-ink-800">Cibles hebdomadaires de l’équipe</p>
        <p className="mb-4 text-xs text-ink-400">Valeurs par défaut pour tous les VM sans configuration individuelle.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quotas.map(q => <div key={q.cible}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{q.libelle}</label><input type="number" min={0} value={q.quota_hebdomadaire} onChange={e => setQuotas(qs => qs.map(x => x.cible === q.cible ? { ...x, quota_hebdomadaire: Number(e.target.value) } : x))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>)}
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4"><Button size="sm" loading={savingQuotas} variant={savedQuotas ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={sauvegarderQuotas}>{savedQuotas ? 'Enregistré' : 'Enregistrer les cibles'}</Button></div>
      </Card>
      <Card>
        <p className="text-sm font-bold text-ink-800">Pondérations par spécialité de l’équipe</p>
        <p className="mb-4 text-xs text-ink-400">Poids par défaut utilisé dans le calcul de couverture pondérée.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {poids.map(p => <div key={p.specialite}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{SPECIALITE_LABEL[p.specialite]}</label><input type="number" min={0} step={0.5} value={p.poids} onChange={e => setPoids(ps => ps.map(x => x.specialite === p.specialite ? { ...x, poids: Number(e.target.value) } : x))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>)}
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4"><Button size="sm" loading={savingPoids} variant={savedPoids ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={sauvegarderPoids}>{savedPoids ? 'Enregistré' : 'Enregistrer les pondérations'}</Button></div>
      </Card>
      <Card>
        <p className="text-sm font-bold text-ink-800">Configuration individuelle d’un VM</p>
        <p className="mb-3 text-xs text-ink-400">Une configuration individuelle remplace les valeurs de l’équipe uniquement pour le VM sélectionné.</p>
        <select value={vmId} onChange={e => setVmId(e.target.value)} className="mb-4 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm">
          <option value="">Sélectionner un VM…</option>
          {vms.filter(v => v.equipe_id === equipeId).map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
        </select>
        {vmId && <>
          <p className="mb-3 text-xs font-semibold text-royal-700">{hasVmOverride ? 'Configuration individuelle active' : 'Héritage des valeurs de l’équipe'}</p>
          <p className="mb-2 text-xs font-bold text-ink-600">Cibles hebdomadaires</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {vmQuotas.map(q => <label key={q.cible} className="text-xs font-semibold text-ink-500">{q.libelle}<input type="number" min={0} value={q.quota_hebdomadaire} onChange={e => setVmQuotas(xs => xs.map(x => x.cible === q.cible ? { ...x, quota_hebdomadaire: Number(e.target.value) } : x))} className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" /></label>)}
          </div>
          <p className="mb-2 mt-5 text-xs font-bold text-ink-600">Pondérations par spécialité</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {vmPoids.map(p => <label key={p.specialite} className="text-xs font-semibold text-ink-500">{SPECIALITE_LABEL[p.specialite]}<input type="number" min={0} step={0.5} value={p.poids} onChange={e => setVmPoids(xs => xs.map(x => x.specialite === p.specialite ? { ...x, poids: Number(e.target.value) } : x))} className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" /></label>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            <Button size="sm" loading={savingVm} variant={savedVm ? 'success' : 'secondary'} onClick={sauvegarderVm}>{savedVm ? 'Enregistré' : 'Enregistrer la configuration du VM'}</Button>
            <Button size="sm" variant="ghost" onClick={reinitialiserVm} disabled={savingVm || !hasVmOverride}>Rétablir les valeurs de l’équipe</Button>
          </div>
        </>}
      </Card>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

const TONE_BG: Record<Group['tone'], string> = { royal: 'bg-royal-50 text-royal-600', flame: 'bg-flame-50 text-flame-600', emerald: 'bg-emerald-50 text-emerald-600' }

export default function ManagementParametres() {
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(GROUPS[0].title)

  useEffect(() => {
    void supabase.from('parametres').select('*').order('key').then(({ data }: { data: Parametre[] | null }) => {
      setValeurs(Object.fromEntries((data ?? []).map(p => [p.key, String(p.value).replace(/^"|"$/g, '')])))
      setLoading(false)
    })
  }, [])

  async function sauvegarderGroupe(group: Group) {
    setSaving(group.title); setSaveError(null)
    let updates: { key: string; value: Parametre['value'] }[]
    try {
      updates = group.fields.map(({ key, type }) => {
        const raw = (valeurs[key] ?? '').trim()
        const value = type === 'json' ? JSON.parse(raw) : type === 'boolean' ? raw === 'true' : type === 'number' || type === 'percentage' ? Number(raw) : raw
        return { key, value: value as Parametre['value'] }
      })
    } catch (error) {
      setSaving(null)
      setSaveError(error instanceof Error ? error.message : 'Valeur JSON invalide.')
      return
    }
    const resultats = await Promise.all(updates.map(({ key, value }) =>
      supabase.from('parametres').update({ value }).eq('key', key).select('key')
    ))
    setSaving(null)
    const erreur = resultats.find(r => r.error)?.error
    if (erreur) { setSaveError(erreur.message); return }
    const missing = resultats.find(r => !r.data?.length)
    if (missing) { setSaveError('Un paramètre n’existe pas en base. Rechargez la page ou contactez l’administrateur technique.'); return }
    setSaved(group.title); setTimeout(() => setSaved(null), 2000)
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
  const group = GROUPS.find(g => g.title === activeTab) ?? GROUPS[0]

  return (
    <div className="space-y-5 pb-6">
      <div><h1 className="provisit-page-title">Paramètres de la plateforme</h1><p className="text-sm text-ink-400">Seuils, horaires de verrouillage et pondérations, modifiables à tout moment.</p></div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[#163E63]/[.07] bg-white p-1.5 shadow-sm lg:flex-col lg:overflow-visible lg:bg-transparent lg:p-0">
          {GROUPS.map(g => <button key={g.title} onClick={() => setActiveTab(g.title)} className={`flex flex-shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition lg:w-full ${activeTab === g.title ? 'bg-white text-ink-800 shadow-softer lg:ring-1 lg:ring-ink-100' : 'text-ink-500 hover:text-ink-700 lg:hover:bg-white/70'}`}>
            <span className={`hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl lg:flex ${TONE_BG[g.tone]}`}><g.icon className="h-4 w-4" /></span>
            <g.icon className="h-4 w-4 lg:hidden" /><span className="flex-1 text-left">{g.title}</span>
          </button>)}
        </nav>
        {group.custom ? <div><div className="mb-5 flex items-start gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${TONE_BG[group.tone]}`}><group.icon className="h-5 w-5" /></div><div><p className="text-sm font-bold text-ink-800">{group.title}</p><p className="mt-0.5 text-xs text-ink-400">{group.description}</p></div></div><CiblesPonderationsPanel /></div> : <Card>
          <div className="mb-5 flex items-start gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${TONE_BG[group.tone]}`}><group.icon className="h-5 w-5" /></div><div><p className="text-sm font-bold text-ink-800">{group.title}</p><p className="mt-0.5 text-xs text-ink-400">{group.description}</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group.fields.map(field => <div key={field.key}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{field.label}</label>{field.type === 'day' ? <select value={valeurs[field.key] ?? 'SAMEDI'} onChange={e => setValeurs(v => ({ ...v, [field.key]: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm"><option value="LUNDI">Lundi</option><option value="MARDI">Mardi</option><option value="MERCREDI">Mercredi</option><option value="JEUDI">Jeudi</option><option value="VENDREDI">Vendredi</option><option value="SAMEDI">Samedi</option><option value="DIMANCHE">Dimanche</option></select> : field.type === 'json' ? <textarea rows={7} value={valeurs[field.key] ?? ''} onChange={e => setValeurs(v => ({ ...v, [field.key]: e.target.value }))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 font-mono text-xs" /> : field.type === 'boolean' ? <label className="flex items-center gap-2 rounded-xl border border-ink-200 px-3.5 py-3 text-sm"><input type="checkbox" checked={valeurs[field.key] === 'true'} onChange={e => setValeurs(v => ({ ...v, [field.key]: String(e.target.checked) }))} />Activé</label> : <div className="relative"><input type={field.type === 'time' ? 'time' : 'number'} value={valeurs[field.key] ?? ''} onChange={e => setValeurs(v => ({ ...v, [field.key]: e.target.value }))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" />{field.type === 'percentage' && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-400">%</span>}</div>}</div>)}</div>
          <div className="mt-5 flex items-center gap-3 border-t border-ink-100 pt-4"><Button size="sm" loading={saving === group.title} variant={saved === group.title ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={() => sauvegarderGroupe(group)}>{saved === group.title ? 'Enregistré' : 'Enregistrer cette section'}</Button>{saveError && <p className="text-xs font-semibold text-red-600">{saveError}</p>}</div>
        </Card>}
      </div>
    </div>
  )
}
