import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconDownload, IconChevronLeft, IconAlert, IconSearch, IconPlus } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { parseCsvPromo } from '@/lib/importGrossistes/parseCsvPromo'
import { parseCsvUbiPharm } from '@/lib/importGrossistes/parseCsvUbiPharm'
import type { LigneImportGrossiste } from '@/lib/importGrossistes/types'
import type { Database } from '@/types/database'

export type FormatGrossiste = 'csv-promo' | 'csv-ubi' | 'pdf-gapob' | 'pdf-ubphar'
interface CatalogueEntry { produitId: string; nom: string }
interface LigneMappage extends LigneImportGrossiste { produitId: string | null; dejaMappee: boolean }
type Equipe = Database['public']['Tables']['equipes']['Row']

interface ImportReleveGrossisteProps {
  grossisteId: string
  grossisteNom: string
  format: FormatGrossiste
  semaineDebut: string
  laboratoireId: string
  catalogue: CatalogueEntry[]
  onImported: () => void
}

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

function ProduitCombobox({
  ligne,
  catalogue,
  onChange,
  onAddNew
}: {
  ligne: LigneMappage
  catalogue: CatalogueEntry[]
  onChange: (produitId: string | null) => void
  onAddNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = catalogue.find((c) => c.produitId === ligne.produitId)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalogue.filter((c) => !q || c.nom.toLowerCase().includes(q))
  }, [catalogue, query])

  useEffect(() => {
    function positionnerMenu() {
      const anchor = ref.current?.getBoundingClientRect()
      if (!anchor) return
      const gap = 4
      const marge = 8
      const hauteurSouhaitee = 256
      const espaceBas = window.innerHeight - anchor.bottom - gap - marge
      const espaceHaut = anchor.top - gap - marge
      const ouvrirVersLeHaut = espaceBas < 220 && espaceHaut > espaceBas
      const maxHeight = Math.max(120, Math.min(hauteurSouhaitee, ouvrirVersLeHaut ? espaceHaut : espaceBas))
      setMenuPosition({
        top: ouvrirVersLeHaut ? anchor.top - maxHeight - gap : anchor.bottom + gap,
        left: anchor.left,
        width: anchor.width,
        maxHeight,
      })
    }

    if (!open) {
      setMenuPosition(null)
      return
    }

    positionnerMenu()
    const repositionner = () => positionnerMenu()
    window.addEventListener('resize', repositionner)
    window.addEventListener('scroll', repositionner, true)
    return () => {
      window.removeEventListener('resize', repositionner)
      window.removeEventListener('scroll', repositionner, true)
    }
  }, [open, query, filtered.length])

  useEffect(() => {
    function fermer(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [])

  const menu = open && menuPosition ? createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}
      className="z-[100] overflow-y-auto rounded-xl border border-ink-100 bg-white p-1 shadow-xl"
    >
      <button type="button" onClick={() => { onChange(null); setOpen(false); setQuery('') }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-ink-500 hover:bg-ink-50">
        — Ignorer ce produit —
      </button>
      <button type="button" onClick={() => { setOpen(false); onAddNew() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-royal-600 hover:bg-royal-50">
        <IconPlus className="h-3.5 w-3.5" /> Ajouter « {ligne.designation} » comme nouveau produit
      </button>
      {filtered.map((c) => (
        <button key={c.produitId} type="button" onClick={() => { onChange(c.produitId); setOpen(false); setQuery('') }} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs hover:bg-ink-50 ${c.produitId === ligne.produitId ? 'bg-royal-50 font-semibold text-royal-700' : 'text-ink-700'}`}>
          {c.nom}
        </button>
      ))}
      {filtered.length === 0 && <p className="px-3 py-3 text-xs text-ink-400">Aucun produit trouvé.</p>}
    </div>,
    document.body
  ) : null

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
        <input
          value={open ? query : (selected?.nom ?? '')}
          onFocus={() => { setQuery(selected?.nom ?? ''); setOpen(true) }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          placeholder="Rechercher un produit…"
          className="w-full rounded-lg border border-ink-200 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        />
      </div>
      {menu}
    </div>
  )
}

export default function ImportReleveGrossiste({ grossisteId, grossisteNom, format, semaineDebut, laboratoireId, catalogue, onImported }: ImportReleveGrossisteProps) {
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
  const [catalogueLocal, setCatalogueLocal] = useState<CatalogueEntry[]>(catalogue)
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [nouveauIndex, setNouveauIndex] = useState<number | null>(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauEquipe, setNouveauEquipe] = useState('')
  const [nouveauPght, setNouveauPght] = useState('')
  const [nouveauSaving, setNouveauSaving] = useState(false)
  const [nouveauErreur, setNouveauErreur] = useState<string | null>(null)

  useEffect(() => {
    setCatalogueLocal(catalogue)
    supabase.from('equipes').select('*').eq('actif', true).order('nom').then(({ data }) => {
      setEquipes(data ?? [])
      if (data?.length) setNouveauEquipe((cur) => cur || data[0].id)
    })
  }, [catalogue])

  const catalogueParNom = useMemo(() => [...catalogueLocal].sort((a, b) => a.nom.localeCompare(b.nom)), [catalogueLocal])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFichierNom(file.name); setErreur(null); setChargement(true)
    try {
      let parsed: { moisReference: string; lignes: LigneImportGrossiste[]; avertissements: string[] }
      if (format === 'csv-promo') parsed = parseCsvPromo(await lireTexteFichier(file), new Date().toISOString().slice(0, 7) + '-01')
      else if (format === 'csv-ubi') parsed = parseCsvUbiPharm(await lireTexteFichier(file), new Date().toISOString().slice(0, 7) + '-01')
      else if (format === 'pdf-gapob') { const { parsePdfGapob } = await import('@/lib/importGrossistes/parsePdfGapob'); parsed = await parsePdfGapob(file) }
      else { const { parsePdfUbphar } = await import('@/lib/importGrossistes/parsePdfUbphar'); parsed = await parsePdfUbphar(file) }
      if (parsed.lignes.length === 0) { setErreur(parsed.avertissements[0] ?? 'Aucune donnée détectée dans ce fichier.'); setChargement(false); return }
      const { data: mappingsExistants } = await supabase.from('mappings_produits_grossistes').select('code_externe, produit_id').eq('grossiste_id', grossisteId)
      const mapParCode = new Map((mappingsExistants ?? []).map((m) => [m.code_externe, m.produit_id]))
      setLignes(parsed.lignes.map((l) => { const produitId = mapParCode.get(l.codeExterne) ?? null; return { ...l, produitId, dejaMappee: produitId !== null } }))
      setMoisReference(parsed.moisReference || new Date().toISOString().slice(0, 7) + '-01')
      setAvertissements(parsed.avertissements); setEtape('mappage')
    } catch (err) { setErreur(err instanceof Error ? err.message : 'Erreur de lecture du fichier') }
    setChargement(false)
  }

  function definirMappage(index: number, produitId: string | null) {
    setLignes((ls) => ls.map((l, i) => i === index ? { ...l, produitId } : l))
  }

  function ouvrirNouveauProduit(index: number) {
    setNouveauIndex(index); setNouveauNom(lignes[index]?.designation ?? ''); setNouveauPght(''); setNouveauErreur(null)
    if (!nouveauEquipe && equipes[0]) setNouveauEquipe(equipes[0].id)
  }

  async function enregistrerNouveauProduit() {
    if (nouveauIndex === null) return
    const nom = nouveauNom.trim(); const pght = Number(nouveauPght)
    if (!nom) { setNouveauErreur('Le nom du produit est requis.'); return }
    if (!nouveauEquipe) { setNouveauErreur("L'équipe du produit est requise."); return }
    if (!nouveauPght || pght <= 0) { setNouveauErreur('Le PGHT doit être un nombre positif.'); return }
    setNouveauSaving(true); setNouveauErreur(null)
    const { data: existant, error: errRecherche } = await supabase.from('produits').select('id').eq('nom', nom).eq('equipe_id', nouveauEquipe).maybeSingle()
    if (errRecherche) { setNouveauSaving(false); setNouveauErreur(errRecherche.message); return }
    let produitId = existant?.id ?? null
    if (!produitId) {
      const { data, error } = await supabase.from('produits').insert({ nom, equipe_id: nouveauEquipe }).select('id').single()
      if (error || !data) { setNouveauSaving(false); setNouveauErreur(error?.message ?? 'Impossible de créer le produit.'); return }
      produitId = data.id
    }
    const { error: errPilotage } = await supabase.from('produits_pilotage').upsert({ produit_id: produitId, laboratoire_id: laboratoireId, pght }, { onConflict: 'produit_id' })
    if (errPilotage) { setNouveauSaving(false); setNouveauErreur(errPilotage.message); return }
    const nomFinal = nom
    setCatalogueLocal((c) => c.some((x) => x.produitId === produitId) ? c : [...c, { produitId: produitId as string, nom: nomFinal }])
    setLignes((ls) => ls.map((l, i) => i === nouveauIndex ? { ...l, produitId, dejaMappee: false } : l))
    setNouveauIndex(null); setNouveauNom(''); setNouveauPght(''); setNouveauErreur(null); setNouveauSaving(false)
  }

  async function validerMappage() {
    const nouveaux = lignes.filter((l) => l.produitId && !l.dejaMappee).map((l) => ({ grossiste_id: grossisteId, code_externe: l.codeExterne, produit_id: l.produitId as string }))
    if (nouveaux.length > 0) {
      const { error } = await supabase.from('mappings_produits_grossistes').upsert(nouveaux, { onConflict: 'grossiste_id,code_externe' })
      if (error) { setErreur(error.message); return }
    }
    setEtape('verification')
  }

  async function lancerImport() {
    setImporting(true); setResultat(null)
    const lignesAImporter = lignes.filter((l) => l.produitId); const produitIds = Array.from(new Set(lignesAImporter.map((l) => l.produitId as string)))
    const [y, m] = moisReference.split('-').map(Number); const semainesAvant: string[] = []
    let cursor = new Date(Date.UTC(y, m - 1, 1)); const jourSemaine = (cursor.getUTCDay() + 6) % 7; cursor.setUTCDate(cursor.getUTCDate() - jourSemaine)
    const finMois = new Date(Date.UTC(y, m, 0))
    while (cursor <= finMois) { const s = cursor.toISOString().slice(0, 10); if (cursor.getUTCMonth() === m - 1 && s < semaineDebut) semainesAvant.push(s); cursor = new Date(cursor.getTime() + 7 * 86400000) }
    const { data: dejaEnregistre } = await supabase.from('ventes_hebdomadaires').select('produit_id, quantite').eq('grossiste_id', grossisteId).in('produit_id', produitIds).in('semaine_debut', semainesAvant)
    const sommeParProduit = new Map<string, number>(); for (const v of dejaEnregistre ?? []) sommeParProduit.set(v.produit_id, (sommeParProduit.get(v.produit_id) ?? 0) + Number(v.quantite))
    let nbVentes = 0, nbStocks = 0; const erreurs: string[] = []
    for (const l of lignesAImporter) {
      const produitId = l.produitId as string
      if (l.ventesPeriode !== null) { const deja = sommeParProduit.get(produitId) ?? 0; const delta = Math.max(0, l.ventesPeriode - deja); const { error } = await supabase.from('ventes_hebdomadaires').upsert({ produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: delta }, { onConflict: 'produit_id,grossiste_id,semaine_debut' }); if (error) erreurs.push(`${l.designation} (ventes) : ${error.message}`); else nbVentes++ }
      if (l.stock !== null) { const { error } = await supabase.from('stocks_hebdomadaires').upsert({ produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: l.stock }, { onConflict: 'produit_id,grossiste_id,semaine_debut' }); if (error) erreurs.push(`${l.designation} (stock) : ${error.message}`); else nbStocks++ }
    }
    setImporting(false); setResultat(`${nbVentes} ligne(s) de ventes et ${nbStocks} ligne(s) de stock enregistrées pour la semaine du ${semaineDebut}.` + (erreurs.length > 0 ? ` ${erreurs.length} erreur(s) : ${erreurs.slice(0, 3).join(' · ')}` : '')); if (nbVentes > 0 || nbStocks > 0) onImported()
  }

  const mappees = lignes.filter((l) => l.produitId).length; const ignorees = lignes.length - mappees

  return (
    <div className="space-y-5">
      {etape === 'import' && <Card><div className="flex items-start gap-2 mb-4"><IconDownload className="h-4 w-4 text-ink-400 mt-0.5" /><div><p className="text-xs font-semibold text-ink-600">Fichier {format.startsWith('csv') ? 'CSV' : 'PDF'} exporté depuis {grossisteNom}</p><p className="text-[11px] text-ink-400 mt-1">Les produits déjà mappés lors d'un import précédent pour ce grossiste sont reconnus automatiquement. Les nouveaux peuvent être créés directement à l'étape de mappage.</p></div></div><input ref={fileRef} type="file" accept={ACCEPT[format]} onChange={handleFile} disabled={chargement} className="block w-full text-sm text-ink-600 file:mr-4 file:rounded-xl file:border-0 file:bg-royal-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-royal-700 hover:file:bg-royal-100" />{chargement && <p className="mt-3 text-xs text-ink-400">Analyse du fichier en cours…</p>}{erreur && <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600"><IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{erreur}</span></div>}</Card>}

      {etape === 'mappage' && <>
        <button onClick={() => setEtape('import')} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600"><IconChevronLeft className="h-3.5 w-3.5" /> Choisir un autre fichier</button>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1"><p className="text-sm font-bold text-ink-800">Mappage des produits</p><div className="flex items-center gap-2"><label className="text-xs font-semibold text-ink-500">Mois de référence :</label><input type="month" value={moisReference.slice(0, 7)} onChange={(e) => setMoisReference(e.target.value + '-01')} className="rounded-lg border border-ink-200 px-2 py-1 text-xs" /></div></div>
          <p className="text-xs text-ink-400 mb-3">{fichierNom} · {lignes.length} produit(s) détecté(s), dont {lignes.filter((l) => l.dejaMappee).length} déjà reconnus. Recherchez le produit correspondant en saisissant son nom, ou choisissez « Ajouter comme nouveau produit » s'il n'existe pas.</p>
          {avertissements.length > 0 && <div className="mb-3 space-y-1">{avertissements.map((a, i) => <p key={i} className="text-[11px] text-flame-600">⚠ {a}</p>)}</div>}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {lignes.map((l, i) => <div key={i} className="flex flex-col gap-2 rounded-xl border border-ink-100 p-2.5 sm:flex-row sm:items-center"><div className="w-full sm:w-56 flex-shrink-0"><p className="text-xs font-semibold text-ink-700 truncate">{l.designation}</p><p className="text-[10px] text-ink-400">{l.codeExterne} · stock {l.stock ?? '—'} · ventes {l.ventesPeriode ?? '—'}</p></div><ProduitCombobox ligne={l} catalogue={catalogueParNom} onChange={(id) => definirMappage(i, id)} onAddNew={() => ouvrirNouveauProduit(i)} />{l.dejaMappee && <Badge tone="success">Reconnu</Badge>}</div>)}
          </div>
          <div className="mt-4"><Button onClick={validerMappage}>Valider le mappage</Button></div>
        </Card>
        {nouveauIndex !== null && <Card className="border-royal-200 bg-royal-50/30"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink-800">Nouveau produit</p><p className="text-xs text-ink-400">Il sera créé dans la base, ajouté au laboratoire sélectionné et immédiatement associé à cette ligne du grossiste.</p></div><button type="button" onClick={() => setNouveauIndex(null)} className="text-xs font-semibold text-ink-400 hover:text-ink-700">Annuler</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><label className="text-xs font-semibold text-ink-500">Nom du produit</label><input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm" autoFocus /></div><div><label className="text-xs font-semibold text-ink-500">PGHT</label><input value={nouveauPght} onChange={(e) => setNouveauPght(e.target.value)} type="number" step="any" placeholder="Prix unitaire" className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm" /></div></div><div className="mt-3"><label className="text-xs font-semibold text-ink-500">Équipe</label><select value={nouveauEquipe} onChange={(e) => setNouveauEquipe(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"><option value="">— Choisir —</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>{nouveauErreur && <p className="mt-3 text-xs font-semibold text-red-500">{nouveauErreur}</p>}<div className="mt-4 flex justify-end"><Button onClick={enregistrerNouveauProduit} loading={nouveauSaving}>Créer et utiliser ce produit</Button></div></Card>}
      </>}

      {etape === 'verification' && <>
        <button onClick={() => setEtape('mappage')} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600"><IconChevronLeft className="h-3.5 w-3.5" /> Modifier le mappage</button>
        <Card><div className="flex flex-wrap items-center justify-between gap-2 mb-3"><p className="text-sm font-bold text-ink-800">Vérification avant import</p><div className="flex items-center gap-2"><Badge tone="success">{mappees} mappé(s)</Badge>{ignorees > 0 && <Badge tone="neutral">{ignorees} ignoré(s)</Badge>}</div></div><p className="text-xs text-ink-400 mb-3">Relevé {formatMois(moisReference)}, enregistré dans la semaine du <strong>{semaineDebut}</strong>. Les ventes du relevé sont converties en delta hebdomadaire.</p><div className="max-h-80 overflow-y-auto overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-ink-100 text-left text-ink-400"><th className="px-2 py-1.5">Produit</th><th className="px-2 py-1.5">Stock</th><th className="px-2 py-1.5">Ventes ({formatMois(moisReference)})</th></tr></thead><tbody>{lignes.filter((l) => l.produitId).map((l, i) => <tr key={i} className="border-b border-ink-50"><td className="px-2 py-1.5 font-semibold text-ink-700">{catalogueLocal.find((c) => c.produitId === l.produitId)?.nom ?? l.designation}</td><td className="px-2 py-1.5">{l.stock ?? '—'}</td><td className="px-2 py-1.5">{l.ventesPeriode ?? '—'}</td></tr>)}</tbody></table></div><div className="mt-4"><Button onClick={lancerImport} loading={important} disabled={mappees === 0}>Confirmer l'import ({mappees} produit{mappees > 1 ? 's' : ''})</Button></div></Card>
      </>}
      {resultat && <p className="text-xs rounded-xl px-3.5 py-2.5 bg-emerald-50 text-emerald-700">{resultat}</p>}
    </div>
  )
}
