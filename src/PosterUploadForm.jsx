import { useState } from 'react'
import { POSTER_SIZE_PRESETS } from './catalog.js'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB — generous for a poster photo, small enough that a
// mis-picked full-res camera photo or screenshot doesn't quietly upload something huge.

// "Upload your own poster" modal (Catalog tab → Decor, App.jsx) — name, a standard poster-size
// preset (not free-form dims, same simplification the real 'poster'/'poster-landscape' catalog
// entries already made), and an image file. Same controlled-draft/busy/error shape as
// CustomItemForm.jsx/SaveToBoardMenu.jsx.
export default function PosterUploadForm({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [size, setSize] = useState(POSTER_SIZE_PRESETS[1])
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    setBusy(true)
    setError('')
    try {
      await onCreate({ file, name: name.trim(), widthIn: size.widthIn, heightIn: size.heightIn })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && !busy && onClose()}>
      <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Upload your own poster</h2>
        <div className="rsub">Pick a size, upload an image, and it'll render on a framed panel sized to fit — see it in the room before you print or buy anything.</div>
        <form onSubmit={handleSubmit} className="custom-item-form">
          <label className="custom-item-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concert poster" disabled={busy} />
          </label>

          <div className="custom-item-standin-label">Size</div>
          <div className="poster-size-row">
            {POSTER_SIZE_PRESETS.map((preset) => (
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
          </div>

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
            <button type="submit" disabled={busy} className="custom-item-submit">{busy ? 'Uploading…' : 'Add poster'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
