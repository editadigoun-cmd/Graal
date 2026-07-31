import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'

export interface VmDashboardData {
  visitesPrevues: number
  visitesRealisees: number
  tauxRealisation: number
  scoreCouverture: number
  scoreMensuel: number
  scoreDetail: { taux_couverture: number; ponctualite: number; execution_planning: number; discipline_clotures: number } | null
  tendance: { jour: string; taux: number }[]
  loading: boolean
}

export function useVmDashboard(): VmDashboardData {
  const { session } = useAuth()
  const [data, setData] = useState<Omit<VmDashboardData, 'loading'>>({
    visitesPrevues: 0, visitesRealisees: 0, tauxRealisation: 0,
    scoreCouverture: 0, scoreMensuel: 0, scoreDetail: null, tendance: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    const vmId = session.user.id
    const today = todayBenin().format('YYYY-MM-DD')
    const monthStart = todayBenin().startOf('month').format('YYYY-MM-DD')

    async function load() {
      setLoading(true)
      const [{ data: today7 }, { data: score }, { data: couverture }] = await Promise.all([
        supabase.from('v_taux_realisation_journalier').select('*').gte('jour', todayBenin().subtract(6, 'day').format('YYYY-MM-DD')).lte('jour', today).order('jour'),
        supabase.rpc('score_mensuel_vm', { p_vm_id: vmId, p_mois: monthStart }),
        supabase.from('v_score_couverture_vm').select('*').eq('vm_id', vmId).maybeSingle()
      ])

      const todayRow = today7?.find((r) => r.jour === today)
      const s = Array.isArray(score) ? score[0] : score

      setData({
        visitesPrevues: todayRow?.visites_prevues ?? 0,
        visitesRealisees: todayRow?.visites_realisees ?? 0,
        tauxRealisation: Math.round((todayRow?.taux_realisation ?? 0) * 100),
        scoreCouverture: couverture?.score_pondere ?? 0,
        scoreMensuel: s?.score_global ?? 0,
        scoreDetail: s
          ? {
              taux_couverture: s.taux_couverture, ponctualite: s.ponctualite,
              execution_planning: s.execution_planning, discipline_clotures: s.discipline_clotures
            }
          : null,
        tendance: (today7 ?? []).map((r) => ({ jour: r.jour!, taux: Math.round((r.taux_realisation ?? 0) * 100) }))
      })
      setLoading(false)
    }

    load()
    const channel = supabase
      .channel('vm-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visites', filter: `vm_id=eq.${vmId}` }, load)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  return { ...data, loading }
}
