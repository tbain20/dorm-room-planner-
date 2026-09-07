import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient.js'

// Signed-in account menu for the homepage nav (see HomePage.jsx). App.jsx's Saved tab already has
// its own inline "Signed in as X" + sign-out UI — this isn't a replacement for that, just the same
// small set of actions (see your rooms, sign out) surfaced in the new nav bar's account slot,
// since there's no separate profile/settings page in the app to link to yet.
export default function AccountMenu({ session, onContinue }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClickAway(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  return (
    <div className="home-account-menu" ref={ref}>
      <button className="home-btn home-btn-ghost home-account-trigger" onClick={() => setOpen((o) => !o)}>
        {session.user.email} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="home-account-dropdown">
          <div className="home-account-email">{session.user.email}</div>
          <button className="home-account-item" onClick={() => { setOpen(false); onContinue() }}>Your rooms</button>
          <button className="home-account-item" onClick={() => { setOpen(false); navigate('/app', { state: { openTab: 'checklist' } }) }}>Checklist</button>
          <button className="home-account-item home-account-signout" onClick={() => { setOpen(false); supabase.auth.signOut() }}>Sign out</button>
        </div>
      )}
    </div>
  )
}
