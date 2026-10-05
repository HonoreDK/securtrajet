// Code USSD ouvert par le bouton « Payer maintenant » (composeur du téléphone pré-rempli).
//
// L'administrateur peut définir un modèle par opérateur dans Administration > Réglages de paiement,
// avec {number} (numéro/code marchand de réception) et {amount} (montant) remplacés automatiquement.
// Sans modèle, on ouvre simplement le menu principal de l'opérateur.

export const AMOUNT = 2500

export const DEFAULT_USSD = {
  orange: '#150#',
  mtn: '*126#'
}

// Renvoie le code complet si le modèle est valide, sinon null.
export function buildUssd(template, number) {
  const t = String(template ?? '').trim()
  if (!t) return null
  const digits = String(number ?? '').replace(/\D/g, '')
  if (t.includes('{number}') && !digits) return null
  const code = t.split('{number}').join(digits).split('{amount}').join(String(AMOUNT))
  return /^[0-9*#]{2,60}$/.test(code) ? code : null
}

export function resolveUssd(provider, template, number) {
  return buildUssd(template, number) ?? DEFAULT_USSD[provider] ?? null
}

// Lien à utiliser dans <a href> : « # » doit être encodé, sinon le composeur coupe le code.
export function dialHref(code) {
  return `tel:${encodeURIComponent(code)}`
}

// Sur iPhone, les liens tel: ne composent pas les codes USSD : on propose de copier le code.
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
