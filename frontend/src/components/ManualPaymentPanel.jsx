import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Smartphone, CheckCircle2, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { merchantUssd, resolveUssd, dialHref, isIOS } from '../lib/ussd'

const PROVIDERS = {
  orange: { label: 'Orange Money', color: '#FF6600', textColor: '#ffffff', setting: 'pay_orange_ussd', refHint: 'ex : MP260105.1234.A12345' },
  mtn: { label: 'MTN Mobile Money', color: '#FFCB05', textColor: '#1a1a1a', setting: 'pay_mtn_ussd', refHint: 'ex : 1234567890' }
}

const STATUS = {
  pending: { label: 'En vérification', color: '#f59e0b', bg: '#fffbeb' },
  approved: { label: 'Validé', color: '#10b981', bg: '#ecfdf5' },
  rejected: { label: 'Refusé', color: '#ef4444', bg: '#fef2f2' }
}

const POLL_MS = 8000

// Le parent paie par Orange Money / MTN MoMo, déclare la référence de la transaction, puis un
// administrateur vérifie la réception et valide (prolongation de 30 jours côté base de données).
export default function ManualPaymentPanel({ onApproved }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState({})
  const [requests, setRequests] = useState([])
  const [provider, setProvider] = useState(null)
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const knownApproved = useRef(null)
  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['pay_orange_ussd', 'pay_mtn_ussd', 'pay_recipient_name'])
      .then(({ data }) => setSettings(Object.fromEntries((data || []).map(s => [s.key, s.value]))))
  }, [])

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('manual_payments')
      .select('*')
      .eq('parent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = data || []
    const approved = new Set(rows.filter(r => r.status === 'approved').map(r => r.id))
    // Dès qu'une demande passe à "validé", on rafraîchit l'abonnement sans attendre un rechargement
    if (knownApproved.current && [...approved].some(id => !knownApproved.current.has(id))) {
      onApprovedRef.current?.()
    }
    knownApproved.current = approved
    setRequests(rows)
  }, [user.id])

  useEffect(() => {
    loadRequests()
    const timer = setInterval(loadRequests, POLL_MS)
    return () => clearInterval(timer)
  }, [loadRequests])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const digits = phone.replace(/\s/g, '')
    const ref = reference.trim()
    if (!/^6\d{8}$/.test(digits)) {
      setError('Numéro invalide : 9 chiffres commençant par 6 (ex : 691234567).')
      return
    }
    if (!/^[A-Za-z0-9._-]{6,40}$/.test(ref)) {
      setError('Référence invalide : 6 à 40 caractères (lettres, chiffres, point ou tiret), sans espace.')
      return
    }
    setBusy(true)
    const { error: insertError } = await supabase.from('manual_payments').insert({
      parent_id: user.id,
      provider,
      sender_phone: digits,
      transaction_ref: ref
    })
    setBusy(false)
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Cette référence de transaction a déjà été déclarée.'
          : insertError.code === 'P0001'
            ? insertError.message
            : "Impossible d'enregistrer la demande, réessaie."
      )
      return
    }
    setSent(true)
    setProvider(null)
    setPhone('')
    setReference('')
    loadRequests()
  }

  // Ouvre l'app Téléphone avec le code déjà saisi. Sur iPhone, certains codes peuvent être ignorés
  // par le composeur : on copie donc aussi le code pour pouvoir le coller.
  const dial = (code) => {
    if (ios) navigator.clipboard?.writeText(code).catch(() => { /* presse-papiers indisponible */ })
    window.location.href = dialHref(code)
  }

  const recipient = settings.pay_recipient_name || 'Nova Tech Solution'
  const p = provider ? PROVIDERS[provider] : null
  const payNumber = p ? settings[p.setting] : ''
  const ussd = p ? resolveUssd(provider, payNumber) : null
  const ussdIsDirect = p ? Boolean(merchantUssd(provider, payNumber)) : false // sinon : simple menu principal
  const ios = isIOS()

  // Un clic sur l'opérateur : on passe à l'étape suivante, le bouton « Payer » charge le code de
  // paiement dans le téléphone. Le parent valide chez lui avec son code secret, puis revient
  // envoyer sa déclaration à l'administrateur.
  const startPayment = (key) => {
    setProvider(key)
    setSent(false)
    setError('')
  }

  return (
    <div>
      {sent && (
        <div style={styles.sentBox}>
          <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
          <span>
            Demande envoyée. Un administrateur va vérifier ton paiement : cette page se met à jour dès la validation.
          </span>
        </div>
      )}

      {requests.length > 0 && (
        <div style={styles.history}>
          <p style={styles.historyTitle}>Mes demandes</p>
          {requests.map(r => {
            const st = STATUS[r.status]
            return (
              <div key={r.id} style={styles.historyRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.historyMain}>
                    {PROVIDERS[r.provider]?.label} • <span style={styles.mono}>{r.transaction_ref}</span>
                  </div>
                  <div style={styles.historyMeta}>
                    {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
                    {r.status === 'rejected' && r.admin_note ? ` — ${r.admin_note}` : ''}
                    {r.status === 'approved' && r.receipt_sent_at ? ' — reçu envoyé par e-mail' : ''}
                  </div>
                </div>
                <span style={{ ...styles.pill, color: st.color, background: st.bg }}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {!provider ? (
        <div style={styles.providerChoice}>
          {Object.entries(PROVIDERS).map(([key, prov]) => (
            <button
              key={key}
              type="button"
              style={{ ...styles.providerBtn, background: prov.color, color: prov.textColor }}
              onClick={() => startPayment(key)}
            >
              <Smartphone size={18} /> Payer avec {prov.label}
            </button>
          ))}
          <p style={styles.dialHint}>
            Appuie sur ton opérateur : le code de paiement se charge dans ton téléphone, il te reste à le
            valider avec ton code secret.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} style={styles.form}>
          <button type="button" style={styles.backBtn} onClick={() => { setProvider(null); setError('') }}>
            <ArrowLeft size={14} /> Changer de moyen de paiement
          </button>
          <div style={{ ...styles.providerTag, background: p.color, color: p.textColor }}>
            <Smartphone size={14} /> {p.label}
          </div>

          <div style={styles.step}>
            <p style={styles.stepTitle}>1. Valide le paiement de 2 500 FCFA par {p.label} :</p>
            {payNumber && ussd ? (
              <div style={styles.dialBox}>
                <button
                  type="button"
                  style={{ ...styles.dialBtn, background: p.color, color: p.textColor }}
                  onClick={() => dial(ussd)}
                >
                  <Phone size={16} /> Payer 2 500 FCFA avec {p.label}
                </button>
                <p style={styles.dialHint}>
                  Le code de paiement se charge dans l'app Téléphone (au nom de {recipient}) : appuie sur appel.
                  {' '}
                  {ussdIsDirect
                    ? 'Suis ensuite les instructions et entre ton code secret pour confirmer.'
                    : `Tu arrives au menu ${p.label} : choisis le paiement marchand et envoie 2 500 FCFA.`}
                </p>
                {ios && (
                  <p style={styles.dialHint}>
                    Si le code n'apparaît pas dans le Téléphone, il est déjà copié : colle-le puis appuie sur appel.
                  </p>
                )}
              </div>
            ) : (
              <p style={styles.warn}>
                Le code marchand {p.label} n'est pas encore renseigné. Contacte l'administrateur.
              </p>
            )}
          </div>

          <div style={styles.step}>
            <p style={styles.stepTitle}>2. Une fois le paiement validé, reviens ici et indique ces informations (tu les trouves dans le SMS de confirmation) :</p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Ton numéro qui a payé (ex : 691234567)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={styles.input}
              required
            />
            <input
              placeholder={`Référence de la transaction (${p.refHint})`}
              value={reference}
              onChange={e => setReference(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}
          <button
            type="submit"
            disabled={busy || !payNumber}
            style={{ ...styles.submit, background: p.color, color: p.textColor, opacity: busy || !payNumber ? 0.6 : 1 }}
          >
            {busy ? 'Envoi...' : "J'ai payé : envoyer pour vérification"}
          </button>
        </form>
      )}
    </div>
  )
}

const styles = {
  sentBox: {
    display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12,
    background: '#ecfdf5', color: '#065f46', fontSize: 13, lineHeight: 1.4, marginTop: 16
  },
  history: { marginTop: 16, padding: 12, borderRadius: 12, background: '#f8fafc' },
  historyTitle: { fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8 },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    padding: '8px 0', borderTop: '1px solid #e2e8f0'
  },
  historyMain: { fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  historyMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  mono: { fontFamily: 'monospace' },
  pill: { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 },
  providerChoice: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  providerBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '14px', borderRadius: 12,
    fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer'
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16, textAlign: 'left' },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#64748b',
    fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start'
  },
  providerTag: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    borderRadius: 20, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start'
  },
  step: { display: 'flex', flexDirection: 'column', gap: 8 },
  stepTitle: { fontSize: 13, fontWeight: 600, color: '#1e3a8a', margin: 0, lineHeight: 1.4 },
  numberBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    padding: '12px 14px', borderRadius: 12, background: '#eff6ff', border: '1.5px solid #dbeafe'
  },
  number: { fontSize: 18, fontWeight: 800, color: '#1d4ed8', letterSpacing: 0.5 },
  recipient: { fontSize: 11, color: '#64748b', marginTop: 2 },
  copyBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
    background: 'white', color: '#1d4ed8', fontWeight: 600, fontSize: 12, border: '1.5px solid #dbeafe', cursor: 'pointer'
  },
  dialBox: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
  dialBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    boxSizing: 'border-box', padding: '14px', borderRadius: 12, fontWeight: 700, fontSize: 15,
    border: 'none', cursor: 'pointer', textDecoration: 'none'
  },
  dialHint: { fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: 0 },
  dialedNote: { fontSize: 12, color: '#065f46', background: '#ecfdf5', padding: 10, borderRadius: 10, margin: 0, lineHeight: 1.5 },
  warn: { fontSize: 12, color: '#b45309', background: '#fffbeb', padding: 10, borderRadius: 10, margin: 0 },
  input: { padding: '12px 14px', borderRadius: 12, border: '1.5px solid #dbeafe', fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 13, margin: 0 },
  submit: { width: '100%', padding: '14px', borderRadius: 12, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }
}
