import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

dayjs.locale('fr')

type Vm = { id: string; full_name: string; equipe_id: string | null }
type Daily = { vm_id: string; jour: string; visites_prevues: number; visites_realisees: number; taux_realisation: number }
type Portfolio = { vm_id: string; client_id: string; clients: { actif: boolean | null; specialite: string | null; categorie: string | null } | null }
type Visit = { id: string; vm_id: string; client_id: string | null; jour: string; statut: string; hors_programme: boolean | null; programme_ligne_id: string | null; specialite: string | null; clients: { specialite: string | null; categorie: string | null } | null }
type ApprovedLine = { vm_id: string; programme_id: string; jour: string; date_visite: string; specialite: string | null; programme_statut: string; statut_reel: string }
type DayApproval = { programme_id: string; jour: string; statut: string }
type Guard = { vm_id: string; jour: string; statut: string }

type Row = {
  id: string; name: string; team: string; planned: number; done: number; rate: number; rateNumerator: number; rateDenominator: number
  portfolio: number; covered: number; coverage: number; medical: number; pharmacy: number
  guards: number; outOfProgram: number; points: number
}
type SpecialtyStat = { vm_id: string; name: string; portfolio: number; covered: number }

const pct = (n: number, d: number) => d ? Math.round(n / d * 100) : 0
const pharmacy = (v: { specialite?: string | null; categorie?: string | null } | null | undefined) =>
  (v?.specialite ?? '').toUpperCase() === 'PHARMACIE' || (v?.categorie ?? '').toLocaleLowerCase('fr').includes('pharm')
const specialtyName = (value: string | null | undefined) => {
  const labels: Record<string, string> = {
    GENERALISTE: 'Généralistes', GYNECOLOGUE: 'Gynécologues', PEDIATRE: 'Pédiatres',
    CARDIOLOGUE: 'Cardiologues', RHUMATOLOGUE: 'Rhumatologues', ORL: 'ORL',
    AUTRE_SPECIALITE: 'Autres spécialités', MATERNITE: 'Maternités',
    DISPENSAIRE: 'Dispensaires', PHARMACIE: 'Pharmacies', IDE: 'IDE'
  }
  return value ? (labels[value] ?? value) : 'Non renseignée'
}

