// Position du parent (géolocalisation du navigateur) et itinéraire jusqu'à l'enfant.
// Itinéraire calculé par le serveur public OSRM (OpenStreetMap), gratuit et sans clé API,
// avec un simple trait droit en secours si le service est injoignable.

import { useCallback, useEffect, useRef, useState } from 'react'

const ROUTE_MIN_INTERVAL_MS = 15000 // au plus un calcul toutes les 15 s
const ROUTE_MIN_MOVE_M = 75         // et seulement si le parent ou l'enfant a bougé d'au moins 75 m
const NEW_DESTINATION_M = 500       // un autre enfant sélectionné recalcule tout de suite
const PARENT_MIN_MOVE_M = 15        // ignore les micro-variations du GPS du parent

// Distance en mètres entre deux points {lat, lng}
export function haversine(a, b) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`
}

export function formatDuration(seconds) {
  const min = Math.max(1, Math.round(seconds / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

// Lien pour lancer la navigation guidée dans Google Maps (téléphone ou ordinateur)
export function googleMapsUrl(from, to) {
  const origin = from ? `&origin=${from.lat},${from.lng}` : ''
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${to.lat},${to.lng}&travelmode=driving`
}

export async function fetchRoute(from, to, signal) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson'
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Itinéraire indisponible (${res.status})`)
  const data = await res.json()
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route) throw new Error('Aucun itinéraire trouvé')
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distance: route.distance,
    duration: route.duration,
    approx: false
  }
}

// Position du parent, mise à jour en continu tant que l'écran est ouvert.
// status : idle | asking | on | denied | error | unsupported
export function useParentLocation() {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [position, setPosition] = useState(null)
  const [status, setStatus] = useState(supported ? 'idle' : 'unsupported')
  const watchId = useRef(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!supported || watchId.current !== null) return
    setStatus('asking')
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
        setStatus('on')
        setPosition((prev) => (prev && haversine(prev, next) < PARENT_MIN_MOVE_M ? prev : next))
      },
      (err) => {
        if (err.code === 1) {
          stop()
          setStatus('denied')
        } else {
          setStatus((s) => (s === 'on' ? s : 'error'))
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
  }, [supported, stop])

  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  return { position, status, retry: start }
}

// Itinéraire en voiture entre deux points {lat, lng}, recalculé quand l'un des deux se déplace.
export function useRoute(from, to, enabled = true) {
  const [route, setRoute] = useState(null) // { coords, distance, duration, approx }
  const [loading, setLoading] = useState(false)
  const last = useRef({ from: null, to: null, at: 0 })

  const fromLat = from?.lat
  const fromLng = from?.lng
  const toLat = to?.lat
  const toLng = to?.lng

  useEffect(() => {
    if (!enabled || fromLat == null || toLat == null) {
      setRoute(null)
      last.current = { from: null, to: null, at: 0 }
      return undefined
    }
    const origin = { lat: fromLat, lng: fromLng }
    const dest = { lat: toLat, lng: toLng }
    const prev = last.current

    if (prev.from) {
      const moved = haversine(prev.from, origin) > ROUTE_MIN_MOVE_M || haversine(prev.to, dest) > ROUTE_MIN_MOVE_M
      if (!moved) {
        setLoading(false)
        return undefined
      }
    }
    const newDestination = prev.to && haversine(prev.to, dest) > NEW_DESTINATION_M
    const delay = prev.from && !newDestination ? Math.max(0, ROUTE_MIN_INTERVAL_MS - (Date.now() - prev.at)) : 0

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await fetchRoute(origin, dest, controller.signal)
        setRoute(result)
        last.current = { from: origin, to: dest, at: Date.now() }
      } catch (err) {
        if (err.name === 'AbortError') return
        // Secours : trait droit, recalculé plus tard
        setRoute({
          coords: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
          distance: haversine(origin, dest),
          duration: null,
          approx: true
        })
        last.current = { from: origin, to: dest, at: Date.now() }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, fromLat, fromLng, toLat, toLng])

  return { route, loading }
}
