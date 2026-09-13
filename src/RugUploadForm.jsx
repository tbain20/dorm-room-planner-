import { useState } from 'react'
import { RUG_SHAPES, RUG_SIZE_PRESETS } from './catalog.js'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB — same cap as PosterUploadForm.jsx, same reasoning.

// "Upload custom rug" modal (Catalog tab → Decor, App.jsx) — a Shape (Rectangle/Round/Square — see
// catalog.js's RUG_SHAPES), name, an optional buy-it URL, a size (one of that shape's own preset
// sizes, or a free-form size via the "Custom" option), and an image file. Direct copy of
// PosterUploadForm.jsx's own shape, just Shape instead of Type and — since round/square only ever
// need one number, not a separate width and height — the "Custom" option asks for a single
// Diameter/Side field for those two shapes instead of Width+Height.
const CUSTOM_SIZE = { label: 'Custom' }

export default function RugUploadForm({ onCreate, onClose }) {
  const [shape, setShape] = useState(RUG_SHAPES[0].id)
  const [name, setName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [size, setSize] = useState(RUG_SIZE_PRESETS[RUG_SHAPES[0].id][0])
  const [customWidthIn, setCustomWidthIn] = useState('')
  const [customHeightIn, setCustomHeightIn] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const presets = RUG_SIZE_PRESETS[shape]
  const singleDimension = shape !== 'rectangle'

  function handleShapeChange(nextShape) {
    setShape(nextShape)
    setSize(RUG_SIZE_PRESETS[nextShape][0])
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
      heightIn = singleDimension ? widthIn : parseFloat(customHeightIn)
      if (!(widthIn > 0) || !(heightIn > 0)) {
        return setError(singleDimension ? 'Enter a size in inches' : 'Enter a width and height in inches')
      }
    } else {
      widthIn = size.widthIn
      heightIn = size.heightIn
    }
    setBusy(true)
    setError('')
    try {
      await onCreate({ file, name: name.trim(), widthIn, heightIn, productUrl: productUrl.trim(), shape })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && !busy && onClose()}>
      <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Upload custom rug</h2>
        <div className="rsub">Pick a shape and size, upload your design, and it'll render on the floor sized to fit — see it in the room before you buy anything.</div>
        <form onSubmit={handleSubmit} className="custom-item-form">
          <div className="custom-item-standin-label">Shape</div>
          <div className="poster-size-row">
            {RUG_SHAPES.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`poster-size-option${shape === s.id ? ' selected' : ''}`}
                onClick={() => handleShapeChange(s.id)}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="custom-item-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Living room rug" disabled={busy} />
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
                <span>{singleDimension ? (shape === 'round' ? 'Diameter (in)' : 'Side (in)') : 'Width (in)'}</span>
                <input
                  value={customWidthIn} onChange={(e) => setCustomWidthIn(e.target.value)}
                  inputMode="decimal" placeholder="e.g. 60" disabled={busy}
                />
              </label>
              {!singleDimension && (
                <label className="custom-item-field">
                  <span>Height (in)</span>
                  <input
                    value={customHeightIn} onChange={(e) => setCustomHeightIn(e.target.value)}
                    inputMode="decimal" placeholder="e.g. 36" disabled={busy}
                  />
                </label>
              )}
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
