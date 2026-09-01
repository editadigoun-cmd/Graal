import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconChevronRight, IconDownload, IconCheckCircle } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isoWeekMonday } from '@/lib/time'
import { ouvrirReportingHebdo } from '@/lib/pdf'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Reporting = Database['public']['Tables']['reporting_hebdomadaire']['Row']
type TauxHebdo = Database['public']['Views']['v_taux_realisation_hebdomadaire']['Row']
type ScorePondere = Database['public']['Views']['v_score_hebdomadaire_pondere']['Row']

const CHAMPS: { key: keyof Reporting; label: string; placeholder: string }[] = [
  { key: 'analyse_generale', label: 'Analyse générale des visites / marketing', placeholder: 'Tendances observées, contexte du secteur…' },
  { key: 'points_forts', label: 'Points forts de la semaine', placeholder: 'Ce qui a bien fonctionné…' },
  { key: 'veille_concurrentielle', label: 'Veille concurrentielle', placeholder: 'Actions ou produits concurrents observés…' },
  { key: 'suggestions', label: 'Suggestions / apports', placeholder: "Idées pour améliorer l'action terrain…" },
  { key: 'appreciation_personnelle', label: 'Appréciation personnelle de la semaine', placeholder: 'Votre ressenti global…' }
]

export default function Reporting() {
  const { session } = useAuth()
  const [offset, setOffset] = useState(0) // 0 = semaine en cours, -1 = précédente...
  const [reporting, setReporting] = useState<Partial<Reporting>>({})
  const [taux, setTaux] = useState<TauxHebdo[]>([])
  const [scorePondere, setScorePondere] = useState<ScorePondere | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const semaineDebut = isoWeekMonday().add(offset, 'week').format('YYYY-MM-DD')

  useEffect(() => {
    if (!session) return
    setLoading(true)
    setSaved(false)
    Promise.all([
      supabase.from('reporting_hebdomadaire').select('*').eq('vm_id', session.user.id).eq('semaine_debut', semaineDebut).maybeSingle(),
      supabase.from('v_taux_realisation_hebdomadaire').select('*').eq('vm_id', session.user.id).eq('semaine_debut', semaineDebut),
      supabase.from('v_score_hebdomadaire_pondere').select('*').eq('vm_id', session.user.id).eq('semaine_debut', semaineDebut).maybeSingle()
    ]).then(([r, t, s]) => {
      setReporting(r.data ?? {})
      setTaux(t.data ?? [])
      setScorePondere(s.data ?? null)
      setLoading(false)
    })
  }, [session, semaineDebut])

  async function enregistrer() {
    if (!session) return
    setSaving(true)
    const payload = {
      vm_id: session.user.id,
      semaine_debut: semaineDebut,
      analyse_generale: reporting.analyse_generale ?? null,
      points_forts: reporting.points_forts ?? null,
      veille_concurrentielle: reporting.veille_concurrentielle ?? null,
      suggestions: reporting.suggestions ?? null,
      appreciation_personnelle: reporting.appreciation_personnelle ?? null
    }
    const { error } = await supabase.from('reporting_hebdomadaire').upsert(payload, { onConflict: 'vm_id,semaine_debut' })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  const totalPrevu = taux.reduce((s, t) => s + (t.prevues ?? 0), 0)
  const totalRealise = taux.reduce((s, t) => s + (t.realisees ?? 0), 0)
  const visa = reporting.visa_superviseur_id

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-800 font-display">Reporting hebdomadaire</h1>
        <button onClick={() => ouvrirReportingHebdo(semaineDebut).catch(() => {})} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-ink-500 shadow-softer">
          <IconDownload className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2 shadow-softer">
        <button onClick={() => setOffset((o) => o - 1)} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold text-ink-700">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</span>
        <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} className="rounded-full p-1.5 hover:bg-ink-100 disabled:opacity-30"><IconChevronRight className="h-4 w-4" /></button>
      </div>

      {loading ? <Skeleton className="h-40" /> : (
        <>
          <Card>
            <p className="text-sm font-bold text-ink-800 mb-3">Synthèse (calculée automatiquement)</p>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-ink-500">Couverture globale</span>
              <span className="font-bold text-royal-600">{totalRealise}/{totalPrevu} visites</span>
            </div>
            {scorePondere?.score_pondere_pourcentage != null && (
              <div className={`mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                scorePondere.score_pondere_pourcentage >= 80 ? 'bg-emerald-50' : scorePondere.score_pondere_pourcentage >= 50 ? 'bg-flame-50' : 'bg-red-50'
              }`}>
                <span className={
                  scorePondere.score_pondere_pourcentage >= 80 ? 'text-emerald-700' : scorePondere.score_pondere_pourcentage >= 50 ? 'text-flame-700' : 'text-red-600'
                }>
                  Score pondéré (priorité spécialités : gynéco &gt; généralistes &gt; dispensaires/maternités &gt; pédiatres &gt; autres)
                </span>
                <span className={`font-bold ${
                  scorePondere.score_pondere_pourcentage >= 80 ? 'text-emerald-700' : scorePondere.score_pondere_pourcentage >= 50 ? 'text-flame-700' : 'text-red-600'
                }`}>
                  {scorePondere.score_pondere_pourcentage}%
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {taux.map((t) => (
                <div key={t.cible} className="flex items-center justify-between text-xs">
                  <span className="text-ink-500">{t.cible?.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-ink-700">{t.realisees}/{t.prevues} ({Math.round((t.taux ?? 0) * 100)}%)</span>
                </div>
              ))}
              {taux.length === 0 && <p className="text-xs text-ink-400">Aucune donnée pour cette semaine.</p>}
            </div>
          </Card>

          {CHAMPS.map((c) => (
            <Card key={c.key}>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">{c.label}</label>
              <textarea
                value={(reporting[c.key] as string) ?? ''}
                onChange={(e) => setReporting((r) => ({ ...r, [c.key]: e.target.value }))}
                placeholder={c.placeholder}
                rows={2}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </Card>
          ))}

          {(reporting.appreciation_superviseur || reporting.recommandations_superviseur) && (
            <Card className="bg-emerald-50/50">
              <div className="flex items-center gap-2 mb-2">
                <IconCheckCircle className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-bold text-emerald-700">Retour du superviseur</p>
              </div>
              {reporting.appreciation_superviseur && <p className="text-xs text-ink-600 mb-1.5">{reporting.appreciation_superviseur}</p>}
              {reporting.recommandations_superviseur && <p className="text-xs text-ink-500 italic">{reporting.recommandations_superviseur}</p>}
            </Card>
          )}
          {!visa && (
            <p className="text-center text-xs text-ink-400">En attente de visa du superviseur</p>
          )}

          <Button fullWidth loading={saving} variant={saved ? 'success' : 'primary'} onClick={enregistrer}>
            {saved ? 'Enregistré' : 'Enregistrer le reporting'}
          </Button>
        </>
      )}
    </div>
  )
}
