import { Card } from '@/components/ui/Card'
import { IconClipboard } from '@/components/ui/icons'

export default function Facturation() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Facturation</h1>
        <p className="mt-1 text-sm text-ink-400">Gestion des factures proforma, bordereaux de livraison, clients et produits de facturation.</p>
      </div>
      <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/60">
        <IconClipboard className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-ink-800">Module à restaurer</p>
          <p className="mt-1 text-sm text-ink-600">L’écran de facturation n’est pas présent dans la version actuelle du dépôt. Aucune facture ni donnée financière n’a été modifiée. Le module doit être restauré avant de reprendre les opérations de facturation.</p>
        </div>
      </Card>
    </div>
  )
}
