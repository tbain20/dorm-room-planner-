import { useState } from 'react'
import { layoutShopSummary } from './catalog.js'
import SaveToBoardMenu from './SaveToBoardMenu.jsx'
import RoomFallbackIcon from './RoomFallbackIcon.jsx'

// One card in the masonry gallery (see BrowsePage.jsx). Image-dominant by design — name,
// creator, and the shop-summary line are hidden until hover (or always-on in a compact caption
// under the image on narrow/touch screens, where CSS :hover isn't a reliable reveal mechanism —
// see the .gallery-card-caption-mobile rule in index.css). Clicking the image itself loads the
// layout into the 3D editor, same primary action the old Browse row's whole-row click had; the
// hover overlay's icon row is the "without a full click-through" quick-action set the redesign
// brief asked for — like, save-to-board, copy, and a shop shortcut straight to this layout's
// priced list on its own /layouts/:id page.
export default function BrowseLayoutCard({
  layout, liked, saved, signedIn, onView, onToggleLike, onOpenSaveMenu, onCopy, onViewDetails, onViewProfile,
  saveMenuOpen, saveMenuProps,
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const shopSummary = layoutShopSummary(layout.items)
  const byline = layout.designerName ? `Designed by ${layout.designerName}` : layout.authorName ? `by ${layout.authorName}` : 'by a student'

  return (
    <div className="gallery-card">
      <div className="gallery-card-media" onClick={onView} title="Click to load this layout into your room">
        {layout.thumbnailUrl && !imgFailed ? (
          <img src={layout.thumbnailUrl} alt={layout.name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="gallery-card-media-fallback"><RoomFallbackIcon size={40} /></div>
        )}
        <div className="gallery-card-overlay">
          <div className="gallery-card-actions">
            <button
              className={liked ? 'active' : ''}
              title={signedIn ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
              onClick={(e) => { e.stopPropagation(); onToggleLike() }}
            >
              {liked ? '♥' : '♡'}{layout.likesCount > 0 ? ` ${layout.likesCount}` : ''}
            </button>
            <button
              className={saved ? 'active' : ''}
              title={signedIn ? 'Save to board' : 'Sign in to save'}
              onClick={(e) => { e.stopPropagation(); onOpenSaveMenu() }}
            >
              {saved ? '🔖' : '☆'}
            </button>
            <button
              title={signedIn ? 'Copy to your layouts' : 'Sign in to copy'}
              onClick={(e) => { e.stopPropagation(); onCopy() }}
            >
              +
            </button>
          </div>
          <div className="gallery-card-caption">
            <div className="gallery-card-name">{layout.name}</div>
            <div
              className="gallery-card-byline"
              onClick={(e) => { e.stopPropagation(); onViewProfile() }}
            >
              {byline}
            </div>
            {shopSummary.count > 0 && (
              <button className="gallery-card-shop" title="Shop" onClick={(e) => { e.stopPropagation(); onViewDetails() }}>
                🛒 {shopSummary.count} item{shopSummary.count === 1 ? '' : 's'} · from ${shopSummary.total.toLocaleString()}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="gallery-card-caption-mobile">
        <div className="gallery-card-name">{layout.name}</div>
        <div className="gallery-card-byline">{byline}</div>
        {shopSummary.count > 0 && (
          <div className="gallery-card-shop-static">
            🛒 {shopSummary.count} item{shopSummary.count === 1 ? '' : 's'} · from ${shopSummary.total.toLocaleString()}
          </div>
        )}
        <div className="gallery-card-actions-mobile">
          <button
            className={liked ? 'active' : ''}
            title={signedIn ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
            onClick={onToggleLike}
          >
            {liked ? '♥' : '♡'}{layout.likesCount > 0 ? ` ${layout.likesCount}` : ''}
          </button>
          <button className={saved ? 'active' : ''} title={signedIn ? 'Save to board' : 'Sign in to save'} onClick={onOpenSaveMenu}>
            {saved ? '🔖 Saved' : '☆ Save'}
          </button>
          <button title={signedIn ? 'Copy to your layouts' : 'Sign in to copy'} onClick={onCopy}>+ Copy</button>
        </div>
      </div>

      {saveMenuOpen && <SaveToBoardMenu {...saveMenuProps} />}
    </div>
  )
}
