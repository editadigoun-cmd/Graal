// Export PROMO — CSV point-virgule, encodage Windows-1252 courant (accents mal décodés en UTF-8).
// Colonnes observées : Code CIP;Code CIP 13;Libellé produit;Stock Total;Vente m_7...m_1;
// Vente Mois en cours;Moyenne sur 3 mois;Moyenne sur 12 Mois
import { normalizeText } from '@/lib/text'
import { parseCsvDelimited } from './parseCsvDelimited'
import { parseNumFr, type ResultatImportGrossiste } from './types'

export function parseCsvPromo(texte: string, moisReference: string): ResultatImportGrossiste {
  const lignes = parseCsvDelimited(texte, ';')
  const avertissements: string[] = []
  if (lignes.length === 0) return { moisReference, lignes: [], avertissements: ['Fichier vide'] }

  const entete = lignes[0].map((h) => normalizeText(h))
  // Correspondance exacte prioritaire, repli sur une correspondance partielle.
  const idx = (motifs: string[]) => {
    const exact = entete.findIndex((h) => motifs.includes(h))
    if (exact >= 0) return exact
    return entete.findIndex((h) => motifs.some((m) => h.includes(m)))
  }

  const iCip = idx(['code cip'])
  const iDesignation = idx(['libelle'])
  const iStock = idx(['stock total', 'stock'])
  const iVenteMois = idx(['vente mois en cours'])

  if (iCip < 0 || iDesignation < 0) {
    return { moisReference, lignes: [], avertissements: ['Colonnes attendues introuvables (Code CIP / Libellé produit) — format inattendu'] }
  }

  const resultat = lignes.slice(1)
    .filter((r) => r[iCip]?.trim())
    .map((r) => ({
      codeExterne: r[iCip].trim(),
      designation: (r[iDesignation] ?? '').trim(),
      stock: iStock >= 0 ? parseNumFr(r[iStock]) : null,
      ventesPeriode: iVenteMois >= 0 ? parseNumFr(r[iVenteMois]) : null,
      moisReference
    }))

  return { moisReference, lignes: resultat, avertissements }
}
