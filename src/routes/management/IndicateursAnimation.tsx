import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { nowBenin } from '@/lib/time'

interface AnimationRow {
  superviseur_id: string
  full_name: string
  equipes: string[]
  nb_duo: number
  nb_reporting_vise: number
  nb_plans_soumis: number
  nb_programmes_suivis: number
  nb_points_quotidiens: number
  nb_reunions: number
  nb_challenges: number
  nb_formations: number
  nb_coaching: number
  nb_argumentaires: number
}

const PERIODES = [
  { jours: 7, label: '7 derniers jours' },
  { jours: 30, label: '30 derniers jours' },
  { jours: 90, label: '90 derniers jours' }
]

export default function IndicateursAnimation() {
  const [animation, setAnimation] = useState<AnimationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [periodeJours, setPeriodeJours] = useState(30)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const depuis = nowBenin().subtract(periodeJours, 'day').toISOString()
      const [{ data: superviseurs }, { data: se }, { data: duo }, { data: reporting }, { data: plans }, { data: prog }, { data: anim }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('role', 'superviseur'),
        supabase.from('superviseur_equipes').select('superviseur_id, equipes(nom)'),
        supabase.from('rapports_duo').select('superviseur_id').gte('created_at', depuis),
        supabase.from('reporting_hebdomadaire').select('visa_superviseur_id').gte('visa_horodatage', depuis).not('visa_superviseur_id', 'is', null),
        supabase.from('plans_activites_mensuels').select('superviseur_id').gte('soumis_at', depuis),
        supabase.from('programmes_hebdomadaires').select('valide_par').gte('valide_at', depuis).not('valide_par', 'is', null),
        supabase.from('activites_animation').select('superviseur_id, type').gte('created_at', depuis)
      ])
      const rows: AnimationRow[] = (superviseurs ?? []).map((s) => {
        const animSup = (anim ?? []).filter((a) => a.superviseur_id === s.id)
        const compte = (t: string) => animSup.filter((a) => a.type === t).length
        return {
          superviseur_id: s.id,
          full_name: s.full_name,
          equipes: (se ?? []).filter((x: any) => x.superviseur_id === s.id).map((x: any) => x.equipes?.nom).filter(Boolean),
          nb_duo: (duo ?? []).filter((d) => d.superviseur_id === s.id).length,
          nb_reporting_vise: (reporting ?? []).filter((r) => r.visa_superviseur_id === s.id).length,
          nb_plans_soumis: (plans ?? []).filter((p) => p.superviseur_id === s.id).length,
          nb_programmes_suivis: (prog ?? []).filter((p) => p.valide_par === s.id).length,
          nb_points_quotidiens: compte('POINT_QUOTIDIEN'),
          nb_reunions: compte('REUNION_LUNDI') + compte('REUNION_MERCREDI'),
          nb_challenges: compte('CHALLENGE'),
          nb_formations: compte('FORMATION_CONTINUE'),
          nb_coaching: compte('COACHING_TERRAIN'),
          nb_argumentaires: compte('ARGUMENTAIRE_VM')
        }
      })
      setAnimation(rows)
      setLoading(false)
    }
    load()
  }, [periodeJours])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Indicateurs d'animation</h1>
          <p className="text-sm text-ink-400">Duo terrain, reporting, plans, suivi des programmes, points/réunions, challenges, formation, coaching et argumentaires par superviseur</p>
        </div>
        <select
          value={periodeJours} onChange={(e) => setPeriodeJours(Number(e.target.value))}
          className="rounded-xl border border-ink-200 px-3.5 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        >
          {PERIODES.map((p) => <option key={p.jours} value={p.jours}>{p.label}</option>)}
        </select>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          {animation.length === 0 ? (
            <p className="text-xs text-ink-400 py-2">Aucun superviseur enregistré pour l'instant.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs text-ink-500">
                    <th className="px-5 py-2 text-left font-semibold">Superviseur</th>
                    <th className="px-5 py-2 text-left font-semibold">Équipes</th>
                    <th className="px-3 py-2 text-center font-semibold">Duo</th>
                    <th className="px-3 py-2 text-center font-semibold">Reporting visés</th>
                    <th className="px-3 py-2 text-center font-semibold">Plans soumis</th>
                    <th className="px-3 py-2 text-center font-semibold">Programmes suivis</th>
                    <th className="px-3 py-2 text-center font-semibold">Points quotidiens</th>
                    <th className="px-3 py-2 text-center font-semibold">Réunions</th>
                    <th className="px-3 py-2 text-center font-semibold">Challenges</th>
                    <th className="px-3 py-2 text-center font-semibold">Formation</th>
                    <th className="px-3 py-2 text-center font-semibold">Coaching</th>
                    <th className="px-3 py-2 text-center font-semibold">Argumentaires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {animation.map((a) => (
                    <tr key={a.superviseur_id}>
                      <td className="px-5 py-2.5 font-semibold text-ink-800">{a.full_name}</td>
                      <td className="px-5 py-2.5 text-ink-500">{a.equipes.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_duo}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_reporting_vise}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_plans_soumis}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_programmes_suivis}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_points_quotidiens}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_reunions}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_challenges}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_formations}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_coaching}</td>
                      <td className="px-3 py-2.5 text-center text-ink-700">{a.nb_argumentaires}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
