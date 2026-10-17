import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconPlus, IconX, IconClock, IconCheckCircle, IconAlert, IconSearch, IconCheck } from '@/components/ui/icons'
import { usePlanning, targetSemaineDebut } from '@/features/data/usePlanning'
import { supabase } from '@/lib/supabase'
import { JOURS, JOURS_DEROGATION_MOYEN, potentielAutorise } from '@/lib/rules'
import { JOUR_LABEL } from '@/lib/theme'
import { deadlineSoumission, formatCountdown, nowBenin } from '@/lib/time'
import { normalizeText } from '@/lib/text'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Jour = Database['public']['Enums']['jour_semaine']
type TypeVisite = Database['public']['Enums']['type_visite']
type Specialite = Database['public']['Enums']['specialite_client']
type Potentiel = Database['public']['Enums']['potentiel_client']

// Regroupement pour le récapitulatif hebdomadaire par spécialité — demande explicite du
// client : afficher combien de médecins de chaque spécialité (+ pharmacies) ont été
// programmés dans la semaine, l'addition de ces nombres formant le total programmé.
const RECAP_SPECIALITES: { cles: Specialite[]; label: string }[] = [
  { cles: ['GENERALISTE'], label: 'Médecins généralistes' },
  { cles: ['GYNECOLOGUE'], label: 'Gynécologues' },
  { cles: ['PEDIATRE'], label: 'Pédiatres' },
  { cles: ['DISPENSAIRE'], label: 'Dispensaires' },
  { cles: ['MATERNITE'], label: 'Maternités' },
  { cles: ['CARDIOLOGUE', 'RHUMATOLOGUE', 'ORL', 'AUTRE_SPECIALITE'], label: 'Autres spécialités' },
  { cles: ['PHARMACIE'], label: 'Pharmacies' }
]
const POTENTIEL_LABEL: Record<Potentiel, string> = { GROS: 'Gros', MOYEN: 'Moyens', FAIBLE: 'Faibles' }

interface Seuils {
  minMedical: number
  minPharmacie: number
  maxFaibleJeudiPct: number
  maxMoyenLunMarMer: number
  poidsMoyenReduit: number
}

const SEUILS_DEFAUT: Seuils = { minMedical: 15, minPharmacie: 3, maxFaibleJeudiPct: 50, maxMoyenLunMarMer: 3, poidsMoyenReduit: 2.5 }

