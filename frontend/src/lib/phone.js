// Numéros de téléphone camerounais mobiles : 9 chiffres commençant par 6 (ex : 691234567).
// Même règle que la fonction SQL normalize_phone et la fonction Edge phone-login.

export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('237')) d = d.slice(3)
  return /^6\d{8}$/.test(d) ? d : null
}

// Un identifiant sans « @ » est traité comme un numéro de téléphone.
export function isEmailIdentifier(value) {
  return String(value ?? '').includes('@')
}

export function formatPhone(phone) {
  const d = normalizePhone(phone)
  return d ? d.replace(/(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5') : ''
}
