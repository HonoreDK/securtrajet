import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MapView from '../components/MapView'
import Avatar from '../components/Avatar'
import { ArrowLeft, Battery, Wifi, WifiOff, Clock, Radio, Check } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function ChildDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [child, setChild] = useState(null)
  const [history, setHistory] = useState([])
  const [imeiInput, setImeiInput] = useState('')
  const [savingImei, setSavingImei] = useState(false)
  const [imeiSaved, setImeiSaved] = useState(false)

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
      setImeiInput(c.qxgps_imei || '')
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

  const saveImei = async () => {
    setSavingImei(true)
    setImeiSaved(false)
    try {
      const value = imeiInput.trim() || null
      const { error } = await supabase.from('children').update({ qxgps_imei: value }).eq('id', child.id)
      if (error) throw error
      setChild({ ...child, qxgps_imei: value })
      setImeiSaved(true)
    } catch (err) {
      alert(err.message || "Impossible d'enregistrer l'IMEI, réessaie.")
    } finally {
      setSavingImei(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eff6ff' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', background: 'white', borderBottom: '1px solid #dbeafe'
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#1d4ed8' }}>
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
            <h4 style={{ marginBottom: 12, fontSize: 14, color: '#1d4ed8' }}>Infos</h4>
            <p style={{ fontSize: 13, marginBottom: 6 }}>Date de naissance : {child.birth_date || '—'}</p>
            <p style={{ fontSize: 13, marginBottom: 14 }}>Créé le : {format(new Date(child.created_at), 'dd/MM/yyyy')}</p>

            <h4 style={{ marginBottom: 8, fontSize: 14, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Radio size={15} /> Traceur GPS physique (QXGPS)
            </h4>
            <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
              Renseigne l'IMEI du boîtier QXGPS pour relier sa position réelle à cet enfant.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={imeiInput}
                onChange={e => { setImeiInput(e.target.value); setImeiSaved(false) }}
                placeholder="ex : 865012345678901"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid #dbeafe', fontSize: 13 }}
              />
              <button
                onClick={saveImei}
                disabled={savingImei}
                style={{
                  padding: '9px 14px', borderRadius: 10, background: imeiSaved ? '#10b981' : '#1d4ed8',
                  color: 'white', fontWeight: 600, fontSize: 12, border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  opacity: savingImei ? 0.7 : 1
                }}
              >
                {imeiSaved ? <Check size={14} /> : null}
                {savingImei ? '...' : imeiSaved ? 'Lié' : 'Lier'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ height: 320, borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 4px 16px rgba(29, 78, 216,0.08)' }}>
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
                  padding: '10px 0', borderBottom: i < history.length - 1 ? '1px solid #eff6ff' : 'none',
                  fontSize: 13
                }}>
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                  </span>
                  <span style={{ color: '#1d4ed8' }}>
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
