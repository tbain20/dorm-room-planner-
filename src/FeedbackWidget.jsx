import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { submitFeedback } from './storage.js'

// Mounted once at the top level (main.jsx, alongside <Analytics />) rather than embedded in any
// one page's own footer — this app has no single shared layout (App.jsx's 3D editor, the
// marketing HomePage, and every standalone page like /browse or /layouts/:id all render
// independently), so a top-level mount is the only way for this to actually be reachable from
// every page as asked, not just the marketing homepage's own <footer>.
const inputStyle = {
  padding: 9,
  border: '1px solid var(--paper-shadow)',
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: 'inherit',
}

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Same graceful-degradation pattern as AuthPanel — no Supabase configured means no feedback
  // table to write to, so there's nothing useful this widget could do.
  if (!supabase) return null

  function close() {
    setOpen(false)
    setMessage('')
    setEmail('')
    setError('')
    setSent(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError('')
    try {
      await submitFeedback(message.trim(), email.trim(), window.location.href)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        style={{
          // Bottom-left, raised above the editor's own bottom-left drag/rotate hint (#hint, see
          // index.css) rather than sitting on the very corner — tested live and every other corner
          // collides with something on at least one page: bottom-right has "+ New Room" in the
          // editor and "Get shopping list" in the sidebar, top-right has the homepage's account
          // menu, top-left/mid-left run into the editor's Room Planner card.
          position: 'fixed', bottom: 54, left: 14, zIndex: 999,
          background: 'var(--paper)', color: 'var(--ink-soft)', border: '1px solid var(--paper-shadow)',
          borderRadius: 999, padding: '7px 13px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          boxShadow: 'var(--shadow-card)', fontFamily: 'var(--font-sans)',
        }}
      >
        💬 Feedback
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(37, 29, 20, 0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', background: 'var(--paper)', color: 'var(--ink)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lift)',
              width: '100%', maxWidth: 380, padding: 20, fontFamily: 'var(--font-sans)',
            }}
          >
            <button
              onClick={close}
              aria-label="Close"
              style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', fontSize: 20, lineHeight: 1, color: 'var(--ink-soft)', cursor: 'pointer', padding: 6 }}
            >
              ×
            </button>

            {sent ? (
              <div style={{ padding: '22px 4px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 650, fontFamily: 'var(--font-serif)', marginBottom: 4 }}>Thanks, got it!</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>We read every note.</div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, fontSize: 18, marginBottom: 4 }}>Send feedback</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14 }}>
                  Bug, idea, or just a thought — goes straight to us.
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    placeholder="What's on your mind?"
                    value={message}
                    required
                    rows={4}
                    autoFocus
                    style={{ ...inputStyle, resize: 'vertical' }}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <input
                    type="email"
                    placeholder="Email (optional, if you want a reply)"
                    value={email}
                    style={inputStyle}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={busy || !message.trim()}
                    style={{
                      background: 'var(--accent)', color: '#fff', border: 'none', padding: 10,
                      fontSize: 12, fontWeight: 600, letterSpacing: '0.01em', cursor: 'pointer',
                      borderRadius: 8, opacity: busy || !message.trim() ? 0.6 : 1,
                    }}
                  >
                    {busy ? 'Sending…' : 'Send feedback'}
                  </button>
                </form>
                {error && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 8 }}>{error}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
