import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconCheck, IconMapPin, IconClock, IconAlert } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { supabase } from '@/lib/supabase'
import { nowBenin, todayBenin, isoWeekMonday } from '@/lib/time'
import { enqueueVisite } from '@/lib/offlineQueue'
import type { Database } from '@/types/database'

type Ligne = Database['public']['Tables']['programme_lignes']['Row'] & {
  clients: Database['public']['Tables']['clients']['Row'] | null
}
type Produit = Database['public']['Tables']['produits']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']


export default function VisiteDetail() {
  const { ligneId } = useParams()
  if (ligneId === 'hors-programme') return <HorsProgrammeForm />
  return <ProgrammeForm ligneId={ligneId!} />
}

export function GeoHeader() {
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

    const payload = {
      programme_ligne_id: ligne.id, client_id: ligne.client_id, vm_id: session.user.id,
      jour: todayBenin().format('YYYY-MM-DD'), type_visite: ligne.type_visite,
      latitude: geo.latitude, longitude: geo.longitude,
      ...fields
    }

    if (!navigator.onLine) {
      enqueueVisite(payload, produitsIds)
      setSaving(false)
      navigate('/app/visites', { replace: true })
      return
    }

    const { data: visite, error: insertError } = await supabase.from('visites').insert(payload).select('id').single()

    if (insertError) {
      // Hors ligne détecté tardivement (bascule pendant la requête) : on met en file plutôt que de perdre la saisie.
      if (!navigator.onLine) { enqueueVisite(payload, produitsIds); setSaving(false); navigate('/app/visites', { replace: true }); return }
      setError(insertError.message)
      setSaving(false)
      return
    }

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
  const [occasionnelsJour, setOccasionnelsJour] = useState(0)
  const [occasionnelsSemaine, setOccasionnelsSemaine] = useState(0)
  const [clientId, setClientId] = useState('')
  const [nomLibre, setNomLibre] = useState('')
  const [specialiteLibre, setSpecialiteLibre] = useState('')
  const [centreLibre, setCentreLibre] = useState('')
  const [typeVisite, setTypeVisite] = useState<'MEDICAL' | 'PHARMACIE'>('MEDICAL')
  const [raison, setRaison] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const SAISIE_MANUELLE = '__hors_portefeuille__'

  useEffect(() => {
    supabase.from('clients').select('*').order('nom').then(({ data }) => setClients(data ?? []))

    if (!session) return
    const today = todayBenin().format('YYYY-MM-DD')
    const weekStart = isoWeekMonday().format('YYYY-MM-DD')
    const weekEnd = isoWeekMonday().add(4, 'day').format('YYYY-MM-DD')
    supabase.from('visites').select('jour')
      .eq('vm_id', session.user.id).eq('hors_programme', true).is('garde_id', null)
      .gte('jour', weekStart).lte('jour', weekEnd)
      .then(({ data }) => {
        const list = data ?? []
        setOccasionnelsJour(list.filter((v) => v.jour === today).length)
        setOccasionnelsSemaine(list.length)
      })
  }, [session])

  const client = clients.find((c) => c.id === clientId)

  async function handleSave(fields: Record<string, unknown>, produitsIds: string[]) {
    const manuel = clientId === SAISIE_MANUELLE
    if (!session || (!clientId) || (!manuel && !client)) {
      setError('Sélectionnez un client du portefeuille ou choisissez la saisie manuelle.')
      return
    }
    if (manuel && (!nomLibre.trim() || !centreLibre.trim() || (typeVisite === 'MEDICAL' && !specialiteLibre.trim()))) {
      setError(typeVisite === 'MEDICAL' ? 'Renseignez le nom du médecin, sa spécialité et son centre.' : 'Renseignez le nom de la pharmacie et son centre.')
      return
    }
    if (!raison.trim()) { setError('La raison de la visite hors programme est obligatoire.'); return }
    if (occasionnelsJour >= 2) { setError('Quota atteint : maximum 2 clients occasionnels par jour.'); return }
    if (occasionnelsSemaine >= 7) { setError('Quota atteint : maximum 7 clients occasionnels par semaine.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour enregistrer la visite.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      programme_ligne_id: null,
      client_id: manuel ? null : clientId,
      client_nom_libre: manuel ? nomLibre.trim() : null,
      client_specialite_libre: manuel && typeVisite === 'MEDICAL' ? specialiteLibre.trim() : null,
      client_centre_libre: manuel ? centreLibre.trim() : null,
      vm_id: session.user.id,
      jour: todayBenin().format('YYYY-MM-DD'),
      type_visite: typeVisite,
      hors_programme: true,
      motif_hors_programme_id: null,
      motif_hors_programme_commentaire: raison.trim(),
      latitude: geo.latitude,
      longitude: geo.longitude,
      ...fields,
    }

    if (!navigator.onLine) {
      enqueueVisite(payload, produitsIds)
      setSaving(false)
      navigate('/app/visites', { replace: true })
      return
    }

    const { data: visite, error: insertError } = await supabase.from('visites').insert(payload as any).select('id').single()

    if (insertError) {
      if (!navigator.onLine) {
        enqueueVisite(payload, produitsIds)
        setSaving(false)
        navigate('/app/visites', { replace: true })
        return
      }
      setError(insertError.message)
      setSaving(false)
      return
    }
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
      <div className="rounded-xl border border-flame-200 bg-flame-50 px-3 py-2.5 text-xs text-flame-800">
        Clients occasionnels : <strong>{occasionnelsJour}/2 aujourd'hui</strong> · <strong>{occasionnelsSemaine}/7 cette semaine</strong>
      </div>

      <Card>
        <FieldLabel>Client du portefeuille (facultatif si saisie manuelle)</FieldLabel>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
          <option value="">Sélectionner un client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          <option value={SAISIE_MANUELLE}>Client absent du portefeuille — saisir manuellement</option>
        </select>
        {client && <div className="mt-2"><PotentielBadge potentiel={client.potentiel} compact /></div>}
        {clientId === SAISIE_MANUELLE && (
          <div className="mt-3 space-y-3 rounded-xl border border-ink-200 p-3">
            <FieldLabel>{typeVisite === 'MEDICAL' ? 'Nom du médecin' : 'Nom de la pharmacie'}</FieldLabel>
            <input value={nomLibre} onChange={(e) => setNomLibre(e.target.value)} className={selectClass} placeholder={typeVisite === 'MEDICAL' ? 'Nom et prénoms du médecin' : 'Nom de la pharmacie'} />
            {typeVisite === 'MEDICAL' && <>
              <FieldLabel>Spécialité du médecin</FieldLabel>
              <input value={specialiteLibre} onChange={(e) => setSpecialiteLibre(e.target.value)} className={selectClass} placeholder="Saisir la spécialité" />
            </>}
            <FieldLabel>Centre / établissement</FieldLabel>
            <input value={centreLibre} onChange={(e) => setCentreLibre(e.target.value)} className={selectClass} placeholder="Nom du centre ou de l'établissement" />
          </div>
        )}

        <FieldLabel className="mt-4">Type de visite</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['MEDICAL', 'PHARMACIE'] as const).map((t) => (
            <button type="button" key={t} onClick={() => setTypeVisite(t)}
              className={`rounded-xl py-2.5 text-sm font-semibold ${typeVisite === t ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
              {t === 'MEDICAL' ? 'Médical' : 'Pharmacie'}
            </button>
          ))}
        </div>

        <FieldLabel className="mt-4">Raison de la visite hors programme</FieldLabel>
        <textarea value={raison} onChange={(e) => setRaison(e.target.value)} rows={3} className={selectClass} placeholder="Saisir la raison de cette visite…" />
      </Card>

      {typeVisite === 'MEDICAL'
        ? <MedicalFields onSubmit={handleSave} saving={saving} hideCard />
        : <PharmacieFields onSubmit={handleSave} saving={saving} hideCard />}
    </div>
  )
}

export function Header({ client, onBack }: { client: Database['public']['Tables']['clients']['Row'] | null; onBack: () => void }) {
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

export const selectClass = 'w-full rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100'
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`mb-1.5 block text-xs font-semibold text-ink-500 ${className ?? ''}`}>{children}</label>
}
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600">
      <IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{message}</span>
    </div>
  )
}

export function MedicalFields({ onSubmit, saving, hideCard }: {
  onSubmit: (fields: Record<string, unknown>, produits: string[]) => void
  saving: boolean
  hideCard?: boolean
}) {
  const { profile } = useAuth()
  const [produitsCatalogue, setProduitsCatalogue] = useState<Produit[]>([])
  const [cachetProspect, setCachetProspect] = useState(false)
  const [cachetCentre, setCachetCentre] = useState(false)
  const [produits, setProduits] = useState<string[]>([])
  const [engagementsPrescription, setEngagementsPrescription] = useState('')
  const [produitsHabituels, setProduitsHabituels] = useState('')
  const [constatsPrescription, setConstatsPrescription] = useState('')
  const [resumeVisite, setResumeVisite] = useState('')
  const [activitesMenees, setActivitesMenees] = useState('')

  useEffect(() => {
    if (!profile?.equipe_id) return
    supabase.from('produits').select('*').eq('actif', true).eq('equipe_id', profile.equipe_id).order('nom')
      .then(({ data }) => setProduitsCatalogue(data ?? []))
  }, [profile?.equipe_id])

  const toggleProduit = (id: string) => setProduits((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const content = (
    <>
      <FieldLabel>Cachets obtenus</FieldLabel>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="flex items-center gap-2 rounded-xl border border-ink-200 p-3 text-sm text-ink-700">
          <input type="checkbox" checked={cachetProspect} onChange={(e) => setCachetProspect(e.target.checked)} className="h-4 w-4 accent-royal-600" />
          Cachet prospect
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-ink-200 p-3 text-sm text-ink-700">
          <input type="checkbox" checked={cachetCentre} onChange={(e) => setCachetCentre(e.target.checked)} className="h-4 w-4 accent-royal-600" />
          Cachet centre
        </label>
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

      <FieldLabel>Engagements de prescription obtenus</FieldLabel>
      <textarea value={engagementsPrescription} onChange={(e) => setEngagementsPrescription(e.target.value)} rows={3} placeholder="Nommer les produits que le professionnel s'engage à prescrire et préciser les engagements…" className={`${selectClass} mb-4`} />

      <FieldLabel>Produits habituels de prescription</FieldLabel>
      <textarea value={produitsHabituels} onChange={(e) => setProduitsHabituels(e.target.value)} rows={3} placeholder="Nom des produits habituellement prescrits, avec toute précision utile…" className={`${selectClass} mb-4`} />

      <FieldLabel>Constats de prescription</FieldLabel>
      <textarea value={constatsPrescription} onChange={(e) => setConstatsPrescription(e.target.value)} rows={4} placeholder="Nom du ou des produits constatés et commentaires associés…" className={`${selectClass} mb-4`} />

      <FieldLabel>Activités menées</FieldLabel>
      <textarea value={activitesMenees} onChange={(e) => setActivitesMenees(e.target.value)} rows={3} placeholder="Décrire les activités réalisées pendant la visite…" className={`${selectClass} mb-4`} />

      <FieldLabel>Résumé de la visite</FieldLabel>
      <textarea value={resumeVisite} onChange={(e) => setResumeVisite(e.target.value)} rows={4} placeholder="Résumé libre de l'échange, besoins, objections et prochaines étapes…" className={selectClass} />
    </>
  )

  return (
    <div className="space-y-4">
      {hideCard ? content : <Card>{content}</Card>}
      <Button fullWidth loading={saving} icon={<IconCheck className="h-4 w-4" />}
        onClick={() => onSubmit({
          cachet_prospect: cachetProspect,
          cachet_centre: cachetCentre,
          engagements_prescription: engagementsPrescription.trim() || null,
          produits_habituels_prescription: produitsHabituels.trim() || null,
          constats_prescription: constatsPrescription.trim() || null,
          resume_visite: resumeVisite.trim() || null,
          activites_menees: activitesMenees.trim() || null,
        }, produits)}
      >
        Enregistrer et passer au suivant
      </Button>
    </div>
  )
}

export function PharmacieFields({ onSubmit, saving, hideCard }: {
  onSubmit: (fields: Record<string, unknown>, produits: string[]) => void
  saving: boolean
  hideCard?: boolean
}) {
  const { profile } = useAuth()
  const [produitsCatalogue, setProduitsCatalogue] = useState<Produit[]>([])
  const [produits, setProduits] = useState<string[]>([])
  const [stock, setStock] = useState('')
  const [commande, setCommande] = useState('')
  const [commandePhoto, setCommandePhoto] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [veille, setVeille] = useState('')
  const [resumeVisite, setResumeVisite] = useState('')
  const [activitesMenees, setActivitesMenees] = useState('')

  useEffect(() => {
    if (!profile?.equipe_id) return
    supabase.from('produits').select('*').eq('actif', true).eq('equipe_id', profile.equipe_id).order('nom')
      .then(({ data }) => setProduitsCatalogue(data ?? []))
  }, [profile?.equipe_id])

  const toggleProduit = (id: string) => setProduits((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function handleSubmit() {
    setPhotoError(null)
    const commandeSaisie = commande.trim()
    if (commandeSaisie && !commandePhoto) {
      setPhotoError('Ajoutez une photo de la commande pour justifier la commande déclarée.')
      return
    }

    let commandePhotoPath: string | null = null
    if (commandeSaisie && commandePhoto) {
      if (!navigator.onLine) {
        setPhotoError('Une connexion Internet est nécessaire pour envoyer la photo de commande.')
        return
      }
      setUploadingPhoto(true)
      const extension = commandePhoto.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${profile?.id ?? 'utilisateur'}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('preuves-commandes').upload(path, commandePhoto, {
        contentType: commandePhoto.type || 'image/jpeg',
        upsert: false,
      })
      setUploadingPhoto(false)
      if (error) {
        setPhotoError(`Impossible d'envoyer la photo : ${error.message}`)
        return
      }
      commandePhotoPath = path
    }

    onSubmit({
      stock_disponible: null,
      stock_observe: stock.trim() || null,
      commande_obtenue: commandeSaisie || null,
      commande_photo_path: commandePhotoPath,
      veille_concurrentielle: veille.trim() || null,
      resume_visite: resumeVisite.trim() || null,
      activites_menees: activitesMenees.trim() || null,
    }, produits)
  }

  const content = (
    <>
      <FieldLabel>Produits présentés</FieldLabel>
      <div className="flex flex-wrap gap-2 mb-4">
        {produitsCatalogue.map((p) => (
          <button type="button" key={p.id} onClick={() => toggleProduit(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${produits.includes(p.id) ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
            {p.nom}
          </button>
        ))}
      </div>

      <FieldLabel>Stock observé</FieldLabel>
      <textarea value={stock} onChange={(e) => setStock(e.target.value)} rows={2} placeholder="Décrire librement les stocks et les produits concernés…" className={`${selectClass} mb-4`} />

      <FieldLabel>Commande obtenue</FieldLabel>
      <textarea value={commande} onChange={(e) => setCommande(e.target.value)} rows={2} placeholder="Produits, quantités, montant et commentaires…" className={`${selectClass} mb-2`} />
      <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50 p-3">
        <label className="block text-xs font-semibold text-ink-600 mb-2">
          Photo justificative de la commande
          {commande.trim() && <span className="text-red-600"> · obligatoire si une commande est déclarée</span>}
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => { setCommandePhoto(e.target.files?.[0] ?? null); setPhotoError(null) }}
          className="block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-royal-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        />
        {commandePhoto && <p className="mt-2 text-xs text-ink-600">Photo sélectionnée : {commandePhoto.name}</p>}
        {photoError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{photoError}</p>}
        <p className="mt-2 text-[11px] text-ink-400">Prenez ou choisissez une photo lisible du bon de commande ou du justificatif, sans données personnelles inutiles.</p>
      </div>

      <FieldLabel>Veille concurrentielle</FieldLabel>
      <textarea value={veille} onChange={(e) => setVeille(e.target.value)} rows={3} placeholder="Produits concurrents, prix, disponibilité et observations…" className={`${selectClass} mb-4`} />

      <FieldLabel>Activités menées</FieldLabel>
      <textarea value={activitesMenees} onChange={(e) => setActivitesMenees(e.target.value)} rows={3} placeholder="Décrire les activités réalisées pendant la visite…" className={`${selectClass} mb-4`} />

      <FieldLabel>Résumé de la visite</FieldLabel>
      <textarea value={resumeVisite} onChange={(e) => setResumeVisite(e.target.value)} rows={4} placeholder="Résumé libre de l'échange et prochaines étapes…" className={selectClass} />
    </>
  )

  return (
    <div className="space-y-4">
      {hideCard ? content : <Card>{content}</Card>}
      <Button fullWidth loading={saving || uploadingPhoto} icon={<IconCheck className="h-4 w-4" />}
        onClick={handleSubmit}
      >
        {uploadingPhoto ? 'Envoi de la photo…' : 'Enregistrer et passer au suivant'}
      </Button>
    </div>
  )
}


export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${checked ? 'border-royal-300 bg-royal-50 text-royal-700' : 'border-ink-200 text-ink-500'}`}>
      <span className={`flex h-4 w-4 items-center justify-center rounded-md border ${checked ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
        {checked && <IconCheck className="h-3 w-3 text-white" />}
      </span>
      {label}
    </button>
  )
}
