import './pdfWorkerSetup'
import { getDocument } from 'pdfjs-dist'

export interface ItemTexte {
  str: string
  x: number
  right: number
  y: number
}

export interface PageTexte {
  items: ItemTexte[]
}

/** Extrait, pour chaque page du PDF, les fragments de texte avec leur position (x, x+largeur, y). */
export async function extraireTextePdf(fichier: File): Promise<PageTexte[]> {
  const data = new Uint8Array(await fichier.arrayBuffer())
  const doc = await getDocument({ data }).promise
  const pages: PageTexte[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items
      .filter((it) => 'transform' in it)
      .map((it) => {
        const t = it as { str: string; transform: number[]; width: number }
        return {
          str: t.str,
          x: t.transform[4],
          right: t.transform[4] + t.width,
          y: Math.round(t.transform[5] * 10) / 10
        }
      })
      .filter((it) => it.str.trim() !== '')
    pages.push({ items })
  }
  return pages
}

/** Regroupe les items d'une page en lignes (tolérance de 1.5pt sur l'axe y), triées haut→bas. */
export function grouperEnLignes(items: ItemTexte[]): { y: number; items: ItemTexte[] }[] {
  const lignes: { y: number; items: ItemTexte[] }[] = []
  for (const it of items) {
    let ligne = lignes.find((l) => Math.abs(l.y - it.y) < 1.5)
    if (!ligne) { ligne = { y: it.y, items: [] }; lignes.push(ligne) }
    ligne.items.push(it)
  }
  lignes.sort((a, b) => b.y - a.y)
  for (const l of lignes) l.items.sort((a, b) => a.x - b.x)
  return lignes
}
