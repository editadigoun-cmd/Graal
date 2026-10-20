import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday } from '@/lib/time'
import type { Database } from '@/types/database'

type Programme = Database['public']['Tables']['programmes_hebdomadaires']['Row']
type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'nom' | 'potentiel' | 'specialite' | 'centre'> | null
}
type ClientRow = Database['public']['Tables']['clients']['Row']

export function targetSemaineDebut() {
  return isoWeekMonday().add(7, 'day').format('YYYY-MM-DD')
}

export function usePlanning() {
  const { session, profile } = useAuth()
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [portefeuille, setPortefeuille] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    const vmId = session.user.id
    const semaineActuelle = isoWeekMonday().format('YYYY-MM-DD')
    const semaineSuivante = targetSemaineDebut()

    // Tant qu'il reste des jours non validés et que leur échéance individuelle n'est pas passée,
    // le VM doit continuer à voir le programme de la semaine en cours. La semaine suivante
    // ne devient active qu'après l'expiration de la dernière échéance encore ouverte.
    const { data: programmeActuel, error: erreurProgrammeActuel } = await supabase
      .from('programmes_hebdomadaires').select('*')
      .eq('vm_id', vmId).eq('semaine_debut', semaineActuelle).maybeSingle()
    if (erreurProgrammeActuel) {
      setError(erreurProgrammeActuel.message)
      setLoading(false)
      return
    }

    let semaineDebut = semaineSuivante
    if (programmeActuel?.statut === 'BROUILLON') {
      const { data: validations, error: erreurValidations } = await supabase
        .from('programme_jours_validation').select('statut, date_limite')
        .eq('programme_id', programmeActuel.id)
      if (erreurValidations) {
        setError(erreurValidations.message)
        setLoading(false)
        return
      }

      const maintenant = Date.now()
      const joursOuverts = (validations ?? []).filter((jour) => jour.statut !== 'VALIDE')
      const echeancesOuvertes = joursOuverts
        .map((jour) => jour.date_limite ? new Date(jour.date_limite).getTime() : 0)
        .filter((echeance) => Number.isFinite(echeance) && echeance > maintenant)
      const delaiSupplementaire = programmeActuel.delai_supplementaire_jusqu_a
        ? new Date(programmeActuel.delai_supplementaire_jusqu_a).getTime()
        : 0

      if (joursOuverts.length > 0 && (echeancesOuvertes.length > 0 || delaiSupplementaire > maintenant)) {
        semaineDebut = semaineActuelle
      }
    }

    const secteurProgramme = semaineDebut === semaineActuelle
      ? profile?.secteur
      : profile?.secteur === 'A' ? 'B' : profile?.secteur === 'B' ? 'A' : null

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
        .from('programmes_hebdomadaires').insert({ vm_id: vmId, semaine_debut: semaineDebut, ...(secteurProgramme ? { secteur: secteurProgramme } : {}) }).select('*').maybeSingle()
      if (createError) {
        if (createError.code === '23505') {
          const { data: existing, error: refetchError } = await supabase
            .from('programmes_hebdomadaires').select('*')
            .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()
          if (refetchError || !existing) {
            setError(refetchError?.message ?? 'Le programme de cette semaine n’a pas pu être relu. Les programmes enregistrés ne sont pas supprimés ; recharge la page ou contacte un administrateur.')
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
          setError(refetchError?.message ?? 'La création du programme n’a pas renvoyé de résultat. Les programmes déjà enregistrés sont conservés ; recharge la page.')
          setLoading(false)
          return
        }
        prog = existing
      }
    }
    if (secteurProgramme && prog!.secteur !== secteurProgramme && prog!.statut === 'BROUILLON') {
      const { data: secteurCorrige, error: erreurSecteur } = await supabase
        .from('programmes_hebdomadaires').update({ secteur: secteurProgramme }).eq('id', prog!.id).select('*').maybeSingle()
      if (erreurSecteur) {
        setError(erreurSecteur.message)
        setLoading(false)
        return
      }
      if (secteurCorrige) prog = secteurCorrige
    }
    setProgramme(prog)

    const [{ data: lignesData, error: lignesError }, { data: clientsData, error: clientsError }, { data: portefeuilleData, error: portefeuilleError }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      supabase.from('clients').select('*').eq('actif', true).order('nom'),
      supabase.from('portefeuille').select('client_id').eq('vm_id', vmId)
    ])
    if (lignesError || clientsError || portefeuilleError) {
      setError(lignesError?.message ?? clientsError?.message ?? portefeuilleError?.message ?? 'Impossible de charger les clients.')
      setLoading(false)
      return
    }

    // Tous les clients actifs du portefeuille du VM sont proposés, tous secteurs confondus.
    const idsPortefeuille = new Set((portefeuilleData ?? []).map((item) => item.client_id))
    setPortefeuille((clientsData ?? []).filter((client) => idsPortefeuille.has(client.id)))
    setLignes((lignesData as Ligne[]) ?? [])
    setLoading(false)
  }, [session, profile?.secteur])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load }
}
