// Lecture stricte du relevé PDF UBPHAR.
// Les positions sont détectées dans chaque page : aucune coordonnée de colonne n'est devinée.
// Une cellule de ventes ou de stock vide signifie 0.
import { extraireTextePdf, type ItemTexte } from './pdfText'
import { dateFrVersMois, type ResultatImportGrossiste } from './types'
import { parseNumFr } from './types'

const REF_REGEX = /^[A-Z]{3,6}\d{2,4}$/
const COL_NOMS = ['ref', 'designation', 'stock', 'depuis1er', 'juillet', 'juin', 'mai', 'avril', 'mars', 'cmde'] as const
type ColNom = typeof COL_NOMS[number]
const ENTETES: Record<ColNom, string[]> = {
  ref: ['référence', 'reference'], designation: ['désignation', 'designation'],
  stock: ['stock au', 'stock'], depuis1er: ['depuis le', 'ventes depuis le'],
  juillet: ['juillet'], juin: ['juin'], mai: ['mai'], avril: ['avril'], mars: ['mars'],
  cmde: ['commande', 'command']
}
function normaliser(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
function trouverXEntete(items: ItemTexte[], motifs: string[]): number | null {
  for (const it of items) {
    const texte = normaliser(it.str)
    if (motifs.some((m) => texte === normaliser(m) || texte.includes(normaliser(m)))) return it.x
  }
  return null
}
function parsePage(items: ItemTexte[]): { fournisseur: string; moisReference: string | null; lignes: { codeExterne: string; designation: string; stock: number | null; ventesPeriode: number | null }[] } {
  const fournisseur = items[0]?.str ?? ''
  const positions = {} as Record<ColNom, number>
  const manquantes: string[] = []
  for (const nom of COL_NOMS) {
    const x = trouverXEntete(items, ENTETES[nom])
    if (x === null) manquantes.push(nom)
    else positions[nom] = x
  }
  // En-tête incomplet = page ignorée, plutôt que d'importer des chiffres d'une colonne voisine.
  if (manquantes.length) return { fournisseur, moisReference: null, lignes: [] }
  const centres = COL_NOMS.map((nom) => positions[nom])
  const limites = [centres[0] - (centres[1] - centres[0]) / 2]
  for (let i = 0; i < centres.length - 1; i++) limites.push((centres[i] + centres[i + 1]) / 2)
  limites.push(centres[centres.length - 1] + (centres[centres.length - 1] - centres[centres.length - 2]) / 2)
  const cols = {} as Record<ColNom, [number, number]>
  for (let i = 0; i < COL_NOMS.length; i++) cols[COL_NOMS[i]] = [limites[i], limites[i + 1]]
  function inRange(x: number, [lo, hi]: [number, number]) { return x >= lo && x < hi }
  function colDe(x: number): ColNom | null {
    for (const nom of COL_NOMS) if (inRange(x, cols[nom])) return nom
    return null
  }
  const dateItem = items.find((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.str.trim()) && inRange(it.x, cols.depuis1er))
  const moisReference = dateItem ? dateFrVersMois(dateItem.str.trim()) : null
  const realAnchors = items.filter((it) => inRange(it.x, cols.ref) && REF_REGEX.test(it.str.trim())).sort((a, b) => b.y - a.y)
  if (realAnchors.length === 0) return { fournisseur, moisReference, lignes: [] }
  const rowSpacing = realAnchors.length > 1 ? realAnchors[0].y - realAnchors[1].y : 20
  const anchors = [{ str: '__HEADER__', x: 0, right: 0, y: realAnchors[0].y + rowSpacing }, ...realAnchors]
  function ancrePlusProche(y: number): number {
    let best = 0, bestDist = Infinity
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(anchors[i].y - y)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }
  const buckets: Record<ColNom, ItemTexte[]>[] = anchors.map(() => {
    const b = {} as Record<ColNom, ItemTexte[]>
    for (const n of COL_NOMS) b[n] = []
    return b
  })
  for (const it of items) {
    const c = colDe(it.x)
    if (c) buckets[ancrePlusProche(it.y)][c].push(it)
  }
  function joinCol(bucket: Record<ColNom, ItemTexte[]>, key: ColNom): string {
    return bucket[key].sort((a, b) => b.y - a.y || a.x - b.x).map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
  }
  const lignes = anchors.slice(1).map((a, i) => {
    const bucket = buckets[i + 1]
    return {
      codeExterne: a.str, designation: joinCol(bucket, 'designation'),
      stock: parseNumFr(joinCol(bucket, 'stock')) ?? 0,
      ventesPeriode: parseNumFr(joinCol(bucket, 'depuis1er')) ?? 0
    }
  })
  return { fournisseur, moisReference, lignes }
}
export async function parsePdfUbphar(fichier: File): Promise<ResultatImportGrossiste> {
  const avertissements: string[] = []
  const pages = await extraireTextePdf(fichier)
  if (pages.length === 0) return { moisReference: '', lignes: [], avertissements: ['PDF vide ou illisible'] }
  let moisReference: string | null = null
  const toutesLignes: ResultatImportGrossiste['lignes'] = []
  for (const page of pages) {
    const parsed = parsePage(page.items)
    if (parsed.lignes.length === 0) {
      avertissements.push('Une page UBPHAR a été ignorée : en-têtes incomplets ou mise en page non reconnue. Aucun chiffre estimé n’a été importé pour cette page.')
      continue
    }
    if (parsed.moisReference && !moisReference) moisReference = parsed.moisReference
    for (const l of parsed.lignes) toutesLignes.push({ ...l, moisReference: parsed.moisReference ?? moisReference ?? '' })
  }
  if (!moisReference) avertissements.push('Date de référence (« Ventes depuis le ») introuvable — vérifiez le relevé UBPHAR.')
  if (toutesLignes.length === 0) avertissements.push('Aucune ligne produit détectée — vérifiez que le PDF est un export UBPHAR standard.')
  return { moisReference: moisReference ?? '', lignes: toutesLignes, avertissements }
}