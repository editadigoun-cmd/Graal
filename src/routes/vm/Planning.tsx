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

// Correspondance entre les cibles hebdomadaires configurées par équipe et les spécialités.
const RECAP_CIBLES: Record<string, { cles: Specialite[]; label: string }> = {
  MEDECINS_GENERALISTES: { cles: ['GENERALISTE'], label: 'Médecins généralistes' },
  GYNECOLOGUES: { cles: ['GYNECOLOGUE'], label: 'Gynécologues' },
  PEDIATRES: { cles: ['PEDIATRE'], label: 'Pédiatres' },
  DISPENSAIRES: { cles: ['DISPENSAIRE'], label: 'Dispensaires' },
  MATERNITES: { cles: ['MATERNITE'], label: 'Maternités' },
  AUTRES_SPECIALITES: { cles: ['RHUMATOLOGUE', 'ORL', 'AUTRE_SPECIALITE'], label: 'Autres spécialités' },
  CARDIOLOGUES: { cles: ['CARDIOLOGUE'], label: 'Cardiologues' },
  PHARMACIES: { cles: ['PHARMACIE'], label: 'Pharmacies' }
}
const POTENTIEL_LABEL: Record<Potentiel, string> = { 'G+': 'G+', GROS: 'Gros', MOYEN: 'Moyens', FAIBLE: 'Faibles' }

const QUOTAS_PHARMACIE_ODY: Record<string, Record<string, number>> = {
  LUNDI: { 'G+': 3, GROS: 4, MOYEN: 8 },
  MARDI: { 'G+': 3, GROS: 4, MOYEN: 8 },
  MERCREDI: { 'G+': 3, GROS: 4, MOYEN: 8 },
  JEUDI: { GROS: 1, MOYEN: 9, FAIBLE: 5 },
  VENDREDI: { MOYEN: 9, FAIBLE: 6 }
}
const SPECIALITE_LABEL: Record<string, string> = {
  "GENERALISTE": "Médecin généraliste",
  "GYNECOLOGUE": "Gynécologue",
  "PEDIATRE": "Pédiatre",
  "CARDIOLOGUE": "Cardiologue",
  "RHUMATOLOGUE": "Rhumatologue",
  "ORL": "ORL",
  "AUTRE_SPECIALITE": "Autre spécialité",
  "MATERNITE": "Maternité",
  "DISPENSAIRE": "Dispensaire",
  "PHARMACIE": "Pharmacie",
  "IDE": "Infirmier(ère)",
  "ANESTHESISTE": "Anesthésiste",
  "CHIRURGIEN": "Chirurgien",
  "CHIRURGIEN_PEDIATRIQUE": "Chirurgien pédiatrique",
  "DERMATOLOGUE": "Dermatologue",
  "DIABETOLOGUE": "Diabétologue",
  "ENDOCRINOLOGUE": "Endocrinologue",
  "GASTROENTEROLOGUE": "Gastro-entérologue",
  "SAGE_FEMME": "Sage-femme",
  "NEPHROLOGUE": "Néphrologue",
  "NEUROLOGUE": "Neurologue",
  "NEUROCHIRURGIEN": "Neurochirurgien",
  "NUTRITIONNISTE": "Nutritionniste",
  "ONCOLOGUE": "Oncologue",
  "PNEUMOLOGUE": "Pneumologue",
  "REANIMATEUR": "Réanimateur",
  "TRAUMATOLOGUE": "Traumatologue",
  "URGENTISTE": "Urgentiste",
  "UROLOGUE": "Urologue",
  "INTERNISTE": "Médecin interniste",
  "PSYCHOLOGUE": "Psychologue"
}

interface Seuils {
  minMedical: number
  minPharmacie: number
  maxFaibleJeudiPct: number
  poidsMoyenReduit: number
  maxVisitesJour: number
  maxMoyenLunMarMer: number
  maxGrosJeudi: number
  maxGrosVendredi: number
  maxFaibleJeudi: number
  maxFaibleVendredi: number
}

const SEUILS_DEFAUT: Seuils = { minMedical: 15, minPharmacie: 3, maxFaibleJeudiPct: 50, maxMoyenLunMarMer: 5, poidsMoyenReduit: 2.5, maxVisitesJour: 22, maxGrosJeudi: 8, maxGrosVendredi: 5, maxFaibleJeudi: 2, maxFaibleVendredi: 3 }

function selectionGrosCountSafe(selection: Set<string>, portefeuille: Database['public']['Tables']['clients']['Row'][]) {
  return Array.from(selection).filter((id) => portefeuille.find((client) => client.id === id)?.potentiel === 'GROS').length
}

