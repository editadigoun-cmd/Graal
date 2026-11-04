import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface PointTrajet {
  id: string
  lat: number
  lng: number
  label: string
  heure: string
  type: 'visite' | 'pharmacie' | 'garde' | 'cloture'
}

const COTONOU: [number, number] = [6.3703, 2.3912]
const COULEUR: Record<PointTrajet['type'], string> = {
  visite: '#1d4ed8',
  pharmacie: '#059669',
  garde: '#8b5cf6',
  cloture: '#f97316'
}

// Carte du trajet du VM sur une journée : un point numéroté par visite (ordre chronologique),
// relié par un tracé, plus la position de clôture si disponible. Leaflet + tuiles OpenStreetMap
// (aucune clé API requise, contrairement à Google Maps).
export function TrajetCarte({ points }: { points: PointTrajet[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    }
    const map = mapRef.current

    map.eachLayer((layer) => map.removeLayer(layer))
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    if (points.length === 0) {
      map.setView(COTONOU, 12)
      return
    }

    const visiteLatLngs = points.filter((p) => p.type !== 'cloture').map((p) => [p.lat, p.lng] as [number, number])

    points.forEach((p, i) => {
      const numero = p.type === 'cloture' ? '' : String(points.filter((q) => q.type !== 'cloture').indexOf(p) + 1)
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${COULEUR[p.type]};color:#fff;width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${numero}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
      L.marker([p.lat, p.lng], { icon }).addTo(map).bindTooltip(`${p.label} — ${p.heure}`)
      void i
    })

    if (visiteLatLngs.length > 1) {
      L.polyline(visiteLatLngs, { color: '#1d4ed8', weight: 3, opacity: 0.55, dashArray: '6 8' }).addTo(map)
    }

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 })
  }, [points])

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null }, [])

  return <div ref={containerRef} className="h-72 w-full rounded-2xl overflow-hidden" />
}
