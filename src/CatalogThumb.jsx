import { useState } from 'react'
import { CATEGORY_ICONS, thumbnailUrl } from './catalog.js'

// Real thumbnail rendered from the item's model when one exists; falls back to a flat color
// swatch (plus a category icon, so it's not just a blank chip) for box-placeholder items or if
// the image 404s. Shared between the in-app catalog sidebar (App.jsx) and the public layout
// detail page (LayoutDetailPage.jsx) so both surfaces render the same thumbnail for the same
// item — `size` lets callers scale it up from the sidebar's default 30px (set via the `.swatch`
// CSS class) without duplicating this component.
export default function CatalogThumb({ cat, size }) {
  const [imgFailed, setImgFailed] = useState(false)
  const swatchColor = `#${cat.color.toString(16).padStart(6, '0')}`
  const url = thumbnailUrl(cat)
  const sizeStyle = size ? { width: size, height: size } : {}

  if (url && !imgFailed) {
    return (
      <div className="swatch" style={{ background: swatchColor, padding: 0, ...sizeStyle }}>
        <img src={url} alt="" onError={() => setImgFailed(true)} className="swatch-img" />
      </div>
    )
  }
  return (
    <div className="swatch" style={{ background: swatchColor, ...sizeStyle }}>
      <span className="swatch-icon" style={size ? { fontSize: size * 0.45 } : undefined}>{CATEGORY_ICONS[cat.category] || '📦'}</span>
    </div>
  )
}
