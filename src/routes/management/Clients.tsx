import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconSearch, IconLock, IconCheckCircle, IconCheck, IconX, IconDownload } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import ImportPortefeuilleAssistant from '@/routes/management/ImportPortefeuille'
import type { Database } from '@/types/database'

type Client = Database['public']['Tables']['clients']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Specialite = Database['public']['Enums']['specialite_client']
type Potentiel = Database['public']['Enums']['potentiel_client']

const SPECIALITE_LABEL: Record<Specialite, string> = {
  "GENERALISTE": "Médecin généraliste",
  "GYNECOLOGUE": "Gynécologue",
  "PEDIATRE": "Pédiatre",
  "CARDIOLOGUE": "Cardiologue",
  "RHUMATOLOGUE": "Rhumatologue",
  "ORL": "ORL",
  "AUTRE_SPECIALITE": "Autre spécialité",
  "MATERNITE": "Maternité",
  "DISPENSAIRE": "Dispensaire",
  "PHARMACIE": "Pharmacie",
  "IDE": "Infirmier(ère)",
  "ANESTHESISTE": "Anesthésiste",
  "CHIRURGIEN": "Chirurgien",
  "CHIRURGIEN_PEDIATRIQUE": "Chirurgien pédiatrique",
  "DERMATOLOGUE": "Dermatologue",
  "DIABETOLOGUE": "Diabétologue",
  "ENDOCRINOLOGUE": "Endocrinologue",
  "GASTROENTEROLOGUE": "Gastro-entérologue",
  "SAGE_FEMME": "Sage-femme",
  "NEPHROLOGUE": "Néphrologue",
  "NEUROLOGUE": "Neurologue",
  "NEUROCHIRURGIEN": "Neurochirurgien",
  "NUTRITIONNISTE": "Nutritionniste",
  "ONCOLOGUE": "Oncologue",
  "PNEUMOLOGUE": "Pneumologue",
  "REANIMATEUR": "Réanimateur",
  "TRAUMATOLOGUE": "Traumatologue",
  "URGENTISTE": "Urgentiste",
  "UROLOGUE": "Urologue",
  "INTERNISTE": "Médecin interniste",
  "PSYCHOLOGUE": "Psychologue"
}

const EMPTY_FORM = {
  nom: '', centre: '', specialite: 'GENERALISTE' as Specialite, potentiel: 'MOYEN' as Potentiel,
  categorie: '', secteur: 'A' as 'A' | 'B', jour_heure_habituel: '', contacts: '', observations: '',
  frequence_visite_mensuelle: '2', vm_id: '', superviseur_id: ''
}

