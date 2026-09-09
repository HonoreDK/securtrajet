import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet'
import { X, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'

const DEFAULT_CENTER = [5.4781, 10.4172] // Bafoussam, par défaut si aucune position connue

function ClickPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

export default function GeofenceModal({ parentId, children, defaultCenter, geofence, onClose, onSaved }) {
  const isEdit = Boolean(geofence)
  const [name, setName] = useState(geofence?.name || '')
  const [childId, setChildId] = useState(geofence?.child_id || '')
  const [radius, setRadius] = useState(geofence?.radius_meters || 150)
  const [alertOnEnter, setAlertOnEnter] = useState(geofence?.alert_on_enter ?? true)
  const [alertOnExit, setAlertOnExit] = useState(geofence?.alert_on_exit ?? true)
  const [center, setCenter] = useState(
    geofence ? [geofence.center_lat, geofence.center_lng] : null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    if (!center) {
      setError('Clique sur la carte pour placer le centre de la zone.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        parent_id: parentId,
        child_id: childId || null,
        name,
        center_lat: center[0],
        center_lng: center[1],
        radius_meters: radius,
        alert_on_enter: alertOnEnter,
        alert_on_exit: alertOnExit
      }
      const { error: err } = isEdit
        ? await supabase.from('geofences').update(payload).eq('id', geofence.id)
        : await supabase.from('geofences').insert(payload)
      if (err) throw err
      onSaved()
    } catch (err) {
      setError(err.message || "Impossible d'enregistrer la zone.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerIcon}><Shield size={20} color="#1d4ed8" /></div>
            <div>
              <h3 style={styles.title}>{isEdit ? 'Modifier la zone' : 'Nouvelle zone de sécurité'}</h3>
              <p style={styles.subtitle}>Clique sur la carte pour placer le centre de la zone</p>
            </div>
          </div>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div style={styles.mapWrap}>
          <MapContainer center={center || defaultCenter || DEFAULT_CENTER} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickPicker onPick={(lat, lng) => setCenter([lat, lng])} />
            {center && (
              <>
                <Marker position={center} />
                <Circle
                  center={center}
                  radius={radius}
                  pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
                />
              </>
            )}
          </MapContainer>
        </div>

        <form onSubmit={handleSave} style={styles.form}>
          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.field}>
            <label style={styles.label}>Nom de la zone</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex : École, Maison"
              required
              style={styles.input}
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Enfant concerné</label>
            <select value={childId} onChange={e => setChildId(e.target.value)} style={styles.input}>
              <option value="">Tous les enfants</option>
              {children.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Rayon : {radius} m</label>
            <input
              type="range" min="50" max="1000" step="10"
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
            />
          </div>

          <div style={styles.togglesRow}>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={alertOnEnter} onChange={e => setAlertOnEnter(e.target.checked)} />
              Alerter à l'entrée
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={alertOnExit} onChange={e => setAlertOnExit(e.target.checked)} />
              Alerter à la sortie
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" style={{ ...styles.secondaryBtn, flex: 1 }} onClick={onClose}>Annuler</button>
            <button type="submit" disabled={saving} style={{ ...styles.primaryBtn, flex: 1, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Créer la zone')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
  },
  modal: {
    background: 'white', borderRadius: 20, width: '100%', maxWidth: 460,
    maxHeight: '92vh', overflowY: 'auto'
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 20px 0'
  },
  headerLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12, background: '#eff6ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },
  title: { fontSize: 17, fontWeight: 700, color: '#1e3a8a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: { background: '#f8fafc', color: '#64748b', borderRadius: 8, padding: 6, flexShrink: 0, border: 'none', cursor: 'pointer' },
  mapWrap: { height: 220, margin: '16px 20px 0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' },
  form: { display: 'flex', flexDirection: 'column', gap: 14, padding: 20 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: '#1e3a8a' },
  input: {
    padding: '12px 14px', borderRadius: 10, border: '1.5px solid #dbeafe', fontSize: 14, width: '100%',
    boxSizing: 'border-box', background: 'white'
  },
  togglesRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' },
  error: {
    background: '#fef2f2', color: '#ef4444', padding: '10px 14px', borderRadius: 10, fontSize: 13, margin: 0
  },
  primaryBtn: {
    padding: '12px 16px', borderRadius: 10, background: '#1d4ed8',
    color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '12px 16px', borderRadius: 10, background: '#eff6ff',
    color: '#1d4ed8', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer'
  }
}
