import { useState } from 'react'
import { supabase } from './supabaseClient.js'

const inputStyle = {
  padding: 9,
  border: '1px solid var(--paper-shadow)',
  borderRadius: 8,
  fontSize: 12.5,
}

export default function AuthPanel() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (!supabase) {
    return (
      <div className="empty-note">
        Accounts aren't configured yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> in a <code>.env</code> file (see{' '}
        <code>.env.example</code>) to enable sign-in and cloud-saved layouts.
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setNotice('Check your email to confirm your account, then sign in.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
        {mode === 'signin' ? 'Sign in to save layouts and your packing checklist, and access them anywhere.' : 'Create an account to save layouts and your packing checklist.'}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="email" placeholder="Email" value={email} required autoComplete="email" style={inputStyle} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          style={inputStyle}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: 10, fontSize: 12, fontWeight: 600, letterSpacing: '0.01em', cursor: 'pointer', borderRadius: 8 }}
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 8 }}>{error}</div>}
      {notice && <div style={{ fontSize: 11, marginTop: 8, color: 'var(--ink-soft)' }}>{notice}</div>}
      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError('')
          setNotice('')
        }}
        style={{ marginTop: 12, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: 0 }}
      >
        {mode === 'signin' ? "Need an account? Sign up" : 'Have an account? Sign in'}
      </button>
    </div>
  )
}
