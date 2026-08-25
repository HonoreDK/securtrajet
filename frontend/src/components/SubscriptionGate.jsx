import { useAuth } from '../context/AuthContext'
import PaymentPanel from './PaymentPanel'
import { Shield, Clock, CreditCard, AlertTriangle } from 'lucide-react'

export default function SubscriptionGate({ children }) {
  const { profile, subscription, activateSubscription, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Chargement...
      </div>
    )
  }

  // En attente d'approbation admin
  if (profile && !profile.is_approved && profile.role !== 'admin') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <AlertTriangle size={48} color="#f59e0b" />
          <h2 style={styles.title}>Compte en attente de validation</h2>
          <p style={styles.text}>
            Votre compte a été créé avec succès. Un administrateur doit encore valider votre compte
            avant que vous puissiez utiliser SecurTrajet.
          </p>
          <p style={styles.sub}>
            Vous recevrez une notification une fois votre compte approuvé.
            (Période d'essai de 30 jours offerte après validation)
          </p>
        </div>
      </div>
    )
  }

  // Abonnement expiré
  if (subscription && !subscription.hasAccess) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <CreditCard size={48} color="#0f766e" />
          <h2 style={styles.title}>Abonnement requis</h2>
          <p style={styles.text}>
            Votre période d'essai gratuite de 1 mois est terminée.
            Pour continuer à protéger vos enfants, activez l'abonnement.
          </p>
          <div style={styles.priceBox}>
            <span style={styles.price}>2 500</span>
            <span style={styles.currency}>FCFA / mois</span>
          </div>
          <p style={styles.sub}>
            Accès illimité : suivi GPS, alertes, géofencing, historique...
          </p>
          <PaymentPanel onSuccess={activateSubscription} />
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            Paiement sécurisé • Annulation possible à tout moment
          </p>
        </div>
      </div>
    )
  }

  // Accès OK → afficher l'app + bandeau trial si besoin
  return (
    <>
      {subscription?.status === 'trial' && subscription.trialDaysLeft !== null && (
        <div style={styles.trialBanner}>
          <Clock size={16} />
          <span>
            Période d'essai : <strong>{subscription.trialDaysLeft} jour{subscription.trialDaysLeft > 1 ? 's' : ''}</strong> restant{subscription.trialDaysLeft > 1 ? 's' : ''}
          </span>
        </div>
      )}
      {children}
    </>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
    padding: 20
  },
  card: {
    background: 'white',
    borderRadius: 24,
    padding: 40,
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(15, 118, 110, 0.12)'
  },
  title: { fontSize: 22, fontWeight: 700, color: '#0f766e', margin: '16px 0 12px' },
  text: { fontSize: 15, color: '#334155', lineHeight: 1.5 },
  sub: { fontSize: 13, color: '#64748b', marginTop: 12 },
  priceBox: { margin: '24px 0', padding: '16px', background: '#f0fdfa', borderRadius: 16 },
  price: { fontSize: 36, fontWeight: 800, color: '#0f766e' },
  currency: { display: 'block', fontSize: 14, color: '#5eead4', marginTop: 4 },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    color: 'white',
    fontWeight: 600,
    fontSize: 15,
    border: 'none',
    cursor: 'pointer'
  },
  trialBanner: {
    background: '#0f766e',
    color: 'white',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 500
  }
}
