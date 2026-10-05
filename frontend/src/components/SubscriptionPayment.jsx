import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PaymentPanel from './PaymentPanel'
import ManualPaymentPanel from './ManualPaymentPanel'

// Choisit le mode d'encaissement selon le réglage "payment_mode" de la page Administration :
// "manual" (défaut) = paiement vérifié à la main, "campay" = paiement automatique.
export default function SubscriptionPayment() {
  const { refreshProfile } = useAuth()
  const [mode, setMode] = useState(null)

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'payment_mode')
      .maybeSingle()
      .then(({ data }) => setMode(data?.value === 'campay' ? 'campay' : 'manual'))
  }, [])

  if (!mode) return null
  return mode === 'campay'
    ? <PaymentPanel onSuccess={refreshProfile} />
    : <ManualPaymentPanel onApproved={refreshProfile} />
}
