import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { IconStethoscope, IconCheckCircle, IconAlert, IconUsers, IconDownload, IconCamera } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin, nowBenin } from '@/lib/time'
import dayjs from 'dayjs'

interface VmProgress {
  vm_id: string
  full_name: string
  equipe: string | null
  prevues: number
  realisees: number
}

interface AnimationRow {
  superviseur_id: string
  full_name: string
  equipes: string[]
  nb_duo: number
  nb_reporting_vise: number
  nb_plans_soumis: number
}

interface ClotureRow {
  id: string
  vm_id: string
  statut: string
  heure_cloture: string | null
  photo_path: string | null
  en_retard: boolean
  profiles: { full_name: string } | null
}

export default function ManagementDashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<VmProgress[]>([])
  const [alertes, setAlertes] = useState<{ id: string; titre: string; corps: string | null; created_at: string }[]>([])
  const [animation, setAnimation] = useState<AnimationRow[]>([])
  const [moisExport, setMoisExport] = useState(nowBenin().format('YYYY-MM-01'))
  const [exporting, setExporting] = useState(false)
  const [clotures, setClotures] = useState<ClotureRow[]>([])
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const today = todayBenin().format('YYYY-MM-DD')
      const depuis30j = nowBenin().subtract(30, 'day').toISOString()
      const [{ data: taux }, { data: profiles }, { data: notifs }, { data: clo }] = await Promise.all([
        supabase.from('v_taux_realisation_journalier').select('*').eq('jour', today),
        supabase.from('profiles').select('id, full_name, equipes(nom)').eq('role', 'vm'),
        supabase.from('notifications').select('id, titre, corps, created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('clotures_journalieres').select('id, vm_id, statut, heure_cloture, photo_path, en_retard, profiles(full_name)').eq('jour', today)
      ])

      const merged: VmProgress[] = (profiles ?? []).map((p: any) => {
        const t = taux?.find((x) => x.vm_id === p.id)
        return { vm_id: p.id, full_name: p.full_name, equipe: p.equipes?.nom ?? null, prevues: t?.visites_prevues ?? 0, realisees: t?.visites_realisees ?? 0 }
      })
      setProgress(merged)
      setAlertes(notifs ?? [])
      setClotures((clo as unknown as ClotureRow[]) ?? [])

      if (profile?.role === 'admin') {
        const [{ data: superviseurs }, { data: se }, { data: duo }, { data: reporting }, { data: plans }] = await Promise.all([
          supabase.from('profiles').select('id, full_name').eq('role', 'superviseur'),
          supabase.from('superviseur_equipes').select('superviseur_id, equipes(nom)'),
          supabase.from('rapports_duo').select('superviseur_id').gte('created_at', depuis30j),
          supabase.from('reporting_hebdomadaire').select('visa_superviseur_id').gte('visa_horodatage', depuis30j).not('visa_superviseur_id', 'is', null),
          supabase.from('plans_activites_mensuels').select('superviseur_id').gte('soumis_at', depuis30j)
        ])
        const rows: AnimationRow[] = (superviseurs ?? []).map((s) => ({
          superviseur_id: s.id,
          full_name: s.full_name,
          equipes: (se ?? []).filter((x: any) => x.superviseur_id === s.id).map((x: any) => x.equipes?.nom).filter(Boolean),
          nb_duo: (duo ?? []).filter((d) => d.superviseur_id === s.id).length,
          nb_reporting_vise: (reporting ?? []).filter((r) => r.visa_superviseur_id === s.id).length,
          nb_plans_soumis: (plans ?? []).filter((p) => p.superviseur_id === s.id).length
        }))
        setAnimation(rows)
      }

      setLoading(false)
    }
    load()
  }, [profile?.id, profile?.role])

  async function exporterEvaluations() {
    setExporting(true)
    const { data: vms } = await supabase.from('profiles').select('id, full_name').eq('role', 'vm').order('full_name')
    const lignes: string[][] = [['Visiteur médical', 'Mois', 'Taux couverture (%)', 'Ponctualité (%)', 'Exécution planning (%)', 'Discipline clôtures (%)', 'Score global (%)']]

    for (const vm of vms ?? []) {
      const { data } = await supabase.rpc('score_mensuel_vm', { p_vm_id: vm.id, p_mois: moisExport }).single()
      const s = data as any
      lignes.push([
        vm.full_name, dayjs(moisExport).format('MMMM YYYY'),
        String(s?.taux_couverture ?? 0), String(s?.ponctualite ?? 0),
        String(s?.execution_planning ?? 0), String(s?.discipline_clotures ?? 0), String(s?.score_global ?? 0)
      ])
    }

    const csv = lignes.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluations-${dayjs(moisExport).format('YYYY-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  async function voirPhoto(path: string, id: string) {
    setPhotoBusy(id)
    const { data, error } = await supabase.storage.from('fiches-papier').createSignedUrl(path, 3600)
    setPhotoBusy(null)
    if (!error && data) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const totalPrevues = progress.reduce((s, p) => s + p.prevues, 0)
  const totalRealisees = progress.reduce((s, p) => s + p.realisees, 0)
  const enRetard = progress.filter((p) => p.prevues > 0 && p.realisees < p.prevues).length

  const parEquipe = Object.entries(
    progress.reduce<Record<string, { prevues: number; realisees: number }>>((acc, p) => {
      const key = p.equipe ?? 'Sans équipe'
      acc[key] = acc[key] ?? { prevues: 0, realisees: 0 }
      acc[key].prevues += p.prevues
      acc[key].realisees += p.realisees
      return acc
    }, {})
  ).map(([equipe, v]) => ({ equipe, taux: v.prevues ? Math.round((v.realisees / v.prevues) * 100) : 0 }))

  if (loading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Tableau de bord — {dayjs().format('dddd D MMMM')}</h1>
        <p className="text-sm text-ink-400">Suivi en temps réel de l'activité terrain</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="VM actifs" value={progress.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Visites prévues" value={totalPrevues} tone="ink" icon={<IconStethoscope className="h-4 w-4" />} />
        <StatCard label="Visites réalisées" value={totalRealisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="VM en retard" value={enRetard} tone="flame" icon={<IconAlert className="h-4 w-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <p className="text-sm font-bold text-ink-800 mb-4">Comparaison par équipe (taux du jour)</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={parEquipe}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF1F5" />
                <XAxis dataKey="equipe" tick={{ fontSize: 11, fill: '#6B7684' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#96A0AC' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Taux']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="taux" fill="#154BAD" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-bold text-ink-800 mb-3">Avancement par VM aujourd'hui</p>
          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {progress.map((p) => (
              <div key={p.vm_id} className="flex items-center gap-3">
                <span className="text-xs font-medium text-ink-600 w-28 truncate">{p.full_name}</span>
                <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-royal-500 to-emerald-500"
                    style={{ width: `${p.prevues ? Math.min(100, (p.realisees / p.prevues) * 100) : 0}%` }} />
                </div>
                <span className="text-[11px] text-ink-400 w-10 text-right">{p.realisees}/{p.prevues}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Alertes récentes</p>
        <div className="space-y-2">
          {alertes.length === 0 && <p className="text-xs text-ink-400">Aucune alerte récente.</p>}
          {alertes.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-xl bg-ink-50 p-3">
              <IconAlert className="h-3.5 w-3.5 text-flame-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-ink-700">{a.titre}</p>
                {a.corps && <p className="text-[11px] text-ink-400">{a.corps}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold text-ink-800">Clôtures du jour</p>
        <p className="text-xs text-ink-400 mb-4">Fiche papier photographiée, en regard des données saisies numériquement</p>
        {clotures.length === 0 ? (
          <p className="text-xs text-ink-400 py-2">Aucune clôture enregistrée pour l'instant aujourd'hui.</p>
        ) : (
          <div className="space-y-2">
            {clotures.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-ink-50 p-2.5">
                <div>
                  <p className="text-xs font-semibold text-ink-800">{c.profiles?.full_name}</p>
                  <p className="text-[10px] text-ink-400">
                    {c.heure_cloture ? dayjs(c.heure_cloture).format('HH:mm') : '—'}
                    {c.en_retard && ' · en retard'}
                    {c.statut === 'CLOTUREE_FORCEE' && ' · clôture forcée'}
                  </p>
                </div>
                {c.photo_path ? (
                  <Button size="sm" variant="secondary" loading={photoBusy === c.id} icon={<IconCamera className="h-3.5 w-3.5" />}
                    onClick={() => voirPhoto(c.photo_path!, c.id)}>
                    Voir la photo
                  </Button>
                ) : (
                  <span className="text-[10px] text-ink-400">Sans photo</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {profile?.role === 'admin' && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
            <div>
              <p className="text-sm font-bold text-ink-800">Export des évaluations</p>
              <p className="text-xs text-ink-400">Scores mensuels par VM, pour la préparation de la paie</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month" value={dayjs(moisExport).format('YYYY-MM')}
                onChange={(e) => setMoisExport(`${e.target.value}-01`)}
                className="rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
              <Button size="sm" variant="secondary" loading={exporting} icon={<IconDownload className="h-4 w-4" />} onClick={exporterEvaluations}>
                Exporter (CSV)
              </Button>
            </div>
          </div>
        </Card>
      )}

      {profile?.role === 'admin' && (
        <Card>
          <p className="text-sm font-bold text-ink-800">Indicateur d'animation d'équipe (30 derniers jours)</p>
          <p className="text-xs text-ink-400 mb-4">Coaching terrain, correction des reportings et suivi de la planification par superviseur</p>
          {animation.length === 0 ? (
            <p className="text-xs text-ink-400 py-2">Aucun superviseur enregistré pour l'instant.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs text-ink-500">
                    <th className="px-5 py-2 text-left font-semibold">Superviseur</th>
                    <th className="px-5 py-2 text-left font-semibold">Équipes</th>
                    <th className="px-5 py-2 text-center font-semibold">Duo terrain</th>
                    <th className="px-5 py-2 text-center font-semibold">Reporting visés</th>
                    <th className="px-5 py-2 text-center font-semibold">Plans soumis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {animation.map((a) => (
                    <tr key={a.superviseur_id}>
                      <td className="px-5 py-2.5 font-semibold text-ink-800">{a.full_name}</td>
                      <td className="px-5 py-2.5 text-ink-500">{a.equipes.join(', ') || '—'}</td>
                      <td className="px-5 py-2.5 text-center text-ink-700">{a.nb_duo}</td>
                      <td className="px-5 py-2.5 text-center text-ink-700">{a.nb_reporting_vise}</td>
                      <td className="px-5 py-2.5 text-center text-ink-700">{a.nb_plans_soumis}</td>
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
