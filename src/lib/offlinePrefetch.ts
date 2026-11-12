import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import { saveOfflineSnapshot } from '@/lib/offlineCache'
import type { Database } from '@/types/database'

type LigneStatut = Database['public']['Views']['v_lignes_avec_statut']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']

/**
 * Précharge les données strictement nécessaires au VM connecté pour travailler
 * hors réseau. Toutes les requêtes restent filtrées par l'identifiant du VM.
 */
export async function prechargerDonneesHorsLigne(vmId: string): Promise<void> {
  if (!vmId || !navigator.onLine) return

  const day = todayBenin().format('YYYY-MM-DD')
  const visitsKey = `visites-du-jour:${day}`
  const [visitsResult, portfolioResult] = await Promise.all([
    supabase
      .from('v_lignes_avec_statut')
      .select('*')
      .eq('vm_id', vmId)
      .eq('date_visite', day)
      .order('jour'),
    supabase
      .from('portefeuille')
      .select('clients(*)')
      .eq('vm_id', vmId)
  ])

  if (!visitsResult.error) {
    const rows = (visitsResult.data ?? []) as LigneStatut[]
    await saveOfflineSnapshot(vmId, visitsKey, rows)

    const lineIds = rows
      .map((row) => row.programme_ligne_id)
      .filter((id): id is string => Boolean(id))

    if (lineIds.length > 0) {
      const { data, error } = await supabase
        .from('programme_lignes')
        .select('*, clients(*)')
        .in('id', lineIds)

      if (!error && data) {
        await Promise.all(data.map((line) =>
          saveOfflineSnapshot(vmId, `programme-ligne:${line.id}`, line)
        ))
      }
    }
  } else {
    console.warn('Préchargement des visites hors ligne impossible :', visitsResult.error.message)
  }

  if (!portfolioResult.error) {
    const clients = (portfolioResult.data ?? [])
      .map((row: { clients: ClientRow | null }) => row.clients)
      .filter((client): client is ClientRow => Boolean(client?.actif))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

    await saveOfflineSnapshot(vmId, 'hors-programme-portefeuille', clients)
  } else {
    console.warn('Préchargement du portefeuille hors ligne impossible :', portfolioResult.error.message)
  }
}
