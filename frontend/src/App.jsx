import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import SubscriptionGate from './components/SubscriptionGate'
import MfaChallenge from './components/MfaChallenge'
import ChatWidget from './components/ChatWidget'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ChildDetail from './pages/ChildDetail'
import Settings from './pages/Settings'
import Admin from './pages/Admin'

function PrivateRoute({ children }) {
  const { user, loading, mfaRequired } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Chargement...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  // Double authentification activée : le code est exigé avant d'afficher quoi que ce soit
  return mfaRequired ? <MfaChallenge /> : children
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <SubscriptionGate>
                <Dashboard />
              </SubscriptionGate>
            </PrivateRoute>
          }
        />
        <Route
          path="/child/:id"
          element={
            <PrivateRoute>
              <SubscriptionGate>
                <ChildDetail />
              </SubscriptionGate>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SubscriptionGate>
                <Settings />
              </SubscriptionGate>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <PrivateRoute>
              <Admin />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChatWidget />
    </>
  )
}
