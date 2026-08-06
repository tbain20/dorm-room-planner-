import { useEffect, useRef, useState } from 'react'
import { RoomEngine } from './roomEngine.js'
import { CATALOG, retailerLink } from './catalog.js'
import { saveLayout, listLayouts, deleteLayout } from './storage.js'
import { supabase } from './supabaseClient.js'
import { useAuth } from './useAuth.js'
import AuthPanel from './AuthPanel.jsx'

export default function App() {
  const canvasWrapRef = useRef(null)
  const engineRef = useRef(null)
  const { session, loading: authLoading } = useAuth()

  const [room, setRoom] = useState({ w: 12, l: 14, h: 9 })
  const [cart, setCart] = useState([])
  const [selection, setSelection] = useState(null)
  const [tab, setTab] = useState('catalog')
  const [savedLayouts, setSavedLayouts] = useState([])
  const [layoutName, setLayoutName] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [layoutsError, setLayoutsError] = useState('')

  // Init the Three.js engine once, tear it down on unmount
  useEffect(() => {
    const engine = new RoomEngine(canvasWrapRef.current, {
      onCartChange: setCart,
      onSelectionChange: setSelection,
    })
    engineRef.current = engine
    return () => engine.destroy()
  }, [])

  useEffect(() => {
    if (tab !== 'saved' || !session) return
    listLayouts()
      .then(setSavedLayouts)
      .catch((err) => setLayoutsError(err.message))
  }, [tab, session])

  const total = cart.reduce((sum, it) => sum + it.cat.price, 0)

  function handleDimChange(key, value) {
    const next = { ...room, [key]: parseFloat(value) || room[key] }
    setRoom(next)
    engineRef.current?.setRoomDims(next.w, next.l, next.h)
  }

  async function handleSave() {
    const name = layoutName.trim()
    if (!name) return
    setLayoutsError('')
    try {
      await saveLayout(name, engineRef.current.getState())
      setLayoutName('')
      setSavedLayouts(await listLayouts())
    } catch (err) {
      setLayoutsError(err.message)
    }
  }

  function handleLoad(data) {
    engineRef.current.loadState(data)
    setRoom(data.room)
    setTab('cart')
  }

  async function handleDelete(name) {
    setLayoutsError('')
    try {
      await deleteLayout(name)
      setSavedLayouts(await listLayouts())
    } catch (err) {
      setLayoutsError(err.message)
    }
  }

  return (
    <div id="app">
      <div id="canvas-wrap" ref={canvasWrapRef}>
        <div id="titleblock">
          <h1>Room Planner</h1>
          <div className="sub">DRG. NO. 001 — DORM LAYOUT</div>
          <div className="dim-row">
            <label>Width</label>
            <input type="number" value={room.w} min={6} max={25} step={0.5} onChange={(e) => handleDimChange('w', e.target.value)} />
            <span className="unit">ft</span>
          </div>
          <div className="dim-row">
            <label>Length</label>
            <input type="number" value={room.l} min={6} max={25} step={0.5} onChange={(e) => handleDimChange('l', e.target.value)} />
            <span className="unit">ft</span>
          </div>
          <div className="dim-row">
            <label>Ceiling</label>
            <input type="number" value={room.h} min={7} max={14} step={0.5} onChange={(e) => handleDimChange('h', e.target.value)} />
            <span className="unit">ft</span>
          </div>
        </div>

        <div id="hint">DRAG FLOOR TO ORBIT · SCROLL TO ZOOM · DRAG AN ITEM TO MOVE IT · SELECT + R TO ROTATE</div>

        {selection && (
          <div id="selection-panel" className="visible">
            <h3>{selection.cat.name}</h3>
            <div className="meta">
              {selection.cat.dims[0]}' x {selection.cat.dims[1]}' x {selection.cat.dims[2]}' · ${selection.cat.price}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                style={{ background: 'var(--ink)', color: 'var(--paper)', flex: 1, border: 'none', padding: 7, borderRadius: 2, fontSize: 11, cursor: 'pointer' }}
                onClick={() => engineRef.current.rotateSelected()}
              >
                ⟳ Rotate 90°
              </button>
            </div>
            <button onClick={() => engineRef.current.removeItem(selection.uid)}>Remove item</button>
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
          <button className={`tab-btn ${tab === 'saved' ? 'active' : ''}`} onClick={() => setTab('saved')}>Saved</button>
        </div>

        {tab === 'catalog' && (
          <div id="catalog-panel">
            {CATALOG.map((cat) => (
              <div key={cat.id} className="cat-item" onClick={() => engineRef.current.addItem(cat.id)}>
                <div className="swatch" style={{ background: `#${cat.color.toString(16).padStart(6, '0')}` }} />
                <div className="cat-info">
                  <div className="name">{cat.name}</div>
                  <div className="meta">
                    {cat.dims[0]}' × {cat.dims[1]}' × {cat.dims[2]}' · {cat.retailer}
                  </div>
                </div>
                <div className="cat-price">${cat.price}</div>
                <button className="add-btn">+</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'cart' && (
          <div id="cart-panel" style={{ display: 'flex' }}>
            {cart.length === 0 ? (
              <div className="empty-note">Nothing placed yet. Add items from the Catalog tab and drag them into position in your room.</div>
            ) : (
              cart.map((it) => (
                <div key={it.uid} className="cart-row" onClick={() => engineRef.current.selectItem(it.uid)}>
                  <div className="swatch" style={{ background: `#${it.cat.color.toString(16).padStart(6, '0')}` }} />
                  <div className="name">{it.cat.name}</div>
                  <div className="price">${it.cat.price}</div>
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      engineRef.current.removeItem(it.uid)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'saved' && (
          <div id="saved-panel" style={{ display: 'flex', padding: session ? 14 : 0, flexDirection: 'column' }}>
            {authLoading ? (
              <div className="empty-note">Loading…</div>
            ) : !session ? (
              <>
                {supabase && (
                  <div style={{ padding: '14px 14px 0 14px', fontSize: 10, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>ACCOUNT</span>
                  </div>
                )}
                <AuthPanel />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, fontSize: 10.5, color: 'var(--ink-soft)' }}>
                  <span>Signed in as {session.user.email}</span>
                  <button
                    onClick={() => supabase.auth.signOut()}
                    style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-soft)', padding: 0 }}
                  >
                    Sign out
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <input
                    placeholder="Layout name…"
                    value={layoutName}
                    onChange={(e) => setLayoutName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    style={{ flex: 1, padding: 8, border: '1px solid var(--paper-shadow)', fontSize: 12, fontFamily: "'JetBrains Mono','Courier New',monospace" }}
                  />
                  <button
                    onClick={handleSave}
                    style={{ background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '0 12px', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2 }}
                  >
                    Save
                  </button>
                </div>
                {layoutsError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 10 }}>{layoutsError}</div>}
                {savedLayouts.length === 0 ? (
                  <div className="empty-note">No saved layouts yet. Build a room, then name and save it above.</div>
                ) : (
                  savedLayouts.map((data) => (
                    <div key={data.name} className="cart-row">
                      <div className="name">
                        {data.name}
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)' }}>
                          {data.items.length} item{data.items.length === 1 ? '' : 's'} · {data.room.w}'×{data.room.l}'
                        </span>
                      </div>
                      <button className="add-btn" style={{ background: 'var(--ink)' }} onClick={() => handleLoad(data)}>↺</button>
                      <button className="remove-btn" onClick={() => handleDelete(data.name)}>×</button>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        <div id="total-bar">
          <div id="total-row">
            <span className="label">Estimated total</span>
            <span className="amount">${total.toLocaleString()}</span>
          </div>
          <button id="checkout-btn" disabled={cart.length === 0} onClick={() => setShowReceipt(true)}>
            Get shopping list
          </button>
        </div>
      </div>

      {showReceipt && (
        <div id="modal-backdrop" className="visible" onClick={(e) => e.target.id === 'modal-backdrop' && setShowReceipt(false)}>
          <div id="receipt">
            <h2>Shopping list</h2>
            <div className="rsub">Everything you placed, ready to buy. Opens each retailer's site.</div>
            <div>
              {cart.map((it) => (
                <div key={it.uid} className="receipt-line">
                  <div className="rname">
                    {it.cat.name}
                    <span className="rstore">{it.cat.retailer}</span>
                  </div>
                  <div>
                    <a href={retailerLink(it.cat.retailer, it.cat.name)} target="_blank" rel="noopener noreferrer">
                      ${it.cat.price} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div id="receipt-total">
              <span>Total</span>
              <span>${total.toLocaleString()}</span>
            </div>
            <button id="close-modal" onClick={() => setShowReceipt(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
