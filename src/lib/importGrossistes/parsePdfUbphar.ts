// PDF UBPHAR "Statistiques des ventes" — une page (ou section) par fournisseur/laboratoire,
// chacune avec ses propres largeurs de colonnes (non fixes d'une section à l'autre : détection
// dynamique des positions via les libellés d'en-tête, pas de coordonnées codées en dur). Colonnes :
// Référence | Désignation | Stock au <date> | Ventes depuis le <date> | Ventes juillet/juin/mai/
// avril/mars | Commande en Cours. La désignation peut être répartie sur plusieurs lignes (habillage
// de texte) et le code "Référence" ne s'aligne pas forcément avec la première ligne : on rattache
// chaque fragment de texte à l'ancre (ligne "Référence") la plus proche verticalement, y compris
// pour les colonnes numériques (jamais habillées mais parfois décalées verticalement dans la cellule).
import { extraireTextePdf, type ItemTexte } from './pdfText'
import { dateFrVersMois, type ResultatImportGrossiste } from './types'
import { parseNumFr } from './types'

const REF_REGEX = /^[A-Z]{3,6}\d{2,4}$/
const COL_NOMS = ['ref', 'designation', 'stock', 'depuis1er', 'juillet', 'juin', 'mai', 'avril', 'mars', 'cmde'] as const
type ColNom = typeof COL_NOMS[number]

function trouverXEntete(items: ItemTexte[], motifs: string[]): number | null {
  for (const it of items) {
    for (const m of motifs) {
      if (it.str.trim() === m) return it.x
    }
  }
  return null
}

function parsePage(items: ItemTexte[]): { fournisseur: string; moisReference: string | null; lignes: { codeExterne: string; designation: string; stock: number | null; ventesPeriode: number | null }[] } {
  const fournisseur = items[0]?.str ?? ''

  const xRef = trouverXEntete(items, ['Référence']) ?? 30
  const xDesignation = trouverXEntete(items, ['Désignation']) ?? 85
  const xStock = trouverXEntete(items, ['Stock au']) ?? 200
  const xDepuis1er = trouverXEntete(items, ['depuis le']) ?? 262
  const xJuillet = trouverXEntete(items, ['juillet']) ?? 322
  const xJuin = trouverXEntete(items, ['juin']) ?? 362
  const xMai = trouverXEntete(items, ['mai']) ?? 402
  const xAvril = trouverXEntete(items, ['avril']) ?? 441
  const xMars = trouverXEntete(items, ['mars']) ?? 480
  const xCmde = trouverXEntete(items, ['Command', 'Commande']) ?? 520

  // Date de référence des ventes "depuis le 1er" — sous forme "01/08/2026" juste sous le libellé
  const dateItem = items.find((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.str.trim()) && Math.abs(it.x - (xDepuis1er)) < 5)
  const moisReference = dateItem ? dateFrVersMois(dateItem.str.trim()) : null

  const bounds = [xRef, xDesignation, xStock, xDepuis1er, xJuillet, xJuin, xMai, xAvril, xMars, xCmde, 9999]
  const cols: Record<ColNom, [number, number]> = {} as Record<ColNom, [number, number]>
  for (let i = 0; i < COL_NOMS.length; i++) cols[COL_NOMS[i]] = [bounds[i] - 3, bounds[i + 1] - 3]
  function inRange(x: number, [lo, hi]: [number, number]) { return x >= lo && x < hi }
  function colDe(x: number): ColNom | null { for (const n of COL_NOMS) if (inRange(x, cols[n])) return n; return null }

  const realAnchors = items
    .filter((it) => inRange(it.x, cols.ref) && REF_REGEX.test(it.str.trim()))
    .sort((a, b) => b.y - a.y)

  if (realAnchors.length === 0) return { fournisseur, moisReference, lignes: [] }

  // Ancre fictive au-dessus de la première ligne de données, pour absorber proprement les
  // fragments d'en-tête (qui s'étalent sur plusieurs sous-lignes) sans seuil arbitraire.
  const rowSpacing = realAnchors.length > 1 ? realAnchors[0].y - realAnchors[1].y : 20
  const headerAnchor = { str: '__HEADER__', x: 0, right: 0, y: realAnchors[0].y + rowSpacing }
  const anchors = [headerAnchor, ...realAnchors]

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
    if (!c) continue
    const idx = ancrePlusProche(it.y)
    buckets[idx][c].push(it)
  }

  function joinCol(bucket: Record<ColNom, ItemTexte[]>, key: ColNom): string {
    return bucket[key].sort((a, b) => b.y - a.y || a.x - b.x).map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
  }

  const lignes = anchors.slice(1).map((a, i) => {
    const bucket = buckets[i + 1]
    return {
      codeExterne: a.str,
      designation: joinCol(bucket, 'designation'),
      stock: parseNumFr(joinCol(bucket, 'stock')),
      ventesPeriode: parseNumFr(joinCol(bucket, 'depuis1er'))
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
    if (parsed.lignes.length === 0) continue
    if (parsed.moisReference && !moisReference) moisReference = parsed.moisReference
    for (const l of parsed.lignes) {
      toutesLignes.push({ ...l, moisReference: parsed.moisReference ?? moisReference ?? '' })
    }
  }

  if (!moisReference) avertissements.push("Date de référence (« Ventes depuis le ») introuvable — vérifiez qu'il s'agit bien d'un export UBPHAR standard")
  if (toutesLignes.length === 0) avertissements.push('Aucune ligne produit détectée — la mise en page UBPHAR a peut-être changé')

  return { moisReference: moisReference ?? '', lignes: toutesLignes, avertissements }
}
