import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { IconStethoscope, IconCheckCircle, IconAlert, IconUsers, IconDownload, IconCamera } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin, nowBenin, isoWeekMonday } from '@/lib/time'
import dayjs from 'dayjs'

interface VmProgress {
  vm_id: string
  full_name: string
  equipe: string | null
  equipe_id: string | null
  prevues: number
  realisees: number
  conforme: boolean | null
}

interface SousVisiteRow {
  client_id: string
  nom: string
  potentiel: string
  vm_id: string
  vm_nom: string
  equipe_id: string | null
  visites_mois_courant: number
  frequence_visite_mensuelle: number
  justifie: boolean
}

interface ScorePondereRow {
  vm_id: string
  vm_nom: string
  equipe_id: string | null
  score: number
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
  const [moisExport, setMoisExport] = useState(nowBenin().format('YYYY-MM-01'))
  const [exporting, setExporting] = useState(false)
  const [clotures, setClotures] = useState<ClotureRow[]>([])
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
  const [sousVisites, setSousVisites] = useState<SousVisiteRow[]>([])
  const [scoresPonderes, setScoresPonderes] = useState<ScorePondereRow[]>([])
  const [equipes, setEquipes] = useState<{ id: string; nom: string }[]>([])
  const [equipeFilter, setEquipeFilter] = useState('')
  const [vmEquipeById, setVmEquipeById] = useState<Record<string, string | null>>({})
  const [vmsSansPlanning, setVmsSansPlanning] = useState<{ id: string; full_name: string; equipe: string | null; equipe_id: string | null }[]>([])

