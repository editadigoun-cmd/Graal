import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconClock, IconTrendingUp, IconCheck } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Parametre = Database['public']['Tables']['parametres']['Row']
type Field = { key: string; label: string; type: 'time' | 'number' }
type Group = { title: string; description: string; icon: typeof IconCalendar; fields: Field[] }
const GROUPS: Group[] = [
  { title: 'Programme hebdomadaire', description: 'Règles de soumission du planning.', icon: IconCalendar, fields: [
    { key: 'heure_limite_soumission_programme', label: 'Heure limite de soumission (samedi)', type: 'time' },
    { key: 'visites_minimum_medical_jour', label: 'Visites médicales minimum / jour', type: 'number' },
    { key: 'visites_minimum_pharmacie_jour', label: 'Visites pharmacie minimum / jour', type: 'number' }
  ] },
  { title: 'Clôture de journée', description: 'Horaires de verrouillage des déclarations.', icon: IconClock, fields: [
    { key: 'heure_cloture_journee', label: 'Heure de clôture normale', type: 'time' },
    { key: 'heure_cloture_forcee', label: 'Heure de clôture automatique', type: 'time' }
  ] },
  { title: 'Performance & conformité', description: 'Seuils de performance.', icon: IconTrendingUp, fields: [
    { key: 'score_mensuel_minimal', label: 'Score mensuel minimal', type: 'number' },
    { key: 'seuil_conformite_journaliere_pourcentage', label: 'Taux minimal déclaré / programmé', type: 'number' }
  ] }
]
export default function ManagementParametres() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [active, setActive] = useState(GROUPS[0].title)
  useEffect(() => { supabase.from('parametres').select('*').order('key').then(({ data }: { data: Parametre[] | null }) => { setValues(Object.fromEntries((data ?? []).map(p => [p.key, String(p.value).replace(/^"|"$/g, '')]))); setLoading(false) }) }, [])
  const group = GROUPS.find(g => g.title === active) ?? GROUPS[0]
  async function save() { setSaving(true); for (const f of group.fields) { const raw = values[f.key] ?? ''; const value = f.type === 'number' ? Number(raw) : `"${raw}"`; await supabase.from('parametres').update({ value }).eq('key', f.key) }; setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000) }
  if (loading) return <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
  return <div className="space-y-6"><div><h1 className="text-xl font-bold text-ink-800">Paramètres de la plateforme</h1><p className="text-sm text-ink-400">Seuils et horaires de fonctionnement.</p></div><div className="grid gap-6 lg:grid-cols-[260px_1fr]"><nav className="flex gap-1.5 overflow-x-auto rounded-2xl bg-ink-100/70 p-1.5 lg:flex-col">{GROUPS.map(g => <button type="button" key={g.title} onClick={() => setActive(g.title)} className={`flex flex-shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${active === g.title ? 'bg-white text-ink-800 shadow-softer' : 'text-ink-500'}`}><g.icon className="h-4 w-4" /><span>{g.title}</span></button>)}</nav><Card><div className="flex items-start gap-3 mb-5"><group.icon className="h-5 w-5" /><div><p className="text-sm font-bold text-ink-800">{group.title}</p><p className="text-xs text-ink-400">{group.description}</p></div></div><div className="grid sm:grid-cols-2 gap-4">{group.fields.map(f => <label key={f.key} className="text-xs font-semibold text-ink-500">{f.label}<input type={f.type} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2" /></label>)}</div><div className="mt-5"><Button size="sm" loading={saving} variant={saved ? 'success' : 'secondary'} icon={<IconCheck className="h-4 w-4" />} onClick={save}>{saved ? 'Enregistré' : 'Enregistrer'}</Button></div></Card></div></div>
}
