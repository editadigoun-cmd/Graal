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
  const [exportError, setExportError] = useState<string | null>(null)
  const [cloture, setCloture] = useState<{ statut: string; heure_cloture: string | null } | null | undefined>(undefined)
  const restantes = lignes.filter((l) => l.statut_reel === 'EN_ATTENTE')
  const reportees = restantes.filter((l) => l.reportee)
  const restantesNormales = restantes.filter((l) => !l.reportee)
  const faites = lignes.filter((l) => l.statut_reel !== 'EN_ATTENTE')

  useEffect(() => {
    if (!session) return
    supabase.from('clotures_journalieres').select('statut, heure_cloture')
      .eq('vm_id', session.user.id).eq('jour', todayBenin().format('YYYY-MM-DD')).maybeSingle()
      .then(({ data }) => setCloture(data ?? null))
  }, [session])

  async function exporterFiche() {
    setExporting(true)
    setExportError(null)
    try {
      const maintenant = nowBenin()
      let jourCible = todayBenin()
      // À partir de 20 h, la fiche du prochain jour ouvrable devient téléchargeable.
      if (maintenant.hour() >= 20) {
        jourCible = jourCible.add(1, 'day')
        while (jourCible.day() === 0 || jourCible.day() === 6) {
          jourCible = jourCible.add(1, 'day')
        }
      }
      await ouvrirFicheJour(jourCible.format('YYYY-MM-DD'))
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Impossible de télécharger la fiche. Réessayez.')
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
          <button onClick={exporterFiche} disabled={exporting} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-royal-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            <IconDownload className="h-4 w-4" />
            {exporting ? 'Préparation du PDF…' : 'Télécharger la fiche du prochain jour ouvrable'}
          </button>
          {exportError && <p role="alert" className="mt-3 max-w-sm text-sm text-red-600">{exportError}</p>}
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

      {exportError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p>}

      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}

      {!loading && lignes.length === 0 && (
        <Card className="text-center py-10">
          <p className="text-sm font-semibold text-ink-500">Aucune visite programmée aujourd'hui</p>
          <p className="text-xs text-ink-400 mt-1">Vérifiez que votre programme hebdomadaire a bien été validé.</p>
        </Card>
      )}

      {reportees.length > 0 && (
        <section className="space-y-2.5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-sm font-bold text-amber-900">Visites reportées</p>
            <p className="mt-1 text-xs text-amber-800">Ces visites ont été déplacées depuis un autre jour. Elles restent à effectuer aujourd'hui.</p>
          </div>
          {reportees.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} reported />)}
        </section>
      )}

      {restantesNormales.length > 0 && (
        <section className="space-y-2.5">
          {reportees.length > 0 && <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Visites prévues normalement</p>}
          {restantesNormales.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} />)}
        </section>
      )}

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

function VisiteCard({ l, index, done, reported }: { l: ReturnType<typeof useVisitesDuJour>['lignes'][number]; index: number; done?: boolean; reported?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link to={done ? '#' : `/app/visites/${l.programme_ligne_id}`} className={done ? 'pointer-events-none' : ''}>
        <Card className="flex items-center gap-3 py-3.5">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-royal-50 text-royal-600'}`}>
            {done ? <IconCheckCircle className="h-5 w-5" /> : <span className="text-sm font-bold">{index + 1}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-800 truncate">{l.client_nom}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {l.potentiel && <PotentielBadge potentiel={l.potentiel} compact />}
              <span className="text-[11px] text-ink-400">{l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
              {reported && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Reportée</span>}
            </div>
          </div>
          {!done && <IconChevronRight className="h-4 w-4 text-ink-300 flex-shrink-0" />}
        </Card>
      </Link>
    </motion.div>
  )
}
