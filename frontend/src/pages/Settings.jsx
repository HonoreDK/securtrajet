import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Shield, CreditCard, LogOut } from 'lucide-react'

export default function Settings() {
  const { user, profile, subscription, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0fdfa' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', background: 'white', borderBottom: '1px solid #ccfbf1'
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#0f766e' }}>
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Paramètres</h2>
      </header>

      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Shield size={24} color="#0f766e" />
            <h3>Mon compte</h3>
          </div>
          <p style={{ fontSize: 14, marginBottom: 6 }}><strong>Nom :</strong> {profile?.first_name} {profile?.last_name}</p>
          <p style={{ fontSize: 14, marginBottom: 6 }}><strong>Email :</strong> {user?.email}</p>
          <p style={{ fontSize: 14 }}><strong>Rôle :</strong> {profile?.role === 'admin' ? 'Administrateur' : 'Parent'}</p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <CreditCard size={22} color="#0f766e" />
            <h3>Abonnement</h3>
          </div>
          <p style={{ fontSize: 14, marginBottom: 6 }}>
            Statut : <strong>{subscription?.status}</strong>
          </p>
          {subscription?.status === 'trial' && (
            <p style={{ fontSize: 14, color: '#0f766e' }}>
              Jours restants : <strong>{subscription.trialDaysLeft}</strong>
            </p>
          )}
          {subscription?.status === 'active' && (
            <p style={{ fontSize: 14, color: '#10b981' }}>Abonnement actif – 2 500 FCFA/mois</p>
          )}
          {!subscription?.isApproved && (
            <p style={{ fontSize: 13, color: '#f59e0b', marginTop: 8 }}>
              Compte en attente de validation administrateur
            </p>
          )}
        </div>

        {profile?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin')}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, marginBottom: 12,
              background: '#0f766e', color: 'white', fontWeight: 600, fontSize: 14, border: 'none'
            }}
          >
            Tableau d'administration
          </button>
        )}

        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: '#fef2f2', color: '#ef4444', fontWeight: 600, fontSize: 14,
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}
        >
          <LogOut size={16} /> Déconnexion
        </button>

        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 12, color: '#94a3b8' }}>
          SecurTrajet v2 — Supabase + PWA<br />
          1 mois gratuit → 2 500 FCFA/mois
        </p>
      </div>
    </div>
  )
}
