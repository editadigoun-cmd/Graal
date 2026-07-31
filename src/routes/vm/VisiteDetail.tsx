import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconCheck, IconMapPin, IconClock, IconMinus, IconPlus, IconAlert } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { supabase } from '@/lib/supabase'
import { nowBenin, todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'

type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Database['public']['Tables']['clients']['Row'] | null
}
type Produit = Database['public']['Tables']['produits']['Row']
type Motif = Database['public']['Tables']['motifs_non_visite']['Row']
type StockNiveau = Database['public']['Enums']['stock_niveau']
type ClientRow = Database['public']['Tables']['clients']['Row']

const PROMESSES_OPTIONS = ['Recommandation confirmée', 'Essai produit accepté', 'Commande envisagée', 'Aucune promesse cette fois']
const STOCK_OPTIONS: { value: StockNiveau; label: string; color: string }[] = [
  { value: 'RUPTURE', label: 'Rupture', color: 'bg-red-500' },
  { value: 'FAIBLE', label: 'Faible', color: 'bg-flame-500' },
  { value: 'CORRECT', label: 'Correct', color: 'bg-royal-500' },
  { value: 'BON', label: 'Bon', color: 'bg-emerald-500' }
]

export default function VisiteDetail() {
  const { ligneId } = useParams()
  if (ligneId === 'hors-programme') return <HorsProgrammeForm />
  return <ProgrammeForm ligneId={ligneId!} />
}

function GeoHeader() {
  const geo = useGeolocation()
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-ink-50 px-4 py-2.5 text-[11px] text-ink-500">
      <div className="flex items-center gap-1.5"><IconClock className="h-3.5 w-3.5" /> {nowBenin().format('HH:mm:ss')}</div>
      <div className="flex items-center gap-1.5">
        <IconMapPin className="h-3.5 w-3.5" />
        {geo.status === 'ok' && `${geo.latitude?.toFixed(4)}, ${geo.longitude?.toFixed(4)}`}
        {geo.status === 'locating' && 'Localisation…'}
        {(geo.status === 'denied' || geo.status === 'error') && <span className="text-red-500">GPS indisponible</span>}
      </div>
    </div>
  )
}

function ProgrammeForm({ ligneId }: { ligneId: string }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const geo = useGeolocation()
  const [ligne, setLigne] = useState<Ligne | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('programme_lignes').select('*, clients(*)').eq('id', ligneId).single()
      .then(({ data }) => { setLigne(data as Ligne); setLoading(false) })
  }, [ligneId])

  async function handleSave(fields: Record<string, unknown>, produitsIds: string[]) {
    if (!ligne || !session) return
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour enregistrer la visite.'); return }
    setSaving(true)
    setError(null)

    const { data: visite, error: insertError } = await supabase.from('visites').insert({
      programme_ligne_id: ligne.id, client_id: ligne.client_id, vm_id: session.user.id,
      jour: todayBenin().format('YYYY-MM-DD'), type_visite: ligne.type_visite,
      latitude: geo.latitude, longitude: geo.longitude,
      ...fields
    }).select('id').single()

    if (insertError) { setError(insertError.message); setSaving(false); return }

    if (produitsIds.length && visite) {
      await supabase.from('visite_produits').insert(produitsIds.map((pid) => ({ visite_id: visite.id, produit_id: pid })))
    }

    setSaving(false)
    navigate('/app/visites', { replace: true })
  }

  if (loading) return <div className="space-y-3 mt-2"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>
  if (!ligne) return <p className="mt-6 text-center text-sm text-ink-400">Ligne de programme introuvable.</p>

  return (
    <div className="space-y-4 mt-2 pb-4">
      <Header client={ligne.clients} onBack={() => navigate('/app/visites')} />
      <GeoHeader />
      {error && <ErrorBanner message={error} />}
      {ligne.type_visite === 'MEDICAL'
        ? <MedicalFields onSubmit={handleSave} saving={saving} />
        : <PharmacieFields onSubmit={handleSave} saving={saving} />}
    </div>
  )
}

