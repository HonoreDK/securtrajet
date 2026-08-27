import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Check, Shield, User } from 'lucide-react'

export default function Admin() {
  const { profile, approveUser, adminUpdateUser } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      navigate('/')
      return
    }
    loadUsers()
  }, [profile])

  const loadUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setUsers(data || [])
    setLoading(false)
  }

  const handleApprove = async (id) => {
    try {
      await approveUser(id)
      await loadUsers()
      alert('Utilisateur approuvé – période d\'essai de 30 jours activée')
    } catch (e) {
      alert(e.message)
    }
  }

  const startEdit = (u) => {
    setEditUser(u)
    setForm({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      phone: u.phone || '',
      subscription_status: u.subscription_status
    })
  }

  const saveEdit = async () => {
    try {
      await adminUpdateUser(editUser.id, form)
      setEditUser(null)
      await loadUsers()
      alert('Informations mises à jour')
    } catch (e) {
      alert(e.message)
    }
  }

  if (!profile || profile.role !== 'admin') return null

  return (
    <div style={{ minHeight: '100vh', background: '#eff6ff' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', background: 'white', borderBottom: '1px solid #dbeafe'
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#1d4ed8' }}>
          <ArrowLeft size={22} />
        </button>
        <Shield size={20} color="#1d4ed8" />
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Administration</h2>
      </header>

      <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
        <h3 style={{ marginBottom: 16 }}>Utilisateurs ({users.length})</h3>

        {loading ? <p>Chargement...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {users.map(u => (
              <div key={u.id} style={{
                background: 'white', borderRadius: 14, padding: 16,
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: '0 2px 10px rgba(29, 78, 216,0.06)'
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: '#1d4ed8',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <User size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {u.first_name} {u.last_name}
                    {u.role === 'admin' && <span style={{ marginLeft: 8, fontSize: 11, background: '#1d4ed8', color: 'white', padding: '2px 8px', borderRadius: 8 }}>ADMIN</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{u.email}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Statut : <strong>{u.subscription_status}</strong>
                    {!u.is_approved && <span style={{ color: '#f59e0b', marginLeft: 8 }}>• En attente</span>}
                    {u.is_approved && <span style={{ color: '#10b981', marginLeft: 8 }}>• Approuvé</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!u.is_approved && u.role !== 'admin' && (
                    <button
                      onClick={() => handleApprove(u.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '8px 12px', borderRadius: 8, background: '#10b981',
                        color: 'white', fontSize: 12, fontWeight: 600, border: 'none'
                      }}
                    >
                      <Check size={14} /> Approuver
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(u)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, background: '#eff6ff',
                      color: '#1d4ed8', fontSize: 12, fontWeight: 600, border: 'none'
                    }}
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal édition */}
      {editUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }} onClick={() => setEditUser(null)}>
          <div style={{
            background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 400
          }} onClick={e => e.stopPropagation()}>
            <h3>Modifier {editUser.email}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <input
                placeholder="Prénom"
                value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })}
                style={inputStyle}
              />
              <input
                placeholder="Nom"
                value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })}
                style={inputStyle}
              />
              <input
                placeholder="Téléphone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                style={inputStyle}
              />
              <select
                value={form.subscription_status}
                onChange={e => setForm({ ...form, subscription_status: e.target.value })}
                style={inputStyle}
              >
                <option value="pending_approval">pending_approval</option>
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="expired">expired</option>
              </select>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditUser(null)} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155' }}>Annuler</button>
                <button onClick={saveEdit} style={{ ...btnStyle, background: '#1d4ed8', color: 'white' }}>Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  padding: '12px 14px', borderRadius: 10, border: '1.5px solid #dbeafe', fontSize: 14
}
const btnStyle = {
  flex: 1, padding: '12px', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer'
}
