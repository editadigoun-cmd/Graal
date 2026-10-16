// Génère le reporting hebdomadaire imprimable (PDF) — section 3.13 du cahier des charges :
// synthèse des visites (calculée automatiquement), analyses, points forts, veille
// concurrentielle, suggestions, appréciations et visa du superviseur.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { LOGO_PNG_BASE64 } from './logo.ts'

const ROYAL = rgb(0.082, 0.294, 0.678)
const EMERALD = rgb(0.149, 0.6, 0.463)
const INK = rgb(0.11, 0.13, 0.16)
const GREY = rgb(0.55, 0.58, 0.64)

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

function wrapText(text: string, maxChars: number) {
  const words = (text ?? '').split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      lines.push(current.trim())
      current = w
    } else {
      current += ' ' + w
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const semaine = url.searchParams.get('semaine_debut') ?? isoWeekMondayOf(new Date().toISOString().slice(0, 10))
    const vmIdParam = url.searchParams.get('vm_id')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return jsonError('Non authentifié', 401)
    const vmId = vmIdParam || userData.user.id

    const [{ data: profile }, { data: reporting }, { data: taux }] = await Promise.all([
      supabase.from('profiles').select('full_name, secteur').eq('id', vmId).single(),
      supabase.from('reporting_hebdomadaire').select('*, visa:profiles!reporting_hebdomadaire_visa_superviseur_id_fkey(full_name)').eq('vm_id', vmId).eq('semaine_debut', semaine).maybeSingle(),
      supabase.from('v_taux_realisation_hebdomadaire').select('*').eq('vm_id', vmId).eq('semaine_debut', semaine)
    ])

    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const logoBytes = Uint8Array.from(atob(LOGO_PNG_BASE64), (c) => c.charCodeAt(0))
    const logo = await pdf.embedPng(logoBytes)
    let page = pdf.addPage([595.28, 841.89])
    let y = 800
    const x0 = 40

    // Bandeau de marque avec logo intégré localement : aucun appel réseau nécessaire.
    page.drawRectangle({ x: 0, y: 735, width: 595.28, height: 106.89, color: rgb(0.96, 0.975, 0.995) })
    page.drawRectangle({ x: 0, y: 735, width: 6, height: 106.89, color: ROYAL })
    page.drawImage(logo, { x: 472, y: 762, width: 78, height: 58 })
    page.drawText('GRAAL MEDICAL SOLUTIONS', { x: x0, y, size: 16, font: bold, color: ROYAL })
    y -= 23
    page.drawText('REPORTING HEBDOMADAIRE', { x: x0, y, size: 10, font: bold, color: EMERALD })
    y -= 17
    page.drawText(`Semaine du ${semaine}`, { x: x0, y, size: 10, font, color: INK })
    y -= 15
    page.drawText(`VM : ${profile?.full_name ?? ''}    Secteur : ${profile?.secteur ?? ''}`, { x: x0, y, size: 9, font, color: GREY })
    y -= 35

    page.drawText('Synthèse des visites (calculée automatiquement)', { x: x0, y, size: 11, font: bold, color: ROYAL })
    y -= 18
    const headers = ['Cible', 'Prévu', 'Réalisé', 'Taux']
    const widths = [220, 80, 80, 80]
    let x = x0
    headers.forEach((h, i) => {
      page.drawRectangle({ x, y: y - 16, width: widths[i], height: 16, color: ROYAL })
      page.drawText(h, { x: x + 4, y: y - 12, size: 8, font: bold, color: rgb(1, 1, 1) })
      x += widths[i]
    })
    y -= 16
    for (const t of taux ?? []) {
      x = x0
      const cells = [String(t.cible ?? '—').replace(/_/g, ' '), String(t.prevues ?? 0), String(t.realisees ?? 0), `${Math.round((t.taux ?? 0) * 100)}%`]
      cells.forEach((c, i) => {
        page.drawRectangle({ x, y: y - 16, width: widths[i], height: 16, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 })
        page.drawText(c, { x: x + 4, y: y - 12, size: 8, font })
        x += widths[i]
      })
      y -= 16
    }
    y -= 20

    const sections: [string, string | null | undefined][] = [
      ['Analyse générale des visites / marketing', reporting?.analyse_generale],
      ['Points forts de la semaine', reporting?.points_forts],
      ['Veille concurrentielle', reporting?.veille_concurrentielle],
      ['Suggestions / apports', reporting?.suggestions],
      ['Appréciation personnelle', reporting?.appreciation_personnelle],
      ['Appréciations et recommandations du superviseur', reporting?.appreciation_superviseur ?? reporting?.recommandations_superviseur]
    ]

    for (const [label, content] of sections) {
      if (y < 105) {
        page = pdf.addPage([595.28, 841.89])
        y = 790
        page.drawRectangle({ x: 0, y: 790, width: 595.28, height: 51.89, color: rgb(0.96, 0.975, 0.995) })
        page.drawRectangle({ x: 0, y: 790, width: 6, height: 51.89, color: ROYAL })
        page.drawImage(logo, { x: 500, y: 799, width: 45, height: 34 })
        page.drawText('GRAAL MEDICAL SOLUTIONS', { x: x0, y: 817, size: 11, font: bold, color: ROYAL })
        page.drawText(`Reporting hebdomadaire · Semaine du ${semaine}`, { x: x0, y: 801, size: 8, font, color: GREY })
        y = 770
      }
      page.drawText(label, { x: x0, y, size: 9.5, font: bold, color: EMERALD })
      y -= 13
      const lines = wrapText(content || '—', 95)
      for (const line of lines.slice(0, 3)) {
        page.drawText(line, { x: x0, y, size: 9, font, color: INK })
        y -= 12
      }
      y -= 8
    }

    if (y > 40) {
      const visaNom = (reporting as any)?.visa?.full_name
      page.drawText(
        visaNom ? `Visé électroniquement par ${visaNom}` : 'En attente de visa du superviseur',
        { x: x0, y, size: 9, font: bold, color: visaNom ? EMERALD : GREY }
      )
    }

    const bytes = await pdf.save()
    return new Response(bytes, {
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="reporting-${semaine}.pdf"` }
    })
  } catch (e) {
    return jsonError(String(e), 500)
  }
})
