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
const WINDOW_MAX_WIDTH = 6.0
const WINDOW_MIN_HEIGHT = 2.0
const WINDOW_MAX_HEIGHT = 5.0
const WINDOW_SILL_HEIGHT = 2.5 // feet off the floor to the bottom of the window

// RoomEngine owns the Three.js scene and all room/item state. It's deliberately independent of
// React — it just takes a DOM element to render into and a set of callbacks to report state
// changes back out to. This keeps the 3D logic testable and reusable outside the component tree.
export class RoomEngine {
  constructor(container, { onCartChange, onSelectionChange, onFeatureSelectionChange, onStackPickModeChange, onMeasureChange, unitSystem }) {
    this.container = container
    this.onCartChange = onCartChange || (() => {})
    this.onSelectionChange = onSelectionChange || (() => {})
    this.onFeatureSelectionChange = onFeatureSelectionChange || (() => {})
    this.onStackPickModeChange = onStackPickModeChange || (() => {})
    this.onMeasureChange = onMeasureChange || (() => {})
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

    this._initScene()
    this._initInteraction()
    this.buildRoom()
    this._animate = this._animate.bind(this)
    this._raf = requestAnimationFrame(this._animate)
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  destroy() {
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
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

  _animate() {
    this._raf = requestAnimationFrame(this._animate)
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
    this.renderer.render(this.scene, this.camera)
  }

  _updateCameraPosition() {
    const { theta, phi, radius, target } = this.camState
    this.camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta)
    this.camera.position.y = target.y + radius * Math.cos(phi)
    this.camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta)
    this.camera.lookAt(target)
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

  _reclampAllItems() {
    // Un-stacked items first — a stacked item's own clamp depends on its base's (possibly
    // just-moved) position, and stacking order isn't the same as placedItems array order (you
    // can place the base after the item that ends up on top of it).
    this.placedItems.filter((p) => p.stackedOnUid == null).forEach((p) => {
      const cat = ALL_ITEMS.find((c) => c.id === p.catalogId)
      // A resized/reshaped room rebuilds every wall from scratch (buildRoom(), called just before
      // this) — a wall item's old x/z might now float in empty space or sit behind a wall that
      // moved, so it needs its own resnap to whichever wall is now closest, not the floor-item
      // rectangle clamp below (which doesn't know about "flush against a wall" at all).
      if (cat?.wallMountable) this._resnapWallItemToNearestWall(p.mesh, cat)
      else this._clampItemToRoom(p.mesh)
    })
    this.placedItems.filter((p) => p.stackedOnUid != null).forEach((p) => {
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
      new THREE.MeshStandardMaterial({ color: 0xd7be99, side: THREE.DoubleSide, roughness: 0.9 })
    )
    floor.rotation.x = -Math.PI / 2
    this.roomGroup.add(floor)

    // Barely-there grid — a soft reference, not a drafting/blueprint layer.
    const grid = new THREE.GridHelper(Math.max(w, l), Math.max(w, l), 0xc2a877, 0xc2a877)
    grid.position.y = 0.01
    grid.material.transparent = true
    grid.material.opacity = 0.28
    this.roomGroup.add(grid)

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xd9cfba, transparent: true, opacity: 0.6 })
    const addWall = (width, height, x, z, rotY, normal) => {
      const geo = new THREE.PlaneGeometry(width, height)
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.position.set(x, height / 2, z)
      mesh.rotation.y = rotY
      this.roomGroup.add(mesh)
      this.wallMeshes.push({ mesh, normal })
      const edges = new THREE.EdgesGeometry(geo)
      const line = new THREE.LineSegments(edges, wallEdgeMat)
      line.position.copy(mesh.position)
      line.rotation.copy(mesh.rotation)
      this.roomGroup.add(line)
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

    this.fitCamera()
    this._repositionAllFeatures()
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
          // catalog's [width, depth, height] convention — e.g. ColgateBed.glb's headboard/
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
          group.add(gltf.scene)

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
                group.add(extraGltf.scene)
              } catch (err) {
                console.warn(`Extra model failed to load for "${cat.name}".`, err)
              }
            }
          }

          group.userData.dims = cat.dims
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

  // Base case: clamp to the room's bounding rectangle, same as always. When a notch is present,
  // that's refined afterward — for an inset, pushed back out of the carved-out area; for a
  // bump-out, allowed to extend further out into it. Since the room is always "rectangle ± one
  // axis-aligned rectangle," this stays simple axis math rather than general polygon containment.
  _clampItemToRoom(mesh) {
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

  addItem(catId) {
    const cat = ALL_ITEMS.find((c) => c.id === catId)
    if (!cat) return
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
  // y is only meaningful for a wallMountable item (see getState/loadState) — every other item's
  // height is always derived from its own dims/stacking, never freely chosen, so omitting it
  // (undefined) for a normal floor item is the common case, not an oversight.
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
      }
      const uid = this._registerItem(mesh, cat)
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

  // Re-snaps a wall item to whichever wall is now closest to its stored position — used by
  // _reclampAllItems after a room resize/notch change rebuilds every wall, since the item's old
  // x/z may no longer sit against any real wall surface at all. Projects onto the chosen wall's
  // own tangent, clamped to that wall segment's actual length, so the item lands somewhere on the
  // wall itself rather than floating off its end.
  _resnapWallItemToNearestWall(mesh, cat) {
    if (!this.wallMeshes || this.wallMeshes.length === 0) return
    let best = null
    let bestDist = Infinity
    for (const entry of this.wallMeshes) {
      const d = entry.mesh.position.distanceTo(mesh.position)
      if (d < bestDist) {
        bestDist = d
        best = entry
      }
    }
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

  _registerItem(mesh, cat) {
    const uid = this.uidCounter++
    mesh.userData.uid = uid
    mesh.userData.catalogId = cat.id
    this.itemsGroup.add(mesh)
    // 'standard' is the default because it's tuned to match how each bed's mattress was
    // originally (and still is, for extraModels' yOffset) positioned — a freshly-placed bed
    // matches the raw model's own look rather than silently starting on a different peg.
    this.placedItems.push({ mesh, catalogId: cat.id, uid, stackedOnUid: null, bedHeightLevel: 'standard' })
    this._clampItemToRoom(mesh)
    this._emitCart()
    return uid
  }

  removeItem(uid) {
    this._cancelStackPickIfActive()
    const idx = this.placedItems.findIndex((p) => p.uid === uid)
    if (idx === -1) return
    this.itemsGroup.remove(this.placedItems[idx].mesh)
    this.placedItems.splice(idx, 1)
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
    if (this.selected.stackedOnUid != null) this._clampStackedItem(this.selected.mesh, this.selected.stackedOnUid)
    else this._clampItemToRoom(this.selected.mesh)
  }

  selectItem(uid) {
    this._cancelStackPickIfActive()
    this.deselectFeature()
    this.deselectItem()
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    this.selected = item
    this.selectionHelper = new THREE.BoxHelper(item.mesh, 0xc1502e)
    this.itemsGroup.add(this.selectionHelper)
    if (this.showDimensionOverlay) this._buildDimensionOverlay()
    this._emitSelection()
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
  // floor plane for anywhere else, the same intersectPlane approach getFloorPoint() above already
  // uses for item dragging. A 3rd click starts a fresh pair rather than accumulating a 3rd point.
  _placeMeasurePoint(clientX, clientY) {
    const el = this.renderer.domElement
    const rect = el.getBoundingClientRect()
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const itemMeshes = this.placedItems.map((p) => p.mesh)
    const hits = this.raycaster.intersectObjects(itemMeshes, true)
    let point
    if (hits.length) {
      point = hits[0].point.clone()
    } else {
      point = new THREE.Vector3()
      if (!this.raycaster.ray.intersectPlane(this.floorPlane, point)) return
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
        // A stacked item resting directly on its base (e.g. a pillow on a bed) touches it by
        // design — Box3.intersectsBox() counts touching boundaries as intersecting, so without
        // this exclusion every legitimately stacked pair would permanently show as "doesn't fit."
        if (items[i].stackedOnUid === items[j].uid || items[j].stackedOnUid === items[i].uid) continue
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
  }

  // True if any actual mesh piece of `itemA` intersects any actual mesh piece of `itemB` — see
  // _updateCollisions above for why this is per-submesh rather than one box per item.
  _piecesTouch(itemA, itemB, catA, catB) {
    const boxesA = this._collectLeafBoxes(itemA, catA)
    const boxesB = this._collectLeafBoxes(itemB, catB)
    for (const a of boxesA) {
      for (const b of boxesB) {
        if (a.intersectsBox(b)) return true
      }
    }
    return false
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
    this.onSelectionChange({ uid: this.selected.uid, cat, stackedOnUid: this.selected.stackedOnUid, bedHeightLevel: this.selected.bedHeightLevel })
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
  _topSurfaceY(placedItem) {
    const cat = ALL_ITEMS.find((c) => c.id === placedItem.catalogId)
    if (cat && cat.bedHeights) {
      const level = placedItem.bedHeightLevel || 'standard'
      const movable = placedItem.mesh.userData.movableObjs || []
      // The topmost movable piece's own top (stackOffset + its thickness) — e.g. the mattress
      // fused on top of the slat, not the slat itself — regardless of how many pieces are stacked.
      const topOffset = movable.reduce((max, m) => Math.max(max, m.stackOffset + m.thickness), 0)
      return placedItem.mesh.position.y + cat.bedHeights[level] + topOffset
    }
    return placedItem.mesh.position.y + placedItem.mesh.userData.dims[2]
  }

  // Stacking is arbitrary-depth (a topper, then a sheet set, then a comforter, then a pillow can
  // all layer onto one bed frame via repeated "Put on top of…") rather than the single-level cap
  // this used to have — the Y math already generalizes (targetTopY is computed off whatever's
  // currently on top of the target), so the only real addition is the cycle guard below.
  stackItemOn(sourceUid, targetUid) {
    if (sourceUid === targetUid) return
    const source = this.placedItems.find((p) => p.uid === sourceUid)
    const target = this.placedItems.find((p) => p.uid === targetUid)
    if (!source || !target) return
    // Refuse to stack an item onto one of its own descendants (would create a cycle).
    let ancestor = target
    while (ancestor) {
      if (ancestor.uid === sourceUid) return
      ancestor = ancestor.stackedOnUid != null ? this.placedItems.find((p) => p.uid === ancestor.stackedOnUid) : null
    }
    source.mesh.position.y = this._topSurfaceY(target)
    source.mesh.position.x = target.mesh.position.x
    source.mesh.position.z = target.mesh.position.z
    source.stackedOnUid = targetUid
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
          // Only a wallMountable item's height is ever freely chosen (see _snapToWallHit) — every
          // other item's y is always re-derived deterministically from its own dims/stacking on
          // load, so saving it for those would just be redundant, unused data.
          y: cat?.wallMountable ? p.mesh.position.y : undefined,
          z: p.mesh.position.z,
          rotY: p.mesh.rotation.y,
          stackedOnIndex: p.stackedOnUid == null ? null : this.placedItems.findIndex((q) => q.uid === p.stackedOnUid),
          bedHeightLevel: p.bedHeightLevel,
        }
      }),
      features: this.wallFeatures.map((f) => ({
        type: f.type,
        wall: f.wall,
        offset: f.offset,
        width: f.width,
        height: f.height,
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
          remaining -= 1
          if (remaining === 0) this._resolveLoadedStacking(data.items, uidsByIndex)
        }, it.y)
      })
    }
    ;(data.features || []).forEach((f) => this.addFeatureAt(f.type, f.wall, f.offset, f.width, f.height))
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
    this._emitCart()
  }

  // ---------- Wall features (doors & windows) ----------
  // Rendered as flat panels overlaid on the wall — a translucent light-blue rectangle for
  // windows, an outlined opening + floor-level swing arc for doors — rather than actually
  // cutting geometry out of the wall mesh (real CSG boolean subtraction would be a lot of
  // complexity for not much visual payoff here). "wall" is one of 'back'/'front'/'left'/'right';
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
      // Door: an outline of the opening (no fill, so it visually reads as a gap in the wall)
      // plus a floor-level swing arc + leaf line — the standard architectural-plan door symbol,
      // projected onto the floor since this is a 3D perspective view rather than a top-down plan.
      const openingMat = new THREE.LineBasicMaterial({ color: 0x25211b })
      const openingGeo = new THREE.PlaneGeometry(width, height)
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(openingGeo), openingMat))

      const swingMat = new THREE.LineBasicMaterial({ color: 0xc1502e })
      const hingeX = -width / 2
      const arcPoints = []
      const segments = 24
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * (Math.PI / 2)
        arcPoints.push(new THREE.Vector3(hingeX + Math.sin(t) * width, -height / 2 + Math.cos(t) * width, 0))
      }
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints)
      const arc = new THREE.Line(arcGeo, swingMat)
      // The opening rectangle is vertical (XY plane); the swing arc needs to lie flat on the
      // floor instead, sweeping from the hinge into the room — rotate it down from vertical.
      arc.rotation.x = -Math.PI / 2
      arc.position.y = -height / 2
      group.add(arc)
      const leafGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(width, 0, 0)])
      const leaf = new THREE.Line(leafGeo, swingMat)
      leaf.position.set(hingeX, -height / 2, 0)
      group.add(leaf)
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
    const feature = { id, type, wall, offset, width, height }
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
    this.onFeatureSelectionChange({ id: feature.id, type: feature.type, wall: feature.wall, width: feature.width, height: feature.height })
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
    this.featureSelectionHelper = new THREE.BoxHelper(this.selectedFeature.mesh, 0xc1502e)
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
    const getFloorPoint = () => {
      this.raycaster.setFromCamera(this.pointerNDC, this.camera)
      const pt = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.floorPlane, pt)
      return pt
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

      // Measure mode replaces the normal select/drag behavior below — a click (not a drag; see
      // endPointer's own movement check) places a measure point instead of picking up an item.
      // Camera orbit still works (mode stays 'orbit' the whole time either way), just without the
      // orbit branch's usual deselectItem()/deselectFeature() side effect on every mousedown,
      // since measuring is independent of whatever's currently selected.
      if (this.measureMode) {
        this.mode = 'orbit'
        return
      }

      const itemMeshes = this.placedItems.map((p) => p.mesh)
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
        if (itemCat?.wallMountable) {
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
          // to the floor when this item itself gets picked up, though: the surface it was on is
          // about to move out from under it, and following it in real time isn't supported.
          this._dropDescendants(item.uid)
          this.selectItem(item.uid)
          const floorPt = getFloorPoint()
          this.dragOffset.set(item.mesh.position.x - floorPt.x, 0, item.mesh.position.z - floorPt.z)
        }
      } else if (feature) {
        this.mode = 'drag-feature'
        this.selectFeature(feature.id)
        const floorPt = getFloorPoint()
        this.dragOffset.x = feature.offset - offsetForFeature(feature, floorPt)
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
      } else if (this.mode === 'drag-item' && this.selected) {
        setPointerNDC(e.clientX, e.clientY)
        const floorPt = getFloorPoint()
        this.selected.mesh.position.x = floorPt.x + this.dragOffset.x
        this.selected.mesh.position.z = floorPt.z + this.dragOffset.z
        if (this.selected.stackedOnUid != null) this._clampStackedItem(this.selected.mesh, this.selected.stackedOnUid)
        else this._clampItemToRoom(this.selected.mesh)
      } else if (this.mode === 'drag-wall-item' && this.selected) {
        setPointerNDC(e.clientX, e.clientY)
        this.raycaster.setFromCamera(this.pointerNDC, this.camera)
        const hit = this._raycastWallPoint()
        if (hit) this._snapToWallHit(this.selected.mesh, this.selected.catalogId, hit)
      } else if (this.mode === 'drag-feature' && this.selectedFeature) {
        setPointerNDC(e.clientX, e.clientY)
        const floorPt = getFloorPoint()
        this.selectedFeature.offset = offsetForFeature(this.selectedFeature, floorPt) + this.dragOffset.x
        this._repositionFeature(this.selectedFeature)
        this._updateFeatureSelectionHelper()
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
