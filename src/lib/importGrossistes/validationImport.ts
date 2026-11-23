import type { LigneImportGrossiste, ResultatImportGrossiste } from './types'

export type NiveauAnomalie = 'bloquante' | 'attention' | 'info'
export interface AnomalieImport {
  niveau: NiveauAnomalie
  code: string
  message: string
  lignes?: number[]
}

export interface RapportValidationImport {
  anomalies: AnomalieImport[]
  totalLignes: number
  totalVentes: number
  lignesSansCode: number
  doublonsCodes: string[]
  doublonsProduits: string[]
  peutValider: boolean
}

function normaliser(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Validation déterministe avant toute intégration. L'IA ne peut pas outrepasser ces contrôles. */
export function validerReleveGrossiste(
  parsed: ResultatImportGrossiste,
  lignes: Array<{ designation_source: string; code_externe: string | null; produit_id: string | null; ventes: number | null }>,
  moisConfirme?: string | null
): RapportValidationImport {
  const anomalies: AnomalieImport[] = []
  const totalVentes = lignes.reduce((sum, line) => sum + (typeof line.ventes === 'number' && Number.isFinite(line.ventes) ? line.ventes : 0), 0)
  const codes = new Map<string, number[]>()
  const noms = new Map<string, number[]>()
  const produits = new Map<string, number[]>()
  let lignesSansCode = 0

  lignes.forEach((line, index) => {
    const n = index + 1
    const code = (line.code_externe ?? '').trim()
    if (!code) lignesSansCode++
    else codes.set(code, [...(codes.get(code) ?? []), n])
    const nom = normaliser(line.designation_source)
    if (nom) noms.set(nom, [...(noms.get(nom) ?? []), n])
    if (line.produit_id) produits.set(line.produit_id, [...(produits.get(line.produit_id) ?? []), n])
    if (line.ventes !== null && (!Number.isFinite(line.ventes) || line.ventes < 0)) {
      anomalies.push({ niveau: 'bloquante', code: 'vente_invalide', message: `Ligne ${n} : quantité de ventes négative ou invalide.`, lignes: [n] })
    }
    if (line.ventes !== null && !Number.isInteger(line.ventes)) {
      anomalies.push({ niveau: 'attention', code: 'vente_fractionnaire', message: `Ligne ${n} : quantité fractionnaire (${line.ventes}). Vérifiez l'unité.`, lignes: [n] })
    }
    if (!line.designation_source.trim()) anomalies.push({ niveau: 'bloquante', code: 'designation_absente', message: `Ligne ${n} : désignation produit vide.`, lignes: [n] })
  })

  const doublonsCodes = [...codes.entries()].filter(([, ns]) => ns.length > 1).map(([code]) => code)
  for (const [code, ns] of codes) if (ns.length > 1) anomalies.push({ niveau: 'bloquante', code: 'code_duplique', message: `Code externe répété « ${code} » aux lignes ${ns.join(', ')}. Risque de double comptage.`, lignes: ns })
  for (const [nom, ns] of noms) if (ns.length > 1 && !codes.has(nom)) anomalies.push({ niveau: 'attention', code: 'designation_dupliquee', message: `Désignation similaire répétée aux lignes ${ns.join(', ')}. Vérifiez si ce sont des doublons.`, lignes: ns })
  const doublonsProduits = [...produits.entries()].filter(([, ns]) => ns.length > 1).map(([id]) => id)
  for (const [, ns] of produits) if (ns.length > 1) anomalies.push({ niveau: 'attention', code: 'produit_multi_lignes', message: `Le même produit du catalogue est associé à plusieurs lignes (${ns.join(', ')}). Vérifiez avant intégration.`, lignes: ns })

  if (!moisConfirme && !parsed.moisReference) anomalies.push({ niveau: 'bloquante', code: 'mois_absent', message: 'Mois de référence absent : il doit être confirmé manuellement.' })
  if (parsed.avertissements.length) parsed.avertissements.forEach(message => anomalies.push({ niveau: 'attention', code: 'lecture_source', message }))
  if (lignes.length === 0) anomalies.push({ niveau: 'bloquante', code: 'aucune_ligne', message: 'Aucune ligne produit à importer.' })
  if (lignes.every(line => line.ventes === null)) anomalies.push({ niveau: 'bloquante', code: 'ventes_absentes', message: 'Aucune quantité de ventes n’a été extraite.' })
  const mapped = lignes.filter(line => line.produit_id && line.ventes !== null).length
  if (mapped === 0) anomalies.push({ niveau: 'bloquante', code: 'aucun_rapprochement', message: 'Aucune ligne associée à un produit avec une quantité.' })
  if (mapped < lignes.filter(line => line.ventes !== null).length) anomalies.push({ niveau: 'attention', code: 'lignes_non_associees', message: `${lignes.filter(line => line.ventes !== null && !line.produit_id).length} ligne(s) de ventes restent sans produit associé.` })
  if (totalVentes < 0) anomalies.push({ niveau: 'bloquante', code: 'total_negatif', message: 'Le total des ventes est négatif.' })

  return { anomalies, totalLignes: lignes.length, totalVentes, lignesSansCode, doublonsCodes, doublonsProduits, peutValider: !anomalies.some(a => a.niveau === 'bloquante') }
}
