import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const CLOCK_MS = 30 * 1000

// Statut d'abonnement calculé à partir du profil et de l'heure courante : il est recalculé
// régulièrement, pour qu'un abonnement qui se termine pendant que l'app est ouverte bloque l'accès.
function computeSubscription(data, now) {
  // Un abonnement "actif" donne accès jusqu'à sa date de fin (null = ancien abonnement sans expiration)
  const activeValid =
    data.subscription_status === 'active' &&
    (!data.subscription_ends_at || new Date(data.subscription_ends_at) > now)
  const trialValid = data.subscription_status === 'trial' && new Date(data.trial_ends_at) > now
  const status =
    data.subscription_status === 'active' && !activeValid ? 'expired' : data.subscription_status

  const hasAccess = data.role === 'admin' || Boolean(data.is_approved && (trialValid || activeValid))

  // Pour le message « abonnement terminé » : fin d'essai ou fin d'abonnement payant
  const wasTrial = data.subscription_status === 'trial'

  const trialDaysLeft = wasTrial
    ? Math.max(0, Math.ceil((new Date(data.trial_ends_at) - now) / (1000 * 60 * 60 * 24)))
    : null

  return {
    status,
    isApproved: data.is_approved,
    hasAccess,
    trialDaysLeft,
    trialEndsAt: data.trial_ends_at,
    endsAt: data.subscription_ends_at,
    endedAt: wasTrial ? data.trial_ends_at : data.subscription_ends_at,
    endedWasTrial: wasTrial
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [])

  const subscription = useMemo(() => (profile ? computeSubscription(profile, now) : null), [profile, now])

  // Charger le profile + statut abonnement
  const loadProfile = async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Erreur profile:', error)
      setProfile(null)
      return
    }
    setProfile(data)
  }

  useEffect(() => {
    // Session initiale
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })

    // Écoute des changements d'auth
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => authSub.unsubscribe()
  }, [])

  const register = async ({ email, password, firstName, lastName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: window.location.origin
      }
    })
    if (error) throw error
    // Le trigger crée le profile en pending_approval
    return data
  }

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await loadProfile(data.user.id)
    return data
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // Admin : approuver un parent
  const approveUser = async (userId) => {
    if (profile?.role !== 'admin') throw new Error('Action réservée aux administrateurs')
    const { error } = await supabase
      .from('profiles')
      .update({
        is_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', userId)
    if (error) throw error
  }

  // Admin : modifier les infos d'un utilisateur
  const adminUpdateUser = async (userId, updates) => {
    if (profile?.role !== 'admin') throw new Error('Action réservée aux administrateurs')
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      subscription,
      loading,
      login,
      register,
      logout,
      approveUser,
      adminUpdateUser,
      refreshProfile: () => user && loadProfile(user.id)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
