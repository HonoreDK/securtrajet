import { Navigation, MapPinOff, Loader2 } from 'lucide-react'
import { formatDistance, formatDuration, googleMapsUrl } from '../lib/location'

// Résumé de l'itinéraire du parent jusqu'à l'enfant (distance, durée, navigation guidée).
export default function RouteCard({ childName, location, route, loading, childPosition, enabled, onToggle }) {
  const { status, position, retry } = location

  let body
  if (status === 'unsupported') {
    body = <p style={styles.muted}>La localisation n'est pas disponible sur cet appareil.</p>
  } else if (status === 'denied') {
    body = (
      <>
        <p style={styles.warn}>
          Position bloquée : autorise la localisation pour ce site dans les réglages du navigateur, puis réessaie.
        </p>
        <button style={styles.ghostBtn} onClick={retry}>Réessayer</button>
      </>
    )
  } else if (!childPosition) {
    body = <p style={styles.muted}>L'itinéraire s'affichera dès que la position de {childName} sera reçue.</p>
  } else if (!position) {
    body = (
      <p style={styles.muted}>
        <Loader2 size={13} style={{ verticalAlign: -2 }} /> Recherche de ta position…
        {status === 'error' && ' (signal GPS faible, vérifie que la localisation est activée)'}
      </p>
    )
  } else if (!enabled) {
    body = <button style={styles.ghostBtn} onClick={onToggle}>Afficher l'itinéraire</button>
  } else if (!route) {
    body = <p style={styles.muted}><Loader2 size={13} style={{ verticalAlign: -2 }} /> Calcul de l'itinéraire…</p>
  } else {
    body = (
      <>
        <div style={styles.figures}>
          <span style={styles.big}>{formatDistance(route.distance)}</span>
          {route.duration != null && <span style={styles.big}>{formatDuration(route.duration)}</span>}
        </div>
        <p style={styles.muted}>
          {route.approx
            ? 'Trajet à vol d\'oiseau (itinéraire routier indisponible pour le moment).'
            : `En voiture jusqu'à ${childName}${loading ? ' • mise à jour…' : ''}`}
        </p>
        <a
          style={styles.navBtn}
          href={googleMapsUrl(position, { lat: childPosition.latitude, lng: childPosition.longitude })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation size={15} /> Lancer la navigation
        </a>
        <button style={styles.link} onClick={onToggle}>Masquer l'itinéraire</button>
      </>
    )
  }

  return (
    <div style={styles.card}>
      <p style={styles.title}>
        {status === 'denied' ? <MapPinOff size={14} /> : <Navigation size={14} />} Itinéraire vers {childName}
      </p>
      {body}
    </div>
  )
}

const styles = {
  card: { marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  title: { fontSize: 12, fontWeight: 700, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6, margin: 0 },
  figures: { display: 'flex', gap: 16, alignItems: 'baseline' },
  big: { fontSize: 20, fontWeight: 800, color: '#1e3a8a' },
  muted: { fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 },
  warn: { fontSize: 12, color: '#b45309', margin: 0, lineHeight: 1.5 },
  navBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
    background: '#1d4ed8', color: 'white', fontWeight: 600, fontSize: 13, textDecoration: 'none'
  },
  ghostBtn: {
    padding: '8px 12px', borderRadius: 10, border: 'none', background: 'white', color: '#1d4ed8',
    fontWeight: 600, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start'
  },
  link: { background: 'none', border: 'none', color: '#64748b', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }
}
