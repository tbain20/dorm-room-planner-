import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ALL_CATALOG_ITEMS as ALL_ITEMS } from './catalog.js'
import { fitModelToDims, tintModel } from './modelFit.js'
import { formatLength, DEFAULT_UNIT_SYSTEM } from './units.js'

// The engine resolves items against the same combined lookup catalog.js itself uses (purchasable
// + Colgate-provided + any registered custom items, see registerCustomCatalogItem in catalog.js)
// — it doesn't care which list an id came from, only App.jsx's shopping-list/total logic needs to
// tell them apart (via each item's isProvided flag). Importing the live array (not building a
// separate `[...CATALOG, ...PROVIDED_CATALOG]` copy here) means a custom item registered into
// catalog.js's array is instantly resolvable here too, with no duplicate registration step.

const DOOR_WIDTH = 3.0 // 36" — standard residence hall door, not user-adjustable
const DOOR_HEIGHT = 6.67 // 80"
const WINDOW_DEFAULT_WIDTH = 3.0
const WINDOW_DEFAULT_HEIGHT = 3.0
const WINDOW_MIN_WIDTH = 1.5
const WINDOW_MAX_WIDTH = 10.0
const WINDOW_MIN_HEIGHT = 2.0
const WINDOW_MAX_HEIGHT = 7.0
const WINDOW_SILL_HEIGHT = 2.5 // feet off the floor to the bottom of the window
const FEATURE_COLLISION_DEPTH = 0.2 // feet — a door/window has no real thickness of its own (see
// _buildFeatureMesh); this stands in for it so _featureCollisionBox is a thin box, not a flat
// zero-volume plane an item's box could never actually intersect.

// Ceiling on how far a floor-plane ray-cast is trusted (see _intersectFloorPlane) — a couple feet
// past the largest room's own half-diagonal (a 25'x25' room's is ~17.7'), so it never rejects a
// point actually over the room, only the runaway ones from a near-parallel ray. Measured at the
// camera's max allowed tilt (phi 1.45, nearly eye-level): the ray-plane intersection distance
// blows up fast once the cursor drifts much above screen-center — 16' by NDC y=0.15, 25'+ by
// y=0.18, hundreds of feet by y=0.28 — so this has to sit well below that, not just below some
// theoretical "room could be huge" ceiling.
const FLOOR_POINT_MAX_DIST = 20

// How close (in feet) a dragged floor item needs to get to another item's edge before it snaps
// flush against it — see _snapToNearbyItems. Comfortably smaller than any real item's footprint so
// it reads as "the two pieces kissed" rather than jumping from across the room; once the raw
// cursor-driven position drifts more than this past the flush point, the snap releases and the
// item resumes following the cursor exactly (including straight through the other item, same as
// today — this is an alignment aid, not a hard collision block like a wall).
const ITEM_SNAP_DISTANCE = 0.28

// Box3.intersectsBox() treats touching boundaries (zero gap) as intersecting, which is exactly the
// state two items end up in once _snapToNearbyItems snaps them flush against each other. Without
// slack here, merely flush items would permanently read as "colliding" red instead of only items
// actually dragged into one another. Small enough to be well below any real overlap from dragging,
// but comfortably above the floating-point noise a flush snap can leave in a box's min/max.
const COLLISION_EPSILON = 0.01

// Wall opacity when a wall isn't the one currently facing the camera vs. when it is — see
// _updateNearWall. Every other wall is fully solid (opaque walls read as a real room, matching
// the residence-hall reference look) while the wall nearest the camera fades almost to nothing so
// it stops visually competing with — and stops fielding accidental clicks meant for — whatever is
// mounted on the far wall behind it.
const WALL_OPACITY_NORMAL = 1
const WALL_OPACITY_NEAR = 0.05

const WALL_COLOR = 0xffffff // white — kept a true white (rather than off-white) so it reads as
// a distinct wall against the scene's warm cream page background (0xf7f3ec) instead of blending
// into it
const FLOOR_COLOR = 0xa8895f // wood floor, one shade darker than the old 0xd7be99
const TRIM_COLOR = 0x8f9296 // gray baseboard/door-casing trim
const TRIM_HEIGHT = 0.35 // feet — baseboard height
const DOOR_CASING_WIDTH = 0.22 // feet — gray door-casing width around a door opening
const DOOR_COLOR = 0xceb37e // light wood door leaf
const DOOR_EDGE_COLOR = 0x8a7148
const DOOR_HANDLE_COLOR = 0xb9b9b3

// Pillow pose presets (see catalog.js's hasPoseOptions / setItemPose below) — rotation around
// local X applied to a pose pivot wrapping the loaded model.
const POSE_ANGLES = { flat: 0, diagonal: -Math.PI / 6, upright: -Math.PI / 2 }

// How far (feet) a stacked bedding item sinks into whatever it's resting on — see _topSurfaceY's
// comment for why a soft/rounded model needs this to avoid a visible gap at its edges.
const STACK_SINK = 0.05

const SELECTION_COLOR = 0xc1502e // normal selection outline
const LOCKED_SELECTION_COLOR = 0x5b6b73 // slate — a locked item's outline, distinct from both
// the normal orange selection color above and the red collision tint (0xd93a2b), so a locked
// item reads as "locked" at a glance rather than looking like it's mid-collision.

// RoomEngine owns the Three.js scene and all room/item state. It's deliberately independent of
// React — it just takes a DOM element to render into and a set of callbacks to report state
// changes back out to. This keeps the 3D logic testable and reusable outside the component tree.
export class RoomEngine {
  constructor(container, { onCartChange, onSelectionChange, onFeatureSelectionChange, onStackPickModeChange, onMeasureChange, onNotice, unitSystem }) {
    this.container = container
    this.onCartChange = onCartChange || (() => {})
    this.onSelectionChange = onSelectionChange || (() => {})
    this.onFeatureSelectionChange = onFeatureSelectionChange || (() => {})
    this.onStackPickModeChange = onStackPickModeChange || (() => {})
    this.onMeasureChange = onMeasureChange || (() => {})
    // Fired for a user-facing transient notice that isn't tied to the selection panel — currently
    // just "no bed in the room yet" when a bedOnly item (see catalog.js) can't auto-place itself.
    this.onNotice = onNotice || (() => {})
    // Display unit for every on-model/measuring-tool label (see units.js) — App.jsx's Units
    // selector calls setUnitSystem() to change this later; the labels it currently controls get
    // redrawn immediately (see setUnitSystem below) so switching updates on-screen text right away.
    this.unitSystem = unitSystem || DEFAULT_UNIT_SYSTEM

    // Measuring tool (see setMeasureMode/_placeMeasurePoint below) — independent of item
    // selection, a click places a point on the floor or on whatever item surface was clicked;
    // a second click completes the pair and shows the distance. measurePoints holds 0, 1, or 2
    // THREE.Vector3 world points; a 3rd click starts a fresh pair rather than accumulating.
    this.measureMode = false
    this.measurePoints = []
    this.measureOverlay = null

    this.room = { w: 12, l: 14, h: 9, notch: null }
    this.placedItems = [] // { mesh, catalogId, uid, stackedOnUid }
    this.selected = null
    this.selectionHelper = null
    // 3D dimension-line overlay on the selected item (see _buildDimensionOverlay/
    // _updateDimensionOverlay below) — separate from selectionHelper's BoxHelper outline.
    // showDimensionOverlay is the persisted on/off state (App.jsx's 📏 Dimensions button, via
    // setShowDimensionOverlay); dimensionOverlay is the live group of lines/labels, only present
    // while both an item is selected and the overlay is toggled on.
    this.showDimensionOverlay = false
    this.dimensionOverlay = null
    this.uidCounter = 1
    // uid of the item currently waiting for a "click another item to place it on top of" pick —
    // null when no stacking pick is in progress. See startStackPick()/stackItemOn() below.
    this.stackPickSourceUid = null

    this.wallFeatures = [] // { id, type: 'door'|'window', wall, offset, width, height, mesh }
    this.featureIdCounter = 1
    this.selectedFeature = null
    this.featureSelectionHelper = null

    // One placed item's worth of data, captured by copySelected() — see duplicateSelected()/
    // copySelected()/pasteItem() below. Independent of `selected`, so a copy survives deselecting
    // (or selecting something else) before you paste it.
    this.clipboardItem = null

    // Whichever wall segment is currently most "facing" the camera — see _updateNearWall, called
    // once per frame from _animate. Used both to fade that wall's material almost to nothing (so
    // it doesn't visually block the view into the room from this angle) and, in the pointerdown
    // handler below, to keep a wall-mounted item sitting on it from being picked up by an
    // accidental drag meant for something on the wall behind it.
    this.nearWallEntry = null

    this._initScene()
    this._initInteraction()
    this._initKeyboardPan()
    this.buildRoom()
    this._animate = this._animate.bind(this)
    this._raf = requestAnimationFrame(this._animate)
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  destroy() {
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onWindowBlur)
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }

  // ---------- Scene setup ----------
  _initScene() {
    const { clientWidth: w, clientHeight: h } = this.container
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(w, h)
    // Only used by a cat.wallMountClipFraction item's stand-hiding clip plane (the TV — see
    // _loadItemMesh/_setWallMountClipActive/_updateWallMountClips below); a no-op otherwise.
    this.renderer.localClippingEnabled = true
    this.container.appendChild(this.renderer.domElement)

    this.scene.add(new THREE.AmbientLight(0xfff3e4, 0.8))
    const dir1 = new THREE.DirectionalLight(0xfff8ef, 0.9)
    dir1.position.set(8, 14, 6)
    this.scene.add(dir1)
    const dir2 = new THREE.DirectionalLight(0xf3e6d2, 0.3)
    dir2.position.set(-8, 6, -6)
    this.scene.add(dir2)

    // roomGroup holds the shell (floor/grid/walls) — cleared and rebuilt by buildRoom() on every
    // resize. itemsGroup/featuresGroup hold furniture and doors/windows respectively; they're
    // siblings of roomGroup (not children of it) specifically so a resize's roomGroup.clear()
    // doesn't detach them from the scene graph.
    this.roomGroup = new THREE.Group()
    this.scene.add(this.roomGroup)
    this.itemsGroup = new THREE.Group()
    this.scene.add(this.itemsGroup)
    this.featuresGroup = new THREE.Group()
    this.scene.add(this.featuresGroup)

    this.camState = { theta: Math.PI / 4, phi: 1.0, radius: 16, target: new THREE.Vector3(0, 0, 0) }

    this.gltfLoader = new GLTFLoader()
  }

