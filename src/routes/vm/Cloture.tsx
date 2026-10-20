import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconCamera, IconCheckCircle, IconAlert, IconMoon, IconChevronRight } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useVisitesDuJour } from '@/features/data/useVisitesDuJour'
import { useOfflineClotureSync } from '@/hooks/useOfflineClotureSync'
import { savePendingCloture, getPendingCloture, type MotifLocal } from '@/lib/offlineCloture'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'

type Motif = Database['public']['Tables']['motifs_non_visite']['Row']

export default function Cloture() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const geo = useGeolocation()
  const { lignes, loading, reload } = useVisitesDuJour()
  const { hasPending } = useOfflineClotureSync()
  const [motifs, setMotifs] = useState<Motif[]>([])
  const [motifChoisi, setMotifChoisi] = useState<Record<string, string>>({})
  const [commentaires, setCommentaires] = useState<Record<string, string>>({})
  const [motifsLocaux, setMotifsLocaux] = useState<Record<string, MotifLocal>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [cloturing, setCloturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [doneOffline, setDoneOffline] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('motifs_non_visite').select('*').eq('actif', true).order('ordre')
      .then(({ data }) => setMotifs((data ?? []).filter((m) => !m.libelle.includes('clôture forcée'))))
  }, [])

  useEffect(() => {
    getPendingCloture().then((p) => setDoneOffline(!!p))
  }, [hasPending])

  const manquantes = lignes.filter((l) => l.statut_reel === 'NON_FAITE' || l.statut_reel === 'EN_ATTENTE')
  const realisees = lignes.filter((l) => l.statut_reel === 'REALISEE')
  const dejaMotivees = new Set([
    ...lignes.filter((l) => l.statut_reel === 'NON_FAITE').map((l) => l.programme_ligne_id),
    ...Object.keys(motifsLocaux)
  ])

  async function enregistrerMotif(ligneId: string) {
    if (!motifChoisi[ligneId] || !session) return
    setSaving(ligneId)
    if (!navigator.onLine) {
      setMotifsLocaux((m) => ({ ...m, [ligneId]: { programmeLigneId: ligneId, motifId: motifChoisi[ligneId], commentaire: commentaires[ligneId] || null } }))
      setSaving(null)
      return
    }
    const { error } = await supabase.from('visite_manquante_motifs').insert({
      programme_ligne_id: ligneId, motif_id: motifChoisi[ligneId], commentaire: commentaires[ligneId] || null,
      cree_par: session.user.id
    })
    setSaving(null)
    if (error) {
      if (!navigator.onLine) { setMotifsLocaux((m) => ({ ...m, [ligneId]: { programmeLigneId: ligneId, motifId: motifChoisi[ligneId], commentaire: commentaires[ligneId] || null } })); return }
      setError(error.message)
    } else reload()
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length) { setPhotos((current) => [...current, ...files]); setPhotoPreviews((current) => [...current, ...files.map((f) => URL.createObjectURL(f))]); setError(null) }
    e.target.value = ''
  }
  function supprimerPhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index))
    setPhotoPreviews((current) => { if (current[index]) URL.revokeObjectURL(current[index]); return current.filter((_, i) => i !== index) })
  }

  const restantesSansMotif = manquantes.filter((l) => !dejaMotivees.has(l.programme_ligne_id))

  async function handleCloture() {
    if (!session) return
    if (restantesSansMotif.length > 0) { setError('Un motif est requis pour chaque visite manquante.'); return }
    if (photos.length === 0) { setError('Ajoutez au moins une photo de la fiche papier.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour clôturer.'); return }
    const latitude = geo.latitude
    const longitude = geo.longitude
    const jour = todayBenin().format('YYYY-MM-DD')

    setCloturing(true)
    setError(null)

    if (!navigator.onLine) {
      await savePendingCloture({ jour, photoBlobs: photos, photoTypes: photos.map((p) => p.type), latitude, longitude, motifsLocaux: Object.values(motifsLocaux), createdAt: new Date().toISOString() })
      setCloturing(false)
      setDoneOffline(true)
      return
    }

    const paths: string[] = []
    for (const [index, photo] of photos.entries()) {
      const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${session.user.id}/${jour}-${Date.now()}-${index + 1}.${extension}`
      const { error: uploadError } = await supabase.storage.from('fiches-papier').upload(path, photo, { contentType: photo.type })
      if (uploadError) {
        if (!navigator.onLine) { await savePendingCloture({ jour, photoBlobs: photos, photoTypes: photos.map((p) => p.type), latitude, longitude, motifsLocaux: Object.values(motifsLocaux), createdAt: new Date().toISOString() }); setCloturing(false); setDoneOffline(true); return }
        setError(`Photo ${index + 1} : ${uploadError.message}`); setCloturing(false); return
      }
      paths.push(path)
    }
    const { data, error: rpcError } = await supabase.rpc('cloturer_journee_multi', { p_photo_paths: paths, p_photo_latitude: latitude, p_photo_longitude: longitude, p_reports: Object.values(motifsLocaux).map((m) => ({ programme_ligne_id: m.programmeLigneId, motif_id: m.motifId, commentaire: m.commentaire })) })

    setCloturing(false)
    if (rpcError) setError(rpcError.message)
    else { void data; setDone(true) }
  }

  if (loading) return null

  if (done) {
    return (
      <div className="space-y-4">
        <div className="mt-10 flex flex-col items-center text-center">
          <div className="rounded-full bg-emerald-50 p-4"><IconCheckCircle className="h-10 w-10 text-emerald-600" /></div>
          <p className="mt-4 text-lg font-bold text-ink-800 font-display">Journée clôturée</p>
          <p className="mt-1 text-sm text-ink-400">Vos résultats alimentent votre score de performance.</p>
          <Button className="mt-6" onClick={() => navigate('/app')}>Retour à l'accueil</Button>
        </div>
        <button onClick={() => navigate('/app/garde')} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-royal-300 bg-royal-50 p-4 text-left">
          <IconMoon className="h-5 w-5 text-royal-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-royal-700">Visite de garde</p>
            <p className="text-[11px] text-royal-600/80">Client de votre portefeuille visité en heures de garde</p>
          </div>
          <IconChevronRight className="h-4 w-4 text-royal-500" />
        </button>
      </div>
    )
  }

  if (doneOffline) {
    return (
      <div className="mt-10 flex flex-col items-center text-center">
        <div className="rounded-full bg-flame-50 p-4"><IconAlert className="h-10 w-10 text-flame-600" /></div>
        <p className="mt-4 text-lg font-bold text-ink-800 font-display">Clôture en attente de synchronisation</p>
        <p className="mt-1 text-sm text-ink-400 max-w-xs">
          Votre clôture (photo et motifs) est enregistrée sur cet appareil et sera transmise automatiquement dès que le réseau sera rétabli.
        </p>
        <Button className="mt-6" onClick={() => navigate('/app')}>Retour à l'accueil</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-2 pb-4">
      <h1 className="text-lg font-bold text-ink-800 font-display">Clôture de journée</h1>

      <Card className="bg-gradient-to-br from-royal-600 to-royal-700 text-white text-center py-6">
        <p className="text-3xl font-extrabold font-display">{realisees.length}/{lignes.length}</p>
        <p className="text-sm text-white/80 mt-1">visites faites, {manquantes.length} manquante{manquantes.length > 1 ? 's' : ''}</p>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600">
          <IconAlert className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {manquantes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-ink-800">Motif des visites manquantes</p>
          {manquantes.map((l) => {
            const motive = dejaMotivees.has(l.programme_ligne_id)
            return (
              <Card key={l.programme_ligne_id} className={motive ? 'bg-emerald-50/50' : undefined}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-ink-800">{l.client_nom}</p>
                  {motive && <IconCheckCircle className="h-4 w-4 text-emerald-600" />}
                </div>
                {!motive && (
                  <>
                    <select
                      value={motifChoisi[l.programme_ligne_id!] ?? ''}
                      onChange={(e) => setMotifChoisi((m) => ({ ...m, [l.programme_ligne_id!]: e.target.value }))}
                      className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm mb-2"
                    >
                      <option value="">Sélectionner un motif…</option>
                      {motifs.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <input
                        value={commentaires[l.programme_ligne_id!] ?? ''}
                        onChange={(e) => setCommentaires((c) => ({ ...c, [l.programme_ligne_id!]: e.target.value }))}
                        placeholder="Précision (optionnel)"
                        className="flex-1 rounded-xl border border-ink-200 px-3 py-2 text-sm"
                      />
                      <Button size="sm" loading={saving === l.programme_ligne_id}
                        disabled={!motifChoisi[l.programme_ligne_id!]}
                        onClick={() => enregistrerMotif(l.programme_ligne_id!)}>OK</Button>
                    </div>
                  </>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-bold text-ink-800">Photos de la fiche papier</p><span className="text-xs text-ink-400">{photos.length} photo{photos.length > 1 ? 's' : ''}</span></div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        {photoPreviews.length > 0 && <div className="mb-3 grid grid-cols-2 gap-3">{photoPreviews.map((src, index) => <div key={`${src}-${index}`} className="relative overflow-hidden rounded-xl border border-ink-100"><img src={src} alt={`Fiche papier ${index + 1}`} className="h-36 w-full object-cover" /><span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">Photo {index + 1}</span><button type="button" onClick={() => supprimerPhoto(index)} className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-bold text-red-600 shadow" aria-label={`Supprimer la photo ${index + 1}`}>✕</button></div>)}</div>}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-royal-200 py-6 text-royal-600"><IconCamera className="h-7 w-7" /><span className="text-sm font-semibold">{photos.length ? 'Prendre une autre photo' : 'Prendre la première photo'}</span><span className="text-[11px] text-ink-400">Vous pouvez ajouter plusieurs photos successivement</span></button>
      </Card>

      <Button fullWidth loading={cloturing} onClick={handleCloture} disabled={restantesSansMotif.length > 0 || photos.length === 0}>
        Valider la clôture
      </Button>
    </div>
  )
}
