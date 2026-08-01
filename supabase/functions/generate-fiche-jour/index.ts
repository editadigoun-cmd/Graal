// Génère la fiche journalière imprimable (PDF) pour un VM, pré-remplie avec les clients
// programmés du jour, dans l'ordre de passage prévu — conformément à la section 3.8 du
// cahier des charges. Respecte les RLS : le client Supabase de cette fonction est créé avec
// le JWT de l'appelant, donc un VM ne peut générer que sa propre fiche, un superviseur/admin
// celle de son périmètre.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const ROYAL = rgb(0.082, 0.294, 0.678)
const INK = rgb(0.11, 0.13, 0.16)
const GREY = rgb(0.6, 0.63, 0.68)

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
      .select('id, jour, type_visite, ordre, clients(nom, categorie, potentiel)')
      .eq('programme_id', programme.id)
      .eq('jour', jourSemaine)
      .order('ordre')

    const { data: profile } = await supabase.from('profiles').select('full_name, secteur').eq('id', vmId).single()

    const medical = (lignes ?? []).filter((l: any) => l.type_visite === 'MEDICAL')
    const pharmacie = (lignes ?? []).filter((l: any) => l.type_visite === 'PHARMACIE')

    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const page = pdf.addPage([595.28, 841.89]) // A4
    let y = 800

    page.drawText('GRAAL MEDICAL SOLUTIONS', { x: 40, y, size: 16, font: bold, color: ROYAL })
    y -= 20
    page.drawText(`Fiche journalière — ${jourSemaine} ${jour}`, { x: 40, y, size: 11, font, color: INK })
    y -= 15
    page.drawText(`VM : ${profile?.full_name ?? ''}    Secteur : ${profile?.secteur ?? ''}`, { x: 40, y, size: 10, font, color: GREY })
    y -= 30

    y = drawTable(page, font, bold, y, 'VOLET MÉDICAL', [
      'Client programmé', 'Catégorie', 'Cachet prospect', 'Cachet centre', 'Produits présentés', 'Promesses', 'Prescriptions'
    ], [140, 60, 65, 60, 100, 80, 70], medical, 20)

    y -= 20

    drawTable(page, font, bold, y, 'VOLET PHARMACIE', [
      'Pharmacie programmée', 'Catégorie', 'Stock disponible', 'Commande obtenue', 'Veille concurrentielle'
    ], [150, 70, 90, 90, 150], pharmacie, 5)

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

function drawTable(page: any, font: any, bold: any, startY: number, title: string, headers: string[], widths: number[], rows: any[], minRows: number) {
  const x0 = 40
  let y = startY
  page.drawText(title, { x: x0, y, size: 11, font: bold, color: ROYAL })
  y -= 16
  const rowHeight = 18
  let x = x0
  headers.forEach((h, i) => {
    page.drawRectangle({ x, y: y - 16, width: widths[i], height: 16, color: ROYAL })
    page.drawText(h, { x: x + 3, y: y - 12, size: 7, font: bold, color: rgb(1, 1, 1) })
    x += widths[i]
  })
  y -= 16

  const total = Math.max(rows.length, minRows)
  for (let r = 0; r < total; r++) {
    x = x0
    const ligne = rows[r]
    const nom = ligne?.clients?.nom ?? ''
    const categorie = ligne?.clients?.potentiel ?? ligne?.clients?.categorie ?? ''
    const cells = headers.length === 7 ? [nom, categorie, '', '', '', '', ''] : [nom, categorie, '', '', '']
    cells.forEach((c, i) => {
      page.drawRectangle({ x, y: y - rowHeight, width: widths[i], height: rowHeight, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 })
      if (c) page.drawText(String(c), { x: x + 3, y: y - rowHeight + 5, size: 7.5, font })
      x += widths[i]
    })
    y -= rowHeight
  }
  return y
}