export default function ManagementClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [portefeuille, setPortefeuille] = useState<{ client_id: string; vm_id: string }[]>([])
  const [vms, setVms] = useState<Profile[]>([])
  const [superviseurs, setSuperviseurs] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [search, setSearch] = useState('')
  const [secteurFilter, setSecteurFilter] = useState('')
  const [potentielFilter, setPotentielFilter] = useState('')
  const [vmFilter, setVmFilter] = useState('')
  const [advancedFilters, setAdvancedFilters] = useState<{ id: number; field: string; value: string }[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [bulkVmId, setBulkVmId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    const batchSize = 1000
    const [vmResult, supervisorResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name'),
      supabase.from('profiles').select('*').eq('role', 'superviseur').order('full_name')
    ])

    // Lire la table clients par lots pour dépasser la limite PostgREST de 1 000 lignes.
    const allClients: Client[] = []
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('nom')
        .order('id')
        .range(from, from + batchSize - 1)
      if (error) {
        console.error('Erreur de chargement des clients :', error)
        break
      }
      allClients.push(...((data ?? []) as Client[]))
      if (!data || data.length < batchSize) break
    }

    const allAssignments: { client_id: string; vm_id: string }[] = []
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await supabase
        .from('portefeuille')
        .select('client_id, vm_id')
        .order('client_id')
        .range(from, from + batchSize - 1)
      if (error) {
        console.error('Erreur de chargement du portefeuille clients :', error)
        break
      }
      allAssignments.push(...(data ?? []))
      if (!data || data.length < batchSize) break
    }

    setClients(allClients)
    setPortefeuille(allAssignments)
    const { data: sp, error: supervisorAssignmentsError } = await supabase
      .from('portefeuille_superviseurs')
      .select('client_id, superviseur_id')
    if (supervisorAssignmentsError) console.error('Erreur de chargement des affectations superviseurs :', supervisorAssignmentsError)
    setSuperviseurParClient(Object.fromEntries((sp ?? []).map((p) => [p.client_id, p.superviseur_id])))
    setVms(vmResult.data ?? [])
    setSuperviseurs(supervisorResult.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const vmParClient = useMemo(() => Object.fromEntries(portefeuille.map((p) => [p.client_id, p.vm_id])), [portefeuille])
  const [superviseurParClient, setSuperviseurParClient] = useState<Record<string, string>>({})
  const vmNomById = useMemo(() => Object.fromEntries(vms.map((v) => [v.id, v.full_name])), [vms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (secteurFilter && c.secteur !== secteurFilter) return false
      if (potentielFilter && c.potentiel !== potentielFilter) return false
      if (vmFilter === '__sans_vm__' && portefeuille.some((p) => p.client_id === c.id)) return false
      if (vmFilter && vmFilter !== '__sans_vm__' && !portefeuille.some((p) => p.client_id === c.id && p.vm_id === vmFilter)) return false
      if (q && !c.nom.toLowerCase().includes(q) && !(c.centre ?? '').toLowerCase().includes(q)) return false
      return advancedFilters.every((filter) => {
        if (!filter.value.trim()) return true
        const value = filter.value.trim().toLowerCase()
        switch (filter.field) {
          case 'vm_id': return filter.value === '__sans_vm__'
            ? !portefeuille.some((p) => p.client_id === c.id)
            : portefeuille.some((p) => p.client_id === c.id && p.vm_id === filter.value)
          case 'specialite': return c.specialite === filter.value
          case 'potentiel': return c.potentiel === filter.value
          case 'secteur': return c.secteur === filter.value
          case 'actif': return String(c.actif) === filter.value
          case 'nom': return c.nom.toLowerCase().includes(value)
          case 'centre': return (c.centre ?? '').toLowerCase().includes(value)
          case 'categorie': return (c.categorie ?? '').toLowerCase().includes(value)
          case 'contacts': return (c.contacts ?? '').toLowerCase().includes(value)
          case 'observations': return (c.observations ?? '').toLowerCase().includes(value)
          case 'frequence_visite_mensuelle': return String(c.frequence_visite_mensuelle) === filter.value
          default: return true
        }
      })
    })
  }, [clients, search, secteurFilter, potentielFilter, vmFilter, portefeuille, advancedFilters])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClients = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedClients = clients.filter((c) => selection.has(c.id))
  const secteursSelection = new Set(selectedClients.map((c) => c.secteur))
  const secteurCommun = secteursSelection.size === 1 ? [...secteursSelection][0] : null
  const toutSelectionne = pageClients.length > 0 && pageClients.every((c) => selection.has(c.id))

  useEffect(() => { setCurrentPage(1) }, [search, secteurFilter, potentielFilter, vmFilter, advancedFilters])

  function ajouterFiltre() {
    setAdvancedFilters((items) => [...items, { id: Date.now(), field: 'specialite', value: '' }])
  }

  function modifierFiltre(id: number, patch: Partial<{ field: string; value: string }>) {
    setAdvancedFilters((items) => items.map((item) => item.id === id ? { ...item, ...patch, ...(patch.field ? { value: '' } : {}) } : item))
  }

  function exporterClients(format: 'csv' | 'excel' | 'pdf') {
    const headers = ['Client', 'Centre', 'Spécialité', 'Potentiel', 'Secteur', 'Visiteur médical', 'Catégorie', 'Statut', 'Fréquence mensuelle', 'Contacts', 'Observations']
    const rows = filtered.map((c) => [
      c.nom, c.centre ?? '', SPECIALITE_LABEL[c.specialite] ?? c.specialite, c.potentiel, c.secteur,
      vmNomById[vmParClient[c.id]] ?? 'Sans affectation', c.categorie ?? '', c.actif ? 'Actif' : 'Inactif',
      String(c.frequence_visite_mensuelle), c.contacts ?? '', c.observations ?? ''
    ])
    if (format === 'pdf') {
      const popup = window.open('', '_blank')
      if (!popup) return
      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
      popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Export portefeuille clients</title><style>body{font:12px Arial,sans-serif;color:#16324f;padding:24px}h1{font-size:20px}p{color:#647789}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe4ec;padding:7px;text-align:left}th{background:#edf3f8} @media print{body{padding:0}}</style></head><body><h1>Portefeuille clients</h1><p>${rows.length} résultat(s) · Export PROVISIT</p><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`)
      popup.document.close()
      return
    }
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = format === 'excel'
      ? new Blob([`<html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`], { type: 'application/vnd.ms-excel;charset=utf-8' })
      : new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = format === 'excel' ? 'provisit-portefeuille-clients.xls' : 'provisit-portefeuille-clients.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  function toggleSelection(id: string) {
    setSelection((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectionTout() {
    setSelection((s) => {
      if (toutSelectionne) {
        const next = new Set(s)
        pageClients.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(s)
      pageClients.forEach((c) => next.add(c.id))
      return next
    })
  }

  function annulerSelection() {
    setSelection(new Set())
    setBulkVmId('')
    setBulkMsg(null)
  }

  async function affecterSelection() {
    if (!bulkVmId || selectedClients.length === 0) return
    setBulkSaving(true)
    setBulkMsg(null)
    const ids = selectedClients.map((c) => c.id)
    await supabase.from('portefeuille').delete().in('client_id', ids)
    const { error } = await supabase.from('portefeuille').insert(ids.map((client_id) => ({ client_id, vm_id: bulkVmId })))
    setBulkSaving(false)
    if (error) setBulkMsg({ type: 'error', text: error.message })
    else {
      setBulkMsg({ type: 'success', text: `${ids.length} client(s) affecté(s).` })
      setSelection(new Set())
      setBulkVmId('')
      load()
    }
  }

  function ouvrirAjout() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormMsg(null)
    setModalOpen(true)
  }

  function ouvrirEdition(c: Client) {
    setEditingId(c.id)
    setForm({
      nom: c.nom, centre: c.centre ?? '', specialite: c.specialite, potentiel: c.potentiel,
      categorie: c.categorie ?? '', secteur: c.secteur, jour_heure_habituel: c.jour_heure_habituel ?? '',
      contacts: c.contacts ?? '', observations: c.observations ?? '',
      frequence_visite_mensuelle: String(c.frequence_visite_mensuelle), vm_id: vmParClient[c.id] ?? '', superviseur_id: superviseurParClient[c.id] ?? ''
    })
    setFormMsg(null)
    setModalOpen(true)
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormMsg(null)
    const payload = {
      nom: form.nom, centre: form.centre || null, specialite: form.specialite, potentiel: form.potentiel,
      categorie: form.categorie || null, secteur: form.secteur, jour_heure_habituel: form.jour_heure_habituel || null,
      contacts: form.contacts || null, observations: form.observations || null,
      frequence_visite_mensuelle: Number(form.frequence_visite_mensuelle) || 2
    }

    let clientId = editingId
    if (editingId) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingId)
      if (error) { setFormMsg({ type: 'error', text: error.message }); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error || !data) { setFormMsg({ type: 'error', text: error?.message ?? 'Erreur' }); setSaving(false); return }
      clientId = data.id
    }

    const vmActuel = editingId ? vmParClient[editingId] : undefined
    const superviseurActuel = editingId ? superviseurParClient[editingId] : undefined
    if (clientId && form.vm_id && form.vm_id !== vmActuel) {
      await supabase.from('portefeuille').delete().eq('client_id', clientId)
      const { error: pfError } = await supabase.from('portefeuille').insert({ client_id: clientId, vm_id: form.vm_id })
      if (pfError) { setFormMsg({ type: 'error', text: `Client enregistré, mais affectation VM échouée : ${pfError.message}` }); setSaving(false); load(); return }
    } else if (clientId && !form.vm_id && vmActuel) {
      await supabase.from('portefeuille').delete().eq('client_id', clientId)
    }
    if (clientId && form.superviseur_id && form.superviseur_id !== superviseurActuel) {
      await supabase.from('portefeuille_superviseurs').delete().eq('client_id', clientId).eq('superviseur_id', superviseurActuel ?? '')
      const { error: supError } = await supabase.from('portefeuille_superviseurs').upsert(
        { client_id: clientId, superviseur_id: form.superviseur_id },
        { onConflict: 'client_id,superviseur_id' }
      )
      if (supError) { setFormMsg({ type: 'error', text: `Client enregistré, mais affectation superviseur échouée : ${supError.message}` }); setSaving(false); load(); return }
    } else if (clientId && !form.superviseur_id && superviseurActuel) {
      await supabase.from('portefeuille_superviseurs').delete().eq('client_id', clientId).eq('superviseur_id', superviseurActuel)
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function toggleActif(c: Client) {
    const { error } = await supabase.from('clients').update({ actif: !c.actif }).eq('id', c.id)
    if (error) setBulkMsg({ type: 'error', text: error.message })
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const totalActifs = clients.filter((c) => c.actif).length
  const totalGros = clients.filter((c) => c.potentiel === 'GROS' && c.actif).length

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Gestion des données</p>
          <h1 className="provisit-page-title mt-1">Portefeuille clients</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-400">Centralisez les fiches clients, gérez les affectations et suivez la répartition des portefeuilles.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importer</Button>
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={ouvrirAjout}>Ajouter un client</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Clients au total" value={clients.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Clients actifs" value={totalActifs} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Gros potentiel actifs" value={totalGros} tone="flame" icon={<IconUsers className="h-4 w-4" />} />
      </div>

      <Card className="flex flex-col gap-3 border border-ink-100 bg-white/95 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un centre…"
            className="w-full rounded-xl border border-ink-200 bg-ink-50/50 pl-10 pr-3.5 py-3 text-sm outline-none transition focus:border-royal-400 focus:bg-white focus:ring-4 focus:ring-royal-100"
          />
        </div>
        <select value={secteurFilter} onChange={(e) => setSecteurFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
          <option value="">Tous les secteurs</option>
          <option value="A">Secteur A</option>
          <option value="B">Secteur B</option>
        </select>
        <select value={potentielFilter} onChange={(e) => setPotentielFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
          <option value="">Tous les potentiels</option>
          <option value="GROS">Gros</option>
          <option value="MOYEN">Moyen</option>
          <option value="FAIBLE">Faible</option>
        </select>
        <select value={vmFilter} onChange={(e) => setVmFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
          <option value="">Tous les VM</option>
          <option value="__sans_vm__">Clients sans VM</option>
          {vms.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
        </select>
      </Card>

      <Card className="space-y-4 border border-[#163E63]/[.08] bg-white shadow-[0_8px_26px_rgba(22,62,99,.045)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#163E63]">Filtres avancés</p>
            <p className="mt-1 text-xs text-ink-400">Combine plusieurs critères pour analyser précisément les portefeuilles.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={ajouterFiltre}>+ Ajouter un filtre</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdvancedFilters([])}>Réinitialiser</Button>
          </div>
        </div>
        {advancedFilters.map((filter) => (
          <div key={filter.id} className="grid grid-cols-1 gap-2 rounded-xl border border-ink-100 bg-ink-50/50 p-3 sm:grid-cols-[minmax(150px,1fr)_minmax(180px,1.4fr)_auto] sm:items-end">
            <label className="text-xs font-semibold text-ink-500">
              Colonne
              <select value={filter.field} onChange={(e) => modifierFiltre(filter.id, { field: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                <option value="nom">Nom du client</option><option value="centre">Centre</option><option value="specialite">Spécialité</option>
                <option value="potentiel">Potentiel</option><option value="secteur">Secteur</option><option value="vm_id">Visiteur médical (VM)</option>
                <option value="categorie">Catégorie</option><option value="actif">Statut</option><option value="frequence_visite_mensuelle">Fréquence mensuelle</option>
                <option value="contacts">Contacts</option><option value="observations">Observations</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-ink-500">
              Valeur
              {filter.field === 'specialite' ? (
                <select value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                  <option value="">Toutes les spécialités</option>{(Object.keys(SPECIALITE_LABEL) as Specialite[]).map((s) => <option key={s} value={s}>{SPECIALITE_LABEL[s]}</option>)}
                </select>
              ) : filter.field === 'potentiel' ? (
                <select value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                  <option value="">Tous les potentiels</option><option value="GROS">Gros</option><option value="MOYEN">Moyen</option><option value="FAIBLE">Faible</option>
                </select>
              ) : filter.field === 'secteur' ? (
                <select value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                  <option value="">Tous les secteurs</option><option value="A">Secteur A</option><option value="B">Secteur B</option>
                </select>
              ) : filter.field === 'vm_id' ? (
                <select value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                  <option value="">Tous les VM</option><option value="__sans_vm__">Sans affectation</option>{vms.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                </select>
              ) : filter.field === 'actif' ? (
                <select value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} className="mt-1.5 w-full px-3 py-2.5 text-sm">
                  <option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option>
                </select>
              ) : (
                <input value={filter.value} onChange={(e) => modifierFiltre(filter.id, { value: e.target.value })} placeholder="Saisir une valeur…" className="mt-1.5 w-full px-3 py-2.5 text-sm" />
              )}
            </label>
            <button type="button" onClick={() => setAdvancedFilters((items) => items.filter((item) => item.id !== filter.id))} className="rounded-lg px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50">Supprimer</button>
          </div>
        ))}
        <div className="flex flex-col gap-3 border-t border-ink-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-500"><strong className="text-[#163E63]">{filtered.length.toLocaleString('fr-FR')}</strong> client(s) correspondant aux critères</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => exporterClients('excel')}>Exporter Excel</Button>
            <Button size="sm" variant="secondary" onClick={() => exporterClients('csv')}>Exporter CSV</Button>
            <Button size="sm" variant="secondary" onClick={() => exporterClients('pdf')}>Exporter PDF</Button>
          </div>
        </div>
      </Card>

      {selection.size > 0 && (
        <Card className="flex flex-col sm:flex-row sm:items-center gap-3 border border-royal-200 bg-royal-50/50">
          <p className="text-xs font-semibold text-royal-700 flex-1">
            {selection.size} client{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}
            {secteurCommun && ` · secteur ${secteurCommun}`}
          </p>
          {secteurCommun ? (
            <>
              <select value={bulkVmId} onChange={(e) => setBulkVmId(e.target.value)}
                className="rounded-xl border border-ink-200 px-3.5 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="">Affecter à…</option>
                {vms.filter((v) => v.secteur === secteurCommun).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
              <Button size="sm" loading={bulkSaving} disabled={!bulkVmId} onClick={affecterSelection}>Affecter</Button>
            </>
          ) : (
            <p className="text-xs text-flame-600 font-semibold">Secteurs mélangés : affectation groupée impossible</p>
          )}
          <button onClick={annulerSelection} className="rounded-full p-2 text-ink-400 hover:bg-ink-100" title="Annuler la sélection">
            <IconX className="h-4 w-4" />
          </button>
        </Card>
      )}
      {bulkMsg && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${bulkMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {bulkMsg.text}
        </p>
      )}

      {filtered.length > 0 && (
        <button onClick={toggleSelectionTout} className="flex items-center gap-2 text-xs font-semibold text-ink-500 md:hidden">
          <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${toutSelectionne ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
            {toutSelectionne && <IconCheck className="h-3.5 w-3.5 text-white" />}
          </span>
          Tout sélectionner
        </button>
      )}

      {/* Liste mobile : toute la carte est cliquable pour sélectionner (case à cocher trop petite à viser dans un tableau qui défile) */}
      <div className="space-y-2.5 md:hidden">
        {pageClients.map((c) => {
          const selected = selection.has(c.id)
          return (
            <Card
              key={c.id}
              onClick={() => toggleSelection(c.id)}
              className={`cursor-pointer transition ${selected ? 'border-2 border-royal-400 bg-royal-50/50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                  {selected && <IconCheck className="h-3.5 w-3.5 text-white" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800 truncate">{c.nom}</p>
                      {c.centre && <p className="text-[11px] text-ink-400 truncate">{c.centre}</p>}
                    </div>
                    <Badge tone={c.actif ? 'success' : 'neutral'}>{c.actif ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PotentielBadge potentiel={c.potentiel} compact />
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">Secteur {c.secteur}</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">{SPECIALITE_LABEL[c.specialite]}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-500">
                    VM : {vmParClient[c.id] ? vmNomById[vmParClient[c.id]] ?? '—' : 'Sans affectation'}
                  </p>
                  <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => ouvrirEdition(c)} className="rounded-full px-3 py-1.5 text-[11px] font-semibold bg-royal-50 text-royal-700 hover:bg-royal-100 transition">
                      Modifier
                    </button>
                    <button onClick={() => toggleActif(c)}
                      title={c.actif ? 'Désactiver' : 'Réactiver'}
                      className={`rounded-full p-2 transition ${c.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {c.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="text-center py-8 text-xs text-ink-400">Aucun client ne correspond à ces filtres.</Card>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[#163E63]/[.08] bg-white px-4 py-3 shadow-[0_8px_26px_rgba(22,62,99,.035)] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">Affichage <strong>{filtered.length ? ((currentPage - 1) * pageSize) + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)}</strong> sur <strong>{filtered.length.toLocaleString('fr-FR')}</strong> résultat(s) · {pageSize} par page</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)} className="rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-semibold text-ink-600 disabled:opacity-40">«</button>
          <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 disabled:opacity-40">Précédent</button>
          <span className="min-w-20 text-center text-xs font-bold text-[#163E63]">Page {currentPage} / {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 disabled:opacity-40">Suivant</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(pageCount)} className="rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-semibold text-ink-600 disabled:opacity-40">»</button>
        </div>
      </div>

      {/* Tableau desktop */}
      <Card className="hidden overflow-hidden border border-ink-100 bg-white p-0 shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleSelectionTout} className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border ${toutSelectionne ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                    {toutSelectionne && <IconCheck className="h-3 w-3 text-white" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Spécialité</th>
                <th className="px-4 py-3 text-left font-semibold">Potentiel</th>
                <th className="px-4 py-3 text-left font-semibold">Secteur</th>
                <th className="px-4 py-3 text-left font-semibold">VM</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {pageClients.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => toggleSelection(c.id)}
                  className={`cursor-pointer transition hover:bg-ink-50/60 ${selection.has(c.id) ? 'bg-royal-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border ${selection.has(c.id) ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                      {selection.has(c.id) && <IconCheck className="h-3 w-3 text-white" />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-ink-800">{c.nom}</p>
                    {c.centre && <p className="text-[10px] text-ink-400">{c.centre}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">{SPECIALITE_LABEL[c.specialite]}</td>
                  <td className="px-4 py-3"><PotentielBadge potentiel={c.potentiel} compact /></td>
                  <td className="px-4 py-3 text-xs text-ink-600">Secteur {c.secteur}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">{vmParClient[c.id] ? vmNomById[vmParClient[c.id]] ?? '—' : '—'}</td>
                  <td className="px-4 py-3"><Badge tone={c.actif ? 'success' : 'neutral'}>{c.actif ? 'Actif' : 'Inactif'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => ouvrirEdition(c)} className="rounded-full px-3 py-1.5 text-[11px] font-semibold bg-royal-50 text-royal-700 hover:bg-royal-100 transition">
                        Modifier
                      </button>
                      <button onClick={() => toggleActif(c)}
                        title={c.actif ? 'Désactiver' : 'Réactiver'}
                        className={`rounded-full p-2 transition ${c.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                        {c.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-ink-400">Aucun client ne correspond à ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Modifier le client' : 'Ajouter un client'} maxWidth="max-w-2xl">
        <form onSubmit={enregistrer} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Nom & prénoms / raison sociale</label>
              <input required value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Centre</label>
              <input value={form.centre} onChange={(e) => setForm((f) => ({ ...f, centre: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Catégorie</label>
              <input value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Spécialité</label>
              <select value={form.specialite} onChange={(e) => setForm((f) => ({ ...f, specialite: e.target.value as Specialite }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {(Object.keys(SPECIALITE_LABEL) as Specialite[]).map((s) => <option key={s} value={s}>{SPECIALITE_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Potentiel</label>
              <select value={form.potentiel} onChange={(e) => setForm((f) => ({ ...f, potentiel: e.target.value as Potentiel }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="GROS">Gros</option>
                <option value="MOYEN">Moyen</option>
                <option value="FAIBLE">Faible</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Secteur</label>
              <select value={form.secteur} onChange={(e) => {
                const secteur = e.target.value as 'A' | 'B'
                setForm((f) => {
                  const vmActuel = vms.find((v) => v.id === f.vm_id)
                  const vmToujoursValide = vmActuel && vmActuel.secteur === secteur
                  return { ...f, secteur, vm_id: vmToujoursValide ? f.vm_id : '' }
                })
              }}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="A">Secteur A</option>
                <option value="B">Secteur B</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Fréquence de visite (par mois)</label>
              <input type="number" min={1} value={form.frequence_visite_mensuelle}
                onChange={(e) => setForm((f) => ({ ...f, frequence_visite_mensuelle: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Jour / heure habituel</label>
              <input value={form.jour_heure_habituel} onChange={(e) => setForm((f) => ({ ...f, jour_heure_habituel: e.target.value }))}
                placeholder="Ex : Lundi 10h"
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Contacts</label>
              <input value={form.contacts} onChange={(e) => setForm((f) => ({ ...f, contacts: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Observations</label>
              <textarea value={form.observations} onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} rows={2}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Superviseur affecté</label>
              <select value={form.superviseur_id} onChange={(e) => setForm((f) => ({ ...f, superviseur_id: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="">Sans affectation</option>
                {superviseurs.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-ink-400">Le client peut être affecté à un VM et à son superviseur.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical affecté</label>
              <select value={form.vm_id} onChange={(e) => setForm((f) => ({ ...f, vm_id: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="">Sans affectation</option>
                {vms.filter((v) => v.secteur === form.secteur).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-ink-400">Seuls les VM du secteur sélectionné sont proposés (verrouillage sectoriel).</p>
            </div>
          </div>

          {formMsg && (
            <p className={`text-xs rounded-xl px-3 py-2.5 ${formMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {formMsg.text}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={saving}>{editingId ? 'Enregistrer' : 'Ajouter le client'}</Button>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importOpen} onClose={() => setImportOpen(false)}
        title="Importer le portefeuille clients"
        description="Chargement initial ou mise à jour périodique depuis un fichier CSV, en 3 étapes : import, mappage des colonnes puis vérification."
        maxWidth="max-w-3xl"
      >
        <ImportPortefeuilleAssistant onImported={load} />
      </Modal>
    </div>
  )
}
