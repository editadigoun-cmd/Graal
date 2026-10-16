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
  const { session } = useAuth()
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [portefeuille, setPortefeuille] = useState<ClientRow[]>([])
  const [secteurProgramme, setSecteurProgramme] = useState<Database['public']['Enums']['secteur_code'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const vmId = session.user.id
    const semaineDebut = targetSemaineDebut()
    const [{ data: profile }, { data: programmePrecedent }] = await Promise.all([
      supabase.from('profiles').select('secteur').eq('id', vmId).maybeSingle(),
      supabase.from('programmes_hebdomadaires').select('secteur')
        .eq('vm_id', vmId).lt('semaine_debut', semaineDebut).not('secteur', 'is', null)
        .order('semaine_debut', { ascending: false }).limit(1).maybeSingle()
    ])
    const secteurPrecedent = programmePrecedent?.secteur
    const secteurCible = secteurPrecedent
      ? (secteurPrecedent === 'A' ? 'B' : 'A')
      : profile?.secteur
        ? (profile.secteur === 'A' ? 'B' : 'A')
        : null

    let { data: prog } = await supabase
      .from('programmes_hebdomadaires').select('*')
      .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()

    if (!prog) {
      const { data: created, error: createError } = await supabase
        .from('programmes_hebdomadaires').insert({ vm_id: vmId, semaine_debut: semaineDebut, secteur: secteurCible }).select('*').single()
      if (createError) {
        if (createError.code === '23505') {
          // Course concurrente (ex. rechargement de session ou deux onglets) : un autre appel a
          // déjà créé la ligne entre le SELECT et l'INSERT — on la relit simplement.
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
    }
    if (prog && !prog.secteur && secteurCible) {
      const { data: programmeAvecSecteur, error: secteurError } = await supabase
        .from('programmes_hebdomadaires').update({ secteur: secteurCible }).eq('id', prog.id).select('*').single()
      if (secteurError) {
        setError(secteurError.message)
        setLoading(false)
        return
      }
      prog = programmeAvecSecteur
    }
    setProgramme(prog)
    const secteurActif = prog?.secteur ?? secteurCible ?? profile?.secteur ?? null
    setSecteurProgramme(secteurActif)

    const { data: portefeuilleData, error: portefeuilleError } = await supabase
      .from('portefeuille').select('client_id').eq('vm_id', vmId)
    if (portefeuilleError) {
      setError(portefeuilleError.message)
      setLoading(false)
      return
    }
    const clientIds = (portefeuilleData ?? []).map((p) => p.client_id)
    const [{ data: lignesData }, { data: clientsData }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      clientIds.length
        ? supabase.from('clients').select('*').in('id', clientIds).eq('actif', true).order('nom')
        : Promise.resolve({ data: [], error: null })
    ])
    setLignes((lignesData as Ligne[]) ?? [])
    setPortefeuille((clientsData ?? []).filter((c) => !secteurActif || c.secteur === secteurActif))
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, secteurProgramme, loading, error, setError, reload: load }
}
