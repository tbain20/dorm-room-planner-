import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import {
  getPublicLayoutById, incrementLayoutViewCount, likeLayout, unlikeLayout, listMyLikedLayoutIds,
  saveLayoutBookmark, unsaveLayoutBookmark, listMySavedLayoutIds, copyLayout,
  listComments, addComment, deleteComment, submitReport,
} from './storage.js'

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

  const pageStyle = { maxWidth: 640, margin: '0 auto', padding: '40px 20px 80px', fontFamily: 'Inter, sans-serif', color: '#2b2620' }

  if (loading) {
    return <div style={pageStyle}>Loading…</div>
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <Link to="/" style={{ color: '#b2542f' }}>← Dorm Room Planner</Link>
        <h1 style={{ marginTop: 20 }}>This layout isn't available</h1>
        <p style={{ color: '#8a8072' }}>It may have been deleted, or made private by its owner.</p>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <Link to="/" style={{ color: '#b2542f', fontSize: 13 }}>← Dorm Room Planner</Link>
      <h1 style={{ marginTop: 12, marginBottom: 4, fontSize: 26 }}>{layout.name}</h1>
      <div style={{ color: '#8a8072', fontSize: 13, marginBottom: 4 }}>
        {layout.authorId && (
          // Profile pages are still a pseudo-tab inside the main app (see "Public profiles +
          // follow"), not a real route yet — so this can only send you to the app, not deep-link
          // straight to their profile. Worth promoting alongside a future /u/:id route.
          <span>{layout.designerName ? `Designed by ${layout.designerName}` : `by ${layout.authorName || 'a student'}`}</span>
        )}
        {layout.parentLayoutId && (
          <>
            {' · '}
            <Link to={`/layouts/${layout.parentLayoutId}`} style={{ color: '#8a8072' }}>Based on another layout</Link>
          </>
        )}
      </div>
      <div style={{ color: '#8a8072', fontSize: 12.5, marginBottom: 20 }}>
        {layout.room.w}'×{layout.room.l}' {layout.roomType && `· ${layout.roomType} `}{layout.hall && `· ${layout.hall}`}
      </div>

      {layout.thumbnailUrl ? (
        <img src={layout.thumbnailUrl} alt={layout.name} style={{ width: '100%', borderRadius: 12, marginBottom: 20 }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '4/3', background: '#eee6d8', borderRadius: 12, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
          🏠
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={handleToggleLike} style={btnStyle(liked)}>{liked ? '♥' : '♡'} {likesCount}</button>
        <button onClick={handleToggleSave} style={btnStyle(saved)}>{saved ? '🔖 Saved' : '☆ Save'}</button>
        <button onClick={handleOpenInEditor} style={btnStyle(false)}>↺ Open in 3D editor</button>
        <button onClick={handleCopy} style={btnStyle(false)}>+ Copy to my layouts</button>
        <button onClick={handleReport} style={{ ...btnStyle(false), marginLeft: 'auto' }}>🚩</button>
      </div>
      {actionError && <div style={{ color: '#b23a3a', fontSize: 12, marginBottom: 12 }}>{actionError}</div>}
      {copyNotice && <div style={{ color: '#6b7a5e', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>{copyNotice}</div>}
      {!session && <div style={{ color: '#8a8072', fontSize: 11.5, marginBottom: 20 }}>Sign in on the main app to like, save, copy, or comment.</div>}

      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 10 }}>Comments {comments.length > 0 && `(${comments.length})`}</h2>
      {commentsError && <div style={{ color: '#b23a3a', fontSize: 12, marginBottom: 10 }}>{commentsError}</div>}
      {session && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            style={{ flex: 1, padding: 9, border: '1px solid #e5ddcc', borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={handleAddComment} style={{ background: '#b2542f', color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Post
          </button>
        </div>
      )}
      {comments.length === 0 ? (
        <div style={{ color: '#8a8072', fontSize: 13 }}>No comments yet.</div>
      ) : (
        comments.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #eee6d8' }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#2b2620' }}>{c.authorName}</div>
              <div style={{ fontSize: 13, color: '#2b2620', marginTop: 2 }}>{c.body}</div>
            </div>
            {session && (session.user.id === c.authorId || session.user.id === layout.authorId) && (
              <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#8a8072', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>×</button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function btnStyle(active) {
  return {
    border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? '#b2542f' : '#eee6d8', color: active ? '#fff' : '#5c5548',
  }
}
