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
import { todayBenin, isoWeekMonday } from '@/lib/time'
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
  const [reportSelection, setReportSelection] = useState<Record<string, string>>({})
  const [motifsLocaux, setMotifsLocaux] = useState<Record<string, MotifLocal>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
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
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const datesReportables = Array.from({ length: 5 }, (_, i) => isoWeekMonday().add(i, 'day'))
    .filter((d) => d.isAfter(todayBenin(), 'day'))
  const reportsSelectionnes = Object.entries(reportSelection).filter(([, date]) => !!date)
  const restantesSansMotif = manquantes.filter((l) => {
    const ligneEtendue = l as typeof l & { reportee?: boolean; date_report?: string | null }
    const reportDuJour = datesReportables.length > 0 && ligneEtendue.reportee && ligneEtendue.date_report === todayBenin().format('YYYY-MM-DD')
    return !reportSelection[l.programme_ligne_id] && (!dejaMotivees.has(l.programme_ligne_id) || reportDuJour)
  })

  async function handleCloture() {
    if (!session) return
    if (restantesSansMotif.length > 0) { setError('Chaque visite manquante doit avoir un motif ou être reportée. Une visite déjà reportée mais non réalisée doit être reportée à nouveau.'); return }
    if (!photo) { setError('La photo de la fiche papier est obligatoire.'); return }
    if (geo.status !== 'ok' || geo.latitude === null || geo.longitude === null) { setError('Position GPS requise pour clôturer.'); return }
    const latitude = geo.latitude
    const longitude = geo.longitude
    const jour = todayBenin().format('YYYY-MM-DD')

    setCloturing(true)
    setError(null)

    if (!navigator.onLine) {
      await savePendingCloture({
        jour, photoBlob: photo, photoType: photo.type, latitude, longitude,
        motifsLocaux: Object.values(motifsLocaux), reports: reportsSelectionnes.map(([programme_ligne_id, jour_report]) => ({ programme_ligne_id, jour_report })), createdAt: new Date().toISOString()
      })
      setCloturing(false)
      setDoneOffline(true)
      return
    }

    const path = `${session.user.id}/${jour}-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('fiches-papier').upload(path, photo, { contentType: photo.type })
    if (uploadError) {
      if (!navigator.onLine) {
        await savePendingCloture({ jour, photoBlob: photo, photoType: photo.type, latitude, longitude, motifsLocaux: Object.values(motifsLocaux), reports: reportsSelectionnes.map(([programme_ligne_id, jour_report]) => ({ programme_ligne_id, jour_report })), createdAt: new Date().toISOString() })
        setCloturing(false)
        setDoneOffline(true)
        return
      }
      setError(uploadError.message); setCloturing(false); return
    }

    const { data, error: rpcError } = await (supabase as any).rpc('cloturer_journee', {
      p_photo_path: path, p_photo_latitude: latitude, p_photo_longitude: longitude,
      p_reports: reportsSelectionnes.map(([programme_ligne_id, jour_report]) => ({ programme_ligne_id, jour_report }))
    })

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
                {datesReportables.length > 0 && (
                  <div className="mb-3 rounded-xl border border-royal-100 bg-royal-50 p-3">
                    <label className="mb-1 block text-xs font-semibold text-royal-800">Reporter cette visite vers un autre jour</label>
                    <select
                      value={reportSelection[l.programme_ligne_id!] ?? ''}
                      onChange={(e) => {
                        const target = e.target.value
                        if (target) {
                          const total = Object.values(reportSelection).filter(Boolean).length
                          const sameDay = Object.entries(reportSelection).filter(([id, date]) => id !== l.programme_ligne_id && date === target).length
                          if (!reportSelection[l.programme_ligne_id!] && total >= 5) { setError('Maximum 5 visites reportées dans la semaine.'); return }
                          if (sameDay >= 2) { setError('Maximum 2 visites reportées vers le même jour.'); return }
                        }
                        setError(null)
                        setReportSelection((s) => {
                          const next = { ...s }
                          if (target) next[l.programme_ligne_id!] = target
                          else delete next[l.programme_ligne_id!]
                          return next
                        })
                      }}
                      className="w-full rounded-xl border border-royal-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Ne pas reporter</option>
                      {datesReportables.map((d) => <option key={d.format('YYYY-MM-DD')} value={d.format('YYYY-MM-DD')}>{d.format('dddd D MMMM')}</option>)}
                    </select>
                    {reportSelection[l.programme_ligne_id!] && <p className="mt-1 text-[11px] text-royal-700">Cette visite apparaîtra à part dans les visites du {reportSelection[l.programme_ligne_id!] ? datesReportables.find((d) => d.format('YYYY-MM-DD') === reportSelection[l.programme_ligne_id!])?.format('dddd D MMMM') : ''}. Aucun motif n'est nécessaire pour ce report.</p>}
                  </div>
                )}
                {!motive && !reportSelection[l.programme_ligne_id!] && (
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
        <p className="text-sm font-bold text-ink-800 mb-3">Photo de la fiche papier</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Fiche papier" className="w-full rounded-2xl object-cover max-h-64" />
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow">Reprendre</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-royal-200 py-10 text-royal-600"
          >
            <IconCamera className="h-8 w-8" />
            <span className="text-sm font-semibold">Prendre en photo la fiche papier</span>
            <span className="text-[11px] text-ink-400">Cadrez la fiche entière dans le viseur</span>
          </button>
        )}
      </Card>

      <Button fullWidth loading={cloturing} onClick={handleCloture} disabled={restantesSansMotif.length > 0 || !photo}>
        Valider la clôture
      </Button>
    </div>
  )
}
