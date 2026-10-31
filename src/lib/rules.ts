// Miroir CÔTÉ CLIENT (confort UX uniquement) de la hiérarchisation appliquée par la base de
// données dans supabase/migrations/010_business_rules.sql (public.potentiel_autorise).
// La vérité et l'application réelle de la règle restent exclusivement côté serveur.
import type { Database } from '@/types/database'

type Potentiel = Database['public']['Enums']['potentiel_client']
type Jour = Database['public']['Enums']['jour_semaine']
type TypeVisite = Database['public']['Enums']['type_visite']

export const JOURS: Jour[] = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

// Jours où une dérogation plafonnée autorise quelques médecins "MOYEN" (cf. migration 043) —
// le nombre max/jour est vérifié séparément, ici on ne fait que lever le blocage de hiérarchisation.
export const JOURS_DEROGATION_MOYEN: Jour[] = ['LUNDI', 'MARDI', 'MERCREDI']

export const MAX_GROS_JEUDI = 7
export const MAX_GROS_VENDREDI = 3

export function potentielAutorise(jour: Jour, potentiel: Potentiel, typeVisite: TypeVisite): boolean {
  // Pharmacies : nombre libre par potentiel ; aucun potentiel FAIBLE du lundi au mercredi.
  if (typeVisite === 'PHARMACIE' && JOURS_DEROGATION_MOYEN.includes(jour)) return potentiel !== 'FAIBLE'
  if ((typeVisite === 'MEDICAL' || typeVisite === 'PHARMACIE') && potentiel === 'MOYEN' && JOURS_DEROGATION_MOYEN.includes(jour)) {
    return true
  }
  switch (jour) {
    case 'LUNDI':
    case 'MARDI':
      return potentiel === 'GROS'
    case 'MERCREDI':
      return potentiel === 'GROS' || potentiel === 'MOYEN'
    case 'JEUDI':
      return potentiel === 'GROS' || potentiel === 'MOYEN' || potentiel === 'FAIBLE'
    case 'VENDREDI':
      return potentiel === 'GROS' || potentiel === 'MOYEN' || potentiel === 'FAIBLE'
    default:
      return false
  }
}
