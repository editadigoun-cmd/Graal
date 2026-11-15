import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconMapPin, IconSearch, IconCheckCircle } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import { MedicalFields, PharmacieFields, ErrorBanner } from '@/routes/vm/VisiteDetail'

type Client = { id: string; nom: string; centre: string | null; specialite: string | null; potentiel: string | null; secteur: string | null }

export default function SupervisorVisites() {
  const { profile } = useAuth()
  const geo = useGeolocation()
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState<'MEDICAL' | 'PHARMACIE'>('MEDICAL')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medicalCount, setMedicalCount] = useState(0)
  const [pharmacyCount, setPharmacyCount] = useState(0)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [{ data: links, error: linkError }, { data: visits, error: visitError }] = await Promise.all([
      supabase.from('portefeuille_superviseurs').select('client_id').eq('superviseur_id', profile.id),
      supabase.from('visites').select('type_visite').eq('vm_id', profile.id).eq('jour', todayBenin().format('YYYY-MM-DD')).eq('statut', 'REALISEE')
    ])
    if (linkError) setError('Impossible de charger le portefeuille du superviseur : ' + linkError.message)
    const ids = (links ?? []).map((x: { client_id: string }) => x.client_id)
    if (ids.length) {
      const { data, error: clientsError } = await supabase.from('clients')
        .select('id,nom,centre,specialite,potentiel,secteur').in('id', ids).order('nom')
      if (clientsError) setError('Impossible de charger les clients : ' + clientsError.message)
      setClients((data ?? []) as Client[])
    } else setClients([])
    if (visitError) setError('Impossible de charger les objectifs du jour : ' + visitError.message)
    const rows = visits ?? []
    setMedicalCount(rows.filter((v: { type_visite: string }) => v.type_visite === 'MEDICAL').length)
    setPharmacyCount(rows.filter((v: { type_visite: string }) => v.type_visite === 'PHARMACIE').length)
    setLoading(false)
  }

  useEffect(() => { if (profile?.role !== 'superviseur') { navigate('/admin', { replace: true }); return } void load() }, [profile?.id, profile?.role])

  const selected = clients.find(c => c.id === clientId)
  // Le type de visite pilote aussi la liste des clients : aucune pharmacie
  // dans une visite médicale, aucun client médical dans une visite pharmacie.
  const filtered = useMemo(() => clients.filter(c => {
    const estPharmacie = c.specialite === 'PHARMACIE'
    if (type === 'PHARMACIE' && !estPharmacie) return false
    if (type === 'MEDICAL' && estPharmacie) return false
    const q = query.trim().toLocaleLowerCase('fr')
    return !q || c.nom.toLocaleLowerCase('fr').includes(q) || (c.centre ?? '').toLocaleLowerCase('fr').includes(q)
  }), [clients, query, type])

  function changerType(nextType: 'MEDICAL' | 'PHARMACIE') {
    setType(nextType)
    setClientId('')
    setError(null)
    setSuccess(null)
  }

  async function save(fields: Record<string, unknown>, products: string[]) {
    if (!profile?.id || !selected) { setError('Sélectionnez un client de votre portefeuille.'); return }
    if (type === 'MEDICAL' && medicalCount >= 8) { setError('Quota quotidien atteint : 8 visites médicales maximum.'); return }
    if (type === 'PHARMACIE' && pharmacyCount >= 2) { setError('Quota quotidien atteint : 2 visites pharmacie maximum.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) {
      setError('La géolocalisation est obligatoire. Autorisez la position GPS et attendez son acquisition avant l’enregistrement.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    const payload = {
      programme_ligne_id: null,
      client_id: selected.id,
      vm_id: profile.id,
      jour: todayBenin().format('YYYY-MM-DD'),
      type_visite: type,
      statut: 'REALISEE',
      hors_programme: false,
      latitude: geo.latitude,
      longitude: geo.longitude,
      cachet_prospect: Boolean(fields.cachet_prospect),
      cachet_centre: Boolean(fields.cachet_centre),
      engagements_prescription: fields.engagements_prescription ?? null,
      produits_habituels_prescription: fields.produits_habituels_prescription ?? null,
      constats_prescription: fields.constats_prescription ?? null,
      resume_visite: fields.resume_visite ?? null,
      activites_menees: fields.activites_menees ?? null,
      stock_observe: fields.stock_observe ?? null,
      commande_obtenue: fields.commande_obtenue ?? null,
      commande_photo_path: fields.commande_photo_path ?? null,
      veille_concurrentielle: fields.veille_concurrentielle ?? null,
    }
    const { data: visit, error: insertError } = await supabase.from('visites').insert(payload as never).select('id').single()
    if (insertError || !visit) {
      setError(insertError?.message ?? 'La visite n’a pas pu être enregistrée.')
      setSaving(false)
      return
    }
    if (products.length) {
      const { error: productsError } = await supabase.from('visite_produits').insert(products.map(produit_id => ({ visite_id: visit.id, produit_id })))
      if (productsError) {
        setError('Visite enregistrée, mais les produits présentés n’ont pas pu être associés : ' + productsError.message)
        setSaving(false)
        return
      }
    }
    setSuccess(`Visite ${type === 'MEDICAL' ? 'médicale' : 'pharmacie'} enregistrée pour ${selected.nom}.`)
    setClientId('')
    await load()
    setSaving(false)
  }

  if (loading) return <div className="py-10 text-center text-sm text-ink-400">Chargement de votre portefeuille…</div>

  return (
    <div className="space-y-5 pb-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Espace superviseur</p>
        <h1 className="provisit-page-title mt-1">Visites</h1>
        <p className="mt-1 text-sm text-ink-400">Enregistrez directement vos visites depuis votre portefeuille, sans planning hebdomadaire.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-royal-100 bg-royal-50">
          <p className="text-xs font-semibold text-royal-700">Visites médicales</p>
          <p className="mt-1 text-2xl font-extrabold text-royal-900">{medicalCount}<span className="text-sm font-semibold text-royal-500"> / 8</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-royal-600" style={{ width: `${Math.min(100, medicalCount / 8 * 100)}%` }} /></div>
        </Card>
        <Card className="border border-emerald-100 bg-emerald-50">
          <p className="text-xs font-semibold text-emerald-700">Visites pharmacie</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-900">{pharmacyCount}<span className="text-sm font-semibold text-emerald-500"> / 2</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, pharmacyCount / 2 * 100)}%` }} /></div>
        </Card>
      </div>

      {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><IconCheckCircle className="mr-2 inline h-4 w-4" />{success}</div>}
      {error && <ErrorBanner message={error} />}

      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-700"><IconSearch className="h-4 w-4" /> Choisir un client de mon portefeuille</div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un client ou un centre…" className="w-full rounded-xl border border-ink-200 px-3 py-3 text-sm outline-none focus:border-royal-400" />
        <select value={clientId} onChange={e => { setClientId(e.target.value); setSuccess(null); setError(null) }} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm">
          <option value="">Sélectionner un client…</option>
          {filtered.map(c => <option key={c.id} value={c.id}>{c.nom}{c.centre ? ` — ${c.centre}` : ''}</option>)}
        </select>
        {selected && <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600"><strong>{selected.nom}</strong><p className="mt-1">{selected.specialite ?? 'Spécialité non renseignée'} · {selected.centre ?? 'Centre non renseigné'}</p></div>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => changerType('MEDICAL')} className={`rounded-xl px-3 py-3 text-sm font-bold ${type === 'MEDICAL' ? 'bg-royal-700 text-white' : 'bg-ink-100 text-ink-600'}`}>Visite médicale</button>
          <button type="button" onClick={() => changerType('PHARMACIE')} className={`rounded-xl px-3 py-3 text-sm font-bold ${type === 'PHARMACIE' ? 'bg-royal-700 text-white' : 'bg-ink-100 text-ink-600'}`}>Visite pharmacie</button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs">
          <IconMapPin className="h-4 w-4 text-royal-600" />
          {geo.status === 'ok' ? <span className="text-emerald-700">Position GPS acquise ({geo.latitude?.toFixed(5)}, {geo.longitude?.toFixed(5)})</span> : geo.status === 'locating' ? 'Acquisition de la position GPS…' : <span className="text-red-600">Position GPS obligatoire — autorisez la localisation sur votre appareil.</span>}
        </div>
      </Card>

      {!selected ? <Card className="py-8 text-center text-sm text-ink-400">Sélectionnez un client pour afficher le formulaire de visite.</Card> : type === 'MEDICAL'
        ? <MedicalFields onSubmit={save} saving={saving} />
        : <PharmacieFields onSubmit={save} saving={saving} />}
      {filtered.length === 0 && <Card className="py-8 text-center text-sm text-ink-400">{type === 'PHARMACIE' ? 'Aucune pharmacie dans votre portefeuille.' : 'Aucun client médical dans votre portefeuille.'}</Card>}
    </div>
  )
}
