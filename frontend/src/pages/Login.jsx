import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { MapPin, Eye, EyeOff } from 'lucide-react'
import { authErrorMessage } from '../lib/mfa'
import logoApp from '../assets/logo-app.jpg'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(authErrorMessage(err, 'Connexion impossible, réessaie.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <img src={logoApp} alt="SecurTrajet" style={styles.logoIcon} />
          <h1 style={styles.title}>SecurTrajet</h1>
          <p style={styles.subtitle}>Suivi familial sécurisé</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              required
              placeholder="votre@email.com"
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <div style={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...styles.input, width: '100%', paddingRight: 46 }}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                style={styles.eye}
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={styles.footer}>
          Pas encore de compte ? <Link to="/register" style={styles.link}>Créer un compte</Link>
        </p>

        <div style={styles.demo}>
          <MapPin size={14} />
          <span>1 mois gratuit après validation admin • puis 2 500 FCFA/mois</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    padding: 20
  },
  card: {
    background: 'white',
    borderRadius: 24,
    padding: '40px 32px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 20px 60px rgba(29, 78, 216, 0.12)'
  },
  logo: { textAlign: 'center', marginBottom: 32 },
  logoIcon: {
    width: 76, height: 76, borderRadius: 20, objectFit: 'cover',
    boxShadow: '0 4px 16px rgba(29,78,216,0.18)',
    margin: '0 auto 16px', display: 'block'
  },
  title: { fontSize: 28, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 },
  subtitle: { color: '#93c5fd', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#1e3a8a' },
  input: {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #dbeafe', fontSize: 15
  },
  passwordWrap: { position: 'relative' },
  eye: {
    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: '#64748b', padding: 8, cursor: 'pointer', display: 'flex'
  },
  button: {
    marginTop: 8, padding: '14px', borderRadius: 12,
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    color: 'white', fontWeight: 600, fontSize: 15
  },
  error: {
    background: '#fef2f2', color: '#ef4444',
    padding: '10px 14px', borderRadius: 10, fontSize: 13
  },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 14, color: '#64748b' },
  link: { color: '#1d4ed8', fontWeight: 600 },
  demo: {
    marginTop: 20, padding: '10px 14px', background: '#eff6ff',
    borderRadius: 10, fontSize: 12, color: '#1d4ed8',
    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
  }
}
