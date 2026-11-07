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
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)
  const [, setHorloge] = useState(0)
  const [cloture, setCloture] = useState<{ statut: string; heure_cloture: string | null } | null | undefined>(undefined)
  // NON_FAITE signifie que la visite reste à effectuer : elle ne doit pas apparaître dans « Traitées ».
  const restantes = lignes.filter((l) => l.statut_reel === 'EN_ATTENTE' || l.statut_reel === 'NON_FAITE')
  const faites = lignes.filter((l) => l.statut_reel === 'REALISEE' || l.statut_reel === 'HORS_PROGRAMME')
  const estReportee = (l: typeof lignes[number]) => Boolean((l as typeof l & { reportee?: boolean }).reportee)
  const restantesNormales = restantes.filter((l) => !estReportee(l))
  const restantesReportees = restantes.filter(estReportee)
  const faitesNormales = faites.filter((l) => !estReportee(l))
  const faitesReportees = faites.filter(estReportee)

  useEffect(() => {
    const timer = window.setInterval(() => setHorloge((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('clotures_journalieres').select('statut, heure_cloture')
      .eq('vm_id', session.user.id).eq('jour', todayBenin().format('YYYY-MM-DD')).maybeSingle()
      .then(({ data }) => setCloture(data ?? null))
  }, [session])

  function exporterFiche() {
    setConfirmationOuverte(true)
  }

  async function confirmerTelechargement() {
    const maintenant = nowBenin()
    const jourFiche = maintenant.hour() >= 19 ? prochainJourOuvrable(todayBenin()) : todayBenin()
    setExporting(true)
    try {
      await ouvrirFicheJour(jourFiche.format('YYYY-MM-DD'))
      setConfirmationOuverte(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Impossible de télécharger la fiche pour le moment."
      window.alert(message)
    } finally {
      setExporting(false)
    }
  }

  const estCloturee = cloture?.statut === 'CLOTUREE' || cloture?.statut === 'CLOTUREE_FORCEE'
  const jourFicheAffiche = maintenantJourFiche()
  const maintenant = nowBenin()
  const limiteNormale = maintenant.hour(19).minute(0).second(0).millisecond(0)
  const limiteAutomatique = maintenant.hour(19).minute(0).second(0).millisecond(0)
  const cibleCloture = maintenant.isBefore(limiteNormale) ? limiteNormale : limiteAutomatique
  const secondesRestantes = Math.max(0, cibleCloture.diff(maintenant, 'second'))
  const compteARebours = `${String(Math.floor(secondesRestantes / 3600)).padStart(2, '0')}:${String(Math.floor((secondesRestantes % 3600) / 60)).padStart(2, '0')}:${String(secondesRestantes % 60).padStart(2, '0')}`
  const dialogueTelechargement = (
    <FicheDownloadDialog
      open={confirmationOuverte}
      date={jourFicheAffiche.format('dddd D MMMM YYYY')}
      loading={exporting}
      onCancel={() => setConfirmationOuverte(false)}
      onConfirm={confirmerTelechargement}
    />
  )

  if (estCloturee) {
    return (
      <>
      <div className="space-y-5 mt-2 pb-7">
        <div className="mt-6 flex flex-col items-center text-center px-4">
          <div className="rounded-full bg-emerald-50 p-4"><IconCheckCircle className="h-10 w-10 text-emerald-600" /></div>
          <p className="mt-4 text-lg font-bold text-ink-800 font-display">Journée déjà clôturée</p>
          <p className="mt-1 text-sm text-ink-400 max-w-xs">
            {cloture?.heure_cloture ? `Clôturée à ${dayjs(cloture.heure_cloture).format('HH:mm')}. ` : ''}
            Vos résultats alimentent votre score de performance. À demain !
          </p>
          <Button className="mt-4" loading={exporting} onClick={exporterFiche}>
            <IconDownload className="mr-2 h-4 w-4" /> Télécharger la fiche du {jourFicheAffiche.format('dddd D MMMM')}
          </Button>
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
      {dialogueTelechargement}
      </>
    )
  }

  return (
    <div className="space-y-5 mt-2 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Mon activité terrain</p>
          <h1 className="provisit-page-title mt-1">Visites du jour</h1>
          <p className="mt-1 text-xs text-ink-400 capitalize">{nowBenin().format("dddd D MMMM YYYY")}</p>
          
        </div>
        <div className="flex gap-2">
          <button onClick={exporterFiche} disabled={exporting} title={`Télécharger la fiche du ${jourFicheAffiche.format('dddd D MMMM')}`} aria-label={`Télécharger la fiche du ${jourFicheAffiche.format('dddd D MMMM')}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-ink-500 shadow-softer">
            <IconDownload className="h-4 w-4" />
          </button>
          <Link to="/app/cloture">
            <Button size="sm" variant="secondary">Clôturer</Button>
          </Link>
        </div>
      </div>

      <Card className={`border ${maintenant.isBefore(limiteNormale) ? 'border-royal-200 bg-royal-50' : maintenant.isBefore(limiteAutomatique) ? 'border-amber-300 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${maintenant.isBefore(limiteNormale) ? 'bg-royal-100 text-royal-700' : maintenant.isBefore(limiteAutomatique) ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            <IconMoon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-500">
              {maintenant.isBefore(limiteNormale) ? 'Temps restant avant la clôture (19 h)' : maintenant.isBefore(limiteAutomatique) ? 'Clôture en retard — clôture automatique à 19 h' : 'Heure limite dépassée'}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold tracking-wider text-ink-900 tabular-nums">{compteARebours}</p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              {maintenant.isBefore(limiteNormale) ? 'Pensez à clôturer votre journée avant 19 h.' : maintenant.isBefore(limiteAutomatique) ? 'Clôturez dès maintenant pour éviter la clôture forcée.' : 'La clôture automatique doit être exécutée à présent. Actualisez la page dans un instant.'}
            </p>
          </div>
        </div>
      </Card>

      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}

      {!loading && lignes.length === 0 && (
        <Card className="text-center py-10">
          <p className="text-sm font-semibold text-ink-500">Aucune visite programmée aujourd'hui</p>
          <p className="text-xs text-ink-400 mt-1">Vérifiez que votre programme hebdomadaire a bien été validé.</p>
        </Card>
      )}

      {restantesNormales.length > 0 && (
        <div className="space-y-2.5">
          {restantesNormales.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} />)}
        </div>
      )}

      {(restantesReportees.length > 0 || faitesReportees.length > 0) && (
        <section className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Visites reportées</p>
            <p className="mt-1 text-[11px] text-amber-700">À part du programme habituel · {restantesReportees.length} à faire</p>
          </div>
          {restantesReportees.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} reportee />)}
          {faitesReportees.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} done reportee />)}
        </section>
      )}

      {faitesNormales.length > 0 && (
        <>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide pt-2">Traitées</p>
          <div className="space-y-2.5 opacity-70">
            {faitesNormales.map((l, i) => <VisiteCard key={l.programme_ligne_id} l={l} index={i} done />)}
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
      {dialogueTelechargement}
    </div>
  )
}

