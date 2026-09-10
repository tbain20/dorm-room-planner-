import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RoomEngine } from './roomEngine.js'
import { CATALOG, CATEGORY_ORDER, CATEGORY_ICONS, BEDDING_COLOR_SWATCHES } from './catalog.js'
import CatalogThumb from './CatalogThumb.jsx'
import { useAuth } from './useAuth.js'
import AuthPanel from './AuthPanel.jsx'
import { DEFAULT_UNIT_SYSTEM, formatLength } from './units.js'
import {
  listDesigns, createDesign, renameDesign, deleteDesign, getDesign,
  addRoomToDesign, saveDesignRoom, renameDesignRoom, deleteDesignRoom,
} from './storage.js'

// The general-purpose Room Designer's whole reason to exist: the same catalog as the dorm
// designer, minus anything Colgate provides for free (see catalog.js's isProvided flag) — the new
// bed-twin/bed-full-generic/bed-queen/bed-king entries pass this filter and are the size picker.
const GENERAL_CATALOG = CATALOG.filter((item) => !item.isProvided)

// --- Catalog panel (search + category accordion) — same shape as App.jsx's catalog tab, just
// fed GENERAL_CATALOG instead of the full CATALOG. Kept local to this file rather than shared
// with App.jsx per the plan's decision to keep the dorm designer untouched. ---
function CatalogPanel({ onAddItem }) {
  const [search, setSearch] = useState('')
  const [openCategories, setOpenCategories] = useState(() => new Set())

  const query = search.trim().toLowerCase()
  const matches = (item) => !query || item.name.toLowerCase().includes(query) || (item.groupLabel && item.groupLabel.toLowerCase().includes(query))

  const grouped = {}
  const seenGroupIds = new Set()
  for (const item of GENERAL_CATALOG) {
    if (item.groupId) {
      if (seenGroupIds.has(item.groupId)) continue
      seenGroupIds.add(item.groupId)
      const tiers = GENERAL_CATALOG.filter((c) => c.groupId === item.groupId)
      if (query && !tiers.some(matches)) continue
      const sub = item.subcategory || 'General'
      grouped[item.category] ??= {}
      grouped[item.category][sub] ??= []
      grouped[item.category][sub].push({ isGroup: true, groupId: item.groupId, groupLabel: item.groupLabel, tiers })
    } else {
      if (!matches(item)) continue
      const sub = item.subcategory || 'General'
      grouped[item.category] ??= {}
      grouped[item.category][sub] ??= []
      grouped[item.category][sub].push(item)
    }
  }

  function toggleCategory(category) {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <div id="catalog-panel">
      <div className="catalog-search-row">
        <input
          type="text"
          className="catalog-search-input"
          placeholder="Search the catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button className="catalog-search-clear" title="Clear search" onClick={() => setSearch('')}>×</button>}
      </div>
      {CATEGORY_ORDER.filter((category) => grouped[category]).map((category) => {
        const subcats = grouped[category]
        const itemCount = Object.values(subcats).reduce((n, items) => n + items.length, 0)
        const isOpen = query ? true : openCategories.has(category)
        return (
          <div key={category} className="category-section">
            <button className="category-header" onClick={() => toggleCategory(category)}>
              <span>{CATEGORY_ICONS[category]} {category}</span>
              <span className="category-meta">{itemCount} {isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && Object.entries(subcats).map(([subcategory, items]) => (
              <div key={subcategory}>
                {subcategory !== 'General' && <div className="subcategory-label">{subcategory}</div>}
                {items.map((cat) =>
                  cat.isGroup ? (
                    <div key={cat.groupId} className="cat-item cat-group">
                      <CatalogThumb cat={cat.tiers[0]} />
                      <div className="cat-info">
                        <div className="name">{cat.groupLabel}</div>
                        <div className="meta">{cat.tiers[0].dims[0]}' × {cat.tiers[0].dims[1]}' × {cat.tiers[0].dims[2]}'</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {cat.tiers.map((t) => (
                          <button key={t.id} className="add-btn" title={`${t.tier}: $${t.price}`} onClick={() => onAddItem(t.id)}>
                            +
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div key={cat.id} className="cat-item" onClick={() => onAddItem(cat.id)}>
                      <CatalogThumb cat={cat} />
                      <div className="cat-info">
                        <div className="name">{cat.name}</div>
                        <div className="meta">
                          {cat.dims[0]}' × {cat.dims[1]}' × {cat.dims[2]}' · <span className="retailer-tag">{cat.retailer}</span>
                        </div>
                      </div>
                      <div className="cat-price">${cat.price}</div>
                      <button className="add-btn" title="Add">+</button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )
      })}
      {query && Object.keys(grouped).length === 0 && (
        <div className="catalog-search-empty">No catalog items match "{search.trim()}".</div>
      )}
    </div>
  )
}

// --- The actual editor, mounted once a design is open. Keyed by design.id from the parent so
// switching to a *different* design (closing this one first) gets a clean remount instead of
// trying to re-point a live RoomEngine at a whole new room set. ---
function DesignEditor({ initialDesign, onExit }) {
  const canvasWrapRef = useRef(null)
  const engineRef = useRef(null)
  const roomsDataRef = useRef({}) // roomId -> { room, items, features } — the non-active rooms' cached state

  const [roomsMeta, setRoomsMeta] = useState(() => initialDesign.rooms.map((r) => ({ id: r.id, name: r.name })))
  const [currentRoomId, setCurrentRoomId] = useState(initialDesign.rooms[0].id)
  const [designName, setDesignName] = useState(initialDesign.name)
  const [room, setRoom] = useState(initialDesign.rooms[0].room)
  const [cart, setCart] = useState([])
  const [selection, setSelection] = useState(null)
  const [featureSelection, setFeatureSelection] = useState(null)
  const [tab, setTab] = useState('catalog')
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [renamingRoomId, setRenamingRoomId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [errorNotice, setErrorNotice] = useState('')
  const [colorPrompt, setColorPrompt] = useState(null)
  const [showDimensions, setShowDimensions] = useState(false)
  const [measureState, setMeasureState] = useState({ active: false, pointCount: 0, distanceFt: null })
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  useEffect(() => {
    for (const r of initialDesign.rooms) roomsDataRef.current[r.id] = { room: r.room, items: r.items, features: r.features || [] }
    const engine = new RoomEngine(canvasWrapRef.current, {
      onCartChange: setCart,
      onSelectionChange: setSelection,
      onFeatureSelectionChange: setFeatureSelection,
      onStackPickModeChange: () => {},
      onMeasureChange: setMeasureState,
      onNotice: () => {},
      unitSystem: DEFAULT_UNIT_SYSTEM,
    })
    engineRef.current = engine
    engine.loadState(roomsDataRef.current[currentRoomId])
    return () => engine.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPanelCollapsed(false)
  }, [selection, featureSelection])

  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    function onKeyDown(e) {
      if (isTypingTarget(document.activeElement)) return
      const key = e.key.toLowerCase()
      if (key === 'delete' || key === 'backspace') {
        if (selection) { e.preventDefault(); engineRef.current.removeItem(selection.uid) }
        else if (featureSelection) { e.preventDefault(); engineRef.current.removeFeature(featureSelection.id) }
      } else if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        engineRef.current.undo()
      } else if (key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selection) { e.preventDefault(); engineRef.current.rotateSelected() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, featureSelection])

  function handleDimChange(key, value) {
    const next = { ...room, [key]: parseFloat(value) || room[key] }
    setRoom(next)
    engineRef.current?.setRoomDims(next.w, next.l, next.h)
  }

  function handleAddItem(catalogId) {
    const cat = GENERAL_CATALOG.find((c) => c.id === catalogId)
    if (cat && cat.recolorsPillows) { setColorPrompt({ cat, kind: 'pillowcases' }); return }
    if (cat && cat.recolorsMattress) { setColorPrompt({ cat, kind: 'sheets' }); return }
    if (cat && cat.dressesBed && cat.groupId === 'blanket-throw') { setColorPrompt({ cat, kind: 'throw-blanket' }); return }
    engineRef.current.addItem(catalogId)
  }

  async function persistCurrentRoom() {
    const state = engineRef.current.getState()
    roomsDataRef.current[currentRoomId] = state
    try {
      await saveDesignRoom(currentRoomId, state)
    } catch (err) {
      setErrorNotice(err.message)
    }
  }

  async function handleQuickSave() {
    setSaveNotice('Saving…')
    await persistCurrentRoom()
    setSaveNotice('Saved!')
    setTimeout(() => setSaveNotice(''), 1500)
  }

  async function switchToRoom(roomId) {
    setRoomMenuOpen(false)
    if (roomId === currentRoomId) return
    await persistCurrentRoom()
    const target = roomsDataRef.current[roomId]
    engineRef.current.loadState(target)
    setRoom(target.room)
    setCurrentRoomId(roomId)
  }

  async function handleAddRoom() {
    setErrorNotice('')
    try {
      const row = await addRoomToDesign(initialDesign.id, `Room ${roomsMeta.length + 1}`)
      roomsDataRef.current[row.id] = { room: row.room, items: row.items, features: row.features || [] }
      setRoomsMeta((prev) => [...prev, { id: row.id, name: row.name }])
      await switchToRoom(row.id)
    } catch (err) {
      setErrorNotice(err.message)
    }
  }

  function startRenameRoom(roomId, name) {
    setRenamingRoomId(roomId)
    setRenameDraft(name)
  }

  async function commitRenameRoom() {
    const name = renameDraft.trim()
    if (!name) { setRenamingRoomId(null); return }
    try {
      await renameDesignRoom(renamingRoomId, name)
      setRoomsMeta((prev) => prev.map((r) => (r.id === renamingRoomId ? { ...r, name } : r)))
    } catch (err) {
      setErrorNotice(err.message)
    }
    setRenamingRoomId(null)
  }

  async function handleDeleteRoom(roomId) {
    if (roomsMeta.length <= 1) return
    setErrorNotice('')
    try {
      let nextCurrent = currentRoomId
      if (roomId === currentRoomId) {
        const remaining = roomsMeta.filter((r) => r.id !== roomId)
        nextCurrent = remaining[0].id
        engineRef.current.loadState(roomsDataRef.current[nextCurrent])
        setRoom(roomsDataRef.current[nextCurrent].room)
        setCurrentRoomId(nextCurrent)
      }
      await deleteDesignRoom(roomId)
      delete roomsDataRef.current[roomId]
      setRoomsMeta((prev) => prev.filter((r) => r.id !== roomId))
    } catch (err) {
      setErrorNotice(err.message)
    }
  }

  async function handleExit() {
    await persistCurrentRoom()
    onExit()
  }

  const currentRoomName = roomsMeta.find((r) => r.id === currentRoomId)?.name || 'Room'

  return (
    <div id="app">
      <div id="canvas-wrap" ref={canvasWrapRef}>
        <div id="titleblock">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h1>{designName}</h1>
            <button
              onClick={handleQuickSave}
              style={{ background: saveNotice ? 'var(--sage)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {saveNotice || '💾 Save'}
            </button>
          </div>
          <button className="rd-back-link" onClick={handleExit}>← My Designs</button>
          <div className="sub">Set this room's dimensions, then start furnishing.</div>
          {errorNotice && <div className="board-popover-error" style={{ marginBottom: 8 }}>{errorNotice}</div>}
          <div className="dim-row">
            <label>Width</label>
            <input type="number" value={room.w} min={6} max={40} step={0.5} onChange={(e) => handleDimChange('w', e.target.value)} />
            <span className="unit">ft</span>
          </div>
          <div className="dim-row">
            <label>Length</label>
            <input type="number" value={room.l} min={6} max={40} step={0.5} onChange={(e) => handleDimChange('l', e.target.value)} />
            <span className="unit">ft</span>
          </div>
          <div className="dim-row">
            <label>Ceiling</label>
            <input type="number" value={room.h} min={7} max={16} step={0.5} onChange={(e) => handleDimChange('h', e.target.value)} />
            <span className="unit">ft</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--paper-shadow)' }}>
            <button className="structure-btn" onClick={() => engineRef.current.addDoor()}>+ Door</button>
            <button className="structure-btn" onClick={() => engineRef.current.addWindow()}>+ Window</button>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--paper-shadow)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="structure-btn"
                style={measureState.active ? { background: 'var(--accent)', color: '#fff' } : undefined}
                onClick={() => engineRef.current.setMeasureMode(!measureState.active)}
              >
                📐 {measureState.active ? 'Measuring…' : 'Measure'}
              </button>
              {measureState.pointCount > 0 && (
                <button className="structure-btn" onClick={() => engineRef.current.clearMeasurement()}>Clear</button>
              )}
            </div>
            {measureState.active && (
              <div className="sub" style={{ marginTop: 6, marginBottom: 0 }}>
                {measureState.distanceFt != null
                  ? `${formatLength(measureState.distanceFt, DEFAULT_UNIT_SYSTEM)} between your two points. Click again to start a new measurement.`
                  : measureState.pointCount === 1
                    ? 'Click a second point to measure the distance.'
                    : 'Click a point on the floor or on an item to start measuring.'}
              </div>
            )}
          </div>
        </div>

        {/* Top-right room switcher — the one empty corner of the canvas overlay. */}
        <div className="rd-room-switcher">
          <button className="rd-room-switcher-trigger" onClick={() => setRoomMenuOpen((v) => !v)}>
            {currentRoomName} <span aria-hidden="true">▾</span>
          </button>
          {roomMenuOpen && (
            <>
              <div className="board-popover-backdrop" onClick={() => setRoomMenuOpen(false)} />
              <div className="rd-room-menu" onClick={(e) => e.stopPropagation()}>
                {roomsMeta.map((r) => (
                  <div key={r.id} className={`rd-room-menu-row ${r.id === currentRoomId ? 'active' : ''}`}>
                    {renamingRoomId === r.id ? (
                      <input
                        autoFocus
                        className="rd-room-rename-input"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitRenameRoom()}
                        onBlur={commitRenameRoom}
                      />
                    ) : (
                      <button className="rd-room-menu-name" onClick={() => switchToRoom(r.id)}>{r.name}</button>
                    )}
                    <button className="rd-room-menu-icon" title="Rename" onClick={() => startRenameRoom(r.id, r.name)}>✎</button>
                    {roomsMeta.length > 1 && (
                      <button className="rd-room-menu-icon" title="Delete room" onClick={() => handleDeleteRoom(r.id)}>×</button>
                    )}
                  </div>
                ))}
                <button className="rd-room-menu-add" onClick={handleAddRoom}>+ Add Room</button>
              </div>
            </>
          )}
        </div>

        {selection && (
          <div id="selection-panel" className="visible">
            <div className="sheet-handle" />
            <div className="selection-panel-header">
              <h3>{selection.cat.name}</h3>
              <button onClick={() => setPanelCollapsed((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13, padding: 4, lineHeight: 1 }}>
                {panelCollapsed ? '▸' : '▾'}
              </button>
            </div>
            <div className="meta">
              {selection.cat.dims[0]}' x {selection.cat.dims[1]}' x {selection.cat.dims[2]}' · ${selection.cat.price}
            </div>
            {!panelCollapsed && (
              <>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 6 }}>
                  Drag the Rotate button above it to spin (locks every 45°) · R for a quick 90° turn
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button
                    style={{ background: showDimensions ? 'var(--accent)' : 'var(--paper-shadow)', color: showDimensions ? '#fff' : 'var(--ink-soft)', flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}
                    onClick={() => setShowDimensions((v) => { const next = !v; engineRef.current.setShowDimensionOverlay(next); return next })}
                  >
                    Dimensions
                  </button>
                  <button
                    style={{ background: 'var(--paper-shadow)', color: 'var(--ink-soft)', flex: 1, border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}
                    onClick={() => engineRef.current.duplicateSelected()}
                  >
                    Duplicate
                  </button>
                </div>
                <button
                  style={{ background: selection.locked ? '#5b6b73' : 'var(--paper-shadow)', color: selection.locked ? '#fff' : 'var(--ink-soft)', width: '100%', border: 'none', padding: 8, borderRadius: 8, fontSize: 11.5, cursor: 'pointer', marginBottom: 6 }}
                  onClick={() => engineRef.current.toggleItemLock(selection.uid)}
                >
                  {selection.locked ? 'Locked — click to unlock' : 'Lock in place'}
                </button>
                {selection.cat.colorable && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 6 }}>Color</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(selection.cat.colorOptions || BEDDING_COLOR_SWATCHES).map((hex) => (
                        <button
                          key={hex}
                          onClick={() => engineRef.current.setItemColor(selection.uid, hex)}
                          title={`#${hex.toString(16).padStart(6, '0')}`}
                          style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', padding: 0, background: `#${hex.toString(16).padStart(6, '0')}`, border: (selection.colorHex ?? selection.cat.color) === hex ? '2px solid var(--accent)' : '1px solid var(--paper-shadow)' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 4 }}
                  onClick={() => engineRef.current.removeItem(selection.uid)}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        )}

        {featureSelection && !selection && (
          <div id="selection-panel" className="visible">
            <div className="sheet-handle" />
            <div className="selection-panel-header">
              <h3>{featureSelection.type === 'door' ? 'Door' : 'Window'}</h3>
            </div>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 4 }}
              onClick={() => engineRef.current.removeFeature(featureSelection.id)}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div id="sidebar">
        <div id="sidebar-header">
          <h2>Furnish it</h2>
          <p>Tap an item to drop it in the room.</p>
        </div>
        <div id="sidebar-tabs">
          <button className={`tab-btn ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>Catalog</button>
          <button className={`tab-btn ${tab === 'cart' ? 'active' : ''}`} onClick={() => setTab('cart')}>
            Your room {cart.length > 0 && `(${cart.length})`}
          </button>
        </div>

        {tab === 'catalog' && <CatalogPanel onAddItem={handleAddItem} />}

        {tab === 'cart' && (
          <div id="cart-panel" style={{ display: 'flex' }}>
            {cart.length === 0 ? (
              <div className="empty-note">Nothing placed yet. Add items from the Catalog tab and drag them into position in your room.</div>
            ) : (
              cart.map((it) => (
                <div key={it.uid} className="cart-row" onClick={() => engineRef.current.selectItem(it.virtualTargetUid ?? it.uid)}>
                  <CatalogThumb cat={it.cat} />
                  <div className="name">{it.cat.name}</div>
                  <div className="price">${it.cat.price}</div>
                  {it.virtualTargetUid == null && (
                    <button className="remove-btn" title="Remove" onClick={(e) => { e.stopPropagation(); engineRef.current.removeItem(it.uid) }}>×</button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {colorPrompt && (
        <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && setColorPrompt(null)}>
          <div id="receipt">
            <h2>
              {colorPrompt.kind === 'sheets' && 'Choose a sheet color'}
              {colorPrompt.kind === 'pillowcases' && 'Choose a pillowcase color'}
              {colorPrompt.kind === 'throw-blanket' && 'Choose a throw blanket color'}
            </h2>
            <div className="rsub">
              {colorPrompt.kind === 'sheets' && `${colorPrompt.cat.name} has no shape of its own to place — pick a color and it recolors your mattress.`}
              {colorPrompt.kind === 'pillowcases' && `${colorPrompt.cat.name} has no shape of its own to place — pick a color and it recolors every pillow already in your room.`}
              {colorPrompt.kind === 'throw-blanket' && `Pick a color for ${colorPrompt.cat.name} before it dresses your bed.`}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {BEDDING_COLOR_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  onClick={() => {
                    if (colorPrompt.kind === 'sheets') engineRef.current.applyMattressColor(hex, colorPrompt.cat.id)
                    else if (colorPrompt.kind === 'pillowcases') engineRef.current.applyPillowcaseColor(hex, colorPrompt.cat.id)
                    else if (colorPrompt.kind === 'throw-blanket') engineRef.current.addItem(colorPrompt.cat.id, hex)
                    setColorPrompt(null)
                  }}
                  title={`#${hex.toString(16).padStart(6, '0')}`}
                  style={{ width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', padding: 0, background: `#${hex.toString(16).padStart(6, '0')}`, border: '1px solid var(--paper-shadow)' }}
                />
              ))}
            </div>
            <button onClick={() => setColorPrompt(null)} style={{ width: '100%', background: 'var(--paper-shadow)', color: 'var(--ink-soft)', border: 'none', padding: 10, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Launcher — lists/creates the signed-in user's designs. Shown until one is opened. ---
function DesignLauncher({ onOpen }) {
  const [designs, setDesigns] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listDesigns().then(setDesigns).catch((err) => setError(err.message))
  }, [])

  async function handleCreate() {
    const name = draft.trim()
    if (!name || busy) return
    setBusy(true)
    setError('')
    try {
      const created = await createDesign(name)
      onOpen(created)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleOpen(id) {
    setError('')
    try {
      const full = await getDesign(id)
      onOpen(full)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRename(id, currentName) {
    const name = window.prompt('Rename design', currentName)
    if (!name || !name.trim() || name.trim() === currentName) return
    try {
      await renameDesign(id, name.trim())
      setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDesign(id)
      setDesigns((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="rd-launcher">
      <div className="rd-launcher-inner">
        <Link to="/" className="rd-launcher-back">← Home</Link>
        <h1>Room Designer</h1>
        <p className="rd-launcher-sub">
          Design any room — house, apartment, or anywhere else. Generic furniture only, any bed
          size, and as many rooms as you need in one design.
        </p>
        {error && <div className="board-popover-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="rd-launcher-new">
          <input
            type="text"
            placeholder="New design name (e.g. My Apartment)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} disabled={busy}>+ Create</button>
        </div>
        {designs === null ? (
          <div className="empty-note">Loading your designs…</div>
        ) : designs.length === 0 ? (
          <div className="empty-note">No designs yet — create your first one above.</div>
        ) : (
          <div className="rd-launcher-list">
            {designs.map((d) => (
              <div key={d.id} className="rd-launcher-row">
                <button className="rd-launcher-row-name" onClick={() => handleOpen(d.id)}>{d.name}</button>
                <button className="rd-room-menu-icon" title="Rename" onClick={() => handleRename(d.id, d.name)}>✎</button>
                <button className="rd-room-menu-icon" title="Delete" onClick={() => handleDelete(d.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoomDesignerPage() {
  const { session, loading: authLoading } = useAuth()
  const [openDesign, setOpenDesign] = useState(null)

  if (authLoading) return null

  if (!session) {
    return (
      <div className="rd-launcher">
        <div className="rd-launcher-inner">
          <Link to="/" className="rd-launcher-back">← Home</Link>
          <h1>Room Designer</h1>
          <p className="rd-launcher-sub">Sign in to create and save your own multi-room designs.</p>
          <AuthPanel />
        </div>
      </div>
    )
  }

  if (!openDesign) return <DesignLauncher onOpen={setOpenDesign} />

  return <DesignEditor key={openDesign.id} initialDesign={openDesign} onExit={() => setOpenDesign(null)} />
}
