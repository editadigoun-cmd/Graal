// Génère la fiche journalière imprimable (PDF) pour un VM, pré-remplie avec les clients
// programmés du jour, dans l'ordre de passage prévu — conformément à la section 3.8 du
// cahier des charges. Respecte les RLS : le client Supabase de cette fonction est créé avec
// le JWT de l'appelant, donc un VM ne peut générer que sa propre fiche, un superviseur/admin
// celle de son périmètre.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { LOGO_PNG_BASE64 } from './logo.ts'

const ROYAL = rgb(0.082, 0.294, 0.678)
const ROYAL_DARK = rgb(0.055, 0.19, 0.43)
const INK = rgb(0.11, 0.13, 0.16)
const GREY = rgb(0.38, 0.42, 0.48)
const LIGHT_GREY = rgb(0.91, 0.93, 0.96)
const PALE_BLUE = rgb(0.96, 0.975, 0.995)
const WHITE = rgb(1, 1, 1)
const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const MARGIN_X = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

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

function beninClock() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

function nextBusinessDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  do { d.setUTCDate(d.getUTCDate() + 1) } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return d.toISOString().slice(0, 10)
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
    const horlogeBenin = beninClock()
    const jour = url.searchParams.get('jour') ?? horlogeBenin.date
    const vmIdParam = url.searchParams.get('vm_id')
    if (jour > horlogeBenin.date) {
      if (horlogeBenin.hour < 20) {
        return jsonError('La fiche du lendemain est disponible à partir de 20 h, heure du Bénin.', 403)
      }
      if (jour !== nextBusinessDay(horlogeBenin.date)) {
        return jsonError('Seule la fiche du prochain jour ouvrable peut être téléchargée par anticipation.', 400)
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return jsonError('Non authentifié', 401)
    }
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

    const { data: lignesProgramme } = await supabase
      .from('programme_lignes')
      .select('id, jour, type_visite, ordre, clients(nom, centre, categorie, potentiel)')
      .eq('programme_id', programme.id)
      .eq('jour', jourSemaine)
      .order('ordre')

    const { data: reports } = await supabase
      .from('visites_reportees')
      .select('programme_ligne_id')
      .eq('vm_id', vmId)
      .eq('jour_report', jour)
    const idsReportes = (reports ?? []).map((r: any) => r.programme_ligne_id)
    let lignesReportees: any[] = []
    if (idsReportes.length) {
      const { data: reportLines } = await supabase
        .from('programme_lignes')
        .select('id, jour, type_visite, ordre, clients(nom, centre, categorie, potentiel)')
        .in('id', idsReportes)
      lignesReportees = (reportLines ?? []).map((l: any) => ({ ...l, ordre: 100000 + (l.ordre ?? 0) }))
    }
    const lignes = [...(lignesProgramme ?? []), ...lignesReportees]

    const { data: profile } = await supabase.from('profiles').select('full_name, secteur').eq('id', vmId).single()

    const medical = (lignes ?? []).filter((l: any) => l.type_visite === 'MEDICAL')
    const pharmacie = (lignes ?? []).filter((l: any) => l.type_visite === 'PHARMACIE')

    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    // Logo embarqué localement : aucune requête externe n'est nécessaire à la génération.
    const logoBytes = Uint8Array.from(atob(LOGO_PNG_BASE64), (char) => char.charCodeAt(0))
    const logo: any = await pdf.embedPng(logoBytes)

    const dateLabel = new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
    })

    // Pagination automatique : chaque volet peut utiliser autant de pages A4
    // que nécessaire. Les lignes sont découpées en blocs sans perdre ni masquer de visite.
    const medicalHeaders = ['Client programmé', 'Centre', 'Catégorie / potentiel', 'Cachet prospect', 'Cachet centre', 'Produits présentés', 'Promesses', 'Prescriptions']
    const medicalWidths = [125, 105, 85, 75, 75, 110, 95, 92]
    const pharmacyHeaders = ['Pharmacie programmée', 'Centre', 'Catégorie / potentiel', 'Stock disponible', 'Commande obtenue', 'Veille concurrentielle']
    const pharmacyWidths = [145, 100, 90, 140, 140, 147]
    const medicalCapacity = 9
    const pharmacyCapacity = 9
    // Trois lignes vierges sont toujours ajoutées à la fin de chaque volet pour les ajouts manuscrits.
    // Elles sont incluses dans la pagination afin de ne jamais déborder en bas de page.
    const blankRows = () => Array.from({ length: 3 }, () => ({ __blank: true }))
    const medicalChunks = chunkRows([...medical, ...blankRows()], medicalCapacity)
    const pharmacyChunks = chunkRows([...pharmacie, ...blankRows()], pharmacyCapacity)
    const totalPages = medicalChunks.length + pharmacyChunks.length
    let pageNumber = 0

    for (const chunk of medicalChunks) {
      pageNumber++
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      drawPageHeader(page, font, bold, logo, dateLabel, jourSemaine, profile?.full_name ?? '', profile?.secteur ?? '', pageNumber, totalPages)
      drawTable(
        page, font, bold, 438, 'VOLET MÉDICAL',
        medicalHeaders, medicalWidths,
        chunk, Math.min(chunk.length + 2, 11), 30
      )
    }

    for (const chunk of pharmacyChunks) {
      pageNumber++
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      drawPageHeader(page, font, bold, logo, dateLabel, jourSemaine, profile?.full_name ?? '', profile?.secteur ?? '', pageNumber, totalPages)
      drawTable(
        page, font, bold, 438, 'VOLET PHARMACIE',
        pharmacyHeaders, pharmacyWidths,
        chunk, Math.min(chunk.length + 2, 6), 30
      )
    }

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

