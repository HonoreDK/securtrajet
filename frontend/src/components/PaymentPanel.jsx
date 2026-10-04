import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Loader2, Smartphone, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const POLL_MS = 3000
const POLL_MAX_MS = 120000

// Les erreurs "non-2xx" de supabase-js sont génériques : on lit le vrai message renvoyé par la fonction.
async function callPayment(body) {
  const { data, error } = await supabase.functions.invoke('campay-payment', { body })
  if (error) {
    let message
    try { message = (await error.context.json()).error } catch { /* réponse non JSON */ }
    throw new Error(message || 'Le service de paiement est momentanément indisponible.')
  }
  return data
}

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
  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [error, setError] = useState('')
  const [ussd, setUssd] = useState(null)
  const [sandbox, setSandbox] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const handlePay = async (e) => {
    e.preventDefault()
    setError('')
    const digits = phone.replace(/\s/g, '')
    if (!/^6\d{8}$/.test(digits)) {
      setError('Entrez un numéro à 9 chiffres commençant par 6, sans indicatif (ex: 691234567)')
      return
    }
    setStatus('processing')
    setUssd(null)
    try {
      const started = await callPayment({ action: 'collect', phone: digits })
      if (alive.current) {
        setUssd(started.ussd_code || null)
        setSandbox(Boolean(started.sandbox))
      }

      const deadline = Date.now() + POLL_MAX_MS
      while (alive.current && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, POLL_MS))
        if (!alive.current) return
        const result = await callPayment({ action: 'status', reference: started.reference })
        if (result.status === 'SUCCESSFUL') {
          if (alive.current) setStatus('done')
          await onSuccess()
          return
        }
        if (result.status === 'FAILED') {
          throw new Error('Paiement refusé ou annulé sur le téléphone.')
        }
      }
      if (alive.current) {
        throw new Error("Délai dépassé. Si le montant a été débité, ton abonnement sera activé automatiquement : actualise la page dans un instant.")
      }
    } catch (err) {
      if (!alive.current) return
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

  if (status === 'done') {
    return (
      <div style={styles.processing}>
        <CheckCircle2 size={32} color="#10b981" />
        <p style={{ fontWeight: 600, marginTop: 12 }}>Merci pour ton paiement !</p>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          Ton abonnement SecurTrajet est activé pour 30 jours.
        </p>
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div style={styles.processing}>
        <Loader2 size={28} color={p.color} className="spin" />
        <p style={{ fontWeight: 600, marginTop: 12 }}>Validez le paiement sur votre téléphone</p>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          Une demande {p.label} vient d'être envoyée au {phone}. Saisissez votre code secret pour confirmer.
          Cette page se mettra à jour toute seule.
        </p>
        {sandbox && (
          <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>
            Mode test : montant symbolique de 25 FCFA, aucun vrai paiement.
          </p>
        )}
        {ussd && (
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Pas de notification ? Composez : {ussd}
          </p>
        )}
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
