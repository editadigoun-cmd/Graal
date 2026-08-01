import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconClock, IconTrendingUp, IconCheck } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Parametre = Database['public']['Tables']['parametres']['Row']
type FieldType = 'time' | 'percentage' | 'number'

interface FieldMeta {
  key: string
  label: string
  type: FieldType
}

interface Group {
  title: string
  description: string
  icon: typeof IconCalendar
  tone: 'royal' | 'flame' | 'emerald'
  fields: FieldMeta[]
}

const GROUPS: Group[] = [
  {
    title: 'Programme hebdomadaire',
    description: 'Règles de constitution et de soumission du planning du jeudi.',
    icon: IconCalendar,
    tone: 'royal',
    fields: [
      { key: 'heure_limite_soumission_programme', label: 'Heure limite de soumission (jeudi)', type: 'time' },
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
  }
]

const TONE_BG: Record<Group['tone'], string> = {
  royal: 'bg-royal-50 text-royal-600',
  flame: 'bg-flame-50 text-flame-600',
  emerald: 'bg-emerald-50 text-emerald-600'
}

export default function ManagementParametres() {
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('parametres').select('*').order('key').then(({ data }: { data: Parametre[] | null }) => {
      setValeurs(Object.fromEntries((data ?? []).map((p) => [p.key, String(p.value).replace(/^"|"$/g, '')])))
      setLoading(false)
    })
  }, [])

  async function sauvegarderGroupe(group: Group) {
    setSaving(group.title)
    await Promise.all(
      group.fields.map(({ key }) => {
        const raw = valeurs[key] ?? ''
        const isNumeric = !Number.isNaN(Number(raw)) && raw.trim() !== ''
        const value = isNumeric ? Number(raw) : `"${raw}"`
        return supabase.from('parametres').update({ value }).eq('key', key)
      })
    )
    setSaving(null)
    setSaved(group.title)
    setTimeout(() => setSaved(null), 2000)
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Paramètres de la plateforme</h1>
        <p className="text-sm text-ink-400">Seuils, horaires de verrouillage et pondérations, modifiables à tout moment.</p>
      </div>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <div className="flex items-start gap-3 mb-5">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${TONE_BG[group.tone]}`}>
              <group.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-800">{group.title}</p>
              <p className="text-xs text-ink-400 mt-0.5">{group.description}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {group.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">{field.label}</label>
                <div className="relative">
                  <input
                    type={field.type === 'time' ? 'time' : 'number'}
                    value={valeurs[field.key] ?? ''}
                    onChange={(e) => setValeurs((v) => ({ ...v, [field.key]: e.target.value }))}
                    className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                  />
                  {field.type === 'percentage' && (
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-400">%</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-ink-100 pt-4">
            <Button
              size="sm"
              loading={saving === group.title}
              variant={saved === group.title ? 'success' : 'secondary'}
              icon={<IconCheck className="h-4 w-4" />}
              onClick={() => sauvegarderGroupe(group)}
            >
              {saved === group.title ? 'Enregistré' : 'Enregistrer cette section'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
