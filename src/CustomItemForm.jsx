import { useState } from 'react'
import { ALL_CATALOG_ITEMS, CATEGORY_ORDER, CATEGORY_ICONS } from './catalog.js'
import CatalogThumb from './CatalogThumb.jsx'
import { feetToUnit, unitToFeet } from './units.js'

// Only ft/cm here, not the room planner's full ft-in/ft/cm trio — there's no sensible typed-
// decimal form of "5'6\"" for a plain number input, so ft-in isn't offered as a choice.
const DIM_UNITS = [
  { id: 'ft', label: 'ft' },
  { id: 'cm', label: 'cm' },
]

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
  const [dimUnit, setDimUnit] = useState('ft')
  const [dimMenuOpen, setDimMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Dims stay blank on pick, not pre-filled — leaving a field blank means "same as the stand-in,"
  // not "0". The stand-in's own dims show as each field's placeholder (see the inputs below) so
  // the default is still visible without committing to a value the user has to clear.
  function pickStandIn(cat) {
    setStandIn(cat)
  }

  // Re-expresses whatever's already typed in feet/cm terms when the unit toggle changes, so
  // switching units mid-entry rescales the numbers instead of silently reinterpreting them (24
  // typed as cm shouldn't suddenly mean 24 feet just because the toggle moved).
  function changeDimUnit(newUnit) {
    if (newUnit === dimUnit) { setDimMenuOpen(false); return }
    const convert = (value, setValue) => {
      if (!value.trim()) return
      const n = parseFloat(value)
      if (!(n > 0)) return
      const feet = unitToFeet(n, dimUnit)
      const converted = feetToUnit(feet, newUnit)
      setValue(String(newUnit === 'cm' ? Math.round(converted) : Math.round(converted * 10) / 10))
    }
    convert(width, setWidth)
    convert(depth, setDepth)
    convert(height, setHeight)
    setDimUnit(newUnit)
    setDimMenuOpen(false)
  }

  // The stand-in's own dims (always feet) shown in the unit the user currently has selected, so
  // the placeholder stays an honest preview of what "left blank" will actually use.
  function dimPlaceholder(axisIndex) {
    const v = feetToUnit(standIn.dims[axisIndex], dimUnit)
    return dimUnit === 'cm' ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  }

  // Each dim is independently optional — parseDim returns null for a blank field (buildCustom-
  // CatalogItem then falls back to the stand-in's own dims for that axis), a positive number of
  // feet for a filled one (converting from whatever dimUnit is currently selected — the catalog
  // itself always stores dims in feet), or throws if what's typed isn't a valid positive number.
  function parseDim(value, label) {
    if (!value.trim()) return null
    const n = parseFloat(value)
    if (!(n > 0)) throw new Error(`${label} must be a positive number, or left blank to match the stand-in`)
    return unitToFeet(n, dimUnit)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Name is required')
    if (!productUrl.trim()) return setError('Product URL is required')
    if (!standIn) return setError('Choose a model to stand in for this item')
    let w, d, h
    try {
      w = parseDim(width, 'Width')
      d = parseDim(depth, 'Depth')
      h = parseDim(height, 'Height')
    } catch (err) {
      return setError(err.message)
    }
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
          <div className="custom-item-dims-header">
            <span>Dimensions (optional)</span>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="unit-menu-trigger"
                onClick={() => setDimMenuOpen((v) => !v)}
                disabled={busy}
              >
                📏 {DIM_UNITS.find((u) => u.id === dimUnit)?.label} ▾
              </button>
              {dimMenuOpen && (
                <>
                  <div className="board-popover-backdrop" onClick={() => setDimMenuOpen(false)} />
                  <div className="unit-menu" style={{ right: 0, left: 'auto' }} onClick={(e) => e.stopPropagation()}>
                    {DIM_UNITS.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="unit-menu-option"
                        style={dimUnit === u.id ? { background: 'var(--accent)', color: '#fff' } : undefined}
                        onClick={() => changeDimUnit(u.id)}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="custom-item-dims-row">
            <label className="custom-item-field">
              <span>Width ({dimUnit})</span>
              <input
                value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" disabled={busy}
                placeholder={standIn ? dimPlaceholder(0) : '—'}
              />
            </label>
            <label className="custom-item-field">
              <span>Depth ({dimUnit})</span>
              <input
                value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" disabled={busy}
                placeholder={standIn ? dimPlaceholder(1) : '—'}
              />
            </label>
            <label className="custom-item-field">
              <span>Height ({dimUnit})</span>
              <input
                value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" disabled={busy}
                placeholder={standIn ? dimPlaceholder(2) : '—'}
              />
            </label>
          </div>
          <div className="rsub" style={{ marginBottom: 0, marginTop: -4 }}>
            Leave any of these blank to use the stand-in's own size for that dimension.
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
