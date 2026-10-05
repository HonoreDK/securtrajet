// Code USSD ouvert par le bouton « Payer » (composeur du téléphone pré-rempli).
//
// L'administrateur ne renseigne qu'un code marchand par opérateur (Administration > Réglages de
// paiement) : le code USSD complet en est déduit. Il peut aussi y coller directement la séquence
// complète de la carte marchand (ex : *126*4*123456*{amount}#), {amount} étant remplacé par 2500.
// Sans code exploitable, on ouvre simplement le menu principal de l'opérateur.

export const AMOUNT = 2500

export const DEFAULT_USSD = {
  orange: '#150#',
  mtn: '*126#'
}

// Séquence de paiement marchand connue par opérateur ({number} = code marchand).
// Orange : séquence non fixée, le parent arrive au menu principal avec le code marchand affiché.
export const MERCHANT_TEMPLATE = {
  orange: '',
  mtn: '*126*4*{number}*{amount}#'
}

const VALID_CODE = /^[0-9*#]{2,60}$/

function fill(template, digits) {
  return template.split('{number}').join(digits).split('{amount}').join(String(AMOUNT))
}

// Code complet déduit du code marchand de l'opérateur, ou null s'il n'est pas exploitable.
export function merchantUssd(provider, merchant) {
  const m = String(merchant ?? '').trim()
  if (!m) return null
  if (/[*#]/.test(m)) {
    const code = fill(m, '')
    return VALID_CODE.test(code) ? code : null
  }
  const digits = m.replace(/\D/g, '')
  const template = MERCHANT_TEMPLATE[provider]
  if (!digits || !template) return null
  const code = fill(template, digits)
  return VALID_CODE.test(code) ? code : null
}

// Code à composer : la séquence marchande si elle est connue, sinon le menu principal.
export function resolveUssd(provider, merchant) {
  return merchantUssd(provider, merchant) ?? DEFAULT_USSD[provider] ?? null
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
