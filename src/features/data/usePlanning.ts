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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const vmId = session.user.id
    const semaineActuelle = isoWeekMonday().format('YYYY-MM-DD')
    let semaineDebut = targetSemaineDebut()

    // Une prolongation accordée par l'administration doit primer sur l'ouverture
    // automatique du planning de la semaine suivante.
    const { data: programmeActuel, error: erreurProgrammeActuel } = await supabase
      .from('programmes_hebdomadaires')
      .select('delai_supplementaire_jusqu_a')
      .eq('vm_id', vmId).eq('semaine_debut', semaineActuelle).maybeSingle()
    if (erreurProgrammeActuel) {
      setError(erreurProgrammeActuel.message)
      setLoading(false)
      return
    }
    if (
      programmeActuel?.delai_supplementaire_jusqu_a &&
      new Date(programmeActuel.delai_supplementaire_jusqu_a).getTime() > Date.now()
    ) {
      semaineDebut = semaineActuelle
    }

    let { data: prog } = await supabase
      .from('programmes_hebdomadaires').select('*')
      .eq('vm_id', vmId).eq('semaine_debut', semaineDebut).maybeSingle()

    if (!prog) {
      const { data: created, error: createError } = await supabase
        .from('programmes_hebdomadaires').insert({ vm_id: vmId, semaine_debut: semaineDebut }).select('*').single()
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
    setProgramme(prog)

    const [{ data: lignesData }, { data: clientsData }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      supabase.from('clients').select('*').order('nom')
    ])
    setLignes((lignesData as Ligne[]) ?? [])
    setPortefeuille(clientsData ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load }
}
