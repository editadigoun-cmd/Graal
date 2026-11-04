// Lecture stricte du relevé PDF UBPHAR.
// Le relevé change les mois historiques selon la date d'édition : seules les colonnes
// stables (Référence, Désignation, Stock et Ventes depuis le) servent au calcul.
// Les colonnes septembre/août/juillet/... ne sont jamais utilisées pour les ventes importées.
import { extraireTextePdf, type ItemTexte } from './pdfText'
import { dateFrVersMois, parseNumFr, type ResultatImportGrossiste } from './types'

const REF_REGEX = /^[A-Z]{3,6}\d{2,4}$/

function normaliser(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

type LignePage = {
  codeExterne: string
  designation: string
  stock: number | null
  ventesPeriode: number | null
}

function parsePage(items: ItemTexte[]): {
  moisReference: string | null
  lignes: LignePage[]
  enteteReconnu: boolean
} {
  const entete = items.filter((it) => it.y > 0)
  const xReference = entete.find((it) => normaliser(it.str) === 'reference')?.x
  const xDesignation = entete.find((it) => normaliser(it.str) === 'designation')?.x
  const xStock = entete.find((it) => normaliser(it.str) === 'stock')?.x

  // UBPHAR place une date sous « Ventes depuis le » : elle identifie sans ambiguïté
  // la colonne cumulative, même lorsque les noms des mois historiques changent.
  const dateVentes = entete
    .filter((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.str.trim()))
    .filter((it) => xStock !== undefined && it.x > xStock + 20)
    .sort((a, b) => a.y - b.y)[0]

  if (xReference === undefined || xDesignation === undefined || xStock === undefined || !dateVentes) {
    return { moisReference: null, lignes: [], enteteReconnu: false }
  }

  const xVentes = dateVentes.x
  const moisReference = dateFrVersMois(dateVentes.str.trim())
  if (!moisReference) return { moisReference: null, lignes: [], enteteReconnu: false }

  // On ancre chaque ligne sur son code produit, puis on lit les valeurs uniquement
  // dans les deux colonnes dont les positions ont été identifiées dans l'en-tête.
  const ancres = items
    .filter((it) => Math.abs(it.x - xReference) <= 18 && REF_REGEX.test(it.str.trim()))
    .sort((a, b) => b.y - a.y)

  if (ancres.length === 0) return { moisReference, lignes: [], enteteReconnu: true }

  const ecartLigne = ancres.length > 1 ? ancres[0].y - ancres[1].y : 20
  const ancresAvecEntete = [
    { str: '__HEADER__', x: xReference, right: xReference, y: ancres[0].y + ecartLigne },
    ...ancres
  ]

  function indexAncre(y: number): number {
    let meilleur = 0
    let distance = Infinity
    for (let i = 0; i < ancresAvecEntete.length; i++) {
      const d = Math.abs(ancresAvecEntete[i].y - y)
      if (d < distance) {
        distance = d
        meilleur = i
      }
    }
    return meilleur
  }

  const buckets = ancresAvecEntete.map(() => ({
    designation: [] as ItemTexte[],
    stock: [] as ItemTexte[],
    ventes: [] as ItemTexte[]
  }))

  for (const it of items) {
    const bucket = buckets[indexAncre(it.y)]
    if (it.x > xDesignation + 5 && it.x < xStock - 5) {
      bucket.designation.push(it)
    } else if (Math.abs(it.x - xStock) <= 12) {
      bucket.stock.push(it)
    } else if (Math.abs(it.x - xVentes) <= 12) {
      bucket.ventes.push(it)
    }
  }

  function joindre(valeurs: ItemTexte[]): string {
    return valeurs
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const lignes = ancres.map((ancre, index) => {
    const bucket = buckets[index + 1]
    return {
      codeExterne: ancre.str.trim(),
      designation: joindre(bucket.designation),
      stock: parseNumFr(joindre(bucket.stock)) ?? 0,
      ventesPeriode: parseNumFr(joindre(bucket.ventes)) ?? 0
    }
  }).filter((ligne) => ligne.designation.length > 0)

  return { moisReference, lignes, enteteReconnu: true }
}

export async function parsePdfUbphar(fichier: File): Promise<ResultatImportGrossiste> {
  const avertissements: string[] = []
  const pages = await extraireTextePdf(fichier)
  if (pages.length === 0) {
    return { moisReference: '', lignes: [], avertissements: ['PDF vide ou illisible'] }
  }

  let moisReference: string | null = null
  const toutesLignes: ResultatImportGrossiste['lignes'] = []

  for (const page of pages) {
    const parsed = parsePage(page.items)
    // Les pages de garde et pages de continuation vides sont normales dans les relevés.
    if (!parsed.enteteReconnu) continue
    if (parsed.moisReference && !moisReference) moisReference = parsed.moisReference
    for (const ligne of parsed.lignes) {
      toutesLignes.push({ ...ligne, moisReference: parsed.moisReference ?? moisReference ?? '' })
    }
  }

  if (!moisReference) {
    avertissements.push('Date de référence (« Ventes depuis le ») introuvable — vérifiez le relevé UBPHAR.')
  }
  if (toutesLignes.length === 0) {
    avertissements.push('Aucune ligne produit détectée — vérifiez que le PDF est un export UBPHAR standard.')
  }

  return {
    moisReference: moisReference ?? '',
    lignes: toutesLignes,
    avertissements
  }
}