import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { MapPin, ShieldCheck, Bell, Smartphone, Battery } from 'lucide-react'
import logoApp from '../assets/logo-app.jpg'

const FEATURES = [
  { icon: MapPin, title: 'Suivi GPS en temps réel', text: "Voyez la position de chacun de vos enfants sur une carte, avec vue satellite." },
  { icon: ShieldCheck, title: 'Zones de sécurité', text: "Définissez des zones et recevez une alerte à l'entrée ou la sortie." },
  { icon: Bell, title: 'Alertes instantanées', text: 'Batterie faible, appareil hors-ligne, sortie de zone : informé en direct.' },
  { icon: Smartphone, title: 'Application installable', text: 'Ajoutez SecurTrajet sur votre écran d\'accueil, comme une vraie app.' }
]

export default function Landing() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <img src={logoApp} alt="SecurTrajet" style={styles.brandLogo} />
          <span style={styles.brandName}>SecurTrajet</span>
        </div>
        <div style={styles.headerActions}>
          <Link to="/login" style={styles.loginLink}>Se connecter</Link>
          <Link to="/register" style={styles.ctaBtn}>Créer un compte</Link>
        </div>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroIconWrap}>
          <Battery size={14} color="#1d4ed8" />
          <span>1 mois gratuit, sans engagement</span>
        </div>
        <h1 style={styles.heroTitle}>Gardez leurs trajets à portée de regard</h1>
        <p style={styles.heroSubtitle}>
          SecurTrajet permet aux parents de suivre la position de leurs enfants en temps réel,
          de définir des zones de sécurité et de recevoir des alertes instantanées — depuis leur navigateur.
        </p>
        <div style={styles.heroActions}>
          <Link to="/register" style={styles.primaryBtn}>Commencer gratuitement</Link>
          <Link to="/login" style={styles.secondaryBtn}>J'ai déjà un compte</Link>
        </div>
        <p style={styles.heroNote}>1 mois d'essai offert après validation • puis 2 500 FCFA/mois</p>
      </section>

      <section style={styles.features}>
        {FEATURES.map((f, i) => (
          <div key={i} style={styles.featureCard}>
            <div style={styles.featureIcon}>
              <f.icon size={22} color="#1d4ed8" />
            </div>
            <h3 style={styles.featureTitle}>{f.title}</h3>
            <p style={styles.featureText}>{f.text}</p>
          </div>
        ))}
      </section>

      <footer style={styles.footer}>
        <p>SecurTrajet — Nova Tech Solution SARL</p>
      </footer>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 40%)',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box'
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandLogo: { width: 36, height: 36, borderRadius: 10, objectFit: 'cover' },
  brandName: { fontSize: 18, fontWeight: 700, color: '#1d4ed8' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 16 },
  loginLink: { fontSize: 14, fontWeight: 600, color: '#1e3a8a', textDecoration: 'none' },
  ctaBtn: {
    padding: '9px 18px', borderRadius: 10, background: '#1d4ed8', color: 'white',
    fontSize: 14, fontWeight: 600, textDecoration: 'none'
  },
  hero: {
    maxWidth: 720, width: '100%', margin: '0 auto', padding: '48px 24px 32px',
    textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
  },
  heroIconWrap: {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
    background: '#dbeafe', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 20
  },
  heroTitle: { fontSize: 38, fontWeight: 800, color: '#1e3a8a', lineHeight: 1.15, marginBottom: 16 },
  heroSubtitle: { fontSize: 16, color: '#475569', lineHeight: 1.6, maxWidth: 560, marginBottom: 28 },
  heroActions: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: {
    padding: '14px 26px', borderRadius: 12, background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none',
    boxShadow: '0 8px 24px rgba(29,78,216,0.25)'
  },
  secondaryBtn: {
    padding: '14px 26px', borderRadius: 12, background: 'white', border: '1.5px solid #dbeafe',
    color: '#1d4ed8', fontWeight: 700, fontSize: 15, textDecoration: 'none'
  },
  heroNote: { fontSize: 13, color: '#94a3b8', marginTop: 18 },
  features: {
    maxWidth: 1000, width: '100%', margin: '20px auto 0', padding: '0 24px 60px',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20
  },
  featureCard: {
    background: 'white', borderRadius: 18, padding: 24,
    boxShadow: '0 4px 20px rgba(15,23,42,0.06)'
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12, background: '#eff6ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14
  },
  featureTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 },
  featureText: { fontSize: 13, color: '#64748b', lineHeight: 1.5 },
  footer: {
    textAlign: 'center', padding: '20px 24px', fontSize: 12, color: '#94a3b8',
    borderTop: '1px solid #eff6ff'
  }
}
