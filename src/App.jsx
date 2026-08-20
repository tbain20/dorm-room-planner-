import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RoomEngine } from './roomEngine.js'
import { CATALOG, CATEGORY_ORDER, CATEGORY_ICONS, PROVIDED_CATALOG, colgateDefaultLayout, retailerLink, thumbnailUrl, resolveRelatedItems } from './catalog.js'
import { CHECKLIST_CATEGORY_ORDER } from './checklistItems.js'
import {
  saveLayout, listLayouts, deleteLayout, setLayoutPublic, listPublicLayouts, copyLayout, getMyProfile,
  listChecklistItems, setChecklistItemChecked, addChecklistItem, deleteChecklistItem,
  listDistinctHalls, incrementLayoutViewCount, likeLayout, unlikeLayout, listMyLikedLayoutIds,
  saveLayoutBookmark, unsaveLayoutBookmark, listMySavedLayoutIds, listSavedLayouts, getPublicLayoutById,
  followUser, unfollowUser, listMyFollowingIds, getPublicProfile, updateMyProfile,
  listDistinctTags, listFeaturedCollections, SUGGESTED_TAGS, submitReport,
  getLeaderboard, computeBadges,
} from './storage.js'

const REPORT_REASONS = ['Spam', 'Inappropriate', 'Other']
import { supabase } from './supabaseClient.js'
import { useAuth } from './useAuth.js'
import AuthPanel from './AuthPanel.jsx'

// TODO: replace with your real contact address before shipping — this is where "apply to be a
// designer" emails land. There's no approval workflow yet by design (see README); for the first
// few designers, just flip is_designer = true on their row in the Supabase table editor.
const DESIGNER_APPLY_EMAIL = 'tylerabain@icloud.com'

// room_type is stored as free text (see migration 006) but the app only ever writes one of these.
const ROOM_TYPES = ['single', 'double', 'triple']

// catalog dims are decimal feet (e.g. 3.4) — fine for the 3D math, not how anyone actually reads
// furniture dimensions. Formats as feet'inches" (e.g. "3'5""), the standard furniture-listing
// format, for the selection panel's Dimensions button.
function formatFeetInches(ft) {
  const totalInches = Math.round(ft * 12)
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  return inches === 0 ? `${feet}'` : `${feet}'${inches}"`
}

// Real thumbnail rendered from the item's model when one exists; falls back to the flat color
// swatch (plus a category icon, so it's not just a blank chip) for box-placeholder items or if
// the image 404s — some future catalog item might get a modelUrl before anyone regenerates
// public/thumbnails/, and this shouldn't break the row when that happens.
function CatalogThumb({ cat }) {
  const [imgFailed, setImgFailed] = useState(false)
  const swatchColor = `#${cat.color.toString(16).padStart(6, '0')}`
  const url = thumbnailUrl(cat)

  if (url && !imgFailed) {
    return (
      <div className="swatch" style={{ background: swatchColor, padding: 0 }}>
        <img src={url} alt="" onError={() => setImgFailed(true)} className="swatch-img" />
      </div>
    )
  }
  return (
    <div className="swatch" style={{ background: swatchColor }}>
      <span className="swatch-icon">{CATEGORY_ICONS[cat.category] || '📦'}</span>
    </div>
  )
}

// Screenshot captured at save time (roomEngine's captureSnapshot), shown on Saved/Browse rows.
// Falls back to a generic room icon for layouts saved before this feature existed (thumbnailUrl
// is null) or if the image fails to load.
function LayoutThumb({ url }) {
  const [imgFailed, setImgFailed] = useState(false)
  if (url && !imgFailed) {
    return <img src={url} alt="" onError={() => setImgFailed(true)} className="layout-thumb" />
  }
  return (
    <div className="layout-thumb layout-thumb-fallback">
      <span>🏠</span>
    </div>
  )
}

// Shared row for anything that's someone else's layout (Browse, and Saved tab's "Saved from
// others" view) — same actions apply in both places: view, copy, like, bookmark, and a "Based on"
// link if it's itself a remix. "My Layouts" gets its own row markup instead (publish toggle +
// delete + remix count aren't relevant here, and copy/like/save aren't relevant there).
function PublicLayoutRow({ layout, liked, saved, signedIn, onView, onCopy, onToggleLike, onToggleSave, onViewParent, onViewProfile, onReport, onShare }) {
  return (
    <div className="cart-row" style={{ alignItems: 'flex-start' }} onClick={onView} title="Click to view this layout in your room">
      <LayoutThumb url={layout.thumbnailUrl} />
      <div className="name">
        {layout.name}
        <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
          {layout.items.length} item{layout.items.length === 1 ? '' : 's'} · {layout.room.w}'×{layout.room.l}'
          {layout.roomType && ` · ${layout.roomType}`}
          {layout.hall && ` · ${layout.hall}`}
          {layout.tags && layout.tags.length > 0 && ` · ${layout.tags.join(', ')}`}
        </span>
        {layout.authorId && (
          <span
            style={{ display: 'block', fontSize: 10, fontWeight: 600, marginTop: 2, cursor: 'pointer', color: layout.designerName ? 'var(--sage)' : 'var(--ink-soft)' }}
            onClick={(e) => {
              e.stopPropagation()
              onViewProfile(layout.authorId)
            }}
          >
            {layout.designerName ? `Designed by ${layout.designerName}` : `by ${layout.authorName || 'a student'}`}
          </span>
        )}
        {layout.parentLayoutId && (
          <span
            style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2, textDecoration: 'underline', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              onViewParent(layout.parentLayoutId)
            }}
          >
            Based on {layout.parentLayoutName ? `"${layout.parentLayoutName}"` : 'another layout'}
            {layout.parentAuthorName && ` by ${layout.parentAuthorName}`}
          </span>
        )}
        <span style={{ display: 'block', fontSize: 9.5, color: 'var(--ink-soft)', marginTop: 3 }}>
          {layout.viewCount > 0 && `Viewed ${layout.viewCount} time${layout.viewCount === 1 ? '' : 's'}`}
          {layout.viewCount > 0 && layout.copyCount > 0 && ' · '}
          {layout.copyCount > 0 && `Copied ${layout.copyCount} time${layout.copyCount === 1 ? '' : 's'}`}
        </span>
      </div>
      <button
        className="add-btn"
        style={{ background: liked ? 'var(--accent)' : 'var(--paper-shadow)', color: liked ? '#fff' : 'var(--ink-soft)' }}
        title={signedIn ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleLike(layout)
        }}
      >
        {liked ? '♥' : '♡'} {layout.likesCount > 0 ? layout.likesCount : ''}
      </button>
      <button
        className="add-btn"
        style={{ background: saved ? 'var(--ink)' : 'var(--paper-shadow)', color: saved ? '#fff' : 'var(--ink-soft)' }}
        title={signedIn ? (saved ? 'Remove from saved' : 'Save for later') : 'Sign in to save'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSave(layout)
        }}
      >
        {saved ? '🔖' : '☆'}
      </button>
      <button className="add-btn" style={{ background: 'var(--ink)' }} title="View in 3D" onClick={(e) => { e.stopPropagation(); onView() }}>↺</button>
      <button
        className="add-btn"
        title={signedIn ? 'Copy to your layouts' : 'Sign in to copy'}
        onClick={(e) => {
          e.stopPropagation()
          onCopy(layout)
        }}
      >
        +
      </button>
      <button
        className="add-btn"
        style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', fontSize: 11 }}
        title="Copy shareable link"
        onClick={(e) => {
          e.stopPropagation()
          onShare(layout.id)
        }}
      >
        🔗
      </button>
      <button
        className="add-btn"
        style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', fontSize: 11 }}
        title="Report this layout"
        onClick={(e) => {
          e.stopPropagation()
          onReport('layout', layout.id, layout.name)
        }}
      >
        🚩
      </button>
    </div>
  )
}

