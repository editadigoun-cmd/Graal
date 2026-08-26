// PDF GAPOB "STATISTIQUE DE VENTE PAR FOURNISSEUR" — un fichier par laboratoire, filtré côté
// GAPOB. Colonnes à droite alignées (numériques) : Stock actuel | Cmde four. | Qté vendue
// Mois(M)/M-1/M-2 | C.A. Ce mois. Aucun code produit exposé : la désignation normalisée sert de
// clé de rapprochement. Le mois auquel "Mois (M)" se rapporte est lu dans le pied de page
// ("FRS. ... <NOM MOIS> <ANNÉE>"), pas dans l'en-tête — GAPOB ne met à jour ce relevé qu'une
// fois le mois clôturé (cf. message client : "ventes toujours pas actualisées toutes les semaines").
import { normalizeText } from '@/lib/text'
import { extraireTextePdf, grouperEnLignes, type ItemTexte } from './pdfText'
import { moisFrVersDate, parseNumFr, type ResultatImportGrossiste } from './types'

const MOTS_A_IGNORER = ['GAPOB', 'Service Informatique', 'STATISTIQUE', 'Désignation', 'FOURNISSEUR:', 'Nombre de produits', 'FRS.']

function bucketRightEdge(items: ItemTexte[], lo: number, hi: number): string {
  return items.filter((it) => it.right > lo && it.right <= hi).map((it) => it.str).join(' ').trim()
}

export async function parsePdfGapob(fichier: File): Promise<ResultatImportGrossiste> {
  const avertissements: string[] = []
  const pages = await extraireTextePdf(fichier)
  if (pages.length === 0) return { moisReference: '', lignes: [], avertissements: ['PDF vide ou illisible'] }

  const tousItems = pages[0].items
  const texteComplet = pages.flatMap((p) => p.items.map((it) => it.str)).join(' ')

  // Mois de référence : cherché dans tout le texte (pied de page, ex. "MAI 2026")
  const matchMois = texteComplet.match(/\b(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b/i)
  const moisReference = matchMois ? moisFrVersDate(matchMois[0]) : null
  if (!moisReference) avertissements.push("Mois de référence introuvable dans le PDF — vérifiez qu'il s'agit bien d'un export GAPOB standard")

  const lignesGroupees = grouperEnLignes(tousItems)
  const dataRows = lignesGroupees.filter((r) => {
    const first = r.items[0]
    if (!first || first.x > 200) return false
    return !MOTS_A_IGNORER.some((m) => first.str.includes(m))
  })

  const lignes = dataRows.map((r) => {
    const designation = r.items.filter((it) => it.x < 230).map((it) => it.str).join(' ').trim()
    const stock = parseNumFr(bucketRightEdge(r.items, 230, 295))
    const qteMois = parseNumFr(bucketRightEdge(r.items, 345, 390))
    return {
      codeExterne: normalizeText(designation),
      designation,
      stock,
      ventesPeriode: qteMois,
      moisReference: moisReference ?? ''
    }
  }).filter((l) => l.designation !== '')

  if (lignes.length === 0) avertissements.push('Aucune ligne produit détectée — la mise en page GAPOB a peut-être changé')

  return { moisReference: moisReference ?? '', lignes, avertissements }
}
