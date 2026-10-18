import { Navigate } from 'react-router-dom'

// La vue terrain dédiée n'est pas présente dans le dépôt ; utiliser l'écran de suivi existant.
export default function TerrainHub() {
  return <Navigate to="/admin/suivi-terrain" replace />
}
