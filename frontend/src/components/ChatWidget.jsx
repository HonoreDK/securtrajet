import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { MessageCircle, X, Send, Loader2, Bot } from 'lucide-react'

const GREETING = "Bonjour 👋 Je suis l'assistant SecurTrajet. Pose-moi tes questions sur l'utilisation de l'application, ou demande-moi des conseils de sécurité pour tes enfants."

export default function ChatWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  if (!user) return null

  const send = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const next = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('chatbot', {
        body: { messages: next }
      })
      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)
      setMessages([...next, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setError(err.message || "L'assistant est momentanément indisponible.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <div style={styles.panel}>
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <div style={styles.headerIcon}><Bot size={16} color="white" /></div>
              <span style={styles.headerTitle}>Assistant SecurTrajet</span>
            </div>
            <button style={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>

          <div style={styles.messages} ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} style={{ ...styles.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={m.role === 'user' ? styles.bubbleUser : styles.bubbleBot}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.bubbleRow, justifyContent: 'flex-start' }}>
                <div style={styles.bubbleBot}>
                  <Loader2 size={14} className="spin" />
                </div>
              </div>
            )}
            {error && <p style={styles.errorText}>{error}</p>}
          </div>

          <form onSubmit={send} style={styles.inputRow}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Écris ta question..."
              style={styles.input}
              disabled={loading}
            />
            <button type="submit" style={styles.sendBtn} disabled={loading || !input.trim()} aria-label="Envoyer">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button style={styles.fab} onClick={() => setOpen(o => !o)} aria-label="Assistant SecurTrajet">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}

const styles = {
  fab: {
    position: 'fixed', bottom: 20, right: 20, zIndex: 1200,
    width: 52, height: 52, borderRadius: '50%',
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', boxShadow: '0 8px 24px rgba(29,78,216,0.35)', cursor: 'pointer'
  },
  panel: {
    position: 'fixed', bottom: 84, right: 20, zIndex: 1200,
    width: 340, maxWidth: 'calc(100vw - 40px)', height: 460, maxHeight: 'calc(100vh - 140px)',
    background: 'white', borderRadius: 18, boxShadow: '0 12px 40px rgba(15,23,42,0.2)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: '#1d4ed8', color: 'white'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: 14, fontWeight: 600 },
  closeBtn: { background: 'transparent', color: 'white', padding: 4, border: 'none', cursor: 'pointer' },
  messages: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#eff6ff' },
  bubbleRow: { display: 'flex' },
  bubbleUser: {
    background: '#1d4ed8', color: 'white', padding: '9px 13px', borderRadius: '14px 14px 2px 14px',
    fontSize: 13, maxWidth: '80%', lineHeight: 1.4
  },
  bubbleBot: {
    background: 'white', color: '#1e293b', padding: '9px 13px', borderRadius: '14px 14px 14px 2px',
    fontSize: 13, maxWidth: '80%', lineHeight: 1.4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  errorText: { color: '#ef4444', fontSize: 12, textAlign: 'center' },
  inputRow: { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #dbeafe', background: 'white' },
  input: {
    flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #dbeafe', fontSize: 13, minWidth: 0
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 10, background: '#1d4ed8', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0
  }
}
