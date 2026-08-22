import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import {
  listPublicLayouts, listDistinctHalls, listDistinctTags, listFeaturedCollections, listMyFollowingIds,
  listMyLikedLayoutIds, likeLayout, unlikeLayout, copyLayout,
  listMyBoardsWithLayouts, createBoard, addLayoutToBoard, removeLayoutFromBoard,
} from './storage.js'
import BrowseLayoutCard from './BrowseLayoutCard.jsx'

// room_type is free text at the DB level (see migration 006) but the app only ever writes one of
// these three — same small constant App.jsx keeps for the publish-prompt dropdown, duplicated
// here rather than exported/shared since it's three literal strings, not worth a module for.
const ROOM_TYPES = ['single', 'double', 'triple']

const PAGE_SIZE = 24

// The Pinterest-style masonry gallery, as its own full-width route rather than a tab squeezed
// into the app's 340px sidebar — a real multi-column masonry grid needs more room than that, and
// this is also where Browse's filter chips/dropdowns, the featured strip, and infinite scroll
// all live now (moved out of App.jsx wholesale — see that file's Browse-tab removal). Every
// action here (like/save/copy) is self-contained rather than calling back into App.jsx, the same
// way LayoutDetailPage.jsx already works independently — this page can't reach into App's
// RoomEngine instance since it's a different route entirely; "load this into my room" and
// "view this person's profile" instead hand off via router state to an effect in App.jsx that
// picks it up on landing (see the `location.state` effect there).
export default function BrowsePage() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [layouts, setLayouts] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [hallFilter, setHallFilter] = useState('')
  const [roomTypeFilter, setRoomTypeFilter] = useState('')
  const [tagFilters, setTagFilters] = useState(() => new Set())
  const [followingOnlyFilter, setFollowingOnlyFilter] = useState(false)
  const [followingIds, setFollowingIds] = useState(() => new Set())

  const [distinctHalls, setDistinctHalls] = useState([])
  const [distinctTags, setDistinctTags] = useState([])
  const [featuredCollections, setFeaturedCollections] = useState([])

  const [likedIds, setLikedIds] = useState(() => new Set())
  const [boards, setBoards] = useState([])
  const [openSaveMenuFor, setOpenSaveMenuFor] = useState(null)

  const sentinelRef = useRef(null)

  useEffect(() => {
    document.title = 'Browse — Dorm Room Planner'
  }, [])

  // Session-scoped state — cleared, not just left stale, on sign-out so a shared/public computer
  // doesn't keep showing the previous user's hearts/boards after they log out.
  useEffect(() => {
    if (!session) {
      setLikedIds(new Set())
      setBoards([])
      setFollowingIds(new Set())
      return
    }
    listMyLikedLayoutIds().then((ids) => setLikedIds(new Set(ids))).catch(() => {})
    listMyBoardsWithLayouts().then(setBoards).catch(() => {})
    listMyFollowingIds().then((ids) => setFollowingIds(new Set(ids))).catch(() => {})
  }, [session])

  // Filter chrome (halls/tags/featured) — independent of the paginated layout list itself, fetched
  // once rather than re-fetched on every filter change.
  useEffect(() => {
    listDistinctHalls().then(setDistinctHalls).catch(() => {})
    listDistinctTags().then(setDistinctTags).catch(() => {})
    listFeaturedCollections().then(setFeaturedCollections).catch(() => {})
  }, [])

  // Any filter changing means "start over" — reset to an empty list and page 1, not append.
  useEffect(() => {
    setLoading(true)
    setError('')
    setLayouts([])
    setHasMore(true)
    const authorIds = followingOnlyFilter ? [...followingIds] : undefined
    const tags = tagFilters.size > 0 ? [...tagFilters] : undefined
    listPublicLayouts({ hall: hallFilter || undefined, roomType: roomTypeFilter || undefined, authorIds, tags, limit: PAGE_SIZE, offset: 0 })
      .then((rows) => {
        setLayouts(rows)
        setOffset(rows.length)
        setHasMore(rows.length === PAGE_SIZE)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [hallFilter, roomTypeFilter, followingOnlyFilter, followingIds, tagFilters])

  // Appends the next page at the current offset — same filters as whatever's currently active, so
  // scrolling further never resets or drops the active hall/room-type/tag/following filter.
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    const authorIds = followingOnlyFilter ? [...followingIds] : undefined
    const tags = tagFilters.size > 0 ? [...tagFilters] : undefined
    listPublicLayouts({ hall: hallFilter || undefined, roomType: roomTypeFilter || undefined, authorIds, tags, limit: PAGE_SIZE, offset })
      .then((rows) => {
        setLayouts((prev) => [...prev, ...rows])
        setOffset((prev) => prev + rows.length)
        setHasMore(rows.length === PAGE_SIZE)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMore(false))
  }, [loading, loadingMore, hasMore, offset, hallFilter, roomTypeFilter, followingOnlyFilter, followingIds, tagFilters])

  // Standard intersection-observer infinite scroll — a tall rootMargin means the next page starts
  // loading a bit before the sentinel actually enters the viewport, so scrolling fast doesn't
  // outrun the fetch and show a dead-end blank gap at the bottom.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '800px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  function toggleTagFilter(tag) {
    setTagFilters((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // No AuthPanel on this page — sign-in lives in App.jsx's Saved tab. Router state tells the app
  // shell to land on that tab, same mechanism "load this layout" already uses.
  function requireSignIn() {
    navigate('/', { state: { openTab: 'saved' } })
  }

  function handleView(layout) {
    navigate('/', { state: { loadLayout: layout } })
  }

  function handleViewDetails(layout) {
    navigate(`/layouts/${layout.id}`)
  }

  function handleViewProfile(layout) {
    if (!layout.authorId) return
    navigate('/', { state: { viewProfileId: layout.authorId } })
  }

  async function handleToggleLike(layout) {
    if (!session) return requireSignIn()
    const isLiked = likedIds.has(layout.id)
    setError('')
    try {
      if (isLiked) {
        await unlikeLayout(layout.id)
        setLikedIds((prev) => {
          const next = new Set(prev)
          next.delete(layout.id)
          return next
        })
      } else {
        await likeLayout(layout.id)
        setLikedIds((prev) => new Set(prev).add(layout.id))
      }
      setLayouts((prev) =>
        prev.map((l) => (l.id === layout.id ? { ...l, likesCount: Math.max(0, l.likesCount + (isLiked ? -1 : 1)) } : l))
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCopy(layout) {
    if (!session) return requireSignIn()
    setError('')
    setNotice('')
    try {
      const name = await copyLayout(layout)
      setNotice(`Copied to your layouts as "${name}". Loading it into your room…`)
      navigate('/', { state: { loadLayout: layout } })
    } catch (err) {
      setError(err.message)
    }
  }

  function handleOpenSaveMenu(layout) {
    if (!session) return requireSignIn()
    setOpenSaveMenuFor((prev) => (prev === layout.id ? null : layout.id))
  }

  async function handleCreateBoardAndAdd(layout, name) {
    const board = await createBoard(name)
    await addLayoutToBoard(board.id, layout.id)
    setBoards((prev) => [...prev, { ...board, layouts: [layout] }])
  }

  async function handleToggleBoardMembership(layout, board, willBeMember) {
    if (willBeMember) {
      await addLayoutToBoard(board.id, layout.id)
      setBoards((prev) =>
        prev.map((b) => (b.id === board.id ? { ...b, layouts: [layout, ...b.layouts.filter((l) => l.id !== layout.id)] } : b))
      )
    } else {
      await removeLayoutFromBoard(board.id, layout.id)
      setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, layouts: b.layouts.filter((l) => l.id !== layout.id) } : b)))
    }
  }

  const savedLayoutIds = new Set(boards.flatMap((b) => b.layouts.map((l) => l.id)))

  return (
    <div className="browse-page">
      <div className="browse-header">
        <Link to="/" className="browse-back-link">← Dorm Room Planner</Link>
        <div className="browse-header-row">
          <h1>Browse</h1>
          <Link to="/" state={{ openTab: 'leaderboard' }} className="browse-leaderboard-link">🏆 Leaderboard</Link>
        </div>
        <div className="browse-intro">
          Layouts other students have made public. Copy one to start from it, load it into 3D first, or{' '}
          <Link to="/">start from scratch</Link>.
        </div>
      </div>

      {featuredCollections.length > 0 && (
        <div className="browse-featured">
          {featuredCollections.map((collection) => (
            <div key={collection.id} className="browse-featured-collection">
              <div className="browse-featured-title">✨ {collection.title}</div>
              {collection.description && <div className="browse-featured-desc">{collection.description}</div>}
              <div className="browse-featured-strip">
                {collection.layouts.map((layout) => (
                  <div key={layout.id} className="browse-featured-item" onClick={() => handleView(layout)} title="Load into your room">
                    {layout.thumbnailUrl ? <img src={layout.thumbnailUrl} alt={layout.name} /> : <div className="browse-featured-item-fallback">🏠</div>}
                    <div className="browse-featured-item-name">{layout.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {distinctTags.length > 0 && (
        <div className="browse-tag-chips">
          {distinctTags.map((t) => (
            <button key={t} className={`browse-chip ${tagFilters.has(t) ? 'active' : ''}`} onClick={() => toggleTagFilter(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="browse-filters">
        <select value={hallFilter} onChange={(e) => setHallFilter(e.target.value)}>
          <option value="">All halls</option>
          {distinctHalls.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select value={roomTypeFilter} onChange={(e) => setRoomTypeFilter(e.target.value)} style={{ textTransform: 'capitalize' }}>
          <option value="">All room types</option>
          {ROOM_TYPES.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
        {session && (
          <label className="browse-following-toggle">
            <input type="checkbox" checked={followingOnlyFilter} onChange={(e) => setFollowingOnlyFilter(e.target.checked)} />
            Following only
          </label>
        )}
      </div>

      {notice && <div className="browse-notice">{notice}</div>}
      {error && <div className="browse-error">{error}</div>}

      {loading ? (
        <div className="browse-empty">Loading…</div>
      ) : followingOnlyFilter && followingIds.size === 0 ? (
        <div className="browse-empty">You're not following anyone yet. Click a layout's creator name to visit their profile and follow them.</div>
      ) : layouts.length === 0 ? (
        <div className="browse-empty">
          {hallFilter || roomTypeFilter || tagFilters.size > 0 ? 'No public layouts match this filter yet.' : 'No public layouts yet. Publish one of your own from the Saved tab to be the first.'}
        </div>
      ) : (
        <>
          <div className="gallery-grid">
            {layouts.map((layout) => (
              <BrowseLayoutCard
                key={layout.id}
                layout={layout}
                liked={likedIds.has(layout.id)}
                saved={savedLayoutIds.has(layout.id)}
                signedIn={!!session}
                onView={() => handleView(layout)}
                onToggleLike={() => handleToggleLike(layout)}
                onOpenSaveMenu={() => handleOpenSaveMenu(layout)}
                onCopy={() => handleCopy(layout)}
                onViewDetails={() => handleViewDetails(layout)}
                onViewProfile={() => handleViewProfile(layout)}
                saveMenuOpen={openSaveMenuFor === layout.id}
                saveMenuProps={{
                  boards,
                  memberBoardIds: new Set(boards.filter((b) => b.layouts.some((l) => l.id === layout.id)).map((b) => b.id)),
                  onToggle: (board, willBeMember) => handleToggleBoardMembership(layout, board, willBeMember),
                  onCreate: (name) => handleCreateBoardAndAdd(layout, name),
                  onClose: () => setOpenSaveMenuFor(null),
                }}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="browse-sentinel">
            {loadingMore && 'Loading more…'}
            {!hasMore && !loadingMore && layouts.length > 0 && "You've reached the end."}
          </div>
        </>
      )}
    </div>
  )
}
