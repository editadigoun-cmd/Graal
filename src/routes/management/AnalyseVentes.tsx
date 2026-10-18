import { Navigate } from 'react-router-dom'

// L'ancien écran dédié n'est pas présent dans le dépôt. Rediriger vers le tableau
// de pilotage existant évite une route cassée sans inventer de données de vente.
export default function AnalyseVentes() {
  return <Navigate to="/admin/pilotage-ventes" replace />
}
