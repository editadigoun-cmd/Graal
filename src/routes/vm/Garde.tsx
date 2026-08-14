import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconCamera, IconCheckCircle, IconMoon, IconPlus, IconMapPin } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import { GeoHeader, FieldLabel, ErrorBanner, selectClass, MedicalFields, PharmacieFields } from '@/routes/vm/VisiteDetail'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type ClientRow = Database['public']['Tables']['clients']['Row']
type GardeRow = Database['public']['Tables']['gardes']['Row']
type VisiteAvecClient = Database['public']['Tables']['visites']['Row'] & {
  clients: Pick<ClientRow, 'nom' | 'centre' | 'potentiel'> | null
}

// Après la clôture de sa journée, le VM peut visiter des clients de son portefeuille en
// heures de garde (hors créneau habituel 8h-19h). La session de garde s'ouvre automatiquement
// dès qu'il accède à cet écran une fois clôturé, et se referme quand il capture sa fiche de
// fin de garde (photo + position), ce qui notifie son superviseur.
export default function Garde() {
  const { session } = useAuth()
  const jour = todayBenin().format('YYYY-MM-DD')

  const [loading, setLoading] = useState(true)
  const [clotureFaite, setClotureFaite] = useState(false)
  const [garde, setGarde] = useState<GardeRow | null>(null)
  const [visites, setVisites] = useState<VisiteAvecClient[]>([])
  const [ecran, setEcran] = useState<'liste' | 'nouvelle' | 'terminer'>('liste')

  const charger = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const { data: cloture } = await supabase.from('clotures_journalieres').select('statut')
      .eq('vm_id', session.user.id).eq('jour', jour).maybeSingle()
    const estCloturee = cloture?.statut === 'CLOTUREE' || cloture?.statut === 'CLOTUREE_FORCEE'
    setClotureFaite(estCloturee)

    if (!estCloturee) {
      setGarde(null)
      setVisites([])
      setLoading(false)
      return
    }

    let { data: g } = await supabase.from('gardes').select('*').eq('vm_id', session.user.id).eq('jour', jour).maybeSingle()
    if (!g) {
      await supabase.from('gardes').upsert({ vm_id: session.user.id, jour }, { onConflict: 'vm_id,jour', ignoreDuplicates: true })
      const { data: fetched } = await supabase.from('gardes').select('*').eq('vm_id', session.user.id).eq('jour', jour).maybeSingle()
      g = fetched ?? null
    }
    setGarde(g)

    if (g) {
      const { data: v } = await supabase.from('visites').select('*, clients(nom, centre, potentiel)')
        .eq('garde_id', g.id).order('horodatage', { ascending: false })
      setVisites((v as any) ?? [])
    } else {
      setVisites([])
    }
    setLoading(false)
  }, [session, jour])

  useEffect(() => { charger() }, [charger])

  if (loading) return <div className="space-y-3 mt-2"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>

  if (!clotureFaite) {
    return (
      <div className="mt-10 flex flex-col items-center text-center px-4">
        <div className="rounded-full bg-ink-100 p-4"><IconMoon className="h-10 w-10 text-ink-400" /></div>
        <p className="mt-4 text-lg font-bold text-ink-800 font-display">Garde indisponible</p>
        <p className="mt-1 text-sm text-ink-400 max-w-xs">
          La visite de garde s'active automatiquement une fois votre journée clôturée (19h).
        </p>
      </div>
    )
  }

  if (ecran === 'nouvelle' && garde) {
    return <NouvelleVisiteGarde gardeId={garde.id} jour={jour} onCancel={() => setEcran('liste')} onDone={() => { setEcran('liste'); charger() }} />
  }

  if (ecran === 'terminer') {
    return <TerminerGarde onCancel={() => setEcran('liste')} onDone={() => { setEcran('liste'); charger() }} />
  }

  if (garde?.statut === 'TERMINEE') {
    return (
      <div className="space-y-4 mt-2 pb-4">
        <div className="mt-6 flex flex-col items-center text-center px-4">
          <div className="rounded-full bg-emerald-50 p-4"><IconCheckCircle className="h-10 w-10 text-emerald-600" /></div>
          <p className="mt-4 text-lg font-bold text-ink-800 font-display">Garde terminée</p>
          <p className="mt-1 text-sm text-ink-400 max-w-xs">
            {visites.length} visite{visites.length > 1 ? 's' : ''} de garde enregistrée{visites.length > 1 ? 's' : ''}
            {garde.terminee_at ? ` · clôturée à ${dayjs(garde.terminee_at).format('HH:mm')}` : ''}.
          </p>
        </div>
        {visites.length > 0 && (
          <div className="space-y-2.5">
            {visites.map((v) => <VisiteGardeCard key={v.id} v={v} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <IconMoon className="h-5 w-5 text-royal-600" />
        <h1 className="text-lg font-bold text-ink-800 font-display">Visite de garde</h1>
      </div>

      <Card className="bg-gradient-to-br from-royal-600 to-royal-700 text-white text-center py-6">
        <p className="text-3xl font-extrabold font-display">{visites.length}</p>
        <p className="text-sm text-white/80 mt-1">visite{visites.length > 1 ? 's' : ''} de garde aujourd'hui</p>
      </Card>

      <div className="grid grid-cols-1 gap-2.5">
        <button onClick={() => setEcran('nouvelle')} className="flex items-center gap-3 rounded-2xl bg-royal-600 px-4 py-3.5 text-white">
          <IconPlus className="h-5 w-5" />
          <span className="text-sm font-bold">Ajouter une visite de garde</span>
        </button>
        <button onClick={() => setEcran('terminer')} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-flame-300 bg-flame-50 px-4 py-3.5 text-flame-700">
          <IconCamera className="h-5 w-5" />
          <span className="text-sm font-bold">Terminer la garde</span>
        </button>
      </div>

      {visites.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide pt-2">Visites de garde du jour</p>
          {visites.map((v) => <VisiteGardeCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  )
}

function VisiteGardeCard({ v }: { v: VisiteAvecClient }) {
  return (
    <Card className="flex items-center gap-3 py-3.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
        <IconMoon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-800 truncate">{v.clients?.nom ?? 'Client'}</p>
        <div className="mt-1 flex items-center gap-2">
          {v.clients?.potentiel && <PotentielBadge potentiel={v.clients.potentiel} compact />}
          <span className="text-[11px] text-ink-400">{v.type_visite === 'MEDICAL' ? 'Médical' : 'Pharmacie'} · {dayjs(v.horodatage).format('HH:mm')}</span>
        </div>
      </div>
    </Card>
  )
}

function NouvelleVisiteGarde({ gardeId, jour, onDone, onCancel }: { gardeId: string; jour: string; onDone: () => void; onCancel: () => void }) {
  const { session } = useAuth()
  const geo = useGeolocation()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientId, setClientId] = useState('')
  const [typeVisite, setTypeVisite] = useState<'MEDICAL' | 'PHARMACIE'>('MEDICAL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    supabase.from('portefeuille').select('clients(*)').eq('vm_id', session.user.id)
      .then(({ data }) => setClients(((data ?? []).map((p: any) => p.clients).filter(Boolean) as ClientRow[]).sort((a, b) => a.nom.localeCompare(b.nom))))
  }, [session])

  const client = clients.find((c) => c.id === clientId)

  async function handleSave(fields: Record<string, unknown>, produitsIds: string[]) {
    if (!session || !clientId) { setError('Sélectionnez un client.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour enregistrer la visite.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      client_id: clientId, vm_id: session.user.id, jour, type_visite: typeVisite,
      garde_id: gardeId, latitude: geo.latitude, longitude: geo.longitude,
      ...fields
    }

    const { data: visite, error: insertError } = await supabase.from('visites').insert(payload).select('id').single()
    if (insertError) { setError(insertError.message); setSaving(false); return }
    if (produitsIds.length && visite) {
      await supabase.from('visite_produits').insert(produitsIds.map((pid) => ({ visite_id: visite.id, produit_id: pid })))
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-ink-800 font-display">Nouvelle visite de garde</h1>
      </div>

      <GeoHeader />
      {error && <ErrorBanner message={error} />}

      <Card>
        <FieldLabel>Client</FieldLabel>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
          <option value="">Sélectionner un client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.centre ? ` — ${c.centre}` : ''}</option>)}
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
      </Card>

      {typeVisite === 'MEDICAL'
        ? <MedicalFields onSubmit={handleSave} saving={saving} hideCard />
        : <PharmacieFields onSubmit={handleSave} saving={saving} hideCard />}
    </div>
  )
}

function TerminerGarde({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { session } = useAuth()
  const geo = useGeolocation()
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  async function valider() {
    if (!session) return
    if (!photo) { setError('La photo de fin de garde est obligatoire.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour terminer la garde.'); return }
    setSaving(true)
    setError(null)

    const path = `${session.user.id}/garde-${todayBenin().format('YYYY-MM-DD')}-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('fiches-papier').upload(path, photo, { contentType: photo.type })
    if (uploadError) { setError(uploadError.message); setSaving(false); return }

    const { error: rpcError } = await supabase.rpc('terminer_garde', {
      p_photo_path: path, p_photo_latitude: geo.latitude, p_photo_longitude: geo.longitude
    })
    setSaving(false)
    if (rpcError) { setError(rpcError.message); return }
    onDone()
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-ink-800 font-display">Terminer la garde</h1>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-ink-50 px-4 py-2.5 text-[11px] text-ink-500">
        <div className="flex items-center gap-1.5">
          <IconMapPin className="h-3.5 w-3.5" />
          {geo.status === 'ok' && `${geo.latitude?.toFixed(4)}, ${geo.longitude?.toFixed(4)}`}
          {geo.status === 'locating' && 'Localisation…'}
          {(geo.status === 'denied' || geo.status === 'error') && <span className="text-red-500">GPS indisponible</span>}
        </div>
      </div>
      {error && <ErrorBanner message={error} />}

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Photo de fin de garde</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Fin de garde" className="w-full rounded-2xl object-cover max-h-64" />
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow">Reprendre</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-royal-200 py-10 text-royal-600"
          >
            <IconCamera className="h-8 w-8" />
            <span className="text-sm font-semibold">Prendre en photo la fiche de garde</span>
          </button>
        )}
      </Card>

      <Button fullWidth loading={saving} onClick={valider} disabled={!photo}>Confirmer la fin de garde</Button>
    </div>
  )
}
