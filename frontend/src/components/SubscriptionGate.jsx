import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Shield, Clock, CreditCard, AlertTriangle, ArrowLeft, Loader2, Smartphone } from 'lucide-react'

const PROVIDERS = {
  orange: {
    label: 'Orange Money',
    color: '#FF6600',
    textColor: '#ffffff',
    prefixHint: 'Numéro Orange (ex: 69X XXX XXX)'
  },
  mtn: {
    label: 'MTN Mobile Money',
    color: '#FFCB05',
    textColor: '#1a1a1a',
    prefixHint: 'Numéro MTN (ex: 67X XXX XXX)'
  }
}

function PaymentPanel({ onSuccess }) {
  const [provider, setProvider] = useState(null)
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('idle') // idle | processing | error
  const [error, setError] = useState('')

  const handlePay = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{9}$/.test(phone.replace(/\s/g, ''))) {
      setError('Entrez un numéro à 9 chiffres, sans indicatif (ex: 691234567)')
      return
    }
    setStatus('processing')
    try {
      // TODO production : remplacer par un appel à l'API Orange Money / MTN MoMo
      // (via un backend — les clés marchand ne doivent jamais être exposées côté client)
      await new Promise(resolve => setTimeout(resolve, 1800))
      await onSuccess()
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Le paiement a échoué, réessayez.')
    }
  }

  if (!provider) {
    return (
      <div style={styles.providerChoice}>
        {Object.entries(PROVIDERS).map(([key, p]) => (
          <button
            key={key}
            style={{ ...styles.providerBtn, background: p.color, color: p.textColor }}
            onClick={() => setProvider(key)}
          >
            <Smartphone size={18} /> Payer avec {p.label}
          </button>
        ))}
      </div>
    )
  }

  const p = PROVIDERS[provider]

  if (status === 'processing') {
    return (
      <div style={styles.processing}>
        <Loader2 size={28} color={p.color} className="spin" />
        <p style={{ fontWeight: 600, marginTop: 12 }}>Confirmez la transaction sur votre téléphone…</p>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          Une demande {p.label} a été envoyée au {phone}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handlePay} style={styles.phoneForm}>
      <button
        type="button"
        style={styles.backBtn}
        onClick={() => { setProvider(null); setError('') }}
      >
        <ArrowLeft size={14} /> Changer de moyen de paiement
      </button>
      <div style={{ ...styles.providerTag, background: p.color, color: p.textColor }}>
        <Smartphone size={14} /> {p.label}
      </div>
      <input
        type="tel"
        inputMode="numeric"
        placeholder={p.prefixHint}
        value={phone}
        onChange={e => setPhone(e.target.value)}
        style={styles.phoneInput}
        required
      />
      {error && <p style={styles.errorText}>{error}</p>}
      <button type="submit" style={{ ...styles.button, background: p.color, color: p.textColor }}>
        Payer 2 500 FCFA via {p.label}
      </button>
    </form>
  )
}

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
  },
  providerChoice: {
    display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20
  },
  providerBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '14px', borderRadius: 12,
    fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer'
  },
  phoneForm: {
    display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20, textAlign: 'left'
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b', fontSize: 12, fontWeight: 600,
    border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start'
  },
  providerTag: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start'
  },
  phoneInput: {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #ccfbf1', fontSize: 15
  },
  errorText: { color: '#ef4444', fontSize: 13, margin: 0 },
  processing: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', marginTop: 24, padding: '12px 0'
  }
}