  _onResize() {
    const { clientWidth: w, clientHeight: h } = this.container
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  _animate(now) {
    this._raf = requestAnimationFrame(this._animate)
    // Capped at 100ms so a stalled/backgrounded tab resuming doesn't register as one giant pan
    // jump — dt only matters here for _applyKeyboardPan's speed-per-second math.
    const dt = this._lastFrameTime != null ? Math.min((now - this._lastFrameTime) / 1000, 0.1) : 0
    this._lastFrameTime = now
    if (this.panKeysHeld.size) this._applyKeyboardPan(dt)
    if (this.selectionHelper) this.selectionHelper.update()
    if (this.featureSelectionHelper) this.featureSelectionHelper.update()
    // Recomputed every frame (cheap — a handful of line points) rather than only on
    // rotate/drag-end, so it tracks the item smoothly while it's being dragged. Deriving each
    // line's length straight from selectionHelper's own live world-space box, rather than from
    // the catalog item's declared dims[0]/[1]/[2], is what makes this automatically correct after
    // a 90° rotation swaps which world axis width/depth sit on — no rotation-aware bookkeeping
    // needed here at all.
    if (this.dimensionOverlay) this._updateDimensionOverlay()
    this._updateCollisions()
    this._updateNearWall()
    this._updateWallMountClips()
    this._updateFades(now)
    this.renderer.render(this.scene, this.camera)
  }

  // Smooth opacity cross-fades (bed frame ↔ comforter dressing — see _applyBedDressing) — plain
  // material.opacity tweens driven off the existing render loop rather than a separate timer, so
  // they never run while the tab is backgrounded/rAF is paused. Each entry fades every material
  // found under `mesh` from `from` to `to` over `duration` ms; `onComplete` (if given) fires once,
  // right as the fade finishes — e.g. to flip `mesh.visible = false` once a fade-out reaches 0
  // rather than leaving a fully-transparent-but-still-raycastable mesh sitting in the scene.
  _fadeMesh(mesh, { from, to, duration = 400, onComplete } = {}) {
    const materials = []
    mesh.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => materials.push(m))
      }
    })
    // Set the starting opacity synchronously (not just queued for next frame) so a fade-in never
    // flashes at whatever opacity the material happened to be left at before.
    materials.forEach((m) => { m.transparent = true; m.opacity = from })
    this._activeFades = this._activeFades || []
    this._activeFades.push({ materials, from, to, start: performance.now(), duration, onComplete })
  }

  _updateFades(now) {
    if (!this._activeFades || !this._activeFades.length) return
    this._activeFades = this._activeFades.filter((f) => {
      const t = Math.min(1, (now - f.start) / f.duration)
      const opacity = f.from + (f.to - f.from) * t
      f.materials.forEach((m) => { m.opacity = opacity })
      if (t < 1) return true
      // Faded fully in: drop back to a plain opaque material (transparent:true costs a little
      // render-order/depth-sort correctness for no benefit once opacity is back at 1).
      if (f.to === 1) f.materials.forEach((m) => { m.transparent = false; m.opacity = 1 })
      if (f.onComplete) f.onComplete()
      return false
    })
  }

  _updateCameraPosition() {
    const { theta, phi, radius, target } = this.camState
    this.camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta)
    this.camera.position.y = target.y + radius * Math.cos(phi)
    this.camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta)
    this.camera.lookAt(target)
    // _panCamera (below) reads the camera's world-space right/up basis vectors right after a
    // pointer move or key tick, before the next render() would otherwise refresh matrixWorld —
    // without this it'd pan using last frame's orientation, one step behind a fast orbit+pan.
    this.camera.updateMatrixWorld()
  }

  // Shifts the orbit target along the camera's own current screen-space right/up axes — true
  // panning, not orbiting: the framing slides without changing viewing angle or zoom. Both the
  // Shift+drag and WASD/arrow-key pan paths (_initInteraction, _applyKeyboardPan) funnel through
  // here so they share one implementation and one set of target clamps. rightAmount/upAmount are
  // world-space distances (already scaled by whatever's calling in — screen pixels for drag,
  // world-units/sec for keys), positive = pan right / pan up on screen.
  _panCamera(rightAmount, upAmount) {
    if (!rightAmount && !upAmount) return
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    const target = this.camState.target
    target.addScaledVector(right, rightAmount)
    target.addScaledVector(up, upAmount)
    // Loose bounds (not a tight clamp to the room rectangle) — just enough that holding a pan
    // key/drag too long can't strand the view somewhere with nothing visible to orbit back from.
    const { w, l, h } = this.room
    target.x = Math.max(-w, Math.min(w, target.x))
    target.z = Math.max(-l, Math.min(l, target.z))
    target.y = Math.max(-2, Math.min(h + 4, target.y))
    this._updateCameraPosition()
  }

  // Ray-vs-floor-plane intersection, shared by every "where on the floor is the cursor" need —
  // dragging an item/feature around (_initInteraction's getFloorPoint) and dropping a measure
  // point on open floor (_placeMeasurePoint). Assumes this.raycaster is already primed via
  // raycaster.setFromCamera() by the caller. Returns null — instead of a wildly distant point —
  // both when the ray never hits the plane at all, and when it hits so far away it isn't
  // meaningful: near the top of the viewport the camera's downward-angled ray grazes almost
  // parallel to the floor, so a one-pixel cursor nudge there can swing the intersection tens of
  // feet across the room. A caller that used that directly for a drag would see whatever it's
  // moving "teleport" the instant the cursor drifted into that zone — it'd only ever get clamped
  // back to whichever wall the runaway point happened to land past (_clampItemToRoom clamps the
  // final position, but by then the jump already happened). Callers should just skip their update
  // for this event when this returns null, leaving the dragged thing exactly where it was.
  _intersectFloorPlane() {
    const pt = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, pt)
    if (!hit || pt.lengthSq() > FLOOR_POINT_MAX_DIST * FLOOR_POINT_MAX_DIST) return null
    return pt
  }

  // WASD/arrow-key panning — a keyboard alternative to Shift+drag (_initInteraction's
  // pointerdown) for nudging the framing without disturbing orbit angle or zoom, useful when a
  // mouse drag alone makes it hard to land the view exactly where you want it. Keys are tracked
  // in a Set and re-applied every animation frame (see _applyKeyboardPan, called from _animate)
  // rather than panning once per keydown, so holding a key pans smoothly instead of relying on
  // the OS's own key-repeat rate/delay.
  _initKeyboardPan() {
    this.panKeysHeld = new Set()
    const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    // Arrow/WASD keys are also normal typing input (room-dimension fields, the custom-item form,
    // etc.) — only treat them as camera pans when focus isn't sitting in something that expects
    // to receive them itself.
    const isTypingTarget = (el) => {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    this._onKeyDown = (e) => {
      const key = e.key.toLowerCase()
      if (!PAN_KEYS.has(key) || isTypingTarget(document.activeElement)) return
      e.preventDefault() // stop arrow keys from also scrolling the page behind the canvas
      this.panKeysHeld.add(key)
    }
    this._onKeyUp = (e) => {
      this.panKeysHeld.delete(e.key.toLowerCase())
    }
    // Alt-tabbing away (or anything else that steals focus) mid-pan would otherwise leave a key
    // "stuck" held forever, since its keyup never reaches this window.
    this._onWindowBlur = () => this.panKeysHeld.clear()
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onWindowBlur)
  }

  // dt is seconds since the last frame — panning by (direction * speed * dt) rather than a flat
  // per-frame step keeps the pan speed constant regardless of the display's refresh rate. Speed
  // scales with the current zoom (camState.radius) so a key-tap covers roughly the same fraction
  // of the visible room whether zoomed in tight or pulled back.
  _applyKeyboardPan(dt) {
    const keys = this.panKeysHeld
    let dxRight = 0
    let dyUp = 0
    if (keys.has('a') || keys.has('arrowleft')) dxRight -= 1
    if (keys.has('d') || keys.has('arrowright')) dxRight += 1
    if (keys.has('w') || keys.has('arrowup')) dyUp += 1
    if (keys.has('s') || keys.has('arrowdown')) dyUp -= 1
    if (!dxRight && !dyUp) return
    const speed = this.camState.radius * 0.9 // world units/sec at this zoom level
    this._panCamera(dxRight * speed * dt, dyUp * speed * dt)
  }

  fitCamera() {
    this.camState.radius = Math.max(this.room.w, this.room.l) * 1.15 + 4
    this.camState.target.set(0, 0, 0)
    this._updateCameraPosition()
  }

  // ---------- Room ----------
  setRoomDims(w, l, h) {
    this.room = { ...this.room, w, l, h }
    this.buildRoom()
    this._reclampAllItems()
  }

  // notch is null, or { wall, offset, width, depth } — see _roomOutline()/_clampedNotch() below
  // for the exact convention. A single rectangular cutout (depth < 0, an inset alcove) or
  // bump-out (depth > 0, extends past the wall) on one wall — not a general polygon editor.
  setRoomNotch(notch) {
    this.room = { ...this.room, notch }
    this.buildRoom()
    this._reclampAllItems()
  }

  // Locked items are deliberately excluded from every pass below — locking an item is the user
  // saying "don't move this," and a room resize/reshape isn't an exception to that any more than a
  // stray drag is (see toggleItemLock). It can end up outside the new walls, floating over a notch
  // that just ate its spot, or blocking a door — all preferable to silently relocating furniture
  // the user explicitly pinned in place; they can always unlock it and reposition manually.
  _reclampAllItems() {
    // Un-stacked items first — a stacked item's own clamp depends on its base's (possibly
    // just-moved) position, and stacking order isn't the same as placedItems array order (you
    // can place the base after the item that ends up on top of it).
    this.placedItems.filter((p) => p.stackedOnUid == null && !p.locked).forEach((p) => {
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      // A resized/reshaped room rebuilds every wall from scratch (buildRoom(), called just before
      // this) — a wall item's old x/z might now float in empty space or sit behind a wall that
      // moved, so it needs its own resnap to whichever wall is now closest, not the floor-item
      // rectangle clamp below (which doesn't know about "flush against a wall" at all).
      if (this._isWallMounted(p, cat)) this._resnapWallItemToNearestWall(p.mesh, cat)
      else this._clampItemToRoom(p.mesh)
    })
    this.placedItems.filter((p) => p.stackedOnUid != null && !p.locked).forEach((p) => {
      const base = this.placedItems.find((q) => q.uid === p.stackedOnUid)
      if (!base) return
      p.mesh.position.x = base.mesh.position.x
      p.mesh.position.z = base.mesh.position.z
      this._clampStackedItem(p.mesh, p.stackedOnUid)
    })
  }

  // Clamps a raw notch spec (whatever the UI last set) to something geometrically sane: a depth
  // that can't turn the floor polygon self-intersecting (an inset can't eat more than ~60% of the
  // room's other dimension; a bump-out is capped at a generous but finite size). Width/offset are
  // NOT forced to leave flat wall on both sides — width can go all the way up to the wall's full
  // length and offset can push either edge flush into a corner, so "push this whole wall back" or
  // an L-shaped step flush against one side wall (but not the other) are both expressible, not
  // just a centered island cutout.
  _clampedNotch() {
    const notch = this.room.notch
    if (!notch) return null
    const { w, l } = this.room
    const wallLen = notch.wall === 'left' || notch.wall === 'right' ? l : w
    const width = Math.max(1, Math.min(wallLen, notch.width))
    const half = width / 2
    const offset = Math.max(half, Math.min(wallLen - half, notch.offset))
    const otherDim = notch.wall === 'left' || notch.wall === 'right' ? w : l
    const maxInset = Math.max(0.5, otherDim * 0.6 - 1)
    const depth = notch.depth >= 0 ? Math.min(notch.depth, 8) : Math.max(notch.depth, -maxInset)
    return { wall: notch.wall, offset, width, depth }
  }

  // Per-wall description of "which world axis runs perpendicular to this wall, which way is
  // outward, and which axis runs along it" — lets the notch/outline/clamp code treat all four
  // walls with the same formulas instead of one-off branches per wall.
  _notchAxes(wall) {
    const { w, l } = this.room
    switch (wall) {
      case 'back': return { perp: 'z', perpSign: -1, wallCoord: -l / 2, lateral: 'x', lateralOrigin: -w / 2 }
      case 'front': return { perp: 'z', perpSign: 1, wallCoord: l / 2, lateral: 'x', lateralOrigin: -w / 2 }
      case 'left': return { perp: 'x', perpSign: -1, wallCoord: -w / 2, lateral: 'z', lateralOrigin: -l / 2 }
      default: return { perp: 'x', perpSign: 1, wallCoord: w / 2, lateral: 'z', lateralOrigin: -l / 2 }
    }
  }

  // The room's floor/wall footprint as an ordered polygon (world x/z), walked back(BL→BR) →
  // right(BR→FR) → front(FR→FL) → left(FL→BL, wrapping). A plain rectangle is just the 4
  // corners; a notch splices 4 extra points into whichever wall's edge it sits on, in the
  // direction that edge is already being walked, forming the L-shaped cutout or bump.
  _roomOutline() {
    const { w, l } = this.room
    const BL = [-w / 2, -l / 2], BR = [w / 2, -l / 2], FR = [w / 2, l / 2], FL = [-w / 2, l / 2]
    const notch = this._clampedNotch()
    if (!notch) return [BL, BR, FR, FL]

    const axes = this._notchAxes(notch.wall)
    const half = notch.width / 2
    const latCenter = axes.lateralOrigin + notch.offset
    const a0 = latCenter - half
    const a1 = latCenter + half
    const boundary = axes.wallCoord + axes.perpSign * notch.depth

    if (notch.wall === 'back') return [BL, [a0, -l / 2], [a0, boundary], [a1, boundary], [a1, -l / 2], BR, FR, FL]
    if (notch.wall === 'right') return [BL, BR, [w / 2, a0], [boundary, a0], [boundary, a1], [w / 2, a1], FR, FL]
    if (notch.wall === 'front') return [BL, BR, FR, [a1, l / 2], [a1, boundary], [a0, boundary], [a0, l / 2], FL]
    return [BL, BR, FR, FL, [-w / 2, a1], [boundary, a1], [boundary, a0], [-w / 2, a0]] // left
  }

  buildRoom() {
    this.roomGroup.clear()
    // { mesh, normal } per wall segment — normal points into the room, used both to place a
    // wall-mountable item's default spot (_defaultWallPlacement) and to position/orient one while
    // it's being dragged (_raycastWallPoint). Rebuilt fresh here since the room's own shape (and
    // therefore every wall) is rebuilt on any dimension/notch change.
    this.wallMeshes = []
    const { w, l, h } = this.room
    const outline = this._roomOutline()
    // Rough interior point — the centroid of the outline polygon. Used only to disambiguate which
    // of a wall segment's two perpendicular directions points into the room (see addWall below);
    // doesn't need to be exact, just reliably inside a room shape as generated by _roomOutline
    // (a plain rectangle or one rectangle ± a single notch/bump-out, always outline-centered).
    const centroid = outline.reduce((acc, [x, z]) => [acc[0] + x / outline.length, acc[1] + z / outline.length], [0, 0])

    // Local shape coords are (x, -z) — after the same rotation.x = -Math.PI/2 used to lay the
    // old plain-rectangle floor flat, that maps back to world (x, 0, z), so a plain rectangle
    // produces byte-identical geometry to the previous PlaneGeometry(w, l).
    const shape = new THREE.Shape()
    outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
    shape.closePath()
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, side: THREE.DoubleSide, roughness: 0.9 })
    )
    floor.rotation.x = -Math.PI / 2
    this.roomGroup.add(floor)

    // Barely-there grid — a soft reference, not a drafting/blueprint layer.
    const grid = new THREE.GridHelper(Math.max(w, l), Math.max(w, l), 0xc2a877, 0xc2a877)
    grid.position.y = 0.01
    grid.material.transparent = true
    grid.material.opacity = 0.28
    this.roomGroup.add(grid)

    const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xd9cfba, transparent: true, opacity: 0.6 })
    const addWall = (width, height, x, z, rotY, normal) => {
      const geo = new THREE.PlaneGeometry(width, height)
      // Each wall gets its own material instance (not a shared one) so _updateNearWall can fade
      // just the one currently facing the camera without dimming every other wall along with it.
      // Basic (unlit) rather than Standard — a lit wall's brightness swings with which way it
      // happens to face relative to the scene's directional lights, so a wall facing away from
      // both would render dim/gray instead of the flat, evenly-white look a real dorm wall (and
      // the reference photo) actually has.
      const mat = new THREE.MeshBasicMaterial({ color: WALL_COLOR, opacity: WALL_OPACITY_NORMAL, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, height / 2, z)
      mesh.rotation.y = rotY
      this.roomGroup.add(mesh)
      const edges = new THREE.EdgesGeometry(geo)
      const line = new THREE.LineSegments(edges, wallEdgeMat)
      line.position.copy(mesh.position)
      line.rotation.copy(mesh.rotation)
      this.roomGroup.add(line)

      // Gray baseboard trim along the wall's bottom edge — shares the wall's own fade so it
      // vanishes along with the wall when this segment is the one nearest the camera, instead of
      // leaving a floating gray strip once the wall above it fades away.
      const trimMat = new THREE.MeshBasicMaterial({ color: TRIM_COLOR, opacity: WALL_OPACITY_NORMAL, side: THREE.DoubleSide })
      const trim = new THREE.Mesh(new THREE.PlaneGeometry(width, TRIM_HEIGHT), trimMat)
      trim.position.set(x + normal.x * 0.015, TRIM_HEIGHT / 2, z + normal.z * 0.015)
      trim.rotation.y = rotY
      this.roomGroup.add(trim)

      this.wallMeshes.push({ mesh, trimMesh: trim, normal })
    }
    // Walls follow the room's outline polygon edge by edge — a plain rectangle produces exactly
    // the original 4 wall segments (back/left/front/right, matching the old fixed calls); a
    // notch/bump-out adds extra short segments around the cutout.
    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i]
      const [x1, z1] = outline[(i + 1) % outline.length]
      const dx = x1 - x0
      const dz = z1 - z0
      const segWidth = Math.hypot(dx, dz)
      if (segWidth < 0.01) continue
      const rotY = Math.abs(dz) > Math.abs(dx) ? Math.PI / 2 : 0
      const midX = (x0 + x1) / 2
      const midZ = (z0 + z1) / 2
      // Perpendicular to the segment's own direction — two candidates, 180° apart; pick whichever
      // one points from the segment's midpoint toward the room's interior (the centroid).
      let nx = -dz / segWidth
      let nz = dx / segWidth
      if ((centroid[0] - midX) * nx + (centroid[1] - midZ) * nz < 0) {
        nx = -nx
        nz = -nz
      }
      addWall(segWidth, h, midX, midZ, rotY, new THREE.Vector3(nx, 0, nz))
    }

    // Room just got rebuilt from scratch, so any previously-computed "nearest wall" reference is
    // dangling (points at a disposed mesh) — _updateNearWall (called every frame) picks a fresh
    // one before it's ever read again, but nulling it here avoids one stale frame where a wall
    // material that no longer exists in the scene would otherwise get touched.
    this.nearWallEntry = null
    this._buildWallLabels()
    this.fitCamera()
    this._repositionAllFeatures()
  }

  // "BACK"/"FRONT"/"LEFT"/"RIGHT" billboards near the top of each of the room's 4 principal walls
  // — a fixed reference so it's always clear which wall is which while orbiting, independent of
  // the door/window "wall" picker using the same names. Positioned off the wall's overall span
  // (via _wallConfig, the same helper the door/window picker's offset math uses) rather than off
  // wallMeshes' per-segment list, since a notch splices extra short segments into whichever wall
  // it's on — the label for that wall should still sit at the middle of its *original* full span,
  // not on top of one of those fragments. Rebuilt on every buildRoom() (they live in roomGroup,
  // cleared at the top of this method) since a resize moves every wall.
  _buildWallLabels() {
    const { h } = this.room
    const INSET = 0.35 // feet — how far in front of the wall surface the label floats
    const NORMALS = { back: [0, 1], front: [0, -1], left: [1, 0], right: [-1, 0] }
    for (const wall of ['back', 'front', 'left', 'right']) {
      const cfg = this._wallConfig(wall)
      const [x, z] = cfg.pos(cfg.length / 2)
      const [nx, nz] = NORMALS[wall]
      const label = this._createDimLabel()
      label.scale.set(1.1, 1.1 * (label.userData.canvas.height / label.userData.canvas.width), 1)
      label.position.set(x + nx * INSET, Math.min(h - 0.5, h * 0.92), z + nz * INSET)
      this._setDimLabelText(label, wall.toUpperCase())
      this.roomGroup.add(label)
    }
  }

  // ---------- Items ----------
  _buildBoxMesh(cat) {
    const [w, d, h] = cat.dims
    const geo = new THREE.BoxGeometry(w, h, d)
    const mat = new THREE.MeshStandardMaterial({ color: cat.color })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, h / 2, 0)
    const edges = new THREE.EdgesGeometry(geo)
    mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1b2a38 })))
    mesh.userData.dims = [w, d, h]
    return mesh
  }

  // Custom uploaded poster/artwork (Session 5, see catalog.js's buildCustomPosterCatalogItem) —
  // same thin-box shape as a real 'poster' catalog entry, but the two large faces (BoxGeometry's
  // face-group order is [+X, -X, +Y, -Y, +Z, -Z]; depth is dims[1], the thin axis, which is Z —
  // so indices 4/5 are the front/back faces users actually see) get the uploaded image as a
  // texture instead of a flat color, and the four thin edge faces get a plain frame color.
  // Loading the texture is async, but the mesh itself can be returned immediately — Three.js
  // renders a material with no map yet as a flat color and picks the image up the moment
  // TextureLoader's callback sets material.map + needsUpdate, no extra wiring needed here.
  _buildPosterMesh(cat) {
    const [w, d, h] = cat.dims
    const geo = new THREE.BoxGeometry(w, h, d)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2118 })
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cf })
    new THREE.TextureLoader().load(cat.posterImageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      faceMat.map = texture
      faceMat.color.set(0xffffff)
      faceMat.needsUpdate = true
    })
    const mesh = new THREE.Mesh(geo, [frameMat, frameMat, frameMat, frameMat, faceMat, faceMat])
    mesh.position.set(0, h / 2, 0)
    const edges = new THREE.EdgesGeometry(geo)
    mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1b2a38 })))
    mesh.userData.dims = [w, d, h]
    return mesh
  }

  // Shared with thumbnailRenderer.js (see modelFit.js) so the live 3D view and the dev-only
  // catalog thumbnail generator always agree on how a model gets fit to its dims — a second,
  // drifted copy of this logic previously mishandled a pre-applied rotation and would bake a
  // stretched thumbnail image for every Colgate-styled bed.
  _fitModelToDims(object3d, dims) {
    fitModelToDims(object3d, dims)
  }

  // Some of Tyler's own Blender exports (public/models/colgate*.glb) came through with no
  // material color at all — every one of them is a flat 50% gray with no texture. tintColor
  // repaints every material on the loaded scene to the catalog item's real-world color (the same
  // hex already used for the box-placeholder fallback) so the model actually looks like the wood
  // tone in Colgate's product photos instead of gray plastic.
  _tintModel(object3d, colorHex) {
    tintModel(object3d, colorHex)
  }

  _loadGltf(url) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject)
    })
  }

  _loadItemMesh(cat, onReady) {
    if (cat.posterImageUrl) {
      onReady(this._buildPosterMesh(cat))
    } else if (cat.modelUrl) {
      this.gltfLoader.load(
        cat.modelUrl,
        async (gltf) => {
          if (cat.hideNodes) {
            gltf.scene.traverse((o) => { if (cat.hideNodes.includes(o.name)) o.visible = false })
          }
          // modelRotationY corrects models authored with their axes rotated 90° from the
          // catalog's [width, depth, height] convention — e.g. colgateBed.glb's headboard/
          // footboard rail panels came in spanning the model's long axis instead of its short
          // one. Applying the rotation before _fitModelToDims (which measures the object's
          // current world-space bounding box) is what makes the non-uniform width/depth scale
          // land on the right axis.
          if (cat.modelRotationY) gltf.scene.rotation.y = cat.modelRotationY
          if (cat.tintMaterial) this._tintModel(gltf.scene, cat.color)
          const group = new THREE.Group()
          // primaryModelFitDims lets the visible primary model be fit to its own proportions
          // (e.g. the bunk bed's bottom frame, a fraction of the bed's overall height) separately
          // from cat.dims, which stays the item's true overall footprint/height everywhere else
          // (room clamping, the selection panel, stacking) — falls back to cat.dims for every
          // other item, unchanged from before.
          this._fitModelToDims(gltf.scene, cat.primaryModelFitDims || cat.dims)
          // floorNudge (real-world feet) is a per-item stopgap for a source model whose contact
          // points aren't all quite level (see catalog.js) — _fitModelToDims floor-aligns to the
          // model's single lowest vertex, so if that vertex belongs to one outlier leg/post, every
          // other leg ends up floating just above the floor with a visible gap underneath it.
          // Nudging the whole model down instead makes the *worst* leg the one that's flush and
          // sinks the rest slightly into the floor — invisible rather than floating, since the
          // opaque floor occludes anything below y=0 and the camera can never see under it (phi is
          // clamped well above straight-down in _initInteraction).
          if (cat.floorNudge) gltf.scene.position.y -= cat.floorNudge
          // Kept so later per-instance operations (matchBaseFootprint's _refitFootprint, the
          // color swatch picker's setItemColor) can find the real model root without guessing
          // child order/wrapping.
          group.userData.primaryModel = gltf.scene
          // hasPoseOptions (a pillow with flat/diagonal/upright poses — see catalog.js) wraps the
          // model in its own pivot group, recentered on its own half-height, so setItemPose can
          // rotate it around its center without disturbing the outer group's own Y-rotation (used
          // for room placement) or its floor alignment.
          if (cat.hasPoseOptions) {
            const pivot = new THREE.Group()
            gltf.scene.position.y -= cat.dims[2] / 2
            pivot.add(gltf.scene)
            group.userData.posePivot = pivot
            group.add(pivot)
            this._applyPose(group, cat, 'flat')
          } else {
            group.add(gltf.scene)
          }

          // extraModels fuses additional models onto this one as a single placeable item — e.g. a
          // bed's slat base + mattress, or the bunk bed's top frame — each sized to its own real
          // dims, rather than a second flat box overlapping it at floor level. Two positioning
          // modes:
          // - Plain yOffset: a fixed absolute Y within the group (the bunk's second frame, a
          //   non-adjustable bed's fixed mattress).
          // - movesWithHeight + stackOffset: for beds with bedHeights (see catalog.js) — this
          //   piece's Y tracks the bed's current height preset instead of a fixed spot, so setting
          //   the bed to "Lofted" slides it (and anything else in the same movable stack, like a
          //   mattress fused stackOffset above its slat) up together — the headboard/footboard
          //   posts stay right where they are, matching how a real adjustable frame works. Tracked
          //   in group.userData.movableObjs for setBedHeight() to reach later.
          if (cat.extraModels) {
            group.userData.movableObjs = []
            // isMattress (see catalog.js) flags which fused extra model is the real mattress mesh
            // — tracked here so applyMattressColor (triggered by clicking a sheet-set tier) knows
            // what to re-tint without having to guess by node name or position.
            group.userData.mattressModels = []
            for (const extra of cat.extraModels) {
              try {
                const extraGltf = await this._loadGltf(extra.modelUrl)
                if (extra.rotationY) extraGltf.scene.rotation.y = extra.rotationY
                if (extra.color) this._tintModel(extraGltf.scene, extra.color)
                this._fitModelToDims(extraGltf.scene, extra.dims)
                if (extra.movesWithHeight) {
                  const stackOffset = extra.stackOffset || 0
                  const standardY = (cat.bedHeights ? cat.bedHeights.standard : 0) + stackOffset
                  extraGltf.scene.position.y += standardY
                  group.userData.movableObjs.push({ obj: extraGltf.scene, stackOffset, thickness: extra.dims[2] })
                } else {
                  extraGltf.scene.position.y += extra.yOffset
                }
                if (extra.isMattress) group.userData.mattressModels.push(extraGltf.scene)
                group.add(extraGltf.scene)
              } catch (err) {
                console.warn(`Extra model failed to load for "${cat.name}".`, err)
              }
            }
          }

          group.userData.dims = cat.dims
          // wallMountClipFraction (see catalog.js's tv entry) — a horizontal clip plane, world-
          // space normal (0,1,0), that hides everything below it. Created here (once, per placed
          // instance) but left inactive (no material references it yet) until the item is
          // actually wall-mounted — see _setWallMountClipActive, which is what turns it on/off,
          // and _updateWallMountClips, which keeps its height in sync with the item while it's
          // active. Only meaningful for a single-fused-mesh model with no separate stand node to
          // hide via cat.hideNodes instead (the TV's televisionModern.glb is exactly that case —
          // stand and screen are one mesh, so this is the only code-only way to hide the stand
          // without a Blender re-export splitting them apart).
          if (cat.wallMountClipFraction != null) group.userData.wallClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
          onReady(group)
        },
        undefined,
        (err) => {
          console.warn(`Model failed to load for "${cat.name}", using placeholder box.`, err)
          onReady(this._buildBoxMesh(cat))
        }
      )
    } else {
      onReady(this._buildBoxMesh(cat))
    }
  }

  // dims is [width, depth, height] — only the first two matter for floor footprint. Accounts for
  // 90°-ish rotation swapping which axis is "width" vs. "depth" in world space. (A previous
  // version of the room clamp skipped depth and grabbed height by mistake, which meant any tall
  // rotated item — e.g. a 6'-tall wardrobe with a 2.08' depth — got clamped as if its footprint
  // were 6' deep, leaving it stuck several feet short of the wall it was dragged toward instead
  // of sitting flush against it.)
  _footprint(mesh) {
    let [w, d] = mesh.userData.dims
    const rotDeg = (((mesh.rotation.y * 180) / Math.PI) % 360 + 360) % 360
    const swapped = (rotDeg > 45 && rotDeg < 135) || (rotDeg > 225 && rotDeg < 315)
    return swapped ? [d, w] : [w, d]
  }

  // Keeps a floor item's footprint inside the room *and* clear of every door/window opening — see
  // _clampPositionOnly for the room-rectangle/notch half, and _pushOutOfFeatures for the
  // door/window half. Split into two steps because _pushOutOfFeatures needs to re-run the plain
  // room clamp after nudging an item away from a feature (a push could in principle land it back
  // outside the walls) without recursing back into the feature push itself.
  _clampItemToRoom(mesh) {
    this._clampPositionOnly(mesh)
    this._pushOutOfFeatures(mesh)
  }

  // Base case: clamp to the room's bounding rectangle, same as always. When a notch is present,
  // that's refined afterward — for an inset, pushed back out of the carved-out area; for a
  // bump-out, allowed to extend further out into it. Since the room is always "rectangle ± one
  // axis-aligned rectangle," this stays simple axis math rather than general polygon containment.
  _clampPositionOnly(mesh) {
    const [w, d] = this._footprint(mesh)
    const hw = w / 2, hd = d / 2
    const rawX = mesh.position.x, rawZ = mesh.position.z
    const halfW = this.room.w / 2 - hw
    const halfL = this.room.l / 2 - hd
    const pos = {
      x: Math.max(-halfW, Math.min(halfW, rawX)),
      z: Math.max(-halfL, Math.min(halfL, rawZ)),
    }

    const notch = this._clampedNotch()
    if (notch) {
      const axes = this._notchAxes(notch.wall)
      const half = notch.width / 2
      const latCenter = axes.lateralOrigin + notch.offset
      const latMin = latCenter - half
      const latMax = latCenter + half
      const perpHalf = axes.perp === 'x' ? hw : hd
      const latHalf = axes.perp === 'x' ? hd : hw
      const boundary = axes.wallCoord + axes.perpSign * notch.depth
      const raw = { x: rawX, z: rawZ }

      if (notch.depth > 0) {
        // Bump-out: if the item's footprint fits within the notch's lateral span, let it slide
        // out past the original wall line, up to the bump's outer edge.
        const rawLat = raw[axes.lateral]
        if (rawLat - latHalf >= latMin && rawLat + latHalf <= latMax) {
          const wallLimit = axes.wallCoord - axes.perpSign * perpHalf
          const extendedLimit = boundary - axes.perpSign * perpHalf
          const rawPerp = raw[axes.perp]
          pos[axes.perp] = axes.perpSign < 0
            ? Math.max(extendedLimit, Math.min(wallLimit, rawPerp))
            : Math.min(extendedLimit, Math.max(wallLimit, rawPerp))
          pos[axes.lateral] = Math.max(latMin + latHalf, Math.min(latMax - latHalf, rawLat))
        }
      } else if (notch.depth < 0) {
        // Inset: if the (already wall-clamped) footprint overlaps the carved-out rectangle,
        // push it back out along whichever axis needs the smaller nudge.
        const overlapsLateral = pos[axes.lateral] + latHalf > latMin && pos[axes.lateral] - latHalf < latMax
        const intrudesPerp = axes.perpSign < 0
          ? pos[axes.perp] - perpHalf < boundary
          : pos[axes.perp] + perpHalf > boundary
        if (overlapsLateral && intrudesPerp) {
          const perpPushTo = boundary + axes.perpSign * perpHalf
          const perpPush = Math.abs(perpPushTo - pos[axes.perp])
          const latLow = latMin - latHalf
          const latHigh = latMax + latHalf
          const latPushLow = Math.abs(latLow - pos[axes.lateral])
          const latPushHigh = Math.abs(latHigh - pos[axes.lateral])
          if (perpPush <= Math.min(latPushLow, latPushHigh)) pos[axes.perp] = perpPushTo
          else pos[axes.lateral] = latPushLow < latPushHigh ? latLow : latHigh
        }
      }
    }

    mesh.position.x = pos.x
    mesh.position.z = pos.z
  }

  // Pushes a floor item's footprint out of every door/window opening it currently overlaps — doors
  // and windows are real physical gaps furniture can't occupy, not just a visual warning (compare
  // _updateCollisions' item-vs-item tinting, which only warns). Resolves an overlap by nudging the
  // item along whichever world axis needs the smaller move to clear it — the same "push along the
  // cheaper axis" approach _clampPositionOnly's notch-inset branch uses — then re-clamps to the
  // room afterward in case that nudge pushed it past a wall. Runs a few passes since a nudge away
  // from one feature could in principle land it inside a second one (e.g. two windows on adjacent
  // walls near a corner); a fixed small cap rather than a while(true) so a pathological layout
  // (a feature wider than the room, say) can't spin this forever.
  _pushOutOfFeatures(mesh) {
    if (this.wallFeatures.length === 0) return
    for (let pass = 0; pass < 4; pass++) {
      const box = new THREE.Box3().setFromObject(mesh)
      let pushedAny = false
      for (const feature of this.wallFeatures) {
        const fbox = this._featureCollisionBox(feature)
        if (!box.intersectsBox(fbox)) continue
        const overlapX = Math.min(box.max.x, fbox.max.x) - Math.max(box.min.x, fbox.min.x)
        const overlapZ = Math.min(box.max.z, fbox.max.z) - Math.max(box.min.z, fbox.min.z)
        if (overlapX <= 0 || overlapZ <= 0) continue
        if (overlapX < overlapZ) {
          const meshMidX = (box.min.x + box.max.x) / 2
          const featMidX = (fbox.min.x + fbox.max.x) / 2
          const delta = meshMidX < featMidX ? -overlapX : overlapX
          mesh.position.x += delta
          box.min.x += delta
          box.max.x += delta
        } else {
          const meshMidZ = (box.min.z + box.max.z) / 2
          const featMidZ = (fbox.min.z + fbox.max.z) / 2
          const delta = meshMidZ < featMidZ ? -overlapZ : overlapZ
          mesh.position.z += delta
          box.min.z += delta
          box.max.z += delta
        }
        pushedAny = true
      }
      if (!pushedAny) break
      this._clampPositionOnly(mesh)
    }
  }

  // Keeps a stacked item's footprint within the item it's resting on, the same way
  // _clampItemToRoom keeps a floor item within the room's walls — you can slide a TV around on a
  // desk, but not off the edge of it. If the item on top is bigger than its base along some axis
  // (a big TV on a small side table), there's no room to slide on that axis at all — pinned to the
  // base's center there rather than producing an inverted (min > max) range. Doesn't account for
  // the base and topper being rotated *relative to each other* (true oriented-box overlap) — both
  // are just treated as room-axis-aligned boxes, which covers every real case in this app since
  // nothing here is ever rotated off a 90° step.
  _clampStackedItem(mesh, baseUid) {
    const base = this.placedItems.find((p) => p.uid === baseUid)
    if (!base) return
    const [cw, cd] = this._footprint(mesh)
    const [bw, bd] = this._footprint(base.mesh)
    const halfDiffW = Math.max(0, (bw - cw) / 2)
    const halfDiffD = Math.max(0, (bd - cd) / 2)
    const baseX = base.mesh.position.x
    const baseZ = base.mesh.position.z
    mesh.position.x = Math.max(baseX - halfDiffW, Math.min(baseX + halfDiffW, mesh.position.x))
    mesh.position.z = Math.max(baseZ - halfDiffD, Math.min(baseZ + halfDiffD, mesh.position.z))
  }

  // Resizes a matchBaseFootprint item's own footprint (w,d) in place, keeping its own authored
  // thickness (cat.dims[2]) — used whenever it's (re)stacked (see stackItemOn) so the mattress
  // topper always matches the exact mattress/surface underneath it.
  //
  // fitModelToDims isn't idempotent — it derives scale from the object's *current* world-space
  // size (see modelFit.js), so calling it again on an already-fitted model without first resetting
  // scale/position back to identity would compound instead of landing on the new target size.
  _refitFootprint(item, cat, [w, d]) {
    const h = cat.dims[2]
    if (cat.modelUrl) {
      const model = item.mesh.userData.primaryModel
      if (model) {
        model.position.set(0, 0, 0)
        model.scale.set(1, 1, 1)
        if (cat.modelRotationY) model.rotation.y = cat.modelRotationY
        this._fitModelToDims(model, [w, d, h])
        if (cat.floorNudge) model.position.y -= cat.floorNudge
      }
    } else {
      // Box placeholder fallback for a matchBaseFootprint item with no model — swap geometry
      // directly rather than rescaling, and rebuild the edge outline so it isn't left showing the
      // old footprint's size.
      item.mesh.geometry.dispose()
      item.mesh.geometry = new THREE.BoxGeometry(w, h, d)
      const oldEdges = item.mesh.children.find((c) => c.isLineSegments)
      if (oldEdges) {
        item.mesh.remove(oldEdges)
        oldEdges.geometry.dispose()
      }
      item.mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(item.mesh.geometry), new THREE.LineBasicMaterial({ color: 0x1b2a38 })))
    }
    item.mesh.userData.dims = [w, d, h]
  }

  // Alignment aid for dragging a floor item near another one — independent X and Z snapping, each
  // only considered when the item's footprint on the *other* axis would actually overlap the
  // other item's (so it only kicks in when they're plausibly sliding into side-by-side contact,
  // not any time their bounding boxes happen to be near each other diagonally). Within
  // ITEM_SNAP_DISTANCE of the flush (zero-gap) touching position, the raw cursor-driven coordinate
  // is replaced with that exact flush value; once the raw position drifts further than that past
  // it, this stops touching that axis at all and the raw value passes through unchanged — which is
  // what lets a further drag carry the item on through and past the other one instead of getting
  // stuck at the first contact forever. Only considers other floor items (skips anything stacked
  // on top of something else, which isn't a "floor neighbor" to align against).
  _snapToNearbyItems(item, rawX, rawZ) {
    const [w, d] = this._footprint(item.mesh)
    const hw = w / 2
    const hd = d / 2
    let x = rawX
    let z = rawZ
    for (const other of this.placedItems) {
      if (other.uid === item.uid || other.stackedOnUid != null) continue
      const [ow, od] = this._footprint(other.mesh)
      const ohw = ow / 2
      const ohd = od / 2
      const ox = other.mesh.position.x
      const oz = other.mesh.position.z

      const zOverlaps = rawZ - hd < oz + ohd && rawZ + hd > oz - ohd
      if (zOverlaps) {
        const flushLeft = ox - ohw - hw
        const flushRight = ox + ohw + hw
        const flush = Math.abs(rawX - flushLeft) < Math.abs(rawX - flushRight) ? flushLeft : flushRight
        if (Math.abs(rawX - flush) < ITEM_SNAP_DISTANCE) x = flush
      }

      const xOverlaps = rawX - hw < ox + ohw && rawX + hw > ox - ohw
      if (xOverlaps) {
        const flushBack = oz - ohd - hd
        const flushFront = oz + ohd + hd
        const flush = Math.abs(rawZ - flushBack) < Math.abs(rawZ - flushFront) ? flushBack : flushFront
        if (Math.abs(rawZ - flush) < ITEM_SNAP_DISTANCE) z = flush
      }
    }
    return { x, z }
  }

  // A bed's mattress footprint, "which bed still needs this item", and "what's currently the
  // topmost layer on a given bed" — the three pieces addItem needs to auto-snap a bedOnly item
  // (mattress topper, pillows — see catalog.js) straight onto a bed instead of dropping it loose on
  // the floor. Sheets and the comforter/throw blanket don't go through this anymore — see
  // applyMattressColor/_findBedForDressing below.
  _findBedAutoStackTarget(cat) {
    const beds = this.placedItems.filter((p) => {
      const c = ALL_ITEMS.find((x) => x.id === p.catalogId)
      return c && c.isBed
    })
    if (!beds.length) return null
    // Prefer a bed that doesn't already have this concept (groupId) dressed on it, so adding e.g.
    // a second comforter to a two-bed room dresses the *other* bed rather than double-stacking.
    const undressed = beds.find((bed) => !this._stackChainHasGroup(bed.uid, cat.groupId))
    return this._topOfStack((undressed || beds[beds.length - 1]).uid)
  }

  _stackChainHasGroup(uid, groupId) {
    if (!groupId) return false
    let current = this.placedItems.find((p) => p.uid === uid)
    while (current) {
      const cat = ALL_ITEMS.find((c) => c.id === current.catalogId)
      if (cat && cat.groupId === groupId) return true
      current = this.placedItems.find((p) => p.stackedOnUid === current.uid)
    }
    return false
  }

  _topOfStack(uid) {
    let current = this.placedItems.find((p) => p.uid === uid)
    while (current) {
      const child = this.placedItems.find((p) => p.stackedOnUid === current.uid)
      if (!child) return current
      current = child
    }
    return null
  }

  // Finds which placed bed a comforter click should dress — prefers one that isn't already dressed
  // (so a second dressesBed pick in a two-bed room dresses the *other* bed, same spirit as
  // _findBedAutoStackTarget's "undressed" preference), else re-dresses the most recent bed (the
  // switch case: clicking a comforter/throw-blanket tier when every bed is already dressed).
  // Every placed item's mesh EXCEPT a bed currently dressed (see _applyBedDressing) — that bed's
  // own mesh sits exactly under its dressing model, hidden but still fully real geometry (fading it
  // out only tweens opacity/visible, it doesn't remove it from the scene), and THREE.Raycaster
  // doesn't skip invisible objects on its own (it only checks layers, not .visible) — so without
  // this exclusion, clicking or measuring against a dressed bed could hit its hidden frame instead
  // of the dressing model actually shown there.
  _raycastableItemMeshes() {
    return this.placedItems.filter((p) => p.dressingUid == null).map((p) => p.mesh)
  }

  _findBedForDressing() {
    const beds = this.placedItems.filter((p) => {
      const c = ALL_ITEMS.find((x) => x.id === p.catalogId)
      return c && c.isBed
    })
    if (!beds.length) return null
    return beds.find((bed) => bed.dressingUid == null) || beds[beds.length - 1]
  }

  // Fades a bed's own frame model (the whole `bed.mesh` group, fused frame+mattress and all) in or
  // out — used both sides of a dressing swap: out when a comforter/throw-blanket model takes over
  // the bed's look, back in once that dressing is removed. mesh.visible is flipped only at the
  // *end* of a fade-out (see _fadeMesh's onComplete)
  // so it stays raycastable/rendered while still visibly fading, and flipped true immediately for
  // a fade-in so it's visible (at opacity 0, climbing) from the very first frame.
  _fadeBedFrame(bed, show) {
    if (show) {
      bed.mesh.visible = true
      this._fadeMesh(bed.mesh, { from: 0, to: 1 })
    } else {
      this._fadeMesh(bed.mesh, { from: 1, to: 0, onComplete: () => { bed.mesh.visible = false } })
    }
  }

  // Comforter and throw blanket (see catalog.js's dressesBed) — both are now real scans of an
  // entire made bed (frame + mattress + comforter, and frame + mattress + comforter + throw blanket
  // respectively, each fused into one mesh), not a loose layer, so clicking either one no longer
  // stacks it onto a bed's mattress. Instead it swaps the target bed's own visible model out for
  // this one: the frame fades out, this model fades in at the exact same spot, and the two
  // placedItems entries stay linked (bed.dressingUid / dressing.dressesBedUid) so removing either
  // one is a clean, reversible swap (see removeItem). Picking the *other* dressesBed group (or a
  // different tier of the one already active) on an already-dressed bed cross-fades straight from
  // the old dressing model to the new one instead of revealing the frame in between.
  _applyBedDressing(cat) {
    const bed = this._findBedForDressing()
    if (!bed) {
      this.onNotice('Add a bed to the room first.')
      return
    }
    const previousDressingUid = bed.dressingUid
    this._loadItemMesh(cat, (mesh) => {
      mesh.position.set(bed.mesh.position.x, 0, bed.mesh.position.z)
      mesh.rotation.y = bed.mesh.rotation.y
      const uid = this._registerItem(mesh, cat)
      const dressing = this.placedItems.find((p) => p.uid === uid)
      dressing.dressesBedUid = bed.uid
      bed.dressingUid = uid
      this._fadeMesh(dressing.mesh, { from: 0, to: 1 })
      if (previousDressingUid != null) {
        // Already dressed (switching comforter tiers) — cross-fade the old dressing model
        // straight out instead of also fading the (already-hidden) frame back in and out again.
        const oldIdx = this.placedItems.findIndex((p) => p.uid === previousDressingUid)
        if (oldIdx !== -1) {
          const old = this.placedItems[oldIdx]
          this.placedItems.splice(oldIdx, 1)
          this._fadeMesh(old.mesh, { from: 1, to: 0, onComplete: () => this.itemsGroup.remove(old.mesh) })
          this._emitCart()
        }
      } else {
        this._fadeBedFrame(bed, false)
      }
      this.selectItem(uid)
    })
  }

  addItem(catId) {
    const cat = ALL_ITEMS.find((c) => c.id === catId)
    if (!cat) return
    if (cat.dressesBed) {
      this._applyBedDressing(cat)
      return
    }
    if (cat.bedOnly) {
      const target = this._findBedAutoStackTarget(cat)
      if (!target) {
        this.onNotice('Add a bed to the room first.')
        return
      }
      this._loadItemMesh(cat, (mesh) => {
        const uid = this._registerItem(mesh, cat)
        this.stackItemOn(uid, target.uid)
        this.selectItem(uid)
      })
      return
    }
    this._loadItemMesh(cat, (mesh) => {
      if (cat.wallMountable) {
        this._defaultWallPlacement(mesh, cat)
      } else {
        const jitter = (Math.random() - 0.5) * 2
        mesh.position.x = jitter
        mesh.position.z = jitter
      }
      this._registerItem(mesh, cat)
      this.selectItem(mesh.userData.uid)
    })
  }

  // onRegistered, if given, fires with the freshly-assigned uid once the (possibly async, for a
  // glTF model) load finishes and the item actually lands in placedItems — used by loadState()
  // below to know each restored item's uid so it can resolve stackedOnIndex references afterward.
  // y is only meaningful for a wall item (see getState/loadState) — every other item's height is
  // always derived from its own dims/stacking, never freely chosen, so omitting it (undefined)
  // for a normal floor item is the common case, not an oversight. For a cat.canWallMount item
  // (the TV), a passed y doubles as the signal that *this instance* should come back wall-
  // mounted — duplicateSelected/pasteItem/loadState below only ever pass one when the source
  // instance had wallMounted: true, so its mere presence is enough; there's no separate flag to
  // thread through.
  addItemAt(catId, x, z, rotY, onRegistered, y) {
    const cat = ALL_ITEMS.find((c) => c.id === catId)
    if (!cat) return
    this._loadItemMesh(cat, (mesh) => {
      mesh.position.x = x
      mesh.position.z = z
      mesh.rotation.y = rotY || 0
      if (cat.wallMountable) {
        if (y != null) mesh.position.y = y
        else this._defaultWallPlacement(mesh, cat)
      } else if (cat.canWallMount && y != null) {
        mesh.position.y = y
      }
      const uid = this._registerItem(mesh, cat)
      if (cat.canWallMount && y != null) {
        const item = this.placedItems.find((p) => p.uid === uid)
        if (item) item.wallMounted = true
        this._setWallMountClipActive(mesh, cat, true)
      }
      if (onRegistered) onRegistered(uid)
    })
  }

  // Snaps a freshly-created wall-mountable item onto a default wall (the first one built —
  // deterministic, not "nearest to the camera" or similar, so repeated adds land somewhere
  // consistent) at a comfortable default eye-level height, with a little horizontal jitter (same
  // spirit as addItem's floor-item jitter) so several added back to back don't stack exactly on
  // top of each other. rotation.y matches the wall's own so the item's thin depth axis faces the
  // wall's outward normal, same convention _snapToWallHit below uses while dragging.
  _defaultWallPlacement(mesh, cat) {
    const wallEntry = this.wallMeshes && this.wallMeshes[0]
    if (!wallEntry) return
    const { mesh: wallMesh, normal } = wallEntry
    const [, depth, height] = cat.dims
    const jitter = (Math.random() - 0.5) * 2
    const tangent = new THREE.Vector3(1, 0, 0).applyQuaternion(wallMesh.quaternion)
    const center = wallMesh.position
    const targetY = Math.min(Math.max(4.5, height / 2), Math.max(height / 2, this.room.h - height / 2))
    mesh.position.set(
      center.x + tangent.x * jitter + normal.x * (depth / 2),
      targetY,
      center.z + tangent.z * jitter + normal.z * (depth / 2)
    )
    mesh.rotation.y = wallMesh.rotation.y
  }

  // Raycasts (using this.raycaster, already primed from the current pointer position by the
  // caller) against the room's actual wall meshes rather than an infinite floor plane — this is
  // what lets a wall item be dragged along an L-shaped notch/bump-out room's real wall layout
  // instead of just the 4 walls a plain rectangle would have. Returns null if the pointer isn't
  // currently over any wall (e.g. dragged out over the doorway gap between two segments, or up
  // past the top of a wall) — the caller just leaves the item at its last valid position that
  // frame rather than snapping it somewhere wrong.
  _raycastWallPoint() {
    if (!this.wallMeshes || this.wallMeshes.length === 0) return null
    const hits = this.raycaster.intersectObjects(this.wallMeshes.map((w) => w.mesh))
    if (!hits.length) return null
    const hit = hits[0]
    const entry = this.wallMeshes.find((w) => w.mesh === hit.object)
    return { point: hit.point, normal: entry.normal, wallMesh: entry.mesh }
  }

  // Moves a wall-mountable item's mesh to a wall raycast hit — its center follows the hit point
  // directly (clamped in Y so it can't drag above the ceiling or below the floor), nudged out
  // from the wall surface by half the item's own depth so it renders flush against the wall
  // instead of clipping through it, and re-oriented to match whichever wall it's currently over
  // (so dragging a poster around an inside corner from one wall onto another turns it to face the
  // new wall automatically).
  _snapToWallHit(mesh, catalogId, hit) {
    const cat = ALL_ITEMS.find((c) => c.id === catalogId)
    const height = cat?.dims[2] || 1
    const depth = cat?.dims[1] || 0.05
    const halfHeight = height / 2
    const targetY = Math.min(Math.max(hit.point.y, halfHeight), Math.max(halfHeight, this.room.h - halfHeight))
    mesh.position.set(
      hit.point.x + hit.normal.x * (depth / 2),
      targetY,
      hit.point.z + hit.normal.z * (depth / 2)
    )
    mesh.rotation.y = hit.wallMesh.rotation.y
  }

  // Whichever wall segment's mesh center sits closest to `mesh`'s current position — shared by
  // _resnapWallItemToNearestWall (below) and the pointerdown handler's near-wall drag gate in
  // _initInteraction, so "which wall is this wall-mounted item actually on" is answered the same
  // way in both places.
  _nearestWallMeshTo(mesh) {
    if (!this.wallMeshes || this.wallMeshes.length === 0) return null
    let best = null
    let bestDist = Infinity
    for (const entry of this.wallMeshes) {
      const d = entry.mesh.position.distanceTo(mesh.position)
      if (d < bestDist) {
        bestDist = d
        best = entry
      }
    }
    return best
  }

  // Re-snaps a wall item to whichever wall is now closest to its stored position — used by
  // _reclampAllItems after a room resize/notch change rebuilds every wall, since the item's old
  // x/z may no longer sit against any real wall surface at all. Projects onto the chosen wall's
  // own tangent, clamped to that wall segment's actual length, so the item lands somewhere on the
  // wall itself rather than floating off its end.
  _resnapWallItemToNearestWall(mesh, cat) {
    const best = this._nearestWallMeshTo(mesh)
    if (!best) return
    const { mesh: wallMesh, normal } = best
    const segLength = wallMesh.geometry.parameters.width
    const tangent = new THREE.Vector3(1, 0, 0).applyQuaternion(wallMesh.quaternion)
    const center = wallMesh.position
    const rel = new THREE.Vector3().subVectors(mesh.position, center)
    const t = Math.max(-segLength / 2, Math.min(segLength / 2, rel.dot(tangent)))
    const [, depth, height] = cat.dims
    const halfHeight = height / 2
    const targetY = Math.min(Math.max(mesh.position.y, halfHeight), Math.max(halfHeight, this.room.h - halfHeight))
    mesh.position.set(
      center.x + tangent.x * t + normal.x * (depth / 2),
      targetY,
      center.z + tangent.z * t + normal.z * (depth / 2)
    )
    mesh.rotation.y = wallMesh.rotation.y
  }

  // Whether `item` should currently behave like a wall item (wall dragging, wall-flush resnap on
  // room resize, y persisted in getState) — true for a plain wallMountable catalog item (poster,
  // mirror, ...) unconditionally, or for a cat.canWallMount item (currently just the TV) whose
  // *this instance* has been toggled onto the wall via setWallMounted. Centralized here so every
  // site that used to check cat.wallMountable alone picks up the TV's toggle for free.
  _isWallMounted(item, cat) {
    return !!(cat?.wallMountable || (cat?.canWallMount && item?.wallMounted))
  }

  // Flips a placed cat.canWallMount item (the TV) between a normal floor item and a wall-mounted
  // one — the selection panel's "Mount on wall" / "Place on floor" button. Unlike a plain
  // wallMountable item, this one item can be in either mode depending on the instance, so (unlike
  // addItem/_defaultWallPlacement's one-shot use on a brand-new item) this has to actually move an
  // *existing* mesh between the two states and flip the flag _isWallMounted reads everywhere else.
  setWallMounted(uid, mounted) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    const cat = ALL_ITEMS.find((c) => c.id === item.catalogId)
    if (!cat?.canWallMount || item.wallMounted === mounted) return
    // Nothing should be resting on this item, or have this item resting on something, once it's
    // on the wall — same "surface it was on/resting on it is going away" cleanup a pickup-to-drag
    // does elsewhere (see the pointerdown handler's drag-item branch).
    if (item.stackedOnUid != null) item.stackedOnUid = null
    this._dropDescendants(uid)
    item.wallMounted = mounted
    if (mounted) this._defaultWallPlacement(item.mesh, cat)
    else {
      item.mesh.position.y = 0
      this._clampItemToRoom(item.mesh)
    }
    this._setWallMountClipActive(item.mesh, cat, mounted)
    if (this.selected && this.selected.uid === uid) this._emitSelection()
    this._emitCart()
  }

  // Turns a wallMountClipFraction item's stand-hiding clip plane (see _loadItemMesh) on or off —
  // "on" means every material in the model gets the plane added to its own clippingPlanes (three.js
  // clipping is per-material, so this has to traverse), "off" clears it back to none so the item
  // renders whole again once it's back on the floor. No-op for any item that didn't get a plane
  // built in the first place (everything except the TV, currently).
  _setWallMountClipActive(mesh, cat, active) {
    if (cat.wallMountClipFraction == null) return
    const plane = mesh.userData.wallClipPlane
    if (!plane) return
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => { m.clippingPlanes = active ? [plane] : [] })
    })
  }

  // Keeps every active wall-mount clip plane's height in sync with its item's current position —
  // called once a frame from _animate rather than from every individual site that can move a
  // wall-mounted item (mount, drag, room-resize resnap, duplicate, paste, load), since there'd
  // otherwise be several of those to keep covered. mesh.position.y is the item's world-space
  // *bottom* (see modelFit.js's floor-alignment — a wall item's group is floor-nudged up to its
  // target height, same as a floor item's group sits at y=0), so "keep the top
  // (1 - wallMountClipFraction) of the model" means clipping everything below
  // position.y + wallMountClipFraction * height. Rotation around Y (the only axis a wall item ever
  // rotates on) never tilts this plane off-level, so no need to touch the plane's normal here —
  // only its height (`constant`) changes.
  _updateWallMountClips() {
    for (const p of this.placedItems) {
      if (!p.wallMounted) continue
      const plane = p.mesh.userData.wallClipPlane
      if (!plane) continue
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      if (cat?.wallMountClipFraction == null) continue
      const cutoffY = p.mesh.position.y + cat.wallMountClipFraction * cat.dims[2]
      plane.constant = -cutoffY
    }
  }

  _registerItem(mesh, cat) {
    const uid = this.uidCounter++
    mesh.userData.uid = uid
    mesh.userData.catalogId = cat.id
    this.itemsGroup.add(mesh)
    // 'standard' is the default because it's tuned to match how each bed's mattress was
    // originally (and still is, for extraModels' yOffset) positioned — a freshly-placed bed
    // matches the raw model's own look rather than silently starting on a different peg.
    // wallMounted only ever flips true for a cat.canWallMount item (e.g. the TV) via
    // setWallMounted below — a plain cat.wallMountable item (poster, mirror, ...) is wall-placed
    // from the moment it's added and never reads this field at all (see _isWallMounted).
    this.placedItems.push({
      mesh, catalogId: cat.id, uid, stackedOnUid: null, bedHeightLevel: 'standard', locked: false, wallMounted: false,
      pillowPose: cat.hasPoseOptions ? 'flat' : undefined,
      colorHex: cat.colorable ? cat.color : undefined,
      // dressesBedUid (a comforter — see catalog.js) / dressingUid (a bed): the two-way link
      // _applyBedDressing sets up between a bed and whatever's currently dressing it, so removing
      // either one through removeItem below can cleanly undo the pairing on the other side.
      dressesBedUid: null,
      dressingUid: null,
    })
    this._clampItemToRoom(mesh)
    this._emitCart()
    return uid
  }

  removeItem(uid) {
    this._cancelStackPickIfActive()
    const idx = this.placedItems.findIndex((p) => p.uid === uid)
    if (idx === -1) return
    const removed = this.placedItems[idx]
    this.itemsGroup.remove(removed.mesh)
    this.placedItems.splice(idx, 1)
    // Undo a comforter/bed dressing link (see _applyBedDressing) in whichever direction applies:
    // removing the comforter brings the bed frame's own model back into view; removing the bed
    // itself takes its comforter down too, rather than leaving an orphaned "made bed" model with
    // no frame underneath it tracking a now-nonexistent bed.
    if (removed.dressesBedUid != null) {
      const bed = this.placedItems.find((p) => p.uid === removed.dressesBedUid)
      if (bed) {
        bed.dressingUid = null
        this._fadeBedFrame(bed, true)
      }
    }
    if (removed.dressingUid != null) this.removeItem(removed.dressingUid)
    // Anything resting on the removed item — directly, or several layers up a bedding stack —
    // falls back to the floor rather than floating in place or disappearing along with it.
    const affected = this._collectDescendantUids(uid)
    this._dropDescendants(uid)
    const selectedAffected = this.selected != null && affected.has(this.selected.uid)
    if (this.selected && this.selected.uid === uid) this.deselectItem()
    else if (selectedAffected) this._emitSelection()
    this._emitCart()
  }

  // Every item (direct or indirect) currently resting on top of uid, as a set of uids.
  _collectDescendantUids(uid, acc = new Set()) {
    this.placedItems.forEach((p) => {
      if (p.stackedOnUid === uid) {
        acc.add(p.uid)
        this._collectDescendantUids(p.uid, acc)
      }
    })
    return acc
  }

  // Sends every item currently stacked on uid (and transitively, anything stacked on those) back
  // down to the floor — used when uid itself is removed or picked up to drag, since the surface
  // they were resting on is gone/moving. Mirrors _collectDescendantUids's walk but mutates.
  _dropDescendants(uid) {
    this.placedItems.filter((p) => p.stackedOnUid === uid).forEach((child) => {
      child.mesh.position.y = 0
      child.stackedOnUid = null
      this._dropDescendants(child.uid)
    })
  }

  clearAll() {
    ;[...this.placedItems].forEach((p) => this.removeItem(p.uid))
    ;[...this.wallFeatures].forEach((f) => this.removeFeature(f.id))
  }

  rotateSelected(deltaRad = Math.PI / 2) {
    if (!this.selected) return
    this.selected.mesh.rotation.y = (this.selected.mesh.rotation.y + deltaRad) % (Math.PI * 2)
    // Anything stacked on the selected item — directly, or several layers up a bedding stack —
    // shares its x/z center (see stackItemOn/_restackAbove), so rotating around that shared center
    // needs no repositioning, just the same turn applied to each descendant's own rotation. Without
    // this, rotating a bed that already has a topper/comforter/pillow on it (a routine "turn the bed
    // to fit the room" action, done well after the bedding was added) left all of that bedding
    // facing the frame's old orientation — looking rotated 90°/180° wrong relative to the bed.
    this._rotateDescendants(this.selected.uid, deltaRad)
    if (this.selected.stackedOnUid != null) this._clampStackedItem(this.selected.mesh, this.selected.stackedOnUid)
    else this._clampItemToRoom(this.selected.mesh)
  }

  _rotateDescendants(uid, deltaRad) {
    this.placedItems.filter((p) => p.stackedOnUid === uid).forEach((child) => {
      child.mesh.rotation.y = (child.mesh.rotation.y + deltaRad) % (Math.PI * 2)
      this._rotateDescendants(child.uid, deltaRad)
    })
  }

  // Instant clone of the selected item, offset a bit from the original so the two don't land
  // exactly on top of each other — same nudge-and-select pattern as pasteItem() below, just
  // sourced straight from the live selection instead of the clipboard. Calling this repeatedly
  // keeps re-selecting the newest copy (addItemAt's onRegistered below), so each duplicate steps
  // diagonally away from the last one instead of every copy piling up in the same spot.
  duplicateSelected() {
    if (!this.selected) return
    const src = this.selected
    const cat = ALL_ITEMS.find((c) => c.id === src.catalogId)
    if (!cat) return
    const OFFSET = 1
    this.addItemAt(
      src.catalogId,
      src.mesh.position.x + OFFSET,
      src.mesh.position.z + OFFSET,
      src.mesh.rotation.y,
      (uid) => {
        if (src.bedHeightLevel && src.bedHeightLevel !== 'standard') this.setBedHeight(uid, src.bedHeightLevel)
        if (src.colorHex != null) this.setItemColor(uid, src.colorHex)
        if (src.pillowPose && src.pillowPose !== 'flat') this.setItemPose(uid, src.pillowPose)
        // bedOnly items (see catalog.js) can't exist un-stacked — re-attach the duplicate to
        // whatever the original was resting on instead of leaving it floating on the floor.
        if (cat.bedOnly && src.stackedOnUid != null && this.placedItems.find((p) => p.uid === src.stackedOnUid)) {
          this.stackItemOn(uid, src.stackedOnUid)
        }
        this.selectItem(uid)
      },
      this._isWallMounted(src, cat) ? src.mesh.position.y : undefined
    )
  }

  // Snapshots the selected item's placement into an internal clipboard — independent of
  // `selected`/`placedItems` from this point on, so it survives deselecting, selecting something
  // else, or even removing the original before pasteItem() below is called.
  copySelected() {
    if (!this.selected) return
    const src = this.selected
    this.clipboardItem = {
      catalogId: src.catalogId,
      x: src.mesh.position.x,
      y: src.mesh.position.y,
      z: src.mesh.position.z,
      rotY: src.mesh.rotation.y,
      bedHeightLevel: src.bedHeightLevel,
      wallMounted: src.wallMounted,
      colorHex: src.colorHex,
      pillowPose: src.pillowPose,
      stackedOnUid: src.stackedOnUid,
    }
  }

  // Places a new copy of whatever copySelected() last captured, offset from the clipboard's own
  // stored position the same way duplicateSelected() offsets from the original — and then walks
  // that stored position forward by the same offset, so pasting the same clipboard repeatedly
  // steps each new copy further away rather than restacking every paste in the same spot.
  pasteItem() {
    if (!this.clipboardItem) return
    const c = this.clipboardItem
    const cat = ALL_ITEMS.find((x) => x.id === c.catalogId)
    if (!cat) return
    const OFFSET = 1
    this.addItemAt(c.catalogId, c.x + OFFSET, c.z + OFFSET, c.rotY, (uid) => {
      if (c.bedHeightLevel && c.bedHeightLevel !== 'standard') this.setBedHeight(uid, c.bedHeightLevel)
      if (c.colorHex != null) this.setItemColor(uid, c.colorHex)
      if (c.pillowPose && c.pillowPose !== 'flat') this.setItemPose(uid, c.pillowPose)
      if (cat.bedOnly && c.stackedOnUid != null && this.placedItems.find((p) => p.uid === c.stackedOnUid)) {
        this.stackItemOn(uid, c.stackedOnUid)
      }
      this.selectItem(uid)
    }, this._isWallMounted(c, cat) ? c.y : undefined)
    c.x += OFFSET
    c.z += OFFSET
  }

  selectItem(uid) {
    this._cancelStackPickIfActive()
    this.deselectFeature()
    this.deselectItem()
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    this.selected = item
    this.selectionHelper = new THREE.BoxHelper(item.mesh, item.locked ? LOCKED_SELECTION_COLOR : SELECTION_COLOR)
    this.itemsGroup.add(this.selectionHelper)
    if (this.showDimensionOverlay) this._buildDimensionOverlay()
    this._emitSelection()
  }

  // Toggles whether the item can be picked up by a mouse/touch drag (see the pointerdown handler
  // in _initInteraction — a locked item still selects normally on click, but the drag that would
  // otherwise follow orbits the camera instead of moving it). Deliberately doesn't block rotation,
  // stacking, or removal — those are explicit button actions a user chose, not the accidental
  // bump-it-with-the-mouse scenario locking exists for.
  toggleItemLock(uid) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    item.locked = !item.locked
    if (this.selected === item) {
      if (this.selectionHelper) this.selectionHelper.material.color.setHex(item.locked ? LOCKED_SELECTION_COLOR : SELECTION_COLOR)
      this._emitSelection()
    }
  }

  deselectItem() {
    this._cancelStackPickIfActive()
    this._removeDimensionOverlay()
    if (this.selectionHelper) {
      this.itemsGroup.remove(this.selectionHelper)
      this.selectionHelper = null
    }
    this.selected = null
    this.onSelectionChange(null)
  }

  // Called by App.jsx's 📏 Dimensions button (same toggle that already shows the text-panel
  // width/depth/height list) — flips the 3D on-model dimension-line overlay for whichever item is
  // currently selected. Persists across selections (this.showDimensionOverlay) so selectItem()
  // above knows to build the overlay fresh for a newly selected item too, though App.jsx always
  // resets it to false right after a new selection lands (matches the text panel's own reset), so
  // in practice it stays scoped to one item at a time.
  setShowDimensionOverlay(show) {
    this.showDimensionOverlay = show
    if (show && this.selected) this._buildDimensionOverlay()
    else this._removeDimensionOverlay()
  }

  // Three disconnected line segments (main line + a tick mark at each end, architectural-
  // dimension-line style) plus a billboarded text-sprite label per axis, positioned just outside
  // the selected item's live world-space bounding box (selectionHelper's own THREE.Box3) — width
  // offset out in front, depth offset out to the right, height at the far corner so none of the
  // three cross each other. Text/geometry are rebuilt from scratch on select; after that,
  // _updateDimensionOverlay (called every frame from _animate while this is non-null) repositions
  // everything and only redraws a label's canvas texture when its rounded value actually changes.
  _buildDimensionOverlay() {
    this._removeDimensionOverlay()
    if (!this.selected) return
    const group = new THREE.Group()
    const lineMat = new THREE.LineBasicMaterial({ color: 0x251d14, transparent: true, opacity: 0.85, depthTest: false })
    const widthLine = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat)
    const depthLine = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat)
    const heightLine = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat)
    const widthLabel = this._createDimLabel()
    const depthLabel = this._createDimLabel()
    const heightLabel = this._createDimLabel()
    group.renderOrder = 999
    group.add(widthLine, depthLine, heightLine, widthLabel, depthLabel, heightLabel)
    this.itemsGroup.add(group)
    this.dimensionOverlay = { group, widthLine, depthLine, heightLine, widthLabel, depthLabel, heightLabel }
    this._updateDimensionOverlay()
  }

  _removeDimensionOverlay() {
    if (!this.dimensionOverlay) return
    const { group, widthLine, depthLine, heightLine, widthLabel, depthLabel, heightLabel } = this.dimensionOverlay
    this.itemsGroup.remove(group)
    widthLine.geometry.dispose()
    depthLine.geometry.dispose()
    heightLine.geometry.dispose()
    widthLine.material.dispose() // one shared LineBasicMaterial across all 3 lines
    for (const label of [widthLabel, depthLabel, heightLabel]) {
      label.material.map.dispose()
      label.material.dispose()
    }
    this.dimensionOverlay = null
  }

  // App.jsx's Units selector — dimension-overlay labels redraw themselves automatically next
  // frame (see _updateDimensionOverlay, called every frame from _animate while the overlay
  // exists) since their text is recomputed from this.unitSystem each time; the measuring tool's
  // label isn't recomputed every frame (only when a point is placed), so it needs an explicit
  // nudge here to reflect a unit change on an already-completed measurement immediately.
  setUnitSystem(unit) {
    this.unitSystem = unit
    if (this.measureOverlay) this._updateMeasureOverlay()
  }

  // Small canvas-texture billboard (a THREE.Sprite always faces the camera regardless of the
  // item's own rotation, which is what keeps a rotated item's labels readable — see the
  // "rotated footprint" note on _updateDimensionOverlay below). Fixed canvas size — dimension
  // strings are always short ("3.9'") so there's no need to size the canvas to the text like
  // CatalogThumb-style renders do elsewhere.
  _createDimLabel() {
    const canvas = document.createElement('canvas')
    canvas.width = 220
    canvas.height = 84
    const ctx = canvas.getContext('2d')
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(0.9, 0.9 * (canvas.height / canvas.width), 1)
    sprite.renderOrder = 999
    sprite.userData = { ctx, canvas, lastText: null }
    return sprite
  }

  // No-op if the text hasn't changed since the last draw — during a drag, an item's dims don't
  // change (only its position does), so this only actually repaints a label's canvas on select,
  // after a 90° rotate swaps width/depth, or after a bed-height change, all of which naturally
  // fall out of comparing against the live box each frame rather than needing their own hooks.
  _setDimLabelText(sprite, text) {
    if (sprite.userData.lastText === text) return
    sprite.userData.lastText = text
    const { ctx, canvas } = sprite.userData
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(250,246,236,0.95)'
    ctx.strokeStyle = 'rgba(37,29,20,0.4)'
    ctx.lineWidth = 3
    ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8)
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)
    ctx.fillStyle = '#251d14'
    ctx.font = '600 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2)
    sprite.material.map.needsUpdate = true
  }

  _setLineSegmentPoints(lineSegments, flatCoords) {
    lineSegments.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flatCoords), 3))
    lineSegments.geometry.computeBoundingSphere()
  }

  // Recomputes the selected item's own live world-space Box3 (BoxHelper — used for
  // selectionHelper's outline — computes the same thing internally each update() but doesn't
  // expose it as a public property, so this does its own small setFromObject scan) rather than
  // reading the catalog item's declared dims — for a 90°-rotated item this world-axis-aligned box
  // already exactly matches its rotated footprint (width/depth simply swap which world axis they
  // occupy), so each line's length and each label's text end up correct with no need to read the
  // item's rotation directly.
  _updateDimensionOverlay() {
    if (!this.dimensionOverlay || !this.selected) return
    const box = new THREE.Box3().setFromObject(this.selected.mesh)
    if (box.isEmpty()) return
    const OFFSET = 0.3 // feet — how far outside the item's own footprint each line sits
    const TICK = 0.12 // feet — half-length of the perpendicular tick mark at each line's ends
    const { widthLine, depthLine, heightLine, widthLabel, depthLabel, heightLabel } = this.dimensionOverlay
    const { min, max } = box

    // Width — spans world X, offset out in front of the item (+Z beyond its front face).
    const wz = max.z + OFFSET
    this._setLineSegmentPoints(widthLine, [
      min.x, min.y, wz, max.x, min.y, wz,
      min.x, min.y - TICK, wz, min.x, min.y + TICK, wz,
      max.x, min.y - TICK, wz, max.x, min.y + TICK, wz,
    ])
    widthLabel.position.set((min.x + max.x) / 2, min.y, wz + 0.05)
    this._setDimLabelText(widthLabel, formatLength(max.x - min.x, this.unitSystem))

    // Depth — spans world Z, offset out to the right of the item (+X beyond its right face).
    const dx = max.x + OFFSET
    this._setLineSegmentPoints(depthLine, [
      dx, min.y, min.z, dx, min.y, max.z,
      dx - TICK, min.y, min.z, dx + TICK, min.y, min.z,
      dx - TICK, min.y, max.z, dx + TICK, min.y, max.z,
    ])
    depthLabel.position.set(dx + 0.05, min.y, (min.z + max.z) / 2)
    this._setDimLabelText(depthLabel, formatLength(max.z - min.z, this.unitSystem))

    // Height — vertical, at the far corner (beyond the right face and beyond the back face) so it
    // never crosses the width/depth lines above.
    const hx = max.x + OFFSET
    const hz = min.z - OFFSET
    this._setLineSegmentPoints(heightLine, [
      hx, min.y, hz, hx, max.y, hz,
      hx - TICK, min.y, hz, hx + TICK, min.y, hz,
      hx - TICK, max.y, hz, hx + TICK, max.y, hz,
    ])
    heightLabel.position.set(hx, (min.y + max.y) / 2, hz)
    this._setDimLabelText(heightLabel, formatLength(max.y - min.y, this.unitSystem))
  }

  // App.jsx's Measure button — independent of item selection, see the pointerdown/endPointer
  // handlers above for how a plain click (not a drag) turns into a call to _placeMeasurePoint.
  // Always starts from a clean slate, both entering and leaving the mode, so a stale marker/line
  // from a previous session of measuring never lingers into the next one.
  setMeasureMode(active) {
    this.measureMode = active
    this.measurePoints = []
    this._removeMeasureOverlay()
    if (active) {
      this.deselectItem()
      this.deselectFeature()
    }
    this._emitMeasure()
  }

  clearMeasurement() {
    this.measurePoints = []
    this._removeMeasureOverlay()
    this._emitMeasure()
  }

  // Raycasts against placed items first so clicking directly on a piece of furniture measures
  // to that exact surface point (its real height, not the floor beneath it) — falls back to the
  // floor plane for anywhere else, via the same _intersectFloorPlane getFloorPoint() (in
  // _initInteraction) uses for item dragging. A 3rd click starts a fresh pair rather than
  // accumulating a 3rd point.
  _placeMeasurePoint(clientX, clientY) {
    const el = this.renderer.domElement
    const rect = el.getBoundingClientRect()
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const itemMeshes = this._raycastableItemMeshes()
    const hits = this.raycaster.intersectObjects(itemMeshes, true)
    let point
    if (hits.length) {
      point = hits[0].point.clone()
    } else {
      point = this._intersectFloorPlane()
      if (!point) return
    }
    if (this.measurePoints.length >= 2) this.measurePoints = []
    this.measurePoints.push(point)
    this._updateMeasureOverlay()
    this._emitMeasure()
  }

  _updateMeasureOverlay() {
    this._removeMeasureOverlay()
    if (this.measurePoints.length === 0) return
    const group = new THREE.Group()
    group.renderOrder = 999

    const markerGeom = new THREE.SphereGeometry(0.06, 12, 12)
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xc1502e, depthTest: false })
    for (const p of this.measurePoints) {
      const marker = new THREE.Mesh(markerGeom, markerMat)
      marker.position.copy(p)
      marker.renderOrder = 999
      group.add(marker)
    }

    if (this.measurePoints.length === 2) {
      const [a, b] = this.measurePoints
      const lineMat = new THREE.LineDashedMaterial({ color: 0xc1502e, dashSize: 0.15, gapSize: 0.1, depthTest: false })
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b])
      const line = new THREE.Line(geometry, lineMat)
      line.computeLineDistances()
      line.renderOrder = 999
      group.add(line)

      const label = this._createDimLabel()
      const mid = a.clone().add(b).multiplyScalar(0.5)
      mid.y += 0.15 // lifted slightly so it doesn't clip into the floor/line it's sitting on
      label.position.copy(mid)
      this._setDimLabelText(label, formatLength(a.distanceTo(b), this.unitSystem))
      group.add(label)
    }

    this.itemsGroup.add(group)
    this.measureOverlay = group
  }

  _removeMeasureOverlay() {
    if (!this.measureOverlay) return
    this.measureOverlay.traverse((obj) => {
      obj.geometry?.dispose()
      if (obj.material) {
        obj.material.map?.dispose() // no-op for the marker/line materials, which have no map
        obj.material.dispose()
      }
    })
    this.itemsGroup.remove(this.measureOverlay)
    this.measureOverlay = null
  }

  _emitMeasure() {
    const distanceFt = this.measurePoints.length === 2 ? this.measurePoints[0].distanceTo(this.measurePoints[1]) : null
    this.onMeasureChange({ active: this.measureMode, pointCount: this.measurePoints.length, distanceFt })
  }

  // Collision detection — whole-item tinting (not per-triangle highlighting; true exact-geometry
  // intersection would need real CSG boolean ops for precision most users won't distinguish from
  // this), but "whole-item" no longer means testing one bounding box per item end to end. Testing
  // each item's individual sub-meshes against each other means two items only count as touching if
  // some actual piece of one is inside some actual piece of the other. In practice this alone
  // doesn't get a chair genuinely "under" a desk, or a bin genuinely "under" a bed: every model in
  // public/models/ came out of Blender as one merged mesh per item (headboard+rails+legs, or
  // desktop+legs, all one blob), so there's no separate "legs only" sub-mesh to test against —
  // _collectLeafBoxes below still gets back one box spanning the item's full footprint and full
  // height, same as no decomposition happened at all. Two targeted, data-driven exceptions cover
  // the two real cases users hit:
  //  - Beds (cat.bedHeights present): the mattress/slat's current height level *is* the real
  //    clearance a real bed offers underneath it, and it's already tracked per placed item
  //    (bedHeightLevel) — see the clearance crop in _collectLeafBoxes. An item shorter than that
  //    clearance no longer touches the bed's box at all; a too-tall item still pokes into the
  //    cropped box and still turns red, which is the actual "too big to fit" case.
  //  - Desks (cat.hasLegroom) vs. chairs (cat.isChair): a chair tucked under a desk is a normal,
  //    wanted layout, not a fit problem — its backrest is routinely taller than the desk itself,
  //    so no height crop could ever make that pair stop registering as touching. These pairs are
  //    exempted outright in _updateCollisions rather than modeled geometrically.
  // True if `item` sits somewhere in `maybeAncestor`'s stack (its direct base, or its base's base,
  // and so on) — used by _updateCollisions below to exempt an entire stacking chain, not just
  // adjacent pairs, from the collision tint.
  _isStackedRelative(item, maybeAncestor) {
    let cur = item
    while (cur && cur.stackedOnUid != null) {
      if (cur.stackedOnUid === maybeAncestor.uid) return true
      cur = this.placedItems.find((p) => p.uid === cur.stackedOnUid)
    }
    return false
  }

  // A cheap whole-object broad-phase check still runs first so the per-submesh narrow phase only
  // runs for pairs that are anywhere near each other at all — see the Your Room testing note on
  // checking this stays smooth with 10+ items placed.
  _updateCollisions() {
    const items = this.placedItems
    const n = items.length
    const cats = items.map((p) => ALL_ITEMS.find((c) => c.id === p.catalogId))
    const wholeBoxes = items.map((p) => new THREE.Box3().setFromObject(p.mesh))
    const colliding = new Array(n).fill(false)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // A stacked item resting on its base (e.g. a pillow on a bed) touches it by design —
        // Box3.intersectsBox() counts touching boundaries as intersecting, so without this
        // exclusion every legitimately stacked pair would permanently show as "doesn't fit." Walks
        // the whole ancestor chain, not just the immediate parent — a multi-layer bedding stack
        // (bed → topper → pillow, say — see catalog.js's bedOnly/matchBaseFootprint) means a
        // pillow's *direct* base is the topper, but it still isn't "colliding" with the bed two
        // levels down; only checking direct parents left every non-adjacent pair in a stack
        // falsely tinted red.
        if (this._isStackedRelative(items[i], items[j]) || this._isStackedRelative(items[j], items[i])) continue
        // A comforter dressing a bed (see _applyBedDressing) sits exactly on top of that bed's own
        // hidden frame — same footprint, same spot, by design — so without this exclusion the two
        // would permanently read as "colliding" with each other. Box3.setFromObject doesn't skip
        // invisible objects, so the bed's own hidden mesh still contributes a real bounding box here
        // even though nothing is actually rendered there.
        if (items[i].dressesBedUid === items[j].uid || items[j].dressesBedUid === items[i].uid) continue
        // A desk chair slid in under a desk — see the note above on why height clearance can't
        // model this pair, so it's exempted outright instead.
        if ((cats[i]?.isChair && cats[j]?.hasLegroom) || (cats[j]?.isChair && cats[i]?.hasLegroom)) continue
        if (!wholeBoxes[i].intersectsBox(wholeBoxes[j])) continue
        if (this._piecesTouch(items[i], items[j], cats[i], cats[j])) {
          colliding[i] = true
          colliding[j] = true
        }
      }
    }
    for (let i = 0; i < n; i++) this._setCollisionTint(items[i], colliding[i])

    // Doors/windows vs. floor items — every wall feature is tested, not just doors: a window only
    // ever actually collides with something tall enough to reach its sill height (a wardrobe
    // blocking it, say), which is correct physically-grounded behavior rather than a deliberate
    // "windows never collide" rule. A door, sitting right at floor level, is the case that matters
    // in practice — furniture genuinely can block a doorway.
    this.wallFeatures.forEach((feature) => {
      const featureBox = this._featureCollisionBox(feature)
      const hit = items.some((item, i) => {
        if (!featureBox.intersectsBox(wholeBoxes[i])) return false
        return this._collectLeafBoxes(item, cats[i]).some((b) => featureBox.intersectsBox(b))
      })
      this._setFeatureCollisionTint(feature, hit)
    })
  }

  // Figures out which wall is currently "in front of" the camera — the one an orbit would have to
  // pass through to see the room from outside — and fades just that wall's material down to
  // WALL_OPACITY_NEAR so it stops visually blocking (and stops fielding accidental clicks meant
  // for) whatever's mounted on the wall(s) behind it. Every other wall stays at the normal
  // opacity. The room is always centered at world (0,0), so "toward the camera" in the floor
  // plane is just the camera's own XZ position, normalized — no need to go through camState.target
  // (panning moves the orbit target, but the walls themselves never move off-center).
  _updateNearWall() {
    if (!this.wallMeshes || this.wallMeshes.length === 0) return
    const camX = this.camera.position.x
    const camZ = this.camera.position.z
    const len = Math.hypot(camX, camZ) || 1
    const dirX = camX / len
    const dirZ = camZ / len
    let best = null
    let bestDot = -Infinity
    for (const entry of this.wallMeshes) {
      // entry.normal points INTO the room; the wall facing the camera is the one whose outward
      // face — the negation of that — points most toward the camera.
      const dot = -entry.normal.x * dirX - entry.normal.z * dirZ
      if (dot > bestDot) {
        bestDot = dot
        best = entry
      }
    }
    if (best !== this.nearWallEntry) {
      if (this.nearWallEntry) this._setWallNear(this.nearWallEntry, false)
      this.nearWallEntry = best
    }
    if (best) this._setWallNear(best, true)
  }

  // A wall is opaque (transparent: false) by default so it renders solid without the depth-sort
  // quirks transparent materials can bring; only the one wall nearest the camera switches into
  // transparent mode so it can fade almost to nothing. Applies to both the wall and its baseboard
  // trim so the two fade together instead of the trim floating visible after the wall vanishes.
  _setWallNear(entry, near) {
    for (const mat of [entry.mesh.material, entry.trimMesh.material]) {
      mat.transparent = near
      mat.opacity = near ? WALL_OPACITY_NEAR : WALL_OPACITY_NORMAL
    }
  }

  // A feature (door/window) has no reliable solid mesh to test against — _buildFeatureMesh draws
  // both as flat, zero-depth panels overlaid on the wall (no real geometric volume for
  // _collectLeafBoxes's mesh traversal to find). Its collidable volume is computed directly from
  // its own known width/height instead, positioned
  // and oriented exactly like its visual mesh (feature.mesh's own matrixWorld already has the
  // right wall position + rotation from _repositionFeature) — a thin box standing in for "the
  // door/window opening," since that's the actual physical thing furniture can't block.
  _featureCollisionBox(feature) {
    const halfW = feature.width / 2
    const halfH = feature.height / 2
    const halfD = FEATURE_COLLISION_DEPTH / 2
    const box = new THREE.Box3(new THREE.Vector3(-halfW, -halfH, -halfD), new THREE.Vector3(halfW, halfH, halfD))
    feature.mesh.updateMatrixWorld()
    return box.applyMatrix4(feature.mesh.matrixWorld)
  }

  // Mirrors _setCollisionTint, but not every feature material is a MeshStandardMaterial with an
  // emissive channel the way an item's are — the door's casing/leaf/handle and the window's pane
  // are, but a window's own frame/mullion lines are plain LineBasicMaterial line art. Those only
  // have a plain .color to work with, so this remembers each material's real color the first time
  // (in userData, since unlike emissive there's no separate
  // "off" channel to reset to) and swaps between that and collision red instead.
  _setFeatureCollisionTint(feature, on) {
    if (feature._collisionTinted === on) return
    feature._collisionTinted = on
    feature.mesh.traverse((o) => {
      if (!o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => {
        if (m.emissive) {
          m.emissive.setHex(on ? 0xd93a2b : 0x000000)
          m.emissiveIntensity = on ? 0.6 : 0
        } else if (m.color) {
          if (m.userData._origColorHex == null) m.userData._origColorHex = m.color.getHex()
          m.color.setHex(on ? 0xd93a2b : m.userData._origColorHex)
        }
      })
    })
  }

  // True if any actual mesh piece of `itemA` intersects any actual mesh piece of `itemB` — see
  // _updateCollisions above for why this is per-submesh rather than one box per item. Uses
  // _boxesOverlap rather than Box3.intersectsBox so two pieces merely flush against each other
  // (zero gap) don't count — see COLLISION_EPSILON.
  _piecesTouch(itemA, itemB, catA, catB) {
    const boxesA = this._collectLeafBoxes(itemA, catA)
    const boxesB = this._collectLeafBoxes(itemB, catB)
    for (const a of boxesA) {
      for (const b of boxesB) {
        if (this._boxesOverlap(a, b)) return true
      }
    }
    return false
  }

  // Like Box3.intersectsBox, but requires actual penetration on every axis rather than counting
  // merely-touching boundaries — see COLLISION_EPSILON.
  _boxesOverlap(a, b) {
    return (
      a.min.x < b.max.x - COLLISION_EPSILON &&
      a.max.x > b.min.x + COLLISION_EPSILON &&
      a.min.y < b.max.y - COLLISION_EPSILON &&
      a.max.y > b.min.y + COLLISION_EPSILON &&
      a.min.z < b.max.z - COLLISION_EPSILON &&
      a.max.z > b.min.z + COLLISION_EPSILON
    )
  }

  // One Box3 per actual mesh in the hierarchy (skips the black EdgesGeometry outline helper added
  // in _buildBoxMesh/_buildPosterMesh/etc. — it's a LineSegments, not a Mesh, so o.isMesh already
  // excludes it with no special-casing needed). For a bed (cat.bedHeights present), each box's
  // bottom is cropped up to the bed's current under-mattress clearance — see _updateCollisions —
  // so a box that was entirely below that clearance disappears rather than staying a zero-height
  // sliver right at the crop line (which would still register as "touching" the floor-level parts
  // of whatever's placed underneath).
  _collectLeafBoxes(item, cat) {
    const boxes = []
    const clearance = cat?.bedHeights ? cat.bedHeights[item.bedHeightLevel || 'standard'] : 0
    const clearanceY = item.mesh.position.y + clearance
    item.mesh.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      const b = new THREE.Box3().setFromObject(o)
      if (clearance > 0) {
        if (b.min.y >= clearanceY) { boxes.push(b); return }
        if (b.max.y <= clearanceY) return
        b.min.y = clearanceY
      }
      boxes.push(b)
    })
    return boxes
  }

  // Emissive rather than swapping each material's own .color — tints every mesh red without
  // needing to remember and restore each one's real color once the collision clears. Guards on
  // the item's own last-applied state so an unchanged item's materials aren't re-walked every
  // single frame — only items whose collision status actually flipped this frame pay for the
  // traversal.
  _setCollisionTint(item, on) {
    if (item._collisionTinted === on) return
    item._collisionTinted = on
    item.mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => {
        if (!m.emissive) return
        m.emissive.setHex(on ? 0xd93a2b : 0x000000)
        m.emissiveIntensity = on ? 0.6 : 0
      })
    })
  }

  // Re-reports the selected item's current state to React — needed after selecting it fresh, and
  // again after stackItemOn()/unstackItem() mutate an already-selected item's stackedOnUid, so the
  // selection panel's "Put on top of…" / "Place on floor" button stays in sync with reality.
  _emitSelection() {
    if (!this.selected) {
      this.onSelectionChange(null)
      return
    }
    const cat = ALL_ITEMS.find((c) => c.id === this.selected.catalogId)
    this.onSelectionChange({
      uid: this.selected.uid,
      cat,
      stackedOnUid: this.selected.stackedOnUid,
      bedHeightLevel: this.selected.bedHeightLevel,
      locked: this.selected.locked,
      wallMounted: this.selected.wallMounted,
      colorHex: this.selected.colorHex,
      pillowPose: this.selected.pillowPose,
    })
  }

  // ---------- Stacking one item on top of another (e.g. a TV on a table) ----------
  // Deliberately not drag-based — the engine's drag model is floor-plane only (no vertical axis),
  // so "drag it up onto the table" would need real collision/surface detection to work reliably.
  // A two-step pick flow (click "Put on top of…", then click the target item in the 3D view) is
  // much simpler to get right and was explicitly offered as an acceptable alternative. Single-
  // level only — an item that already has something stacked on it can't itself become a target,
  // avoiding the complexity (and physically dubious result) of towers three items tall.
  startStackPick(uid) {
    if (!this.placedItems.find((p) => p.uid === uid)) return
    this.stackPickSourceUid = uid
    this.onStackPickModeChange(uid)
  }

  cancelStackPick() {
    this._cancelStackPickIfActive()
  }

  _cancelStackPickIfActive() {
    if (this.stackPickSourceUid != null) {
      this.stackPickSourceUid = null
      this.onStackPickModeChange(null)
    }
  }

  // What Y an item sitting on top of `placedItem` should rest at. Normally that's just the top of
  // its own bounding box (dims[2]) — but a bed with bedHeights (see catalog.js) has its real
  // sleeping surface well below the top of its frame/headboard, at whichever peg the mattress is
  // currently sliding on, so stacking directly onto a bed (e.g. a mattress topper on top of the
  // fused mattress) lands on top of the actual mattress instead of floating at headboard height or
  // clipping into it.
  //
  // STACK_SINK pulls that resting Y down by a hair before returning it — every piece of bedding
  // (topper, comforter, pillows) is a soft/rounded model, not a flat-bottomed box, so floor-
  // aligning to its single lowest vertex (see fitModelToDims in modelFit.js) leaves the rest of its
  // underside — anywhere the model curves or rounds off before that one lowest point — hovering
  // just above the surface it's supposedly resting on, a visible sliver of daylight at the edges
  // even though the numbers say "flush." Letting it sink slightly into its base instead closes that
  // sliver; it's safe to overlap because a stacked item and its own base are already exempted from
  // the red collision tint at any overlap depth (see _isStackedRelative in _updateCollisions).
  _topSurfaceY(placedItem) {
    const cat = ALL_ITEMS.find((c) => c.id === placedItem.catalogId)
    if (cat && cat.bedHeights) {
      const level = placedItem.bedHeightLevel || 'standard'
      const movable = placedItem.mesh.userData.movableObjs || []
      // The topmost movable piece's own top (stackOffset + its thickness) — e.g. the mattress
      // fused on top of the slat, not the slat itself — regardless of how many pieces are stacked.
      const topOffset = movable.reduce((max, m) => Math.max(max, m.stackOffset + m.thickness), 0)
      return placedItem.mesh.position.y + cat.bedHeights[level] + topOffset - STACK_SINK
    }
    // Every bed (colgate-bed, bed-full, bed-bunk) is one fused frame+mattress mesh now, with no
    // separate mattress piece left to derive a resting surface from — mattressTopY (see catalog.js)
    // is the fixed local Y its own baked-in mattress surface sits at, measured once per bed model,
    // so stacking lands on the actual sleep surface instead of the top of the whole frame (which,
    // for a bunk, would be the top bunk's headboard).
    if (cat && cat.mattressTopY != null) return placedItem.mesh.position.y + cat.mattressTopY - STACK_SINK
    return placedItem.mesh.position.y + placedItem.mesh.userData.dims[2] - STACK_SINK
  }

  // Stacking is arbitrary-depth (a topper, then a pillow can layer onto one bed frame via repeated
  // "Put on top of…") rather than a single-level cap — the Y math already generalizes (targetTopY
  // is computed off whatever's currently on top of the target), so the only real addition is the
  // cycle guard below. Sheets and the comforter/throw blanket don't go through this anymore — see
  // applyMattressColor/_applyBedDressing.
  stackItemOn(sourceUid, targetUid) {
    if (sourceUid === targetUid) return
    const source = this.placedItems.find((p) => p.uid === sourceUid)
    let target = this.placedItems.find((p) => p.uid === targetUid)
    if (!source || !target) return
    // Refuse to stack an item onto one of its own descendants (would create a cycle).
    let ancestor = target
    while (ancestor) {
      if (ancestor.uid === sourceUid) return
      ancestor = ancestor.stackedOnUid != null ? this.placedItems.find((p) => p.uid === ancestor.stackedOnUid) : null
    }
    const sourceCat = ALL_ITEMS.find((c) => c.id === source.catalogId)
    // bedOnly bedding (see catalog.js) is authored independent of any specific bed's rotation —
    // align it to whatever the bed underneath is actually facing instead of always landing at 0°.
    if (sourceCat && sourceCat.bedOnly) source.mesh.rotation.y = target.mesh.rotation.y
    // matchBaseFootprint (the mattress topper) always resizes to the exact surface it's currently
    // resting on — the bed's real mattressDims if stacked directly on a bed, or whatever the base's
    // own current footprint is otherwise.
    if (sourceCat && sourceCat.matchBaseFootprint) {
      const targetCat = ALL_ITEMS.find((c) => c.id === target.catalogId)
      const surfaceDims = (targetCat && targetCat.mattressDims) || target.mesh.userData.dims
      this._refitFootprint(source, sourceCat, surfaceDims)
    }
    source.mesh.position.y = this._topSurfaceY(target)
    source.mesh.position.x = target.mesh.position.x
    source.mesh.position.z = target.mesh.position.z
    source.stackedOnUid = target.uid
    if (this.selected && this.selected.uid === sourceUid) this._emitSelection()
  }

  // Repositions everything directly stacked on uid to sit at its current top surface (and
  // recurses so a whole multi-layer bedding stack rides along together) — used after something
  // moves the base item's effective top without a drag (bed height changes, loading a save).
  _restackAbove(uid) {
    const parent = this.placedItems.find((p) => p.uid === uid)
    if (!parent) return
    const topY = this._topSurfaceY(parent)
    this.placedItems.filter((p) => p.stackedOnUid === uid).forEach((child) => {
      child.mesh.position.y = topY
      child.mesh.position.x = parent.mesh.position.x
      child.mesh.position.z = parent.mesh.position.z
      this._restackAbove(child.uid)
    })
  }

  // Picks the item back up off whatever it was resting on and sets it back down on the floor at
  // its current x/z — the inverse of stackItemOn(). The only way an item comes back down; simply
  // dragging it around while stacked keeps it up there (see the pointermove handler below).
  // Anything stacked on top of it rides back down too, via _restackAbove.
  unstackItem(uid) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item || item.stackedOnUid == null) return
    item.mesh.position.y = 0
    item.stackedOnUid = null
    this._restackAbove(uid)
    if (this.selected && this.selected.uid === uid) this._emitSelection()
  }

  // Bed height presets (Low/Standard/Lofted) — see catalog.js's bedHeights. Moves only the bed's
  // movable pieces (group.userData.movableObjs, set up in _loadItemMesh from extraModels'
  // movesWithHeight entries — the slat base and the mattress fused on top of it) to a different
  // peg, each keeping its own stackOffset above that peg so the mattress stays sitting on the
  // slat rather than the two overlapping. The headboard/footboard (the primary model) never
  // moves, matching how a real adjustable frame works: you slide the slats/mattress to a higher
  // peg, the posts stay grounded. Cascades the change to anything resting on top of the mattress
  // (a topper, say) via _restackAbove, which reads the new position straight back out through
  // _topSurfaceY.
  setBedHeight(uid, level) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    const cat = ALL_ITEMS.find((c) => c.id === item.catalogId)
    if (!cat || !cat.bedHeights || cat.bedHeights[level] == null) return
    item.bedHeightLevel = level
    ;(item.mesh.userData.movableObjs || []).forEach((m) => { m.obj.position.y = cat.bedHeights[level] + m.stackOffset })
    this._restackAbove(uid)
    if (this.selected && this.selected.uid === uid) this._emitSelection()
  }

  // Pillow pose presets (flat/diagonal/upright — see catalog.js's hasPoseOptions and POSE_ANGLES
  // near the top of this file). Rotates the pivot set up in _loadItemMesh around local X, then
  // lifts it so the model's bottom stays flush with whatever surface it's resting on at any angle
  // — a box approximation (half-height/half-depth swept by the rotation) rather than a true mesh-
  // specific bound, close enough for a pillow-shaped model and avoids re-measuring the loaded
  // geometry on every pose change.
  _applyPose(group, cat, pose) {
    const pivot = group.userData.posePivot
    if (!pivot) return
    // poseFlip (see catalog.js — pillowBest.glb needs it, throwPillow.glb doesn't) mirrors the
    // lean/stand direction for a model whose own "front" faces the opposite local way, so the same
    // diagonal/upright angles still tip it the correct direction instead of the wrong one.
    const angle = (POSE_ANGLES[pose] ?? 0) * (cat.poseFlip ? -1 : 1)
    const [, d, h] = cat.dims
    pivot.rotation.x = angle
    pivot.position.y = (h / 2) * Math.abs(Math.cos(angle)) + (d / 2) * Math.abs(Math.sin(angle))
  }

  setItemPose(uid, pose) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    const cat = ALL_ITEMS.find((c) => c.id === item.catalogId)
    if (!cat || !cat.hasPoseOptions || POSE_ANGLES[pose] === undefined) return
    this._applyPose(item.mesh, cat, pose)
    item.pillowPose = pose
    if (this.selected && this.selected.uid === uid) this._emitSelection()
  }

  // Per-instance color override (comforter/pillows/sheets/throw blanket — see catalog.js's
  // colorable) — tintModel's traverse works generically whether the target is a glTF Group
  // (primaryModel) or a bare placeholder Mesh (sheet-set has no model), so one code path covers
  // every colorable item.
  setItemColor(uid, hex) {
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    const cat = ALL_ITEMS.find((c) => c.id === item.catalogId)
    if (!cat || !cat.colorable) return
    this._tintModel(item.mesh.userData.primaryModel || item.mesh, hex)
    item.colorHex = hex
    if (this.selected && this.selected.uid === uid) this._emitSelection()
  }

  // A pillowcase (see catalog.js's recolorsPillows) isn't a placeable object of its own — it's a
  // covering for whatever pillow(s) are already in the room — so clicking it re-tints every placed
  // pillow (hasPoseOptions is the "this is a pillow" signal — both bed-pillow and decorative-pillow
  // carry it, nothing else does) to this color instead of adding a new item. Reports what happened
  // via onNotice (same transient-toast mechanism _findBedForAutoPlacement below uses for "no bed in
  // the room yet") since otherwise nothing visibly gets added to the room for the user to react to.
  applyPillowcaseColor(hex) {
    const pillows = this.placedItems.filter((p) => {
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      return cat && cat.hasPoseOptions && cat.colorable
    })
    if (pillows.length === 0) {
      this.onNotice('Add a pillow to the room first.')
      return
    }
    pillows.forEach((p) => this.setItemColor(p.uid, hex))
    this.onNotice(`Updated ${pillows.length} pillow${pillows.length === 1 ? '' : 's'} in your room.`)
  }

  // Sheets (see catalog.js's recolorsMattress) have no placeable model either — real fitted sheets
  // are invisible under whatever's covering the mattress anyway, so clicking a sheet-set tier
  // (after the "what color?" prompt in App.jsx) re-tints every placed bed's actual mattress instead
  // of adding an item. Every current bed model (colgate-bed/bed-full/bed-bunk — see catalog.js's
  // note above BEDDING_COLOR_SWATCHES) fuses its frame and mattress into one mesh with no separate
  // mattress piece to isolate (mattressModels, populated from any isMattress-flagged extraModels
  // entry, comes back empty for all three), so this falls back to re-tinting the whole bed model —
  // the closest real approximation once frame and mattress are the same surface. Also clears any
  // placed mattress topper: a topper sits between the mattress and a fitted sheet in real life, so
  // leaving one in place would hide the recolor completely, matching Tyler's "topper should leave
  // the screen" requirement.
  applyMattressColor(hex) {
    const beds = this.placedItems.filter((p) => {
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      return cat && cat.isBed
    })
    if (beds.length === 0) {
      this.onNotice('Add a bed to the room first.')
      return
    }
    let mattressCount = 0
    beds.forEach((bed) => {
      const mattressModels = bed.mesh.userData.mattressModels || []
      if (mattressModels.length) {
        mattressModels.forEach((model) => this._tintModel(model, hex))
      } else {
        this._tintModel(bed.mesh.userData.primaryModel || bed.mesh, hex)
      }
      mattressCount += 1
    })
    const toppers = this.placedItems.filter((p) => {
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      return cat && cat.groupId === 'mattress-topper'
    })
    toppers.forEach((t) => this.removeItem(t.uid))
    const message = `Updated ${mattressCount} bed${mattressCount === 1 ? '' : 's'}`
    this.onNotice(toppers.length ? `${message} and removed the topper.` : `${message}.`)
  }

  _emitCart() {
    const items = this.placedItems.map((p) => ({
      uid: p.uid,
      catalogId: p.catalogId,
      cat: ALL_ITEMS.find((c) => c.id === p.catalogId),
    }))
    this.onCartChange(items)
  }

  getState() {
    // stackedOnIndex records *array position*, not uid — uids are freshly re-minted every time a
    // layout loads (see loadState below), so a raw uid saved now wouldn't mean anything on the
    // next load. Position within this same items array is stable across a save/load round trip.
    return {
      room: { ...this.room },
      items: this.placedItems.map((p) => {
        const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
        return {
          catalogId: p.catalogId,
          x: p.mesh.position.x,
          // Only a wall item's height is ever freely chosen (see _snapToWallHit) — every other
          // item's y is always re-derived deterministically from its own dims/stacking on load,
          // so saving it for those would just be redundant, unused data. For a cat.canWallMount
          // item currently wall-mounted (the TV — see setWallMounted/_isWallMounted), saving y
          // here is also what tells addItemAt/loadState to bring it back wall-mounted instead of
          // on the floor; no separate wallMounted field needed in the saved shape.
          y: this._isWallMounted(p, cat) ? p.mesh.position.y : undefined,
          z: p.mesh.position.z,
          rotY: p.mesh.rotation.y,
          stackedOnIndex: p.stackedOnUid == null ? null : this.placedItems.findIndex((q) => q.uid === p.stackedOnUid),
          // Same array-position convention as stackedOnIndex, for the bed/comforter dressing link
          // (see _applyBedDressing) — uids get re-minted on load, so an index into this same
          // save's own items array is what actually survives the round trip.
          dressesBedIndex: p.dressesBedUid == null ? null : this.placedItems.findIndex((q) => q.uid === p.dressesBedUid),
          bedHeightLevel: p.bedHeightLevel,
          locked: p.locked,
          colorHex: p.colorHex,
          pillowPose: p.pillowPose,
        }
      }),
      features: this.wallFeatures.map((f) => ({
        type: f.type,
        wall: f.wall,
        offset: f.offset,
        width: f.width,
        height: f.height,
        locked: f.locked,
      })),
    }
  }

  // A snapshot of the current 3D view for the Browse tab's layout thumbnails, downscaled to
  // maxDim on the long edge. Deselects first so the orange selection outline doesn't end up
  // baked into the saved image. Renders synchronously right before reading the canvas — the
  // renderer doesn't use preserveDrawingBuffer (it costs GPU perf we don't otherwise need), so
  // toDataURL has to be called immediately after a render in the same tick, before the browser
  // clears the drawing buffer for the next frame.
  //
  // The renderer is alpha:true with no scene.background — normally the warm CSS gradient behind
  // the canvas shows through the transparent parts (above/around the room). JPEG has no alpha
  // channel, so without a background color those transparent pixels export as solid black. Set
  // one just for this render, then restore null so live rendering is unaffected.
  captureSnapshot(maxDim = 480) {
    const hadSelection = !!this.selected
    if (hadSelection) this.deselectItem()
    const hadFeatureSelection = !!this.selectedFeature
    if (hadFeatureSelection) this.deselectFeature()
    this.scene.background = new THREE.Color(0xf7f3ec)
    this.renderer.render(this.scene, this.camera)
    this.scene.background = null
    const source = this.renderer.domElement
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height))
    let dataUrl
    if (scale === 1) {
      dataUrl = source.toDataURL('image/jpeg', 0.85)
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(source.width * scale)
      canvas.height = Math.round(source.height * scale)
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
      dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    }
    return dataUrl
  }

  loadState(data) {
    this.clearAll()
    this.room = { ...data.room }
    this.buildRoom()
    // Each item's glTF model loads async, and several load in parallel — the order they finish
    // and get a uid assigned in has nothing to do with their order in data.items. uidsByIndex
    // tracks "data.items[i] became placedItems uid ___" so stacking (recorded by array position
    // at save time — see getState() above) can be resolved once every item has actually landed,
    // regardless of load order.
    const uidsByIndex = new Array(data.items.length)
    let remaining = data.items.length
    if (remaining === 0) {
      this._emitCart()
    } else {
      data.items.forEach((it, i) => {
        // A catalogId from an older save can point at an item that's since been retired (e.g. a
        // discontinued placeholder) — addItemAt silently no-ops for an unknown id without ever
        // calling onRegistered, which would otherwise stall `remaining` forever and break
        // stacking resolution for the *whole* layout, not just the missing item. Resolve
        // synchronously here instead so a retired item is just skipped.
        if (!ALL_ITEMS.find((c) => c.id === it.catalogId)) {
          uidsByIndex[i] = null
          remaining -= 1
          if (remaining === 0) this._resolveLoadedStacking(data.items, uidsByIndex)
          return
        }
        this.addItemAt(it.catalogId, it.x, it.z, it.rotY, (uid) => {
          uidsByIndex[i] = uid
          // Only bother repositioning when it differs from the freshly-registered default
          // ('standard') — this also runs setBedHeight's cascade to anything already stacked on
          // it, though nothing will be yet; _resolveLoadedStacking below re-stacks using
          // _topSurfaceY, which already reads the level set here.
          if (it.bedHeightLevel && it.bedHeightLevel !== 'standard') this.setBedHeight(uid, it.bedHeightLevel)
          if (it.locked) {
            const placed = this.placedItems.find((p) => p.uid === uid)
            if (placed) placed.locked = true
          }
          if (it.colorHex != null) this.setItemColor(uid, it.colorHex)
          if (it.pillowPose && it.pillowPose !== 'flat') this.setItemPose(uid, it.pillowPose)
          remaining -= 1
          if (remaining === 0) this._resolveLoadedStacking(data.items, uidsByIndex)
        }, it.y)
      })
    }
    ;(data.features || []).forEach((f) => {
      const id = this.addFeatureAt(f.type, f.wall, f.offset, f.width, f.height)
      if (f.locked) {
        const feature = this.wallFeatures.find((wf) => wf.id === id)
        if (feature) feature.locked = true
      }
    })
  }

  _resolveLoadedStacking(savedItems, uidsByIndex) {
    savedItems.forEach((it, i) => {
      if (it.stackedOnIndex == null) return
      const childUid = uidsByIndex[i]
      const parentUid = uidsByIndex[it.stackedOnIndex]
      // A referenced parent item can be missing if its own model failed to load entirely (the
      // box-placeholder fallback still registers, so this is a defensive check, not an expected
      // path) — skip rather than throw, leaving that one item resting on the floor instead.
      if (childUid == null || parentUid == null) return
      this.stackItemOn(childUid, parentUid)
    })
    // Re-link a saved comforter/bed dressing pair (see _applyBedDressing) and hide the bed frame
    // instantly — no fade here, this is a load, not a live interaction the user should watch happen.
    savedItems.forEach((it, i) => {
      if (it.dressesBedIndex == null) return
      const dressing = this.placedItems.find((p) => p.uid === uidsByIndex[i])
      const bed = this.placedItems.find((p) => p.uid === uidsByIndex[it.dressesBedIndex])
      if (!dressing || !bed) return
      dressing.dressesBedUid = bed.uid
      bed.dressingUid = dressing.uid
      bed.mesh.visible = false
    })
    this._emitCart()
  }

  // ---------- Wall features (doors & windows) ----------
  // Rendered as flat panels overlaid on the wall — a translucent light-blue rectangle for
  // windows, a solid door leaf with a gray casing for doors — rather than actually cutting
  // geometry out of the wall mesh (real CSG boolean subtraction would be a lot of complexity for
  // not much visual payoff here). "wall" is one of 'back'/'front'/'left'/'right';
  // "offset" is the distance in feet from that wall's start corner to the feature's center,
  // along the wall's length (back/front measured along x from x=-w/2; left/right along z from
  // z=-l/2) — see _wallConfig.
  _wallConfig(wall) {
    const { w, l } = this.room
    const inset = 0.02 // nudges the panel just off the wall plane, toward the room, to avoid z-fighting
    switch (wall) {
      case 'back':
        return { length: w, rotY: 0, pos: (offset) => [-w / 2 + offset, -l / 2 + inset] }
      case 'front':
        return { length: w, rotY: 0, pos: (offset) => [-w / 2 + offset, l / 2 - inset] }
      case 'left':
        return { length: l, rotY: Math.PI / 2, pos: (offset) => [-w / 2 + inset, -l / 2 + offset] }
      case 'right':
        return { length: l, rotY: Math.PI / 2, pos: (offset) => [w / 2 - inset, -l / 2 + offset] }
      default:
        return { length: w, rotY: 0, pos: (offset) => [-w / 2 + offset, -l / 2 + inset] }
    }
  }

  _clampFeatureOffset(wall, width, offset) {
    const { length } = this._wallConfig(wall)
    const half = Math.min(width / 2, length / 2)
    let clamped = Math.max(half, Math.min(length - half, offset))

    // A door/window still only ever names one of the 4 original walls (a notch never adds a 5th
    // named wall) — but if that wall has a notch cut into or out of it, keep the feature off the
    // cutout's span so it doesn't end up floating over open air. Notch `offset`/`width` already
    // use the exact same "distance along the wall from its start corner" convention as feature
    // offsets, so the forbidden span is just [notch.offset ± notch.width/2] directly.
    const notch = this._clampedNotch()
    if (notch && notch.wall === wall) {
      const nHalf = notch.width / 2
      const forbidLow = notch.offset - nHalf - half
      const forbidHigh = notch.offset + nHalf + half
      if (clamped > forbidLow && clamped < forbidHigh) {
        const leftFits = forbidLow >= half
        const rightFits = forbidHigh <= length - half
        const distLeft = Math.abs(clamped - forbidLow)
        const distRight = Math.abs(forbidHigh - clamped)
        if (leftFits && (!rightFits || distLeft <= distRight)) clamped = forbidLow
        else if (rightFits) clamped = forbidHigh
        // else: neither flat segment is wide enough for this feature — leave it centered on the
        // clamp as a last resort; _clampedNotch()'s own margins make this vanishingly rare.
      }
    }
    return clamped
  }

  _buildFeatureMesh(feature) {
    const group = new THREE.Group()
    const { width, height } = feature
    if (feature.type === 'window') {
      const paneMat = new THREE.MeshStandardMaterial({
        color: 0xaad4e8, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      })
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), paneMat)
      group.add(pane)
      const frameMat = new THREE.LineBasicMaterial({ color: 0x4d6373 })
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(pane.geometry), frameMat))
      // Simple cross mullion so it reads as a window, not just a blue rectangle.
      const mullionGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -height / 2, 0.001), new THREE.Vector3(0, height / 2, 0.001),
        new THREE.Vector3(-width / 2, 0, 0.001), new THREE.Vector3(width / 2, 0, 0.001),
      ])
      group.add(new THREE.LineSegments(mullionGeo, frameMat))
    } else {
      // Door: a solid flush door leaf with a gray casing/frame around it — same "flat panel
      // overlaid on the wall" approach as the window pane above, just filled in and colored to
      // read as a real residence-hall door instead of architectural line art. The casing plane
      // is taller/wider than the door and sits just behind it, so only the strip that sticks out
      // past the door's edges is visible; it's shifted up by half its extra height so that strip
      // shows on the left/right/top only, leaving the bottom flush with the floor like a real
      // door casing (no casing under the door itself).
      const casingMat = new THREE.MeshBasicMaterial({ color: TRIM_COLOR, side: THREE.DoubleSide })
      const casing = new THREE.Mesh(
        new THREE.PlaneGeometry(width + DOOR_CASING_WIDTH * 2, height + DOOR_CASING_WIDTH),
        casingMat
      )
      casing.position.set(0, DOOR_CASING_WIDTH / 2, -0.01)
      group.add(casing)

      const doorMat = new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.6 })
      const doorGeo = new THREE.PlaneGeometry(width, height)
      const door = new THREE.Mesh(doorGeo, doorMat)
      group.add(door)
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: DOOR_EDGE_COLOR })))

      // Lever handle, offset toward the edge opposite the hinge (hinge assumed on the left, same
      // convention the old swing-arc symbol used) — purely decorative, just enough to read as a door.
      const handle = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 16),
        new THREE.MeshStandardMaterial({ color: DOOR_HANDLE_COLOR, metalness: 0.5, roughness: 0.4 })
      )
      handle.position.set(width / 2 - 0.35, 0, 0.01)
      group.add(handle)
    }
    return group
  }

  _repositionFeature(feature) {
    const cfg = this._wallConfig(feature.wall)
    feature.offset = this._clampFeatureOffset(feature.wall, feature.width, feature.offset)
    const [x, z] = cfg.pos(feature.offset)
    const baseY = feature.type === 'window' ? WINDOW_SILL_HEIGHT + feature.height / 2 : feature.height / 2
    feature.mesh.position.set(x, baseY, z)
    feature.mesh.rotation.y = cfg.rotY
  }

  _repositionAllFeatures() {
    this.wallFeatures.forEach((f) => this._repositionFeature(f))
  }

  _addFeature(type, wall, offset, width, height) {
    const id = this.featureIdCounter++
    const feature = { id, type, wall, offset, width, height, locked: false }
    feature.mesh = this._buildFeatureMesh(feature)
    this.featuresGroup.add(feature.mesh)
    this._repositionFeature(feature)
    this.wallFeatures.push(feature)
    return feature
  }

  addDoor() {
    const feature = this._addFeature('door', 'back', this.room.w / 2, DOOR_WIDTH, DOOR_HEIGHT)
    this.selectFeature(feature.id)
    return feature.id
  }

  addWindow() {
    const feature = this._addFeature('window', 'back', this.room.w / 2, WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT)
    this.selectFeature(feature.id)
    return feature.id
  }

  addFeatureAt(type, wall, offset, width, height) {
    return this._addFeature(type, wall, offset, width, height).id
  }

  removeFeature(id) {
    const idx = this.wallFeatures.findIndex((f) => f.id === id)
    if (idx === -1) return
    this.featuresGroup.remove(this.wallFeatures[idx].mesh)
    this.wallFeatures.splice(idx, 1)
    if (this.selectedFeature && this.selectedFeature.id === id) this.deselectFeature()
  }

  // Re-reports the selected feature's current state to React — needed after any in-place
  // mutation (wall reassignment, resize), not just on initial selection, otherwise the panel's
  // wall picker / width / height inputs go stale even though the 3D mesh updates correctly.
  _emitFeatureSelection(feature) {
    this.onFeatureSelectionChange({
      id: feature.id,
      type: feature.type,
      wall: feature.wall,
      width: feature.width,
      height: feature.height,
      locked: feature.locked,
    })
  }

  // Mirrors toggleItemLock — a locked door/window still selects on click but never picks up a
  // drag (see the pointerdown handler's 'feature' branch in _initInteraction), and its wall/size
  // controls stay usable since those are deliberate panel actions, not an accidental drag.
  toggleFeatureLock(id) {
    const feature = this.wallFeatures.find((f) => f.id === id)
    if (!feature) return
    feature.locked = !feature.locked
    if (this.selectedFeature === feature) {
      this._updateFeatureSelectionHelper()
      this._emitFeatureSelection(feature)
    }
  }

  setFeatureWall(id, wall) {
    const feature = this.wallFeatures.find((f) => f.id === id)
    if (!feature) return
    feature.wall = wall
    feature.offset = this._wallConfig(wall).length / 2 // recenter on the new wall
    this._repositionFeature(feature)
    if (this.selectedFeature?.id === id) {
      this._updateFeatureSelectionHelper()
      this._emitFeatureSelection(feature)
    }
  }

  // Windows only — doors are a fixed standard size.
  setFeatureSize(id, width, height) {
    const feature = this.wallFeatures.find((f) => f.id === id)
    if (!feature || feature.type !== 'window') return
    feature.width = Math.max(WINDOW_MIN_WIDTH, Math.min(WINDOW_MAX_WIDTH, width))
    feature.height = Math.max(WINDOW_MIN_HEIGHT, Math.min(WINDOW_MAX_HEIGHT, height))
    this.featuresGroup.remove(feature.mesh)
    feature.mesh = this._buildFeatureMesh(feature)
    this.featuresGroup.add(feature.mesh)
    this._repositionFeature(feature)
    // The freshly-built mesh's materials start untinted regardless of whatever _collisionTinted
    // says — without this reset, _setFeatureCollisionTint's own early-return (nothing changed)
    // would skip re-applying a still-active collision tint to them, leaving a window that was
    // red before a resize looking falsely clear until its collision state actually flips.
    feature._collisionTinted = undefined
    if (this.selectedFeature?.id === id) {
      this.selectedFeature = feature
      this._updateFeatureSelectionHelper()
      this._emitFeatureSelection(feature)
    }
  }

  selectFeature(id) {
    this._cancelStackPickIfActive()
    this.deselectItem()
    this.deselectFeature()
    const feature = this.wallFeatures.find((f) => f.id === id)
    if (!feature) return
    this.selectedFeature = feature
    this._updateFeatureSelectionHelper()
    this._emitFeatureSelection(feature)
  }

  deselectFeature() {
    if (this.featureSelectionHelper) {
      this.featuresGroup.remove(this.featureSelectionHelper)
      this.featureSelectionHelper = null
    }
    this.selectedFeature = null
    this.onFeatureSelectionChange(null)
  }

  _updateFeatureSelectionHelper() {
    if (this.featureSelectionHelper) this.featuresGroup.remove(this.featureSelectionHelper)
    this.featureSelectionHelper = new THREE.BoxHelper(this.selectedFeature.mesh, this.selectedFeature.locked ? LOCKED_SELECTION_COLOR : SELECTION_COLOR)
    this.featuresGroup.add(this.featureSelectionHelper)
  }

  // ---------- Pointer interaction ----------
  _initInteraction() {
    const el = this.renderer.domElement
    // Touch browsers otherwise intercept single-finger drags (scroll) and two-finger
    // gestures (pinch-zoom page / pull-to-refresh) before our pointer handlers see them.
    el.style.touchAction = 'none'

    this.raycaster = new THREE.Raycaster()
    this.pointerNDC = new THREE.Vector2()
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this.mode = null
    this.dragOffset = new THREE.Vector3()
    this.lastPointer = { x: 0, y: 0 }
    this.activePointers = new Map() // pointerId -> {x, y}, tracks all touches for pinch
    this.primaryPointerId = null
    this.pinch = null // { startDist, startRadius }

    const setPointerNDC = (x, y) => {
      const rect = el.getBoundingClientRect()
      this.pointerNDC.x = ((x - rect.left) / rect.width) * 2 - 1
      this.pointerNDC.y = -((y - rect.top) / rect.height) * 2 + 1
    }
    // Returns null (see _intersectFloorPlane) when the pointer's ray-vs-floor hit isn't reliable
    // this event — every caller below needs to handle that by leaving whatever it's dragging
    // exactly where it already was, not by falling back to some other point.
    const getFloorPoint = () => {
      this.raycaster.setFromCamera(this.pointerNDC, this.camera)
      return this._intersectFloorPlane()
    }
    const pinchDist = () => {
      const pts = [...this.activePointers.values()]
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }
    // A door/window only drags along its own wall's length — project the pointer's floor-plane
    // hit onto whichever world axis that wall runs along (x for back/front, z for left/right).
    const offsetForFeature = (feature, floorPt) => {
      const { w, l } = this.room
      return feature.wall === 'left' || feature.wall === 'right' ? floorPt.z + l / 2 : floorPt.x + w / 2
    }

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (this.activePointers.size === 2) {
        // A second touch landed — abandon any single-pointer drag/orbit and start pinch-zoom.
        this.mode = null
        this.pinch = { startDist: pinchDist(), startRadius: this.camState.radius }
        return
      }
      if (this.activePointers.size > 2) return

      this.primaryPointerId = e.pointerId
      setPointerNDC(e.clientX, e.clientY)
      this.lastPointer = { x: e.clientX, y: e.clientY }
      this._pointerDownPos = { x: e.clientX, y: e.clientY }
      this.raycaster.setFromCamera(this.pointerNDC, this.camera)

      // Shift+drag always pans the camera — a dedicated "move the view" gesture, checked before
      // measure mode and item/feature hit-testing below so it works no matter what's under the
      // cursor or what other mode is active. Plain drag on empty floor already orbits, and plain
      // drag on an item moves it, so this needs its own modifier to stay unambiguous with both.
      if (e.shiftKey) {
        this.mode = 'pan'
        return
      }

      // Measure mode replaces the normal select/drag behavior below — a click (not a drag; see
      // endPointer's own movement check) places a measure point instead of picking up an item.
      // Camera orbit still works (mode stays 'orbit' the whole time either way), just without the
      // orbit branch's usual deselectItem()/deselectFeature() side effect on every mousedown,
      // since measuring is independent of whatever's currently selected.
      if (this.measureMode) {
        this.mode = 'orbit'
        return
      }

      const itemMeshes = this._raycastableItemMeshes()
      const featureMeshes = this.wallFeatures.map((f) => f.mesh)
      const hits = this.raycaster.intersectObjects([...itemMeshes, ...featureMeshes], true)
      let item = null
      let feature = null
      if (hits.length) {
        let hitMesh = hits[0].object
        while (hitMesh.parent && !this.placedItems.find((p) => p.mesh === hitMesh) && !this.wallFeatures.find((f) => f.mesh === hitMesh)) {
          hitMesh = hitMesh.parent
        }
        item = this.placedItems.find((p) => p.mesh === hitMesh)
        feature = this.wallFeatures.find((f) => f.mesh === hitMesh)
      }

      // Stacking pick in progress: this click always resolves it (onto whatever item was hit, or
      // cancels if nothing valid was) rather than falling through to a normal select/drag/orbit —
      // otherwise a miss-click would silently leave the pick active with no visible feedback.
      if (this.stackPickSourceUid != null) {
        const sourceUid = this.stackPickSourceUid
        this.stackPickSourceUid = null
        this.onStackPickModeChange(null)
        if (item && item.uid !== sourceUid) this.stackItemOn(sourceUid, item.uid)
        return
      }

      if (item) {
        const itemCat = ALL_ITEMS.find((c) => c.id === item.catalogId)
        if (item.locked) {
          // A locked item still selects on click (so the panel's Unlock control is reachable) —
          // it just never picks up a drag. Falling through to orbit mode means dragging from here
          // behaves exactly like dragging empty floor instead of doing nothing/feeling stuck.
          this.mode = 'orbit'
          this.selectItem(item.uid)
        } else if (this._isWallMounted(item, itemCat) && this._nearestWallMeshTo(item.mesh) === this.nearWallEntry) {
          // This item is mounted on whichever wall is currently nearly-invisible because it's
          // facing the camera (see _updateNearWall) — exactly the wall a click aimed at something
          // on the *far* wall behind it is liable to land on by accident, since it's physically
          // the closer surface along that ray. Select it (so it's still reachable — Remove/Lock/
          // Duplicate all still work) but don't let this pointer drag move it; same fallback-to-
          // orbit behavior as a locked item below.
          this.mode = 'orbit'
          this.selectItem(item.uid)
        } else if (this._isWallMounted(item, itemCat)) {
          // Wall items drag along whichever wall the cursor is over instead of the floor plane —
          // see the pointermove handler's 'drag-wall-item' branch and _raycastWallPoint below. No
          // dragOffset: the item's center just follows the cursor's own wall hit point directly,
          // simpler and more predictable than preserving a pick-up offset for something this thin.
          this.mode = 'drag-wall-item'
          this.selectItem(item.uid)
        } else {
          this.mode = 'drag-item'
          // Dragging a stacked item keeps it stacked and elevated — it slides around on top of
          // whatever it's resting on, clamped to that item's footprint instead of the room's walls
          // (see the pointermove handler and _clampStackedItem below). Only the explicit "Place on
          // floor" button (unstackItem) sends it back down — dragging alone never does. Anything
          // resting on *this* item — directly, or several layers up a bedding stack — still falls
          // to the floor when this item itself actually gets picked up and moved, though: the
          // surface it was on is about to move out from under it, and following it in real time
          // isn't supported. Deferred to the first real pointermove of the drag (see
          // _pendingDropDescendantsUid below) rather than fired here on pointerdown — pointerdown
          // fires on a plain click too (click-to-select is a zero-movement drag that never reaches
          // pointermove), and dropping descendants right away meant merely selecting a bed with a
          // topper/comforter/pillow already on it sent all of that straight to the floor.
          this._pendingDropDescendantsUid = item.uid
          this.selectItem(item.uid)
          const floorPt = getFloorPoint()
          // floorPt is only unreliable right at the top of the viewport (see
          // _intersectFloorPlane) — vanishingly unlikely right where you just clicked an item, but
          // a zero offset (item follows the cursor's floor point exactly from here) is a safe,
          // unsurprising fallback rather than leaving dragOffset stale from a previous drag.
          this.dragOffset.set(floorPt ? item.mesh.position.x - floorPt.x : 0, 0, floorPt ? item.mesh.position.z - floorPt.z : 0)
        }
      } else if (feature) {
        if (feature.locked) {
          // Same reasoning as the locked-item branch above — select it (so the panel's Unlock
          // control is reachable) but let the drag orbit the camera instead of sliding it.
          this.mode = 'orbit'
          this.selectFeature(feature.id)
        } else {
          this.mode = 'drag-feature'
          this.selectFeature(feature.id)
          const floorPt = getFloorPoint()
          this.dragOffset.x = floorPt ? feature.offset - offsetForFeature(feature, floorPt) : 0
        }
      } else {
        this.mode = 'orbit'
        this.deselectItem()
        this.deselectFeature()
      }
    })

    el.addEventListener('pointermove', (e) => {
      if (!this.activePointers.has(e.pointerId)) return
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (this.pinch && this.activePointers.size === 2) {
        const dist = pinchDist()
        const scale = this.pinch.startDist > 0 ? this.pinch.startDist / dist : 1
        this.camState.radius = Math.max(4, Math.min(40, this.pinch.startRadius * scale))
        this._updateCameraPosition()
        return
      }

      if (!this.mode || e.pointerId !== this.primaryPointerId) return
      const dx = e.clientX - this.lastPointer.x
      const dy = e.clientY - this.lastPointer.y
      if (this.mode === 'orbit') {
        this.camState.theta -= dx * 0.006
        this.camState.phi = Math.max(0.3, Math.min(1.45, this.camState.phi - dy * 0.006))
        this._updateCameraPosition()
      } else if (this.mode === 'pan') {
        // Pixel deltas scaled by the current zoom (radius), same reasoning as _applyKeyboardPan's
        // keyboard speed — dragging a fixed screen distance covers a fixed *fraction* of the
        // visible room whether zoomed in tight or pulled back, rather than a fixed world distance.
        const factor = this.camState.radius * 0.0016
        this._panCamera(-dx * factor, dy * factor)
      } else if (this.mode === 'drag-item' && this.selected) {
        // The item is actually being moved now (not just clicked) — this is the deferred drop from
        // pointerdown above, fired once per pick-up rather than on every move event.
        if (this._pendingDropDescendantsUid != null) {
          this._dropDescendants(this._pendingDropDescendantsUid)
          this._pendingDropDescendantsUid = null
        }
        setPointerNDC(e.clientX, e.clientY)
        const floorPt = getFloorPoint()
        // A null floorPt (see _intersectFloorPlane) means the cursor drifted into the unreliable
        // near-the-horizon zone this event — skip the update entirely rather than snapping the
        // item toward whatever wild point that ray would otherwise have produced.
        if (floorPt) {
          const rawX = floorPt.x + this.dragOffset.x
          const rawZ = floorPt.z + this.dragOffset.z
          if (this.selected.stackedOnUid != null) {
            this.selected.mesh.position.x = rawX
            this.selected.mesh.position.z = rawZ
            this._clampStackedItem(this.selected.mesh, this.selected.stackedOnUid)
          } else {
            // Snap-to-flush before the room/notch clamp: approaching another item stops this one
            // flush against it (see _snapToNearbyItems); pushing the drag further past that point
            // releases the snap and resumes tracking the cursor exactly, same as if the other item
            // weren't there.
            const snapped = this._snapToNearbyItems(this.selected, rawX, rawZ)
            this.selected.mesh.position.x = snapped.x
            this.selected.mesh.position.z = snapped.z
            this._clampItemToRoom(this.selected.mesh)
          }
        }
      } else if (this.mode === 'drag-wall-item' && this.selected) {
        setPointerNDC(e.clientX, e.clientY)
        this.raycaster.setFromCamera(this.pointerNDC, this.camera)
        const hit = this._raycastWallPoint()
        if (hit) this._snapToWallHit(this.selected.mesh, this.selected.catalogId, hit)
      } else if (this.mode === 'drag-feature' && this.selectedFeature) {
        setPointerNDC(e.clientX, e.clientY)
        const floorPt = getFloorPoint()
        if (floorPt) {
          this.selectedFeature.offset = offsetForFeature(this.selectedFeature, floorPt) + this.dragOffset.x
          this._repositionFeature(this.selectedFeature)
          this._updateFeatureSelectionHelper()
        }
      }
      this.lastPointer = { x: e.clientX, y: e.clientY }
    })

    const endPointer = (e) => {
      this.activePointers.delete(e.pointerId)
      if (this.activePointers.size < 2) this.pinch = null
      if (e.pointerId === this.primaryPointerId) {
        // A "click" (as opposed to the drag that orbits the camera) is anything that moved less
        // than 5px total between down and up — same threshold philosophy as most drag-to-orbit
        // UIs, just not previously needed here since nothing but orbit ever listened for a plain
        // click. Only fires the measure-point placement on an actual click, not at the end of an
        // orbit drag.
        if (this.measureMode && this._pointerDownPos) {
          const moved = Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y)
          if (moved < 5) this._placeMeasurePoint(e.clientX, e.clientY)
        }
        this.mode = null
        this.primaryPointerId = null
      }
      // One finger lifted off a pinch, one remains: resume orbiting from here instead of
      // jumping (which would happen if we reused the old lastPointer position).
      if (this.activePointers.size === 1) {
        const [[id, pos]] = this.activePointers
        this.primaryPointerId = id
        this.lastPointer = { x: pos.x, y: pos.y }
        this.mode = 'orbit'
        this.deselectItem()
        this.deselectFeature()
      }
    }
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.camState.radius = Math.max(4, Math.min(40, this.camState.radius + e.deltaY * 0.02))
        this._updateCameraPosition()
      },
      { passive: false }
    )
  }
}
