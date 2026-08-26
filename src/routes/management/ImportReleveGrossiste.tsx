import { useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconDownload, IconChevronLeft, IconAlert } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { parseCsvPromo } from '@/lib/importGrossistes/parseCsvPromo'
import { parseCsvUbiPharm } from '@/lib/importGrossistes/parseCsvUbiPharm'
import type { LigneImportGrossiste } from '@/lib/importGrossistes/types'

export type FormatGrossiste = 'csv-promo' | 'csv-ubi' | 'pdf-gapob' | 'pdf-ubphar'

interface CatalogueEntry { produitId: string; nom: string }

interface LigneMappage extends LigneImportGrossiste {
  produitId: string | null // null = ignorée
  dejaMappee: boolean
}

interface ImportReleveGrossisteProps {
  grossisteId: string
  grossisteNom: string
  format: FormatGrossiste
  semaineDebut: string
  catalogue: CatalogueEntry[] // produits pilotés (produits_pilotage), tous laboratoires confondus
  onImported: () => void
}

/** Lit le fichier en essayant l'UTF-8 ; si des caractères de remplacement apparaissent (accents
 *  mal décodés, fréquent sur les exports grossistes), retente en Windows-1252. */
async function lireTexteFichier(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(buffer)
}

const ACCEPT: Record<FormatGrossiste, string> = {
  'csv-promo': '.csv,text/csv', 'csv-ubi': '.csv,text/csv',
  'pdf-gapob': '.pdf,application/pdf', 'pdf-ubphar': '.pdf,application/pdf'
}
const LABEL_MOIS: Record<string, string> = {
  '01': 'janvier', '02': 'février', '03': 'mars', '04': 'avril', '05': 'mai', '06': 'juin',
  '07': 'juillet', '08': 'août', '09': 'septembre', '10': 'octobre', '11': 'novembre', '12': 'décembre'
}
function formatMois(mois: string) {
  const [y, m] = mois.split('-')
  return `${LABEL_MOIS[m] ?? m} ${y}`
}

