// Géocodage inverse via Nominatim (OpenStreetMap), gratuit et sans clé API.
// Mis en cache par coordonnées arrondies + espacé d'au moins 1s entre appels
// pour rester dans les limites d'usage raisonnable du service public.

const cache = new Map()
let lastCallAt = 0

export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)

  const wait = Math.max(0, 1100 - (Date.now() - lastCallAt))
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  lastCallAt = Date.now()

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`
    )
    const data = await res.json()
    const label = data?.display_name || null
    cache.set(key, label)
    return label
  } catch {
    return null
  }
}
