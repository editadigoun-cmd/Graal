import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'

export default function ManagementAnalyseVentes() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Analyse des ventes</h1>
        <p className="mt-1 text-sm text-ink-400">Accès aux outils de suivi commercial disponibles.</p>
      </div>
      <Card>
        <p className="text-sm text-ink-600">Le module dédié d’analyse détaillée n’est pas présent dans cette version du dépôt.</p>
        <Link className="mt-3 inline-flex text-sm font-semibold text-royal-600 hover:underline" to="/admin/pilotage-ventes">Ouvrir le pilotage des ventes</Link>
      </Card>
    </div>
  )
}
