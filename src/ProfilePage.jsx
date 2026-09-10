import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import AuthPanel from './AuthPanel.jsx'
import RoomFallbackIcon from './RoomFallbackIcon.jsx'
import {
  getPublicProfile, listFollowers, listFollowing, searchProfiles,
  followUser, unfollowUser, listMyFollowingIds, updateMyProfile, uploadAvatar,
} from './storage.js'

// A small fixed set of avatar choices that need no image file at all — just an emoji over a
// color, referenced by id ('preset-3') in profiles.avatar_url instead of a URL. Anyone who'd
// rather use a real photo can upload one instead (see AvatarEditor's file input) — that path
// stores a real https URL in the same column, so rendering just checks which shape it got.
const AVATAR_PRESETS = [
  { id: 'preset-1', emoji: '🦊', bg: '#e2a76f' },
  { id: 'preset-2', emoji: '🐢', bg: '#8a9a7b' },
  { id: 'preset-3', emoji: '🐙', bg: '#8a6fae' },
  { id: 'preset-4', emoji: '🐝', bg: '#e0b23a' },
  { id: 'preset-5', emoji: '🐬', bg: '#5a8fae' },
  { id: 'preset-6', emoji: '🦉', bg: '#7a6a56' },
  { id: 'preset-7', emoji: '🐨', bg: '#9a9a9a' },
  { id: 'preset-8', emoji: '🌵', bg: '#6a9a6a' },
]

