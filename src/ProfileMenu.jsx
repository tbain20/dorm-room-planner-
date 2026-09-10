import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyProfile, searchProfiles, listFollowers, listFollowing, listMyFollowingIds, followUser, unfollowUser } from './storage.js'

// One row in any of the panel's three lists (search results / followers / following) — a name,
// an optional DESIGNER badge, and a Follow/Unfollow toggle for anyone but yourself. Clicking the
// row itself (not the button) opens that user's full profile — the already-built tab in App.jsx
// (bio, badges, public layouts) — rather than re-implementing that view here too.
function ProfileRow({ user, isFollowing, isSelf, onToggleFollow, onView }) {
  return (
    <div className="cart-row" onClick={() => onView(user.id)}>
      <div className="name">
        {user.display_name || 'Unnamed'}
        {user.is_designer && <span className="home-profile-badge">DESIGNER</span>}
      </div>
      {!isSelf && (
        <button
          className={`home-profile-follow-btn ${isFollowing ? 'is-following' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFollow(user.id, isFollowing) }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

export default function ProfileMenu({ session }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('search') // 'search' | 'followers' | 'following'
  const [profile, setProfile] = useState(null)
  const [followingIds, setFollowingIds] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [followers, setFollowers] = useState(null)
  const [following, setFollowing] = useState(null)
  const [listError, setListError] = useState('')
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => {})
    listMyFollowingIds().then((ids) => setFollowingIds(new Set(ids))).catch(() => {})
  }, [])

  useEffect(() => {
    function onClickAway(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  useEffect(() => {
    if (!open) return
    setListError('')
    if (view === 'followers' && followers === null) {
      listFollowers(session.user.id).then(setFollowers).catch((err) => setListError(err.message))
    } else if (view === 'following' && following === null) {
      listFollowing(session.user.id).then(setFollowing).catch((err) => setListError(err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    const handle = setTimeout(() => {
      searchProfiles(q)
        .then((rows) => setSearchResults(rows.filter((r) => r.id !== session.user.id)))
        .catch((err) => setListError(err.message))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function handleToggleFollow(userId, isFollowing) {
    setFollowingIds((prev) => {
      const next = new Set(prev)
      if (isFollowing) next.delete(userId)
      else next.add(userId)
      return next
    })
    try {
      if (isFollowing) await unfollowUser(userId)
      else await followUser(userId)
    } catch (err) {
      // Roll back on failure — the optimistic flip above was wrong.
      setFollowingIds((prev) => {
        const next = new Set(prev)
        if (isFollowing) next.add(userId)
        else next.delete(userId)
        return next
      })
      setListError(err.message)
    }
  }

  function viewProfile(userId) {
    setOpen(false)
    navigate('/app', { state: { viewProfileId: userId } })
  }

  const displayName = profile?.display_name || session.user.email

  const listForView = view === 'followers' ? followers : view === 'following' ? following : searchResults

  return (
    <div className="home-account-menu" ref={ref}>
      <button className="home-btn home-btn-ghost home-account-trigger" onClick={() => setOpen((o) => !o)}>
        {displayName} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="home-account-dropdown home-profile-panel">
          <input
            type="text"
            className="home-profile-search"
            placeholder="Find people…"
            value={query}
            onChange={(e) => { setView('search'); setQuery(e.target.value) }}
          />
          <div className="home-profile-tabs">
            <button className={`home-profile-tab ${view === 'followers' ? 'active' : ''}`} onClick={() => setView('followers')}>
              Followers{followers ? ` (${followers.length})` : ''}
            </button>
            <button className={`home-profile-tab ${view === 'following' ? 'active' : ''}`} onClick={() => setView('following')}>
              Following{following ? ` (${following.length})` : ''}
            </button>
          </div>
          <div className="home-profile-list">
            {listError && <div className="home-profile-error">{listError}</div>}
            {view === 'search' && searchLoading && <div className="empty-note">Searching…</div>}
            {view === 'search' && !searchLoading && query.trim() && listForView.length === 0 && (
              <div className="empty-note">No one found named "{query.trim()}".</div>
            )}
            {view !== 'search' && listForView === null && <div className="empty-note">Loading…</div>}
            {view !== 'search' && listForView && listForView.length === 0 && (
              <div className="empty-note">{view === 'followers' ? 'No followers yet.' : "You aren't following anyone yet."}</div>
            )}
            {listForView && listForView.map((user) => (
              <ProfileRow
                key={user.id}
                user={user}
                isSelf={user.id === session.user.id}
                isFollowing={followingIds.has(user.id)}
                onToggleFollow={handleToggleFollow}
                onView={viewProfile}
              />
            ))}
          </div>
          <button className="home-account-item home-profile-view-link" onClick={() => viewProfile(session.user.id)}>
            View your full profile →
          </button>
        </div>
      )}
    </div>
  )
}
