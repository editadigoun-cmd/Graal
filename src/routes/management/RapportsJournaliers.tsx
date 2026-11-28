import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconCalendar, IconClipboard, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'

dayjs.locale('fr')

type Rapport = {
  id: string
  vm_id: string
  jour: string
  type_rapport: string
  points_forts: string | null
  constat_prescription: string | null
  points_faibles: string | null
  commandes_obtenues: string | null
  ventes_obtenues: string | null
  created_at: string
}
type VM = { id: string; full_name: string; equipe_id: string | null }
type Equipe = { id: string; nom: string }

export default function RapportsJournaliers() {
  const [jour, setJour] = useState(() => todayBenin().format('YYYY-MM-DD'))
  const [rapports, setRapports] = useState<Rapport[]>([])
  const [vms, setVms] = useState<Record<string, VM>>({})
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [equipe, setEquipe] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data, error: reportError }, { data: people, error: peopleError }, { data: teams }] = await Promise.all([
      (supabase as any).from('rapports_journaliers_vm').select('*').eq('jour', jour).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, equipe_id').eq('role', 'vm'),
      supabase.from('equipes').select('id, nom').order('nom')
    ])
    if (reportError || peopleError) {
      setError(reportError?.message || peopleError?.message || 'Impossible de charger les rapports.')
    } else {
      setRapports((data ?? []) as Rapport[])
      setVms(Object.fromEntries(((people ?? []) as VM[]).map((vm) => [vm.id, vm])))
      setEquipes((teams ?? []) as Equipe[])
    }
    setLoading(false)
  }, [jour])

  useEffect(() => { void load() }, [load])

  const rapportsFiltres = rapports.filter((r) => !equipe || vms[r.vm_id]?.equipe_id === equipe)
  const pharmacie = rapportsFiltres.filter((r) => r.type_rapport === 'PHARMACIE_ODY2').length
  const standard = rapportsFiltres.length - pharmacie

  function changerJour(delta: number) {
    setJour(dayjs(jour).add(delta, 'day').format('YYYY-MM-DD'))
  }

  return <div className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="rounded-2xl bg-royal-50 p-3 text-royal-600"><IconClipboard className="h-6 w-6" /></div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-royal-600">Suivi des équipes terrain</p>
        <h1 className="text-2xl font-extrabold text-ink-900">Rapports journaliers des VM</h1>
        <p className="text-sm text-ink-500">Consultez les comptes rendus transmis lors de la clôture de journée.</p>
      </div>
    </div>

    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changerJour(-1)} className="rounded-xl border border-ink-200 px-4 py-3 text-sm font-bold">←</button>
          <label className="flex-1 text-xs font-semibold text-ink-500">Date des rapports
            <span className="mt-1 flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5">
              <IconCalendar className="h-4 w-4 text-ink-400" />
              <input type="date" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink-800 outline-none" />
            </span>
          </label>
          <button type="button" onClick={() => changerJour(1)} disabled={jour >= todayBenin().format('YYYY-MM-DD')} className="rounded-xl border border-ink-200 px-4 py-3 text-sm font-bold disabled:opacity-40">→</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setJour(todayBenin().format('YYYY-MM-DD'))} className="rounded-xl bg-royal-50 px-4 py-2.5 text-xs font-bold text-royal-700">Aujourd’hui</button>
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className="min-w-0 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Toutes les équipes visibles</option>
            {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </div>
      </div>
      <p className="text-sm font-semibold capitalize text-ink-700">{dayjs(jour).format('dddd D MMMM YYYY')}</p>
    </Card>

    {error && <Card className="border border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

    {loading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Rapports reçus" value={rapportsFiltres.length} tone="royal" icon={<IconClipboard className="h-4 w-4" />} />
        <StatCard label="Médical & pharmacie" value={standard} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="ODYPHARM2" value={pharmacie} tone="flame" icon={<IconClipboard className="h-4 w-4" />} />
      </div>
      {rapportsFiltres.length === 0 ? <Card className="py-12 text-center">
        <IconClipboard className="mx-auto h-9 w-9 text-ink-300" />
        <p className="mt-3 font-bold text-ink-700">Aucun rapport pour cette date</p>
        <p className="mt-1 text-sm text-ink-400">Les rapports apparaîtront ici après la clôture de journée des VM.</p>
      </Card> : <div className="space-y-4">
        {rapportsFiltres.map((r) => {
          const vm = vms[r.vm_id]
          return <Card key={r.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-ink-900">{vm?.full_name || 'Délégué médical'}</h2>
                <p className="mt-1 text-xs text-ink-400">{equipes.find((e) => e.id === vm?.equipe_id)?.nom || 'Équipe non renseignée'} · {dayjs(r.created_at).format('HH:mm')}</p>
              </div>
              <Badge tone={r.type_rapport === 'PHARMACIE_ODY2' ? 'warning' : 'success'}>{r.type_rapport === 'PHARMACIE_ODY2' ? 'Pharmacie · ODYPHARM2' : 'Médical & pharmacie'}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReportField label="Points forts" value={r.points_forts} />
              {r.type_rapport === 'PHARMACIE_ODY2' ? <>
                <ReportField label="Commandes obtenues" value={r.commandes_obtenues} />
                <ReportField label="Ventes obtenues" value={r.ventes_obtenues} />
              </> : <ReportField label="Points faibles" value={r.points_faibles} />}
              <ReportField label="Constat de prescription" value={r.constat_prescription} wide />
            </div>
          </Card>
        })}
      </div>}
    </>}
  </div>
}

function ReportField({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2' : ''}>
    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
    <div className="whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-800">{value?.trim() || '—'}</div>
  </div>
}
