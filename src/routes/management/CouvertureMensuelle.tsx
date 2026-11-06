import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'

dayjs.locale('fr')

type Vm = { id: string; full_name: string; equipe_id: string | null }
type Daily = { vm_id: string; jour: string; visites_prevues: number; visites_realisees: number }
type Portfolio = { vm_id: string; client_id: string; clients: { actif: boolean | null; categorie: string | null } | null }
type Visit = { vm_id: string; client_id: string | null; jour: string; statut: string; clients: { categorie: string | null } | null }

type Row = {
  id: string; name: string; team: string; planned: number; done: number; rate: number
  portfolio: number; covered: number; coverage: number; medical: number; pharmacy: number
}

const pct = (n: number, d: number) => d ? Math.round(n / d * 100) : 0
const isPharmacy = (v: { categorie?: string | null } | null | undefined) =>
  (v?.categorie ?? '').toLocaleLowerCase('fr').includes('pharm')

export default function CouvertureMensuelle() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [teamFilter, setTeamFilter] = useState('all')
  const [teams, setTeams] = useState<{ id: string; nom: string }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [weekly, setWeekly] = useState<{ week: string; planned: number; done: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      const start = dayjs(month + '-01').startOf('month').format('YYYY-MM-DD')
      const end = dayjs(month + '-01').endOf('month').format('YYYY-MM-DD')
      const [{ data: vms, error: vmErr }, { data: teamData }, { data: daily, error: dailyErr }, { data: portfolio, error: portfolioErr }, { data: visits, error: visitsErr }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm').eq('actif', true).order('full_name'),
        supabase.from('equipes').select('id, nom').order('nom'),
        supabase.from('v_taux_realisation_journalier').select('vm_id, jour, visites_prevues, visites_realisees').gte('jour', start).lte('jour', end),
        supabase.from('portefeuille').select('vm_id, client_id, clients!inner(actif, categorie)').eq('clients.actif', true),
        supabase.from('visites').select('vm_id, client_id, jour, statut, clients(categorie)').gte('jour', start).lte('jour', end).eq('statut', 'REALISEE')
      ])
      if (cancelled) return
      const err = vmErr || dailyErr || portfolioErr || visitsErr
      if (err) { setError(err.message); setLoading(false); return }
      const teamNames = new Map((teamData ?? []).map(t => [t.id, t.nom]))
      setTeams(teamData ?? [])
      const dailyRows = (daily ?? []) as Daily[]
      const portRows = (portfolio ?? []) as unknown as Portfolio[]
      const visitRows = (visits ?? []) as unknown as Visit[]
      const computed: Row[] = (vms ?? []).map((vm: Vm) => {
        const ownDaily = dailyRows.filter(d => d.vm_id === vm.id)
        const planned = ownDaily.reduce((s, d) => s + Number(d.visites_prevues || 0), 0)
        const done = ownDaily.reduce((s, d) => s + Number(d.visites_realisees || 0), 0)
        const ownPortfolio = portRows.filter(p => p.vm_id === vm.id)
        const portfolioIds = new Set(ownPortfolio.map(p => p.client_id))
        const ownVisits = visitRows.filter(v => v.vm_id === vm.id && !!v.client_id && portfolioIds.has(v.client_id))
        const coveredIds = new Set(ownVisits.map(v => v.client_id as string))
        const medical = ownVisits.filter(v => !isPharmacy(v.clients)).length
        const pharmacy = ownVisits.filter(v => isPharmacy(v.clients)).length
        return {
          id: vm.id, name: vm.full_name, team: vm.equipe_id ? (teamNames.get(vm.equipe_id) ?? '—') : 'Sans équipe',
          planned, done, rate: pct(done, planned), portfolio: portfolioIds.size, covered: coveredIds.size,
          coverage: pct(coveredIds.size, portfolioIds.size), medical, pharmacy
        }
      })
      setRows(computed)
      const weeks = new Map<string, { week: string; planned: number; done: number }>()
      for (const d of dailyRows) {
        const key = dayjs(d.jour).startOf('week').format('YYYY-MM-DD')
        const item = weeks.get(key) ?? { week: key, planned: 0, done: 0 }
        item.planned += Number(d.visites_prevues || 0); item.done += Number(d.visites_realisees || 0)
        weeks.set(key, item)
      }
      setWeekly([...weeks.values()].sort((a,b) => a.week.localeCompare(b.week)))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [month])

  const visible = useMemo(() => teamFilter === 'all' ? rows : rows.filter(r => r.team === teamFilter), [rows, teamFilter])
  const totals = useMemo(() => visible.reduce((a, r) => ({
    planned: a.planned + r.planned, done: a.done + r.done,
    portfolio: a.portfolio + r.portfolio, covered: a.covered + r.covered,
    medical: a.medical + r.medical, pharmacy: a.pharmacy + r.pharmacy
  }), { planned: 0, done: 0, portfolio: 0, covered: 0, medical: 0, pharmacy: 0 }), [visible])
  const teamOptions = [...new Set(rows.map(r => r.team))].sort()

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-royal-600">CRM · Pilotage mensuel</p><h1 className="mt-1 text-2xl font-extrabold text-ink-800 font-display">Couverture & réalisation</h1><p className="mt-1 text-sm text-ink-400">Bilan mensuel individuel et collectif des visiteurs médicaux.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink-500">Mois<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="mt-1 block rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" /></label>
        <label className="text-xs text-ink-500">Équipe<select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="mt-1 block min-w-36 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"><option value="all">Toutes</option>{teamOptions.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      </div>
    </div>
    {error && <Card><p className="text-sm text-red-600">Impossible de charger le bilan : {error}</p></Card>}
    {loading ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/></div> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Taux de réalisation" value={pct(totals.done, totals.planned) + '%'} hint={totals.done + ' / ' + totals.planned + ' visites validées'} tone="royal" />
        <StatCard label="Couverture portefeuille" value={pct(totals.covered, totals.portfolio) + '%'} hint={totals.covered + ' clients visités / ' + totals.portfolio + ' attribués'} tone="emerald" />
        <StatCard label="Visites réalisées" value={totals.done} hint="Sur programmes validés" tone="blue" />
        <StatCard label="Clients distincts couverts" value={totals.covered} hint={totals.medical + ' médicaux · ' + totals.pharmacy + ' pharmacies'} tone="amber" />
      </div>
      <Card>
        <div className="mb-4"><h2 className="font-bold text-ink-800">Résultats par VM</h2><p className="text-xs text-ink-400 mt-1">Le taux de réalisation est calculé sur les visites réalisées divisées par les visites prévues dans les journées validées. La couverture compte les clients actifs distincts du portefeuille visités au moins une fois.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs text-ink-400"><th className="py-3 pr-3">Visiteur médical</th><th className="py-3 px-2">Équipe</th><th className="py-3 px-2 text-right">Prévues</th><th className="py-3 px-2 text-right">Réalisées</th><th className="py-3 px-2 text-right">Réalisation</th><th className="py-3 px-2 text-right">Portefeuille couvert</th><th className="py-3 pl-2 text-right">Couverture</th></tr></thead><tbody>{visible.sort((a,b) => b.rate-a.rate).map(r => <tr key={r.id} className="border-b border-ink-50 last:border-0"><td className="py-3 pr-3 font-semibold text-ink-800">{r.name}</td><td className="px-2 text-ink-500">{r.team}</td><td className="px-2 text-right tabular-nums">{r.planned}</td><td className="px-2 text-right tabular-nums">{r.done}</td><td className="px-2 text-right"><span className={r.rate >= 90 ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{r.rate}%</span></td><td className="px-2 text-right tabular-nums">{r.covered} / {r.portfolio}</td><td className="pl-2 text-right font-bold text-royal-700">{r.coverage}%</td></tr>)}</tbody></table></div>
        {visible.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Aucun VM actif pour cette sélection.</p>}
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><h2 className="font-bold text-ink-800">Évolution hebdomadaire</h2><p className="text-xs text-ink-400 mt-1 mb-4">Visites réalisées / visites prévues et validées</p><div className="space-y-4">{weekly.map(w => <div key={w.week}><div className="mb-1 flex justify-between text-xs"><span className="text-ink-600">Semaine du {dayjs(w.week).format('DD/MM')}</span><strong className="text-ink-800">{pct(w.done,w.planned)}% · {w.done}/{w.planned}</strong></div><div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-royal-600" style={{width: pct(w.done,w.planned)+'%'}} /></div></div>)}{weekly.length===0 && <p className="text-sm text-ink-400">Aucune donnée sur ce mois.</p>}</Card>
        <Card><h2 className="font-bold text-ink-800">Détail de la couverture</h2><p className="text-xs text-ink-400 mt-1 mb-4">Visites réalisées auprès des clients actifs du portefeuille</p><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">Clients médicaux visités</p><p className="mt-2 text-2xl font-extrabold text-ink-800">{totals.medical}</p></div><div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">Pharmacies visitées</p><p className="mt-2 text-2xl font-extrabold text-ink-800">{totals.pharmacy}</p></div></div><p className="mt-4 text-xs text-ink-400">Un client est compté une seule fois dans la couverture, même s'il a reçu plusieurs visites pendant le mois.</p></Card>
      </div>
      <p className="text-xs text-ink-400">Ce tableau sert au suivi CRM mensuel. Il ne déclenche aucun calcul ni paiement automatique. Les visites hors programme ne gonflent pas le taux de réalisation ; elles peuvent toutefois compter dans la couverture si le client appartient au portefeuille actif.</p>
    </>}
  </div>
}
