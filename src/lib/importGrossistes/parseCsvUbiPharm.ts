// Export UBI PHARM — CSV point-virgule. Colonnes observées :
// fournisseur;etcoda;ean;produit;nb mois stock;stock;cde en cours;moy. ventes;vente mois;M -1...M -6
import { normalizeText } from '@/lib/text'
import { parseCsvDelimited } from './parseCsvDelimited'
import { parseNumFr, type ResultatImportGrossiste } from './types'

export function parseCsvUbiPharm(texte: string, moisReference: string): ResultatImportGrossiste {
  const lignes = parseCsvDelimited(texte, ';')
  const avertissements: string[] = []
  if (lignes.length === 0) return { moisReference, lignes: [], avertissements: ['Fichier vide'] }

  const entete = lignes[0].map((h) => normalizeText(h))
  // Correspondance exacte prioritaire (ex. "stock" ne doit pas matcher "nb mois stock").
  const idx = (motifs: string[]) => {
    const exact = entete.findIndex((h) => motifs.includes(h))
    if (exact >= 0) return exact
    return entete.findIndex((h) => motifs.some((m) => h.includes(m)))
  }

  const iEan = idx(['ean'])
  const iDesignation = idx(['produit'])
  const iStock = idx(['stock'])
  const iVenteMois = idx(['vente mois'])

  if (iEan < 0 || iDesignation < 0) {
    return { moisReference, lignes: [], avertissements: ['Colonnes attendues introuvables (ean / produit) — format inattendu'] }
  }

  const resultat = lignes.slice(1)
    .filter((r) => r[iEan]?.trim())
    .map((r) => ({
      codeExterne: r[iEan].trim(),
      designation: (r[iDesignation] ?? '').trim(),
      stock: iStock >= 0 ? parseNumFr(r[iStock]) : null,
      ventesPeriode: iVenteMois >= 0 ? parseNumFr(r[iVenteMois]) : null,
      moisReference
    }))

  return { moisReference, lignes: resultat, avertissements }
}
