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
type Secteur = Database['public']['Enums']['secteur_code']

export function targetSemaineDebut() {
  return isoWeekMonday().add(7, 'day').format('YYYY-MM-DD')
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
      .from('profiles').select('secteur').eq('id', vmId).single()
    if (profileError) {
      setError(profileError.message)
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

    const secteurReference = programmePrecedent?.secteur ?? profile.secteur
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
        .select('*').single()
      if (createError) {
        if (createError.code === '23505') {
          const { data: existing, error: refetchError } = await supabase
            .from('programmes_hebdomadaires').select('*')
            .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).single()
          if (refetchError) {
            setError(refetchError.message)
            setLoading(false)
            return
          }
          prog = existing
        } else {
          setError(createError.message)
          setLoading(false)
          return
        }
      } else {
        prog = created
      }
    } else if (prog.secteur !== secteurCible) {
      // Corrige aussi un programme cible créé auparavant avec le secteur du profil.
      const { data: corrected, error: correctionError } = await supabase
        .from('programmes_hebdomadaires').update({ secteur: secteurCible })
        .eq('id', prog.id).select('*').single()
      if (correctionError) {
        setError(correctionError.message)
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
