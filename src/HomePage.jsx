import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import AuthPanel from './AuthPanel.jsx'
import AccountMenu from './AccountMenu.jsx'
import RoomTypeIcon from './RoomTypeIcon.jsx'
import './homepage.css'

const ROOM_PANELS = [
  {
    type: 'single',
    label: 'Single',
    caption: 'One person, one room — start from Colgate’s real standard-issue layout.',
  },
  {
    type: 'double',
    label: 'Double',
    caption: 'Sharing with a roommate? Lay out two of everything without the guesswork.',
  },
  {
    type: 'triple',
    label: 'Triple',
    caption: 'Three residents, one room — plan who goes where before move-in day.',
  },
  {
    type: 'common',
    label: 'Common Room',
    caption: 'A shared lounge space, not a bedroom — arrives furnished with seating and a TV.',
  },
]

// The marketing "front door" shown at / (see main.jsx) — distinct from the app's own tab-based
// editor interface, which now lives at /app. Signed-in visitors still land here first (confirmed
// with Tyler) and get an extra "continue to your rooms" path instead of being routed past it.
export default function HomePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)

  // Signing in from the nav's popover should close it automatically rather than leaving a stale
  // "sign in" form open behind the account menu that just replaced it.
  useEffect(() => {
    if (session) setShowAuth(false)
  }, [session])

  function startRoom(type) {
    navigate('/app', { state: { newRoom: { type } } })
  }

  function startDesigner() {
    navigate('/design')
  }

  function continueToRooms() {
    navigate('/app', { state: { openTab: 'saved' } })
  }

  // A plain #room-types anchor would need global `html { scroll-behavior: smooth }` (index.css is
  // shared by every route, including the fixed-viewport editor, so that's not a safe blanket
  // change) — scrolling manually here keeps the smooth behavior scoped to just this page.
  function scrollToRoomTypes(e) {
    e.preventDefault()
    document.getElementById('room-types')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-nav-inner">
          <div className="home-logo">Dorm Room Planner</div>
          <div className="home-nav-actions">
            <button className="home-btn home-btn-browse" onClick={() => navigate('/browse')}>Browse</button>
            {session ? (
              <AccountMenu session={session} onContinue={continueToRooms} />
            ) : (
              <button className="home-btn home-btn-ghost" onClick={() => setShowAuth(true)}>Sign in</button>
            )}
          </div>
        </div>
      </header>

      <section className="home-hero">
        <h1>Dorm Room Planner</h1>
        <p className="home-tagline">
          Plan your dorm room in 3D, shop the exact furniture, and browse real student rooms for inspiration.
        </p>
        <div className="home-hero-actions">
          <a className="home-btn home-btn-primary" href="#room-types" onClick={scrollToRoomTypes}>Start Your Room</a>
          {session && (
            <button className="home-btn home-btn-ghost home-hero-continue" onClick={continueToRooms}>
              Continue to your rooms →
            </button>
          )}
        </div>
      </section>

      <section id="room-types" className="home-room-types">
        <h2>Pick your room type</h2>
        <p className="home-section-sub">Jump straight into the editor, pre-sized for your room.</p>
        <div className="home-room-grid">
          {ROOM_PANELS.map((p) => (
            <button key={p.type} className="home-room-panel" onClick={() => startRoom(p.type)}>
              <div className="home-room-panel-visual">
                <RoomTypeIcon variant={p.type} />
              </div>
              <div className="home-room-panel-label">{p.label}</div>
              <div className="home-room-panel-caption">{p.caption}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="home-room-designer-cta">
        <h2>Designing a whole house or apartment instead?</h2>
        <p className="home-section-sub">
          Use the general Room Designer — the same 3D editor, generic furniture (no Colgate-only
          pieces), any bed size from Twin to King, and as many rooms as your place actually has.
        </p>
        <button className="home-btn home-btn-primary" onClick={startDesigner}>Open Room Designer →</button>
      </section>

      <section className="home-feature">
        <div className="home-feature-text">
          <h2>See real rooms, not stock photos</h2>
          <p>
            Browse layouts other students actually built, get inspired by how they made a small
            room work, and copy any of them straight into your own editor to customize.
          </p>
          <button className="home-link-btn" onClick={() => navigate('/browse')}>Browse student rooms →</button>
        </div>
      </section>

      <section className="home-feature home-feature-alt">
        <div className="home-feature-text">
          <h2>A real 3D room builder</h2>
          <p>
            Enter your room's actual dimensions, drag furniture in from the catalog, and see
            exactly what fits — and what doesn't — before you buy a single thing.
          </p>
        </div>
      </section>

      <section className="home-feature">
        <div className="home-feature-text">
          <h2>Shop the exact items</h2>
          <p>
            Every piece of furniture in the catalog links to a real, curated product you can
            actually buy — not a generic placeholder standing in for "something like this."
          </p>
        </div>
      </section>

      <section className="home-feature home-feature-alt">
        <div className="home-feature-text">
          <h2>Built for Colgate</h2>
          <p>
            The furniture Colgate already provides — bed, desk, chair, dresser — is modeled to
            match exactly what's in Colgate dorms, down to the real dimensions, not generic stock
            furniture.
          </p>
        </div>
      </section>

      <footer className="home-footer">
        <span>Dorm Room Planner</span>
        <span className="home-footer-links">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </span>
      </footer>

      {showAuth && (
        <div className="home-modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <button className="home-modal-close" onClick={() => setShowAuth(false)} aria-label="Close">×</button>
            <AuthPanel />
          </div>
        </div>
      )}
    </div>
  )
}
