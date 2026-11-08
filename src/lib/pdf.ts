import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'

interface NativePdfPlugin {
  savePdf(options: { filename: string; data: string }): Promise<{ saved: boolean; filename?: string; location?: string }>
}

const NativePdf = registerPlugin<NativePdfPlugin>('NativePdf')

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

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

  const filename = params.jour
    ? `fiche-${params.jour}.pdf`
    : `reporting-${params.semaine_debut ?? 'hebdomadaire'}.pdf`

  // Dans l'APK Capacitor, écrit directement le PDF dans Téléchargements/Graal,
  // sans ouvrir de nouvel onglet ni dépendre du téléchargement de la WebView.
  if (Capacitor.isNativePlatform()) {
    const data = arrayBufferToBase64(await blob.arrayBuffer())
    const result = await NativePdf.savePdf({ filename, data })
    if (!result?.saved) throw new Error("Android n'a pas confirmé l'enregistrement du PDF. Réessayez.")
    return { filename: result.filename ?? filename, location: result.location ?? 'Téléchargements/Graal' }
  }

  // Sur le site web, déclenche un téléchargement du navigateur.
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return { filename, location: 'Téléchargements du navigateur' }
}

export function ouvrirFicheJour(jour: string) {
  return openFunctionPdf('generate-fiche-jour', { jour })
}

export function ouvrirReportingHebdo(semaineDebut: string) {
  return openFunctionPdf('generate-reporting-hebdo', { semaine_debut: semaineDebut })
}