  useEffect(() => {
    async function load() {
      const today = todayBenin().format('YYYY-MM-DD')
      const semaineProchaine = isoWeekMonday(nowBenin().add(7, 'day')).format('YYYY-MM-DD')
      // Requête volontairement sans embed equipes(nom) : cette combinaison précise
      // (filtre role=eq.vm + jointure) ne renvoyait jamais de réponse observable dans les
      // logs Supabase (uniquement le préflight CORS, jamais le GET), laissant `profiles`
      // à null et donc TOUTES les statistiques du dashboard à zéro en permanence. On
      // reconstruit le nom d'équipe côté client à partir de la liste `equipes` déjà chargée
      // séparément (nécessaire de toute façon pour le filtre), ce qui évite l'embed fragile.
      const { data: supervisorLinks } = profile?.role === 'superviseur'
        ? await supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
        : { data: [] as { equipe_id: string }[] }
      const supervisedIds = new Set((supervisorLinks ?? []).map((x) => x.equipe_id))

      const [{ data: taux }, { data: allProfiles }, { data: notifs }, { data: clo }, { data: allEquipes }, { data: progSemaine }] = await Promise.all([
        supabase.from('v_taux_realisation_journalier').select('*').eq('jour', today),
        supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm'),
        supabase.from('notifications').select('id, titre, corps, created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('clotures_journalieres').select('id, vm_id, statut, heure_cloture, photo_path, en_retard, profiles(full_name)').eq('jour', today),
        supabase.from('equipes').select('id, nom').order('nom'),
        supabase.from('programmes_hebdomadaires').select('vm_id').eq('semaine_debut', semaineProchaine)
      ])
      const profiles = profile?.role === 'superviseur'
        ? (allProfiles ?? []).filter((p) => p.equipe_id && supervisedIds.has(p.equipe_id))
        : (allProfiles ?? [])
      const eq = profile?.role === 'superviseur'
        ? (allEquipes ?? []).filter((e) => supervisedIds.has(e.id))
        : (allEquipes ?? [])

      const equipeNomById = Object.fromEntries((eq ?? []).map((e) => [e.id, e.nom]))
      const merged: VmProgress[] = (profiles ?? []).map((p) => {
        const t = taux?.find((x) => x.vm_id === p.id)
        return { vm_id: p.id, full_name: p.full_name, equipe: p.equipe_id ? equipeNomById[p.equipe_id] ?? null : null, equipe_id: p.equipe_id ?? null, prevues: t?.visites_prevues ?? 0, realisees: t?.visites_realisees ?? 0, conforme: t?.conforme ?? null }
      })
      setProgress(merged)
      setAlertes(notifs ?? [])
      setClotures((clo as unknown as ClotureRow[]) ?? [])
      setEquipes(eq ?? [])
      const vmEquipeMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.equipe_id as string | null]))
      setVmEquipeById(vmEquipeMap)

      const vmIdsAvecProgramme = new Set((progSemaine ?? []).map((pr) => pr.vm_id))
      setVmsSansPlanning(
        (profiles ?? [])
          .filter((p) => !vmIdsAvecProgramme.has(p.id))
          .map((p) => ({ id: p.id, full_name: p.full_name, equipe: p.equipe_id ? equipeNomById[p.equipe_id] ?? null : null, equipe_id: p.equipe_id ?? null }))
      )

      const moisCourant = nowBenin().format('YYYY-MM-01')
      const [{ data: freq }, { data: justifs }] = await Promise.all([
        supabase.from('v_client_frequence').select('client_id, nom, potentiel, vm_id, visites_mois_courant, frequence_visite_mensuelle')
          .eq('frequence_respectee', false).not('vm_id', 'is', null),
        supabase.from('justifications_frequence').select('client_id, vm_id').eq('mois', moisCourant)
      ])
      const vmNomById = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]))
      setSousVisites(
        (freq ?? [])
          .filter((f): f is typeof f & { client_id: string; nom: string; potentiel: string; vm_id: string } =>
            !!f.client_id && !!f.nom && !!f.potentiel && !!f.vm_id)
          .map((f) => ({
            client_id: f.client_id, nom: f.nom, potentiel: f.potentiel, vm_id: f.vm_id,
            vm_nom: vmNomById[f.vm_id] ?? '—',
            equipe_id: vmEquipeMap[f.vm_id] ?? null,
            visites_mois_courant: f.visites_mois_courant ?? 0,
            frequence_visite_mensuelle: f.frequence_visite_mensuelle ?? 0,
            justifie: (justifs ?? []).some((j) => j.client_id === f.client_id && j.vm_id === f.vm_id)
          }))
      )

      const semaineCouranteScore = isoWeekMonday().format('YYYY-MM-DD')
      const { data: scores } = await supabase.from('v_score_hebdomadaire_pondere').select('vm_id, score_pondere_pourcentage').eq('semaine_debut', semaineCouranteScore)
      setScoresPonderes(
        (scores ?? [])
          .filter((s): s is typeof s & { vm_id: string; score_pondere_pourcentage: number } => !!s.vm_id && s.score_pondere_pourcentage != null)
          .map((s) => ({ vm_id: s.vm_id, vm_nom: vmNomById[s.vm_id] ?? '—', equipe_id: vmEquipeMap[s.vm_id] ?? null, score: s.score_pondere_pourcentage }))
          .sort((a, b) => a.score - b.score)
      )

      setLoading(false)
    }
    load()
  }, [profile?.id, profile?.role])

  async function exporterEvaluations() {
    setExporting(true)
    const { data: vms } = await supabase.from('profiles').select('id, full_name').eq('role', 'vm').order('full_name')
    const lignes: string[][] = [['Visiteur médical', 'Mois', 'Taux couverture (%)', 'Ponctualité (%)', 'Exécution planning (%)', 'Discipline clôtures (%)', 'Score global (%)']]

    for (const vm of vms ?? []) {
      const { data: s } = await supabase.rpc('score_mensuel_vm', { p_vm_id: vm.id, p_mois: moisExport }).single()
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

  const progressFiltre = equipeFilter ? progress.filter((p) => p.equipe_id === equipeFilter) : progress
  const sousVisitesFiltre = equipeFilter ? sousVisites.filter((s) => s.equipe_id === equipeFilter) : sousVisites
  const cloturesFiltre = equipeFilter ? clotures.filter((c) => vmEquipeById[c.vm_id] === equipeFilter) : clotures
  const vmsSansPlanningFiltre = equipeFilter ? vmsSansPlanning.filter((v) => v.equipe_id === equipeFilter) : vmsSansPlanning
  const scoresPonderesFiltre = equipeFilter ? scoresPonderes.filter((s) => s.equipe_id === equipeFilter) : scoresPonderes

  const totalPrevues = progressFiltre.reduce((s, p) => s + p.prevues, 0)
  const totalRealisees = progressFiltre.reduce((s, p) => s + p.realisees, 0)
  const enRetard = progressFiltre.filter((p) => p.prevues > 0 && p.realisees < p.prevues).length

  const parEquipe = Object.entries(
    progressFiltre.reduce<Record<string, { prevues: number; realisees: number }>>((acc, p) => {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Tableau de bord — {dayjs().format('dddd D MMMM')}</h1>
          <p className="text-sm text-ink-400">Suivi en temps réel de l'activité terrain</p>
        </div>
        {equipes.length > 0 && (
          <select value={equipeFilter} onChange={(e) => setEquipeFilter(e.target.value)}
            className="rounded-xl border border-ink-200 px-3.5 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
            <option value="">Toutes les équipes</option>
            {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="VM actifs" value={progressFiltre.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
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
            {progressFiltre.map((p) => (
              <div key={p.vm_id} className="flex items-center gap-3">
                <span className="text-xs font-medium text-ink-600 w-28 truncate">{p.full_name}</span>
                <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-royal-500 to-emerald-500"
                    style={{ width: `${p.prevues ? Math.min(100, (p.realisees / p.prevues) * 100) : 0}%` }} />
                </div>
                <span className="text-[11px] text-ink-400 w-10 text-right">{p.realisees}/{p.prevues}</span>
                {p.conforme !== null && (
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${p.conforme ? 'bg-emerald-500' : 'bg-red-500'}`}
                    title={p.conforme ? 'Journée conforme au seuil' : 'Journée sous le seuil de conformité'} />
                )}
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

      {vmsSansPlanningFiltre.length > 0 && (
        <Card className="border border-flame-200 bg-flame-50/50">
          <p className="text-sm font-bold text-flame-700 flex items-center gap-2">
            <IconAlert className="h-4 w-4" /> VM n'ayant pas encore commencé leur planning ({vmsSansPlanningFiltre.length})
          </p>
          <p className="text-xs text-ink-500 mb-4">Aucun programme, même en brouillon, pour la semaine prochaine</p>
          <div className="flex flex-wrap gap-2">
            {vmsSansPlanningFiltre.map((v) => (
              <span key={v.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 border border-flame-200">
                {v.full_name}{v.equipe && <span className="text-ink-400 font-normal"> · {v.equipe}</span>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {sousVisitesFiltre.length > 0 && (
        <Card>
          <p className="text-sm font-bold text-ink-800">Clients sous-visités ce mois</p>
          <p className="text-xs text-ink-400 mb-4">Fréquence de visite non respectée — justification VM attendue pour chacun</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sousVisitesFiltre.map((s) => (
              <div key={`${s.client_id}-${s.vm_id}`} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink-800 truncate">{s.nom}</p>
                  <p className="text-[10px] text-ink-400">{s.vm_nom} · {s.visites_mois_courant}/{s.frequence_visite_mensuelle} visite(s) ce mois</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${s.justifie ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {s.justifie ? 'Justifié' : 'Non justifié'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {scoresPonderesFiltre.length > 0 && (
        <Card>
          <p className="text-sm font-bold text-ink-800">Score pondéré de la semaine (priorité spécialités)</p>
          <p className="text-xs text-ink-400 mb-4">Visites médicales réalisées vs prévues, pondérées par priorité de spécialité (gynéco &gt; généralistes &gt; dispensaires/maternités &gt; pédiatres &gt; autres)</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {scoresPonderesFiltre.map((s) => (
              <div key={s.vm_id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-2.5">
                <p className="text-xs font-semibold text-ink-800 truncate">{s.vm_nom}</p>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  s.score >= 80 ? 'bg-emerald-50 text-emerald-700' : s.score >= 50 ? 'bg-flame-50 text-flame-700' : 'bg-red-50 text-red-600'
                }`}>
                  {s.score}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="text-sm font-bold text-ink-800">Clôtures du jour</p>
        <p className="text-xs text-ink-400 mb-4">Fiche papier photographiée, en regard des données saisies numériquement</p>
        {cloturesFiltre.length === 0 ? (
          <p className="text-xs text-ink-400 py-2">Aucune clôture enregistrée pour l'instant aujourd'hui.</p>
        ) : (
          <div className="space-y-2">
            {cloturesFiltre.map((c) => (
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
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink-800">Indicateurs d'animation</p>
            <p className="text-xs text-ink-400">Duo terrain, reporting, plans, points/réunions, challenges, formation, coaching… par superviseur</p>
          </div>
          <Link to="/admin/indicateurs-animation">
            <Button size="sm" variant="secondary">Voir le détail</Button>
          </Link>
        </Card>
      )}
    </div>
  )
}
