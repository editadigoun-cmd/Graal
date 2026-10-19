// Génère la fiche journalière imprimable (PDF) pour un VM, pré-remplie avec les clients
// programmés du jour. Format A4 paysage avec des lignes hautes pour faciliter l'apposition des cachets.
// Les potentiels commerciaux ne sont jamais affichés sur la fiche.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const ROYAL = rgb(0.082, 0.294, 0.678)
const INK = rgb(0.11, 0.13, 0.16)
const GREY = rgb(0.6, 0.63, 0.68)
const BORDER = rgb(0.85, 0.87, 0.9)
const WHITE = rgb(1, 1, 1)
const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const MARGIN = 32
const ROW_HEIGHT = 68

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function isoWeekMondayOf(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const jour = url.searchParams.get('jour') ?? new Date().toISOString().slice(0, 10)
    const vmIdParam = url.searchParams.get('vm_id')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return jsonError('Non authentifié', 401)
    const vmId = vmIdParam || userData.user.id

    const semaineDebut = isoWeekMondayOf(jour)
    const { data: programme } = await supabase
      .from('programmes_hebdomadaires')
      .select('id, statut, vm_id')
      .eq('vm_id', vmId)
      .eq('semaine_debut', semaineDebut)
      .maybeSingle()

    if (!programme || !['VALIDE', 'VERROUILLE'].includes(programme.statut)) {
      return jsonError("Le programme de cette semaine n'est pas encore validé.", 400)
    }

    const jourSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'][
      (new Date(jour + 'T00:00:00Z').getUTCDay() + 6) % 7
    ]

    const { data: lignes } = await supabase
      .from('programme_lignes')
      .select('id, jour, type_visite, ordre, clients(nom, centre, categorie, potentiel)')
      .eq('programme_id', programme.id)
      .eq('jour', jourSemaine)
      .order('ordre')

    const { data: profile } = await supabase.from('profiles').select('full_name, secteur').eq('id', vmId).single()
    const medical = (lignes ?? []).filter((l: any) => l.type_visite === 'MEDICAL')
    const pharmacie = (lignes ?? []).filter((l: any) => l.type_visite === 'PHARMACIE')

    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const medicalHeaders = [
      'Médecin / prospect', 'Centre', 'Catégorie', 'Cachet prospect',
      'Cachet centre', 'Produits présentés', 'Promesses', 'Prescriptions'
    ]
    const medicalWidths = [142, 86, 62, 92, 88, 106, 88, 145]
    const pharmacyHeaders = [
      'Pharmacie', 'Centre', 'Catégorie', 'Stock disponible',
      'Commande obtenue', 'Veille concurrentielle'
    ]
    const pharmacyWidths = [150, 100, 70, 130, 130, 170]

    drawSection(pdf, font, bold, {
      title: 'VOLET MÉDICAL',
      jour, jourSemaine, vmName: profile?.full_name ?? '', secteur: profile?.secteur ?? '',
      headers: medicalHeaders, widths: medicalWidths,
      rows: medical.map((l: any) => ({
        nom: l.clients?.nom ?? '',
        centre: l.clients?.centre ?? '',
        // Afficher uniquement la catégorie du client, jamais son potentiel commercial.
        categorie: l.clients?.categorie ?? ''
      })),
      minRows: 5
    })

    drawSection(pdf, font, bold, {
      title: 'VOLET PHARMACIE',
      jour, jourSemaine, vmName: profile?.full_name ?? '', secteur: profile?.secteur ?? '',
      headers: pharmacyHeaders, widths: pharmacyWidths,
      rows: pharmacie.map((l: any) => ({
        nom: l.clients?.nom ?? '',
        centre: l.clients?.centre ?? '',
        categorie: l.clients?.categorie ?? ''
      })),
      minRows: 4
    })

    const bytes = await pdf.save()
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fiche-${jour}.pdf"`
      }
    })
  } catch (e) {
    return jsonError(String(e), 500)
  }
})

type SectionOptions = {
  title: string
  jour: string
  jourSemaine: string
  vmName: string
  secteur: string
  headers: string[]
  widths: number[]
  rows: { nom: string; centre: string; categorie: string }[]
  minRows: number
}

function drawSection(pdf: PDFDocument, font: any, bold: any, options: SectionOptions) {
  const { title, jour, jourSemaine, vmName, secteur, headers, widths, rows, minRows } = options
  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const sumWidths = widths.reduce((a, b) => a + b, 0)
  // Les largeurs sont proportionnellement ajustées à la largeur imprimable A4 paysage.
  const scaledWidths = widths.map(w => w * usableWidth / sumWidths)
  const dataRows = Math.max(rows.length, minRows)
  const headerHeight = 28
  const topY = PAGE_HEIGHT - 34
  const titleBlock = 68
  const bottomY = 30
  const rowsPerPage = Math.max(1, Math.floor((topY - titleBlock - headerHeight - bottomY) / ROW_HEIGHT))
  const pageCount = Math.max(1, Math.ceil(dataRows / rowsPerPage))

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawText('GRAAL MEDICAL SOLUTIONS', { x: MARGIN, y: topY, size: 15, font: bold, color: ROYAL })
    page.drawText(`Fiche journalière — ${jourSemaine} ${jour}`, { x: MARGIN, y: topY - 20, size: 10, font, color: INK })
    page.drawText(`VM : ${vmName}     Secteur : ${secteur}`, { x: MARGIN, y: topY - 36, size: 9, font, color: GREY })
    page.drawText(pageCount > 1 ? `${title} — suite ${pageIndex + 1}/${pageCount}` : title, {
      x: MARGIN, y: topY - titleBlock + 8, size: 10, font: bold, color: ROYAL
    })

    let y = topY - titleBlock
    let x = MARGIN
    headers.forEach((header, i) => {
      page.drawRectangle({ x, y: y - headerHeight, width: scaledWidths[i], height: headerHeight, color: ROYAL })
      drawWrappedText(page, header, x + 4, y - 10, scaledWidths[i] - 8, 7, bold, WHITE, 2)
      x += scaledWidths[i]
    })
    y -= headerHeight

    const start = pageIndex * rowsPerPage
    const end = Math.min(dataRows, start + rowsPerPage)
    for (let r = start; r < end; r++) {
      const row = rows[r] ?? { nom: '', centre: '', categorie: '' }
      const cells = [row.nom, row.centre, row.categorie, ...Array(headers.length - 3).fill('')]
      x = MARGIN
      cells.forEach((value, i) => {
        page.drawRectangle({
          x, y: y - ROW_HEIGHT, width: scaledWidths[i], height: ROW_HEIGHT,
          borderColor: BORDER, borderWidth: 0.6
        })
        if (value) drawWrappedText(page, String(value), x + 4, y - 12, scaledWidths[i] - 8, 8, font, INK, 4)
        x += scaledWidths[i]
      })
      y -= ROW_HEIGHT
    }

    page.drawText('GRAAL MEDICAL SOLUTIONS', {
      x: MARGIN, y: 14, size: 7, font, color: GREY
    })
    page.drawText(`Page ${pageIndex + 1}/${pageCount}`, {
      x: PAGE_WIDTH - MARGIN - 45, y: 14, size: 7, font, color: GREY
    })
  }
}

function drawWrappedText(page: any, text: string, x: number, y: number, maxWidth: number, size: number, font: any, color: any, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  const visible = lines.slice(0, maxLines)
  visible.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * (size + 2), size, font, color })
  })
}
