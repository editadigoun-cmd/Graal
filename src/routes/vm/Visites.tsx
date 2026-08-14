import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCheckCircle, IconChevronRight, IconAlert, IconDownload, IconMoon } from '@/components/ui/icons'
import { useVisitesDuJour } from '@/features/data/useVisitesDuJour'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { nowBenin, todayBenin } from '@/lib/time'
import { ouvrirFicheJour } from '@/lib/pdf'
import dayjs from 'dayjs'

export default function Visites() {
  const { session } = useAuth()
  const { lignes, loading } = useVisitesDuJour()
  const [exporting, setExporting] = useState(false)
  const [cloture, setCloture] = useState<{ statut: string; heure_cloture: string | null } | null | undefined>(undefined)
  const restantes = lignes.filter((l) => l.statut_reel === 'EN_ATTENTE')
  const faites = lignes.filter((l) => l.statut_reel !== 'EN_ATTENTE')

  useEffect(() => {
    if (!session) return
    supabase.from('clotures_journalieres').select('statut, heure_cloture')
      .eq('vm_id', session.user.id).eq('jour', todayBenin().format('YYYY-MM-DD')).maybeSingle()
      .then(({ data }) => setCloture(data ?? null))
  }, [session])

  async function exporterFiche() {
    setExporting(true)
    try {
      await ouvrirFicheJour(todayBenin().format('YYYY-MM-DD'))
    } catch (e) {
      // Le programme n'est peut-être pas encore validé — silencieux, l'action est secondaire.
    } finally {
      setExporting(false)
    }
  }

  const estCloturee = cloture?.statut === 'CLOTUREE' || cloture?.statut === 'CLOTUREE_FORCEE'

  if (estCloturee) {
    return (
      <div className="space-y-4 mt-2 pb-4">
        <div className="mt-6 flex flex-col items-center text-center px-4">
          <div className="rounded-full bg-emerald-50 p-4"><IconCheckCircle className="h-10 w-10 text-emerald-600" /></div>
          <p className="mt-4 text-lg font-bold text-ink-800 font-display">Journée déjà clôturée</p>
          <p className="mt-1 text-sm text-ink-400 max-w-xs">
            {cloture?.heure_cloture ? `Clôturée à ${dayjs(cloture.heure_cloture).format('HH:mm')}. ` : ''}
            Vos résultats alimentent votre score de performance. À demain !
          </p>
        </div>

        <Link to="/app/garde">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-royal-300 bg-royal-50 p-4">
            <IconMoon className="h-5 w-5 text-royal-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-royal-700">Visite de garde</p>
              <p className="text-[11px] text-royal-600/80">Client de votre portefeuille visité en heures de garde</p>
            </div>
            <IconChevronRight className="h-4 w-4 text-royal-500" />
          </div>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink-800 font-display">Visites du jour</h1>
          <p className="text-xs text-ink-400 capitalize">{nowBenin().format('dddd D MMMM')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exporterFiche} disabled={exporting} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-ink-500 shadow-softer">
            <IconDownload className="h-4 w-4" />
          </button>
          <Link to="/app/cloture">
            <Button size="sm" variant="secondary">Clôturer</Button>
          </Link>
        </div>
      </div>

      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}

      {!loading && lignes.length === 0 && (
        <Card className="text-center py-10">
          <p className="text-sm font-semibold text-ink-500">Aucune visite programmée aujourd'hui</p>
          <p className="text-xs text-ink-400 mt-1">Vérifiez que votre programme hebdomadaire a bien été validé.</p>
        </Card>
      )}

      <div className="space-y-2.5">
        {restantes.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} />)}
      </div>

      {faites.length > 0 && (
        <>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide pt-2">Traitées</p>
          <div className="space-y-2.5 opacity-70">
            {faites.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} done />)}
          </div>
        </>
      )}

      <Link to="/app/visites/hors-programme">
        <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-flame-300 bg-flame-50 p-4">
          <IconAlert className="h-5 w-5 text-flame-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-flame-700">Visite hors programme</p>
            <p className="text-[11px] text-flame-600/80">Client non prévu aujourd'hui — motif obligatoire</p>
          </div>
          <IconChevronRight className="h-4 w-4 text-flame-500" />
        </div>
      </Link>
    </div>
  )
}

function VisiteCard({ l, index, done }: { l: ReturnType<typeof useVisitesDuJour>['lignes'][number]; index: number; done?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link to={done ? '#' : `/app/visites/${l.programme_ligne_id}`} className={done ? 'pointer-events-none' : ''}>
        <Card className="flex items-center gap-3 py-3.5">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-royal-50 text-royal-600'}`}>
            {done ? <IconCheckCircle className="h-5 w-5" /> : <span className="text-sm font-bold">{index + 1}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-800 truncate">{l.client_nom}</p>
            <div className="mt-1 flex items-center gap-2">
              {l.potentiel && <PotentielBadge potentiel={l.potentiel} compact />}
              <span className="text-[11px] text-ink-400">{l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
            </div>
          </div>
          {!done && <IconChevronRight className="h-4 w-4 text-ink-300 flex-shrink-0" />}
        </Card>
      </Link>
    </motion.div>
  )
}
