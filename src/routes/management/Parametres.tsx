import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconClock, IconTrendingUp, IconCheck, IconUsers } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Parametre = Database['public']['Tables']['parametres']['Row']
type FieldType = 'time' | 'percentage' | 'number'

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
      { key: 'heure_limite_soumission_programme', label: 'Heure limite de soumission (samedi)', type: 'time' },
      { key: 'seuil_faible_jeudi_pourcentage_max', label: 'Part max. de clients FAIBLE potentiel le jeudi', type: 'percentage' },
      { key: 'visites_minimum_medical_jour', label: 'Visites médicales minimum / jour', type: 'number' },
      { key: 'visites_minimum_pharmacie_jour', label: 'Visites pharmacie minimum / jour', type: 'number' }
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
      { key: 'seuil_conformite_journaliere_pourcentage', label: 'Taux minimal déclaré / programmé par jour', type: 'percentage' }
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
  const [loading, setLoading] = useState(true)
  const [savingQuotas, setSavingQuotas] = useState(false)
  const [savingPoids, setSavingPoids] = useState(false)
  const [savedQuotas, setSavedQuotas] = useState(false)
  const [savedPoids, setSavedPoids] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('equipes').select('*').order('nom').then(({ data }) => {
      setEquipes(data ?? [])
      if (data?.length) setEquipeId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!equipeId) return
    setLoading(true)
    void Promise.all([
      supabase.from('quotas_cibles').select('*').eq('equipe_id', equipeId).order('ordre'),
      supabase.from('poids_specialite_visite').select('*').eq('equipe_id', equipeId)
    ]).then(([q, p]) => {
      setQuotas(q.data ?? [])
      setPoids((p.data ?? []).sort((a, b) => SPECIALITE_LABEL[a.specialite].localeCompare(SPECIALITE_LABEL[b.specialite])))
      setLoading(false)
    })
  }, [equipeId])

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
        <p className="text-sm font-bold text-ink-800">Cibles hebdomadaires</p>
        <p className="mb-4 text-xs text-ink-400">Nombre de visites attendu par semaine pour chaque cible.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quotas.map(q => <div key={q.cible}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{q.libelle}</label><input type="number" min={0} value={q.quota_hebdomadaire} onChange={e => setQuotas(qs => qs.map(x => x.cible === q.cible ? { ...x, quota_hebdomadaire: Number(e.target.value) } : x))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>)}
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4"><Button size="sm" loading={savingQuotas} variant={savedQuotas ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={sauvegarderQuotas}>{savedQuotas ? 'Enregistré' : 'Enregistrer les cibles'}</Button></div>
      </Card>
      <Card>
        <p className="text-sm font-bold text-ink-800">Pondération par spécialité</p>
        <p className="mb-4 text-xs text-ink-400">Poids de chaque spécialité dans le score de couverture hebdomadaire pondéré.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {poids.map(p => <div key={p.specialite}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{SPECIALITE_LABEL[p.specialite]}</label><input type="number" min={0} step={0.5} value={p.poids} onChange={e => setPoids(ps => ps.map(x => x.specialite === p.specialite ? { ...x, poids: Number(e.target.value) } : x))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>)}
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4"><Button size="sm" loading={savingPoids} variant={savedPoids ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={sauvegarderPoids}>{savedPoids ? 'Enregistré' : 'Enregistrer les pondérations'}</Button></div>
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
    const resultats = await Promise.all(group.fields.map(({ key }) => {
      const raw = valeurs[key] ?? ''
      const isNumeric = !Number.isNaN(Number(raw)) && raw.trim() !== ''
      const value = isNumeric ? Number(raw) : `"${raw}"`
      return supabase.from('parametres').update({ value }).eq('key', key)
    }))
    setSaving(null)
    const erreur = resultats.find(r => r.error)?.error
    if (erreur) { setSaveError(erreur.message); return }
    setSaved(group.title); setTimeout(() => setSaved(null), 2000)
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
  const group = GROUPS.find(g => g.title === activeTab) ?? GROUPS[0]

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-xl font-bold text-ink-800">Paramètres de la plateforme</h1><p className="text-sm text-ink-400">Seuils, horaires de verrouillage et pondérations, modifiables à tout moment.</p></div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="flex gap-1.5 overflow-x-auto rounded-2xl bg-ink-100/70 p-1.5 lg:flex-col lg:overflow-visible lg:bg-transparent lg:p-0">
          {GROUPS.map(g => <button key={g.title} onClick={() => setActiveTab(g.title)} className={`flex flex-shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition lg:w-full ${activeTab === g.title ? 'bg-white text-ink-800 shadow-softer lg:ring-1 lg:ring-ink-100' : 'text-ink-500 hover:text-ink-700 lg:hover:bg-white/70'}`}>
            <span className={`hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl lg:flex ${TONE_BG[g.tone]}`}><g.icon className="h-4 w-4" /></span>
            <g.icon className="h-4 w-4 lg:hidden" /><span className="flex-1 text-left">{g.title}</span>
          </button>)}
        </nav>
        {group.custom ? <div><div className="mb-5 flex items-start gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${TONE_BG[group.tone]}`}><group.icon className="h-5 w-5" /></div><div><p className="text-sm font-bold text-ink-800">{group.title}</p><p className="mt-0.5 text-xs text-ink-400">{group.description}</p></div></div><CiblesPonderationsPanel /></div> : <Card>
          <div className="mb-5 flex items-start gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${TONE_BG[group.tone]}`}><group.icon className="h-5 w-5" /></div><div><p className="text-sm font-bold text-ink-800">{group.title}</p><p className="mt-0.5 text-xs text-ink-400">{group.description}</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group.fields.map(field => <div key={field.key}><label className="mb-1.5 block text-xs font-semibold text-ink-500">{field.label}</label><div className="relative"><input type={field.type === 'time' ? 'time' : 'number'} value={valeurs[field.key] ?? ''} onChange={e => setValeurs(v => ({ ...v, [field.key]: e.target.value }))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" />{field.type === 'percentage' && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-400">%</span>}</div></div>)}</div>
          <div className="mt-5 flex items-center gap-3 border-t border-ink-100 pt-4"><Button size="sm" loading={saving === group.title} variant={saved === group.title ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={() => sauvegarderGroupe(group)}>{saved === group.title ? 'Enregistré' : 'Enregistrer cette section'}</Button>{saveError && <p className="text-xs font-semibold text-red-600">{saveError}</p>}</div>
        </Card>}
      </div>
    </div>
  )
}