function FicheDownloadDialog({ open, date, loading, onCancel, onConfirm }: { open: boolean; date: string; loading: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="fiche-dialog-title" className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-royal-700 to-royal-900 px-5 pb-5 pt-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <IconDownload className="h-6 w-6" />
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-white/70">Graal Medical Solutions</p>
          <h2 id="fiche-dialog-title" className="mt-1 text-xl font-extrabold">Votre fiche de visites</h2>
        </div>
        <div className="p-5">
          <p className="text-sm leading-6 text-slate-600">Vous êtes sur le point de télécharger votre fiche de visites pour :</p>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-royal-100 bg-royal-50 px-4 py-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-royal-700 shadow-sm"><IconCheckCircle className="h-5 w-5" /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-royal-600">Date de la fiche</p><p className="text-sm font-bold capitalize text-royal-950">{date}</p></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Vérifiez la date avant de continuer. La fiche sera générée au format PDF.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={onCancel} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Annuler</button>
            <button type="button" onClick={onConfirm} disabled={loading} className="flex items-center justify-center rounded-xl bg-royal-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-royal-700/20 transition hover:bg-royal-800 disabled:opacity-60">{loading ? 'Préparation…' : 'Confirmer'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VisiteCard({ l, index, done, reportee }: { l: ReturnType<typeof useVisitesDuJour>['lignes'][number]; index: number; done?: boolean; reportee?: boolean }) {
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
              {reportee && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">Reportée</span>}
            </div>
          </div>
          {!done && <IconChevronRight className="h-4 w-4 text-ink-300 flex-shrink-0" />}
        </Card>
      </Link>
    </motion.div>
  )
}


function prochainJourOuvrable(date: dayjs.Dayjs) {
  let cible = date.add(1, 'day')
  while (cible.day() === 0 || cible.day() === 6) cible = cible.add(1, 'day')
  return cible
}

function maintenantJourFiche() {
  const maintenant = nowBenin()
  return maintenant.hour() >= 19 ? prochainJourOuvrable(todayBenin()) : todayBenin()
}
