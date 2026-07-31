import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { CircularProgress } from '@/components/ui/CircularProgress'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconStethoscope, IconCheckCircle, IconTrendingUp, IconMapPin } from '@/components/ui/icons'
import { useVmDashboard } from '@/features/data/useVmDashboard'
import dayjs from 'dayjs'

export default function VmDashboard() {
  const d = useVmDashboard()

  if (d.loading) {
    return (
      <div className="space-y-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Visites prévues" value={d.visitesPrevues} tone="royal" icon={<IconStethoscope className="h-4 w-4" />} sub="Aujourd'hui" />
        <StatCard label="Visites réalisées" value={d.visitesRealisees} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} sub="Aujourd'hui" />
        <StatCard label="Taux de réalisation" value={d.tauxRealisation} suffix="%" tone="flame" icon={<IconTrendingUp className="h-4 w-4" />} sub="Journalier" />
        <StatCard label="Score de couverture" value={d.scoreCouverture} decimals={1} tone="ink" icon={<IconMapPin className="h-4 w-4" />} sub="Points cumulés" />
      </div>

      <Card>
        <div className="flex items-center gap-5">
          <CircularProgress value={d.scoreMensuel} label="ce mois" tone={d.scoreMensuel >= 90 ? 'emerald' : d.scoreMensuel >= 70 ? 'flame' : 'royal'} size={104} />
          <div className="flex-1">
            <p className="text-sm font-bold text-ink-800">Score mensuel de performance</p>
            <p className="text-xs text-ink-400 mt-0.5">Objectif direction : 90%</p>
            {d.scoreDetail && (
              <div className="mt-3 space-y-1.5">
                <ScoreLine label="Couverture portefeuille" value={d.scoreDetail.taux_couverture} />
                <ScoreLine label="Ponctualité programme" value={d.scoreDetail.ponctualite} />
                <ScoreLine label="Exécution du planning" value={d.scoreDetail.execution_planning} />
                <ScoreLine label="Discipline clôtures" value={d.scoreDetail.discipline_clotures} />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Tendance des 7 derniers jours</p>
        <div className="h-36 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.tendance}>
              <defs>
                <linearGradient id="tendanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#154BAD" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#154BAD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="jour" tickFormatter={(v) => dayjs(v).format('ddd')}
                tick={{ fontSize: 11, fill: '#96A0AC' }} axisLine={false} tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Taux de réalisation']}
                labelFormatter={(v) => dayjs(v as string).format('dddd D MMM')}
                contentStyle={{ borderRadius: 12, border: '1px solid #EEF1F5', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="taux" stroke="#154BAD" strokeWidth={2} fill="url(#tendanceFill)" dot={{ r: 3, fill: '#154BAD', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-ink-500">{label}</span>
        <span className="font-semibold text-ink-700">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-royal-500 to-emerald-500" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}
