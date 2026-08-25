import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Shield } from 'lucide-react'

export default function Register() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'inscription')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logoIcon}>
            <Shield size={32} color="white" />
          </div>
          <h2 style={{ color: '#0f766e', marginBottom: 12 }}>Compte créé !</h2>
          <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, marginBottom: 16 }}>
            Un email de confirmation vous a été envoyé (si activé).
            Votre compte est maintenant <strong>en attente de validation</strong> par un administrateur.
          </p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Une fois approuvé, vous bénéficierez de <strong>30 jours gratuits</strong>,
            puis l'abonnement sera de <strong>2 500 FCFA / mois</strong>.
          </p>
          <button style={styles.button} onClick={() => navigate('/login')}>
            Aller à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <Shield size={32} color="white" />
          </div>
          <h1 style={styles.title}>Créer un compte</h1>
          <p style={styles.subtitle}>1 mois gratuit après validation</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          
          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Prénom</label>
              <input name="firstName" value={form.firstName} onChange={handleChange} style={styles.input} required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Nom</label>
              <input name="lastName" value={form.lastName} onChange={handleChange} style={styles.input} required />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} style={styles.input} required />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mot de passe (min. 6 caractères)</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} style={styles.input} required minLength={6} />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p style={styles.footer}>
          Déjà un compte ? <Link to="/login" style={styles.link}>Se connecter</Link>
        </p>
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
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(15, 118, 110, 0.12)',
    textAlign: 'center'
  },
  logo: { textAlign: 'center', marginBottom: 28 },
  logoIcon: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px'
  },
  title: { fontSize: 24, fontWeight: 700, color: '#0f766e' },
  subtitle: { color: '#5eead4', fontSize: 14, marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#134e4a' },
  input: {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #ccfbf1', fontSize: 15
  },
  button: {
    marginTop: 8, padding: '14px', borderRadius: 12,
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    color: 'white', fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer', width: '100%'
  },
  error: {
    background: '#fef2f2', color: '#ef4444',
    padding: '10px 14px', borderRadius: 10, fontSize: 13
  },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 14, color: '#64748b' },
  link: { color: '#0f766e', fontWeight: 600 }
}
