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
  const estFawaz = profile?.id === 'e86efe52-ed01-4d04-8eec-e539fd1e4b30'
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

    // Cet écran sert à préparer la semaine prochaine, même si la clôture de la
    // semaine en cours reste ouverte. Les deux workflows sont indépendants.
    const semaineDebut = semaineSuivante
    // Le secteur alterne d'une semaine à l'autre : si le VM est en A cette semaine,
    // le programme de la semaine prochaine est en B, et inversement.
    const secteurProgramme = profile?.secteur === 'A' ? 'B' : profile?.secteur === 'B' ? 'A' : null

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

    // Ne proposer que les clients actifs du portefeuille appartenant au secteur
    // du programme de la semaine. Le filtrage est fait dès le chargement des données,
    // pas seulement dans le composant d'affichage, pour éviter tout mélange A/B.
    const idsPortefeuille = new Set((portefeuilleData ?? []).map((item) => item.client_id))
    setPortefeuille((clientsData ?? []).filter((client) =>
      idsPortefeuille.has(client.id) && (estFawaz || !prog!.secteur || client.secteur === prog!.secteur)
    ))
    setLignes((lignesData as Ligne[]) ?? [])
    setLoading(false)
  }, [session, profile?.secteur, profile?.id])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load, estFawaz }
}