export default function App() {
  const canvasWrapRef = useRef(null)
  const engineRef = useRef(null)
  const { session, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [room, setRoom] = useState({ w: 12, l: 14, h: 9 })
  const [cart, setCart] = useState([])
  const [selection, setSelection] = useState(null)
  const [featureSelection, setFeatureSelection] = useState(null)
  const [relatedNotice, setRelatedNotice] = useState('')
  const [showDimensions, setShowDimensions] = useState(false)
  // uid of the item currently waiting for a "click another item to place it on top of" pick, or
  // null — mirrors the engine's own stackPickSourceUid (see roomEngine.js), reported back via the
  // onStackPickModeChange callback so the selection panel can show the right button/hint.
  const [stackPickForUid, setStackPickForUid] = useState(null)
  // Browse is the landing tab — the first thing anyone sees (signed in or not) is real layouts
  // from other students, not an empty room. "Catalog" is one click away for starting from scratch.
  const [tab, setTab] = useState('browse')
  const [savedLayouts, setSavedLayouts] = useState([])
  const [layoutName, setLayoutName] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [layoutsError, setLayoutsError] = useState('')
  const [myProfile, setMyProfile] = useState(null)
  const [publicLayouts, setPublicLayouts] = useState([])
  const [browseError, setBrowseError] = useState('')
  const [browseNotice, setBrowseNotice] = useState('')
  const [hallFilter, setHallFilter] = useState('')
  const [roomTypeFilter, setRoomTypeFilter] = useState('')
  const [distinctHalls, setDistinctHalls] = useState([])
  const [likedIds, setLikedIds] = useState(() => new Set())
  const [mySavedIds, setMySavedIds] = useState(() => new Set())
  // "My Layouts" (yours, editable/publishable) vs "Saved from others" (bookmarks — see A5) are
  // different things now that saving exists, so they're two views within the same Saved tab.
  const [savedSubView, setSavedSubView] = useState('mine')
  const [savedFromOthers, setSavedFromOthers] = useState([])
  const [savedFromOthersError, setSavedFromOthersError] = useState('')
  // { name } of the layout currently prompting for optional hall/room type before publishing —
  // null when the prompt isn't open. Only shown on the private→public transition (see A4).
  const [publishPrompt, setPublishPrompt] = useState(null)
  const [publishHall, setPublishHall] = useState('')
  const [publishRoomType, setPublishRoomType] = useState('')
  const [publishTags, setPublishTags] = useState([])
  const [publishTagDraft, setPublishTagDraft] = useState('')
  const [tagFilters, setTagFilters] = useState(() => new Set())
  const [distinctTags, setDistinctTags] = useState([])
  const [featuredCollections, setFeaturedCollections] = useState([])
  // { type: 'layout'|'comment'|'profile', id, label } of whatever's currently being reported, or
  // null when the report modal is closed.
  const [reportTarget, setReportTarget] = useState(null)
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0])
  const [reportDetails, setReportDetails] = useState('')
  const [reportNotice, setReportNotice] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const [leaderboard, setLeaderboard] = useState(null)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [followingIds, setFollowingIds] = useState(() => new Set())
  const [followingOnlyFilter, setFollowingOnlyFilter] = useState(false)
  // Which user's public profile is showing when tab === 'profile' — a pseudo-route, not a real
  // URL, since react-router isn't in the app yet (that lands with shareable links in a later
  // session). "← Back" just returns to whichever tab you came from.
  const [viewingProfileId, setViewingProfileId] = useState(null)
  const [profileReturnTab, setProfileReturnTab] = useState('browse')
  const [profileData, setProfileData] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileDrafts, setProfileDrafts] = useState({ bio: '', displayHall: '', classYear: '' })
  const [profileEditNotice, setProfileEditNotice] = useState('')
  const [roomPlannerCollapsed, setRoomPlannerCollapsed] = useState(false)
  const [openCategories, setOpenCategories] = useState(() => new Set())
  const [checklistItems, setChecklistItems] = useState([])
  const [checklistError, setChecklistError] = useState('')
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [hideChecked, setHideChecked] = useState(false)
  const [openChecklistCategories, setOpenChecklistCategories] = useState(() => new Set())
  const [checklistDrafts, setChecklistDrafts] = useState({})

  // Init the Three.js engine once, tear it down on unmount
  useEffect(() => {
    const engine = new RoomEngine(canvasWrapRef.current, {
      onCartChange: setCart,
      onSelectionChange: setSelection,
      onFeatureSelectionChange: setFeatureSelection,
      onStackPickModeChange: setStackPickForUid,
    })
    engineRef.current = engine
    return () => engine.destroy()
  }, [])

  // Picks up "Open in 3D editor" from LayoutDetailPage (/layouts/:id) — it navigates here with
  // the layout it fetched already attached to router state, so this doesn't need a second fetch.
  // Clears the state immediately after consuming it (replace, no new history entry) so navigating
  // back to this tab later doesn't reload the same layout again.
  useEffect(() => {
    if (location.state?.loadLayout) {
      handleLoad(location.state.loadLayout)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    setRelatedNotice('')
    setShowDimensions(false)
  }, [selection])

  useEffect(() => {
    if (tab !== 'saved' || !session || savedSubView !== 'mine') return
    listLayouts()
      .then(setSavedLayouts)
      .catch((err) => setLayoutsError(err.message))
  }, [tab, session, savedSubView])

  useEffect(() => {
    if (tab !== 'saved' || !session || savedSubView !== 'saved') return
    setSavedFromOthersError('')
    listSavedLayouts()
      .then(setSavedFromOthers)
      .catch((err) => setSavedFromOthersError(err.message))
  }, [tab, session, savedSubView])

  useEffect(() => {
    if (!session) {
      setMyProfile(null)
      setLikedIds(new Set())
      setMySavedIds(new Set())
      return
    }
    getMyProfile()
      .then((profile) => {
        setMyProfile(profile)
        // Seeds the Saved tab's inline profile editor with whatever's already saved, so hitting
        // "Save profile" before ever visiting the profile-drafts-populating profile page itself
        // doesn't blank out an existing bio/hall/class year.
        setProfileDrafts({ bio: profile.bio || '', displayHall: profile.display_hall || '', classYear: profile.class_year || '' })
      })
      .catch(() => {})
    // Fetched independent of which tab is open (not gated to 'browse') so hearts/bookmarks render
    // correctly the moment Browse becomes visible — Browse is now the landing tab, and a
    // signed-in user's session is often already restored before this effect's first run.
    listMyLikedLayoutIds().then((ids) => setLikedIds(new Set(ids))).catch(() => {})
    listMySavedLayoutIds().then((ids) => setMySavedIds(new Set(ids))).catch(() => {})
    listMyFollowingIds().then((ids) => setFollowingIds(new Set(ids))).catch(() => {})
  }, [session])

  useEffect(() => {
    if (tab !== 'browse') return
    setBrowseError('')
    const authorIds = followingOnlyFilter ? [...followingIds] : undefined
    const tags = tagFilters.size > 0 ? [...tagFilters] : undefined
    listPublicLayouts({ hall: hallFilter || undefined, roomType: roomTypeFilter || undefined, authorIds, tags })
      .then(setPublicLayouts)
      .catch((err) => setBrowseError(err.message))
  }, [tab, hallFilter, roomTypeFilter, followingOnlyFilter, followingIds, tagFilters])

  useEffect(() => {
    if (tab !== 'browse') return
    listDistinctTags().then(setDistinctTags).catch(() => {})
    listFeaturedCollections().then(setFeaturedCollections).catch(() => {})
  }, [tab])

  useEffect(() => {
    if (tab !== 'leaderboard') return
    setLeaderboardError('')
    getLeaderboard()
      .then(setLeaderboard)
      .catch((err) => setLeaderboardError(err.message))
  }, [tab])

  useEffect(() => {
    if (tab !== 'profile' || !viewingProfileId) return
    setProfileError('')
    setProfileLoading(true)
    getPublicProfile(viewingProfileId)
      .then((data) => {
        if (!data) {
          setProfileError('This profile could not be found.')
          return
        }
        setProfileData(data)
        setProfileDrafts({ bio: data.bio || '', displayHall: data.displayHall || '', classYear: data.classYear || '' })
      })
      .catch((err) => setProfileError(err.message))
      .finally(() => setProfileLoading(false))
  }, [tab, viewingProfileId])

  useEffect(() => {
    if (tab !== 'browse') return
    listDistinctHalls().then(setDistinctHalls).catch(() => {})
  }, [tab])

  useEffect(() => {
    if (tab !== 'checklist' || !session) return
    setChecklistError('')
    setChecklistLoading(true)
    listChecklistItems()
      .then(setChecklistItems)
      .catch((err) => setChecklistError(err.message))
      .finally(() => setChecklistLoading(false))
  }, [tab, session])

  // Colgate-provided furniture isn't for sale — it doesn't count toward the total or appear on
  // the shopping list, since there's nothing to buy.
  const purchasableCart = cart.filter((it) => !it.cat.isProvided)
  const total = purchasableCart.reduce((sum, it) => sum + it.cat.price, 0)

  const relatedItems = selection ? resolveRelatedItems(selection.cat) : []

  // category -> subcategory -> items, in CATEGORY_ORDER's display order. Items with no
  // subcategory group under 'General' (rendered without its own label).
  const groupedCatalog = {}
  for (const item of CATALOG) {
    const sub = item.subcategory || 'General'
    groupedCatalog[item.category] ??= {}
    groupedCatalog[item.category][sub] ??= []
    groupedCatalog[item.category][sub].push(item)
  }

  function toggleCategory(category) {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  // category -> subcategory -> items, same shape/ordering approach as groupedCatalog above but
  // over CHECKLIST_CATEGORY_ORDER (all 11 categories, not just the ones with placeable items).
  // Built from the full unfiltered list, not "hide checked" — otherwise a fully-packed category
  // would vanish instead of showing "5/5", and per-category counts would go stale. The toggle is
  // applied per-row at render time instead.
  const groupedChecklist = {}
  for (const item of checklistItems) {
    const sub = item.subcategory || 'General'
    groupedChecklist[item.category] ??= {}
    groupedChecklist[item.category][sub] ??= []
    groupedChecklist[item.category][sub].push(item)
  }
  const checkedCount = checklistItems.filter((i) => i.checked).length

  function toggleChecklistCategory(category) {
    setOpenChecklistCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  async function refreshChecklist() {
    setChecklistItems(await listChecklistItems())
  }

  async function handleToggleChecklistItem(id, checked) {
    setChecklistError('')
    try {
      await setChecklistItemChecked(id, checked)
      await refreshChecklist()
    } catch (err) {
      setChecklistError(err.message)
    }
  }

  async function handleAddChecklistItem(category) {
    const label = (checklistDrafts[category] || '').trim()
    if (!label) return
    setChecklistError('')
    try {
      await addChecklistItem(category, null, label)
      setChecklistDrafts((prev) => ({ ...prev, [category]: '' }))
      await refreshChecklist()
    } catch (err) {
      setChecklistError(err.message)
    }
  }

  async function handleDeleteChecklistItem(id) {
    setChecklistError('')
    try {
      await deleteChecklistItem(id)
      await refreshChecklist()
    } catch (err) {
      setChecklistError(err.message)
    }
  }

  function handleDimChange(key, value) {
    const next = { ...room, [key]: parseFloat(value) || room[key] }
    setRoom(next)
    engineRef.current?.setRoomDims(next.w, next.l, next.h)
  }

  function handleAddDoor() {
    engineRef.current.addDoor()
  }

  function handleAddWindow() {
    engineRef.current.addWindow()
  }

  function handleFeatureWallChange(wall) {
    engineRef.current.setFeatureWall(featureSelection.id, wall)
  }

  function handleFeatureSizeChange(key, value) {
    const next = { width: featureSelection.width, height: featureSelection.height, [key]: parseFloat(value) || featureSelection[key] }
    engineRef.current.setFeatureSize(featureSelection.id, next.width, next.height)
  }

  function handleRemoveFeature() {
    engineRef.current.removeFeature(featureSelection.id)
  }

  // Only (re-)adds whichever default Colgate items aren't currently in the room — so if you
  // delete one (or all), clicking this again brings back just what's missing instead of either
  // doing nothing (a one-time "already added" lockout) or duplicating items you never removed.
  function handleAddProvided() {
    const presentIds = new Set(cart.map((it) => it.catalogId))
    colgateDefaultLayout(room)
      .filter(({ catalogId }) => !presentIds.has(catalogId))
      .forEach(({ catalogId, x, z, rotY }) => {
        engineRef.current.addItemAt(catalogId, x, z, rotY)
      })
  }

  function handleAddRelatedToRoom(catalogId) {
    engineRef.current.addItem(catalogId)
  }

  // Same button toggles "start picking" / "cancel picking" — clicking it again while already
  // picking for this same item cancels, rather than needing a separate Cancel control.
  function handleToggleStackPick(uid) {
    if (stackPickForUid === uid) engineRef.current.cancelStackPick()
    else engineRef.current.startStackPick(uid)
  }

  async function handleAddRelatedToChecklist(related) {
    setRelatedNotice('')
    if (!session) {
      setTab('checklist')
      return
    }
    try {
      await addChecklistItem(related.category, related.subcategory, related.label)
      setRelatedNotice(`Added "${related.label}" to your checklist.`)
    } catch (err) {
      setRelatedNotice(err.message)
    }
  }

  async function handleSave() {
    const name = layoutName.trim()
    if (!name) return
    setLayoutsError('')
    try {
      const state = engineRef.current.getState()
      const thumbnailDataUrl = engineRef.current.captureSnapshot()
      await saveLayout(name, { ...state, thumbnailDataUrl })
      setLayoutName('')
      setSavedLayouts(await listLayouts())
    } catch (err) {
      setLayoutsError(err.message)
    }
  }

  function handleLoad(data) {
    engineRef.current.loadState(data)
    setRoom(data.room)
    setTab('cart')
    // Best-effort, no dedup for v1 (see brief) — incrementLayoutViewCount() swallows its own
    // errors, so this never blocks or breaks loading the layout itself. data.id is only present
    // on layouts that came from Supabase (Browse/Saved), not a from-scratch room.
    if (data.id) incrementLayoutViewCount(data.id)
  }

  // Fetches a public layout by id and loads it — used for "Based on X" links (fresh data rather
  // than trusting the possibly-stale parent* fields already in hand) and, since session B5, the
  // leaderboard's "top layouts this month" rows too. Named generically since it's no longer only
  // about parents.
  async function handleViewLayoutById(parentLayoutId) {
    const parent = await getPublicLayoutById(parentLayoutId)
    if (parent) handleLoad(parent)
    else setBrowseError('That original layout is no longer available.')
  }

  function handleViewProfile(userId) {
    if (tab !== 'profile') setProfileReturnTab(tab)
    setViewingProfileId(userId)
    setProfileData(null)
    setTab('profile')
  }

  function handleBackFromProfile() {
    setTab(profileReturnTab)
    setViewingProfileId(null)
  }

  // /layouts/:id is the shareable route added in this session (see LayoutDetailPage.jsx) — this
  // just builds that URL and puts it on the clipboard. Falls back to showing the raw URL in the
  // notice itself if the Clipboard API is unavailable/blocked (e.g. non-HTTPS), so it's still
  // usable rather than silently failing.
  async function handleCopyLink(layoutId) {
    const url = `${window.location.origin}/layouts/${layoutId}`
    try {
      await navigator.clipboard.writeText(url)
      setShareNotice('Link copied!')
    } catch {
      setShareNotice(url)
    }
    setTimeout(() => setShareNotice(''), 3000)
  }

  function handleOpenReport(type, id, label) {
    if (!session) {
      setTab('saved')
      return
    }
    setReportReason(REPORT_REASONS[0])
    setReportDetails('')
    setReportNotice('')
    setReportTarget({ type, id, label })
  }

  async function handleSubmitReport() {
    setReportNotice('')
    try {
      const reason = reportReason === 'Other' && reportDetails.trim() ? `Other: ${reportDetails.trim()}` : reportReason
      await submitReport(reportTarget.type, reportTarget.id, reason)
      setReportTarget(null)
    } catch (err) {
      setReportNotice(err.message)
    }
  }

  async function handleToggleFollow(userId) {
    if (!session) {
      setTab('saved')
      return
    }
    const isFollowing = followingIds.has(userId)
    try {
      if (isFollowing) {
        await unfollowUser(userId)
        setFollowingIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
        setProfileData((prev) => (prev && prev.id === userId ? { ...prev, followerCount: Math.max(0, prev.followerCount - 1) } : prev))
      } else {
        await followUser(userId)
        setFollowingIds((prev) => new Set(prev).add(userId))
        setProfileData((prev) => (prev && prev.id === userId ? { ...prev, followerCount: prev.followerCount + 1 } : prev))
      }
    } catch (err) {
      setProfileError(err.message)
    }
  }

  async function handleSaveProfileEdits() {
    setProfileEditNotice('')
    try {
      await updateMyProfile(profileDrafts)
      setProfileEditNotice('Saved.')
      // Refresh whichever profile view is currently showing your own data — either the profile
      // page itself (if you navigated to your own) or the "Signed in as" summary in the Saved tab.
      if (viewingProfileId === session?.user.id) {
        getPublicProfile(session.user.id).then(setProfileData).catch(() => {})
      }
    } catch (err) {
      setProfileEditNotice(err.message)
    }
  }

  async function handleDelete(name) {
    setLayoutsError('')
    try {
      await deleteLayout(name)
      setSavedLayouts(await listLayouts())
    } catch (err) {
      setLayoutsError(err.message)
    }
  }

  async function handleTogglePublic(name, nextPublic, opts) {
    setLayoutsError('')
    try {
      await setLayoutPublic(name, nextPublic, opts)
      setSavedLayouts(await listLayouts())
    } catch (err) {
      setLayoutsError(err.message)
    }
  }

  // Only the private→public transition prompts for hall/room type (A4) — going public is the
  // moment those fields are actually useful to fill in, and re-publishing without touching them
  // just keeps whatever was set the first time (see setLayoutPublic's own comment).
  function openPublishPrompt(name) {
    setPublishHall('')
    setPublishRoomType('')
    setPublishTags([])
    setPublishTagDraft('')
    setPublishPrompt({ name })
  }

  function addPublishTag(tag) {
    const clean = tag.trim().toLowerCase()
    if (!clean || publishTags.includes(clean)) return
    setPublishTags((prev) => [...prev, clean])
    setPublishTagDraft('')
  }

  function removePublishTag(tag) {
    setPublishTags((prev) => prev.filter((t) => t !== tag))
  }

  async function confirmPublish() {
    const { name } = publishPrompt
    setPublishPrompt(null)
    await handleTogglePublic(name, true, { hall: publishHall.trim(), roomType: publishRoomType, tags: publishTags })
  }

  function skipPublishPrompt() {
    const { name } = publishPrompt
    setPublishPrompt(null)
    // "Skip" only skips hall/room type (the optional prompt fields) — any tags already picked as
    // chips are a separate, lighter-weight action and still go through.
    handleTogglePublic(name, true, { tags: publishTags })
  }

  function toggleTagFilter(tag) {
    setTagFilters((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // Local optimistic update for likes_count after a like/unlike — avoids a full refetch on every
  // click. Applied to whichever list(s) currently hold this layout; a plain no-op on lists that
  // don't (e.g. liking from Browse doesn't need to touch savedFromOthers unless it's also there).
  function bumpLikesCount(layoutId, delta) {
    const patch = (list) => list.map((l) => (l.id === layoutId ? { ...l, likesCount: Math.max(0, l.likesCount + delta) } : l))
    setPublicLayouts(patch)
    setSavedFromOthers(patch)
  }

  async function handleToggleLike(layout) {
    if (!session) {
      setTab('saved')
      return
    }
    const isLiked = likedIds.has(layout.id)
    try {
      if (isLiked) {
        await unlikeLayout(layout.id)
        setLikedIds((prev) => {
          const next = new Set(prev)
          next.delete(layout.id)
          return next
        })
        bumpLikesCount(layout.id, -1)
      } else {
        await likeLayout(layout.id)
        setLikedIds((prev) => new Set(prev).add(layout.id))
        bumpLikesCount(layout.id, 1)
      }
    } catch (err) {
      setBrowseError(err.message)
    }
  }

  async function handleToggleSave(layout) {
    if (!session) {
      setTab('saved')
      return
    }
    const isSaved = mySavedIds.has(layout.id)
    try {
      if (isSaved) {
        await unsaveLayoutBookmark(layout.id)
        setMySavedIds((prev) => {
          const next = new Set(prev)
          next.delete(layout.id)
          return next
        })
        setSavedFromOthers((prev) => prev.filter((l) => l.id !== layout.id))
      } else {
        await saveLayoutBookmark(layout.id)
        setMySavedIds((prev) => new Set(prev).add(layout.id))
        setSavedFromOthers((prev) => [{ ...layout, bookmarkedAt: Date.now() }, ...prev])
      }
    } catch (err) {
      setBrowseError(err.message)
    }
  }

  async function handleCopyPublic(layout) {
    if (!session) {
      setTab('saved')
      return
    }
    setBrowseError('')
    setBrowseNotice('')
    try {
      const name = await copyLayout(layout)
      setBrowseNotice(`Copied to your layouts as "${name}".`)
      // Load it into the room immediately — don't make them go hunt for it in Saved.
      handleLoad(layout)
    } catch (err) {
      setBrowseError(err.message)
    }
  }

  return (
    <div id="app">
      <div id="canvas-wrap" ref={canvasWrapRef}>
        <div id="titleblock">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h1 style={{ margin: roomPlannerCollapsed ? 0 : undefined }}>Room Planner</h1>
            <button
              onClick={() => setRoomPlannerCollapsed((v) => !v)}
              title={roomPlannerCollapsed ? 'Expand room planner' : 'Minimize room planner'}
              aria-label={roomPlannerCollapsed ? 'Expand room planner' : 'Minimize room planner'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)',
                fontSize: 13, padding: 4, lineHeight: 1, flexShrink: 0,
              }}
            >
              {roomPlannerCollapsed ? '▸' : '▾'}
            </button>
          </div>
          {!roomPlannerCollapsed && (
            <>
              <div className="sub">Set your dimensions, then start furnishing.</div>
              <div className="dim-row">
                <label>Width</label>
                <input type="number" value={room.w} min={6} max={25} step={0.5} onChange={(e) => handleDimChange('w', e.target.value)} />
                <span className="unit">ft</span>
              </div>
              <div className="dim-row">
                <label>Length</label>
                <input type="number" value={room.l} min={6} max={25} step={0.5} onChange={(e) => handleDimChange('l', e.target.value)} />
                <span className="unit">ft</span>
              </div>
              <div className="dim-row">
                <label>Ceiling</label>
                <input type="number" value={room.h} min={7} max={14} step={0.5} onChange={(e) => handleDimChange('h', e.target.value)} />
                <span className="unit">ft</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--paper-shadow)' }}>
                <button className="structure-btn" onClick={handleAddDoor}>+ Door</button>
                <button className="structure-btn" onClick={handleAddWindow}>+ Window</button>
              </div>
            </>
          )}
        </div>

        <div id="hint">Drag floor to orbit · Scroll to zoom · Drag an item to move it · Select + R to rotate</div>

        {selection && (
          <div id="selection-panel" className="visible">
            <h3>{selection.cat.name}</h3>
            <div className="meta">
              {selection.cat.dims[0]}' x {selection.cat.dims[1]}' x {selection.cat.dims[2]}'
              {selection.cat.isProvided ? (
                <span style={{ color: 'var(--sage)', fontWeight: 600 }}> · Included by Colgate</span>
              ) : (
                <> · ${selection.cat.price}</>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                style={{ background: 'var(--ink)', color: 'var(--paper)', flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}
                onClick={() => engineRef.current.rotateSelected()}
              >
                ⟳ Rotate 90°
              </button>
              <button
                style={{
                  background: showDimensions ? 'var(--accent)' : 'var(--paper-shadow)',
                  color: showDimensions ? '#fff' : 'var(--ink-soft)',
                  flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                }}
                onClick={() => setShowDimensions((v) => !v)}
              >
                📏 Dimensions
              </button>
            </div>
            {showDimensions && (
              <div style={{ background: 'var(--paper-shadow)', borderRadius: 8, padding: 10, marginBottom: 6, fontSize: 11.5, color: 'var(--ink)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Width</span>
                  <span>{formatFeetInches(selection.cat.dims[0])} <span style={{ color: 'var(--ink-soft)' }}>({selection.cat.dims[0]}')</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Depth</span>
                  <span>{formatFeetInches(selection.cat.dims[1])} <span style={{ color: 'var(--ink-soft)' }}>({selection.cat.dims[1]}')</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Height</span>
                  <span>{formatFeetInches(selection.cat.dims[2])} <span style={{ color: 'var(--ink-soft)' }}>({selection.cat.dims[2]}')</span></span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {selection.stackedOnUid != null ? (
                <button
                  style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}
                  onClick={() => engineRef.current.unstackItem(selection.uid)}
                >
                  ⬇ Place on floor
                </button>
              ) : (
                <button
                  style={{
                    background: stackPickForUid === selection.uid ? 'var(--accent)' : 'var(--paper-shadow)',
                    color: stackPickForUid === selection.uid ? '#fff' : 'var(--ink-soft)',
                    flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                  }}
                  onClick={() => handleToggleStackPick(selection.uid)}
                >
                  {stackPickForUid === selection.uid ? 'Cancel picking…' : '⬆ Put on top of…'}
                </button>
              )}
            </div>
            {stackPickForUid === selection.uid && (
              <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 6, fontStyle: 'italic' }}>
                Click another item in the room to place {selection.cat.name} on top of it.
              </div>
            )}
            <button onClick={() => engineRef.current.removeItem(selection.uid)}>Remove item</button>

            {relatedItems.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--paper-shadow)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                  Goes well with
                </div>
                {relatedItems.map((rel) => (
                  <div key={rel.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--ink)' }}>{rel.label}</span>
                    <button
                      onClick={() => (rel.isChecklist ? handleAddRelatedToChecklist(rel) : handleAddRelatedToRoom(rel.catalogId))}
                      title={rel.isChecklist && !session ? 'Sign in to add to your checklist' : undefined}
                      style={{
                        background: rel.isChecklist ? 'var(--sage-soft)' : 'var(--accent-soft)',
                        color: rel.isChecklist ? 'var(--sage)' : 'var(--accent)',
                        border: 'none', borderRadius: 999, padding: '3px 9px', fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', width: 'auto',
                      }}
                    >
                      {rel.isChecklist ? '+ Checklist' : '+ Room'}
                    </button>
                  </div>
                ))}
                {relatedNotice && <div style={{ fontSize: 10.5, color: 'var(--sage)', marginTop: 4 }}>{relatedNotice}</div>}
              </div>
            )}
          </div>
        )}

        {featureSelection && (
          <div id="selection-panel" className="visible">
            <h3>{featureSelection.type === 'door' ? 'Door' : 'Window'}</h3>
            <div className="meta">
              {featureSelection.width.toFixed(1)}' x {featureSelection.height.toFixed(1)}'
              {featureSelection.type === 'door' && ' · Standard size'}
            </div>

            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 6 }}>
              Wall
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {['back', 'front', 'left', 'right'].map((wall) => (
                <button
                  key={wall}
                  onClick={() => handleFeatureWallChange(wall)}
                  style={{
                    border: 'none', borderRadius: 8, padding: 7, fontSize: 11, textTransform: 'capitalize', cursor: 'pointer',
                    background: featureSelection.wall === wall ? 'var(--accent)' : 'var(--paper-shadow)',
                    color: featureSelection.wall === wall ? '#fff' : 'var(--ink-soft)',
                  }}
                >
                  {wall}
                </button>
              ))}
            </div>

            {featureSelection.type === 'window' && (
              <>
                <div className="dim-row" style={{ marginBottom: 6 }}>
                  <label style={{ color: 'var(--ink-soft)' }}>Width</label>
                  <input
                    type="number" value={featureSelection.width} min={1.5} max={6} step={0.5}
                    onChange={(e) => handleFeatureSizeChange('width', e.target.value)}
                    style={{ border: '1px solid var(--paper-shadow)', borderRadius: 6, padding: '3px 6px', width: 56, color: 'var(--ink)' }}
                  />
                  <span className="unit">ft</span>
                </div>
                <div className="dim-row" style={{ marginBottom: 12 }}>
                  <label style={{ color: 'var(--ink-soft)' }}>Height</label>
                  <input
                    type="number" value={featureSelection.height} min={2} max={5} step={0.5}
                    onChange={(e) => handleFeatureSizeChange('height', e.target.value)}
                    style={{ border: '1px solid var(--paper-shadow)', borderRadius: 6, padding: '3px 6px', width: 56, color: 'var(--ink)' }}
                  />
                  <span className="unit">ft</span>
                </div>
              </>
            )}

            <button onClick={handleRemoveFeature}>Remove {featureSelection.type}</button>
          </div>
        )}
      </div>

      <div id="sidebar">
        <div id="sidebar-header">
          <h2>Furnish it</h2>
          <p>Tap an item to drop it in the room.</p>
        </div>
        <div id="sidebar-tabs">
          <button className={`tab-btn ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>Catalog</button>
          <button className={`tab-btn ${tab === 'cart' ? 'active' : ''}`} onClick={() => setTab('cart')}>
            Your room {cart.length > 0 && `(${cart.length})`}
          </button>
          <button className={`tab-btn ${tab === 'saved' ? 'active' : ''}`} onClick={() => setTab('saved')}>Saved</button>
          <button className={`tab-btn ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
          <button className={`tab-btn ${tab === 'checklist' ? 'active' : ''}`} onClick={() => setTab('checklist')}>Checklist</button>
        </div>

        {tab === 'catalog' && (
          <div id="catalog-panel">
            <div style={{ background: 'var(--sage-soft)', border: '1px solid var(--sage)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--ink)' }}>
                🎓 Colgate dorm room?
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 10, lineHeight: 1.5 }}>
                Add the furniture Colgate already provides — bed, desk, chair, and wardrobe — placed for you. Move, rotate, or remove anything afterward; click again anytime to bring back whatever you've removed. (Not every room gets a stackable chest — look for it further down if you want one.)
              </div>
              <button
                onClick={handleAddProvided}
                style={{
                  background: 'var(--sage)', color: '#fff',
                  border: 'none', padding: '8px 14px', fontSize: 11.5, fontWeight: 600, borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Add Colgate furniture
              </button>
            </div>
            {CATEGORY_ORDER.filter((category) => groupedCatalog[category]).map((category) => {
              const subcats = groupedCatalog[category]
              const itemCount = Object.values(subcats).reduce((n, items) => n + items.length, 0)
              const isOpen = openCategories.has(category)
              return (
                <div key={category} className="category-section">
                  <button className="category-header" onClick={() => toggleCategory(category)}>
                    <span>{CATEGORY_ICONS[category]} {category}</span>
                    <span className="category-meta">{itemCount} {isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen &&
                    Object.entries(subcats).map(([subcategory, items]) => (
                      <div key={subcategory}>
                        {subcategory !== 'General' && <div className="subcategory-label">{subcategory}</div>}
                        {items.map((cat) => (
                          <div key={cat.id} className="cat-item" onClick={() => engineRef.current.addItem(cat.id)}>
                            <CatalogThumb cat={cat} />
                            <div className="cat-info">
                              <div className="name">{cat.name}</div>
                              <div className="meta">
                                {cat.dims[0]}' × {cat.dims[1]}' × {cat.dims[2]}' · <span className="retailer-tag">{cat.retailer}</span>
                              </div>
                            </div>
                            <div className="cat-price">${cat.price}</div>
                            <button className="add-btn">+</button>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'cart' && (
          <div id="cart-panel" style={{ display: 'flex' }}>
            {cart.length === 0 ? (
              <div className="empty-note">Nothing placed yet. Add items from the Catalog tab and drag them into position in your room.</div>
            ) : (
              cart.map((it) => (
                <div key={it.uid} className="cart-row" onClick={() => engineRef.current.selectItem(it.uid)}>
                  <CatalogThumb cat={it.cat} />
                  <div className="name">{it.cat.name}</div>
                  {it.cat.isProvided ? (
                    <span style={{ background: 'var(--sage-soft)', color: 'var(--sage)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.03em', padding: '4px 9px', borderRadius: 999, flexShrink: 0 }}>
                      COLGATE
                    </span>
                  ) : (
                    <div className="price">${it.cat.price}</div>
                  )}
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      engineRef.current.removeItem(it.uid)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'saved' && (
          <div id="saved-panel" style={{ display: 'flex', padding: session ? 14 : 0, flexDirection: 'column' }}>
            {authLoading ? (
              <div className="empty-note">Loading…</div>
            ) : !session ? (
              <>
                {supabase && (
                  <div style={{ padding: '14px 14px 0 14px', fontSize: 10, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>ACCOUNT</span>
                  </div>
                )}
                <AuthPanel />
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '0 14px', fontSize: 10, color: 'var(--ink-soft)', marginTop: 8 }}>
                  Terms of Service
                </a>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, fontSize: 10.5, color: 'var(--ink-soft)' }}>
                  <span>
                    Signed in as {session.user.email}
                    {myProfile?.is_designer && (
                      <span style={{ marginLeft: 6, color: 'var(--sage)', fontWeight: 600, background: 'var(--sage-soft)', padding: '2px 7px', borderRadius: 999, fontSize: 9.5, letterSpacing: '0.03em' }}>
                        DESIGNER
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
                      Terms
                    </a>
                    <button
                      onClick={() => supabase.auth.signOut()}
                      style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-soft)', padding: 0 }}
                    >
                      Sign out
                    </button>
                  </span>
                </div>
                {!myProfile?.is_designer && (
                  <a
                    href={`mailto:${DESIGNER_APPLY_EMAIL}?subject=${encodeURIComponent('Designer application — Dorm Room Planner')}&body=${encodeURIComponent(`Account email: ${session.user.email}\n\nTell us a bit about your design background:`)}`}
                    style={{ display: 'block', fontSize: 10.5, color: 'var(--sage)', marginBottom: 10, textDecoration: 'none', fontWeight: 600 }}
                  >
                    Want to publish layouts as a designer? Apply here →
                  </a>
                )}
                <span
                  style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', textDecoration: 'underline', cursor: 'pointer', marginBottom: 14 }}
                  onClick={() => handleViewProfile(session.user.id)}
                >
                  View my public profile →
                </span>
                <div style={{ background: 'var(--paper-shadow)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                    Profile — shown on your public profile page, all optional
                  </div>
                  <textarea
                    placeholder="A short bio…"
                    value={profileDrafts.bio}
                    onChange={(e) => setProfileDrafts((prev) => ({ ...prev, bio: e.target.value }))}
                    rows={2}
                    style={{ width: '100%', padding: 7, border: '1px solid var(--paper-shadow)', borderRadius: 6, fontSize: 11.5, marginBottom: 6, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                      placeholder="Hall (e.g. Curtis Hall)"
                      value={profileDrafts.displayHall}
                      onChange={(e) => setProfileDrafts((prev) => ({ ...prev, displayHall: e.target.value }))}
                      style={{ flex: 1, padding: 7, border: '1px solid var(--paper-shadow)', borderRadius: 6, fontSize: 11.5 }}
                    />
                    <input
                      placeholder="Class year"
                      value={profileDrafts.classYear}
                      onChange={(e) => setProfileDrafts((prev) => ({ ...prev, classYear: e.target.value }))}
                      style={{ flex: 1, padding: 7, border: '1px solid var(--paper-shadow)', borderRadius: 6, fontSize: 11.5 }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={handleSaveProfileEdits}
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6 }}
                    >
                      Save profile
                    </button>
                    {profileEditNotice && <span style={{ fontSize: 10.5, color: 'var(--sage)' }}>{profileEditNotice}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <button
                    className={`tab-btn ${savedSubView === 'mine' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setSavedSubView('mine')}
                  >
                    My Layouts
                  </button>
                  <button
                    className={`tab-btn ${savedSubView === 'saved' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setSavedSubView('saved')}
                  >
                    Saved from others
                  </button>
                </div>

                {savedSubView === 'mine' ? (
                  <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                      <input
                        placeholder="Layout name…"
                        value={layoutName}
                        onChange={(e) => setLayoutName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        style={{ flex: 1, padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 12.5 }}
                      />
                      <button
                        onClick={handleSave}
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '0 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}
                      >
                        Save
                      </button>
                    </div>
                    {shareNotice && <div style={{ color: 'var(--sage)', fontSize: 11, marginBottom: 10, fontWeight: 600, wordBreak: 'break-all' }}>{shareNotice}</div>}
                    {layoutsError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{layoutsError}</div>}
                    {savedLayouts.length === 0 ? (
                      <div className="empty-note">No saved layouts yet. Build a room, then name and save it above.</div>
                    ) : (
                      savedLayouts.map((data) => (
                        <div
                          key={data.name}
                          className="cart-row"
                          style={{ alignItems: 'flex-start' }}
                          onClick={() => handleLoad(data)}
                          title="Click to load this layout into your room"
                        >
                          <LayoutThumb url={data.thumbnailUrl} />
                          <div className="name">
                            {data.name}
                            <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
                              {data.items.length} item{data.items.length === 1 ? '' : 's'} · {data.room.w}'×{data.room.l}'
                            </span>
                            {data.parentLayoutId && (
                              <span
                                style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2, textDecoration: 'underline', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewLayoutById(data.parentLayoutId)
                                }}
                              >
                                Based on {data.parentLayoutName ? `"${data.parentLayoutName}"` : 'another layout'}
                                {data.parentAuthorName && ` by ${data.parentAuthorName}`}
                              </span>
                            )}
                            {data.remixCount > 0 && (
                              <span style={{ display: 'block', fontSize: 10, color: 'var(--sage)', fontWeight: 600, marginTop: 2 }}>
                                {data.remixCount} {data.remixCount === 1 ? 'person' : 'people'} remixed this
                              </span>
                            )}
                            {(data.likesCount > 0 || data.viewCount > 0 || data.copyCount > 0) && (
                              <span style={{ display: 'block', fontSize: 9.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                                {data.likesCount > 0 && `♥ ${data.likesCount}`}
                                {data.likesCount > 0 && (data.viewCount > 0 || data.copyCount > 0) && ' · '}
                                {data.viewCount > 0 && `Viewed ${data.viewCount}×`}
                                {data.viewCount > 0 && data.copyCount > 0 && ' · '}
                                {data.copyCount > 0 && `Copied ${data.copyCount}×`}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (data.isPublic) handleTogglePublic(data.name, false)
                              else openPublishPrompt(data.name)
                            }}
                            title={data.isPublic ? 'Public — visible on the Browse tab. Click to make private.' : 'Private — only you can see this. Click to publish.'}
                            style={{
                              border: 'none', borderRadius: 999, padding: '4px 9px', fontSize: 9.5, fontWeight: 600,
                              letterSpacing: '0.03em', cursor: 'pointer', flexShrink: 0,
                              background: data.isPublic ? 'var(--sage-soft)' : 'var(--paper-shadow)',
                              color: data.isPublic ? 'var(--sage)' : 'var(--ink-soft)',
                            }}
                          >
                            {data.isPublic ? 'PUBLIC' : 'PRIVATE'}
                          </button>
                          {data.isPublic && (
                            <button
                              className="add-btn"
                              style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', fontSize: 11 }}
                              title="Copy shareable link"
                              onClick={(e) => { e.stopPropagation(); handleCopyLink(data.id) }}
                            >
                              🔗
                            </button>
                          )}
                          <button className="add-btn" style={{ background: 'var(--ink)' }} title="Load into room" onClick={(e) => { e.stopPropagation(); handleLoad(data) }}>↺</button>
                          <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleDelete(data.name) }}>×</button>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {savedFromOthersError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{savedFromOthersError}</div>}
                    {savedFromOthers.length === 0 ? (
                      <div className="empty-note">
                        Nothing saved yet. Tap the ☆ on any layout in Browse to bookmark it here for later.
                      </div>
                    ) : (
                      savedFromOthers.map((layout) => (
                        <PublicLayoutRow
                          key={layout.id}
                          layout={layout}
                          liked={likedIds.has(layout.id)}
                          saved={mySavedIds.has(layout.id)}
                          signedIn={!!session}
                          onView={() => handleLoad(layout)}
                          onCopy={handleCopyPublic}
                          onToggleLike={handleToggleLike}
                          onToggleSave={handleToggleSave}
                          onViewParent={handleViewLayoutById}
                          onViewProfile={handleViewProfile}
                          onReport={handleOpenReport}
                          onShare={handleCopyLink}
                        />
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'browse' && (
          <div id="browse-panel" style={{ display: 'flex', padding: 14, flexDirection: 'column' }}>
            <div className="empty-note" style={{ padding: '0 0 8px 0' }}>
              Layouts other students have made public. Copy one to start from it, view it in 3D first, or{' '}
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setTab('catalog')}>
                start from scratch
              </span>
              . <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setTab('leaderboard')}>🏆 Leaderboard</span>
            </div>
            {featuredCollections.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {featuredCollections.map((collection) => (
                  <div key={collection.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                      ✨ {collection.title}
                    </div>
                    {collection.description && (
                      <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 6 }}>{collection.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {collection.layouts.map((layout) => (
                        <div
                          key={layout.id}
                          onClick={() => handleLoad(layout)}
                          title="Click to view this layout in your room"
                          style={{ flexShrink: 0, width: 110, cursor: 'pointer' }}
                        >
                          <LayoutThumb url={layout.thumbnailUrl} />
                          <div style={{ fontSize: 10, color: 'var(--ink)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {layout.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {distinctTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                {distinctTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    style={{
                      border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                      background: tagFilters.has(t) ? 'var(--accent)' : 'var(--paper-shadow)',
                      color: tagFilters.has(t) ? '#fff' : 'var(--ink-soft)',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <select
                value={hallFilter}
                onChange={(e) => setHallFilter(e.target.value)}
                style={{ flex: 1, padding: 7, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 11, color: 'var(--ink)' }}
              >
                <option value="">All halls</option>
                {distinctHalls.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                style={{ flex: 1, padding: 7, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 11, color: 'var(--ink)', textTransform: 'capitalize' }}
              >
                <option value="">All room types</option>
                {ROOM_TYPES.map((rt) => (
                  <option key={rt} value={rt} style={{ textTransform: 'capitalize' }}>{rt}</option>
                ))}
              </select>
            </div>
            {session && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={followingOnlyFilter} onChange={(e) => setFollowingOnlyFilter(e.target.checked)} />
                Following only
              </label>
            )}
            {shareNotice && <div style={{ color: 'var(--sage)', fontSize: 11, marginBottom: 10, fontWeight: 600, wordBreak: 'break-all' }}>{shareNotice}</div>}
            {browseNotice && <div style={{ color: 'var(--sage)', fontSize: 11, marginBottom: 10, fontWeight: 600 }}>{browseNotice}</div>}
            {browseError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{browseError}</div>}
            {followingOnlyFilter && followingIds.size === 0 ? (
              <div className="empty-note">
                You're not following anyone yet. Tap a layout's byline anywhere to visit their profile and follow them.
              </div>
            ) : publicLayouts.length === 0 ? (
              <div className="empty-note">
                {hallFilter || roomTypeFilter || tagFilters.size > 0
                  ? 'No public layouts match this filter yet.'
                  : 'No public layouts yet. Publish one of your own from the Saved tab to be the first.'}
              </div>
            ) : (
              publicLayouts.map((layout) => (
                <PublicLayoutRow
                  key={layout.id}
                  layout={layout}
                  liked={likedIds.has(layout.id)}
                  saved={mySavedIds.has(layout.id)}
                  signedIn={!!session}
                  onView={() => handleLoad(layout)}
                  onCopy={handleCopyPublic}
                  onToggleLike={handleToggleLike}
                  onToggleSave={handleToggleSave}
                  onViewParent={handleViewLayoutById}
                  onViewProfile={handleViewProfile}
                  onReport={handleOpenReport}
                  onShare={handleCopyLink}
                />
              ))
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div id="profile-panel" style={{ display: 'flex', padding: 14, flexDirection: 'column' }}>
            <span
              style={{ fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'underline', cursor: 'pointer', marginBottom: 12 }}
              onClick={handleBackFromProfile}
            >
              ← Back
            </span>
            {profileLoading ? (
              <div className="empty-note">Loading profile…</div>
            ) : profileError ? (
              <div className="empty-note">{profileError}</div>
            ) : profileData ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 16, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {profileData.displayName || 'A student'}
                      {profileData.isDesigner && (
                        <span style={{ color: 'var(--sage)', fontWeight: 600, background: 'var(--sage-soft)', padding: '2px 7px', borderRadius: 999, fontSize: 9.5, letterSpacing: '0.03em' }}>
                          DESIGNER
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                      {[profileData.displayHall, profileData.classYear && `Class of ${profileData.classYear}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {session && session.user.id !== viewingProfileId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleFollow(viewingProfileId)}
                        style={{
                          border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: followingIds.has(viewingProfileId) ? 'var(--paper-shadow)' : 'var(--accent)',
                          color: followingIds.has(viewingProfileId) ? 'var(--ink-soft)' : '#fff',
                        }}
                      >
                        {followingIds.has(viewingProfileId) ? 'Following' : 'Follow'}
                      </button>
                      <button
                        onClick={() => handleOpenReport('profile', viewingProfileId, profileData.displayName || 'this profile')}
                        title="Report this profile"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        🚩
                      </button>
                    </div>
                  )}
                </div>
                {profileData.bio && (
                  <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 10 }}>{profileData.bio}</div>
                )}
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-soft)', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--paper-shadow)' }}>
                  <span><strong style={{ color: 'var(--ink)' }}>{profileData.followerCount}</strong> follower{profileData.followerCount === 1 ? '' : 's'}</span>
                  <span><strong style={{ color: 'var(--ink)' }}>{profileData.followingCount}</strong> following</span>
                  <span><strong style={{ color: 'var(--ink)' }}>{profileData.layouts.length}</strong> public layout{profileData.layouts.length === 1 ? '' : 's'}</span>
                </div>
                {computeBadges(profileData.layouts).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {computeBadges(profileData.layouts).map((b) => (
                      <span
                        key={b.label}
                        title={b.label}
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 600 }}
                      >
                        {b.emoji} {b.label}
                      </span>
                    ))}
                  </div>
                )}
                {profileError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{profileError}</div>}
                {profileData.layouts.length === 0 ? (
                  <div className="empty-note">No public layouts yet.</div>
                ) : (
                  profileData.layouts.map((layout) => (
                    <div
                      key={layout.id}
                      className="cart-row"
                      style={{ alignItems: 'flex-start' }}
                      onClick={() => handleLoad(layout)}
                      title="Click to view this layout in your room"
                    >
                      <LayoutThumb url={layout.thumbnailUrl} />
                      <div className="name">
                        {layout.name}
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
                          {layout.items.length} item{layout.items.length === 1 ? '' : 's'} · {layout.room.w}'×{layout.room.l}'
                        </span>
                        <span style={{ display: 'block', fontSize: 9.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                          {layout.likesCount > 0 && `♥ ${layout.likesCount}`}
                          {layout.likesCount > 0 && layout.copyCount > 0 && ' · '}
                          {layout.copyCount > 0 && `Copied ${layout.copyCount}×`}
                        </span>
                      </div>
                      <button className="add-btn" style={{ background: 'var(--ink)' }} title="View in 3D" onClick={(e) => { e.stopPropagation(); handleLoad(layout) }}>↺</button>
                    </div>
                  ))
                )}
              </>
            ) : null}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div id="leaderboard-panel" style={{ display: 'flex', padding: 14, flexDirection: 'column' }}>
            <span
              style={{ fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'underline', cursor: 'pointer', marginBottom: 14 }}
              onClick={() => setTab('browse')}
            >
              ← Back to Browse
            </span>
            {leaderboardError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{leaderboardError}</div>}
            {!leaderboard ? (
              <div className="empty-note">Loading…</div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 10 }}>
                  🏆 Top designers
                </div>
                {leaderboard.topDesigners.length === 0 ? (
                  <div className="empty-note">No public layouts yet.</div>
                ) : (
                  leaderboard.topDesigners.map((d, i) => (
                    <div key={d.userId} className="cart-row" onClick={() => handleViewProfile(d.userId)} title="View profile">
                      <div style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div className="name">
                        {d.displayName}
                        {d.isDesigner && (
                          <span style={{ marginLeft: 6, color: 'var(--sage)', fontWeight: 600, background: 'var(--sage-soft)', padding: '2px 7px', borderRadius: 999, fontSize: 9 }}>
                            DESIGNER
                          </span>
                        )}
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
                          {d.layoutCount} layout{d.layoutCount === 1 ? '' : 's'} · ♥ {d.totalLikes} · Copied {d.totalCopies}×
                        </span>
                      </div>
                    </div>
                  ))
                )}

                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', margin: '20px 0 10px' }}>
                  🔥 Top layouts this month
                </div>
                {leaderboard.topLayoutsThisMonth.length === 0 ? (
                  <div className="empty-note">Nothing updated in the last 30 days yet.</div>
                ) : (
                  leaderboard.topLayoutsThisMonth.map((layout) => (
                    <div key={layout.id} className="cart-row" onClick={() => handleViewLayoutById(layout.id)} title="View this layout">
                      <LayoutThumb url={layout.thumbnailUrl} />
                      <div className="name">
                        {layout.name}
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
                          by {layout.authorName} · ♥ {layout.likesCount} · Copied {layout.copyCount}×
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {tab === 'checklist' && (
          <div id="checklist-panel" style={{ display: 'flex', padding: session ? 14 : 0, flexDirection: 'column' }}>
            {authLoading ? (
              <div className="empty-note">Loading…</div>
            ) : !session ? (
              <>
                {supabase && (
                  <div style={{ padding: '14px 14px 0 14px', fontSize: 10, color: 'var(--ink-soft)' }}>ACCOUNT</div>
                )}
                <AuthPanel />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                    {checkedCount} of {checklistItems.length} packed
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
                    Hide packed
                  </label>
                </div>
                {checklistError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{checklistError}</div>}
                {checklistLoading ? (
                  <div className="empty-note">Loading your checklist…</div>
                ) : (
                  CHECKLIST_CATEGORY_ORDER.filter((category) => groupedChecklist[category]).map((category) => {
                    const subcats = groupedChecklist[category]
                    const totalInCategory = Object.values(subcats).flat().length
                    const checkedInCategory = Object.values(subcats).flat().filter((i) => i.checked).length
                    const isOpen = openChecklistCategories.has(category)
                    return (
                      <div key={category} className="category-section">
                        <button className="category-header" onClick={() => toggleChecklistCategory(category)}>
                          <span>{CATEGORY_ICONS[category] || '📦'} {category}</span>
                          <span className="category-meta">{checkedInCategory}/{totalInCategory} {isOpen ? '−' : '+'}</span>
                        </button>
                        {isOpen && (
                          <>
                            {Object.entries(subcats).map(([subcategory, items]) => {
                              const visible = items.filter((item) => !hideChecked || !item.checked)
                              if (visible.length === 0) return null
                              return (
                                <div key={subcategory}>
                                  {subcategory !== 'General' && <div className="subcategory-label">{subcategory}</div>}
                                  {visible.map((item) => (
                                    <div key={item.id} className="checklist-row">
                                      <label className="checklist-label-wrap">
                                        <input
                                          type="checkbox"
                                          checked={item.checked}
                                          onChange={(e) => handleToggleChecklistItem(item.id, e.target.checked)}
                                        />
                                        <span className={`checklist-label ${item.checked ? 'checked' : ''}`}>{item.label}</span>
                                      </label>
                                      <button className="remove-btn" onClick={() => handleDeleteChecklistItem(item.id)}>×</button>
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                            <div className="checklist-add-row">
                              <input
                                placeholder="Add an item…"
                                value={checklistDrafts[category] || ''}
                                onChange={(e) => setChecklistDrafts((prev) => ({ ...prev, [category]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem(category)}
                              />
                              <button onClick={() => handleAddChecklistItem(category)}>+</button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
        )}

        <div id="total-bar">
          <div id="total-row">
            <span className="label">Estimated total</span>
            <span className="amount">${total.toLocaleString()}</span>
          </div>
          <button id="checkout-btn" disabled={purchasableCart.length === 0} onClick={() => setShowReceipt(true)}>
            Get shopping list
          </button>
        </div>
      </div>

      {reportTarget && (
        <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && setReportTarget(null)}>
          <div id="receipt">
            <h2>Report {reportTarget.type}</h2>
            <div className="rsub">"{reportTarget.label}" — reviewed by Tyler directly, not automatically actioned.</div>
            <div style={{ marginBottom: 12 }}>
              {REPORT_REASONS.map((r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink)', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="radio" name="report-reason" checked={reportReason === r} onChange={() => setReportReason(r)} />
                  {r}
                </label>
              ))}
            </div>
            {reportReason === 'Other' && (
              <textarea
                placeholder="What's going on?"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 12.5, marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }}
              />
            )}
            {reportNotice && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{reportNotice}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setReportTarget(null)}
                style={{ flex: 1, background: 'var(--paper-shadow)', color: 'var(--ink-soft)', border: 'none', padding: 10, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                style={{ flex: 1, background: 'var(--danger)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}

      {publishPrompt && (
        <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && setPublishPrompt(null)}>
          <div id="receipt">
            <h2>Publish "{publishPrompt.name}"</h2>
            <div className="rsub">
              Optional — helps other students find layouts from their own hall or room type on Browse. Skip if you'd rather not say.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 4 }}>Hall</label>
              <input
                placeholder="e.g. Curtis Hall"
                value={publishHall}
                onChange={(e) => setPublishHall(e.target.value)}
                style={{ width: '100%', padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 12.5 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 4 }}>Room type</label>
              <select
                value={publishRoomType}
                onChange={(e) => setPublishRoomType(e.target.value)}
                style={{ width: '100%', padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 12.5, textTransform: 'capitalize' }}
              >
                <option value="">Not specified</option>
                {ROOM_TYPES.map((rt) => (
                  <option key={rt} value={rt} style={{ textTransform: 'capitalize' }}>{rt}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 4 }}>Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                {SUGGESTED_TAGS.filter((t) => !publishTags.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addPublishTag(t)}
                    style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 10.5, cursor: 'pointer' }}
                  >
                    + {t}
                  </button>
                ))}
              </div>
              {publishTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {publishTags.map((t) => (
                    <span
                      key={t}
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {t}
                      <span style={{ cursor: 'pointer' }} onClick={() => removePublishTag(t)}>×</span>
                    </span>
                  ))}
                </div>
              )}
              <input
                placeholder="Custom tag, press Enter…"
                value={publishTagDraft}
                onChange={(e) => setPublishTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addPublishTag(publishTagDraft)
                  }
                }}
                style={{ width: '100%', padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 12.5 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={skipPublishPrompt}
                style={{ flex: 1, background: 'var(--paper-shadow)', color: 'var(--ink-soft)', border: 'none', padding: 10, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Skip & publish
              </button>
              <button
                onClick={confirmPublish}
                style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && (
        <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && setShowReceipt(false)}>
          <div id="receipt">
            <h2>Shopping list</h2>
            <div className="rsub">Everything you placed, ready to buy. Opens each retailer's site. Colgate-provided furniture isn't included — there's nothing to buy for that.</div>
            <div>
              {purchasableCart.map((it) => (
                <div key={it.uid} className="receipt-line">
                  <div className="rname">
                    {it.cat.name}
                    <span className="rstore">{it.cat.retailer}</span>
                  </div>
                  <div>
                    <a href={retailerLink(it.cat.retailer, it.cat.name)} target="_blank" rel="noopener noreferrer">
                      ${it.cat.price} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div id="receipt-total">
              <span>Total</span>
              <span>${total.toLocaleString()}</span>
            </div>
            <button id="close-modal" onClick={() => setShowReceipt(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
