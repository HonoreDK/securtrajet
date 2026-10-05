import { useState, useEffect, useCallback } from 'react'
import { Check, X, Wallet, Settings as SettingsIcon } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/functions'
import { merchantUssd, DEFAULT_USSD } from '../lib/ussd'

const PROVIDER_LABEL = { orange: 'Orange Money', mtn: 'MTN MoMo' }
const POLL_MS = 15000

const SETTING_KEYS = ['payment_mode', 'pay_orange_number', 'pay_mtn_number', 'pay_recipient_name']

// Aperçu du code que le bouton « Payer » composera chez le parent.
function UssdPreview({ provider, merchant }) {
  if (!String(merchant || '').trim()) {
    return <p style={previewStyles.hint}>Vide : le bouton « Payer » n'ouvrira rien tant que le code n'est pas renseigné.</p>
  }
  const code = merchantUssd(provider, merchant)
  return code
    ? <p style={previewStyles.ok}>Code composé chez le parent : <strong>{code}</strong></p>
    : <p style={previewStyles.hint}>Le menu principal de l'opérateur ({DEFAULT_USSD[provider]}) s'ouvrira et le parent verra ce code marchand à utiliser.</p>
}

const previewStyles = {
  hint: { fontSize: 11, color: '#94a3b8', margin: '4px 0 0' },
  ok: { fontSize: 12, color: '#065f46', margin: '4px 0 0' },
  bad: { fontSize: 12, color: '#b45309', margin: '4px 0 0' }
}

