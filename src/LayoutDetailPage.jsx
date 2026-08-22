import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import {
  getPublicLayoutById, incrementLayoutViewCount, likeLayout, unlikeLayout, listMyLikedLayoutIds,
  saveLayoutBookmark, unsaveLayoutBookmark, listMySavedLayoutIds, copyLayout,
  listComments, addComment, deleteComment, submitReport,
} from './storage.js'
import { resolveLayoutCatalogItems, catalogItemLink } from './catalog.js'
import CatalogThumb from './CatalogThumb.jsx'

// The standalone page a shared /layouts/:id link opens to — a static render (thumbnail + info),
// not a live 3D view. Spinning up a second RoomEngine instance just for this page would mean
// duplicating a good chunk of App.jsx's Three.js setup for a page whose whole point is to be
// lightweight and shareable; "3D view or a static render" was explicitly offered as an either/or
// in the brief, and the thumbnail already exists for every layout (captured at save time).
export default function LayoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [layout, setLayout] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [actionError, setActionError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [comments, setComments] = useState([])
  const [commentsError, setCommentsError] = useState('')
  const [commentBody, setCommentBody] = useState('')

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    getPublicLayoutById(id)
      .then((data) => {
        if (!data) {
          setNotFound(true)
          return
        }
        setLayout(data)
        setLikesCount(data.likesCount)
        document.title = `${data.name} — Dorm Room Planner`
        incrementLayoutViewCount(id)
      })
      .finally(() => setLoading(false))
    listComments(id).then(setComments).catch((err) => setCommentsError(err.message))
  }, [id])

  useEffect(() => {
    if (!session) {
      setLiked(false)
      setSaved(false)
      return
    }
    listMyLikedLayoutIds().then((ids) => setLiked(ids.includes(id))).catch(() => {})
    listMySavedLayoutIds().then((ids) => setSaved(ids.includes(id))).catch(() => {})
  }, [session, id])

  async function handleToggleLike() {
    if (!session) return navigate('/')
    setActionError('')
    try {
      if (liked) {
        await unlikeLayout(id)
        setLiked(false)
        setLikesCount((n) => Math.max(0, n - 1))
      } else {
        await likeLayout(id)
        setLiked(true)
        setLikesCount((n) => n + 1)
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handleToggleSave() {
    if (!session) return navigate('/')
    setActionError('')
    try {
      if (saved) {
        await unsaveLayoutBookmark(id)
        setSaved(false)
      } else {
        await saveLayoutBookmark(id)
        setSaved(true)
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handleCopy() {
    if (!session) return navigate('/')
    setActionError('')
    try {
      const name = await copyLayout(layout)
      setCopyNotice(`Copied to your layouts as "${name}". Open the app to see it.`)
    } catch (err) {
      setActionError(err.message)
    }
  }

  function handleOpenInEditor() {
    navigate('/', { state: { loadLayout: layout } })
  }

  async function handleAddComment() {
    const body = commentBody.trim()
    if (!body || !session) return
    setCommentsError('')
    try {
      await addComment(id, body)
      setCommentBody('')
      setComments(await listComments(id))
    } catch (err) {
      setCommentsError(err.message)
    }
  }

  async function handleDeleteComment(commentId) {
    setCommentsError('')
    try {
      await deleteComment(commentId)
      setComments(await listComments(id))
    } catch (err) {
      setCommentsError(err.message)
    }
  }

  async function handleReport() {
    if (!session) return navigate('/')
    try {
      await submitReport('layout', id, 'Reported from shared link')
      setActionError('')
      setCopyNotice('Reported. Thanks for flagging it.')
    } catch (err) {
      setActionError(err.message)
    }
  }

  const pageStyle = { maxWidth: 640, margin: '0 auto', padding: '40px 20px 80px', fontFamily: 'var(--font-sans)', color: 'var(--ink)' }

  if (loading) {
    return <LayoutDetailSkeleton pageStyle={pageStyle} />
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <Link to="/" style={{ color: 'var(--accent)' }}>← Dorm Room Planner</Link>
        <h1 style={{ ...headingStyle, marginTop: 20 }}>This layout isn't available</h1>
        <p style={{ color: 'var(--ink-soft)' }}>It may have been deleted, or made private by its owner.</p>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
      <h1 style={{ ...headingStyle, marginTop: 12, marginBottom: 4, fontSize: 26 }}>{layout.name}</h1>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 4 }}>
        {layout.authorId && (
          // Profile pages are still a pseudo-tab inside the main app (see "Public profiles +
          // follow"), not a real route yet — so this can only send you to the app, not deep-link
          // straight to their profile. Worth promoting alongside a future /u/:id route.
          <span>{layout.designerName ? `Designed by ${layout.designerName}` : `by ${layout.authorName || 'a student'}`}</span>
        )}
        {layout.parentLayoutId && (
          <>
            {' · '}
            <Link to={`/layouts/${layout.parentLayoutId}`} style={{ color: 'var(--ink-soft)' }}>Based on another layout</Link>
          </>
        )}
      </div>
      <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 20 }}>
        {layout.room.w}'×{layout.room.l}' {layout.roomType && `· ${layout.roomType} `}{layout.hall && `· ${layout.hall}`}
      </div>

      {layout.thumbnailUrl ? (
        <img src={layout.thumbnailUrl} alt={layout.name} style={{ width: '100%', borderRadius: 12, marginBottom: 20 }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--paper-shadow)', borderRadius: 12, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
          🏠
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={handleToggleLike} title={liked ? 'Unlike' : 'Like'} style={btnStyle(liked)}>{liked ? '♥' : '♡'} {likesCount}</button>
        <button onClick={handleToggleSave} title={saved ? 'Unsave' : 'Save'} style={btnStyle(saved)}>{saved ? '🔖 Saved' : '☆ Save'}</button>
        <button onClick={handleOpenInEditor} title="Edit" style={btnStyle(false)}>↺ Open in 3D editor</button>
        <button onClick={handleCopy} title="Copy" style={btnStyle(false)}>+ Copy to my layouts</button>
        <button onClick={handleReport} title="Report" style={{ ...btnStyle(false), marginLeft: 'auto' }}>🚩</button>
      </div>
      {actionError && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{actionError}</div>}
      {copyNotice && <div style={{ color: 'var(--sage)', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>{copyNotice}</div>}
      {!session && <div style={{ color: 'var(--ink-soft)', fontSize: 11.5, marginBottom: 20 }}>Sign in on the main app to like, save, copy, or comment.</div>}

      <ShopThisRoom items={layout.items} />

      <h2 style={{ ...headingStyle, fontSize: 15, marginTop: 32, marginBottom: 10 }}>Comments {comments.length > 0 && `(${comments.length})`}</h2>
      {commentsError && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{commentsError}</div>}
      {session && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            style={{ flex: 1, padding: 9, border: '1px solid var(--paper-shadow)', borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={handleAddComment} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Post
          </button>
        </div>
      )}
      {comments.length === 0 ? (
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No comments yet — be the first to say something.</div>
      ) : (
        comments.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--paper-shadow)' }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>{c.authorName}</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{c.body}</div>
            </div>
            {session && (session.user.id === c.authorId || session.user.id === layout.authorId) && (
              <button onClick={() => handleDeleteComment(c.id)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>×</button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// Shown while the layout's own fetch is in flight — mirrors the real page's shape (back link,
// title, meta line, hero image, action-button row, then a few shop-list rows) with pulsing
// placeholder blocks instead of a bare "Loading…" or a blank flash, since this is usually the
// very first thing a visitor following a shared link sees.
function LayoutDetailSkeleton({ pageStyle }) {
  return (
    <div style={pageStyle}>
      <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
      <div className="skeleton" style={{ width: '55%', height: 26, marginTop: 16, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '35%', height: 13, marginBottom: 20 }} />
      <div className="skeleton" style={{ width: '100%', aspectRatio: '4/3', marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[70, 90, 140, 150].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 30, borderRadius: 999 }} />
        ))}
      </div>
      <div className="skeleton" style={{ width: '30%', height: 15, marginBottom: 14 }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--paper-shadow)' }}>
          <div className="skeleton" style={{ width: 44, height: 44, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ width: '60%', height: 13, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: '35%', height: 11 }} />
          </div>
          <div className="skeleton" style={{ width: 70, height: 24, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  )
}

// Every item actually placed in this layout, as a flat priced/linked list — the same catalog
// join roomEngine uses to render a saved layout into the 3D scene, just rendered as rows instead
// of meshes. Reads directly off the layout's own `items` array (already fetched with the rest of
// the layout — no extra query), so this works for signed-out visitors exactly like the rest of
// this page. Colgate-provided furniture still shows (dims matter for the "does this fit"
// fit-check even for furniture you're not buying) but gets an "Included by Colgate" tag instead
// of a Buy button, and is excluded from the total — same treatment the in-app shopping list
// modal already gives it.
function ShopThisRoom({ items }) {
  const resolved = resolveLayoutCatalogItems(items)
  const total = resolved.filter((c) => !c.isProvided).reduce((sum, c) => sum + c.price, 0)

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ ...headingStyle, fontSize: 15, marginBottom: 10 }}>Shop this room</h2>
      {resolved.length === 0 ? (
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>This room doesn't have any items yet.</div>
      ) : (
        <>
          {resolved.map((cat, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--paper-shadow)' }}>
              <CatalogThumb cat={cat} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                  {cat.dims[0]}' × {cat.dims[1]}' × {cat.dims[2]}'
                  {cat.rating && ` · ★ ${cat.rating}${cat.reviewCount ? ` (${cat.reviewCount.toLocaleString()})` : ''}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {cat.isProvided ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sage)' }}>Included by Colgate</div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>${cat.price}</div>
                    <a
                      href={catalogItemLink(cat)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 10.5, fontWeight: 600, color: '#fff', background: 'var(--accent)', borderRadius: 999,
                        padding: '4px 10px', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap',
                      }}
                    >
                      Buy on {cat.retailer} ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            <span>Estimated total</span>
            <span>${total.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  )
}

// Headings otherwise inherit pageStyle's sans body font unless overridden — every other page in
// the app uses the serif (Fraunces) for headings and sans only for body text, so h1/h2 need this
// explicit override to match rather than silently rendering in the wrong typeface. Module-level
// since both LayoutDetailPage and ShopThisRoom (a separate component below) need it.
const headingStyle = { fontFamily: 'var(--font-serif)', fontWeight: 650 }

function btnStyle(active) {
  return {
    border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--paper-shadow)', color: active ? '#fff' : 'var(--ink-soft)',
  }
}
