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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    const vmId = session.user.id
    const semaineDebut = targetSemaineDebut()

    const { data: vmProfile, error: profileError } = await supabase
      .from('profiles').select('secteur').eq('id', vmId).maybeSingle()
    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    const { data: programmePrecedent, error: precedentError } = await supabase
      .from('programmes_hebdomadaires').select('secteur,semaine_debut')
      .eq('vm_id', vmId).lt('semaine_debut', semaineDebut)
      .order('semaine_debut', { ascending: false }).limit(1).maybeSingle()
    if (precedentError) {
      setError(precedentError.message)
      setLoading(false)
      return
    }

    // Alternance hebdomadaire obligatoire : A -> B, puis B -> A.
    const secteurReference = programmePrecedent?.secteur ?? vmProfile?.secteur ?? null
    const secteurCible = secteurSuivant(secteurReference) ?? vmProfile?.secteur ?? null

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
        .insert({ vm_id: vmId, semaine_debut: semaineDebut, ...(secteurCible ? { secteur: secteurCible } : {}) })
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
    } else if (secteurCible && prog.secteur !== secteurCible) {
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

    const [{ data: lignesData }, { data: clientsData }] = await Promise.all([
      supabase.from('programme_lignes').select('*, clients(id, nom, potentiel, specialite, centre)').eq('programme_id', prog!.id).order('ordre'),
      supabase.from('clients').select('*').eq('actif', true).order('nom')
    ])
    setLignes((lignesData as Ligne[]) ?? [])

    const secteurSemaine = prog!.secteur ?? secteurCible
    setPortefeuille((clientsData ?? []).filter((client) =>
      secteurSemaine !== null && secteurSemaine !== undefined && client.secteur === secteurSemaine
    ))
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { programme, lignes, portefeuille, loading, error, setError, reload: load }
}
