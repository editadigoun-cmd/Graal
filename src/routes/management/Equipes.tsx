import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconCheckCircle, IconSearch, IconSend, IconLock, IconX } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']
type SuperviseurEquipe = Database['public']['Tables']['superviseur_equipes']['Row']

const ROLE_LABEL: Record<Role, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }
const ROLE_TONE: Record<Role, 'info' | 'success' | 'warning'> = { vm: 'info', superviseur: 'success', admin: 'warning' }
const EMPTY_FORM = { email: '', full_name: '', role: 'vm' as Role, secteur: 'A' as 'A' | 'B', equipe_id: '' }

export default function ManagementEquipes() {
  const { session, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [superviseurEquipes, setSuperviseurEquipes] = useState<SuperviseurEquipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [creationMsg, setCreationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [equipeFilter, setEquipeFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null)
  const [editEmailValue, setEditEmailValue] = useState('')
  const [memberEditing, setMemberEditing] = useState<Profile | null>(null)
  const [memberForm, setMemberForm] = useState({ full_name: '', role: 'vm' as Role, equipe_id: '', secteur: 'A' as 'A' | 'B' })
  const [savingMember, setSavingMember] = useState(false)

  async function load() {
    const [{ data: eq }, { data: pr }, { data: se }] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('superviseur_equipes').select('*')
    ])
    setEquipes(eq ?? [])
    setProfiles(pr ?? [])
    setSuperviseurEquipes(se ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function assignerEquipe(superviseurId: string, equipeId: string) {
    if (!equipeId) return
    const { error } = await supabase.from('superviseur_equipes').insert({ superviseur_id: superviseurId, equipe_id: equipeId })
    if (error) setNotice({ type: 'error', text: error.message }); else load()
  }
  async function retirerEquipe(superviseurId: string, equipeId: string) {
    const { error } = await supabase.from('superviseur_equipes').delete().eq('superviseur_id', superviseurId).eq('equipe_id', equipeId)
    if (error) setNotice({ type: 'error', text: error.message }); else load()
  }
  async function changerEquipe(profileId: string, equipeId: string) {
    const { error } = await supabase.from('profiles').update({ equipe_id: equipeId || null }).eq('id', profileId)
    if (error) setNotice({ type: 'error', text: error.message }); else load()
  }
  async function changerSecteur(profileId: string, secteur: string) {
    const { error } = await supabase.from('profiles').update({ secteur: (secteur || null) as 'A' | 'B' | null }).eq('id', profileId)
    if (error) setNotice({ type: 'error', text: error.message }); else load()
  }
  function ouvrirModification(p: Profile) {
    setMemberEditing(p)
    setMemberForm({ full_name: p.full_name, role: p.role, equipe_id: p.equipe_id ?? '', secteur: (p.secteur ?? 'A') as 'A' | 'B' })
  }
  async function enregistrerModification(e: React.FormEvent) {
    e.preventDefault()
    if (!memberEditing || !isAdmin) return
    const full_name = memberForm.full_name.trim()
    if (!full_name) { setNotice({ type: 'error', text: 'Le nom est obligatoire.' }); return }
    if (memberForm.role === 'vm' && !memberForm.equipe_id) { setNotice({ type: 'error', text: 'Sélectionnez une équipe pour ce VM.' }); return }
    setSavingMember(true); setNotice(null)
    const payload = {
      full_name,
      role: memberForm.role,
      equipe_id: memberForm.role === 'vm' ? memberForm.equipe_id : null,
      secteur: memberForm.role === 'vm' ? memberForm.secteur : null
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', memberEditing.id)
    if (error) {
      setNotice({ type: 'error', text: error.message })
      setSavingMember(false)
      return
    }
    if (memberEditing.role === 'superviseur' && memberForm.role !== 'superviseur') {
      const { error: removeError } = await supabase.from('superviseur_equipes').delete().eq('superviseur_id', memberEditing.id)
      if (removeError) setNotice({ type: 'error', text: removeError.message })
    }
    setSavingMember(false)
    setMemberEditing(null)
    setNotice({ type: 'success', text: 'Les informations du membre ont été mises à jour.' })
    await load()
  }
  async function toggleActif(p: Profile) {
    setRowBusy(p.id); setNotice(null)
    const { error } = await supabase.from('profiles').update({ actif: !p.actif }).eq('id', p.id)
    setRowBusy(null)
    if (error) setNotice({ type: 'error', text: error.message }); else { setNotice({ type: 'success', text: p.actif ? `${p.full_name} a été désactivé(e).` : `${p.full_name} a été réactivé(e).` }); load() }
  }
  async function renvoyerInvitation(p: Profile) {
    if (!p.email) return
    setRowBusy(p.id); setNotice(null)
    const { data: sess } = await supabase.auth.getSession(); const token = sess.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: p.email, resend: true }) })
      const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setNotice({ type: 'success', text: `Invitation renvoyée à ${p.email}.` })
    } catch (err) { setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' }) } finally { setRowBusy(null) }
  }
  async function modifierEmail(id: string) {
    const email = editEmailValue.trim(); if (!email) return
    setRowBusy(id); setNotice(null)
    const { data: sess } = await supabase.auth.getSession(); const token = sess.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, email }) })
      const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setNotice({ type: 'success', text: `Email mis à jour (${email}), invitation renvoyée.` }); setEditingEmailId(null); load()
    } catch (err) { setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' }) } finally { setRowBusy(null) }
  }
  async function supprimerDefinitivement(p: Profile) {
    if (!window.confirm(`Supprimer définitivement le compte de ${p.full_name} ?\n\nCette action est irréversible.`)) return
    setRowBusy(p.id); setNotice(null)
    const { data: sess } = await supabase.auth.getSession(); const token = sess.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: p.id }) })
      const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setNotice({ type: 'success', text: `${p.full_name} a été supprimé(e) définitivement.` }); load()
    } catch (err) { setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' }) } finally { setRowBusy(null) }
  }
  function fermerModal() { setModalOpen(false); setForm(EMPTY_FORM); setCreationMsg(null) }
  async function creerCompte(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setCreationMsg(null)
    const { data: session } = await supabase.auth.getSession(); const token = session.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: form.email, full_name: form.full_name, role: form.role, secteur: form.role === 'vm' ? form.secteur : null, equipe_id: form.role === 'vm' ? form.equipe_id || null : null }) })
      const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Erreur inconnue')
      setCreationMsg({ type: 'success', text: `Invitation envoyée à ${body.email}.` }); setForm(EMPTY_FORM); load()
    } catch (err) { setCreationMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erreur inconnue' }) } finally { setCreating(false) }
  }

  const equipeNomById = useMemo(() => Object.fromEntries(equipes.map((e) => [e.id, e.nom])), [equipes])
  const mesEquipeIds = useMemo(() => profile ? superviseurEquipes.filter((se) => se.superviseur_id === profile.id).map((se) => se.equipe_id) : [], [superviseurEquipes, profile])
  const equipesVisibles = isAdmin ? equipes : equipes.filter((e) => mesEquipeIds.includes(e.id))
  const profilesVisibles = isAdmin ? profiles : profiles.filter((p) => p.role === 'vm' && p.equipe_id && mesEquipeIds.includes(p.equipe_id))
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profilesVisibles.filter((p) => {
      if (equipeFilter === '__none__' && p.equipe_id) return false
      if (equipeFilter && equipeFilter !== '__none__' && p.equipe_id !== equipeFilter) return false
      if (roleFilter && p.role !== roleFilter) return false
      return !q || p.full_name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
    })
  }, [profilesVisibles, search, equipeFilter, roleFilter])
  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  const totalVm = profilesVisibles.filter((p) => p.role === 'vm').length
  const totalSuperviseurs = profilesVisibles.filter((p) => p.role === 'superviseur').length

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Organisation</p><h1 className="provisit-page-title mt-1">Équipes & visiteurs médicaux</h1><p className="text-sm text-ink-400">{isAdmin ? "Gestion des comptes et rattachements d'équipe" : 'Les visiteurs médicaux de vos équipes'}</p></div>
        {isAdmin && <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>Ajouter un membre</Button>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Équipes" value={equipesVisibles.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Visiteurs médicaux" value={totalVm} tone="emerald" icon={<IconUsers className="h-4 w-4" />} />
        {isAdmin && <StatCard label="Superviseurs" value={totalSuperviseurs} tone="flame" icon={<IconCheckCircle className="h-4 w-4" />} />}
      </div>
      <Card className="flex flex-col gap-3 border border-ink-100 bg-white/95 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1"><IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un nom ou un email…" className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" /></div>
        <select value={equipeFilter} onChange={(e) => setEquipeFilter(e.target.value)} className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm"><option value="">{isAdmin ? 'Toutes les équipes' : 'Mes équipes'}</option>{isAdmin && <option value="__none__">Sans équipe</option>}{equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>
        {isAdmin && <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')} className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm"><option value="">Tous les rôles</option>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}
      </Card>
      {notice && <p className={`text-xs rounded-xl px-3.5 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>}

      <Card className="overflow-hidden border border-ink-100 bg-white p-0 shadow-sm">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500"><th className="px-4 py-3 text-left">Utilisateur</th><th className="px-4 py-3 text-left">Rôle</th><th className="px-4 py-3 text-left">Équipe</th><th className="px-4 py-3 text-left">Secteur</th><th className="px-4 py-3 text-left">Statut</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-ink-100">
            {filtered.map((p) => <tr key={p.id}><td className="px-4 py-3"><UserCell p={p} isAdmin={isAdmin} editingEmailId={editingEmailId} editEmailValue={editEmailValue} setEditingEmailId={setEditingEmailId} setEditEmailValue={setEditEmailValue} modifierEmail={modifierEmail} rowBusy={rowBusy} /></td><td className="px-4 py-3"><Badge tone={ROLE_TONE[p.role]}>{ROLE_LABEL[p.role]}</Badge></td><td className="px-4 py-3">{p.role === 'vm' ? (isAdmin ? <select value={p.equipe_id ?? ''} onChange={(e) => changerEquipe(p.id, e.target.value)} className="rounded-lg border border-ink-200 px-2 py-1 text-xs"><option value="">Sans équipe</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select> : <span className="text-xs">{p.equipe_id ? equipeNomById[p.equipe_id] ?? '—' : '—'}</span>) : <SupervisorTeams p={p} isAdmin={isAdmin} equipes={equipes} superviseurEquipes={superviseurEquipes} equipeNomById={equipeNomById} assignerEquipe={assignerEquipe} retirerEquipe={retirerEquipe} />}</td><td className="px-4 py-3">{p.role === 'vm' ? (isAdmin ? <select value={p.secteur ?? ''} onChange={(e) => changerSecteur(p.id, e.target.value)} className="rounded-lg border border-ink-200 px-2 py-1 text-xs"><option value="A">Secteur A</option><option value="B">Secteur B</option></select> : `Secteur ${p.secteur ?? '—'}`) : '—'}</td><td className="px-4 py-3"><Badge tone={p.actif ? 'success' : 'neutral'}>{p.actif ? 'Actif' : 'Inactif'}</Badge></td><td className="px-4 py-3 text-right">{isAdmin && <div className="flex items-center justify-end gap-1"><button onClick={() => ouvrirModification(p)} className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-royal-700 bg-royal-50 hover:bg-royal-100">Modifier</button><Actions p={p} busy={rowBusy === p.id} isSelf={p.id === session?.user.id} renvoyerInvitation={renvoyerInvitation} toggleActif={toggleActif} supprimerDefinitivement={supprimerDefinitivement} /></div>}</td></tr>)}
          </tbody></table>
        </div>
        <div className="lg:hidden divide-y divide-ink-100">{filtered.map((p) => <div key={p.id} className="p-4 space-y-3"><div className="flex items-start justify-between gap-3"><UserCell p={p} isAdmin={isAdmin} editingEmailId={editingEmailId} editEmailValue={editEmailValue} setEditingEmailId={setEditingEmailId} setEditEmailValue={setEditEmailValue} modifierEmail={modifierEmail} rowBusy={rowBusy} /><Badge tone={ROLE_TONE[p.role]}>{ROLE_LABEL[p.role]}</Badge></div>{p.role === 'vm' ? <div className="grid grid-cols-2 gap-2">{isAdmin ? <select value={p.equipe_id ?? ''} onChange={(e) => changerEquipe(p.id, e.target.value)} className="rounded-xl border border-ink-200 px-3 py-2 text-xs"><option value="">Sans équipe</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select> : <div className="rounded-xl bg-ink-50 px-3 py-2 text-xs">{p.equipe_id ? equipeNomById[p.equipe_id] ?? 'Sans équipe' : 'Sans équipe'}</div>}{isAdmin ? <select value={p.secteur ?? ''} onChange={(e) => changerSecteur(p.id, e.target.value)} className="rounded-xl border border-ink-200 px-3 py-2 text-xs"><option value="A">Secteur A</option><option value="B">Secteur B</option></select> : <div className="rounded-xl bg-ink-50 px-3 py-2 text-xs">Secteur {p.secteur ?? '—'}</div>}</div> : <SupervisorTeams p={p} isAdmin={isAdmin} equipes={equipes} superviseurEquipes={superviseurEquipes} equipeNomById={equipeNomById} assignerEquipe={assignerEquipe} retirerEquipe={retirerEquipe} />}{isAdmin && <div className="flex items-center justify-between"><Badge tone={p.actif ? 'success' : 'neutral'}>{p.actif ? 'Actif' : 'Inactif'}</Badge><div className="flex items-center gap-2"><button onClick={() => ouvrirModification(p)} className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-royal-700 bg-royal-50">Modifier</button><Actions p={p} busy={rowBusy === p.id} isSelf={p.id === session?.user.id} renvoyerInvitation={renvoyerInvitation} toggleActif={toggleActif} supprimerDefinitivement={supprimerDefinitivement} /></div></div>}</div>)}{filtered.length === 0 && <p className="px-4 py-8 text-center text-xs text-ink-400">Aucun utilisateur ne correspond aux filtres.</p>}</div>
      </Card>

      <Modal open={modalOpen} onClose={fermerModal} title="Ajouter un membre" description="Une invitation par email sera envoyée pour définir le mot de passe."><form onSubmit={creerCompte} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="field" /></Field><Field label="Nom complet"><input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="field" /></Field><Field label="Rôle"><select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className="field">{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>{form.role === 'vm' && <Field label="Secteur"><select value={form.secteur} onChange={(e) => setForm((f) => ({ ...f, secteur: e.target.value as 'A' | 'B' }))} className="field"><option value="A">Secteur A</option><option value="B">Secteur B</option></select></Field>}{form.role === 'vm' && <div className="sm:col-span-2"><Field label="Équipe"><select required value={form.equipe_id} onChange={(e) => setForm((f) => ({ ...f, equipe_id: e.target.value }))} className="field"><option value="">Sélectionner une équipe…</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></Field></div>}</div>{creationMsg && <p className={`text-xs rounded-xl px-3 py-2.5 ${creationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{creationMsg.text}</p>}<div className="flex items-center gap-3"><Button type="submit" loading={creating}>Envoyer l'invitation</Button><Button type="button" variant="ghost" onClick={fermerModal}>Annuler</Button></div></form><Modal open={!!memberEditing} onClose={() => setMemberEditing(null)} title="Modifier un membre" description="Modifiez le rattachement et les informations du compte.">
        <form onSubmit={enregistrerModification} className="space-y-4">
          <Field label="Nom complet"><input required value={memberForm.full_name} onChange={e => setMemberForm(f => ({ ...f, full_name: e.target.value }))} className="field" /></Field>
          <Field label="Fonction"><select value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value as Role, equipe_id: e.target.value === 'vm' ? f.equipe_id : '' }))} className="field"><option value="vm">Visiteur médical</option><option value="superviseur">Superviseur</option></select></Field>
          {memberForm.role === 'vm' && <>
            <Field label="Équipe"><select required value={memberForm.equipe_id} onChange={e => setMemberForm(f => ({ ...f, equipe_id: e.target.value }))} className="field"><option value="">Sélectionner une équipe…</option>{equipes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></Field>
            <Field label="Secteur"><select value={memberForm.secteur} onChange={e => setMemberForm(f => ({ ...f, secteur: e.target.value as 'A' | 'B' }))} className="field"><option value="A">Secteur A</option><option value="B">Secteur B</option></select></Field>
          </>}
          {memberForm.role === 'superviseur' && <p className="rounded-xl bg-royal-50 px-3 py-2.5 text-xs text-royal-700">Après l'enregistrement, attribuez les équipes du superviseur directement dans la colonne « Équipe ».</p>}
          <div className="flex gap-2"><Button type="submit" loading={savingMember}>Enregistrer</Button><Button type="button" variant="ghost" onClick={() => setMemberEditing(null)}>Annuler</Button></div>
        </form>
      </Modal>
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>{children}</div> }
function UserCell({ p, isAdmin, editingEmailId, editEmailValue, setEditingEmailId, setEditEmailValue, modifierEmail, rowBusy }: any) { return <div className="flex items-center gap-3 min-w-0"><Avatar name={p.full_name} url={p.avatar_url} size={32} /><div className="min-w-0"><p className="text-xs font-semibold text-ink-800 truncate">{p.full_name}</p>{isAdmin && editingEmailId === p.id ? <div className="flex items-center gap-1"><input autoFocus value={editEmailValue} onChange={(e) => setEditEmailValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') modifierEmail(p.id); if (e.key === 'Escape') setEditingEmailId(null) }} className="w-44 rounded-lg border border-royal-300 px-1.5 py-0.5 text-[11px]" /><button onClick={() => modifierEmail(p.id)} disabled={rowBusy === p.id} className="text-emerald-600"><IconCheckCircle className="h-3 w-3" /></button><button onClick={() => setEditingEmailId(null)} className="text-ink-400"><IconX className="h-3 w-3" /></button></div> : <p onClick={isAdmin ? () => { setEditingEmailId(p.id); setEditEmailValue(p.email ?? '') } : undefined} className={`text-[11px] text-ink-400 truncate ${isAdmin ? 'cursor-pointer hover:text-royal-600' : ''}`}>{p.email}</p>}</div></div> }
function SupervisorTeams({ p, isAdmin, equipes, superviseurEquipes, equipeNomById, assignerEquipe, retirerEquipe }: any) { const items = superviseurEquipes.filter((se: any) => se.superviseur_id === p.id); return <div className="flex flex-wrap items-center gap-1.5">{items.map((se: any) => isAdmin ? <button key={se.equipe_id} onClick={() => retirerEquipe(p.id, se.equipe_id)} className="inline-flex items-center gap-1 rounded-full bg-royal-50 px-2 py-0.5 text-[10px] font-semibold text-royal-700">{equipeNomById[se.equipe_id]} <IconX className="h-2.5 w-2.5" /></button> : <span key={se.equipe_id} className="rounded-full bg-royal-50 px-2 py-0.5 text-[10px] font-semibold text-royal-700">{equipeNomById[se.equipe_id]}</span>)}{isAdmin && <select value="" onChange={(e) => assignerEquipe(p.id, e.target.value)} className="rounded-lg border border-ink-200 px-1.5 py-0.5 text-[10px]"><option value="">+ équipe…</option>{equipes.filter((e: any) => !items.some((se: any) => se.equipe_id === e.id)).map((e: any) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}{!items.length && <span className="text-xs text-ink-400">—</span>}</div> }
function Actions({ p, busy, isSelf, renvoyerInvitation, toggleActif, supprimerDefinitivement }: any) { return <div className="flex items-center gap-2"><button onClick={() => renvoyerInvitation(p)} disabled={busy} title="Renvoyer l'invitation" className="rounded-full p-2 bg-royal-50 text-royal-600 disabled:opacity-40"><IconSend className="h-3.5 w-3.5" /></button><button onClick={() => toggleActif(p)} disabled={busy || isSelf} title="Activer / désactiver" className={`rounded-full p-2 ${p.actif ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} disabled:opacity-40`}>{p.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}</button><button onClick={() => supprimerDefinitivement(p)} disabled={busy || isSelf} title="Supprimer" className="rounded-full p-2 bg-ink-100 text-ink-500 hover:text-red-600 disabled:opacity-40"><IconX className="h-3.5 w-3.5" /></button></div> }
