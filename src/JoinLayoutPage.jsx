import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { joinLayoutAsCollaborator, getLayoutForEditing } from './storage.js'

// The page an "Invite roommate" link opens: /layouts/:id/join. Deliberately a confirmation step,
// not an auto-join-on-load — joining grants real edit access to someone else's layout, so it
// gets the same "ask before a state-changing action" treatment as everything else in this app,
// not a silent side effect of a link preview crawler or an accidental click. Joining itself is a
// blind insert (see storage.js's joinLayoutAsCollaborator) — this page can't show a preview of
// the room before you join, since RLS won't let a not-yet-collaborator read it either.
export default function JoinLayoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()

  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const pageStyle = { maxWidth: 480, margin: '0 auto', padding: '60px 24px', fontFamily: 'var(--font-sans)', color: 'var(--ink)', textAlign: 'center' }

  async function handleJoin() {
    setJoining(true)
    setError('')
    try {
      await joinLayoutAsCollaborator(id)
      const layout = await getLayoutForEditing(id)
      if (!layout) throw new Error("Couldn't open that layout — the invite link may be broken.")
      navigate('/', { state: { loadLayout: layout, sharedLayoutId: id, openTab: 'cart' } })
    } catch (err) {
      setError(err.message)
      setJoining(false)
    }
  }

  if (authLoading) {
    return <div style={pageStyle}>Loading…</div>
  }

  return (
    <div style={pageStyle}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, fontSize: 22, marginBottom: 8 }}>You've been invited to help plan a room</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
        Joining gives you edit access — you'll be able to open this layout, move things around, and save changes just like the person who invited you.
      </p>
      {!session ? (
        <>
          <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 12 }}>Sign in on the main app first, then come back to this link.</p>
          <Link to="/" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>← Sign in on Dorm Room Planner</Link>
        </>
      ) : (
        <>
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999,
              padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: joining ? 'default' : 'pointer',
              opacity: joining ? 0.7 : 1,
            }}
          >
            {joining ? 'Joining…' : 'Join & open in editor'}
          </button>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 14 }}>{error}</div>}
          <div style={{ marginTop: 20 }}>
            <Link to="/" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>← Not now, take me to the app</Link>
          </div>
        </>
      )}
    </div>
  )
}
