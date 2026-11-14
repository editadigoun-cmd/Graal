import type { Database } from '@/types/database'

type Potentiel = Database['public']['Enums']['potentiel_client']
type StatutVisite = Database['public']['Enums']['statut_visite']

// Codes couleur fixés une fois pour toutes — réutilisés partout (portefeuille, planning, fiches, dashboard)
export const POTENTIEL_COLOR: Record<Potentiel, { bg: string; text: string; dot: string; ring: string }> = {
  'G+': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-600', ring: 'ring-teal-200' },
  GROS: { bg: 'bg-royal-50', text: 'text-royal-700', dot: 'bg-royal-600', ring: 'ring-royal-200' },
  MOYEN: { bg: 'bg-flame-50', text: 'text-flame-700', dot: 'bg-flame-500', ring: 'ring-flame-200' },
  FAIBLE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' }
}

export const POTENTIEL_LABEL: Record<Potentiel, string> = {
  'G+': 'Très gros potentiel (G+)',
  GROS: 'Gros potentiel',
  MOYEN: 'Moyen potentiel',
  FAIBLE: 'Faible potentiel'
}

export const STATUT_VISITE_COLOR: Record<StatutVisite, { bg: string; text: string }> = {
  REALISEE: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  HORS_PROGRAMME: { bg: 'bg-flame-50', text: 'text-flame-700' },
  NON_FAITE: { bg: 'bg-red-50', text: 'text-red-600' }
}

export const JOUR_LABEL: Record<string, string> = {
  LUNDI: 'Lundi',
  MARDI: 'Mardi',
  MERCREDI: 'Mercredi',
  JEUDI: 'Jeudi',
  VENDREDI: 'Vendredi',
  SAMEDI: 'Samedi'
}
