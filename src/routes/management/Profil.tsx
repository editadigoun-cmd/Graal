import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Switch'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { IconCheck, IconLock, IconLogout, IconBell } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '@/lib/pushNotifications'

const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', superviseur: 'Superviseur', vm: 'Visiteur médical' }

export default function ManagementProfil() {
  const { profile, session, refreshProfile, signOut } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [equipesSupervisees, setEquipesSupervisees] = useState<string[]>([])
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name)
    setPhone(profile.phone ?? '')
    if (profile.role === 'superviseur') {
      supabase.from('superviseur_equipes').select('equipes(nom)').eq('superviseur_id', profile.id)
        .then(({ data }) => setEquipesSupervisees((data ?? []).map((d: any) => d.equipes?.nom).filter(Boolean)))
    }
    setPushSupported(isPushSupported())
    isSubscribedToPush().then(setPushEnabled)
  }, [profile])

  async function togglePush() {
    if (!profile) return
    setPushBusy(true)
    setPushError('')
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
    } else {
      const res = await subscribeToPush(profile.id)
      if (res.ok) setPushEnabled(true)
      else setPushError(res.error ?? 'Échec de l\'activation.')
    }
    setPushBusy(false)
  }

  async function enregistrerInfos() {
    if (!profile) return
    setSavingInfo(true)
    await supabase.from('profiles').update({ full_name: fullName, phone: phone || null }).eq('id', profile.id)
    await refreshProfile()
    setSavingInfo(false)
    setInfoSaved(true)
    setTimeout(() => setInfoSaved(false), 2000)
  }

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    if (password.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 8 caractères.' })
      return
    }
    if (password !== passwordConfirm) {
      setPasswordMsg({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' })
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSavingPassword(false)
    if (error) setPasswordMsg({ type: 'error', text: error.message })
    else {
      setPasswordMsg({ type: 'success', text: 'Mot de passe mis à jour.' })
      setPassword('')
      setPasswordConfirm('')
    }
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Mon profil</h1>
        <p className="text-sm text-ink-400">Vos informations personnelles et vos accès</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card className="flex flex-col items-center text-center py-7">
            <AvatarUpload size={80} />
            <p className="mt-4 text-base font-bold text-ink-800">{profile.full_name}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <Badge tone="info">{ROLE_LABEL[profile.role] ?? profile.role}</Badge>
              {equipesSupervisees.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}
            </div>
          </Card>

          {pushSupported && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-ink-100 p-2 text-ink-600"><IconBell className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm font-bold text-ink-800">Notifications push</p>
                    <p className="text-[11px] text-ink-400">Alertes même application fermée</p>
                  </div>
                </div>
                <Switch checked={pushEnabled} onChange={togglePush} loading={pushBusy} label="Notifications push" />
              </div>
              {pushError && <p className="mt-2 text-[11px] text-red-500">{pushError}</p>}
            </Card>
          )}

          <Button variant="secondary" fullWidth icon={<IconLogout className="h-4 w-4" />} onClick={signOut}>Se déconnecter</Button>
        </div>

        <div className="space-y-6">
          <Card>
            <p className="text-sm font-bold text-ink-800 mb-4">Informations personnelles</p>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Nom complet</label>
                <input
                  value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Téléphone</label>
                <input
                  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 …"
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Email</label>
                <input disabled value={session?.user.email ?? ''} className="w-full rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5 text-sm text-ink-400" />
              </div>
            </div>
            <Button className="mt-4" size="sm" loading={savingInfo} variant={infoSaved ? 'success' : 'primary'} icon={<IconCheck className="h-4 w-4" />} onClick={enregistrerInfos}>
              {infoSaved ? 'Enregistré' : 'Enregistrer'}
            </Button>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <IconLock className="h-4 w-4 text-ink-400" />
              <p className="text-sm font-bold text-ink-800">Changer le mot de passe</p>
            </div>
            <form onSubmit={changerMotDePasse} className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Nouveau mot de passe</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Confirmer</label>
                <input
                  type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              {passwordMsg && (
                <p className={`sm:col-span-2 xl:col-span-3 text-xs rounded-xl px-3 py-2 ${passwordMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {passwordMsg.text}
                </p>
              )}
              <div className="sm:col-span-2 xl:col-span-3">
                <Button type="submit" size="sm" loading={savingPassword}>Mettre à jour le mot de passe</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
