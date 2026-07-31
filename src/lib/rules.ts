// Miroir CÔTÉ CLIENT (confort UX uniquement) de la hiérarchisation appliquée par la base de
// données dans supabase/migrations/010_business_rules.sql (public.potentiel_autorise).
// La vérité et l'application réelle de la règle restent exclusivement côté serveur.
import type { Database } from '@/types/database'

type Potentiel = Database['public']['Enums']['potentiel_client']
type Jour = Database['public']['Enums']['jour_semaine']

export const JOURS: Jour[] = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

export function potentielAutorise(jour: Jour, potentiel: Potentiel): boolean {
  switch (jour) {
    case 'LUNDI':
    case 'MARDI':
      return potentiel === 'GROS'
    case 'MERCREDI':
      return potentiel === 'GROS' || potentiel === 'MOYEN'
    case 'JEUDI':
      return potentiel === 'MOYEN' || potentiel === 'FAIBLE'
    case 'VENDREDI':
      return potentiel === 'FAIBLE'
  }
}
