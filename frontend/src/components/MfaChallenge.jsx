import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../lib/mfa'
import logoApp from '../assets/logo-app.jpg'

// Étape de connexion pour les comptes qui ont activé la double authentification :
// le code à 6 chiffres affiché par Google Authenticator (ou une application équivalente).
export default function MfaChallenge() {
  const { refreshMfa, logout } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const verify = async (value) => {
    setError('')
    setBusy(true)
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError
      const factor = factors?.totp?.[0]
      if (!factor) throw new Error('Aucune application de double authentification trouvée.')
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: value
      })
      if (verifyError) throw verifyError
      await refreshMfa()
    } catch (err) {
      setError(authErrorMessage(err, 'Code incorrect.'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const onChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(value)
    if (value.length === 6 && !busy) verify(value)
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (code.length === 6 && !busy) verify(code)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={logoApp} alt="SecurTrajet" style={styles.logoIcon} />
        <ShieldCheck size={36} color="#1d4ed8" />
        <h2 style={styles.title}>Vérification en deux étapes</h2>
        <p style={styles.text}>
          Ouvre <strong>Google Authenticator</strong> et saisis le code à 6 chiffres affiché pour SecurTrajet.
        </p>

        <form onSubmit={onSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <input
            value={code}
            onChange={onChange}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            autoFocus
            style={styles.input}
          />
          <button type="submit" style={styles.button} disabled={busy || code.length !== 6}>
            {busy ? 'Vérification...' : 'Valider'}
          </button>
        </form>

        <button type="button" style={styles.link} onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: 20
  },
  card: {
    background: 'white', borderRadius: 24, padding: '40px 32px', width: '100%', maxWidth: 400,
    textAlign: 'center', boxShadow: '0 20px 60px rgba(29, 78, 216, 0.12)'
  },
  logoIcon: {
    width: 64, height: 64, borderRadius: 18, objectFit: 'cover',
    margin: '0 auto 16px', display: 'block'
  },
  title: { fontSize: 20, fontWeight: 700, color: '#1d4ed8', margin: '10px 0 8px' },
  text: { fontSize: 14, color: '#334155', lineHeight: 1.5, marginBottom: 20 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  input: {
    padding: '14px 16px', borderRadius: 12, border: '1.5px solid #dbeafe',
    fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: 700
  },
  button: {
    padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', color: 'white', fontWeight: 600, fontSize: 15
  },
  error: { background: '#fef2f2', color: '#ef4444', padding: '10px 14px', borderRadius: 10, fontSize: 13 },
  link: {
    marginTop: 18, background: 'none', border: 'none', color: '#64748b',
    fontSize: 13, textDecoration: 'underline', cursor: 'pointer'
  }
}
