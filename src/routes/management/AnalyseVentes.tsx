import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'

interface AnalyseVentesProps {
  laboratoireId: string
  semaineDebut: string
  produitIds: string[]
}

interface ProduitAnalyse {
  produitId: string
  nom: string
  stock: number
  ventesMois: number
  moyenneMensuelle: number
  couvertureMois: number | null
}

function semainesMois(mois: string) {
  const debut = dayjs(mois).startOf('month').startOf('isoWeek')
  const fin = dayjs(mois).endOf('month')
  const out: string[] = []
  let d = debut
  while (d.isBefore(fin) || d.isSame(fin, 'day')) {
    out.push(d.format('YYYY-MM-DD'))
    d = d.add(1, 'week')
  }
  return out
}

function couvertureTone(mois: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (mois === null) return 'neutral'
  if (mois >= 3) return 'success'
  if (mois >= 1.5) return 'warning'
  return 'danger'
}

export default function AnalyseVentes({ laboratoireId, semaineDebut, produitIds }: AnalyseVentesProps) {
  const [evolution, setEvolution] = useState<{ semaine: string; ventes: number }[]>([])
  const [produits, setProduits] = useState<ProduitAnalyse[]>([])
  const [loading, setLoading] = useState(false)

  const mois = dayjs(semaineDebut).format('YYYY-MM-DD')
  const moisDebut = dayjs(semaineDebut).subtract(2, 'month').startOf('month').format('YYYY-MM-DD')

  useEffect(() => {
    if (!laboratoireId || produitIds.length === 0) {
      setEvolution([])
      setProduits([])
      return
    }
    let actif = true
    async function chargerAnalyse() {
      setLoading(true)
      const debutHistorique = moisDebut
      const finHistorique = dayjs(semaineDebut).format('YYYY-MM-DD')
      const semainesAnalyse = semainesMois(mois)
      const [{ data: ventes }, { data: stocks }, { data: catalogue }] = await Promise.all([
        supabase.from('ventes_hebdomadaires')
          .select('produit_id, semaine_debut, quantite')
          .in('produit_id', produitIds)
          .gte('semaine_debut', debutHistorique)
          .lte('semaine_debut', finHistorique),
        supabase.from('stocks_hebdomadaires')
          .select('produit_id, quantite, semaine_debut')
          .in('produit_id', produitIds)
          .eq('semaine_debut', semaineDebut),
        supabase.from('produits')
          .select('id, nom')
          .in('id', produitIds),
      ])

      const ventesParSemaine = new Map<string, number>()
      for (const v of ventes ?? []) {
        if (dayjs(v.semaine_debut).format('YYYY-MM-DD') >= dayjs(mois).startOf('month').format('YYYY-MM-DD') &&
            dayjs(v.semaine_debut).format('YYYY-MM-DD') <= dayjs(mois).endOf('month').format('YYYY-MM-DD')) {
          ventesParSemaine.set(v.semaine_debut, (ventesParSemaine.get(v.semaine_debut) ?? 0) + Number(v.quantite))
        }
      }

      const historiqueParProduit = new Map<string, number>()
      for (const v of ventes ?? []) {
        historiqueParProduit.set(v.produit_id, (historiqueParProduit.get(v.produit_id) ?? 0) + Number(v.quantite))
      }

      const stockParProduit = new Map<string, number>()
      for (const s of stocks ?? []) {
        stockParProduit.set(s.produit_id, (stockParProduit.get(s.produit_id) ?? 0) + Number(s.quantite))
      }

      const noms = new Map((catalogue ?? []).map((p) => [p.id, p.nom]))
      const result: ProduitAnalyse[] = produitIds.map((id) => {
        const ventesHistorique = historiqueParProduit.get(id) ?? 0
        const moyenneMensuelle = ventesHistorique / 3
        const stock = stockParProduit.get(id) ?? 0
        return {
          produitId: id,
          nom: noms.get(id) ?? '—',
          stock,
          ventesMois: semainesAnalyse.reduce((sum, semaine) => {
            const rows = (ventes ?? []).filter((v) => v.produit_id === id && v.semaine_debut === semaine)
            return sum + rows.reduce((s, v) => s + Number(v.quantite), 0)
          }, 0),
          moyenneMensuelle,
          couvertureMois: moyenneMensuelle > 0 ? stock / moyenneMensuelle : null,
        }
      }).sort((a, b) => (a.couvertureMois ?? 999) - (b.couvertureMois ?? 999))

      if (!actif) return
      setEvolution(semainesAnalyse.map((semaine) => ({
        semaine,
        ventes: ventesParSemaine.get(semaine) ?? 0,
      })))
      setProduits(result)
      setLoading(false)
    }
    chargerAnalyse()
    return () => { actif = false }
  }, [laboratoireId, semaineDebut, produitIds.join(',')])

  const totalVentes = produits.reduce((s, p) => s + p.ventesMois, 0)
  const couvertureMoyenne = useMemo(() => {
    const actifs = produits.filter((p) => p.couvertureMois !== null)
    if (!actifs.length) return null
    return actifs.reduce((s, p) => s + (p.couvertureMois ?? 0), 0) / actifs.length
  }, [produits])

  const maxVentes = Math.max(...evolution.map((x) => x.ventes), 1)

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="font-extrabold text-ink-800">Analyse évolutive & prévision de stock</h2>
          <p className="text-xs text-ink-400 mt-1">Évolution des ventes du mois et estimation de la durée du stock selon le rythme moyen des 3 derniers mois.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge tone="royal">{totalVentes.toLocaleString('fr-FR')} ventes ce mois</Badge>
          <Badge tone={couvertureTone(couvertureMoyenne)}>{couvertureMoyenne !== null ? `${couvertureMoyenne.toFixed(1)} mois de couverture moyenne` : 'Prévision indisponible'}</Badge>
        </div>
      </div>

      {loading ? <p className="text-sm text-ink-400 py-6 text-center">Calcul de l'analyse…</p> : (
        <>
          <div className="mb-6">
            <p className="text-xs font-semibold text-ink-500 mb-2">Évolution hebdomadaire des ventes</p>
            <div className="flex items-end gap-2 h-32 border-b border-ink-100">
              {evolution.map((point) => (
                <div key={point.semaine} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1">
                  <span className="text-[10px] font-semibold text-ink-500">{point.ventes}</span>
                  <div className="w-full max-w-12 rounded-t-md bg-royal-500" style={{ height: `${Math.max(4, (point.ventes / maxVentes) * 88)}%` }} />
                  <span className="text-[9px] text-ink-400">{dayjs(point.semaine).format('DD/MM')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid grid-cols-[minmax(180px,1fr)_90px_110px_130px] gap-2 min-w-[560px] text-xs">
              <div className="font-semibold text-ink-400 uppercase">Produit</div>
              <div className="font-semibold text-ink-400 uppercase text-right">Stock</div>
              <div className="font-semibold text-ink-400 uppercase text-right">Vente moy./mois</div>
              <div className="font-semibold text-ink-400 uppercase text-right">Stock restant</div>
              {produits.map((p) => (
                <div key={p.produitId} className="contents">
                  <div className="border-t border-ink-50 py-2 font-semibold text-ink-700 truncate">{p.nom}</div>
                  <div className="border-t border-ink-50 py-2 text-right">{p.stock.toLocaleString('fr-FR')}</div>
                  <div className="border-t border-ink-50 py-2 text-right">{Math.round(p.moyenneMensuelle).toLocaleString('fr-FR')}</div>
                  <div className="border-t border-ink-50 py-2 text-right">
                    <Badge tone={couvertureTone(p.couvertureMois)}>
                      {p.couvertureMois === null ? 'N/D' : p.couvertureMois < 0.1 ? '< 0,1 mois' : `${p.couvertureMois.toFixed(1)} mois`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-ink-400 mt-4">La prévision est une estimation : stock actuel ÷ moyenne des ventes mensuelles sur les 3 derniers mois. Elle se recalculera automatiquement à chaque nouvelle saisie de ventes et de stock.</p>
        </>
      )}
    </Card>
  )
}
