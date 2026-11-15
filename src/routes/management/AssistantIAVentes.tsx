import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconAlert, IconCheckCircle, IconChevronLeft, IconSparkles } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'

interface RefItem { id: string; nom: string }
interface ImportRow { id: string; grossiste_id: string; laboratoire_id: string; fichier_nom: string; fichier_path: string; fichier_sha256: string | null; mois_reference: string | null; statut: string; resume: string | null; avertissements: string[]; created_at: string }
interface ImportLine { id: string; numero_ligne: number; designation_source: string; code_externe: string | null; produit_id: string | null; ventes: number | null; stock: number | null; confiance: number | null; avertissement: string | null }
interface Product { id: string; nom: string }

export default function AssistantIAVentes({ grossistes, laboratoires, semaineDebut, onImported }: {
  grossistes: RefItem[]; laboratoires: RefItem[]; semaineDebut: string; onImported: () => void
}) {
  const db = supabase as any
  const [grossisteId, setGrossisteId] = useState('')
  const [laboratoireId, setLaboratoireId] = useState('')
  const [fichier, setFichier] = useState<File | null>(null)
  const [imports, setImports] = useState<ImportRow[]>([])
  const [selection, setSelection] = useState<ImportRow | null>(null)
  const [lignes, setLignes] = useState<ImportLine[]>([])
  const [produits, setProduits] = useState<Product[]>([])
  const [mois, setMois] = useState('')
  const [semaine, setSemaine] = useState(semaineDebut)
  const [resume, setResume] = useState('')
  const [avertissements, setAvertissements] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    if (!grossisteId && grossistes.length) setGrossisteId(grossistes[0].id)
    if (!laboratoireId && laboratoires.length) setLaboratoireId(laboratoires[0].id)
  }, [grossistes, laboratoires])

  async function chargerImports() {
    const { data, error } = await db.from('imports_ventes_ia').select('*').order('created_at', { ascending: false }).limit(15)
    if (error) { setErreur(error.message); return }
    setImports((data ?? []) as ImportRow[])
  }
  useEffect(() => { chargerImports() }, [])

  async function chargerCatalogue(labId: string) {
    if (!labId) return
    const { data: refs, error } = await db.from('produits_pilotage').select('produit_id').eq('laboratoire_id', labId)
    if (error) { setErreur(error.message); return }
    const ids = (refs ?? []).map((r: any) => r.produit_id)
    if (!ids.length) { setProduits([]); return }
    const { data } = await db.from('produits').select('id,nom').in('id', ids).order('nom')
    setProduits((data ?? []) as Product[])
  }
  useEffect(() => { chargerCatalogue(laboratoireId) }, [laboratoireId])

  async function ouvrirImport(item: ImportRow) {
    setErreur(''); setMessage(''); setSelection(item); setMois(item.mois_reference?.slice(0, 7) ?? '')
    setResume(item.resume ?? ''); setAvertissements(item.avertissements ?? [])
    const [{ data: rows, error: lineError }] = await Promise.all([
      db.from('lignes_import_ventes_ia').select('*').eq('import_id', item.id).order('numero_ligne')
    ])
    if (lineError) setErreur(lineError.message)
    setLignes((rows ?? []) as ImportLine[])
    setGrossisteId(item.grossiste_id); setLaboratoireId(item.laboratoire_id)
  }

  async function analyser() {
    if (!fichier || !grossisteId || !laboratoireId) { setErreur('Choisissez un fichier, un grossiste et un laboratoire.'); return }
    if (fichier.size > 20 * 1024 * 1024) { setErreur('Le fichier dépasse la limite de 20 Mo.'); return }
    const ext = fichier.name.toLowerCase().split('.').pop()
    if (!['csv','pdf','xls','xlsx'].includes(ext ?? '')) { setErreur('Formats acceptés : CSV, PDF, XLS et XLSX.'); return }
    setBusy(true); setErreur(''); setMessage('Calcul de l’empreinte du fichier…')
    try {
      const bytes = await fichier.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Session expirée. Reconnectez-vous.')
      const safeName = fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('imports-ventes-ia').upload(path, fichier, { contentType: fichier.type || 'application/octet-stream', upsert: false })
      if (uploadError) throw uploadError
      const { data: record, error: insertError } = await db.from('imports_ventes_ia').insert({
        grossiste_id: grossisteId, laboratoire_id: laboratoireId, fichier_nom: fichier.name,
        fichier_path: path, fichier_sha256: hash, created_by: userData.user.id, statut: 'en_attente'
      }).select('*').single()
      if (insertError) {
        await supabase.storage.from('imports-ventes-ia').remove([path])
        if (insertError.code === '23505') throw new Error('Ce relevé a déjà été importé pour ce grossiste.')
        throw insertError
      }
      setMessage('Fichier sécurisé. Analyse IA en cours…')
      const { data, error: invokeError } = await supabase.functions.invoke('analyse-ventes-ia', { body: { import_id: record.id } })
      if (invokeError) throw new Error(invokeError.message || 'Échec de l’analyse IA.')
      if (data?.error) throw new Error(data.error)
      setFichier(null)
      await chargerImports()
      const { data: freshImport } = await db.from('imports_ventes_ia').select('*').eq('id', record.id).single()
      await ouvrirImport((freshImport ?? record) as ImportRow)
      setMessage(`${data.lignes} ligne(s) détectée(s). Vérifiez chaque correspondance avant validation.`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur pendant l’import.')
      await chargerImports()
    } finally { setBusy(false) }
  }

  function modifierLigne(id: string, patch: Partial<ImportLine>) {
    setLignes((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line))
  }

  async function enregistrerCorrections() {
    if (!selection) return
    setBusy(true); setErreur('')
    try {
      for (const line of lignes) {
        const { error } = await db.from('lignes_import_ventes_ia').update({
          produit_id: line.produit_id, ventes: line.ventes, stock: line.stock, code_externe: line.code_externe
        }).eq('id', line.id)
        if (error) throw error
      }
      const moisDate = mois ? `${mois}-01` : null
      const { error } = await db.from('imports_ventes_ia').update({ mois_reference: moisDate, resume: resume.trim() }).eq('id', selection.id).eq('statut', 'a_verifier')
      if (error) throw error
      setSelection({ ...selection, mois_reference: moisDate })
      setMessage('Corrections enregistrées.')
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Impossible d’enregistrer les corrections.') }
    finally { setBusy(false) }
  }

  async function valider() {
    if (!selection) return
    if (!mois) { setErreur('Confirmez le mois du relevé avant validation.'); return }
    if (new Date(semaine + 'T00:00:00').toISOString().slice(0, 7) !== mois) { setErreur('La semaine choisie doit appartenir au mois du relevé.'); return }
    if (!lignes.some((l) => l.produit_id && (l.ventes !== null || l.stock !== null))) { setErreur('Associez au moins une ligne à un produit avec une vente ou un stock.'); return }
    setBusy(true); setErreur(''); setMessage('')
    try {
      for (const line of lignes) {
        const { error } = await db.from('lignes_import_ventes_ia').update({
          produit_id: line.produit_id, ventes: line.ventes, stock: line.stock, code_externe: line.code_externe
        }).eq('id', line.id)
        if (error) throw error
      }
      const { error: monthError } = await db.from('imports_ventes_ia').update({ mois_reference: `${mois}-01`, resume: resume.trim() }).eq('id', selection.id)
      if (monthError) throw monthError
      const { data, error } = await db.rpc('valider_import_ventes_ia' as any, { p_import_id: selection.id, p_semaine_debut: semaine } as any)
      if (error) throw error
      setMessage(`Import validé : ${data.ventes} ligne(s) de ventes et ${data.stocks} ligne(s) de stock intégrées au Pilotage.`)
      setSelection({ ...selection, statut: 'valide', mois_reference: `${mois}-01` })
      await chargerImports(); onImported()
    } catch (e) { setErreur(e instanceof Error ? e.message : 'La validation a échoué.') }
    finally { setBusy(false) }
  }

  const nonAssociees = useMemo(() => lignes.filter((l) => !l.produit_id).length, [lignes])
  const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

  return <div className="space-y-4">
    <div className="rounded-2xl border border-royal-100 bg-gradient-to-br from-royal-50 to-white p-4">
      <div className="flex items-center gap-2"><span className="rounded-xl bg-white p-2 text-royal-600 shadow-sm"><IconSparkles className="h-5 w-5" /></span><div><p className="text-sm font-bold text-ink-800">Analyse intelligente des relevés</p><p className="text-xs text-ink-500">Détection des produits, codes, ventes et stocks. Rien n’est intégré sans votre validation.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-600">Grossiste<select value={grossisteId} onChange={(e) => setGrossisteId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"><option value="">Choisir…</option>{grossistes.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}</select></label>
        <label className="text-xs font-semibold text-ink-600">Laboratoire<select value={laboratoireId} onChange={(e) => setLaboratoireId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"><option value="">Choisir…</option>{laboratoires.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>
      </div>
      <div className="mt-3"><label className="text-xs font-semibold text-ink-600">Fichier de ventes / stock</label><input type="file" accept=".csv,.pdf,.xls,.xlsx" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-royal-700" /><p className="mt-1 text-[10px] text-ink-400">CSV, PDF ou Excel · 20 Mo maximum · stockage privé</p></div>
      {fichier && <p className="mt-2 text-xs text-ink-600">{fichier.name} · {(fichier.size / 1024 / 1024).toFixed(2)} Mo</p>}
      <div className="mt-3 flex justify-end"><Button onClick={analyser} disabled={busy || !fichier}>{busy ? 'Analyse en cours…' : 'Analyser le fichier'}</Button></div>
      {message && <p className="mt-3 text-xs text-emerald-700">{message}</p>}
      {erreur && <div className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600"><IconAlert className="h-4 w-4 flex-shrink-0" />{erreur}</div>}
    </div>

    {selection && <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><button onClick={() => { setSelection(null); setLignes([]); setMessage('') }} className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink-500"><IconChevronLeft className="h-3 w-3" /> Historique</button><p className="text-sm font-bold text-ink-800">{selection.fichier_nom}</p><p className="text-[10px] text-ink-400">{fmtDate(selection.created_at)}</p></div><Badge tone={selection.statut === 'valide' ? 'success' : selection.statut === 'erreur' ? 'danger' : 'warning'}>{selection.statut.replace('_',' ')}</Badge></div>
      {resume && <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">{resume}</p>}
      {avertissements.map((a, i) => <p key={i} className="text-[11px] text-amber-700">⚠ {a}</p>)}
      {selection.statut === 'a_verifier' && <>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-ink-600">Mois du relevé<input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-ink-600">Semaine de destination<input type="date" value={semaine} onChange={(e) => setSemaine(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" /></label></div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]"><Badge tone="success">{lignes.length - nonAssociees} associé(s)</Badge>{nonAssociees > 0 && <Badge tone="warning">{nonAssociees} à associer</Badge>}<span className="text-ink-400">Contrôlez les valeurs et corrigez les correspondances.</span></div>
        <div className="max-h-[360px] space-y-2 overflow-y-auto">
          {lignes.map((l) => <div key={l.id} className="grid gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1.3fr_1fr_90px_90px] sm:items-center">
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-ink-700">{l.designation_source}</p><p className="truncate text-[10px] text-ink-400">{l.code_externe ?? 'Sans code'} · confiance {Math.round((l.confiance ?? 0) * 100)}%{l.avertissement ? ` · ${l.avertissement}` : ''}</p></div>
            <select value={l.produit_id ?? ''} onChange={(e) => modifierLigne(l.id, { produit_id: e.target.value || null })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs"><option value="">— Associer au produit —</option>{produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
            <label className="text-[10px] text-ink-400">Ventes<input type="number" min="0" step="any" value={l.ventes ?? ''} onChange={(e) => modifierLigne(l.id, { ventes: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-2 text-xs text-ink-700" /></label>
            <label className="text-[10px] text-ink-400">Stock<input type="number" min="0" step="any" value={l.stock ?? ''} onChange={(e) => modifierLigne(l.id, { stock: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-2 text-xs text-ink-700" /></label>
          </div>)}
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={enregistrerCorrections} disabled={busy}>Enregistrer les corrections</Button><Button onClick={valider} disabled={busy}>{busy ? 'Validation…' : 'Valider et intégrer les données'}</Button></div>
      </>}
      {selection.statut === 'valide' && <div className="flex items-center gap-2 text-xs text-emerald-700"><IconCheckCircle className="h-4 w-4" /> Les données ont été intégrées au Pilotage des ventes.</div>}
      {selection.statut === 'erreur' && <p className="text-xs text-red-600">L’analyse n’a pas abouti. Corrigez la configuration du moteur IA puis relancez un nouvel import.</p>}
    </Card>}

    {!selection && <div><p className="mb-2 text-xs font-bold text-ink-700">Imports récents</p>{imports.length === 0 ? <p className="rounded-xl border border-dashed border-ink-200 p-5 text-center text-xs text-ink-400">Aucun fichier analysé pour le moment.</p> : <div className="space-y-2">{imports.map((item) => <button key={item.id} onClick={() => ouvrirImport(item)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3 text-left hover:border-royal-200"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink-700">{item.fichier_nom}</span><span className="text-[10px] text-ink-400">{grossistes.find((g) => g.id === item.grossiste_id)?.nom ?? 'Grossiste'} · {fmtDate(item.created_at)}</span></span><Badge tone={item.statut === 'valide' ? 'success' : item.statut === 'erreur' ? 'danger' : 'warning'}>{item.statut.replace('_',' ')}</Badge></button>)}</div>}</div>}
  </div>
}
