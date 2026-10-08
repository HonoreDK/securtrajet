import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, LayersControl, LayerGroup, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

function createAvatarIcon(letter, color, photoUrl) {
  const inner = photoUrl
    ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;" />`
    : letter
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};color:white;font-weight:700;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;border:3px solid white;overflow:hidden;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
    ">${inner}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  })
}

// Pastille bleue « Moi » pour la position du parent
const parentIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,0.25),0 2px 8px rgba(0,0,0,0.3);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
})

function FitBounds({ positions, disabled }) {
  const map = useMap()
  useEffect(() => {
    if (disabled || positions.length === 0) return
    if (positions.length === 1) {
      map.setView([positions[0].lat, positions[0].lng], 15)
    } else {
      const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [positions, disabled, map])
  return null
}

// Cadre l'itinéraire en entier à son apparition, ou quand on change d'enfant (pas à chaque déplacement)
function FitRoute({ route, routeKey }) {
  const map = useMap()
  const routeRef = useRef(route)
  routeRef.current = route
  const hasRoute = Boolean(route)
  useEffect(() => {
    const r = routeRef.current
    if (!r || r.coords.length < 2) return
    map.fitBounds(L.latLngBounds(r.coords), { padding: [50, 50] })
  }, [routeKey, hasRoute, map])
  return null
}

export default function MapView({ children, positions = {}, geofences = [], selectedId, onSelect, parentPosition = null, route = null }) {
  const markers = useMemo(() => {
    return children.map(child => {
      const pos = positions[child.id]
      if (!pos) return null
      const color = child.status === 'online' ? '#10b981' : child.status === 'low_battery' ? '#f59e0b' : '#ef4444'
      return {
        id: child.id,
        name: child.first_name,
        lat: pos.latitude,
        lng: pos.longitude,
        color,
        letter: child.first_name.charAt(0).toUpperCase(),
        photoUrl: child.photo_url,
        battery: child.battery,
        status: child.status
      }
    }).filter(Boolean)
  }, [children, positions])

  const center = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : [5.4781, 10.4172]

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Carte">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <LayerGroup>
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              maxNativeZoom={19}
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              maxNativeZoom={19}
            />
          </LayerGroup>
        </LayersControl.BaseLayer>
      </LayersControl>
      <FitBounds positions={markers} disabled={Boolean(route)} />
      <FitRoute route={route} routeKey={selectedId} />

      {route && route.coords.length > 1 && (
        <>
          <Polyline positions={route.coords} pathOptions={{ color: 'white', weight: 9, opacity: 0.9 }} />
          <Polyline
            positions={route.coords}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.95, dashArray: route.approx ? '8 10' : undefined }}
          />
        </>
      )}

      {parentPosition && (
        <>
          {parentPosition.accuracy > 0 && parentPosition.accuracy < 500 && (
            <Circle
              center={[parentPosition.lat, parentPosition.lng]}
              radius={parentPosition.accuracy}
              pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
            />
          )}
          <Marker position={[parentPosition.lat, parentPosition.lng]} icon={parentIcon} zIndexOffset={1000}>
            <Popup><strong>Ma position</strong></Popup>
          </Marker>
        </>
      )}

      {geofences.filter(g => g.is_active).map(g => (
        <Circle
          key={g.id}
          center={[g.center_lat, g.center_lng]}
          radius={g.radius_meters}
          pathOptions={{
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
            weight: 2
          }}
        >
          <Popup>{g.name}</Popup>
        </Circle>
      ))}

      {markers.map(m => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={createAvatarIcon(m.letter, m.color, m.photoUrl)}
          eventHandlers={{
            click: () => onSelect?.(m.id)
          }}
        >
          <Popup>
            <strong>{m.name}</strong><br />
            {m.status === 'online' ? '🟢 En ligne' : '🔴 Hors ligne'}<br />
            🔋 {m.battery}%
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
