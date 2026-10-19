import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday, nowBenin } from '@/lib/time'
import type { Database } from '@/types/database'

type Programme = Database['public']['Tables']['programmes_hebdomadaires']['Row']
type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'nom' | 'potentiel' | 'specialite' | 'centre'> | null
}
type ClientRow = Database['public']['Tables']['clients']['Row']
type Secteur = Database['public']['Enums']['secteur_code']

// Les délais exceptionnels portent sur la semaine en cours : on ne bascule vers
// la semaine suivante qu'après l'échéance individuelle, à 23 h (heure du Bénin).
const DELAI_MARDI_VM_IDS = new Set([
  '45a172c9-8e94-402b-90e5-a39f59bd584b', // Pénélope
  'fd879be3-1200-48be-a1ff-77d15bd4dc06', // Christel
  '4519e59c-ae91-44d7-98a8-b906662a7f2d', // Herbert
])

export function targetSemaineDebut(vmId?: string) {
  const lundi = isoWeekMonday()
  // Sans VM connue (affichage transitoire), appliquer le délai le plus long
  // pour éviter de faire apparaître brièvement la semaine suivante trop tôt.
  const delaiMardi = vmId ? DELAI_MARDI_VM_IDS.has(vmId) : true
  const echeance = delaiMardi
    ? lundi.add(1, 'day').hour(23).minute(0).second(0).millisecond(0)
    : lundi.hour(23).minute(0).second(0).millisecond(0)

  // Avant l'échéance, rester sur la semaine actuelle. Après l'échéance,
  // ouvrir la programmation de la semaine suivante.
  return (nowBenin().isBefore(echeance) ? lundi : lundi.add(7, 'day')).format('YYYY-MM-DD')
}

function secteurSuivant(secteur: Secteur | null | undefined): Secteur | null {
  if (secteur === 'A') return 'B'
  if (secteur === 'B') return 'A'
  return null
}

export function usePlanning() {
  const { session } = useAuth()
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [portefeuille, setPortefeuille] = useState<ClientRow[]>([])
  const [secteurVm, setSecteurVm] = useState<Secteur | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    const vmId = session.user.id
    const semaineDebut = targetSemaineDebut()

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('secteur').eq('id', vmId).maybeSingle()
    if (profileError || !profile) {
      setError(profileError?.message ?? 'Profil utilisateur introuvable. Contacte un administrateur ; aucun programme n’a été supprimé.')
      setLoading(false)
      return
    }

    // Le secteur alterne d'une semaine à l'autre : A -> B et B -> A.
    // On prend le programme hebdomadaire le plus récent avant la semaine cible.
    const { data: programmePrecedent, error: precedentError } = await supabase
      .from('programmes_hebdomadaires').select('secteur,semaine_debut')
      .eq('vm_id', vmId).lt('semaine_debut', semaineDebut)
      .order('semaine_debut', { ascending: false }).limit(1).maybeSingle()
    if (precedentError) {
      setError(precedentError.message)
      setLoading(false)
      return
    }

    // Un ancien brouillon peut avoir secteur = null (création antérieure à la règle d'alternance).
    // Dans ce cas, on reconstitue son secteur attendu comme l'opposé du secteur du profil,
    // puis on calcule le secteur de la semaine cible. Sans ce fallback, deux semaines
    // consécutives peuvent être affectées au même secteur.
    const secteurReference = programmePrecedent
      ? (programmePrecedent.secteur ?? secteurSuivant(profile.secteur) ?? profile.secteur)
      : profile.secteur
    const secteurCible = secteurSuivant(secteurReference) ?? profile.secteur
    setSecteurVm(secteurCible)

    let { data: prog, error: programmeError } = await supabase
      .from('programmes_hebdomadaires').select('*')
      .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()
    if (programmeError) {
      setError(programmeError.message)
      setLoading(false)
      return
    }

    if (!prog) {
      const { data: created, error: createError } = await supabase
        .from('programmes_hebdomadaires')
        .insert({ vm_id: vmId, semaine_debut: semaineDebut, secteur: secteurCible })
        .select('*').maybeSingle()
      if (createError) {
        if (createError.code === '23505') {
          const { data: existing, error: refetchError } = await supabase
            .from('programmes_hebdomadaires').select('*')
            .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()
          if (refetchError || !existing) {
            setError(refetchError?.message ?? 'Le programme existe peut-être déjà, mais il n’a pas pu être relu. Recharge la page ; les données enregistrées ne sont pas supprimées.')
            setLoading(false)
            return
          }
          prog = existing
        } else {
          setError(createError.message)
          setLoading(false)
          return
        }
      } else if (created) {
        prog = created
      } else {
        const { data: existing, error: refetchError } = await supabase
          .from('programmes_hebdomadaires').select('*')
          .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()
        if (refetchError || !existing) {
          setError(refetchError?.message ?? 'Le programme n’a pas pu être relu après sa création. Recharge la page ; aucun programme existant n’a été supprimé.')
          setLoading(false)
          return
        }
        prog = existing
      }
    } else if (prog.secteur !== secteurCible) {
      // Corrige aussi un programme cible créé auparavant avec le secteur du profil.
      const { data: corrected, error: correctionError } = await supabase
        .from('programmes_hebdomadaires').update({ secteur: secteurCible })
        .eq('id', prog.id).select('*').maybeSingle()
      if (correctionError || !corrected) {
        setError(correctionError?.message ?? 'Impossible de relire le programme après mise à jour du secteur. Les lignes du programme sont conservées.')
        setLoading(false)
        return
      }
      prog = corrected
    }
    setProgramme(prog)

    const [{ data: lignesData, error: lignesError }, { data: portefeuilleData, error: portefeuilleError }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)')
        .eq('programme_id', prog!.id).order('ordre'),
      supabase.from('portefeuille').select('client_id').eq('vm_id', vmId)
    ])
    if (lignesError || portefeuilleError) {
      setError(lignesError?.message ?? portefeuilleError?.message ?? 'Impossible de charger le portefeuille.')
      setLoading(false)
      return
    }

    const clientIds = [...new Set((portefeuilleData ?? []).map((item) => item.client_id))]
    if (clientIds.length === 0) {
      setPortefeuille([])
    } else {
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients').select('*').in('id', clientIds).eq('actif', true).order('nom')
      if (clientsError) {
        setError(clientsError.message)
        setLoading(false)
        return
      }
      setPortefeuille(clientsData ?? [])
    }
    setLignes((lignesData as Ligne[]) ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, secteurVm, loading, error, setError, reload: load }
}
