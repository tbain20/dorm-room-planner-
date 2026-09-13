import { useState } from 'react'
import { WALL_ART_TYPES, WALL_ART_SIZE_PRESETS } from './catalog.js'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB — generous for a poster photo, small enough that a
// mis-picked full-res camera photo or screenshot doesn't quietly upload something huge.

// "Upload custom wall art" modal (Catalog tab → Decor, App.jsx) — a Type (Poster/Flag/Tapestry —
// see catalog.js's WALL_ART_TYPES; this generalizes what used to be poster-only), name, an optional
// buy-it URL (same shopping-list buy-link role as a real catalog item's productUrl — see
// catalog.js's catalogItemLink/buildCustomPosterCatalogItem), a size (one of that type's own preset
// sizes, or a free-form Width/Height in inches via the "Custom" option), and an image file. Same
// controlled-draft/busy/error shape as CustomItemForm.jsx/SaveToBoardMenu.jsx.
// Sentinel selected in place of a size preset entry when the user wants free-form dimensions instead
// — kept as an object with the same `label` shape the preset buttons already key off of, so the
// existing selected-state comparison (`size.label === preset.label`) doesn't need a separate branch.
const CUSTOM_SIZE = { label: 'Custom' }

export default function PosterUploadForm({ onCreate, onClose }) {
  const [artType, setArtType] = useState(WALL_ART_TYPES[0].id)
  const [name, setName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [size, setSize] = useState(WALL_ART_SIZE_PRESETS[WALL_ART_TYPES[0].id][0])
  const [customWidthIn, setCustomWidthIn] = useState('')
  const [customHeightIn, setCustomHeightIn] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const presets = WALL_ART_SIZE_PRESETS[artType]

  function handleTypeChange(nextType) {
    setArtType(nextType)
    // Switching type swaps which preset list applies — reset to that type's own first preset
    // instead of leaving a stale size selected from the previous type's list.
    setSize(WALL_ART_SIZE_PRESETS[nextType][0])
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Please choose an image file')
    if (f.size > MAX_FILE_BYTES) return setError('Image is too large — please choose one under 8MB')
    setError('')
    setFile(f)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Name is required')
    if (!file) return setError('Choose an image to upload')
    let widthIn, heightIn
    if (size === CUSTOM_SIZE) {
      widthIn = parseFloat(customWidthIn)
      heightIn = parseFloat(customHeightIn)
      if (!(widthIn > 0) || !(heightIn > 0)) return setError('Enter a width and height in inches')
    } else {
      widthIn = size.widthIn
      heightIn = size.heightIn
    }
    setBusy(true)
    setError('')
    try {
      await onCreate({ file, name: name.trim(), widthIn, heightIn, productUrl: productUrl.trim(), artType })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && !busy && onClose()}>
      <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Upload custom wall art</h2>
        <div className="rsub">Pick a type and size, upload an image, and it'll render on a panel sized to fit — see it in the room before you print or buy anything.</div>
        <form onSubmit={handleSubmit} className="custom-item-form">
          <div className="custom-item-standin-label">Type</div>
          <div className="poster-size-row">
            {WALL_ART_TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`poster-size-option${artType === t.id ? ' selected' : ''}`}
                onClick={() => handleTypeChange(t.id)}
                disabled={busy}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="custom-item-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concert poster" disabled={busy} />
          </label>

          <label className="custom-item-field">
            <span>Product URL (optional)</span>
            <input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://…" disabled={busy} />
          </label>

          <div className="custom-item-standin-label">Size</div>
          <div className="poster-size-row">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.label}
                className={`poster-size-option${size.label === preset.label ? ' selected' : ''}`}
                onClick={() => setSize(preset)}
                disabled={busy}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={`poster-size-option${size === CUSTOM_SIZE ? ' selected' : ''}`}
              onClick={() => setSize(CUSTOM_SIZE)}
              disabled={busy}
            >
              Custom
            </button>
          </div>
          {size === CUSTOM_SIZE && (
            <div className="custom-item-dims-row">
              <label className="custom-item-field">
                <span>Width (in)</span>
                <input
                  value={customWidthIn} onChange={(e) => setCustomWidthIn(e.target.value)}
                  inputMode="decimal" placeholder="e.g. 20" disabled={busy}
                />
              </label>
              <label className="custom-item-field">
                <span>Height (in)</span>
                <input
                  value={customHeightIn} onChange={(e) => setCustomHeightIn(e.target.value)}
                  inputMode="decimal" placeholder="e.g. 30" disabled={busy}
                />
              </label>
            </div>
          )}

          <label className="custom-item-field">
            <span>Image</span>
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={busy} />
          </label>
          {previewUrl && (
            <div className="poster-preview-wrap">
              <img src={previewUrl} alt="" className="poster-preview" />
            </div>
          )}

          {error && <div className="board-popover-error">{error}</div>}
          <div className="custom-item-actions">
            <button type="button" onClick={onClose} disabled={busy} className="custom-item-cancel">Cancel</button>
            <button type="submit" disabled={busy} className="custom-item-submit">{busy ? 'Uploading…' : 'Add to room'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
