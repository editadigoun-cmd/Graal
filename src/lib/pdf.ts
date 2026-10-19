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
  if (!blob.size) throw new Error("Le PDF généré est vide. Réessayez dans un instant.")

  // Déclenche un vrai téléchargement plutôt qu'un nouvel onglet ouvert après
  // une requête asynchrone (souvent bloqué par Chrome/Android comme popup).
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filename = params.jour
    ? `fiche-${params.jour}.pdf`
    : `reporting-${params.semaine_debut ?? 'hebdomadaire'}.pdf`
  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export function ouvrirFicheJour(jour: string) {
  return openFunctionPdf('generate-fiche-jour', { jour })
}

export function ouvrirReportingHebdo(semaineDebut: string) {
  return openFunctionPdf('generate-reporting-hebdo', { semaine_debut: semaineDebut })
}
