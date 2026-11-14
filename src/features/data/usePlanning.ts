import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday } from '@/lib/time'
import type { Database } from '@/types/database'
import { getOfflineSnapshot, saveOfflineSnapshot } from '@/lib/offlineCache'

type Programme = Database['public']['Tables']['programmes_hebdomadaires']['Row']
type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'nom' | 'potentiel' | 'specialite' | 'centre'> | null
}
type ClientRow = Database['public']['Tables']['clients']['Row']
type PlanningSnapshot = { programme: Programme; lignes: Ligne[]; portefeuille: ClientRow[]; zone: boolean; potentiel: boolean; generaliste: boolean }

export function targetSemaineDebut() {
  return isoWeekMonday().add(7, 'day').format('YYYY-MM-DD')
}

export function usePlanning() {
  const { session, profile } = useAuth()
  const estFawaz = profile?.id === 'e86efe52-ed01-4d04-8eec-e539fd1e4b30'
  // Fagbede est autorisé à programmer des clients de tous les secteurs.
  const estFagbede = profile?.id === '96388406-e88e-4146-a372-1df07481c8e4'
  const estOdypharm2 = profile?.equipe_id === 'd8e7f5d2-0d77-4c0b-8a01-000000000002'
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [portefeuille, setPortefeuille] = useState<ClientRow[]>([])
  const [derogationZoneActive, setDerogationZoneActive] = useState(false)
  const [derogationPotentielActive, setDerogationPotentielActive] = useState(false)
  const [derogationGeneralisteActive, setDerogationGeneralisteActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    const vmId = session.user.id
    if (!navigator.onLine) {
      const cached = await getOfflineSnapshot<PlanningSnapshot>(vmId, 'planning')
      if (cached) {
        setProgramme(cached.data.programme)
        setLignes(cached.data.lignes)
        setPortefeuille(cached.data.portefeuille)
        setDerogationZoneActive(cached.data.zone)
        setDerogationPotentielActive(cached.data.potentiel)
        setDerogationGeneralisteActive(cached.data.generaliste)
        setError(null)
      } else {
        setError('Aucun planning enregistré sur ce téléphone. Connectez-vous à Internet pour le télécharger avant de passer hors connexion.')
      }
      setLoading(false)
      return
    }
    const semaineActuelle = isoWeekMonday().format('YYYY-MM-DD')
    const semaineSuivante = targetSemaineDebut()

    // Par défaut, cet écran prépare la semaine prochaine. Mais si un délai
    // supplémentaire est encore actif sur le programme de cette semaine, le VM
    // doit rester sur ce programme jusqu'à l'expiration du délai ou sa validation.
    const { data: programmeActuel, error: erreurProgrammeActuel } = await supabase
      .from('programmes_hebdomadaires').select('*')
      .eq('vm_id', vmId).eq('semaine_debut', semaineActuelle).maybeSingle()
    if (erreurProgrammeActuel) {
      setError(erreurProgrammeActuel.message)
      setLoading(false)
      return
    }
    const statutTermine = programmeActuel?.statut === 'VALIDE' || programmeActuel?.statut === 'VERROUILLE'
    const delaiActif = !!programmeActuel?.delai_supplementaire_jusqu_a &&
      new Date(programmeActuel.delai_supplementaire_jusqu_a).getTime() > Date.now()
    const semaineDebut = programmeActuel && delaiActif && !statutTermine ? semaineActuelle : semaineSuivante
    // Alterner le secteur uniquement lors de la préparation de la semaine suivante.
    const secteurProgramme = semaineDebut === semaineSuivante
      ? (profile?.secteur === 'A' ? 'B' : profile?.secteur === 'B' ? 'A' : null)
      : profile?.secteur ?? null

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

    const [{ data: lignesData, error: lignesError }, { data: portefeuilleData, error: portefeuilleError }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      supabase.from('portefeuille').select('client_id').eq('vm_id', vmId)
    ])
    if (lignesError || portefeuilleError) {
      setError(lignesError?.message ?? portefeuilleError?.message ?? 'Impossible de charger les clients.')
      setLoading(false)
      return
    }

    const [{ data: zoneDerogation }, { data: potentielDerogation }, { data: generalisteDerogation }] = await Promise.all([
      (supabase as any).rpc('derogation_planning_active', {
        p_vm_id: vmId, p_semaine_debut: semaineDebut, p_type: 'ZONE'
      }),
      (supabase as any).rpc('derogation_planning_active', {
        p_vm_id: vmId, p_semaine_debut: semaineDebut, p_type: 'POTENTIEL'
      }),
      (supabase as any).rpc('derogation_planning_active', {
        p_vm_id: vmId, p_semaine_debut: semaineDebut, p_type: 'SPECIALITE:GENERALISTE'
      })
    ])
    const zoneLibre = zoneDerogation === true
    const potentielLibre = potentielDerogation === true
    const generalisteLibre = generalisteDerogation === true
    setDerogationZoneActive(zoneLibre)
    setDerogationPotentielActive(potentielLibre)
    setDerogationGeneralisteActive(generalisteLibre)

    // Supabase limite chaque réponse à 1 000 lignes par défaut. La table clients
    // contient plus de 2 000 fiches : charger toutes les pages évite de masquer
    // des pharmacies situées après la première tranche alphabétique.
    const clientsData: ClientRow[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data: page, error: clientsError } = await supabase
        .from('clients').select('*').eq('actif', true).order('nom').range(from, from + pageSize - 1)
      if (clientsError) {
        setError(clientsError.message)
        setLoading(false)
        return
      }
      clientsData.push(...(page ?? []))
      if (!page || page.length < pageSize) break
    }

    // Ne proposer que les clients actifs du portefeuille appartenant au secteur
    // du programme de la semaine. Le filtrage est fait dès le chargement des données,
    // pas seulement dans le composant d'affichage, pour éviter tout mélange A/B.
    const idsPortefeuille = new Set((portefeuilleData ?? []).map((item) => item.client_id))
    setPortefeuille((clientsData ?? []).filter((client) => {
      // En mode « pharmacie uniquement », la liste est strictement limitée aux
      // pharmacies assignées à CE VM, tous secteurs et potentiels confondus.
      if (prog!.mode_pharmacie_uniquement) {
        return idsPortefeuille.has(client.id) && client.specialite === 'PHARMACIE'
      }
      // Toute dérogation de spécialité reste limitée aux clients du portefeuille du VM.
      // La dérogation GENERALISTE autorise les deux secteurs, mais n'ajoute aucun client externe.
      if (!idsPortefeuille.has(client.id) && !zoneLibre) return false
      return zoneLibre || estFawaz || estFagbede || (generalisteDerogation === true && client.specialite === 'GENERALISTE') || !prog!.secteur || client.secteur === prog!.secteur
    }))
    setLignes((lignesData as Ligne[]) ?? [])
    await saveOfflineSnapshot(vmId, 'planning', {
      programme: prog!,
      lignes: (lignesData as Ligne[]) ?? [],
      portefeuille: (clientsData ?? []).filter((client) => {
        if (prog!.mode_pharmacie_uniquement) return idsPortefeuille.has(client.id) && client.specialite === 'PHARMACIE'
        if (!idsPortefeuille.has(client.id) && !zoneLibre) return false
        return zoneLibre || estFawaz || estFagbede || (generalisteDerogation === true && client.specialite === 'GENERALISTE') || !prog!.secteur || client.secteur === prog!.secteur
      }),
      zone: zoneLibre, potentiel: potentielLibre, generaliste: generalisteLibre
    })
    setLoading(false)
  }, [session, profile?.secteur, profile?.id])

  useEffect(() => {
    void load()
    window.addEventListener('online', load)
    return () => window.removeEventListener('online', load)
  }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load, estFawaz, estFagbede, estOdypharm2, derogationZoneActive, derogationPotentielActive, derogationGeneralisteActive }
}