function Avatar({ url, name, size = 44 }) {
  const preset = AVATAR_PRESETS.find((p) => p.id === url)
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, overflow: 'hidden',
  }
  if (preset) return <div style={{ ...style, background: preset.bg }}>{preset.emoji}</div>
  if (url) return <img src={url} alt="" style={{ ...style, objectFit: 'cover' }} />
  return (
    <div style={{ ...style, background: 'var(--paper-shadow)', color: 'var(--ink-soft)', fontWeight: 700 }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

function AvatarEditor({ currentUrl, onPicked, onClose }) {
  const fileInputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const url = await uploadAvatar(file)
      await updateMyProfile({ avatarUrl: url })
      onPicked(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function pickPreset(id) {
    setBusy(true)
    setError('')
    try {
      await updateMyProfile({ avatarUrl: id })
      onPicked(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-avatar-editor">
      <div className="profile-avatar-preset-grid">
        {AVATAR_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`profile-avatar-preset ${currentUrl === p.id ? 'active' : ''}`}
            style={{ background: p.bg }}
            onClick={() => pickPreset(p.id)}
            disabled={busy}
          >
            {p.emoji}
          </button>
        ))}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="structure-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload a photo'}
        </button>
        <button className="structure-btn" onClick={onClose}>Done</button>
      </div>
      {error && <div className="board-popover-error">{error}</div>}
    </div>
  )
}

function PersonRow({ user, isFollowing, isSelf, onToggleFollow, navigate }) {
  return (
    <div className="profile-row" onClick={() => navigate(`/profile/${user.id}`)}>
      <Avatar url={user.avatar_url} name={user.display_name} size={32} />
      <div className="profile-row-name">
        {user.display_name || 'Unnamed'}
        {user.is_designer && <span className="profile-badge">DESIGNER</span>}
      </div>
      {!isSelf && onToggleFollow && (
        <button
          className={`profile-follow-btn ${isFollowing ? 'is-following' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFollow(user.id, isFollowing) }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { id } = useParams()
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const targetId = id || session?.user?.id
  const isSelf = !!session && targetId === session.user.id

  const [profile, setProfile] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [myFollowingIds, setMyFollowingIds] = useState(() => new Set())
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [hallDraft, setHallDraft] = useState('')
  const [classYearDraft, setClassYearDraft] = useState('')
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [listView, setListView] = useState(null) // null | 'followers' | 'following'
  const [followers, setFollowers] = useState(null)
  const [following, setFollowing] = useState(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!targetId) return
    setProfile(null)
    setNotFound(false)
    setListView(null)
    setFollowers(null)
    setFollowing(null)
    setQuery('')
    getPublicProfile(targetId).then((data) => {
      if (!data) { setNotFound(true); return }
      setProfile(data)
      setBioDraft(data.bio || '')
      setHallDraft(data.displayHall || '')
      setClassYearDraft(data.classYear || '')
    }).catch((err) => setError(err.message))
  }, [targetId])

  useEffect(() => {
    if (!session) return
    listMyFollowingIds().then((ids) => setMyFollowingIds(new Set(ids))).catch(() => {})
  }, [session])

  useEffect(() => {
    if (listView === 'followers' && followers === null) {
      listFollowers(targetId).then(setFollowers).catch((err) => setError(err.message))
    } else if (listView === 'following' && following === null) {
      listFollowing(targetId).then(setFollowing).catch((err) => setError(err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listView, targetId])

  useEffect(() => {
    if (!isSelf) return
    const q = query.trim()
    if (!q) { setSearchResults([]); return }
    setSearchLoading(true)
    const handle = setTimeout(() => {
      searchProfiles(q)
        .then((rows) => setSearchResults(rows.filter((r) => r.id !== session.user.id)))
        .catch((err) => setError(err.message))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isSelf])

  async function handleToggleFollow(userId, isFollowing) {
    setMyFollowingIds((prev) => {
      const next = new Set(prev)
      if (isFollowing) next.delete(userId)
      else next.add(userId)
      return next
    })
    if (userId === targetId) {
      setProfile((prev) => prev && { ...prev, followerCount: prev.followerCount + (isFollowing ? -1 : 1) })
    }
    try {
      if (isFollowing) await unfollowUser(userId)
      else await followUser(userId)
    } catch (err) {
      setMyFollowingIds((prev) => {
        const next = new Set(prev)
        if (isFollowing) next.add(userId)
        else next.delete(userId)
        return next
      })
      if (userId === targetId) {
        setProfile((prev) => prev && { ...prev, followerCount: prev.followerCount + (isFollowing ? 1 : -1) })
      }
      setError(err.message)
    }
  }

  async function saveBio() {
    setError('')
    try {
      await updateMyProfile({ bio: bioDraft, displayHall: hallDraft, classYear: classYearDraft })
      setProfile((prev) => prev && { ...prev, bio: bioDraft, displayHall: hallDraft, classYear: classYearDraft })
      setEditingBio(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (authLoading) return null

  if (!session && !id) {
    return (
      <div className="profile-page">
        <Link to="/" className="browse-back-link">← Dorm Room Planner</Link>
        <h1 style={{ fontFamily: 'var(--font-serif)', marginTop: 16 }}>Profile</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginBottom: 20 }}>Sign in to see your profile.</p>
        <AuthPanel />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="profile-page">
        <Link to="/" className="browse-back-link">← Dorm Room Planner</Link>
        <div className="empty-note" style={{ marginTop: 20 }}>This profile doesn't exist.</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <Link to="/" className="browse-back-link">← Dorm Room Planner</Link>
        <div className="empty-note" style={{ marginTop: 20 }}>Loading…</div>
      </div>
    )
  }

  const listForView = listView === 'followers' ? followers : listView === 'following' ? following : null

  return (
    <div className="profile-page">
      <Link to="/" className="browse-back-link">← Dorm Room Planner</Link>
      {error && <div className="board-popover-error" style={{ marginTop: 10 }}>{error}</div>}

      <div className="profile-header">
        <div style={{ position: 'relative' }}>
          <Avatar url={profile.avatarUrl} name={profile.displayName} size={88} />
          {isSelf && (
            <button className="profile-avatar-edit-btn" onClick={() => setEditingAvatar((v) => !v)}>✎</button>
          )}
        </div>
        <div className="profile-header-info">
          <h1>
            {profile.displayName || 'Unnamed'}
            {profile.isDesigner && <span className="profile-badge">DESIGNER</span>}
          </h1>
          {(profile.displayHall || profile.classYear) && (
            <div className="profile-submeta">
              {[profile.displayHall, profile.classYear && `Class of ${profile.classYear}`].filter(Boolean).join(' · ')}
            </div>
          )}
          {!isSelf && session && (
            <button
              className={`profile-follow-btn ${myFollowingIds.has(targetId) ? 'is-following' : ''}`}
              onClick={() => handleToggleFollow(targetId, myFollowingIds.has(targetId))}
              style={{ marginTop: 8 }}
            >
              {myFollowingIds.has(targetId) ? 'Following' : 'Follow'}
            </button>
          )}
          {!isSelf && !session && (
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
              <Link to="/" style={{ color: 'var(--accent)' }}>Sign in</Link> to follow
            </span>
          )}
        </div>
      </div>

      {isSelf && editingAvatar && (
        <AvatarEditor
          currentUrl={profile.avatarUrl}
          onPicked={(url) => { setProfile((prev) => ({ ...prev, avatarUrl: url })); setEditingAvatar(false) }}
          onClose={() => setEditingAvatar(false)}
        />
      )}

      <div className="profile-bio-section">
        {isSelf && editingBio ? (
          <>
            <textarea
              className="profile-bio-textarea"
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              rows={3}
              placeholder="A short bio…"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="profile-bio-textarea"
                style={{ flex: 1 }}
                placeholder="Hall (e.g. Curtis Hall)"
                value={hallDraft}
                onChange={(e) => setHallDraft(e.target.value)}
              />
              <input
                className="profile-bio-textarea"
                style={{ flex: 1 }}
                placeholder="Class year"
                value={classYearDraft}
                onChange={(e) => setClassYearDraft(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="structure-btn" onClick={saveBio}>Save</button>
              <button
                className="structure-btn"
                onClick={() => {
                  setBioDraft(profile.bio || '')
                  setHallDraft(profile.displayHall || '')
                  setClassYearDraft(profile.classYear || '')
                  setEditingBio(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="profile-bio-text">{profile.bio || (isSelf ? 'Add a short bio…' : '')}</p>
            {isSelf && <button className="profile-edit-link" onClick={() => setEditingBio(true)}>Edit bio & details</button>}
          </>
        )}
      </div>

      <div className="profile-stats-row">
        <button className={`profile-stat ${listView === 'followers' ? 'active' : ''}`} onClick={() => setListView((v) => (v === 'followers' ? null : 'followers'))}>
          <strong>{profile.followerCount}</strong> follower{profile.followerCount === 1 ? '' : 's'}
        </button>
        <button className={`profile-stat ${listView === 'following' ? 'active' : ''}`} onClick={() => setListView((v) => (v === 'following' ? null : 'following'))}>
          <strong>{profile.followingCount}</strong> following
        </button>
        <span className="profile-stat" style={{ cursor: 'default' }}>
          <strong>{profile.layouts.length}</strong> public design{profile.layouts.length === 1 ? '' : 's'}
        </span>
      </div>

      {isSelf && (
        <input
          type="text"
          className="profile-search-input"
          placeholder="Find friends…"
          value={query}
          onChange={(e) => { setListView(null); setQuery(e.target.value) }}
        />
      )}

      {query.trim() && isSelf ? (
        <div className="profile-list">
          {searchLoading && <div className="empty-note">Searching…</div>}
          {!searchLoading && searchResults.length === 0 && <div className="empty-note">No one found named "{query.trim()}".</div>}
          {searchResults.map((u) => (
            <PersonRow key={u.id} user={u} isSelf={false} isFollowing={myFollowingIds.has(u.id)} onToggleFollow={handleToggleFollow} navigate={navigate} />
          ))}
        </div>
      ) : listView && (
        <div className="profile-list">
          {listForView === null && <div className="empty-note">Loading…</div>}
          {listForView && listForView.length === 0 && (
            <div className="empty-note">{listView === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</div>
          )}
          {listForView && listForView.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              isSelf={session && u.id === session.user.id}
              isFollowing={myFollowingIds.has(u.id)}
              onToggleFollow={session ? handleToggleFollow : null}
              navigate={navigate}
            />
          ))}
        </div>
      )}

      <h2 className="profile-section-title">Public Room Designs</h2>
      {profile.layouts.length === 0 ? (
        <div className="empty-note">{isSelf ? "You haven't published any designs yet." : "No public designs yet."}</div>
      ) : (
        <div className="gallery-grid">
          {profile.layouts.map((l) => (
            <div key={l.id} className="gallery-card">
              <Link to={`/layouts/${l.id}`} className="gallery-card-media" style={{ display: 'block' }}>
                {l.thumbnailUrl ? <img src={l.thumbnailUrl} alt={l.name} /> : <div className="gallery-card-media-fallback"><RoomFallbackIcon /></div>}
              </Link>
              <div className="profile-design-caption">
                <Link to={`/layouts/${l.id}`} className="profile-design-name">{l.name}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
