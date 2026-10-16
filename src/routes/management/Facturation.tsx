import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'

export default function ManagementFacturation() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Facturation</h1>
        <p className="mt-1 text-sm text-ink-400">Espace de facturation de Graal Medical Solutions.</p>
      </div>
      <Card>
        <p className="text-sm text-ink-600">Le module de facturation n’est pas encore présent dans les fichiers de cette version. Aucune opération de facturation n’est effectuée depuis cet écran.</p>
        <Link className="mt-3 inline-flex text-sm font-semibold text-royal-600 hover:underline" to="/admin/pilotage-ventes">Revenir au pilotage des ventes</Link>
      </Card>
    </div>
  )
}
