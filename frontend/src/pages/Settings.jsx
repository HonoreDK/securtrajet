import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { uploadAvatar, fileExt } from '../lib/avatar'
import Avatar from '../components/Avatar'
import { ArrowLeft, Shield, LogOut, Camera } from 'lucide-react'

export default function Settings() {
  const { user, profile, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAvatar(file, `${user.id}/parent.${fileExt(file)}`)
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      if (error) throw error
      await refreshProfile()
    } catch (err) {
      alert(err.message || "Impossible de mettre à jour la photo, réessayez.")
    } finally {
      setUploading(false)
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <label style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}>
              <Avatar
                src={profile?.avatar_url}
                letter={profile?.first_name?.charAt(0).toUpperCase() || '?'}
                size={64}
                fontSize={24}
                style={{ opacity: uploading ? 0.5 : 1 }}
              />
              <span style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 24, height: 24, borderRadius: '50%', background: '#0f766e',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid white'
              }}>
                <Camera size={13} />
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} color="#0f766e" /> Mon compte
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {uploading ? 'Mise à jour de la photo…' : 'Cliquez sur la photo pour la changer'}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 14, marginBottom: 6 }}><strong>Nom :</strong> {profile?.first_name} {profile?.last_name}</p>
          <p style={{ fontSize: 14, marginBottom: 6 }}><strong>Email :</strong> {user?.email}</p>
          <p style={{ fontSize: 14 }}><strong>Rôle :</strong> {profile?.role === 'admin' ? 'Administrateur' : 'Parent'}</p>
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
