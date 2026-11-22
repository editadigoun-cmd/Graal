import { normalizeText } from '@/lib/text'
import { parseCsvDelimited } from './parseCsvDelimited'
import { parseCsvPromo } from './parseCsvPromo'
import { parseCsvUbiPharm } from './parseCsvUbiPharm'
import { parsePdfGapob } from './parsePdfGapob'
import { parsePdfUbphar } from './parsePdfUbphar'
import { parseNumFr, type ResultatImportGrossiste } from './types'

function lireTexte(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const utf8 = new TextDecoder('utf-8').decode(buffer)
    return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8
  })
}

function parseCsvGenerique(texte: string): ResultatImportGrossiste {
  const premiereLigne = texte.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (premiereLigne.match(/;/g) ?? []).length >= (premiereLigne.match(/,/g) ?? []).length ? ';' : ','
  const rows = parseCsvDelimited(texte.replace(/^\uFEFF/, ''), delimiter)
  if (rows.length < 2) return { moisReference: '', lignes: [], avertissements: ['Le fichier CSV ne contient aucune ligne exploitable.'] }

  const headers = rows[0].map((h) => normalizeText(h).replace(/[^a-z0-9]/g, ''))
  const find = (names: string[]) => headers.findIndex((h) => names.includes(h))
  const codeIdx = find(['codecip', 'cip', 'ean', 'codeean', 'reference', 'ref', 'codeproduit', 'code'])
  const nameIdx = find(['libelle', 'libelleproduit', 'designation', 'produit', 'nomproduit', 'article', 'description'])
  const stockIdx = find(['stock', 'stocktotal', 'stockdisponible', 'stockactuel', 'qtestock'])
  const salesIdx = find(['ventes', 'ventemoi encours', 'ventemoisencours', 'ventesmois', 'qtevendue', 'quantitevendue', 'venteperiode', 'cumulventes'])
  const monthIdx = find(['mois', 'moisreference', 'periode', 'datereleve'])

  if (nameIdx < 0 || (stockIdx < 0 && salesIdx < 0)) {
    return { moisReference: '', lignes: [], avertissements: ['Colonnes non reconnues. Le fichier doit contenir une désignation et au moins une colonne de ventes ou de stock.'] }
  }

  const lignes = rows.slice(1).map((row) => {
    const designation = (row[nameIdx] ?? '').trim()
    const code = codeIdx >= 0 ? (row[codeIdx] ?? '').trim() : ''
    const monthValue = monthIdx >= 0 ? (row[monthIdx] ?? '').trim() : ''
    const matchDate = monthValue.match(/(\d{4})[-/](\d{1,2})/) ?? monthValue.match(/(\d{1,2})[-/](\d{4})/)
    const month = matchDate ? (matchDate[1].length === 4 ? `${matchDate[1]}-${matchDate[2].padStart(2, '0')}-01` : `${matchDate[2]}-${matchDate[1].padStart(2, '0')}-01`) : ''
    return {
      codeExterne: code || normalizeText(designation),
      designation,
      stock: stockIdx >= 0 ? parseNumFr(row[stockIdx]) : null,
      ventesPeriode: salesIdx >= 0 ? parseNumFr(row[salesIdx]) : null,
      moisReference: month
    }
  }).filter((line) => line.designation.length > 0)

  const months = Array.from(new Set(lignes.map((line) => line.moisReference).filter(Boolean)))
  return {
    moisReference: months.length === 1 ? months[0] : '',
    lignes,
    avertissements: months.length > 1 ? ['Plusieurs mois ont été détectés dans le fichier. Vérifiez le mois de référence.'] : []
  }
}

export async function analyserFichierLocal(file: File, grossisteName: string): Promise<ResultatImportGrossiste> {
  const ext = file.name.toLowerCase().split('.').pop()
  const name = normalizeText(grossisteName)
  if (ext === 'csv') {
    const text = await lireTexte(file)
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
    if (name.includes('promo')) return parseCsvPromo(text, currentMonth)
    if (name.includes('ubi')) return parseCsvUbiPharm(text, currentMonth)
    return parseCsvGenerique(text)
  }
  if (ext === 'pdf') {
    if (name.includes('ubphar')) return parsePdfUbphar(file)
    if (name.includes('gapob')) return parsePdfGapob(file)
    throw new Error('Le format PDF de ce grossiste ne possède pas encore de lecteur dédié. Le moteur local prend actuellement en charge les relevés PDF UBPHAR et GAPOB.')
  }
  throw new Error('Formats disponibles pour le moteur local : CSV et PDF. Les fichiers Excel seront ajoutés dans une prochaine étape.')
}

function similarityTokens(a: string, b: string) {
  const ta = new Set(a.split(' ').filter((t) => t.length > 1))
  const tb = new Set(b.split(' ').filter((t) => t.length > 1))
  const inter = [...ta].filter((t) => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union ? inter / union : 0
}

function similarityBigrams(a: string, b: string) {
  const grams = (s: string) => {
    const padded = ' ' + s + ' '
    const out = new Map<string, number>()
    for (let i = 0; i < padded.length - 1; i++) {
      const g = padded.slice(i, i + 2)
      out.set(g, (out.get(g) ?? 0) + 1)
    }
    return out
  }
  const ga = grams(a), gb = grams(b)
  let intersection = 0
  for (const [g, count] of ga) intersection += Math.min(count, gb.get(g) ?? 0)
  const total = [...ga.values()].reduce((s, n) => s + n, 0) + [...gb.values()].reduce((s, n) => s + n, 0)
  return total ? (2 * intersection) / total : 0
}

function editSimilarity(a: string, b: string) {
  if (!a || !b) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

function extractNumbers(s: string) {
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(',', '.'))
}

export function scoreCorrespondance(source: string, cible: string): number {
  const normalizedSource = normalizeText(source).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const normalizedTarget = normalizeText(cible).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const a = normalizedSource.replace(/\s/g, '')
  const b = normalizedTarget.replace(/\s/g, '')
  if (!a || !b) return 0
  if (a === b) return 1

  const tokens = similarityTokens(normalizedSource, normalizedTarget)
  const bigrams = similarityBigrams(a, b)
  const edits = editSimilarity(a, b)
  const contains = a.includes(b) || b.includes(a)
    ? Math.min(a.length, b.length) / Math.max(a.length, b.length)
    : 0
  let score = Math.max(tokens * 0.48 + bigrams * 0.32 + edits * 0.20, contains * 0.88)

  const numbersA = extractNumbers(normalizedSource)
  const numbersB = extractNumbers(normalizedTarget)
  if (numbersA.length && numbersB.length) {
    const sameNumbers = numbersA.length === numbersB.length && numbersA.every((n, i) => numbersB[i] === n)
    if (!sameNumbers) score *= 0.72
  } else if (numbersA.length !== numbersB.length) {
    score *= 0.82
  }
  return Math.max(0, Math.min(1, score))
}
