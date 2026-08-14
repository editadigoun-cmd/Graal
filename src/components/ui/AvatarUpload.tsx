import { useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { IconCamera } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

// Photo de profil éditable : superposée à l'avatar existant (initiales par défaut), bouton
// appareil photo pour choisir un fichier. Stockée dans le bucket public "avatars", un dossier
// par utilisateur (policy storage : chacun n'écrit que dans le sien).
export function AvatarUpload({ size = 72 }: { size?: number }) {
  const { profile, refreshProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (!file.type.startsWith('image/')) { setError('Choisissez un fichier image.'); return }
    setUploading(true)
    setError(null)

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type })
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    setUploading(false)
    if (updateError) { setError(updateError.message); return }
    await refreshProfile()
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!profile) return null

  return (
    <div className="relative inline-block flex-shrink-0">
      <Avatar name={profile.full_name} url={profile.avatar_url} size={size} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Changer la photo de profil"
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-royal-600 text-white shadow-md ring-2 ring-white transition hover:bg-royal-700 disabled:opacity-60"
      >
        {uploading
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          : <IconCamera className="h-3.5 w-3.5" />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {error && <p className="absolute top-full left-1/2 mt-1.5 w-40 -translate-x-1/2 text-center text-[10px] font-medium text-red-500">{error}</p>}
    </div>
  )
}
