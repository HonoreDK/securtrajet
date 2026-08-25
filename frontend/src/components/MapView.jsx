import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, LayersControl, LayerGroup, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

function createAvatarIcon(letter, color) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};color:white;font-weight:700;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
    ">${letter}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  })
}

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) {
      map.setView([positions[0].lat, positions[0].lng], 15)
    } else {
      const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [positions, map])
  return null
}

export default function MapView({ children, positions = {}, geofences = [], selectedId, onSelect }) {
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
      <FitBounds positions={markers} />

      {geofences.filter(g => g.is_active).map(g => (
        <Circle
          key={g.id}
          center={[g.center_lat, g.center_lng]}
          radius={g.radius_meters}
          pathOptions={{
            color: '#0f766e',
            fillColor: '#14b8a6',
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
          icon={createAvatarIcon(m.letter, m.color)}
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
