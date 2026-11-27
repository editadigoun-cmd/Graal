import type { Database } from '@/types/database'

type Potentiel = Database['public']['Enums']['potentiel_client']
type Jour = Database['public']['Enums']['jour_semaine']
type TypeVisite = Database['public']['Enums']['type_visite']

export const JOURS: Jour[] = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

// Seule restriction liée au potentiel : trois FAIBLES maximum par jour du lundi au mercredi.
// Le contrôle de cumul (médical + pharmacie) est effectué dans le planning et dans Supabase.
export const MAX_FAIBLES_LUN_MAR_MER = 3
export const MAX_VISITES_JOUR = 22

export function potentielAutorise(_jour: Jour, _potentiel: Potentiel, _typeVisite: TypeVisite): boolean {
  return true
}