export default function Planning() {
  const { programme, lignes, portefeuille, loading, error, setError, reload, estFawaz, estFagbede, estOdypharm2, derogationZoneActive, derogationPotentielActive, derogationGeneralisteActive, retirerLigne } = usePlanning()
  const [jourActif, setJourActif] = useState<Jour>('LUNDI')
  const [picking, setPicking] = useState<TypeVisite | null>(null)
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultat, setResultat] = useState<{ statut: string; message?: string; conformite?: unknown[] } | null>(null)
  const [seuils, setSeuils] = useState<Seuils>(SEUILS_DEFAUT)
  const [objectifsSpecialites, setObjectifsSpecialites] = useState<{ cible: string; libelle: string; quota: number; ordre: number }[]>([])
  const [heureLimiteSoumission, setHeureLimiteSoumission] = useState('14:00')
  const [jourLimiteSoumission, setJourLimiteSoumission] = useState('SAMEDI')
  const [jourStatuts, setJourStatuts] = useState<Record<string, { statut: string; date_limite: string | null; soumis_at?: string | null }>>({})
  const [, forceTick] = useState(0)

  const semaineDebut = programme?.semaine_debut ?? targetSemaineDebut()
  const joursAffiches = JOURS
  // L'échéance de soumission hebdomadaire est indépendante des échéances de clôture
  // des journées : chaque VM doit pouvoir soumettre jusqu'au samedi à 14 h (Bénin).
  // Seul un délai supplémentaire explicitement accordé par l'administration peut la prolonger.
  const deadline = deadlineSoumission(semaineDebut, programme?.delai_supplementaire_jusqu_a, heureLimiteSoumission, jourLimiteSoumission)
  const countdown = formatCountdown(deadline)

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.from('parametres').select('key, value')
      .in('key', [
        'visites_minimum_medical_jour', 'visites_minimum_pharmacie_jour', 'seuil_faible_jeudi_pourcentage_max',
        'nb_max_moyen_lun_mar_mer_jour', 'poids_visite_moyen_reduit_pourcentage', 'max_visites_jour', 'max_gros_jeudi', 'max_gros_vendredi', 'max_faible_jeudi', 'max_faible_vendredi', 'heure_limite_soumission_programme', 'jour_limite_soumission_programme'
      ])
      .then(({ data }) => {
        if (!data) return
        const val = (k: string) => Number(data.find((p) => p.key === k)?.value)
        const valeur = (k: string, fallback: number) => { const n = val(k); return Number.isFinite(n) ? n : fallback }
        setSeuils({
          minMedical: valeur('visites_minimum_medical_jour', SEUILS_DEFAUT.minMedical),
          minPharmacie: valeur('visites_minimum_pharmacie_jour', SEUILS_DEFAUT.minPharmacie),
          maxFaibleJeudiPct: valeur('seuil_faible_jeudi_pourcentage_max', SEUILS_DEFAUT.maxFaibleJeudiPct),
          maxMoyenLunMarMer: valeur('nb_max_moyen_lun_mar_mer_jour', SEUILS_DEFAUT.maxMoyenLunMarMer),
          poidsMoyenReduit: valeur('poids_visite_moyen_reduit_pourcentage', SEUILS_DEFAUT.poidsMoyenReduit),
          maxVisitesJour: valeur('max_visites_jour', SEUILS_DEFAUT.maxVisitesJour),
          maxGrosJeudi: valeur('max_gros_jeudi', SEUILS_DEFAUT.maxGrosJeudi),
          maxGrosVendredi: valeur('max_gros_vendredi', SEUILS_DEFAUT.maxGrosVendredi),
          maxFaibleJeudi: valeur('max_faible_jeudi', SEUILS_DEFAUT.maxFaibleJeudi),
          maxFaibleVendredi: valeur('max_faible_vendredi', SEUILS_DEFAUT.maxFaibleVendredi)
        })
        const jour = data.find((p) => p.key === 'jour_limite_soumission_programme')?.value
        if (typeof jour === 'string' && ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'].includes(jour)) setJourLimiteSoumission(jour)
        const heure = data.find((p) => p.key === 'heure_limite_soumission_programme')?.value
        if (typeof heure === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) setHeureLimiteSoumission(heure)
      })
  }, [])

  // Charger les objectifs hebdomadaires correspondant à l'équipe réelle du VM.
  useEffect(() => {
    if (!programme?.vm_id) { setObjectifsSpecialites([]); return }
    let actif = true
    async function chargerObjectifs() {
      const { data: vm, error: vmError } = await supabase
        .from('profiles').select('equipe_id').eq('id', programme!.vm_id).maybeSingle()
      if (vmError || !vm?.equipe_id) {
        if (actif) setObjectifsSpecialites([])
        return
      }
      const { data: individu, error: individuelError } = await supabase
        .from('vm_quotas_cibles')
        .select('cible, libelle, quota_hebdomadaire, ordre')
        .eq('vm_id', programme!.vm_id)
        .order('ordre')
      if (!actif) return
      if (individuelError) {
        setError(individuelError.message)
        setObjectifsSpecialites([])
        return
      }
      const { data: equipe, error: quotaError } = await supabase
        .from('quotas_cibles')
        .select('cible, libelle, quota_hebdomadaire, ordre')
        .eq('equipe_id', vm.equipe_id)
        .order('ordre')
      if (!actif) return
      if (quotaError) {
        setError(quotaError.message)
        setObjectifsSpecialites([])
        return
      }
      const objectifs = individu?.length ? individu : (equipe ?? [])
      setObjectifsSpecialites(objectifs.map((q) => ({
        cible: q.cible,
        libelle: q.libelle,
        quota: q.quota_hebdomadaire,
        ordre: q.ordre
      })))
    }
    chargerObjectifs()
    return () => { actif = false }
  }, [programme?.vm_id])

  const lignesJour = lignes.filter((l) => l.jour === jourActif)
  const etatJourActif = jourStatuts[jourActif]
  // La date_limite de programme_jours_validation concerne la validation/clôture
  // de la journée, pas la fenêtre de construction du programme hebdomadaire.
  // Ne pas bloquer le choix des clients avec cette échéance : la limite de
  // soumission du programme est gérée séparément par deadlineSoumission ci-dessus.
  const jourVerrouille = etatJourActif?.statut === 'VALIDE'

  useEffect(() => {
    if (!programme?.id) { setJourStatuts({}); return }
    supabase.from('programme_jours_validation').select('jour, statut, date_limite, soumis_at').eq('programme_id', programme.id)
      .then(({ data, error }) => {
        if (error) { setError(error.message); return }
        const next: Record<string, { statut: string; date_limite: string | null; soumis_at?: string | null }> = {}
        for (const item of data ?? []) next[item.jour] = { statut: item.statut, date_limite: item.date_limite, soumis_at: item.soumis_at }
        setJourStatuts(next)
      })
  }, [programme?.id])
  const clientIdsUtilises = new Set(lignes.map((l) => l.client_id))
  const pharmacieUniquement = !!programme?.mode_pharmacie_uniquement
  const quotasPersonnalisesLydieSylvestre = ['62cdc900-5544-470a-94bf-ef30c9c8fb2f', 'db3b946a-165e-4a20-91e0-073c2e170a72'].includes(programme?.vm_id ?? '')
  const quotasPharmacieJour = QUOTAS_PHARMACIE_ODY[jourActif] ?? {}
  const pharmaciesDuJour = lignesJour.filter((l) => l.type_visite === 'PHARMACIE')
  const quotaPharmacieRespecte = (jour: Jour) => {
    const quotas = QUOTAS_PHARMACIE_ODY[jour] ?? {}
    const pharmacies = lignes.filter((l) => l.jour === jour && l.type_visite === 'PHARMACIE')
    return pharmacies.length === 15 && Object.entries(quotas).every(([potentiel, quota]) =>
      pharmacies.filter((l) => l.clients?.potentiel === potentiel).length === quota
    )
  }

  const candidats = portefeuille.filter((c) => {
    if (!picking) return false
    // Le bouton détermine la catégorie : médical = médecins/structures médicales,
    // pharmacie = pharmacies uniquement. La suppression des contraintes de secteur
    // ne doit pas mélanger les catégories de clients.
    if (picking === 'PHARMACIE' && c.specialite !== 'PHARMACIE') return false
    if (picking === 'MEDICAL' && c.specialite === 'PHARMACIE') return false
    // Le programme fixe le secteur autorisé pour cette semaine : secteur courant cette semaine,
    // secteur opposé pour la semaine suivante. Le serveur applique la même règle.
    if (programme?.vm_id !== 'db3b946a-165e-4a20-91e0-073c2e170a72' && c.specialite !== 'PHARMACIE' && !pharmacieUniquement && !derogationZoneActive && !(derogationGeneralisteActive && c.specialite === 'GENERALISTE') && !estFawaz && !estFagbede && programme?.secteur && c.secteur !== programme.secteur) return false
    // Afficher les clients du secteur autorisé même si leur potentiel ne permet pas de les
    // programmer le jour sélectionné ; les règles de potentiel restent appliquées plus bas.
    if (clientIdsUtilises.has(c.id)) return false
    if (recherche) {
      // Accepter les mots dans n'importe quel ordre : « Pharmacie Togoudo »
      // doit retrouver une fiche enregistrée sous « TOGOUDO » / spécialité « PHARMACIE ».
      const texteRecherche = normalizeText(
        [c.nom, c.centre, c.specialite, c.secteur ? `zone ${c.secteur}` : '']
          .filter(Boolean)
          .join(' ')
      )
      const termesRecherche = normalizeText(recherche).split(/\s+/).filter(Boolean)
      if (!termesRecherche.every((terme) => texteRecherche.includes(terme))) return false
    }
    return true
  })

  // Quotas quotidiens : toutes les visites médicales et pharmacies sont comptées ensemble.
  const selectionArray = Array.from(selection)
  const countSelection = (p: Potentiel) => selectionArray.filter((id) => portefeuille.find((c) => c.id === id)?.potentiel === p).length
  const totalJourProjete = lignesJour.length + selection.size
  const moyenJourProjete = lignesJour.filter((l) => l.clients?.potentiel === 'MOYEN').length + countSelection('MOYEN')
  const grosJourProjete = lignesJour.filter((l) => l.clients?.potentiel === 'GROS').length + countSelection('GROS')
  const faibleJourProjete = lignesJour.filter((l) => l.clients?.potentiel === 'FAIBLE').length + countSelection('FAIBLE')
  const grosMoyenRestant = portefeuille.some((c) => !clientIdsUtilises.has(c.id) && !selection.has(c.id) && c.actif && (c.potentiel === 'GROS' || c.potentiel === 'MOYEN') && (pharmacieUniquement || derogationZoneActive || estFawaz || estFagbede || !programme?.secteur || c.secteur === programme.secteur))

  function quotaPotentielBloque(candidatId: string, potentiel: string) {
    if (selection.has(candidatId)) return false
    if (estOdypharm2) {
      if (picking !== 'PHARMACIE') {
        if (picking === 'MEDICAL' && potentiel === 'GROS' && ['JEUDI', 'VENDREDI'].includes(jourActif)) {
          const currentGross = lignesJour.filter(l => l.type_visite === 'MEDICAL' && l.clients?.potentiel === 'GROS').length;
          const selectedGross = selectionArray.filter(id => portefeuille.find(c => c.id === id)?.potentiel === 'GROS').length;
          return currentGross + selectedGross >= 2;
        }
        return false;
      }
      const quota = quotasPharmacieJour[potentiel] ?? 0
      const deja = pharmaciesDuJour.filter((l) => l.clients?.potentiel === potentiel).length
      const selectionnes = selectionArray.filter((id) => portefeuille.find((c) => c.id === id)?.potentiel === potentiel).length
      return quota <= 0 || deja + selectionnes >= quota || pharmaciesDuJour.length + selection.size >= 15
    }
    if (totalJourProjete >= seuils.maxVisitesJour) return true
    if (jourActif === 'SAMEDI') return false
    if (derogationPotentielActive || estFawaz || estFagbede) return false
    if (quotasPersonnalisesLydieSylvestre) {
      if (['LUNDI','MARDI','MERCREDI'].includes(jourActif)) {
        if (picking !== 'MEDICAL') return false
        const moyenMedicalProjete = lignesJour.filter((l) => l.type_visite === 'MEDICAL' && l.clients?.potentiel === 'MOYEN').length + countSelection('MOYEN')
        const faibleMedicalProjete = lignesJour.filter((l) => l.type_visite === 'MEDICAL' && l.clients?.potentiel === 'FAIBLE').length + countSelection('FAIBLE')
        if (potentiel === 'MOYEN' && moyenMedicalProjete >= 7) return true
        if (potentiel === 'FAIBLE' && faibleMedicalProjete >= 2) return true
      }
      // Jeudi et vendredi : pas de plafond spécifique par potentiel ; seuls les minima
      // sont contrôlés à la soumission. Le plafond global quotidien reste applicable.
      return false
    }
    if (JOURS_DEROGATION_MOYEN.includes(jourActif)) {
      if (potentiel === 'FAIBLE') return true
      if (potentiel === 'MOYEN' && moyenJourProjete >= seuils.maxMoyenLunMarMer) return true
    }
    if (jourActif === 'JEUDI' || jourActif === 'VENDREDI') {
      const maxGros = jourActif === 'JEUDI' ? seuils.maxGrosJeudi : seuils.maxGrosVendredi
      const maxFaible = jourActif === 'JEUDI' ? seuils.maxFaibleJeudi : seuils.maxFaibleVendredi
      if (potentiel === 'GROS' && grosJourProjete >= maxGros) return true
      if (potentiel === 'FAIBLE' && faibleJourProjete >= maxFaible && grosMoyenRestant) return true
    }
    return false
  }

  // Récapitulatif hebdomadaire par spécialité et potentiel, tous jours confondus.
  const specialiteCounts: Partial<Record<Specialite, number>> = {}
  const potentielCounts: Record<Potentiel, number> = { 'G+': 0, GROS: 0, MOYEN: 0, FAIBLE: 0 }
  for (const l of lignes) {
    const s = l.clients?.specialite
    if (s) specialiteCounts[s] = (specialiteCounts[s] ?? 0) + 1
    const p = l.clients?.potentiel
    if (p) potentielCounts[p] += 1
  }
  const ciblesRecap = objectifsSpecialites.map((objectif) => {
    const definition = RECAP_CIBLES[objectif.cible]
    if (!definition) return null
    // Si l'équipe possède une cible dédiée Cardiologues, ceux-ci ne sont pas inclus
    // dans « Autres spécialités » afin d'éviter un double comptage.
    const cles = objectif.cible === 'AUTRES_SPECIALITES' &&
      objectifsSpecialites.some((o) => o.cible === 'CARDIOLOGUES')
      ? definition.cles
      : objectif.cible === 'AUTRES_SPECIALITES'
        ? [...definition.cles, 'CARDIOLOGUE' as Specialite]
        : definition.cles
    const programme = cles.reduce((total, specialite) => total + (specialiteCounts[specialite] ?? 0), 0)
    return { ...objectif, label: definition.label || objectif.libelle, programme }
  }).filter((item): item is NonNullable<typeof item> => item !== null)
  const totalObjectifSpecialites = ciblesRecap.reduce((total, item) => total + item.quota, 0)

  const parJour = Object.fromEntries(joursAffiches.map((j) => {
    const ljour = lignes.filter((l) => l.jour === j)
    return [j, {
      medical: ljour.filter((l) => l.type_visite === 'MEDICAL').length,
      pharmacie: ljour.filter((l) => l.type_visite === 'PHARMACIE').length
    }]
  })) as Record<Jour, { medical: number; pharmacie: number }>

  // Chaque visite médicale compte à poids plein, quel que soit le potentiel du prescripteur.
  const poidsNormal = seuils.minMedical > 0 ? 100 / seuils.minMedical : 0
  const pointsMedical = (j: Jour) => parJour[j].medical * poidsNormal

  // En mode pharmacie uniquement, les règles de minimums médicaux et pharmaceutiques sont désactivées.
  const comptePotentielMedical = (j: Jour, potentiel: Potentiel) =>
    lignes.filter((l) => l.jour === j && l.type_visite === 'MEDICAL' && l.clients?.potentiel === potentiel).length
  const jourOk = (j: Jour) => estOdypharm2
    ? quotaPharmacieRespecte(j)
    : pharmacieUniquement
      ? true
      : quotasPersonnalisesLydieSylvestre
        ? ['LUNDI','MARDI','MERCREDI'].includes(j)
          ? comptePotentielMedical(j, 'GROS') >= 7
            && parJour[j].pharmacie >= 2
            && comptePotentielMedical(j, 'MOYEN') <= 7
            && comptePotentielMedical(j, 'FAIBLE') <= 2
          : parJour[j].medical >= 16
            && comptePotentielMedical(j, 'GROS') >= 2
            && parJour[j].pharmacie >= 2
        : pointsMedical(j) >= 100 - 0.01 && parJour[j].pharmacie >= seuils.minPharmacie
  const joursCouverts = JOURS.filter((j) => lignes.some((l) => l.jour === j)).length
  const prêtPourSoumission = estOdypharm2
    ? JOURS.every(quotaPharmacieRespecte)
    : pharmacieUniquement
      ? lignes.length > 0
      : joursCouverts === 5 && JOURS.every(jourOk)

  // Verrouillage progressif : un jour n'est accessible que lorsque tous les
  // jours précédents atteignent leur quota quotidien et leurs règles métier.
  const minimumVisitesJour = (j: Jour) => estOdypharm2
    ? 15
    : Math.max(1, seuils.minMedical + seuils.minPharmacie)
  const jourComplet = (j: Jour) => {
    const total = lignes.filter((l) => l.jour === j).length
    return estOdypharm2
      ? quotaPharmacieRespecte(j)
      : pharmacieUniquement
        ? total >= minimumVisitesJour(j)
        : total >= minimumVisitesJour(j) && jourOk(j)
  }
  const jourPrecedentIncomplet = (j: Jour) => {
    const index = JOURS.indexOf(j)
    return index > 0 ? JOURS.slice(0, index).find((precedent) => !jourComplet(precedent)) ?? null : null
  }
  const changerJour = (j: Jour) => {
    const precedent = jourPrecedentIncomplet(j)
    if (precedent) {
      const total = lignes.filter((l) => l.jour === precedent).length
      const manque = Math.max(0, minimumVisitesJour(precedent) - total)
      setError(`Programmation bloquée : complétez d'abord ${JOUR_LABEL[precedent]} (${total}/${minimumVisitesJour(precedent)} visites, ${manque} manquante(s)) avant de passer à ${JOUR_LABEL[j]}.`)
      return
    }
    setError(null)
    setJourActif(j)
  }

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

  async function supprimerLigne(id: string) {
    setError(null)
    try {
      await retirerLigne(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de supprimer cette ligne.')
    }
  }

  async function soumettreJourActif() {
    if (!programme) return
    setSubmitting(true)
    setResultat(null)
    const { data, error } = await supabase.rpc('soumettre_jour_programme', { p_programme_id: programme.id, p_jour: jourActif })
    setSubmitting(false)
    if (error) { setError(error.message); return }
    setResultat({ statut: 'SOUMIS', message: `${JOUR_LABEL[jourActif]} soumis avec succès.` })
    setJourStatuts((current) => ({ ...current, [jourActif]: { ...current[jourActif], statut: 'SOUMIS', soumis_at: new Date().toISOString() } }))
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
      <div className="space-y-5 mt-2 pb-5">
        <div>
          <h1 className="provisit-page-title">Planning de la semaine</h1>
          <p className="provisit-page-subtitle">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
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
    <div className="space-y-5 mt-2 pb-5">
      <div>
        <h1 className="provisit-page-title">Planning de la semaine</h1>
        <p className="provisit-page-subtitle">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
      </div>

      <Card className={countdown ? 'bg-gradient-to-br from-royal-600 to-royal-700 text-white' : undefined}>
        {programme?.statut === 'BROUILLON' ? (
          countdown ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/70">Soumission avant le {deadline.format("dddd DD/MM [à] HH[h]mm")}</p>
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
        {joursAffiches.map((j) => {
          const count = lignes.filter((l) => l.jour === j).length
          const ok = jourComplet(j)
          const locked = !!jourPrecedentIncomplet(j)
          return (
            <button
              key={j} onClick={() => changerJour(j)}
              title={locked ? `Complétez ${JOUR_LABEL[jourPrecedentIncomplet(j)!]} avant d'accéder à ce jour.` : undefined}
              className={`flex-shrink-0 flex items-center gap-1 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                jourActif === j ? 'bg-royal-600 text-white shadow-soft' : locked ? 'bg-ink-100 text-ink-300 border border-ink-100' : 'bg-white text-ink-500 border border-ink-200'
              }`}
            >
              {locked && <span aria-hidden="true">🔒</span>}
              {JOUR_LABEL[j]}
              <span className={`text-[10px] ${jourActif === j ? 'text-white/70' : 'text-ink-300'}`}>{count}</span>
              {!locked && ok && <IconCheckCircle className={`h-3 w-3 ${jourActif === j ? 'text-white' : 'text-emerald-500'}`} />}
            </button>
          )
        })}
      </div>

      <Card className={jourComplet(jourActif) ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-ink-700">Verrouillage progressif — {JOUR_LABEL[jourActif]}</p>
          <p className={`text-sm font-extrabold tabular-nums ${jourComplet(jourActif) ? 'text-emerald-700' : 'text-amber-700'}`}>
            {lignes.filter((l) => l.jour === jourActif).length}/{minimumVisitesJour(jourActif)}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
          <div className={`h-full rounded-full transition-all ${jourComplet(jourActif) ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, (lignes.filter((l) => l.jour === jourActif).length / minimumVisitesJour(jourActif)) * 100)}%` }} />
        </div>
        {jourComplet(jourActif) ? (
          <p className="mt-2 text-xs text-emerald-700">Quota atteint. Le jour suivant est accessible.</p>
        ) : lignes.filter((l) => l.jour === jourActif).length >= minimumVisitesJour(jourActif) ? (
          <p className="mt-2 text-xs font-medium text-amber-800">
            Le nombre total est atteint, mais la répartition des visites ou les règles de potentiel du jour ne sont pas encore respectées.
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-amber-800">
            Il manque {Math.max(0, minimumVisitesJour(jourActif) - lignes.filter((l) => l.jour === jourActif).length)} visite(s).
            Complétez ce jour pour débloquer le suivant.
          </p>
        )}
      </Card>



      {lignes.length > 0 && (
        <Card>
          <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs font-bold text-ink-600">Récapitulatif de la semaine — par spécialité</p>
            <p className="max-w-full min-w-0 break-words text-left text-sm font-extrabold text-royal-600 sm:text-right">{estOdypharm2 ? `${lignes.filter((l) => l.type_visite === 'PHARMACIE').length} / 75 pharmacies · ${lignes.filter((l) => l.type_visite === 'MEDICAL').length} centres en plus` : `${lignes.length} / ${totalObjectifSpecialites || '—'} visites`}</p>
          </div>
          <div className="space-y-2">
            {ciblesRecap.map((item) => (
              <div key={item.cible} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-500">{item.label}</span>
                <span className={`font-semibold tabular-nums whitespace-nowrap ${item.programme >= item.quota ? 'text-emerald-600' : 'text-ink-700'}`}>
                  {item.programme} / {item.quota}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-2 flex-wrap">
            {(Object.keys(POTENTIEL_LABEL) as Potentiel[]).filter((p) => p !== 'G+' || portefeuille.some((c) => c.potentiel === 'G+')).map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                {POTENTIEL_LABEL[p]} <span className="text-ink-800">{potentielCounts[p]}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {jourVerrouille && (
        <Card className="border-emerald-200 bg-emerald-50/70">
          <p className="text-sm font-semibold text-emerald-800">{etatJourActif?.statut === 'VALIDE' ? 'Journée validée et verrouillée' : 'Délai de modification dépassé'}</p>
          <p className="mt-1 text-xs text-emerald-700">{etatJourActif?.statut === 'VALIDE' ? 'Les visites de cette journée ne peuvent plus être modifiées.' : 'Cette journée reste consultable, mais les modifications sont fermées.'}</p>
        </Card>
      )}

      {!verrouille && !jourVerrouille && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-ink-600">Progression — {JOUR_LABEL[jourActif]}</p>
            <p className="text-[11px] text-ink-400">{joursCouverts}/5 jours couverts</p>
          </div>
          {estOdypharm2 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-600">Pharmacies programmées</span>
                <span className={pharmaciesDuJour.length === 15 ? 'font-bold text-emerald-600' : 'font-bold text-ink-700'}>{pharmaciesDuJour.length}/15</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(quotasPharmacieJour).map(([potentiel, quota]) => {
                  const n = pharmaciesDuJour.filter((l) => l.clients?.potentiel === potentiel).length
                  return <div key={potentiel} className="rounded-xl bg-ink-50 px-2 py-2 text-center">
                    <p className="text-[10px] text-ink-500">{potentiel}</p>
                    <p className="text-sm font-bold text-ink-800">{n}/{quota}</p>
                  </div>
                })}
              </div>
              <p className="text-[11px] text-ink-400">Centres ajoutés : {lignesJour.filter((l) => l.type_visite === 'MEDICAL').length} · en supplément des 15 pharmacies</p>
              {['JEUDI', 'VENDREDI'].includes(jourActif) && <p className="text-[11px] font-medium text-royal-700">Médical : 0 à 2 GROS maximum (aucun minimum). MOYENS et FAIBLES libres.</p>}
            </div>
          ) : (
            <div className={`grid ${pharmacieUniquement ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
              {!pharmacieUniquement && (
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-ink-500">Médical</span>
                    <span className={quotasPersonnalisesLydieSylvestre ? (jourOk(jourActif) ? 'text-emerald-600 font-semibold' : 'text-ink-500') : (pointsMedical(jourActif) >= 100 - 0.01 ? 'text-emerald-600 font-semibold' : 'text-ink-500')}>
                      {quotasPersonnalisesLydieSylvestre
                        ? ['LUNDI','MARDI','MERCREDI'].includes(jourActif)
                          ? `GROS ${comptePotentielMedical(jourActif, 'GROS')}/7 min · MOYEN ${comptePotentielMedical(jourActif, 'MOYEN')}/7 max · FAIBLE ${comptePotentielMedical(jourActif, 'FAIBLE')}/2 max`
                          : `${parJour[jourActif].medical}/16 médical · GROS ${comptePotentielMedical(jourActif, 'GROS')}/2 min`
                        : `${Math.round(pointsMedical(jourActif))}% (min 100%)`}
                    </span>
                  </div>
                  {!quotasPersonnalisesLydieSylvestre && <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                    <div className={`h-full rounded-full ${pointsMedical(jourActif) >= 100 - 0.01 ? 'bg-emerald-500' : 'bg-royal-400'}`}
                      style={{ width: `${Math.min(100, pointsMedical(jourActif))}%` }} />
                  </div>}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-ink-500">Pharmacie</span>
                  <span className={(parJour[jourActif].pharmacie >= (quotasPersonnalisesLydieSylvestre ? 2 : seuils.minPharmacie)) ? 'text-emerald-600 font-semibold' : 'text-ink-500'}>
                    {parJour[jourActif].pharmacie}/{quotasPersonnalisesLydieSylvestre ? 2 : seuils.minPharmacie}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className={`h-full rounded-full ${parJour[jourActif].pharmacie >= seuils.minPharmacie ? 'bg-emerald-500' : 'bg-royal-400'}`}
                    style={{ width: `${Math.min(100, (parJour[jourActif].pharmacie / seuils.minPharmacie) * 100)}%` }} />
                </div>
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
                  <p className="mt-0.5 text-[11px] text-ink-500 truncate">
                    {l.clients?.specialite ? SPECIALITE_LABEL[l.clients.specialite] ?? l.clients.specialite.replaceAll('_', ' ') : 'Client médical'}
                    {l.clients?.centre && l.clients.centre !== l.clients?.nom ? ` · ${l.clients.centre}` : ''}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {l.clients?.potentiel && <PotentielBadge potentiel={l.clients.potentiel} compact />}
                    <span className="text-[11px] text-ink-400">{l.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'}</span>
                  </div>
                </div>
                {!verrouille && !jourVerrouille && (
                  <button onClick={() => supprimerLigne(l.id)} className="rounded-full p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-500">
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {!verrouille && !jourVerrouille && (
          <div className={`grid ${pharmacieUniquement ? 'grid-cols-1' : 'grid-cols-2'} gap-2.5`}>
            {!pharmacieUniquement && <button onClick={() => ouvrirPicker('MEDICAL')} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-royal-200 py-3 text-sm font-semibold text-royal-600">
              <IconPlus className="h-4 w-4" /> Client médical
            </button>}
            <button onClick={() => ouvrirPicker('PHARMACIE')} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-200 py-3 text-sm font-semibold text-emerald-600">
              <IconPlus className="h-4 w-4" /> Pharmacie
            </button>
          </div>
        )}
      </div>

      {!verrouille && !jourVerrouille && (
        <>
          {countdown && !prêtPourSoumission && (
            <Card className="bg-flame-50/60 border border-flame-200">
              <p className="text-xs font-bold text-flame-700 mb-2">À compléter avant de soumettre :</p>
              <ul className="space-y-1">
                {estOdypharm2 ? (
                  JOURS.filter((j) => !quotaPharmacieRespecte(j)).map((j) => (
                    <li key={j} className="text-xs text-flame-700">• {JOUR_LABEL[j]} : compléter les quotas de 15 pharmacies ({Object.entries(QUOTAS_PHARMACIE_ODY[j]).map(([p, q]) => `${p} ${q}`).join(' / ')})</li>
                  ))
                ) : pharmacieUniquement ? (
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
                        • {JOUR_LABEL[j]} : {quotasPersonnalisesLydieSylvestre
                          ? ['LUNDI','MARDI','MERCREDI'].includes(j)
                            ? `GROS ${comptePotentielMedical(j, 'GROS')}/7 minimum, MOYEN ${comptePotentielMedical(j, 'MOYEN')}/7 maximum, FAIBLE ${comptePotentielMedical(j, 'FAIBLE')}/2 maximum, pharmacies ${parJour[j].pharmacie}/2 minimum`
                            : `${parJour[j].medical}/16 médical minimum, GROS ${comptePotentielMedical(j, 'GROS')}/2 minimum, pharmacies ${parJour[j].pharmacie}/2 minimum`
                          : `${parJour[j].medical}/${seuils.minMedical} médical, ${parJour[j].pharmacie}/${seuils.minPharmacie} pharmacie`}
                      </li>
                    ))}
                  </>
                )}

              </ul>
            </Card>
          )}
          <Button fullWidth loading={submitting} onClick={soumettreJourActif}
            disabled={!countdown || !programme || jourVerrouille || (jourStatuts[jourActif]?.statut === 'SOUMIS') || (jourActif === 'SAMEDI' ? lignesJour.length === 0 : !(pharmacieUniquement ? lignesJour.length > 0 : jourOk(jourActif)))}>
            {jourStatuts[jourActif]?.statut === 'SOUMIS' ? `${JOUR_LABEL[jourActif]} déjà soumis` : `Soumettre ${JOUR_LABEL[jourActif]}`}
          </Button>
          <Button fullWidth variant="secondary" loading={submitting} onClick={soumettre} disabled={!countdown || !prêtPourSoumission}>
            Soumettre toute la semaine
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
              <p className="text-xs text-ink-400 mb-3">Sélectionnez librement les clients à programmer pour ce jour.</p>
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
                  const potentielIndisponible = !estOdypharm2 && !pharmacieUniquement && !derogationPotentielActive && !estFawaz && !estFagbede && !potentielAutorise(jourActif, c.potentiel, picking!)
                  const bloqueQuota = quotaPotentielBloque(c.id, c.potentiel)
                  const bloque = potentielIndisponible || bloqueQuota
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
                          <p className="text-[11px] font-medium text-royal-600 truncate">
                            {c.specialite
                              ? `Spécialité : ${SPECIALITE_LABEL[c.specialite] ?? c.specialite.replaceAll('_', ' ')}`
                              : 'Spécialité non renseignée'}
                          </p>
                          {c.centre && (
                            <p className="text-[10px] text-ink-400 truncate">{c.centre}</p>
                          )}
                          {bloque && (
                            <p className="text-[10px] text-flame-600 truncate">
                              {bloqueQuota
                                ? totalJourProjete >= seuils.maxVisitesJour ? `Maximum de ${seuils.maxVisitesJour} visites par jour atteint` :
                                  JOURS_DEROGATION_MOYEN.includes(jourActif) && c.potentiel === 'MOYEN' ? `Maximum de ${seuils.maxMoyenLunMarMer} MOYENS par jour (médical + pharmacie)` :
                                  JOURS_DEROGATION_MOYEN.includes(jourActif) ? 'Seuls les potentiels GROS et MOYEN sont autorisés du lundi au mercredi' :
                                  c.potentiel === 'GROS' ? `Maximum de ${jourActif === 'JEUDI' ? seuils.maxGrosJeudi : seuils.maxGrosVendredi} GROS` :
                                  'Quota FAIBLE atteint : programmez d’abord les GROS et MOYENS disponibles'
                                : c.potentiel
                                  ? `Potentiel ${c.potentiel} non autorisé le ${JOUR_LABEL[jourActif]}`
                                  : 'Potentiel non renseigné, programmation impossible'}
                            </p>
                          )}
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
