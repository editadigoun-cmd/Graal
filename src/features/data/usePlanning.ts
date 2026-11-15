import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday } from '@/lib/time'
import type { Database } from '@/types/database'
import { getOfflineSnapshot, saveOfflineSnapshot } from '@/lib/offlineCache'

type Programme = Database['public']['Tables']['programmes_hebdomadaires']['Row']
type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'nom' | 'potentiel' | 'specialite' | 'centre'> | null
}
type ClientRow = Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'nom' | 'centre' | 'specialite' | 'potentiel' | 'secteur' | 'actif'>
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
  const hasLoaded = useRef(false)

  const retirerLigne = useCallback(async (id: string) => {
    let ligneSupprimee: Ligne | undefined
    setLignes((current) => {
      ligneSupprimee = current.find((ligne) => ligne.id === id)
      return current.filter((ligne) => ligne.id !== id)
    })
    const { error } = await supabase.from('programme_lignes').delete().eq('id', id)
    if (error) {
      if (ligneSupprimee) setLignes((current) => [...current, ligneSupprimee!].sort((a, b) => a.ordre - b.ordre))
      throw error
    }
  }, [])

  const load = useCallback(async () => {
    if (!session) return
    if (!hasLoaded.current) setLoading(true)
    setError(null)
    const vmId = session.user.id
    // Afficher immédiatement le dernier planning local pendant que Supabase
    // actualise les données en arrière-plan. Le cache est privé à ce VM.
    const cached = await getOfflineSnapshot<PlanningSnapshot>(vmId, 'planning')
    if (cached && !hasLoaded.current) {
      setProgramme(cached.data.programme)
      setLignes(cached.data.lignes)
      setPortefeuille(cached.data.portefeuille)
      setDerogationZoneActive(cached.data.zone)
      setDerogationPotentielActive(cached.data.potentiel)
      setDerogationGeneralisteActive(cached.data.generaliste)
      setError(null)
      hasLoaded.current = true
      setLoading(false)
    }
    if (!navigator.onLine) {
      if (!cached) {
        setError('Aucun planning enregistré sur ce téléphone. Connectez-vous à Internet pour le télécharger avant de passer hors connexion.')
      }
      hasLoaded.current = true
      setLoading(false)
      return
    }
    const semaineActuelle = isoWeekMonday().format('YYYY-MM-DD')
    const semaineSuivante = targetSemaineDebut()

    // Par défaut, cet écran prépare la semaine prochaine. Mais si un délai
    // supplémentaire est encore actif sur le programme de cette semaine, le VM
    // doit rester sur ce programme jusqu'à l'expiration du délai ou sa validation.
    // Lire les deux semaines en parallèle : on évite deux allers-retours réseau successifs.
    const [
      { data: programmeActuel, error: erreurProgrammeActuel },
      { data: programmeSuivant, error: erreurProgrammeSuivant }
    ] = await Promise.all([
      supabase.from('programmes_hebdomadaires').select('*')
        .eq('vm_id', vmId).eq('semaine_debut', semaineActuelle).maybeSingle(),
      supabase.from('programmes_hebdomadaires').select('*')
        .eq('vm_id', vmId).eq('semaine_debut', semaineSuivante).maybeSingle()
    ])
    if (erreurProgrammeActuel || erreurProgrammeSuivant) {
      setError(erreurProgrammeActuel?.message ?? erreurProgrammeSuivant?.message ?? 'Impossible de charger le programme.')
      setLoading(false)
      return
    }
    const statutTermine = programmeActuel?.statut === 'VALIDE' || programmeActuel?.statut === 'VERROUILLE'
    const delaiActif = !!programmeActuel?.delai_supplementaire_jusqu_a &&
      new Date(programmeActuel.delai_supplementaire_jusqu_a).getTime() > Date.now()
    const semaineDebut = programmeActuel && delaiActif && !statutTermine ? semaineActuelle : semaineSuivante
    // Alterner le secteur uniquement lors de la préparation de la semaine suivante.
    const secteurProgramme = profile?.secteur === 'MONO' || profile?.secteur === 'COUFFOU'
      ? profile.secteur
      : semaineDebut === semaineSuivante
        ? (profile?.secteur === 'A' ? 'B' : profile?.secteur === 'B' ? 'A' : null)
        : profile?.secteur ?? null

    let prog = semaineDebut === semaineActuelle ? programmeActuel : programmeSuivant

    if (!prog) {
      const { data: created, error: createError } = await supabase
        .from('programmes_hebdomadaires').insert({ vm_id: vmId, semaine_debut: semaineDebut, ...(estOdypharm2 ? { secteur: null } : secteurProgramme ? { secteur: secteurProgramme } : {}) }).select('*').maybeSingle()
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
    if ((estOdypharm2 && prog!.secteur !== null || !!secteurProgramme && prog!.secteur !== secteurProgramme) && prog!.statut === 'BROUILLON') {
      const { data: secteurCorrige, error: erreurSecteur } = await supabase
        .from('programmes_hebdomadaires').update({ secteur: estOdypharm2 ? null : secteurProgramme }).eq('id', prog!.id).select('*').maybeSingle()
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

    // Charger uniquement les fiches utiles au VM. Le scan complet de la table
    // clients n'est utile qu'en cas de dérogation de zone hors portefeuille.
    const idsPortefeuille = new Set((portefeuilleData ?? []).map((item) => item.client_id))
    let clientsData: ClientRow[] = []
    if (zoneLibre && !prog!.mode_pharmacie_uniquement) {
      const { data, error: clientsError } = await supabase
        .from('clients').select('id, nom, centre, specialite, potentiel, secteur, actif').eq('actif', true).order('nom')
      if (clientsError) {
        setError(clientsError.message)
        hasLoaded.current = true
        setLoading(false)
        return
      }
      clientsData = data ?? []
    } else if (idsPortefeuille.size > 0) {
      const { data, error: clientsError } = await supabase
        .from('clients').select('id, nom, centre, specialite, potentiel, secteur, actif').eq('actif', true).in('id', Array.from(idsPortefeuille)).order('nom')
      if (clientsError) {
        setError(clientsError.message)
        hasLoaded.current = true
        setLoading(false)
        return
      }
      clientsData = data ?? []
    }

    // Ne proposer que les clients actifs du portefeuille appartenant au secteur
    // du programme de la semaine.
    const clientsPourPlanning = (clientsData ?? []).filter((client) => {
      // Le potentiel G+ n'est visible que si au moins une fiche G+ appartient
      // réellement au portefeuille du VM, même lorsqu'une dérogation de zone
      // lui permet de consulter des clients d'autres secteurs.
      if (client.potentiel === 'G+' && !idsPortefeuille.has(client.id)) return false
      // En mode « pharmacie uniquement », la liste est strictement limitée aux
      // pharmacies assignées à CE VM, tous secteurs et potentiels confondus.
      if (prog!.mode_pharmacie_uniquement) {
        return idsPortefeuille.has(client.id) && client.specialite === 'PHARMACIE'
      }
      // Toute dérogation de spécialité reste limitée aux clients du portefeuille du VM.
      // La dérogation GENERALISTE autorise les deux secteurs, mais n'ajoute aucun client externe.
      if (!idsPortefeuille.has(client.id) && !zoneLibre) return false
      return zoneLibre || estFawaz || estFagbede || (generalisteDerogation === true && client.specialite === 'GENERALISTE') || !prog!.secteur || client.secteur === prog!.secteur
    })
    setPortefeuille(clientsPourPlanning)
    setLignes((lignesData as Ligne[]) ?? [])
    hasLoaded.current = true
    setLoading(false)
    // L'écriture IndexedDB ne doit pas retarder l'affichage du planning.
    void saveOfflineSnapshot(vmId, 'planning', {
      programme: prog!,
      lignes: (lignesData as Ligne[]) ?? [],
      portefeuille: clientsPourPlanning,
      zone: zoneLibre, potentiel: potentielLibre, generaliste: generalisteLibre
    })
  }, [session, profile?.secteur, profile?.equipe_id, profile?.id])

  useEffect(() => {
    void load()
    window.addEventListener('online', load)
    return () => window.removeEventListener('online', load)
  }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load, retirerLigne, estFawaz, estFagbede, estOdypharm2, derogationZoneActive, derogationPotentielActive, derogationGeneralisteActive }
}