function drawPageHeader(
  page: any, font: any, bold: any, logo: any, dateLabel: string,
  jourSemaine: string, vmName: string, secteur: string, pageNumber: number, totalPages: number
) {
  // Mise en page A4 paysage : en-tête compact et tableau large.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 7, width: PAGE_WIDTH, height: 7, color: ROYAL })
  if (logo) {
    const scale = Math.min(108 / logo.width, 42 / logo.height)
    const width = logo.width * scale
    const height = logo.height * scale
    page.drawImage(logo, { x: MARGIN_X, y: 514 + (42 - height) / 2, width, height })
  } else {
    page.drawText('GRAAL', { x: MARGIN_X, y: 535, size: 23, font: bold, color: ROYAL })
    page.drawText('MEDICAL SOLUTIONS', { x: MARGIN_X, y: 523, size: 7, font: bold, color: GREY })
  }

  const titleX = 164
  page.drawText('FICHE JOURNALIÈRE', { x: titleX, y: 548, size: 15, font: bold, color: ROYAL_DARK })
  page.drawText('SUIVI DES VISITES TERRAIN', { x: titleX, y: 532, size: 8, font: bold, color: GREY })
  page.drawText(`${jourSemaine} • ${dateLabel}`, { x: titleX, y: 516, size: 9, font, color: INK })
  page.drawText(`DOCUMENT TERRAIN  •  ${pageNumber}/${totalPages}`, { x: PAGE_WIDTH - MARGIN_X - 140, y: 548, size: 6.5, font, color: GREY })

  page.drawRectangle({ x: MARGIN_X, y: 463, width: CONTENT_WIDTH, height: 35, color: PALE_BLUE })
  page.drawRectangle({ x: MARGIN_X, y: 463, width: 3, height: 35, color: ROYAL })
  page.drawText('VISITEUR MÉDICAL', { x: 50, y: 485, size: 6.5, font: bold, color: GREY })
  page.drawText(vmName || '—', { x: 50, y: 472, size: 9, font: bold, color: INK, maxWidth: 300 })
  page.drawText('SECTEUR', { x: 430, y: 485, size: 6.5, font: bold, color: GREY })
  page.drawText(secteur || '—', { x: 430, y: 472, size: 9, font: bold, color: INK })
}

