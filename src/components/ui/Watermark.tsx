import { useEffect, useState } from 'react'
import { nowBenin } from '@/lib/time'

// Filigrane discret (nom + horodatage) affiché en surimpression sur les écrans VM contenant des
// données clients/produits sensibles — n'empêche aucune capture d'écran (technique impossible en
// PWA/web) mais rend une éventuelle fuite traçable jusqu'à son auteur. Non interactif, ignoré des
// lecteurs d'écran.
export function Watermark({ nom }: { nom: string }) {
  const [texte, setTexte] = useState('')

  useEffect(() => {
    const maj = () => setTexte(nom ? `${nom} · ${nowBenin().format('DD/MM/YYYY HH:mm')}` : '')
    maj()
    const id = setInterval(maj, 60000)
    return () => clearInterval(id)
  }, [nom])

  if (!texte) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none">
      <div className="absolute -inset-1/4 flex flex-wrap content-around justify-around -rotate-[28deg] opacity-[0.055]">
        {Array.from({ length: 48 }).map((_, i) => (
          <span key={i} className="whitespace-nowrap px-8 py-6 text-[11px] font-semibold text-ink-900">
            {texte}
          </span>
        ))}
      </div>
    </div>
  )
}
