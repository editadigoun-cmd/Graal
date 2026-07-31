import { supabase } from './supabase'

async function openFunctionPdf(fn: string, params: Record<string, string>) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié')

  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Impossible de générer le PDF.")
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank')
}

export function ouvrirFicheJour(jour: string) {
  return openFunctionPdf('generate-fiche-jour', { jour })
}

export function ouvrirReportingHebdo(semaineDebut: string) {
  return openFunctionPdf('generate-reporting-hebdo', { semaine_debut: semaineDebut })
}
