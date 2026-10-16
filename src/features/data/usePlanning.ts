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
    const semaineDebut = targetSemaineDebut()

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

    const [{ data: lignesData }, { data: clientsData }, { data: vmProfile }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      supabase.from('clients').select('*').eq('actif', true).order('nom'),
      supabase.from('profiles').select('secteur').eq('id', vmId).maybeSingle()
    ])
    setLignes((lignesData as Ligne[]) ?? [])

    // Le secteur de référence est celui du programme de la semaine, car les secteurs
    // alternent d'une semaine à l'autre. Le profil sert uniquement de repli pour les
    // anciens programmes dont le secteur n'aurait pas été renseigné.
    const secteurSemaine = prog!.secteur ?? vmProfile?.secteur ?? null
    setPortefeuille((clientsData ?? []).filter((client) => secteurSemaine !== null && client.secteur === secteurSemaine))
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load }
}