function HorsProgrammeForm() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const geo = useGeolocation()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [motifs, setMotifs] = useState<Motif[]>([])
  const [clientId, setClientId] = useState('')
  const [typeVisite, setTypeVisite] = useState<'MEDICAL' | 'PHARMACIE'>('MEDICAL')
  const [motifId, setMotifId] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('clients').select('*').order('nom').then(({ data }) => setClients(data ?? []))
    supabase.from('motifs_non_visite').select('*').eq('actif', true).order('ordre').then(({ data }) => setMotifs(data ?? []))
  }, [])

  const client = clients.find((c) => c.id === clientId)

  async function handleSave(fields: Record<string, unknown>, produitsIds: string[]) {
    if (!session || !clientId || !motifId) { setError('Client et motif sont obligatoires.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour enregistrer la visite.'); return }
    setSaving(true)
    setError(null)

    const { data: visite, error: insertError } = await supabase.from('visites').insert({
      client_id: clientId, vm_id: session.user.id, jour: todayBenin().format('YYYY-MM-DD'),
      type_visite: typeVisite, hors_programme: true, motif_hors_programme_id: motifId,
      motif_hors_programme_commentaire: commentaire || null,
      latitude: geo.latitude, longitude: geo.longitude,
      ...fields
    }).select('id').single()

    if (insertError) { setError(insertError.message); setSaving(false); return }
    if (produitsIds.length && visite) {
      await supabase.from('visite_produits').insert(produitsIds.map((pid) => ({ visite_id: visite.id, produit_id: pid })))
    }
    setSaving(false)
    navigate('/app/visites', { replace: true })
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <Link to="/app/visites" className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold text-ink-800 font-display">Visite hors programme</h1>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-flame-50 border border-flame-200 p-4">
        <IconAlert className="h-5 w-5 text-flame-600 flex-shrink-0" />
        <p className="text-xs text-flame-700">Cette visite ne correspond à aucune ligne du programme validé. Elle sera signalée au superviseur et déduite du score de conformité.</p>
      </div>

      <GeoHeader />
      {error && <ErrorBanner message={error} />}

      <Card>
        <FieldLabel>Client</FieldLabel>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
          <option value="">Sélectionner un client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        {client && <div className="mt-2"><PotentielBadge potentiel={client.potentiel} compact /></div>}

        <FieldLabel className="mt-4">Type de visite</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['MEDICAL', 'PHARMACIE'] as const).map((t) => (
            <button key={t} onClick={() => setTypeVisite(t)}
              className={`rounded-xl py-2.5 text-sm font-semibold ${typeVisite === t ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
              {t === 'MEDICAL' ? 'Médical' : 'Pharmacie'}
            </button>
          ))}
        </div>

        <FieldLabel className="mt-4">Motif (obligatoire)</FieldLabel>
        <select value={motifId} onChange={(e) => setMotifId(e.target.value)} className={selectClass}>
          <option value="">Sélectionner un motif…</option>
          {motifs.filter((m) => !m.libelle.includes('clôture forcée')).map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>

        <FieldLabel className="mt-4">Précision (optionnel)</FieldLabel>
        <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} className={selectClass} placeholder="Détails complémentaires…" />
      </Card>

      {typeVisite === 'MEDICAL'
        ? <MedicalFields onSubmit={handleSave} saving={saving} hideCard />
        : <PharmacieFields onSubmit={handleSave} saving={saving} hideCard />}
    </div>
  )
}

function Header({ client, onBack }: { client: Database['public']['Tables']['clients']['Row'] | null; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></button>
      <div className="min-w-0">
        <h1 className="text-base font-bold text-ink-800 truncate">{client?.nom}</h1>
        {client && <PotentielBadge potentiel={client.potentiel} compact />}
      </div>
    </div>
  )
}

const selectClass = 'w-full rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100'
function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`mb-1.5 block text-xs font-semibold text-ink-500 ${className ?? ''}`}>{children}</label>
}
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600">
      <IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{message}</span>
    </div>
  )
}

function MedicalFields({ onSubmit, saving, hideCard }: {
  onSubmit: (fields: Record<string, unknown>, produits: string[]) => void
  saving: boolean
  hideCard?: boolean
}) {
  const [produitsCatalogue, setProduitsCatalogue] = useState<Produit[]>([])
  const [cachetProspect, setCachetProspect] = useState(false)
  const [cachetCentre, setCachetCentre] = useState(false)
  const [produits, setProduits] = useState<string[]>([])
  const [promesse, setPromesse] = useState('')
  const [promesseLibre, setPromesseLibre] = useState('')
  const [prescriptions, setPrescriptions] = useState(0)

  useEffect(() => {
    supabase.from('produits').select('*').eq('actif', true).order('nom').then(({ data }) => setProduitsCatalogue(data ?? []))
  }, [])

  const toggleProduit = (id: string) => setProduits((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const content = (
    <>
      <FieldLabel>Cachets obtenus</FieldLabel>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Checkbox label="Cachet prospect" checked={cachetProspect} onChange={setCachetProspect} />
        <Checkbox label="Cachet centre" checked={cachetCentre} onChange={setCachetCentre} />
      </div>

      <FieldLabel>Produits présentés</FieldLabel>
      <div className="flex flex-wrap gap-2 mb-4">
        {produitsCatalogue.map((p) => (
          <button key={p.id} onClick={() => toggleProduit(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${produits.includes(p.id) ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
            {p.nom}
          </button>
        ))}
      </div>

      <FieldLabel>Promesses obtenues</FieldLabel>
      <select value={promesse} onChange={(e) => setPromesse(e.target.value)} className={`${selectClass} mb-2`}>
        <option value="">Sélectionner…</option>
        {PROMESSES_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <input value={promesseLibre} onChange={(e) => setPromesseLibre(e.target.value)} placeholder="Précision libre (optionnel)" className={`${selectClass} mb-4`} />

      <FieldLabel>Prescriptions constatées</FieldLabel>
      <div className="flex items-center gap-4 mb-2">
        <button onClick={() => setPrescriptions((n) => Math.max(0, n - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600"><IconMinus className="h-4 w-4" /></button>
        <span className="w-10 text-center text-xl font-bold font-display">{prescriptions}</span>
        <button onClick={() => setPrescriptions((n) => n + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-50 text-royal-600"><IconPlus className="h-4 w-4" /></button>
      </div>
    </>
  )

  return (
    <div className="space-y-4">
      {hideCard ? content : <Card>{content}</Card>}
      <Button fullWidth loading={saving} icon={<IconCheck className="h-4 w-4" />}
        onClick={() => onSubmit({
          cachet_prospect: cachetProspect, cachet_centre: cachetCentre,
          promesses_obtenues: promesse || null, promesses_libre: promesseLibre || null,
          prescriptions_constatees: prescriptions
        }, produits)}
      >
        Enregistrer et passer au suivant
      </Button>
    </div>
  )
}

function PharmacieFields({ onSubmit, saving, hideCard }: {
  onSubmit: (fields: Record<string, unknown>, produits: string[]) => void
  saving: boolean
  hideCard?: boolean
}) {
  const [stock, setStock] = useState<StockNiveau | ''>('')
  const [commande, setCommande] = useState('')
  const [veille, setVeille] = useState('')

  const content = (
    <>
      <FieldLabel>Stock disponible</FieldLabel>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {STOCK_OPTIONS.map((o) => (
          <button key={o.value} onClick={() => setStock(o.value)}
            className={`flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold transition ${stock === o.value ? 'bg-ink-800 text-white' : 'bg-ink-100 text-ink-500'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${o.color}`} />
            {o.label}
          </button>
        ))}
      </div>

      <FieldLabel>Commande obtenue</FieldLabel>
      <input value={commande} onChange={(e) => setCommande(e.target.value)} placeholder="Quantité / montant" className={`${selectClass} mb-4`} />

      <FieldLabel>Veille concurrentielle</FieldLabel>
      <textarea value={veille} onChange={(e) => setVeille(e.target.value)} rows={2} placeholder="Observations sur la concurrence…" className={selectClass} />
    </>
  )

  return (
    <div className="space-y-4">
      {hideCard ? content : <Card>{content}</Card>}
      <Button fullWidth loading={saving} icon={<IconCheck className="h-4 w-4" />}
        onClick={() => onSubmit({ stock_disponible: stock || null, commande_obtenue: commande || null, veille_concurrentielle: veille || null }, [])}
      >
        Enregistrer et passer au suivant
      </Button>
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${checked ? 'border-royal-300 bg-royal-50 text-royal-700' : 'border-ink-200 text-ink-500'}`}>
      <span className={`flex h-4 w-4 items-center justify-center rounded-md border ${checked ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
        {checked && <IconCheck className="h-3 w-3 text-white" />}
      </span>
      {label}
    </button>
  )
}
