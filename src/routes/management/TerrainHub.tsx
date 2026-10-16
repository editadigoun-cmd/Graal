import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'

export default function ManagementTerrainHub() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Espace terrain</h1>
        <p className="mt-1 text-sm text-ink-400">Accès rapide aux outils de suivi des activités terrain.</p>
      </div>
      <Card>
        <p className="text-sm text-ink-600">Le module centralisé « Espace terrain » n’est pas présent dans cette version du dépôt. Les outils de suivi existants restent accessibles ci-dessous.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link className="text-sm font-semibold text-royal-600 hover:underline" to="/admin/suivi-terrain">Suivi terrain</Link>
          <Link className="text-sm font-semibold text-royal-600 hover:underline" to="/admin/activite">Activités</Link>
          <Link className="text-sm font-semibold text-royal-600 hover:underline" to="/admin/plan-activites">Plan d’activités</Link>
        </div>
      </Card>
    </div>
  )
}
