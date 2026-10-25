import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconBarChart, IconTrendingUp, IconPill, IconChevronLeft, IconChevronRight, IconDownload } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { isoWeekMonday } from '@/lib/time'
import { useAuth } from '@/features/auth/AuthProvider'
import ImportReleveGrossiste, { type FormatGrossiste } from './ImportReleveGrossiste'
import type { Database } from '@/types/database'

// Format de fichier attendu par grossiste (cf. src/lib/importGrossistes) — clé sur le nom exact
// seedé en base (migration 045).
const FORMAT_PAR_GROSSISTE: Record<string, FormatGrossiste> = {
  PROMO: 'csv-promo', 'UBI PHARM': 'csv-ubi', UBPHAR: 'pdf-ubphar', GAPOB: 'pdf-gapob'
}

type Laboratoire = Database['public']['Tables']['laboratoires']['Row']
type Grossiste = Database['public']['Tables']['grossistes']['Row']
type Equipe = Database['public']['Tables']['equipes']['Row']

interface LigneProduit {
  produitId: string
  nom: string
  actif: boolean
  pght: number
  objectifMensuel: number | null
  ventesSemaine: Record<string, number>
  stockSemaine: Record<string, number>
  cumulMensuel: number
}

function moisDe(semaineDebut: string) {
  return dayjs(semaineDebut).startOf('month').format('YYYY-MM-DD')
}

/** Lundis dont la date tombe dans le mois calendaire de `semaineDebut` (4 ou 5 selon le mois). */
function semainesDuMois(semaineDebut: string): string[] {
  const ref = dayjs(semaineDebut)
  const moisRef = ref.month()
  const finMois = ref.endOf('month')
  const semaines: string[] = []
  let curseur = ref.startOf('month').startOf('isoWeek')
  while (curseur.isBefore(finMois) || curseur.isSame(finMois, 'day')) {
    if (curseur.month() === moisRef) semaines.push(curseur.format('YYYY-MM-DD'))
    curseur = curseur.add(1, 'week')
  }
  return semaines
}

function tauxTone(taux: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (taux === null) return 'neutral'
  if (taux >= 100) return 'success'
  if (taux >= 70) return 'warning'
  return 'danger'
}

