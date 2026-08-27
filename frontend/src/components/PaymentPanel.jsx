import { useState } from 'react'
import { ArrowLeft, Loader2, Smartphone } from 'lucide-react'

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

export default function PaymentPanel({ onSuccess }) {
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
            type="button"
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

const styles = {
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 15,
    border: 'none',
    cursor: 'pointer'
  },
  providerChoice: {
    display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16
  },
  providerBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '14px', borderRadius: 12,
    fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer'
  },
  phoneForm: {
    display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16, textAlign: 'left'
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
    border: '1.5px solid #dbeafe', fontSize: 15
  },
  errorText: { color: '#ef4444', fontSize: 13, margin: 0 },
  processing: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', marginTop: 24, padding: '12px 0'
  }
}
