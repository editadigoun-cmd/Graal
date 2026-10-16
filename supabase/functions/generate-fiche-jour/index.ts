// Génère la fiche journalière imprimable (PDF) pour un VM, pré-remplie avec les clients
// programmés du jour, dans l'ordre de passage prévu — conformément à la section 3.8 du
// cahier des charges. Respecte les RLS : le client Supabase de cette fonction est créé avec
// le JWT de l'appelant, donc un VM ne peut générer que sa propre fiche, un superviseur/admin
// celle de son périmètre.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const ROYAL = rgb(0.082, 0.294, 0.678)
const ROYAL_DARK = rgb(0.055, 0.19, 0.43)
const INK = rgb(0.11, 0.13, 0.16)
const GREY = rgb(0.38, 0.42, 0.48)
const LIGHT_GREY = rgb(0.91, 0.93, 0.96)
const PALE_BLUE = rgb(0.96, 0.975, 0.995)
const WHITE = rgb(1, 1, 1)
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const LOGO_URL = 'https://raw.githubusercontent.com/editadigoun-cmd/Graal/main/src/assets/logo-full.png'

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

    // Le logo est récupéré depuis le dépôt public. En cas d'indisponibilité réseau,
    // l'en-tête conserve une présentation textuelle propre.
    let logo: any = null
    try {
      const response = await fetch(LOGO_URL)
      if (response.ok) logo = await pdf.embedPng(new Uint8Array(await response.arrayBuffer()))
    } catch {
      logo = null
    }

    const dateLabel = new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
    })

    // Chaque volet dispose de sa propre page A4 : cela préserve de vraies zones
    // d'écriture et de cachet sans écraser les colonnes ni réduire les caractères.
    const medicalPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawPageHeader(medicalPage, font, bold, logo, dateLabel, jourSemaine, profile?.full_name ?? '', profile?.secteur ?? '', 1)
    drawTable(
      medicalPage, font, bold, 698, 'VOLET MÉDICAL',
      ['Client programmé', 'Centre', 'Catégorie / potentiel', 'Cachet prospect', 'Cachet centre', 'Produits présentés', 'Promesses', 'Prescriptions'],
      [90, 70, 45, 55, 50, 90, 65, 50],
      medical, Math.min(medical.length + 2, 11), 42
    )

    const pharmacyPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawPageHeader(pharmacyPage, font, bold, logo, dateLabel, jourSemaine, profile?.full_name ?? '', profile?.secteur ?? '', 2)
    drawTable(
      pharmacyPage, font, bold, 698, 'VOLET PHARMACIE',
      ['Pharmacie programmée', 'Centre', 'Catégorie / potentiel', 'Stock disponible', 'Commande obtenue', 'Veille concurrentielle'],
      [110, 70, 50, 90, 90, 105],
      pharmacie, Math.min(pharmacie.length + 2, 6), 48
    )

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
  jourSemaine: string, vmName: string, secteur: string, pageNumber: number
) {
  // Filet de couleur et bloc de marque.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 7, width: PAGE_WIDTH, height: 7, color: ROYAL })
  if (logo) {
    const scale = Math.min(108 / logo.width, 48 / logo.height)
    const width = logo.width * scale
    const height = logo.height * scale
    page.drawImage(logo, { x: MARGIN_X, y: 776 + (48 - height) / 2, width, height })
  } else {
    page.drawText('GRAAL', { x: MARGIN_X, y: 790, size: 23, font: bold, color: ROYAL })
    page.drawText('MEDICAL SOLUTIONS', { x: MARGIN_X, y: 778, size: 7, font: bold, color: GREY })
  }

  const titleX = 164
  page.drawText('FICHE JOURNALIÈRE', { x: titleX, y: 805, size: 15, font: bold, color: ROYAL_DARK })
  page.drawText('SUIVI DES VISITES TERRAIN', { x: titleX, y: 789, size: 8, font: bold, color: GREY })
  page.drawText(`${jourSemaine} • ${dateLabel}`, { x: titleX, y: 773, size: 9, font, color: INK })

  page.drawRectangle({ x: MARGIN_X, y: 724, width: CONTENT_WIDTH, height: 35, color: PALE_BLUE })
  page.drawRectangle({ x: MARGIN_X, y: 724, width: 3, height: 35, color: ROYAL })
  page.drawText('VISITEUR MÉDICAL', { x: 50, y: 746, size: 6.5, font: bold, color: GREY })
  page.drawText(vmName || '—', { x: 50, y: 733, size: 9, font: bold, color: INK, maxWidth: 245 })
  page.drawText('SECTEUR', { x: 375, y: 746, size: 6.5, font: bold, color: GREY })
  page.drawText(secteur || '—', { x: 375, y: 733, size: 9, font: bold, color: INK })
  page.drawText(`DOCUMENT TERRAIN  •  ${pageNumber}/2`, { x: 405, y: 805, size: 6.5, font, color: GREY })
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
  page.drawText(`${rows.length} VISITE(S) PRÉVUE(S)`, {
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
    start: { x: x0, y: y - 7 },
    end: { x: x0 + widths.reduce((sum, width) => sum + width, 0), y: y - 7 },
    thickness: 1.2, color: ROYAL
  })
  page.drawText('GRAAL MEDICAL SOLUTIONS  •  Fiche de suivi interne', {
    x: x0, y: 22, size: 7, font, color: GREY
  })
  page.drawText('Cachets et observations à renseigner sur place', {
    x: PAGE_WIDTH - MARGIN_X - 205, y: 22, size: 7, font, color: GREY
  })
}
