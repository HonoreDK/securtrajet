import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MapView from '../components/MapView'
import {
  Map, Users, Bell, Settings, LogOut, Battery, Wifi, WifiOff,
  Plus, Shield, AlertTriangle, Menu, X, ShieldCheck, MapPinOff, UserPlus
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

const GREETING_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Dashboard() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [children, setChildren] = useState([])
  const [alerts, setAlerts] = useState([])
  const [positions, setPositions] = useState({}) // child_id -> dernière position
  const [geofences, setGeofences] = useState([])
  const [selectedChild, setSelectedChild] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)
  const [showAddChild, setShowAddChild] = useState(false)
  const [newChild, setNewChild] = useState({ firstName: '', lastName: '', birthDate: '' })
  const [activeTab, setActiveTab] = useState('carte')

  const refresh = useCallback(async () => {
    if (!user) return
    const [childrenRes, alertsRes, positionsRes, geofencesRes] = await Promise.all([
      supabase.from('children').select('*').eq('parent_id', user.id).order('created_at', { ascending: true }),
      supabase.from('alerts').select('*').eq('parent_id', user.id).order('created_at', { ascending: false }),
      supabase.from('positions').select('*').eq('parent_id', user.id).order('recorded_at', { ascending: false }),
      supabase.from('geofences').select('*').eq('parent_id', user.id)
    ])
    setChildren(childrenRes.data || [])
    setAlerts(alertsRes.data || [])
    setGeofences(geofencesRes.data || [])
    const latestByChild = {}
    for (const p of positionsRes.data || []) {
      if (!latestByChild[p.child_id]) latestByChild[p.child_id] = p
    }
    setPositions(latestByChild)
  }, [user])

  useEffect(() => {
    refresh()
    if (!user) return
    // Rafraîchit dès qu'un traceur envoie une position, ou qu'un enfant/alerte change
    const channel = supabase
      .channel(`dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children', filter: `parent_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `parent_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `parent_id=eq.${user.id}` }, refresh)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, refresh])

  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      setSelectedChild(children[0].id)
    }
  }, [children, selectedChild])

  const selectTab = (tab) => {
    setActiveTab(tab)
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleAddChild = async (e) => {
    e.preventDefault()
    try {
      const trackerId = `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const { error } = await supabase.from('children').insert({
        parent_id: user.id,
        first_name: newChild.firstName,
        last_name: newChild.lastName,
        birth_date: newChild.birthDate || null,
        tracker_id: trackerId
      })
      if (error) throw error
      setNewChild({ firstName: '', lastName: '', birthDate: '' })
      setShowAddChild(false)
      refresh()
    } catch (err) {
      alert(err.message || "Impossible d'ajouter l'enfant, réessayez.")
    }
  }

  const markAlertRead = async (alertId) => {
    await supabase.from('alerts').update({ is_read: true }).eq('id', alertId)
    refresh()
  }

  const unreadAlerts = alerts.filter(a => !a.is_read).length
  const currentChild = children.find(c => c.id === selectedChild)
  const position = currentChild ? positions[currentChild.id] : null

  const getStatusColor = (status) => {
    if (status === 'online') return '#10b981'
    if (status === 'low_battery') return '#f59e0b'
    return '#ef4444'
  }

  const getInitial = (name) => name?.charAt(0).toUpperCase() || '?'

  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <div
        className={`dash-sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className="dash-sidebar" style={{ ...styles.sidebar, width: sidebarOpen ? 260 : 0, overflow: 'hidden' }}>
        <div style={styles.sidebarHeader}>
          <div style={styles.brand}>
            <div style={styles.brandIcon}>
              <Shield size={18} color="white" />
            </div>
            <span>SecurTrajet</span>
          </div>
        </div>

        <nav style={styles.nav}>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'carte' ? styles.navActive : {}) }}
            onClick={() => selectTab('carte')}
          >
            <Map size={18} /> Carte
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'enfants' ? styles.navActive : {}) }}
            onClick={() => selectTab('enfants')}
          >
            <Users size={18} /> Mes enfants
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'alertes' ? styles.navActive : {}) }}
            onClick={() => selectTab('alertes')}
          >
            <Bell size={18} /> Alertes
            {unreadAlerts > 0 && <span style={styles.badge}>{unreadAlerts}</span>}
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'parametres' ? styles.navActive : {}) }}
            onClick={() => navigate('/settings')}
          >
            <Settings size={18} /> Paramètres
          </button>
          {profile?.role === 'admin' && (
            <button
              style={styles.navItem}
              onClick={() => navigate('/admin')}
            >
              <ShieldCheck size={18} /> Administration
            </button>
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{getInitial(profile?.first_name)}</div>
            <div>
              <div style={styles.userName}>{profile?.first_name} {profile?.last_name}</div>
              <div style={styles.userRole}>Parent</div>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout} title="Déconnexion">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        {/* Top bar */}
        <header style={styles.header}>
          <button style={styles.menuBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={styles.greeting}>Bonjour {profile?.first_name} 👋</h2>
            <p style={styles.greetingSub}>{GREETING_DATE.format(new Date())}</p>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.liveBadge}>
              <span style={styles.liveDot} /> EN DIRECT
            </span>
          </div>
        </header>

        {activeTab === 'carte' && children.length === 0 && (
          <div style={styles.content}>
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>
                <MapPinOff size={32} color="#0f766e" />
              </div>
              <h3 style={styles.emptyTitle}>Aucun enfant suivi pour l'instant</h3>
              <p style={styles.emptyText}>
                Ajoutez votre premier enfant pour commencer à voir sa position en temps réel sur la carte.
              </p>
              <button style={styles.primaryBtn} onClick={() => setShowAddChild(true)}>
                <Plus size={16} /> Ajouter un enfant
              </button>
            </div>
          </div>
        )}

        {activeTab === 'carte' && children.length > 0 && (
          <div style={styles.content}>
            {/* Children selector */}
            <div style={styles.childrenBar}>
              {children.map(child => (
                <button
                  key={child.id}
                  style={{
                    ...styles.childChip,
                    ...(selectedChild === child.id ? styles.childChipActive : {})
                  }}
                  onClick={() => setSelectedChild(child.id)}
                >
                  <span style={{
                    ...styles.chipDot,
                    background: getStatusColor(child.status)
                  }} />
                  {child.first_name}
                </button>
              ))}
              <button style={styles.addChip} onClick={() => setShowAddChild(true)}>
                <Plus size={16} />
              </button>
            </div>

            {/* Map + Info */}
            <div className="dash-map-section" style={styles.mapSection}>
              <div style={styles.mapContainer}>
                <MapView
                  children={children}
                  positions={positions}
                  geofences={geofences}
                  selectedId={selectedChild}
                  onSelect={setSelectedChild}
                />
              </div>

              {currentChild && (
                <div className="dash-info-panel" style={styles.infoPanel}>
                  <div style={styles.infoHeader}>
                    <div style={{
                      ...styles.childAvatar,
                      background: getStatusColor(currentChild.status)
                    }}>
                      {getInitial(currentChild.first_name)}
                    </div>
                    <div>
                      <h3 style={styles.childName}>{currentChild.first_name} {currentChild.last_name}</h3>
                      <p style={styles.trackerId}>{currentChild.tracker_id}</p>
                    </div>
                  </div>

                  <div style={styles.stats}>
                    <div style={styles.stat}>
                      {currentChild.status === 'online' ? <Wifi size={16} color="#10b981" /> : <WifiOff size={16} color="#ef4444" />}
                      <span>{currentChild.status === 'online' ? 'En ligne' : currentChild.status === 'low_battery' ? 'Batterie faible' : 'Hors ligne'}</span>
                    </div>
                    <div style={styles.stat}>
                      <Battery size={16} color={currentChild.battery < 20 ? '#ef4444' : '#10b981'} />
                      <span>{currentChild.battery}%</span>
                    </div>
                  </div>

                  {position && (
                    <div style={styles.lastPos}>
                      <p style={styles.lastPosLabel}>Dernière position</p>
                      <p style={styles.lastPosTime}>
                        {formatDistanceToNow(new Date(position.recorded_at), { addSuffix: true, locale: fr })}
                      </p>
                      <p style={styles.coords}>
                        {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
                      </p>
                      {position.speed > 0 && (
                        <p style={styles.speed}>{position.speed.toFixed(1)} km/h</p>
                      )}
                    </div>
                  )}

                  {!position && (
                    <div style={styles.lastPos}>
                      <p style={styles.lastPosLabel}>En attente du traceur</p>
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Aucune position reçue pour l'instant.
                      </p>
                    </div>
                  )}

                  <button
                    style={styles.detailBtn}
                    onClick={() => navigate(`/child/${currentChild.id}`)}
                  >
                    Voir le détail
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'enfants' && (
          <div style={styles.content} className="fade-in">
            <div style={styles.sectionHeader}>
              <h3>Mes enfants</h3>
              <button style={styles.primaryBtn} onClick={() => setShowAddChild(true)}>
                <Plus size={16} /> Ajouter
              </button>
            </div>
            {children.length === 0 && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>
                  <Users size={32} color="#0f766e" />
                </div>
                <h3 style={styles.emptyTitle}>Aucun enfant enregistré</h3>
                <p style={styles.emptyText}>
                  Ajoutez un enfant pour suivre sa position, sa batterie et recevoir des alertes.
                </p>
              </div>
            )}
            <div style={styles.childrenGrid}>
              {children.map(child => {
                const pos = positions[child.id]
                return (
                  <div key={child.id} style={styles.childCard} onClick={() => { setSelectedChild(child.id); setActiveTab('carte') }}>
                    <div style={{ ...styles.childAvatarLg, background: getStatusColor(child.status) }}>
                      {getInitial(child.first_name)}
                    </div>
                    <h4>{child.first_name} {child.last_name}</h4>
                    <p style={styles.cardMeta}>{child.tracker_id}</p>
                    <div style={styles.cardStats}>
                      <span><Battery size={14} /> {child.battery}%</span>
                      <span>{child.status === 'online' ? '🟢 En ligne' : '🔴 Hors ligne'}</span>
                    </div>
                    {pos && (
                      <p style={styles.cardTime}>
                        {formatDistanceToNow(new Date(pos.recorded_at), { addSuffix: true, locale: fr })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'alertes' && (
          <div style={styles.content} className="fade-in">
            <h3 style={{ marginBottom: 16 }}>Alertes</h3>
            {alerts.length === 0 ? (
              <p style={{ color: '#64748b' }}>Aucune alerte</p>
            ) : (
              <div style={styles.alertsList}>
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    style={{ ...styles.alertItem, opacity: alert.is_read ? 0.6 : 1 }}
                    onClick={() => markAlertRead(alert.id)}
                  >
                    <AlertTriangle size={20} color={alert.type === 'low_battery' ? '#f59e0b' : '#ef4444'} />
                    <div style={{ flex: 1 }}>
                      <p style={styles.alertMsg}>{alert.message}</p>
                      <p style={styles.alertTime}>
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                    {!alert.is_read && <span style={styles.unreadDot} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Add Child */}
      {showAddChild && (
        <div style={styles.modalOverlay} onClick={() => setShowAddChild(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderLeft}>
                <div style={styles.modalIcon}>
                  <UserPlus size={20} color="#0f766e" />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Ajouter un enfant</h3>
                  <p style={styles.modalSubtitle}>Renseignez ses informations pour commencer le suivi</p>
                </div>
              </div>
              <button
                type="button"
                style={styles.modalCloseBtn}
                onClick={() => setShowAddChild(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddChild} style={styles.modalForm}>
              <div style={styles.formRow}>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>Prénom</label>
                  <input
                    placeholder="ex : Sophie"
                    value={newChild.firstName}
                    onChange={e => setNewChild({ ...newChild, firstName: e.target.value })}
                    required
                    style={styles.input}
                    autoFocus
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>Nom</label>
                  <input
                    placeholder="ex : Fotso"
                    value={newChild.lastName}
                    onChange={e => setNewChild({ ...newChild, lastName: e.target.value })}
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.fieldLabel}>Date de naissance</label>
                <input
                  type="date"
                  value={newChild.birthDate}
                  onChange={e => setNewChild({ ...newChild, birthDate: e.target.value })}
                  style={styles.input}
                />
              </div>

              <p style={styles.modalHint}>
                Un identifiant de traceur unique sera généré automatiquement.
              </p>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" style={{ ...styles.secondaryBtn, flex: 1, display: 'flex', justifyContent: 'center' }} onClick={() => setShowAddChild(false)}>Annuler</button>
                <button type="submit" style={{ ...styles.primaryBtn, flex: 1, justifyContent: 'center' }}>
                  <UserPlus size={16} /> Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', minHeight: '100vh', background: '#f0fdfa' },
  sidebar: {
    background: 'white',
    borderRight: '1px solid #ccfbf1',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.25s ease',
    flexShrink: 0
  },
  sidebarHeader: { padding: '20px 16px', borderBottom: '1px solid #f0fdfa' },
  brand: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 18, color: '#0f766e' },
  brandIcon: {
    width: 34, height: 34, borderRadius: 10,
    background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0
  },
  nav: { flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 14px', borderRadius: 10, background: 'transparent',
    color: '#134e4a', fontSize: 14, fontWeight: 500, textAlign: 'left', width: '100%'
  },
  navActive: { background: '#f0fdfa', color: '#0f766e', fontWeight: 600 },
  badge: {
    marginLeft: 'auto', background: '#ef4444', color: 'white',
    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10
  },
  sidebarFooter: {
    padding: 12, borderTop: '1px solid #f0fdfa',
    display: 'flex', alignItems: 'center', gap: 8
  },
  userInfo: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 36, height: 36, borderRadius: '50%', background: '#0f766e',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 14
  },
  userName: { fontSize: 13, fontWeight: 600 },
  userRole: { fontSize: 11, color: '#5eead4' },
  logoutBtn: { background: 'transparent', color: '#64748b', padding: 8, borderRadius: 8 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 20px', background: 'white', borderBottom: '1px solid #ccfbf1'
  },
  menuBtn: { background: 'transparent', color: '#0f766e', padding: 6 },
  greeting: { fontSize: 18, fontWeight: 600 },
  greetingSub: { fontSize: 12, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 700, color: '#0f766e',
    background: '#f0fdfa', padding: '4px 10px', borderRadius: 20
  },
  liveDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#10b981',
    animation: 'pulse 2s infinite'
  },
  content: { flex: 1, padding: 16, overflow: 'auto' },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    background: 'white', borderRadius: 20, padding: '48px 24px', gap: 6,
    boxShadow: '0 4px 20px rgba(15,118,110,0.06)', maxWidth: 420, margin: '40px auto'
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: '50%', background: '#f0fdfa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10
  },
  emptyTitle: { fontSize: 17, fontWeight: 700, color: '#134e4a' },
  emptyText: { fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 12 },
  childrenBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  childChip: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 20, background: 'white',
    border: '1.5px solid #ccfbf1', fontSize: 13, fontWeight: 500, color: '#134e4a'
  },
  childChipActive: { background: '#0f766e', color: 'white', borderColor: '#0f766e' },
  chipDot: { width: 8, height: 8, borderRadius: '50%' },
  addChip: {
    width: 36, height: 36, borderRadius: '50%', background: 'white',
    border: '1.5px dashed #ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#0f766e'
  },
  mapSection: { display: 'flex', gap: 16, height: 'calc(100vh - 160px)', minHeight: 400 },
  mapContainer: { flex: 1, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(15,118,110,0.08)' },
  infoPanel: {
    width: 280, background: 'white', borderRadius: 16, padding: 20,
    boxShadow: '0 4px 20px rgba(15,118,110,0.08)', display: 'flex', flexDirection: 'column', gap: 16
  },
  infoHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  childAvatar: {
    width: 48, height: 48, borderRadius: '50%', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18
  },
  childName: { fontSize: 16, fontWeight: 700 },
  trackerId: { fontSize: 11, color: '#94a3b8' },
  stats: { display: 'flex', gap: 16 },
  stat: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 },
  lastPos: { background: '#f0fdfa', borderRadius: 12, padding: 12 },
  lastPosLabel: { fontSize: 11, color: '#5eead4', fontWeight: 600 },
  lastPosTime: { fontSize: 14, fontWeight: 600, marginTop: 2 },
  coords: { fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: 'monospace' },
  speed: { fontSize: 12, color: '#0f766e', marginTop: 2 },
  detailBtn: {
    marginTop: 'auto', padding: '12px', borderRadius: 10,
    background: '#0f766e', color: 'white', fontWeight: 600, fontSize: 13
  },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  childrenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 },
  childCard: {
    background: 'white', borderRadius: 16, padding: 20, textAlign: 'center',
    boxShadow: '0 4px 16px rgba(15,118,110,0.06)', cursor: 'pointer', transition: 'transform 0.15s'
  },
  childAvatarLg: {
    width: 56, height: 56, borderRadius: '50%', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 22, margin: '0 auto 12px'
  },
  cardMeta: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  cardStats: { display: 'flex', justifyContent: 'center', gap: 12, marginTop: 10, fontSize: 12 },
  cardTime: { fontSize: 11, color: '#64748b', marginTop: 8 },
  alertsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  alertItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'white', padding: 14, borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer'
  },
  alertMsg: { fontSize: 14, fontWeight: 500 },
  alertTime: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: '50%', background: '#ef4444' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modal: {
    background: 'white', borderRadius: 20, padding: 24, width: '90%', maxWidth: 420
  },
  modalHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12
  },
  modalHeaderLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  modalIcon: {
    width: 40, height: 40, borderRadius: 12, background: '#f0fdfa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },
  modalTitle: { fontSize: 17, fontWeight: 700, color: '#134e4a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalCloseBtn: {
    background: '#f8fafc', color: '#64748b', borderRadius: 8, padding: 6, flexShrink: 0
  },
  modalForm: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 },
  modalHint: { fontSize: 12, color: '#94a3b8' },
  formRow: { display: 'flex', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: '#134e4a' },
  input: {
    padding: '12px 14px', borderRadius: 10, border: '1.5px solid #ccfbf1', fontSize: 14, width: '100%'
  },
  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', borderRadius: 10, background: '#0f766e',
    color: 'white', fontWeight: 600, fontSize: 13
  },
  secondaryBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#f0fdfa',
    color: '#0f766e', fontWeight: 600, fontSize: 13
  }
}