function chunkRows<T>(rows: T[], capacity: number): T[][] {
  if (!rows.length) return [[]]
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += capacity) {
    chunks.push(rows.slice(index, index + capacity))
  }
  return chunks
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // Long identifiers/words are split character-by-character instead of crossing a border.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = ''
      for (const char of word) {
        if (chunk && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk)
          chunk = char
        } else chunk += char
      }
      line = chunk
    } else line = word
  }
  if (line) lines.push(line)
  return lines
}

function drawTable(
  page: any, font: any, bold: any, startY: number, title: string,
  headers: string[], widths: number[], rows: any[], minRows: number, rowHeight: number
) {
  const x0 = MARGIN_X
  let y = startY
  const headerHeight = 34
  page.drawText(title, { x: x0, y: y + 8, size: 11, font: bold, color: ROYAL_DARK })
  const visitCount = rows.filter((row: any) => !row?.__blank).length
  page.drawText(`${visitCount} VISITE(S) PRÉVUE(S)`, {
    x: PAGE_WIDTH - MARGIN_X - 130, y: y + 9, size: 7, font: bold, color: GREY
  })
  y -= 5

  let x = x0
  headers.forEach((header, i) => {
    page.drawRectangle({ x, y: y - headerHeight, width: widths[i], height: headerHeight, color: ROYAL })
    const lines = wrapText(header, bold, 7, widths[i] - 8).slice(0, 4)
    const lineHeight = 8
    const textBlockHeight = lines.length * lineHeight
    let textY = y - (headerHeight - textBlockHeight) / 2 - 6
    for (const line of lines) {
      page.drawText(line, { x: x + 4, y: textY, size: 7, font: bold, color: WHITE, maxWidth: widths[i] - 8 })
      textY -= lineHeight
    }
    x += widths[i]
  })
  y -= headerHeight

  const total = Math.max(rows.length, minRows)
  for (let r = 0; r < total; r++) {
    const ligne = rows[r]
    const nom = ligne?.clients?.nom ?? ''
    const centre = ligne?.clients?.centre ?? ''
    const categorie = ligne?.clients?.potentiel ?? ligne?.clients?.categorie ?? ''
    const cells = [nom, centre, categorie, ...Array(headers.length - 3).fill('')]
    x = x0
    for (let i = 0; i < headers.length; i++) {
      page.drawRectangle({
        x, y: y - rowHeight, width: widths[i], height: rowHeight,
        color: r % 2 === 0 ? WHITE : PALE_BLUE,
        borderColor: LIGHT_GREY, borderWidth: 0.7
      })

      const value = String(cells[i] ?? '').trim()
      if (value) {
        const lines = wrapText(value, font, 7.5, widths[i] - 10)
        const lineHeight = 9
        const maxLines = Math.max(1, Math.floor((rowHeight - 10) / lineHeight))
        let textY = y - 7.5
        for (const line of lines.slice(0, maxLines)) {
          page.drawText(line, { x: x + 5, y: textY, size: 7.5, font, color: INK, maxWidth: widths[i] - 10 })
          textY -= lineHeight
        }
      }
      x += widths[i]
    }
    y -= rowHeight
  }

  // La ligne de clôture donne un repère visuel net et laisse une marge pour annotations.
  page.drawLine({
    start: { x: x0, y: y - 3 },
    end: { x: x0 + widths.reduce((sum, width) => sum + width, 0), y: y - 3 },
    thickness: 1.2, color: ROYAL
  })
  page.drawText('GRAAL MEDICAL SOLUTIONS  •  Fiche de suivi interne', {
    x: x0, y: 12, size: 7, font, color: GREY
  })
  page.drawText('Cachets et observations à renseigner sur place', {
    x: PAGE_WIDTH - MARGIN_X - 205, y: 12, size: 7, font, color: GREY
  })
}