export default function CouvertureMensuelle() {
  const { profile } = useAuth()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [teamFilter, setTeamFilter] = useState('all')
  const [rows, setRows] = useState<Row[]>([])
  const [weekly, setWeekly] = useState<{ week: string; planned: number; done: number }[]>([])
  const [specialties, setSpecialties] = useState<SpecialtyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      const start = dayjs(month + '-01').startOf('month').format('YYYY-MM-DD')
      const end = dayjs(month + '-01').endOf('month').format('YYYY-MM-DD')
      const [{ data: teamRows }, vmsRes, teamsRes, dailyRes, portfolioRes, visitsRes, linesRes, approvalsRes, guardsRes] = await Promise.all([
        profile?.role === 'superviseur' ? supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id) : Promise.resolve({ data: [] as { equipe_id: string }[] }),
        supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm').eq('actif', true).order('full_name'),
        supabase.from('equipes').select('id, nom').order('nom'),
        supabase.from('v_taux_realisation_journalier').select('vm_id, jour, visites_prevues, visites_realisees, taux_realisation').gte('jour', start).lte('jour', end),
        supabase.from('portefeuille').select('vm_id, client_id, clients!inner(actif, specialite, categorie)').eq('clients.actif', true),
        supabase.from('visites').select('id, vm_id, client_id, jour, statut, hors_programme, programme_ligne_id, clients(specialite, categorie)').gte('jour', start).lte('jour', end),
        supabase.from('v_lignes_avec_statut').select('vm_id, programme_id, jour, date_visite, specialite, programme_statut, statut_reel').gte('date_visite', start).lte('date_visite', end),
        supabase.from('programme_jours_validation').select('programme_id, jour, statut').eq('statut', 'VALIDE'),
        supabase.from('gardes').select('vm_id, jour, statut').gte('jour', start).lte('jour', end).eq('statut', 'TERMINEE')
      ])
      if (cancelled) return
      const failure = [vmsRes, dailyRes, portfolioRes, visitsRes, linesRes, approvalsRes, guardsRes].find(r => r.error)
      if (failure?.error) { setError(failure.error.message); setLoading(false); return }
      const teamNames = new Map((teamsRes.data ?? []).map(t => [t.id, t.nom]))
      const allowedTeams = new Set((teamRows ?? []).map(t => t.equipe_id))
      const scopedVms = (vmsRes.data ?? []).filter((vm: Vm) => profile?.role !== 'superviseur' || (!!vm.equipe_id && allowedTeams.has(vm.equipe_id)))
      const daily = (dailyRes.data ?? []) as Daily[]
      const portfolios = (portfolioRes.data ?? []) as unknown as Portfolio[]
      const visits = (visitsRes.data ?? []) as unknown as Visit[]
      const lines = (linesRes.data ?? []) as ApprovedLine[]
      const approvals = (approvalsRes.data ?? []) as DayApproval[]
      const guards = (guardsRes.data ?? []) as Guard[]
      const approvedKeys = new Set(approvals.map(a => a.programme_id + '|' + a.jour))
      const approvedLines = lines.filter(l => ['VALIDE', 'VERROUILLE'].includes(l.programme_statut) || approvedKeys.has(l.programme_id + '|' + l.jour))
      const specialtyCoverage = new Map<string, SpecialtyStat>()
      for (const item of portfolios) {
        if (!item.clients || !item.client_id) continue
        const name = specialtyName(item.clients.specialite)
        const key = item.vm_id + '|' + name
        const stat = specialtyCoverage.get(key) ?? { vm_id: item.vm_id, name, portfolio: 0, covered: 0 }
        stat.portfolio += 1
        specialtyCoverage.set(key, stat)
      }
      const coveredByVmSpecialty = new Map<string, Set<string>>()
      for (const visit of visits) {
        if (!visit.client_id || !(visit.statut === 'REALISEE' || visit.statut === 'HORS_PROGRAMME')) continue
        const portfolioItem = portfolios.find(p => p.vm_id === visit.vm_id && p.client_id === visit.client_id)
        if (!portfolioItem?.clients) continue
        const name = specialtyName(portfolioItem.clients.specialite)
        const key = visit.vm_id + '|' + name
        const covered = coveredByVmSpecialty.get(key) ?? new Set<string>()
        covered.add(visit.client_id)
        coveredByVmSpecialty.set(key, covered)
      }
      for (const [key, stat] of specialtyCoverage) stat.covered = coveredByVmSpecialty.get(key)?.size ?? 0
      const computed: Row[] = scopedVms.map((vm: Vm) => {
        const ownDaily = daily.filter(d => d.vm_id === vm.id)
        const planned = ownDaily.reduce((s, d) => s + Number(d.visites_prevues || 0), 0)
        const done = ownDaily.reduce((s, d) => s + Number(d.visites_realisees || 0), 0)
        const isFawaz = vm.full_name.toLocaleLowerCase('fr').includes('fawaz')
        const ownPortfolio = portfolios.filter(p => p.vm_id === vm.id)
        const portfolioIds = new Set(ownPortfolio.map(p => p.client_id))
        const ownVisits = visits.filter(v => v.vm_id === vm.id)
        const completedVisits = ownVisits.filter(v => v.statut === 'REALISEE' || v.statut === 'HORS_PROGRAMME')
        const ownPortfolioVisits = completedVisits.filter(v => !!v.client_id && portfolioIds.has(v.client_id))
        const coveredIds = new Set(ownPortfolioVisits.map(v => v.client_id as string))
        const ownGuards = guards.filter(g => g.vm_id === vm.id).length
        const ownOutOfProgram = completedVisits.filter(v => v.hors_programme === true || v.statut === 'HORS_PROGRAMME').length
        return {
          id: vm.id, name: vm.full_name, team: vm.equipe_id ? (teamNames.get(vm.equipe_id) ?? '—') : 'Sans équipe',
          planned, done, rate: isFawaz && ownDaily.length
            ? Math.round(ownDaily.reduce((s, d) => s + Number(d.taux_realisation || 0), 0) / ownDaily.length * 100)
            : pct(done, planned),
          rateNumerator: isFawaz ? ownDaily.reduce((s, d) => s + Math.min(Number(d.visites_realisees || 0), 12), 0) : done,
          rateDenominator: isFawaz ? ownDaily.length * 12 : planned,
          portfolio: portfolioIds.size, covered: coveredIds.size, coverage: pct(coveredIds.size, portfolioIds.size),
          medical: ownPortfolioVisits.filter(v => !pharmacy(v.clients)).length,
          pharmacy: ownPortfolioVisits.filter(v => pharmacy(v.clients)).length,
          guards: ownGuards, outOfProgram: ownOutOfProgram, points: ownGuards * 3 + ownOutOfProgram * 1.5
        }
      })
      setRows(computed)
      setSpecialties([...specialtyCoverage.values()].sort((a, b) => b.covered / Math.max(1, b.portfolio) - a.covered / Math.max(1, a.portfolio)))
      const weeks = new Map<string, { week: string; planned: number; done: number }>()
      for (const d of daily) {
        const key = dayjs(d.jour).startOf('week').format('YYYY-MM-DD')
        const item = weeks.get(key) ?? { week: key, planned: 0, done: 0 }
        item.planned += Number(d.visites_prevues || 0); item.done += Number(d.visites_realisees || 0)
        weeks.set(key, item)
      }
      setWeekly([...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [month, profile?.id, profile?.role])

  const visible = useMemo(() => teamFilter === 'all' ? rows : rows.filter(r => r.team === teamFilter), [rows, teamFilter])
  const visibleIds = new Set(visible.map(r => r.id))
  const total = visible.reduce((a, r) => ({
    planned: a.planned + r.planned, done: a.done + r.done, rateNumerator: a.rateNumerator + r.rateNumerator, rateDenominator: a.rateDenominator + r.rateDenominator, portfolio: a.portfolio + r.portfolio,
    covered: a.covered + r.covered, medical: a.medical + r.medical, pharmacy: a.pharmacy + r.pharmacy,
    guards: a.guards + r.guards, outOfProgram: a.outOfProgram + r.outOfProgram, points: a.points + r.points
  }), { planned: 0, done: 0, rateNumerator: 0, rateDenominator: 0, portfolio: 0, covered: 0, medical: 0, pharmacy: 0, guards: 0, outOfProgram: 0, points: 0 })
  const visibleSpecialties = specialties.filter(s => visibleIds.has(s.vm_id)).sort((a,b) => b.covered / Math.max(1,b.portfolio) - a.covered / Math.max(1,a.portfolio))
  const teamOptions = [...new Set(rows.map(r => r.team))].sort()

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-royal-600">CRM · Pilotage mensuel</p><h1 className="mt-1 text-2xl font-extrabold text-ink-800 font-display">Bilan mensuel des visites</h1><p className="mt-1 text-sm text-ink-400">Réalisation, gardes et points cumulés par visiteur médical.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink-500">Mois<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="mt-1 block rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" /></label>
        <label className="text-xs text-ink-500">Équipe<select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="mt-1 block min-w-36 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"><option value="all">Toutes</option>{teamOptions.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      </div>
    </div>
    {error && <Card><p className="text-sm text-red-600">Impossible de charger le bilan : {error}</p></Card>}
    {loading ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/></div> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Taux de réalisation" value={pct(total.rateNumerator, total.rateDenominator)} suffix="%" sub={total.done + ' / ' + total.planned + ' visites validées'} tone="royal" />
        <StatCard label="Gardes terminées" value={total.guards} sub={total.guards + ' × 3 points'} tone="emerald" />
        <StatCard label="Visites hors programme" value={total.outOfProgram} sub={total.outOfProgram + ' × 1,5 point'} tone="flame" />
        <StatCard label="Points cumulés du mois" value={total.points} decimals={1} sub="Gardes + visites hors programme" tone="ink" />
      </div>
      <Card>
        <div className="mb-4"><h2 className="font-bold text-ink-800">Couverture du portefeuille par spécialité et par VM</h2><p className="text-xs text-ink-400 mt-1">Part des clients actifs de chaque spécialité effectivement visités au moins une fois pendant le mois.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs text-ink-400"><th className="py-3 pr-3">VM</th><th className="py-3 px-2">Spécialité</th><th className="py-3 px-2 text-right">Portefeuille</th><th className="py-3 px-2 text-right">Couverts</th><th className="py-3 pl-2 text-right">Couverture</th></tr></thead><tbody>{visibleSpecialties.map(s => <tr key={s.vm_id+'-'+s.name} className="border-b border-ink-50 last:border-0"><td className="py-3 pr-3 font-semibold text-ink-800">{rows.find(r=>r.id===s.vm_id)?.name??'VM'}</td><td className="px-2">{s.name}</td><td className="px-2 text-right">{s.portfolio}</td><td className="px-2 text-right">{s.covered}</td><td className="pl-2 text-right font-bold text-royal-700">{pct(s.covered,s.portfolio)}%</td></tr>)}</tbody></table></div>
      </Card>
      <Card>
        <div className="mb-4"><h2 className="font-bold text-ink-800">Synthèse par VM</h2><p className="text-xs text-ink-400 mt-1">Les colonnes gardes et hors programme restent distinctes du taux de réalisation classique.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs text-ink-400"><th className="py-3 pr-3">Visiteur médical</th><th className="py-3 px-2">Équipe</th><th className="py-3 px-2 text-right">Prévues</th><th className="py-3 px-2 text-right">Réalisées</th><th className="py-3 px-2 text-right">Taux</th><th className="py-3 px-2 text-right">Gardes</th><th className="py-3 px-2 text-right">Hors prog.</th><th className="py-3 px-2 text-right">Points</th><th className="py-3 pl-2 text-right">Couverture</th></tr></thead><tbody>{[...visible].sort((a,b) => b.points-a.points || b.rate-a.rate).map(r => <tr key={r.id} className="border-b border-ink-50 last:border-0"><td className="py-3 pr-3 font-semibold text-ink-800">{r.name}</td><td className="px-2 text-ink-500">{r.team}</td><td className="px-2 text-right">{r.planned}</td><td className="px-2 text-right">{r.done}</td><td className="px-2 text-right font-bold">{r.rate}%</td><td className="px-2 text-right">{r.guards}</td><td className="px-2 text-right">{r.outOfProgram}</td><td className="px-2 text-right font-extrabold text-royal-700">{r.points.toFixed(1)}</td><td className="pl-2 text-right">{r.coverage}%</td></tr>)}</tbody></table></div>
        {visible.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Aucun VM actif pour cette sélection.</p>}
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><h2 className="font-bold text-ink-800">Évolution hebdomadaire</h2><p className="text-xs text-ink-400 mt-1 mb-4">Visites réalisées / visites prévues et validées</p><div className="space-y-4">{weekly.map(w => <div key={w.week}><div className="mb-1 flex justify-between text-xs"><span className="text-ink-600">Semaine du {dayjs(w.week).format('DD/MM')}</span><strong className="text-ink-800">{pct(w.done,w.planned)}% · {w.done}/{w.planned}</strong></div><div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-royal-600" style={{width: pct(w.done,w.planned)+'%'}} /></div></div>)}{weekly.length===0 && <p className="text-sm text-ink-400">Aucune donnée sur ce mois.</p>}</div></Card>
        <Card><h2 className="font-bold text-ink-800">Couverture du portefeuille</h2><p className="text-xs text-ink-400 mt-1 mb-4">Clients actifs distincts visités au moins une fois dans le mois</p><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">Clients médicaux visités</p><p className="mt-2 text-2xl font-extrabold text-ink-800">{total.medical}</p></div><div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">Pharmacies visitées</p><p className="mt-2 text-2xl font-extrabold text-ink-800">{total.pharmacy}</p></div></div><p className="mt-4 text-xs text-ink-400">Un client est compté une seule fois dans la couverture, même s'il a reçu plusieurs visites pendant le mois.</p></Card>
      </div>
      <p className="text-xs text-ink-400">Points mensuels = (gardes terminées × 3) + (visites hors programme réalisées × 1,5). Les visites classiques sont suivies par leur taux de réalisation, sans points supplémentaires. Aucun paiement automatique n'est déclenché.</p>
    </>}
  </div>
}
