import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import store from '../data/store'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)

  // Charger le profile + statut abonnement
  const loadProfile = async (userId) => {
    if (!userId) {
      setProfile(null)
      setSubscription(null)
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
    store.setCurrentUser(userId, { email: data.email, firstName: data.first_name, lastName: data.last_name })

    // Statut d'accès
    const hasAccess =
      data.role === 'admin' ||
      (data.is_approved && (
        (data.subscription_status === 'trial' && new Date(data.trial_ends_at) > new Date()) ||
        data.subscription_status === 'active'
      ))

    const trialDaysLeft = data.subscription_status === 'trial'
      ? Math.max(0, Math.ceil((new Date(data.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
      : null

    setSubscription({
      status: data.subscription_status,
      isApproved: data.is_approved,
      hasAccess,
      trialDaysLeft,
      trialEndsAt: data.trial_ends_at
    })
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
          setSubscription(null)
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
    store.logout()
    setUser(null)
    setProfile(null)
    setSubscription(null)
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

  // Activer l'abonnement (après paiement 2500)
  const activateSubscription = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_status: 'active',
        subscription_started_at: new Date().toISOString(),
        last_payment_at: new Date().toISOString()
      })
      .eq('id', user.id)
    if (error) throw error
    await loadProfile(user.id)
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
      activateSubscription,
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