export default function PilotageVentes() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([])
  const [grossistes, setGrossistes] = useState<Grossiste[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [labActif, setLabActif] = useState<string>('')
  const [semaineDebut, setSemaineDebut] = useState(() => isoWeekMonday().format('YYYY-MM-DD'))
  const [lignes, setLignes] = useState<LigneProduit[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const [ajoutOpen, setAjoutOpen] = useState(false)
  const [ajoutNom, setAjoutNom] = useState('')
  const [ajoutEquipe, setAjoutEquipe] = useState('')
  const [ajoutPght, setAjoutPght] = useState('')
  const [ajoutObjectif, setAjoutObjectif] = useState('')
  const [ajoutSaving, setAjoutSaving] = useState(false)
  const [ajoutErreur, setAjoutErreur] = useState<string | null>(null)

  const [importGrossiste, setImportGrossiste] = useState<Grossiste | null>(null)
  const [catalogueImport, setCatalogueImport] = useState<{ produitId: string; nom: string }[]>([])

  const mois = moisDe(semaineDebut)
  const semaines = useMemo(() => semainesDuMois(semaineDebut), [semaineDebut])
  const objectifHebdoDiviseur = semaines.length || 1

  useEffect(() => {
    supabase.from('laboratoires').select('*').order('nom').then(({ data }) => {
      setLaboratoires(data ?? [])
      if (data && data.length > 0) setLabActif((cur) => cur || data[0].id)
    })
    supabase.from('grossistes').select('*').order('nom').then(({ data }) => setGrossistes(data ?? []))
    supabase.from('equipes').select('*').order('nom').then(({ data }) => setEquipes(data ?? []))
  }, [])

  async function charger() {
    if (!labActif) return
    setLoading(true)
    setErreur(null)

    const { data: catalogue, error: err1 } = await supabase
      .from('produits_pilotage')
      .select('produit_id, pght, produits(nom, actif)')
      .eq('laboratoire_id', labActif)

    if (err1) { setErreur(err1.message); setLoading(false); return }

    const produitIds = (catalogue ?? []).map((c) => c.produit_id)
    if (produitIds.length === 0) { setLignes([]); setLoading(false); return }

    // Recharger les noms via la table produits directement : selon la relation
    // PostgREST disponible dans l'environnement, le JOIN imbriqué peut revenir null,
    // ce qui affichait un simple tiret à la place du nom du produit.
    const { data: produitsDirects, error: errProduits } = await supabase
      .from('produits').select('id, nom, actif').in('id', produitIds)
    if (errProduits) { setErreur(errProduits.message); setLoading(false); return }
    const produitParId = new Map((produitsDirects ?? []).map((p) => [p.id, p]))

    const [{ data: objectifs }, { data: ventesMois }, { data: stocks }] = await Promise.all([
      supabase.from('objectifs_mensuels_produits').select('produit_id, objectif_quantite').eq('mois', mois).in('produit_id', produitIds),
      supabase.from('ventes_hebdomadaires').select('produit_id, grossiste_id, semaine_debut, quantite').in('produit_id', produitIds).in('semaine_debut', semaines),
      supabase.from('stocks_hebdomadaires').select('produit_id, grossiste_id, quantite').eq('semaine_debut', semaineDebut).in('produit_id', produitIds)
    ])

    const objectifParProduit = new Map((objectifs ?? []).map((o) => [o.produit_id, Number(o.objectif_quantite)]))
    const cumulParProduit = new Map<string, number>()
    const ventesSemaineParProduit = new Map<string, Record<string, number>>()
    for (const v of ventesMois ?? []) {
      cumulParProduit.set(v.produit_id, (cumulParProduit.get(v.produit_id) ?? 0) + Number(v.quantite))
      if (v.semaine_debut === semaineDebut) {
        const m = ventesSemaineParProduit.get(v.produit_id) ?? {}
        m[v.grossiste_id] = Number(v.quantite)
        ventesSemaineParProduit.set(v.produit_id, m)
      }
    }
    const stockParProduit = new Map<string, Record<string, number>>()
    for (const s of stocks ?? []) {
      const m = stockParProduit.get(s.produit_id) ?? {}
      m[s.grossiste_id] = Number(s.quantite)
      stockParProduit.set(s.produit_id, m)
    }

    const result: LigneProduit[] = (catalogue ?? [])
      .map((c) => ({
        produitId: c.produit_id,
        nom: produitParId.get(c.produit_id)?.nom ?? c.produits?.nom ?? `Produit ${c.produit_id.slice(0, 8)}`,
        actif: produitParId.get(c.produit_id)?.actif ?? c.produits?.actif ?? true,
        pght: Number(c.pght),
        objectifMensuel: objectifParProduit.get(c.produit_id) ?? null,
        ventesSemaine: ventesSemaineParProduit.get(c.produit_id) ?? {},
        stockSemaine: stockParProduit.get(c.produit_id) ?? {},
        cumulMensuel: cumulParProduit.get(c.produit_id) ?? 0
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom))

    setLignes(result)
    setLoading(false)
  }

  useEffect(() => { charger() }, [labActif, semaineDebut]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveVente(produitId: string, grossisteId: string, valeur: number) {
    await supabase.from('ventes_hebdomadaires').upsert(
      { produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: valeur },
      { onConflict: 'produit_id,grossiste_id,semaine_debut' }
    )
    charger()
  }

  async function saveStock(produitId: string, grossisteId: string, valeur: number) {
    await supabase.from('stocks_hebdomadaires').upsert(
      { produit_id: produitId, grossiste_id: grossisteId, semaine_debut: semaineDebut, quantite: valeur },
      { onConflict: 'produit_id,grossiste_id,semaine_debut' }
    )
    charger()
  }

  async function saveObjectif(produitId: string, valeur: number) {
    await supabase.from('objectifs_mensuels_produits').upsert(
      { produit_id: produitId, mois, objectif_quantite: valeur },
      { onConflict: 'produit_id,mois' }
    )
    charger()
  }

  async function savePght(produitId: string, valeur: number) {
    await supabase.from('produits_pilotage').update({ pght: valeur }).eq('produit_id', produitId)
    charger()
  }

  function ouvrirAjout() {
    setAjoutNom('')
    setAjoutEquipe(equipes[0]?.id ?? '')
    setAjoutPght('')
    setAjoutObjectif('')
    setAjoutErreur(null)
    setAjoutOpen(true)
  }

  async function enregistrerAjout() {
    const nom = ajoutNom.trim()
    const pght = Number(ajoutPght)
    if (!nom) { setAjoutErreur('Le nom du produit est requis.'); return }
    if (!ajoutEquipe) { setAjoutErreur("L'équipe est requise."); return }
    if (!ajoutPght || pght <= 0) { setAjoutErreur('Le PGHT doit être un nombre positif.'); return }
    setAjoutSaving(true)
    setAjoutErreur(null)

    const { data: produit, error: errProduit } = await supabase
      .from('produits').insert({ nom, equipe_id: ajoutEquipe }).select('id').single()
    if (errProduit || !produit) {
      setAjoutSaving(false)
      setAjoutErreur(errProduit?.message.includes('duplicate') || errProduit?.message.includes('unique')
        ? 'Ce produit existe déjà pour cette équipe.'
        : "Erreur lors de la création du produit.")
      return
    }

    const { error: errPilotage } = await supabase.from('produits_pilotage').insert({
      produit_id: produit.id, laboratoire_id: labActif, pght
    })
    if (errPilotage) { setAjoutSaving(false); setAjoutErreur(errPilotage.message); return }

    if (ajoutObjectif && Number(ajoutObjectif) > 0) {
      await supabase.from('objectifs_mensuels_produits').insert({
        produit_id: produit.id, mois, objectif_quantite: Number(ajoutObjectif)
      })
    }

    setAjoutSaving(false)
    setAjoutOpen(false)
    charger()
  }

  async function ouvrirImport(g: Grossiste) {
    const { data } = await supabase
      .from('produits_pilotage').select('produit_id, produits(nom)')
    setCatalogueImport((data ?? []).map((c) => ({ produitId: c.produit_id, nom: c.produits?.nom ?? '—' })))
    setImportGrossiste(g)
  }

  const totaux = useMemo(() => {
    let caObjectif = 0, caRealise = 0, valeurStock = 0
    for (const l of lignes) {
      caObjectif += (l.objectifMensuel ?? 0) * l.pght
      caRealise += l.cumulMensuel * l.pght
      valeurStock += Object.values(l.stockSemaine).reduce((s, v) => s + v, 0) * l.pght
    }
    const tauxMoyen = caObjectif > 0 ? (caRealise / caObjectif) * 100 : null
    return { caObjectif, caRealise, valeurStock, tauxMoyen }
  }, [lignes])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink-800 font-display">Pilotage hebdomadaire des ventes</h1>
          <p className="text-sm text-ink-400 mt-0.5">Taux de réalisation par produit, stock disponible par grossiste, valeur de stock</p>
        </div>
        {isAdmin && (
          <Button onClick={ouvrirAjout} disabled={!labActif}>
            <IconPlus className="h-4 w-4" /> Ajouter un produit
          </Button>
        )}
      </div>

      {laboratoires.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {laboratoires.map((l) => (
            <button
              key={l.id}
              onClick={() => setLabActif(l.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${labActif === l.id ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
            >
              {l.nom}
            </button>
          ))}
        </div>
      )}

      <Card className="flex items-center justify-between p-3">
        <button onClick={() => setSemaineDebut(dayjs(semaineDebut).subtract(1, 'week').format('YYYY-MM-DD'))} className="rounded-full p-2 text-ink-400 hover:bg-ink-100">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-ink-800">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
          <p className="text-[11px] text-ink-400">{dayjs(mois).format('MMMM YYYY')} · {semaines.length} semaine(s) ce mois-ci</p>
        </div>
        <button onClick={() => setSemaineDebut(dayjs(semaineDebut).add(1, 'week').format('YYYY-MM-DD'))} className="rounded-full p-2 text-ink-400 hover:bg-ink-100">
          <IconChevronRight className="h-4 w-4" />
        </button>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="CA objectif du mois" value={totaux.caObjectif} decimals={0} suffix=" €" tone="royal" icon={<IconPill className="h-4 w-4" />} />
        <StatCard label="CA réalisé (cumul mois)" value={totaux.caRealise} decimals={0} suffix=" €" tone="emerald" icon={<IconTrendingUp className="h-4 w-4" />} />
        <StatCard label="Valeur du stock disponible" value={totaux.valeurStock} decimals={0} suffix=" €" tone="ink" icon={<IconBarChart className="h-4 w-4" />} />
      </div>
      {totaux.tauxMoyen !== null && (
        <p className="text-xs text-ink-500">
          Taux de réalisation mensuel (pondéré CA) : <Badge tone={tauxTone(totaux.tauxMoyen)}>{Math.round(totaux.tauxMoyen)}%</Badge>
        </p>
      )}

      {erreur && <p className="text-xs font-semibold text-red-500">{erreur}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-[#24483d] px-4 py-3 text-white">
          <div>
            <p className="text-sm font-extrabold tracking-wide">RAPPORT HEBDOMADAIRE DES VENTES</p>
            <p className="mt-1 text-[11px] text-white/75">{laboratoires.find((l) => l.id === labActif)?.nom ?? 'Laboratoire'} · Tous les grossistes</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
            <p className="text-[11px] text-white/75">{dayjs(mois).format('MMMM YYYY')} · Cumul mensuel</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-ink-100 bg-ink-50 px-4 py-3 text-[11px] text-ink-500">
          <span className="rounded-full border border-ink-200 bg-white px-3 py-1"><b>GROSSISTES</b> {grossistes.map((g) => g.nom).join(', ') || 'Aucun grossiste'}</span>
          <span className="rounded-full border border-ink-200 bg-white px-3 py-1"><b>PRODUITS</b> Catalogue {laboratoires.find((l) => l.id === labActif)?.nom ?? ''}</span>
          <span className="rounded-full border border-ink-200 bg-white px-3 py-1"><b>DEVISE</b> EUR / PGHT</span>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : lignes.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">Aucun produit pour ce laboratoire. Ajoutez-en un pour commencer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-xs tabular-nums">
              <thead>
                <tr className="bg-[#24483d] text-left font-bold uppercase tracking-wide text-white">
                  <th rowSpan={2} className="sticky left-0 z-20 min-w-[220px] border-r border-white/20 bg-[#24483d] px-3 py-3">Produit</th>
                  <th colSpan={3} className="border-r border-white/20 px-2 py-2 text-center">Contexte</th>
                  <th colSpan={4} className="border-r border-white/20 bg-[#bda83d] px-2 py-2 text-center text-ink-800">Cumul du mois</th>
                  <th colSpan={3} className="bg-[#344c68] px-2 py-2 text-center">Semaine sélectionnée</th>
                </tr>
                <tr className="border-b border-ink-200 bg-ink-100 text-left font-semibold text-ink-600">
                  <th className="px-2 py-2 text-right">Stock total</th>
                  <th className="px-2 py-2 text-right">PGHT (€)</th>
                  <th className="border-r border-ink-200 px-2 py-2 text-right">Valeur stock</th>
                  <th className="bg-[#f5edbd] px-2 py-2 text-right">Qtés</th>
                  <th className="bg-[#f5edbd] px-2 py-2 text-right">CA (€)</th>
                  <th className="bg-[#f5edbd] px-2 py-2 text-right">Obj. mensuel</th>
                  <th className="border-r border-ink-200 bg-[#f5edbd] px-2 py-2 text-right">% réalisé</th>
                  <th className="px-2 py-2 text-right">Qté</th>
                  <th className="px-2 py-2 text-right">CA (€)</th>
                  <th className="px-2 py-2 text-right">Part CA mensuel</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, index) => {
                  const totalSemaine = Object.values(l.ventesSemaine).reduce((s, v) => s + v, 0)
                  const stockTotal = Object.values(l.stockSemaine).reduce((s, v) => s + v, 0)
                  const caMois = l.cumulMensuel * l.pght
                  const caSemaine = totalSemaine * l.pght
                  const tauxMois = l.objectifMensuel && l.objectifMensuel > 0 ? (l.cumulMensuel / l.objectifMensuel) * 100 : null
                  const partCaMensuel = caMois > 0 ? (caSemaine / caMois) * 100 : null
                  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
                  return (
                    <tr key={l.produitId} className={`border-b border-ink-100 ${index % 2 === 0 ? 'bg-white' : 'bg-[#f5f7f6]'} hover:bg-emerald-50/60`}>
                      <td className={`sticky left-0 z-10 border-r border-ink-100 px-3 py-2.5 font-bold text-ink-800 whitespace-nowrap ${index % 2 === 0 ? 'bg-white' : 'bg-[#f5f7f6]'}`}>
                        {l.nom}{!l.actif && <span className="ml-1.5 font-normal text-ink-400">(inactif)</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right text-ink-600">{fmt(stockTotal)}</td>
                      <td className="px-2 py-2.5 text-right">
                        {isAdmin ? <input key={`pght-${l.produitId}`} type="number" step="any" defaultValue={l.pght} onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v !== l.pght) savePght(l.produitId, v) }} className="w-20 rounded border border-ink-200 bg-white px-1.5 py-1 text-right focus:outline-none focus:ring-2 focus:ring-royal-300" /> : fmt(l.pght)}
                      </td>
                      <td className="border-r border-ink-100 px-2 py-2.5 text-right text-ink-600">{fmt(stockTotal * l.pght)}</td>
                      <td className="bg-[#fffdf0] px-2 py-2.5 text-right font-semibold text-ink-700">{fmt(l.cumulMensuel)}</td>
                      <td className="bg-[#fffdf0] px-2 py-2.5 text-right font-semibold text-ink-700">{fmt(caMois)}</td>
                      <td className="bg-[#fffdf0] px-2 py-2.5 text-right">
                        <input key={`obj-${l.produitId}-${mois}`} type="number" step="any" defaultValue={l.objectifMensuel ?? ''} placeholder="Définir" onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v >= 0 && v !== l.objectifMensuel) saveObjectif(l.produitId, v) }} className="w-20 rounded border border-ink-200 bg-white px-1.5 py-1 text-right focus:outline-none focus:ring-2 focus:ring-royal-300" />
                      </td>
                      <td className="border-r border-ink-100 bg-[#fffdf0] px-2 py-2.5 text-right">
                        <span className={`inline-block rounded px-2 py-1 font-bold ${tauxMois === null ? 'bg-ink-100 text-ink-500' : tauxMois >= 100 ? 'bg-emerald-100 text-emerald-800' : tauxMois >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>{tauxMois !== null ? `${Math.round(tauxMois)} %` : '—'}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-ink-700">{fmt(totalSemaine)}</td>
                      <td className="px-2 py-2.5 text-right font-semibold text-ink-700">{fmt(caSemaine)}</td>
                      <td className="px-2 py-2.5 text-right"><span className={partCaMensuel !== null && partCaMensuel < 0 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>{partCaMensuel !== null ? `${Math.round(partCaMensuel)} %` : '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#bda83d] font-extrabold text-ink-900">
                  <td className="sticky left-0 z-10 border-r border-white/40 bg-[#bda83d] px-3 py-3">TOTAL GÉNÉRAL</td>
                  <td className="px-2 py-3 text-right">{lignes.reduce((s, l) => s + Object.values(l.stockSemaine).reduce((a, v) => a + v, 0), 0).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">—</td>
                  <td className="border-r border-white/40 px-2 py-3 text-right">{Math.round(totaux.valeurStock).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">{lignes.reduce((s, l) => s + l.cumulMensuel, 0).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">{Math.round(totaux.caRealise).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">{Math.round(lignes.reduce((s, l) => s + (l.objectifMensuel ?? 0) * l.pght, 0)).toLocaleString('fr-FR')}</td>
                  <td className="border-r border-white/40 px-2 py-3 text-right">{totaux.tauxMoyen !== null ? `${Math.round(totaux.tauxMoyen)} %` : '—'}</td>
                  <td className="px-2 py-3 text-right">{lignes.reduce((s, l) => s + Object.values(l.ventesSemaine).reduce((a, v) => a + v, 0), 0).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">{Math.round(lignes.reduce((s, l) => s + Object.values(l.ventesSemaine).reduce((a, v) => a + v, 0) * l.pght, 0)).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-3 text-right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <details className="border-t border-ink-100">
          <summary className="cursor-pointer bg-ink-50 px-4 py-3 text-xs font-bold text-ink-600 hover:bg-ink-100">Saisie détaillée par grossiste (ventes et stocks)</summary>
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[800px] text-xs">
              <thead><tr className="bg-ink-100 text-left text-ink-500"><th className="px-3 py-2">Produit</th><th className="px-2 py-2">PGHT</th><th className="px-2 py-2">Objectif mensuel</th>{grossistes.map((g) => <th key={`vhead-${g.id}`} className="px-2 py-2">Ventes · {g.nom}</th>)}{grossistes.map((g) => <th key={`shead-${g.id}`} className="px-2 py-2">Stock · {g.nom}</th>)}</tr></thead>
              <tbody>{lignes.map((l, index) => <tr key={l.produitId} className={index % 2 ? 'bg-ink-50' : 'bg-white'}>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{l.nom}</td>
                <td className="px-2 py-2 text-right">{l.pght}</td>
                <td className="px-2 py-2 text-right">{l.objectifMensuel ?? '—'}</td>
                {grossistes.map((g) => <td key={`v-${l.produitId}-${g.id}`} className="px-2 py-2"><input key={`vv-${l.produitId}-${g.id}-${semaineDebut}`} type="number" step="any" defaultValue={l.ventesSemaine[g.id] ?? ''} placeholder="0" onBlur={(e) => { const v = Number(e.target.value || 0); if (!isNaN(v) && v !== (l.ventesSemaine[g.id] ?? 0)) saveVente(l.produitId, g.id, v) }} className="w-20 rounded border border-ink-200 px-1.5 py-1 text-right" /></td>)}
                {grossistes.map((g) => <td key={`s-${l.produitId}-${g.id}`} className="px-2 py-2"><input key={`sv-${l.produitId}-${g.id}-${semaineDebut}`} type="number" step="any" defaultValue={l.stockSemaine[g.id] ?? ''} placeholder="0" onBlur={(e) => { const v = Number(e.target.value || 0); if (!isNaN(v) && v !== (l.stockSemaine[g.id] ?? 0)) saveStock(l.produitId, g.id, v) }} className="w-20 rounded border border-ink-200 px-1.5 py-1 text-right" /></td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </Card>

      <Modal open={ajoutOpen} onClose={() => setAjoutOpen(false)} title="Ajouter un produit au laboratoire">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-500">Nom du produit</label>
            <input
              value={ajoutNom} onChange={(e) => setAjoutNom(e.target.value)}
              placeholder="Ex : Ambrolite GS Syrup"
              className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-500">Équipe</label>
            <select
              value={ajoutEquipe} onChange={(e) => setAjoutEquipe(e.target.value)}
              className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
            >
              <option value="">— Choisir —</option>
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-500">PGHT (prix unitaire)</label>
              <input
                value={ajoutPght} onChange={(e) => setAjoutPght(e.target.value)} type="number" step="any"
                className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-500">Objectif mensuel (facultatif)</label>
              <input
                value={ajoutObjectif} onChange={(e) => setAjoutObjectif(e.target.value)} type="number" step="any"
                className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
              />
            </div>
          </div>
          {ajoutErreur && <p className="text-xs font-semibold text-red-500">{ajoutErreur}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAjoutOpen(false)}>Annuler</Button>
            <Button onClick={enregistrerAjout} disabled={ajoutSaving}>{ajoutSaving ? 'Enregistrement...' : 'Ajouter'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={importGrossiste !== null} onClose={() => setImportGrossiste(null)} title={`Importer un relevé — ${importGrossiste?.nom ?? ''}`} maxWidth="max-w-3xl">
        {importGrossiste && (
          <ImportReleveGrossiste
            grossisteId={importGrossiste.id}
            grossisteNom={importGrossiste.nom}
            format={FORMAT_PAR_GROSSISTE[importGrossiste.nom]}
            semaineDebut={semaineDebut}
            catalogue={catalogueImport}
            onImported={() => { setImportGrossiste(null); charger() }}
          />
        )}
      </Modal>
    </div>
  )
}
