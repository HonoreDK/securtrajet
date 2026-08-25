import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Shield, MapPin } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <Shield size={32} color="white" />
          </div>
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
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              required
              placeholder="••••••••"
            />
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
    background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
    padding: 20
  },
  card: {
    background: 'white',
    borderRadius: 24,
    padding: '40px 32px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 20px 60px rgba(15, 118, 110, 0.12)'
  },
  logo: { textAlign: 'center', marginBottom: 32 },
  logoIcon: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px'
  },
  title: { fontSize: 28, fontWeight: 700, color: '#0f766e', marginBottom: 4 },
  subtitle: { color: '#5eead4', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#134e4a' },
  input: {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #ccfbf1', fontSize: 15
  },
  button: {
    marginTop: 8, padding: '14px', borderRadius: 12,
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    color: 'white', fontWeight: 600, fontSize: 15
  },
  error: {
    background: '#fef2f2', color: '#ef4444',
    padding: '10px 14px', borderRadius: 10, fontSize: 13
  },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 14, color: '#64748b' },
  link: { color: '#0f766e', fontWeight: 600 },
  demo: {
    marginTop: 20, padding: '10px 14px', background: '#f0fdfa',
    borderRadius: 10, fontSize: 12, color: '#0f766e',
    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
  }
}