export default function Planning() {
  const { programme, lignes, portefeuille, loading, error, setError, reload } = usePlanning()
  const [jourActif, setJourActif] = useState<Jour>('LUNDI')
  const [picking, setPicking] = useState<TypeVisite | null>(null)
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultat, setResultat] = useState<{ statut: string; message?: string; conformite?: unknown[] } | null>(null)
  const [seuils, setSeuils] = useState<Seuils>(SEUILS_DEFAUT)
  const [, forceTick] = useState(0)

  const semaineDebut = targetSemaineDebut()
  const deadline = deadlineSoumission(semaineDebut)
  const countdown = formatCountdown(deadline)

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.from('parametres').select('key, value')
      .in('key', [
        'visites_minimum_medical_jour', 'visites_minimum_pharmacie_jour', 'seuil_faible_jeudi_pourcentage_max',
        'nb_max_moyen_lun_mar_mer_jour', 'poids_visite_moyen_reduit_pourcentage'
      ])
      .then(({ data }) => {
        if (!data) return
        const val = (k: string) => Number(data.find((p) => p.key === k)?.value)
        setSeuils({
          minMedical: val('visites_minimum_medical_jour') || SEUILS_DEFAUT.minMedical,
          minPharmacie: val('visites_minimum_pharmacie_jour') || SEUILS_DEFAUT.minPharmacie,
          maxFaibleJeudiPct: val('seuil_faible_jeudi_pourcentage_max') || SEUILS_DEFAUT.maxFaibleJeudiPct,
          maxMoyenLunMarMer: val('nb_max_moyen_lun_mar_mer_jour') || SEUILS_DEFAUT.maxMoyenLunMarMer,
          poidsMoyenReduit: val('poids_visite_moyen_reduit_pourcentage') || SEUILS_DEFAUT.poidsMoyenReduit
        })
      })
  }, [])

  const lignesJour = lignes.filter((l) => l.jour === jourActif)
  const clientIdsUtilises = new Set(lignes.map((l) => l.client_id))
  const pharmacieUniquement = !!programme?.mode_pharmacie_uniquement

  const jourCompatible = (habituel: string | null | undefined, jour: Jour) => {
    if (!habituel?.trim()) return true
    const texte = normalizeText(habituel)
    const alias: Record<Jour, string[]> = {
      LUNDI: ['lundi', 'lun'], MARDI: ['mardi', 'mar'],
      MERCREDI: ['mercredi', 'mer'], JEUDI: ['jeudi', 'jeu'],
      VENDREDI: ['vendredi', 'ven']
    }
    // Les valeurs libres non reconnues ne doivent pas provoquer de faux blocage.
    const joursConnus = Object.values(alias).flat().filter((mot) => texte.includes(mot))
    return joursConnus.length === 0 || alias[jour].some((mot) => texte.includes(mot))
  }

  const candidats = portefeuille.filter((c) => {
    if (!picking) return false
    if (!c.actif || c.secteur !== (programme?.secteur ?? secteurVm)) return false
    if (picking === 'MEDICAL' && c.specialite === 'PHARMACIE') return false
    if (picking === 'PHARMACIE' && c.specialite !== 'PHARMACIE') return false
    if (!jourCompatible(c.jour_heure_habituel, jourActif)) return false
    if (!potentielAutorise(jourActif, c.potentiel, picking)) return false
    if (clientIdsUtilises.has(c.id)) return false
    if (recherche && !normalizeText(c.nom).includes(normalizeText(recherche))) return false
    return true
  }).sort((a, b) =>
    String(a.secteur ?? '').localeCompare(String(b.secteur ?? '')) ||
    String(a.specialite ?? '').localeCompare(String(b.specialite ?? '')) ||
    a.nom.localeCompare(b.nom, 'fr')
  )

  // Jeudi : la part de clients FAIBLE potentiel ne doit pas dépasser seuils.maxFaibleJeudiPct —
  // on bloque la sélection de nouveaux clients FAIBLE dès que l'ajouter dépasserait le seuil,
  // au lieu de laisser le VM tout construire puis découvrir le refus à la soumission.
  const lignesJeudi = lignes.filter((l) => l.jour === 'JEUDI')
  const jeudiTotalActuel = lignesJeudi.length
  const jeudiFaibleActuel = lignesJeudi.filter((l) => l.clients?.potentiel === 'FAIBLE').length
  const selectionArray = Array.from(selection)
  const selectionFaibleCount = selectionArray.filter((id) => portefeuille.find((c) => c.id === id)?.potentiel === 'FAIBLE').length
  const jeudiTotalProjete = jeudiTotalActuel + selectionArray.length
  const jeudiFaibleProjete = jeudiFaibleActuel + selectionFaibleCount

  function faibleJeudiBloque(candidatId: string, potentiel: string) {
    if (jourActif !== 'JEUDI' || potentiel !== 'FAIBLE' || selection.has(candidatId)) return false
    const total = jeudiTotalProjete + 1
    const faible = jeudiFaibleProjete + 1
    return (faible / total) * 100 > seuils.maxFaibleJeudiPct
  }

  // Dérogation plafonnée "médecins moyens" lundi/mardi/mercredi (cf. migration 043) : au-delà
  // de seuils.maxMoyenLunMarMer sur le jour actif, le serveur refusera l'ajout.
  const lignesJourActifMoyenMedical = lignesJour.filter((l) => l.type_visite === 'MEDICAL' && l.clients?.potentiel === 'MOYEN').length
  const selectionMoyenCount = picking === 'MEDICAL' && JOURS_DEROGATION_MOYEN.includes(jourActif)
    ? selectionArray.filter((id) => portefeuille.find((c) => c.id === id)?.potentiel === 'MOYEN').length
    : 0
  const moyenLunMarMerProjete = lignesJourActifMoyenMedical + selectionMoyenCount

  function moyenDerogationBloque(candidatId: string, potentiel: string) {
    if (picking !== 'MEDICAL' || !JOURS_DEROGATION_MOYEN.includes(jourActif) || potentiel !== 'MOYEN' || selection.has(candidatId)) return false
    return moyenLunMarMerProjete + 1 > seuils.maxMoyenLunMarMer
  }

  // Récapitulatif hebdomadaire par spécialité + par potentiel (toute la semaine, tous jours confondus).
  const specialiteCounts: Partial<Record<Specialite, number>> = {}
  const potentielCounts: Record<Potentiel, number> = { GROS: 0, MOYEN: 0, FAIBLE: 0 }
  for (const l of lignes) {
    const s = l.clients?.specialite
    if (s) specialiteCounts[s] = (specialiteCounts[s] ?? 0) + 1
    const p = l.clients?.potentiel
    if (p) potentielCounts[p] += 1
  }

  const parJour = Object.fromEntries(JOURS.map((j) => {
    const ljour = lignes.filter((l) => l.jour === j)
    const medical = ljour.filter((l) => l.type_visite === 'MEDICAL')
    const medicalMoyenReduit = JOURS_DEROGATION_MOYEN.includes(j)
      ? medical.filter((l) => l.clients?.potentiel === 'MOYEN').length
      : 0
    return [j, {
      medical: medical.length,
      medicalMoyenReduit,
      pharmacie: ljour.filter((l) => l.type_visite === 'PHARMACIE').length
    }]
  })) as Record<Jour, { medical: number; medicalMoyenReduit: number; pharmacie: number }>

  // Quota quotidien pondéré (miroir de soumettre_programme_hebdomadaire, migration 043) : les
  // visites "médecin moyen" lundi/mardi/mercredi comptent pour un poids réduit, pas 1 visite pleine.
  const poidsNormal = seuils.minMedical > 0 ? 100 / seuils.minMedical : 0
  const pointsMedical = (j: Jour) => {
    const { medical, medicalMoyenReduit } = parJour[j]
    return (medical - medicalMoyenReduit) * poidsNormal + medicalMoyenReduit * seuils.poidsMoyenReduit
  }

  // En mode "pharmacie uniquement", le serveur (soumettre_programme_hebdomadaire) n'exige ni
  // couverture des 5 jours ni minimums quotidiens — seulement un programme non vide et le
  // ratio FAIBLE du jeudi. Le checklist client doit refléter exactement cette règle pour ne
  // pas bloquer une soumission que le serveur accepterait.
  const jourOk = (j: Jour) => pharmacieUniquement
    ? true
    : pointsMedical(j) >= 100 - 0.01 && parJour[j].pharmacie >= seuils.minPharmacie
  const joursCouverts = JOURS.filter((j) => lignes.some((l) => l.jour === j)).length
  const jeudiRatioOk = jeudiTotalActuel === 0 || (jeudiFaibleActuel / jeudiTotalActuel) * 100 <= seuils.maxFaibleJeudiPct
  const prêtPourSoumission = pharmacieUniquement
    ? lignes.length > 0 && jeudiRatioOk
    : joursCouverts === 5 && JOURS.every(jourOk) && jeudiRatioOk

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
  const estValide = programme?.statut === 'VALIDE' || programme?.statut === 'VERROUILLE'

  if (estValide) {
    return (
      <div className="space-y-4 mt-2 pb-4">
        <div>
          <h1 className="text-lg font-bold text-ink-800 font-display">Planning de la semaine</h1>
          <p className="text-xs text-ink-400">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
        </div>
        <div className="mt-10 flex flex-col items-center text-center px-4">
          <div className="rounded-full bg-emerald-50 p-4"><IconCheckCircle className="h-10 w-10 text-emerald-600" /></div>
          <p className="mt-4 text-lg font-bold text-ink-800 font-display">Programme validé</p>
          <p className="mt-1 text-sm text-ink-400 max-w-xs">
            Votre superviseur a validé votre programme de la semaine. Retrouvez vos visites du jour dans l'onglet Visites.
          </p>
        </div>
      </div>
    )
  }

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
          const ok = pharmacieUniquement ? count > 0 : jourOk(j)
          return (
            <button
              key={j} onClick={() => setJourActif(j)}
              className={`flex-shrink-0 flex items-center gap-1 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                jourActif === j ? 'bg-royal-600 text-white shadow-soft' : 'bg-white text-ink-500 border border-ink-200'
              }`}
            >
              {JOUR_LABEL[j]}
              <span className={`text-[10px] ${jourActif === j ? 'text-white/70' : 'text-ink-300'}`}>{count}</span>
              {ok && <IconCheckCircle className={`h-3 w-3 ${jourActif === j ? 'text-white' : 'text-emerald-500'}`} />}
            </button>
          )
        })}
      </div>

      {lignes.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-ink-600">Récapitulatif de la semaine — par spécialité</p>
            <p className="text-sm font-extrabold text-royal-600">{lignes.length} visites</p>
          </div>
          <div className="space-y-1.5">
            {RECAP_SPECIALITES.map(({ cles, label }) => {
              const count = cles.reduce((s, c) => s + (specialiteCounts[c] ?? 0), 0)
              if (count === 0) return null
              return (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-ink-500">{label}</span>
                  <span className="font-semibold text-ink-700">{count}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-2 flex-wrap">
            {(Object.keys(POTENTIEL_LABEL) as Potentiel[]).map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                {POTENTIEL_LABEL[p]} <span className="text-ink-800">{potentielCounts[p]}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {!verrouille && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-ink-600">Progression — {JOUR_LABEL[jourActif]}</p>
            <p className="text-[11px] text-ink-400">{joursCouverts}/5 jours couverts</p>
          </div>
          <div className={`grid ${pharmacieUniquement ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
            {!pharmacieUniquement && (
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-ink-500">Médical</span>
                  <span className={pointsMedical(jourActif) >= 100 - 0.01 ? 'text-emerald-600 font-semibold' : 'text-ink-500'}>
                    {Math.round(pointsMedical(jourActif))}% (min 100%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className={`h-full rounded-full ${pointsMedical(jourActif) >= 100 - 0.01 ? 'bg-emerald-500' : 'bg-royal-400'}`}
                    style={{ width: `${Math.min(100, pointsMedical(jourActif))}%` }} />
                </div>
                {JOURS_DEROGATION_MOYEN.includes(jourActif) && (
                  <p className="mt-1 text-[10px] text-ink-400">
                    dont {parJour[jourActif].medicalMoyenReduit}/{seuils.maxMoyenLunMarMer} médecin(s) "moyen" (poids réduit {seuils.poidsMoyenReduit}%)
                  </p>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-ink-500">Pharmacie</span>
                <span className={parJour[jourActif].pharmacie >= seuils.minPharmacie ? 'text-emerald-600 font-semibold' : 'text-ink-500'}>
                  {parJour[jourActif].pharmacie}/{seuils.minPharmacie}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div className={`h-full rounded-full ${parJour[jourActif].pharmacie >= seuils.minPharmacie ? 'bg-emerald-500' : 'bg-royal-400'}`}
                  style={{ width: `${Math.min(100, (parJour[jourActif].pharmacie / seuils.minPharmacie) * 100)}%` }} />
              </div>
            </div>
          </div>
          {jourActif === 'JEUDI' && (
            <div className="mt-3 pt-3 border-t border-ink-100">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-ink-500">Clients FAIBLE potentiel</span>
                <span className={jeudiRatioOk ? 'text-emerald-600 font-semibold' : 'text-flame-600 font-semibold'}>
                  {jeudiFaibleActuel}/{jeudiTotalActuel || 0} (max {seuils.maxFaibleJeudiPct}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div className={`h-full rounded-full ${jeudiRatioOk ? 'bg-emerald-500' : 'bg-flame-500'}`}
                  style={{ width: `${jeudiTotalActuel ? Math.min(100, (jeudiFaibleActuel / jeudiTotalActuel) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </Card>
      )}

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
        <>
          {countdown && !prêtPourSoumission && (
            <Card className="bg-flame-50/60 border border-flame-200">
              <p className="text-xs font-bold text-flame-700 mb-2">À compléter avant de soumettre :</p>
              <ul className="space-y-1">
                {pharmacieUniquement ? (
                  lignes.length === 0 && (
                    <li className="text-xs text-flame-700">• Programmer au moins une pharmacie</li>
                  )
                ) : (
                  <>
                    {joursCouverts < 5 && (
                      <li className="text-xs text-flame-700">• Programmer au moins un client chaque jour ({joursCouverts}/5 jours couverts)</li>
                    )}
                    {JOURS.filter((j) => !jourOk(j)).map((j) => (
                      <li key={j} className="text-xs text-flame-700">
                        • {JOUR_LABEL[j]} : {Math.round(pointsMedical(j))}%/100% médical, {parJour[j].pharmacie}/{seuils.minPharmacie} pharmacie
                      </li>
                    ))}
                  </>
                )}
                {!jeudiRatioOk && (
                  <li className="text-xs text-flame-700">• Jeudi : trop de clients FAIBLE potentiel (max {seuils.maxFaibleJeudiPct}%)</li>
                )}
              </ul>
            </Card>
          )}
          <Button fullWidth loading={submitting} onClick={soumettre} disabled={!countdown || !prêtPourSoumission}>
            Soumettre le programme
          </Button>
        </>
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
              <p className="text-xs text-ink-400 mb-3">Seuls les clients de votre secteur, de votre portefeuille, compatibles avec ce jour et le type de visite sont affichés. La liste est classée par spécialité.</p>
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
                  const bloqueFaibleJeudi = faibleJeudiBloque(c.id, c.potentiel)
                  const bloqueMoyen = moyenDerogationBloque(c.id, c.potentiel)
                  const bloque = bloqueFaibleJeudi || bloqueMoyen
                  return (
                    <button
                      key={c.id} onClick={() => !bloque && toggleSelection(c.id)}
                      disabled={bloque}
                      className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                        bloque ? 'border-ink-100 bg-ink-50 opacity-50 cursor-not-allowed'
                          : selected ? 'border-royal-400 bg-royal-50' : 'border-ink-100 hover:bg-ink-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                          {selected && <IconCheck className="h-3.5 w-3.5 text-white" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-800 truncate">{c.nom}</p>
                          <p className="text-[11px] text-ink-400 truncate">
                            {bloqueFaibleJeudi
                              ? `Max ${seuils.maxFaibleJeudiPct}% de clients FAIBLE le jeudi atteint`
                              : bloqueMoyen
                              ? `Max ${seuils.maxMoyenLunMarMer} médecin(s) "moyen" atteint pour ce jour`
                              : [c.secteur, c.specialite, c.centre].filter(Boolean).join(' · ')}
                          </p>
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
