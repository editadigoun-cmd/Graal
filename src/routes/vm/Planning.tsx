import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconPlus, IconX, IconClock, IconCheckCircle, IconAlert, IconSearch, IconCheck } from '@/components/ui/icons'
import { usePlanning, targetSemaineDebut } from '@/features/data/usePlanning'
import { supabase } from '@/lib/supabase'
import { JOURS, potentielAutorise } from '@/lib/rules'
import { JOUR_LABEL } from '@/lib/theme'
import { deadlineSoumission, formatCountdown, nowBenin } from '@/lib/time'
import { normalizeText } from '@/lib/text'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Jour = Database['public']['Enums']['jour_semaine']
type TypeVisite = Database['public']['Enums']['type_visite']

export default function Planning() {
  const { programme, lignes, portefeuille, loading, error, setError, reload } = usePlanning()
  const [jourActif, setJourActif] = useState<Jour>('LUNDI')
  const [picking, setPicking] = useState<TypeVisite | null>(null)
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultat, setResultat] = useState<{ statut: string; message?: string; conformite?: unknown[] } | null>(null)
  const [, forceTick] = useState(0)

  const semaineDebut = targetSemaineDebut()
  const deadline = deadlineSoumission(semaineDebut)
  const countdown = formatCountdown(deadline)

  useMemo(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const lignesJour = lignes.filter((l) => l.jour === jourActif)
  const clientIdsUtilises = new Set(lignes.map((l) => l.client_id))

  const candidats = portefeuille.filter((c) => {
    if (!picking) return false
    if (!potentielAutorise(jourActif, c.potentiel)) return false
    if (clientIdsUtilises.has(c.id)) return false
    if (recherche && !normalizeText(c.nom).includes(normalizeText(recherche))) return false
    return true
  })

  function ouvrirPicker(type: TypeVisite) {
    setPicking(type)
    setRecherche('')
    setSelection(new Set())
  }

  function toggleSelection(clientId: string) {
    setSelection((s) => {
      const next = new Set(s)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  async function ajouterSelection() {
    if (!programme || !picking || selection.size === 0) return
    setAjoutEnCours(true)
    setError(null)
    const ids = Array.from(selection)
    const { error } = await supabase.from('programme_lignes').insert(
      ids.map((clientId, i) => ({
        programme_id: programme.id, client_id: clientId, jour: jourActif, type_visite: picking, ordre: lignesJour.length + i
      }))
    )
    setAjoutEnCours(false)
    if (error) setError(error.message)
    else { setPicking(null); reload() }
  }

  async function retirerLigne(id: string) {
    await supabase.from('programme_lignes').delete().eq('id', id)
    reload()
  }

  async function soumettre() {
    if (!programme) return
    setSubmitting(true)
    setResultat(null)
    const { data, error } = await supabase.rpc('soumettre_programme_hebdomadaire', { p_programme_id: programme.id })
    setSubmitting(false)
    if (error) setError(error.message)
    else {
      setResultat(data as { statut: string; message?: string; conformite?: unknown[] })
      reload()
    }
  }

  if (loading) return <div className="space-y-3 mt-2"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const verrouille = programme && programme.statut !== 'BROUILLON'

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div>
        <h1 className="text-lg font-bold text-ink-800 font-display">Planning de la semaine</h1>
        <p className="text-xs text-ink-400">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
      </div>

      <Card className={countdown ? 'bg-gradient-to-br from-royal-600 to-royal-700 text-white' : undefined}>
        {programme?.statut === 'BROUILLON' ? (
          countdown ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/70">Soumission avant jeudi 21h00</p>
                <p className="text-xl font-extrabold font-display">{countdown}</p>
              </div>
              <IconClock className="h-8 w-8 text-white/60" />
            </div>
          ) : (
            <p className="text-sm font-semibold text-flame-600">Délai de soumission dépassé.</p>
          )
        ) : (
          <div className="flex items-center gap-2 text-emerald-600">
            <IconCheckCircle className="h-5 w-5" />
            <p className="text-sm font-semibold">Programme {programme?.statut.toLowerCase()}</p>
          </div>
        )}
      </Card>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {JOURS.map((j) => {
          const count = lignes.filter((l) => l.jour === j).length
          return (
            <button
              key={j} onClick={() => setJourActif(j)}
              className={`flex-shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                jourActif === j ? 'bg-royal-600 text-white shadow-soft' : 'bg-white text-ink-500 border border-ink-200'
              }`}
            >
              {JOUR_LABEL[j]}
              <span className={`ml-1.5 text-[10px] ${jourActif === j ? 'text-white/70' : 'text-ink-300'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600">
          <IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      <div className="space-y-2.5">
        <AnimatePresence>
          {lignesJour.map((l) => (
            <motion.div key={l.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
              <Card className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800 truncate">{l.clients?.nom}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {l.clients?.potentiel && <PotentielBadge potentiel={l.clients.potentiel} compact />}
                    <span className="text-[11px] text-ink-400">{l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
                  </div>
                </div>
                {!verrouille && (
                  <button onClick={() => retirerLigne(l.id)} className="rounded-full p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-500">
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {!verrouille && (
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => ouvrirPicker('MEDICAL')} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-royal-200 py-3 text-sm font-semibold text-royal-600">
              <IconPlus className="h-4 w-4" /> Client médical
            </button>
            <button onClick={() => ouvrirPicker('PHARMACIE')} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-200 py-3 text-sm font-semibold text-emerald-600">
              <IconPlus className="h-4 w-4" /> Pharmacie
            </button>
          </div>
        )}
      </div>

      {!verrouille && (
        <Button fullWidth loading={submitting} onClick={soumettre} disabled={!countdown}>
          Soumettre le programme
        </Button>
      )}

      {resultat && (
        <Card className={resultat.statut === 'SOUMIS' ? 'bg-emerald-50' : 'bg-flame-50'}>
          <p className={`text-sm font-bold ${resultat.statut === 'SOUMIS' ? 'text-emerald-700' : 'text-flame-700'}`}>
            {resultat.statut === 'SOUMIS' ? 'Programme soumis avec succès' : resultat.message ?? 'Soumission refusée'}
          </p>
        </Card>
      )}

      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-ink-900/40" onClick={() => setPicking(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-h-[75vh] overflow-y-auto rounded-t-xl4 bg-white p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-200" />
              <p className="text-sm font-bold text-ink-800 mb-1">Ajouter des clients — {JOUR_LABEL[jourActif]}</p>
              <p className="text-xs text-ink-400 mb-3">Seuls les clients autorisés ce jour selon leur potentiel sont affichés. Sélectionnez-en un ou plusieurs.</p>
              <div className="relative mb-3">
                <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un client…"
                  className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <div className="space-y-2 pb-2">
                {candidats.length === 0 && <p className="text-sm text-ink-400 text-center py-6">Aucun client disponible pour ce jour.</p>}
                {candidats.map((c) => {
                  const selected = selection.has(c.id)
                  return (
                    <button
                      key={c.id} onClick={() => toggleSelection(c.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${selected ? 'border-royal-400 bg-royal-50' : 'border-ink-100 hover:bg-ink-50'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                          {selected && <IconCheck className="h-3.5 w-3.5 text-white" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-800 truncate">{c.nom}</p>
                          <p className="text-[11px] text-ink-400 truncate">{c.centre || c.specialite}</p>
                        </div>
                      </div>
                      <PotentielBadge potentiel={c.potentiel} compact />
                    </button>
                  )
                })}
              </div>
              <Button fullWidth className="mt-2" loading={ajoutEnCours} disabled={selection.size === 0} onClick={ajouterSelection}>
                Ajouter {selection.size > 0 ? `(${selection.size})` : ''}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-center text-[10px] text-ink-300">{nowBenin().format('HH:mm')} — heure du Bénin</p>
    </div>
  )
}
