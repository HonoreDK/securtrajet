import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MapView from '../components/MapView'
import Avatar from '../components/Avatar'
import { ArrowLeft, Battery, Wifi, WifiOff, Clock } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function ChildDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [child, setChild] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      const { data: c } = await supabase.from('children').select('*').eq('id', id).eq('parent_id', user.id).single()
      if (cancelled) return
      if (!c) {
        navigate('/')
        return
      }
      setChild(c)
      const { data: h } = await supabase
        .from('positions')
        .select('*')
        .eq('child_id', id)
        .order('recorded_at', { ascending: false })
        .limit(30)
      if (!cancelled) setHistory(h || [])
    }
    load()
    return () => { cancelled = true }
  }, [id, user, navigate])

  if (!child) return null

  const position = history[0] || null
  const getStatusColor = (s) => s === 'online' ? '#10b981' : s === 'low_battery' ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ minHeight: '100vh', background: '#f0fdfa' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', background: 'white', borderBottom: '1px solid #ccfbf1'
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#0f766e' }}>
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{child.first_name} {child.last_name}</h2>
      </header>

      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16
        }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Avatar
                src={child.photo_url}
                letter={child.first_name.charAt(0)}
                color={getStatusColor(child.status)}
                size={56}
                fontSize={22}
              />
              <div>
                <h3 style={{ fontSize: 18 }}>{child.first_name}</h3>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>{child.tracker_id}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {child.status === 'online' ? <Wifi size={16} color="#10b981" /> : <WifiOff size={16} color="#ef4444" />}
                <span style={{ fontSize: 13 }}>{child.status === 'online' ? 'En ligne' : 'Hors ligne'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Battery size={16} color={child.battery < 20 ? '#ef4444' : '#10b981'} />
                <span style={{ fontSize: 13 }}>{child.battery}%</span>
              </div>
            </div>
            {position ? (
              <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                Dernière position : {formatDistanceToNow(new Date(position.recorded_at), { addSuffix: true, locale: fr })}
              </p>
            ) : (
              <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
                En attente du traceur
              </p>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 16, padding: 20 }}>
            <h4 style={{ marginBottom: 12, fontSize: 14, color: '#0f766e' }}>Infos</h4>
            <p style={{ fontSize: 13, marginBottom: 6 }}>Date de naissance : {child.birth_date || '—'}</p>
            <p style={{ fontSize: 13 }}>Créé le : {format(new Date(child.created_at), 'dd/MM/yyyy')}</p>
          </div>
        </div>

        <div style={{ height: 320, borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 4px 16px rgba(15,118,110,0.08)' }}>
          <MapView children={[child]} positions={position ? { [child.id]: position } : {}} selectedId={child.id} />
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20 }}>
          <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} /> Historique récent
          </h4>
          {history.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>Aucun historique</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {history.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: i < history.length - 1 ? '1px solid #f0fdfa' : 'none',
                  fontSize: 13
                }}>
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                  </span>
                  <span style={{ color: '#0f766e' }}>
                    {format(new Date(p.recorded_at), 'HH:mm:ss')}
                  </span>
                  <span>{p.battery}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
