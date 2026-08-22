import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPublicBoardById } from './storage.js'

// The standalone page a shared /boards/:id link opens to — a public board is just a named
// collection of a student's saved layouts (see the Part B boards session) with is_public flipped
// on, so this page is intentionally light: a masonry grid of the board's layouts (reusing the
// Browse gallery's own .gallery-grid/.gallery-card CSS for a consistent look, just without the
// hover quick-actions — click straight through to a layout's own /layouts/:id page for
// like/save/copy/shop instead of duplicating that here) and nothing else. Board management
// (rename/delete/make public) stays exactly where it already lives, the Saved tab's board
// folders — this page is read-only, matching how LayoutDetailPage.jsx works for a single layout.
export default function BoardDetailPage() {
  const { id } = useParams()

  const [board, setBoard] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    getPublicBoardById(id)
      .then((data) => {
        if (!data) {
          setNotFound(true)
          return
        }
        setBoard(data)
        document.title = `${data.name} — Dorm Room Planner`
      })
      .finally(() => setLoading(false))
  }, [id])

  const pageStyle = { maxWidth: 1100, margin: '0 auto', padding: '40px 24px 100px', fontFamily: 'var(--font-sans)', color: 'var(--ink)' }

  if (loading) {
    return (
      <div style={pageStyle}>
        <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
        <div className="skeleton" style={{ width: '40%', height: 28, marginTop: 16, marginBottom: 24 }} />
        <div className="gallery-grid">
          {[220, 300, 180, 260].map((h, i) => (
            <div key={i} className="gallery-card">
              <div className="skeleton" style={{ width: '100%', height: h, borderRadius: 'var(--radius-md)' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, marginTop: 20 }}>This board isn't available</h1>
        <p style={{ color: 'var(--ink-soft)' }}>It may have been deleted, or made private by its owner.</p>
      </div>
    )
  }

  const byline = board.designerName ? `Designed by ${board.designerName}` : board.authorName ? `by ${board.authorName}` : 'by a student'

  return (
    <div style={pageStyle}>
      <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, fontSize: 28, marginTop: 12, marginBottom: 4 }}>📁 {board.name}</h1>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 24 }}>
        {byline} · {board.layouts.length} layout{board.layouts.length === 1 ? '' : 's'}
      </div>

      {board.layouts.length === 0 ? (
        <div className="browse-empty">This board doesn't have any public layouts in it yet.</div>
      ) : (
        <div className="gallery-grid">
          {board.layouts.map((layout) => (
            <BoardLayoutCard key={layout.id} layout={layout} />
          ))}
        </div>
      )}
    </div>
  )
}

function BoardLayoutCard({ layout }) {
  const [imgFailed, setImgFailed] = useState(false)
  const byline = layout.designerName ? `Designed by ${layout.designerName}` : layout.authorName ? `by ${layout.authorName}` : 'by a student'

  return (
    <Link to={`/layouts/${layout.id}`} className="gallery-card" style={{ textDecoration: 'none' }}>
      <div className="gallery-card-media" style={{ cursor: 'pointer' }}>
        {layout.thumbnailUrl && !imgFailed ? (
          <img src={layout.thumbnailUrl} alt={layout.name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="gallery-card-media-fallback">🏠</div>
        )}
      </div>
      <div className="gallery-card-caption-mobile" style={{ display: 'block' }}>
        <div className="gallery-card-name">{layout.name}</div>
        <div className="gallery-card-byline">{byline}</div>
        <div className="gallery-card-shop-static">
          {layout.items.length} item{layout.items.length === 1 ? '' : 's'} · {layout.room.w}'×{layout.room.l}'
        </div>
      </div>
    </Link>
  )
}