export default function ImportReleveGrossiste({ grossisteId, grossisteNom, format, semaineDebut, catalogue, onImported }: ImportReleveGrossisteProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [etape, setEtape] = useState<'import' | 'mappage' | 'verification'>('import')
  const [fichierNom, setFichierNom] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [avertissements, setAvertissements] = useState<string[]>([])
  const [moisReference, setMoisReference] = useState('')
  const [lignes, setLignes] = useState<LigneMappage[]>([])
  const [important, setImporting] = useState(false)
  const [resultat, setResultat] = useState<string | null>(null)

  const catalogueParNom = useMemo(() => [...catalogue].sort((a, b) => a.nom.localeCompare(b.nom)), [catalogue])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFichierNom(file.name)
    setErreur(null)
    setChargement(true)
    try {
      let parsed: { moisReference: string; lignes: LigneImportGrossiste[]; avertissements: string[] }
      if (format === 'csv-promo') {
        const texte = await lireTexteFichier(file)
        const moisParDefaut = new Date().toISOString().slice(0, 7) + '-01'
        parsed = parseCsvPromo(texte, moisParDefaut)
      } else if (format === 'csv-ubi') {
        const texte = await lireTexteFichier(file)
        const moisParDefaut = new Date().toISOString().slice(0, 7) + '-01'
        parsed = parseCsvUbiPharm(texte, moisParDefaut)
      } else if (format === 'pdf-gapob') {
        const { parsePdfGapob } = await import('@/lib/importGrossistes/parsePdfGapob')
        parsed = await parsePdfGapob(file)
      } else {
        const { parsePdfUbphar } = await import('@/lib/importGrossistes/parsePdfUbphar')
        parsed = await parsePdfUbphar(file)
      }

      if (parsed.lignes.length === 0) {
        setErreur(parsed.avertissements[0] ?? 'Aucune donnée détectée dans ce fichier.')
        setChargement(false)
        return
      }

      // Mappage automatique via l'historique (mappings_produits_grossistes)
      const { data: mappingsExistants } = await supabase
        .from('mappings_produits_grossistes').select('code_externe, produit_id').eq('grossiste_id', grossisteId)
      const mapParCode = new Map((mappingsExistants ?? []).map((m) => [m.code_externe, m.produit_id]))

      const lignesMappees: LigneMappage[] = parsed.lignes.map((l) => {
        const produitId = mapParCode.get(l.codeExterne) ?? null
        return { ...l, produitId, dejaMappee: produitId !== null }
      })

      setMoisReference(parsed.moisReference || new Date().toISOString().slice(0, 7) + '-01')
      setAvertissements(parsed.avertissements)
      setLignes(lignesMappees)
      setEtape('mappage')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de lecture du fichier')
    }
    setChargement(false)
  }

  function definirMappage(index: number, produitId: string | null) {
    setLignes((ls) => ls.map((l, i) => i === index ? { ...l, produitId } : l))
  }

  async function validerMappage() {
    // Persiste les nouveaux mappages (pas déjà connus) pour accélérer les imports suivants.
    const nouveaux = lignes.filter((l) => l.produitId && !l.dejaMappee)
      .map((l) => ({ grossiste_id: grossisteId, code_externe: l.codeExterne, produit_id: l.produitId as string }))
    if (nouveaux.length > 0) {
      await supabase.from('mappings_produits_grossistes').upsert(nouveaux, { onConflict: 'grossiste_id,code_externe' })
    }
    setEtape('verification')
  }

  async function lancerImport() {
    setImporting(true)
    setResultat(null)
    const lignesAImporter = lignes.filter((l) => l.produitId)
    const produitIds = Array.from(new Set(lignesAImporter.map((l) => l.produitId as string)))

    // Semaines du mois de référence AVANT la semaine sélectionnée : ce qui a déjà été enregistré
    // ce mois-ci sert de base pour convertir le cumul du relevé en delta hebdomadaire.
    const [y, m] = moisReference.split('-').map(Number)
    const semainesAvant: string[] = []
    let cursor = new Date(Date.UTC(y, m - 1, 1))
    // aligne sur le lundi ISO de la semaine contenant le 1er du mois
    const jourSemaine = (cursor.getUTCDay() + 6) % 7
    cursor.setUTCDate(cursor.getUTCDate() - jourSemaine)
    const finMois = new Date(Date.UTC(y, m, 0))
    while (cursor <= finMois) {
      const s = cursor.toISOString().slice(0, 10)
      if (cursor.getUTCMonth() === m - 1 && s < semaineDebut) semainesAvant.push(s)
      cursor = new Date(cursor.getTime() + 7 * 86400000)
    }

    const { data: dejaEnregistre } = await supabase.from('ventes_hebdomadaires')
      .select('produit_id, quantite')
      .eq('grossiste_id', grossisteId).in('produit_id', produitIds).in('semaine_debut', semainesAvant)

    const sommeParProduit = new Map<string, number>()
    for (const v of dejaEnregistre ?? []) sommeParProduit.set(v.produit_id, (sommeParProduit.get(v.produit_id) ?? 0) + Number(v.quantite))

    let nbVentes = 0, nbStocks = 0
    const erreurs: string[] = []
    for (const l of lignesAImporter) {
      const produitId = l.produitId as string
      if (l.ventesPeriode !== null) {
        const deja = sommeParProduit.get(produitId) ?? 0
        const delta = Math.max(0, l.ventesPeriode - deja)
        const { error } = await supabase.from('ventes_hebdomadaires').upsert(
          { produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: delta },
          { onConflict: 'produit_id,grossiste_id,semaine_debut' }
        )
        if (error) erreurs.push(`${l.designation} (ventes) : ${error.message}`); else nbVentes++
      }
      if (l.stock !== null) {
        const { error } = await supabase.from('stocks_hebdomadaires').upsert(
          { produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: l.stock },
          { onConflict: 'produit_id,grossiste_id,semaine_debut' }
        )
        if (error) erreurs.push(`${l.designation} (stock) : ${error.message}`); else nbStocks++
      }
    }

    setImporting(false)
    setResultat(
      `${nbVentes} ligne(s) de ventes et ${nbStocks} ligne(s) de stock enregistrées pour la semaine du ${semaineDebut}.` +
      (erreurs.length > 0 ? ` ${erreurs.length} erreur(s) : ${erreurs.slice(0, 3).join(' · ')}` : '')
    )
    if (nbVentes > 0 || nbStocks > 0) onImported()
  }

  const mappees = lignes.filter((l) => l.produitId).length
  const ignorees = lignes.length - mappees

  return (
    <div className="space-y-5">
      {etape === 'import' && (
        <Card>
          <div className="flex items-start gap-2 mb-4">
            <IconDownload className="h-4 w-4 text-ink-400 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-ink-600">
                Fichier {format.startsWith('csv') ? 'CSV' : 'PDF'} exporté depuis {grossisteNom}
              </p>
              <p className="text-[11px] text-ink-400 mt-1">
                Les produits déjà mappés lors d'un import précédent pour ce grossiste sont reconnus automatiquement.
                Les nouveaux seront à faire correspondre à l'étape suivante.
              </p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept={ACCEPT[format]} onChange={handleFile} disabled={chargement}
            className="block w-full text-sm text-ink-600 file:mr-4 file:rounded-xl file:border-0 file:bg-royal-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-royal-700 hover:file:bg-royal-100" />
          {chargement && <p className="mt-3 text-xs text-ink-400">Analyse du fichier en cours…</p>}
          {erreur && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600">
              <IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{erreur}</span>
            </div>
          )}
        </Card>
      )}

      {etape === 'mappage' && (
        <>
          <button onClick={() => setEtape('import')} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600">
            <IconChevronLeft className="h-3.5 w-3.5" /> Choisir un autre fichier
          </button>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <p className="text-sm font-bold text-ink-800">Mappage des produits</p>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-ink-500">Mois de référence :</label>
                <input type="month" value={moisReference.slice(0, 7)} onChange={(e) => setMoisReference(e.target.value + '-01')}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs" />
              </div>
            </div>
            <p className="text-xs text-ink-400 mb-3">
              {fichierNom} · {lignes.length} produit(s) détecté(s), dont {lignes.filter((l) => l.dejaMappee).length} déjà reconnus.
              Sélectionnez le produit correspondant du catalogue, ou « Ignorer » pour un produit non suivi.
            </p>
            {avertissements.length > 0 && (
              <div className="mb-3 space-y-1">
                {avertissements.map((a, i) => (
                  <p key={i} className="text-[11px] text-flame-600">⚠ {a}</p>
                ))}
              </div>
            )}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {lignes.map((l, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-100 p-2.5">
                  <div className="w-56 flex-shrink-0">
                    <p className="text-xs font-semibold text-ink-700 truncate">{l.designation}</p>
                    <p className="text-[10px] text-ink-400">
                      {l.codeExterne} · stock {l.stock ?? '—'} · ventes {l.ventesPeriode ?? '—'}
                    </p>
                  </div>
                  <select
                    value={l.produitId ?? ''}
                    onChange={(e) => definirMappage(i, e.target.value || null)}
                    className="flex-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                  >
                    <option value="">— Ignorer ce produit —</option>
                    {catalogueParNom.map((c) => <option key={c.produitId} value={c.produitId}>{c.nom}</option>)}
                  </select>
                  {l.dejaMappee && <Badge tone="success">Reconnu</Badge>}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={validerMappage}>Valider le mappage</Button>
            </div>
          </Card>
        </>
      )}

      {etape === 'verification' && (
        <>
          <button onClick={() => setEtape('mappage')} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600">
            <IconChevronLeft className="h-3.5 w-3.5" /> Modifier le mappage
          </button>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-bold text-ink-800">Vérification avant import</p>
              <div className="flex items-center gap-2">
                <Badge tone="success">{mappees} mappé(s)</Badge>
                {ignorees > 0 && <Badge tone="neutral">{ignorees} ignoré(s)</Badge>}
              </div>
            </div>
            <p className="text-xs text-ink-400 mb-3">
              Relevé {formatMois(moisReference)}, enregistré dans la semaine du <strong>{semaineDebut}</strong>.
              Les ventes du relevé sont converties en delta hebdomadaire (relevé moins ce qui a déjà été enregistré ce mois-ci) —
              vérifiez que la semaine sélectionnée sur l'écran principal est la bonne avant de continuer.
            </p>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-ink-400">
                    <th className="px-2 py-1.5">Produit</th>
                    <th className="px-2 py-1.5">Stock</th>
                    <th className="px-2 py-1.5">Ventes ({formatMois(moisReference)})</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.filter((l) => l.produitId).map((l, i) => (
                    <tr key={i} className="border-b border-ink-50">
                      <td className="px-2 py-1.5 font-semibold text-ink-700">{catalogue.find((c) => c.produitId === l.produitId)?.nom ?? l.designation}</td>
                      <td className="px-2 py-1.5">{l.stock ?? '—'}</td>
                      <td className="px-2 py-1.5">{l.ventesPeriode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Button onClick={lancerImport} loading={important} disabled={mappees === 0}>
                Confirmer l'import ({mappees} produit{mappees > 1 ? 's' : ''})
              </Button>
            </div>
          </Card>
        </>
      )}

      {resultat && (
        <p className="text-xs rounded-xl px-3.5 py-2.5 bg-emerald-50 text-emerald-700">{resultat}</p>
      )}
    </div>
  )
}
