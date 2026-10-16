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
import logo from '@/assets/logo-full.png'

type Reporting = Database['public']['Tables']['reporting_hebdomadaire']['Row']
type TauxHebdo = Database['public']['Views']['v_taux_realisation_hebdomadaire']['Row']
type ScorePondere = Database['public']['Views']['v_score_hebdomadaire_pondere']['Row']

type ReportingField = 'analyse_generale' | 'points_forts' | 'veille_concurrentielle' | 'suggestions' | 'appreciation_personnelle'

const CHAMPS: { key: ReportingField; label: string; placeholder: string }[] = [
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

  const tauxGlobal = totalPrevu > 0 ? Math.round((totalRealise / totalPrevu) * 100) : 0
  const score = scorePondere?.score_pondere_pourcentage
  const scoreTone = score == null ? 'text-slate-500' : score >= 80 ? 'text-emerald-700' : score >= 50 ? 'text-amber-700' : 'text-rose-700'

  return (
    <div className="mx-auto mt-3 max-w-4xl space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#102b59] via-[#174b91] to-[#176c8a] p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-4 h-28 w-28 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Espace terrain · Performance
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reporting hebdomadaire</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-blue-100">Faites le bilan de votre activité, analysez les résultats et partagez vos observations terrain.</p>
          </div>
          <img src={logo} alt="GRAAL Medical Solutions" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-md sm:h-16 sm:w-16" />
        </div>
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-200">Période sélectionnée</p>
            <p className="mt-1 text-base font-semibold">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
          </div>
          <button onClick={() => ouvrirReportingHebdo(semaineDebut).catch(() => {})} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#174b91] shadow-sm transition hover:bg-blue-50">
            <IconDownload className="h-4 w-4" /> Exporter en PDF
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button aria-label="Semaine précédente" onClick={() => setOffset((o) => o - 1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"><IconChevronLeft className="h-5 w-5" /></button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Consulter une période</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800">{dayjs(semaineDebut).format('DD MMMM YYYY')}</p>
        </div>
        <button aria-label="Semaine suivante" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-25"><IconChevronRight className="h-5 w-5" /></button>
      </div>

      {loading ? <Skeleton className="h-64" /> : (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">01 · Résultats</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">Synthèse de la semaine</h2>
              </div>
              <span className="text-xs text-slate-500">Calcul automatique</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">Visites réalisées</p>
                <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold tracking-tight text-slate-900">{totalRealise}</span><span className="text-xs text-slate-400">/ {totalPrevu} prévues</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${tauxGlobal}%` }} /></div>
                <p className="mt-2 text-xs font-semibold text-blue-700">{tauxGlobal}% de réalisation</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">Score pondéré</p>
                <div className={`mt-2 text-3xl font-bold tracking-tight ${scoreTone}`}>{score == null ? '—' : `${score}%`}</div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Priorité aux spécialités définies par GRAAL.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">Cibles suivies</p>
                <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{taux.length}</div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Indicateurs de votre activité pour la période.</p>
              </div>
            </div>
          </section>

          <Card className="border border-slate-100 bg-white shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Détail des indicateurs</p>
              <h3 className="mt-1 text-base font-bold text-slate-900">Réalisé par cible</h3>
            </div>
            {taux.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Aucune donnée disponible pour cette semaine.</p> : (
              <div className="space-y-4">
                {taux.map((t) => {
                  const pct = Math.round((t.taux ?? 0) * 100)
                  return <div key={t.cible}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium capitalize text-slate-700">{t.cible?.replace(/_/g, ' ')}</span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-900">{t.realisees}/{t.prevues} <span className="text-xs font-medium text-slate-400">· {pct}%</span></span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
                  </div>
                })}
              </div>
            )}
          </Card>

          <section className="space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">02 · Analyse terrain</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Votre bilan de la semaine</h2>
              <p className="mt-1 text-sm text-slate-500">Soyez précis : vos observations aideront à orienter les prochaines actions.</p>
            </div>
            {CHAMPS.map((c, i) => (
              <Card key={c.key} className="border border-slate-100 bg-white shadow-sm">
                <label className="mb-2 flex items-center gap-3 text-sm font-bold text-slate-800">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-extrabold text-blue-700">{String(i + 1).padStart(2, '0')}</span>
                  {c.label}
                </label>
                <textarea
                  value={(reporting[c.key] as string) ?? ''}
                  onChange={(e) => setReporting((r) => ({ ...r, [c.key]: e.target.value }))}
                  placeholder={c.placeholder}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </Card>
            ))}
          </section>

          {(reporting.appreciation_superviseur || reporting.recommandations_superviseur) && (
            <Card className="border border-emerald-100 bg-emerald-50/60 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><IconCheckCircle className="h-5 w-5" /></span>
                <div><p className="text-sm font-bold text-emerald-900">Retour du superviseur</p><p className="text-xs text-emerald-700">Commentaires et recommandations</p></div>
              </div>
              {reporting.appreciation_superviseur && <p className="mb-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{reporting.appreciation_superviseur}</p>}
              {reporting.recommandations_superviseur && <p className="whitespace-pre-wrap text-sm italic leading-6 text-emerald-800">{reporting.recommandations_superviseur}</p>}
            </Card>
          )}

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            {visa ? <span className="inline-flex items-center gap-2 font-semibold text-emerald-700"><IconCheckCircle className="h-4 w-4" /> Reporting visé par le superviseur</span> : 'En attente du visa du superviseur'}
          </div>

          <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button fullWidth loading={saving} variant={saved ? 'success' : 'primary'} onClick={enregistrer}>
              {saved ? '✓ Reporting enregistré' : 'Enregistrer mon reporting'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
