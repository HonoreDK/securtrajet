// Double authentification (application de type Google Authenticator, codes TOTP à 6 chiffres).
//
// Supabase marque la session « aal2 » une fois le code validé. On lit ce niveau directement dans le
// jeton (sans appel réseau) : un compte qui a activé la double authentification mais dont la session
// est encore « aal1 » (mot de passe seul) doit saisir son code avant d'accéder à l'application.

export function aalLevel(session) {
  try {
    const payload = session?.access_token?.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json.aal || 'aal1'
  } catch {
    return null
  }
}

export function hasVerifiedTotp(session) {
  return (session?.user?.factors || []).some(f => f.factor_type === 'totp' && f.status === 'verified')
}

export function needsMfa(session) {
  if (!session) return false
  return hasVerifiedTotp(session) && aalLevel(session) !== 'aal2'
}

// Messages lisibles pour les erreurs d'authentification les plus courantes.
export function authErrorMessage(err, fallback = 'Une erreur est survenue, réessaie.') {
  const msg = String(err?.message || '')
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.'
  if (/email not confirmed/i.test(msg)) return "Ton adresse e-mail n'est pas confirmée. Contacte l'administrateur."
  if (/already registered|already been registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.'
  if (/password should be at least/i.test(msg)) return 'Le mot de passe est trop court (6 caractères minimum).'
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives, patiente une minute puis réessaie.'
  if (/invalid.*(totp|code)|code.*invalid/i.test(msg)) return 'Code incorrect ou expiré. Vérifie le code dans ton application.'
  if (/failed to fetch|network/i.test(msg)) return 'Connexion impossible : vérifie ta connexion internet.'
  return msg || fallback
}
