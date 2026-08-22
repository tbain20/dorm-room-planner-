import { useState } from 'react'
import { ALL_CATALOG_ITEMS, CATEGORY_ORDER, CATEGORY_ICONS } from './catalog.js'
import CatalogThumb from './CatalogThumb.jsx'

// "Add a custom item" modal (Catalog tab, App.jsx) — lets a signed-in user add an item the
// curated catalog doesn't have: their own name/product link/price/dims, paired with an existing
// catalog item as a purely visual stand-in (its 3D model represents the item in the room; nothing
// else about the stand-in carries over — see catalog.js's buildCustomCatalogItem). Controlled-
// draft/busy/error shape matches SaveToBoardMenu.jsx; rendered as a full #modal-backdrop modal
// (not a small popover) since the stand-in picker needs real room for a scrollable thumbnail grid.
//
// Excludes already-registered custom items from the stand-in options (.filter(!c.isCustom)) —
// picking a previous custom item as a stand-in for a new one would be confusing (its own visual
// already came from a *real* catalog model one level down) and adds nothing a direct pick of that
// same underlying model wouldn't already give you.
const STAND_IN_OPTIONS = ALL_CATALOG_ITEMS.filter((c) => !c.isCustom)
const GROUPED_STAND_INS = CATEGORY_ORDER.map((category) => ({
  category,
  items: STAND_IN_OPTIONS.filter((c) => c.category === category),
})).filter((g) => g.items.length > 0)

export default function CustomItemForm({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [price, setPrice] = useState('')
  const [standIn, setStandIn] = useState(null)
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [height, setHeight] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function pickStandIn(cat) {
    setStandIn(cat)
    // Pre-fills dims from the stand-in as a starting point the user can then adjust to their real
    // item's real measurements — better than starting from a blank/zero footprint.
    setWidth(String(cat.dims[0]))
    setDepth(String(cat.dims[1]))
    setHeight(String(cat.dims[2]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Name is required')
    if (!productUrl.trim()) return setError('Product URL is required')
    if (!standIn) return setError('Choose a model to stand in for this item')
    const w = parseFloat(width)
    const d = parseFloat(depth)
    const h = parseFloat(height)
    if (!(w > 0) || !(d > 0) || !(h > 0)) return setError('Width, depth, and height must all be positive numbers')
    setBusy(true)
    setError('')
    try {
      await onCreate({
        name: name.trim(),
        productUrl: productUrl.trim(),
        price: parseFloat(price) || 0,
        width: w,
        depth: d,
        height: h,
        standInCatalogId: standIn.id,
      })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && !busy && onClose()}>
      <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add a custom item</h2>
        <div className="rsub">
          Not in the catalog? Add it yourself — pick an existing 3D model as a visual stand-in and it'll show up in your own
          catalog and shopping list with your real product link.
        </div>
        <form onSubmit={handleSubmit} className="custom-item-form">
          <label className="custom-item-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Herman Miller Aeron Chair" disabled={busy} />
          </label>
          <label className="custom-item-field">
            <span>Product URL</span>
            <input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://…" disabled={busy} />
          </label>
          <label className="custom-item-field">
            <span>Price (optional)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" inputMode="decimal" disabled={busy} />
          </label>
          <div className="custom-item-dims-row">
            <label className="custom-item-field">
              <span>Width (ft)</span>
              <input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" disabled={busy} />
            </label>
            <label className="custom-item-field">
              <span>Depth (ft)</span>
              <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" disabled={busy} />
            </label>
            <label className="custom-item-field">
              <span>Height (ft)</span>
              <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" disabled={busy} />
            </label>
          </div>

          <div className="custom-item-standin-label">
            Visual stand-in{standIn ? <> — <strong>{standIn.name}</strong></> : ''}
          </div>
          <div className="custom-item-standin-scroll">
            {GROUPED_STAND_INS.map((group) => (
              <div key={group.category}>
                <div className="subcategory-label">{CATEGORY_ICONS[group.category]} {group.category}</div>
                <div className="custom-item-standin-grid">
                  {group.items.map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      className={`custom-item-standin-option${standIn?.id === cat.id ? ' selected' : ''}`}
                      onClick={() => pickStandIn(cat)}
                      title={cat.name}
                      disabled={busy}
                    >
                      <CatalogThumb cat={cat} size={44} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="board-popover-error">{error}</div>}
          <div className="custom-item-actions">
            <button type="button" onClick={onClose} disabled={busy} className="custom-item-cancel">Cancel</button>
            <button type="submit" disabled={busy} className="custom-item-submit">{busy ? 'Adding…' : 'Add item'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
