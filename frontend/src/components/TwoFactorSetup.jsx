import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../lib/mfa'

// Active / désactive la double authentification par application (Google Authenticator, Authy, etc.).
export default function TwoFactorSetup() {
  const { refreshMfa } = useAuth()
  const [state, setState] = useState('checking') // checking | off | enrolling | on
  const [factorId, setFactorId] = useState(null)
  const [enroll, setEnroll] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setError(authErrorMessage(listError))
      setState('off')
      return
    }
    const verified = data?.totp?.[0]
    setFactorId(verified?.id ?? null)
    setState(verified ? 'on' : 'off')
  }, [])

  useEffect(() => { load() }, [load])

  const start = async () => {
    setError('')
    setBusy(true)
    try {
      // Un essai abandonné laisse un facteur non validé : on le retire avant d'en créer un nouveau
      const { data: all } = await supabase.auth.mfa.listFactors()
      for (const f of all?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `SecurTrajet ${Date.now()}`
      })
      if (enrollError) throw enrollError
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      setCode('')
      setState('enrolling')
    } catch (err) {
      setError(authErrorMessage(err, "Impossible d'activer la double authentification."))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e) => {
    e.preventDefault()
    if (code.length !== 6) return
    setError('')
    setBusy(true)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enroll.id })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: challenge.id,
        code
      })
      if (verifyError) throw verifyError
      setEnroll(null)
      setCode('')
      await refreshMfa()
      await load()
    } catch (err) {
      setError(authErrorMessage(err, 'Code incorrect.'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {})
    setEnroll(null)
    setCode('')
    setError('')
    setState('off')
  }

  const disable = async () => {
    if (!window.confirm('Désactiver la double authentification ? Ton compte sera protégé par le mot de passe seul.')) return
    setError('')
    setBusy(true)
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
      if (unenrollError) throw unenrollError
      await refreshMfa()
      await load()
    } catch (err) {
      setError(authErrorMessage(err, 'Impossible de désactiver la double authentification.'))
    } finally {
      setBusy(false)
    }
  }

  const on = state === 'on'

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.icon}>
          {on ? <ShieldCheck size={18} color="#10b981" /> : <ShieldOff size={18} color="#94a3b8" />}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Double authentification</h3>
          <p style={styles.sub}>
            {on ? 'Activée : un code Google Authenticator est demandé à chaque connexion' : 'Protège ton compte avec un code à 6 chiffres (Google Authenticator)'}
          </p>
        </div>
        {state === 'off' && (
          <button style={styles.primaryBtn} onClick={start} disabled={busy}>{busy ? '...' : 'Activer'}</button>
        )}
        {on && (
          <button style={styles.ghostBtn} onClick={disable} disabled={busy}>{busy ? '...' : 'Désactiver'}</button>
        )}
      </div>

      {state === 'enrolling' && enroll && (
        <form onSubmit={confirm} style={styles.enroll}>
          <ol style={styles.steps}>
            <li>Installe <strong>Google Authenticator</strong> sur ton téléphone (si ce n'est pas fait).</li>
            <li>Dans l'application, appuie sur <strong>+</strong> puis <strong>Scanner un code QR</strong>.</li>
            <li>Saisis ici le code à 6 chiffres affiché.</li>
          </ol>
          <img src={enroll.qr} alt="QR code à scanner" style={styles.qr} />
          <p style={styles.secretLabel}>Impossible de scanner ? Saisis cette clé dans l'application :</p>
          <code style={styles.secret}>{enroll.secret}</code>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            style={styles.codeInput}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...styles.ghostBtn, flex: 1 }} onClick={cancel} disabled={busy}>Annuler</button>
            <button type="submit" style={{ ...styles.primaryBtn, flex: 1 }} disabled={busy || code.length !== 6}>
              {busy ? 'Vérification...' : 'Valider'}
            </button>
          </div>
        </form>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </div>
  )
}

const styles = {
  card: { background: 'white', borderRadius: 16, padding: 24, marginBottom: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 12 },
  icon: {
    width: 40, height: 40, borderRadius: 12, background: '#eff6ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },
  sub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  primaryBtn: {
    padding: '8px 14px', borderRadius: 10, fontWeight: 600, fontSize: 12, border: 'none',
    background: '#1d4ed8', color: 'white', cursor: 'pointer'
  },
  ghostBtn: {
    padding: '8px 14px', borderRadius: 10, fontWeight: 600, fontSize: 12, border: 'none',
    background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer'
  },
  enroll: { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' },
  steps: { fontSize: 13, color: '#334155', lineHeight: 1.6, paddingLeft: 18, alignSelf: 'stretch', margin: 0 },
  qr: { width: 180, height: 180, borderRadius: 12, border: '1px solid #dbeafe', padding: 6, background: 'white' },
  secretLabel: { fontSize: 12, color: '#64748b', margin: 0 },
  secret: {
    fontSize: 13, background: '#f1f5f9', padding: '6px 10px', borderRadius: 8,
    wordBreak: 'break-all', textAlign: 'center', userSelect: 'all'
  },
  codeInput: {
    width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid #dbeafe',
    fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: 700
  },
  error: { fontSize: 12, color: '#ef4444', marginTop: 10 }
}