export default function AdminPayments() {
  const [payments, setPayments] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [settings, setSettings] = useState({})
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'ok' | 'warn', text }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('manual_payments')
      .select('*, parent:profiles!parent_id(first_name, last_name, email)')
      .order('created_at', { ascending: false })
      .limit(50)
    setPayments(data || [])
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', SETTING_KEYS)
      .then(({ data }) => setSettings(Object.fromEntries((data || []).map(s => [s.key, s.value]))))
  }, [])

  const approve = async (p) => {
    const who = `${p.parent?.first_name || ''} ${p.parent?.last_name || ''}`.trim() || p.parent?.email
    if (!confirm(`Confirmer que tu as bien reçu 2 500 FCFA de ${who} (réf. ${p.transaction_ref}) ?\nL'abonnement sera prolongé de 30 jours.`)) return
    setBusyId(p.id)
    const { error } = await supabase.rpc('approve_manual_payment', { p_id: p.id })
    if (error) {
      setBusyId(null)
      alert(error.message)
      load()
      return
    }
    await sendReceipt(p, 'Paiement validé.')
    setBusyId(null)
    load()
  }

  // Envoie (ou renvoie) le reçu par e-mail au parent ; un échec n'annule jamais la validation.
  const sendReceipt = async (p, prefix = '') => {
    try {
      const res = await invokeFunction('send-receipt', { payment_id: p.id, resend: Boolean(p.receipt_sent_at) })
      setNotice({
        type: 'ok',
        text: res.already
          ? `${prefix} Le reçu avait déjà été envoyé.`.trim()
          : `${prefix} Reçu envoyé à ${res.to}.`.trim()
      })
    } catch (err) {
      setNotice({
        type: 'warn',
        text: `${prefix} Le reçu n'a pas pu être envoyé : ${err.message} Tu peux le renvoyer depuis la liste ci-dessous.`.trim()
      })
    }
  }

  const resendReceipt = async (p) => {
    setBusyId(p.id)
    await sendReceipt(p)
    setBusyId(null)
    load()
  }

  const reject = async (p) => {
    const note = prompt('Motif du refus (visible par le parent) :', 'Paiement introuvable')
    if (note === null) return
    setBusyId(p.id)
    const { error } = await supabase.rpc('reject_manual_payment', { p_id: p.id, p_note: note })
    setBusyId(null)
    if (error) alert(error.message)
    load()
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    setSettingsSaved(false)
    const rows = SETTING_KEYS.map(key => ({
      key,
      value: String(settings[key] ?? '').trim(),
      updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    setSavingSettings(false)
    if (error) { alert(error.message); return }
    setSettingsSaved(true)
  }

  const setField = (key, value) => { setSettings(s => ({ ...s, [key]: value })); setSettingsSaved(false) }

  const pending = payments.filter(p => p.status === 'pending')
  const treated = payments.filter(p => p.status !== 'pending').slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
      <div style={styles.card}>
        <h3 style={styles.title}>
          <Wallet size={18} color="#1d4ed8" /> Paiements à vérifier ({pending.length})
        </h3>
        <p style={styles.hint}>
          Compare chaque référence avec les SMS / l'historique de ton compte Orange Money ou MTN MoMo avant de valider.
        </p>

        {notice && (
          <div style={{ ...styles.notice, ...(notice.type === 'ok' ? styles.noticeOk : styles.noticeWarn) }}>
            {notice.text}
          </div>
        )}

        {pending.length === 0 && <p style={styles.empty}>Aucun paiement en attente.</p>}

        {pending.map(p => (
          <div key={p.id} style={styles.row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.rowTitle}>
                {`${p.parent?.first_name || ''} ${p.parent?.last_name || ''}`.trim() || p.parent?.email}
                <span style={styles.provider}>{PROVIDER_LABEL[p.provider]}</span>
              </div>
              <div style={styles.rowMeta}>
                Réf. <span style={styles.mono}>{p.transaction_ref}</span> • depuis {p.sender_phone} •{' '}
                {format(new Date(p.created_at), 'dd MMM, HH:mm', { locale: fr })}
              </div>
            </div>
            <div style={styles.actions}>
              <button style={styles.okBtn} disabled={busyId === p.id} onClick={() => approve(p)}>
                <Check size={14} /> Valider
              </button>
              <button style={styles.noBtn} disabled={busyId === p.id} onClick={() => reject(p)}>
                <X size={14} /> Refuser
              </button>
            </div>
          </div>
        ))}

        {treated.length > 0 && (
          <>
            <p style={{ ...styles.hint, marginTop: 16, fontWeight: 700 }}>Dernières demandes traitées</p>
            {treated.map(p => (
              <div key={p.id} style={styles.treatedRow}>
                <span>
                  {`${p.parent?.first_name || ''} ${p.parent?.last_name || ''}`.trim() || p.parent?.email}
                  {' • '}<span style={styles.mono}>{p.transaction_ref}</span>
                </span>
                <span style={styles.treatedRight}>
                  <span style={{ color: p.status === 'approved' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                    {p.status === 'approved' ? 'Validé' : 'Refusé'}
                  </span>
                  {p.status === 'approved' && (
                    <button style={styles.receiptBtn} disabled={busyId === p.id} onClick={() => resendReceipt(p)}>
                      {p.receipt_sent_at ? 'Renvoyer le reçu' : 'Envoyer le reçu'}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={styles.title}>
          <SettingsIcon size={18} color="#1d4ed8" /> Réglages de paiement
        </h3>

        <label style={styles.label}>Mode d'encaissement</label>
        <select
          value={settings.payment_mode || 'manual'}
          onChange={e => setField('payment_mode', e.target.value)}
          style={styles.input}
        >
          <option value="manual">Manuel (le parent déclare, tu valides)</option>
          <option value="campay">Automatique (CamPay)</option>
        </select>
        {settings.payment_mode === 'campay' && (
          <p style={styles.warn}>
            À n'activer que si CamPay est configuré. En mode test CamPay, aucun vrai paiement n'est effectué.
          </p>
        )}

        <label style={styles.label}>Nom affiché aux parents</label>
        <input value={settings.pay_recipient_name || ''} onChange={e => setField('pay_recipient_name', e.target.value)} style={styles.input} />

        <label style={styles.label}>Code marchand Orange Money</label>
        <input value={settings.pay_orange_number || ''} onChange={e => setField('pay_orange_number', e.target.value)} placeholder="ex : 123456" style={styles.input} />
        <UssdPreview provider="orange" merchant={settings.pay_orange_number} />

        <label style={styles.label}>Code marchand MTN MoMo</label>
        <input value={settings.pay_mtn_number || ''} onChange={e => setField('pay_mtn_number', e.target.value)} placeholder="ex : 123456" style={styles.input} />
        <UssdPreview provider="mtn" merchant={settings.pay_mtn_number} />
        <p style={styles.hint}>
          Saisis seulement les chiffres du code marchand : le code USSD (ex. MTN <strong>*126*4*code*2500#</strong>) est
          composé automatiquement chez le parent. Pour un opérateur dont la séquence n'est pas connue, tu peux coller
          la séquence complète de la carte marchand (le montant s'écrit <strong>{'{amount}'}</strong>).
          <strong> Teste toi-même</strong> avant de laisser les parents payer.
        </p>

        <button style={styles.saveBtn} disabled={savingSettings} onClick={saveSettings}>
          {savingSettings ? 'Enregistrement...' : settingsSaved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  card: { background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(29, 78, 216,0.06)' },
  title: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 6 },
  hint: { fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.4 },
  empty: { fontSize: 13, color: '#94a3b8', padding: '8px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid #eff6ff', flexWrap: 'wrap' },
  rowTitle: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  provider: { fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 8 },
  rowMeta: { fontSize: 12, color: '#64748b', marginTop: 3 },
  mono: { fontFamily: 'monospace' },
  actions: { display: 'flex', gap: 8 },
  okBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 8, background: '#10b981', color: 'white', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' },
  noBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#ef4444', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' },
  notice: { fontSize: 12, lineHeight: 1.5, padding: 10, borderRadius: 10, marginBottom: 8 },
  noticeOk: { background: '#ecfdf5', color: '#065f46' },
  noticeWarn: { background: '#fffbeb', color: '#b45309' },
  treatedRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  receiptBtn: { background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  treatedRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#475569', padding: '6px 0', borderTop: '1px solid #f1f5f9' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#1e3a8a', margin: '12px 0 6px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #dbeafe', fontSize: 14, background: 'white' },
  warn: { fontSize: 12, color: '#b45309', background: '#fffbeb', padding: 10, borderRadius: 10, marginTop: 8 },
  saveBtn: { marginTop: 16, padding: '11px 18px', borderRadius: 10, background: '#1d4ed8', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }
}
