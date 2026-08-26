// Format pivot commun aux 4 parseurs grossiste (2 CSV, 2 PDF) — cf. parseCsvPromo.ts,
// parseCsvUbiPharm.ts, parsePdfGapob.ts, parsePdfUbphar.ts.
export interface LigneImportGrossiste {
  /** Clé de rapprochement stable pour ce grossiste (code CIP, EAN, Référence, ou désignation
   *  normalisée pour GAPOB qui n'expose aucun code produit) — persistée dans
   *  mappings_produits_grossistes une fois l'utilisateur l'ayant validée. */
  codeExterne: string
  designation: string
  stock: number | null
  /** Ventes cumulées sur la période de référence (mois en cours / mois clôturé selon le grossiste,
   *  cf. moisReference) — jamais un chiffre hebdomadaire directement : converti en delta
   *  hebdomadaire par le moteur d'import (cf. calculerDeltaHebdo). */
  ventesPeriode: number | null
  /** Mois calendaire (YYYY-MM-01) auquel se rapporte ventesPeriode. */
  moisReference: string
}

export interface ResultatImportGrossiste {
  moisReference: string
  lignes: LigneImportGrossiste[]
  avertissements: string[]
}

/** Parse un nombre au format français (espaces = séparateur de milliers, virgule = décimale). */
export function parseNumFr(s: string | null | undefined): number | null {
  if (!s) return null
  const nettoye = s.replace(/[\s ]/g, '').replace(',', '.')
  if (nettoye === '' || nettoye === '-') return null
  const n = Number(nettoye)
  return Number.isFinite(n) ? n : null
}

const MOIS_FR: Record<string, string> = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12'
}

/** "MAI 2026" / "mai 2026" -> "2026-05-01" */
export function moisFrVersDate(texte: string): string | null {
  const m = texte.trim().toLowerCase().match(/^([a-zéû]+)\s+(\d{4})$/)
  if (!m) return null
  const mois = MOIS_FR[m[1]]
  if (!mois) return null
  return `${m[2]}-${mois}-01`
}

/** "01/08/2026" -> "2026-08-01" (premier jour du mois contenant cette date) */
export function dateFrVersMois(texte: string): string | null {
  const m = texte.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-01`
}
