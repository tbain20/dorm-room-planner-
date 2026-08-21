import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CATALOG, PROVIDED_CATALOG } from './catalog.js'
import { fitModelToDims, tintModel } from './modelFit.js'

// The engine resolves items against both the purchasable catalog and Colgate-provided
// furniture — it doesn't care which list an id came from, only App.jsx's shopping-list/total
// logic needs to tell them apart (via each item's isProvided flag).
const ALL_ITEMS = [...CATALOG, ...PROVIDED_CATALOG]

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
  constructor(container, { onCartChange, onSelectionChange, onFeatureSelectionChange, onStackPickModeChange }) {
    this.container = container
    this.onCartChange = onCartChange || (() => {})
    this.onSelectionChange = onSelectionChange || (() => {})
    this.onFeatureSelectionChange = onFeatureSelectionChange || (() => {})
    this.onStackPickModeChange = onStackPickModeChange || (() => {})

    this.room = { w: 12, l: 14, h: 9, notch: null }
    this.placedItems = [] // { mesh, catalogId, uid, stackedOnUid }
    this.selected = null
    this.selectionHelper = null
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
    this.placedItems.filter((p) => p.stackedOnUid == null).forEach((p) => this._clampItemToRoom(p.mesh))
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
    const { w, l, h } = this.room
    const outline = this._roomOutline()

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
    const addWall = (width, height, x, z, rotY) => {
      const geo = new THREE.PlaneGeometry(width, height)
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.position.set(x, height / 2, z)
      mesh.rotation.y = rotY
      this.roomGroup.add(mesh)
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
      addWall(segWidth, h, (x0 + x1) / 2, (z0 + z1) / 2, rotY)
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
    if (cat.modelUrl) {
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
      const jitter = (Math.random() - 0.5) * 2
      mesh.position.x = jitter
      mesh.position.z = jitter
      this._registerItem(mesh, cat)
      this.selectItem(mesh.userData.uid)
    })
  }

  // onRegistered, if given, fires with the freshly-assigned uid once the (possibly async, for a
  // glTF model) load finishes and the item actually lands in placedItems — used by loadState()
  // below to know each restored item's uid so it can resolve stackedOnIndex references afterward.
  addItemAt(catId, x, z, rotY, onRegistered) {
    const cat = ALL_ITEMS.find((c) => c.id === catId)
    if (!cat) return
    this._loadItemMesh(cat, (mesh) => {
      mesh.position.x = x
      mesh.position.z = z
      mesh.rotation.y = rotY || 0
      const uid = this._registerItem(mesh, cat)
      if (onRegistered) onRegistered(uid)
    })
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
    this._emitSelection()
  }

  deselectItem() {
    this._cancelStackPickIfActive()
    if (this.selectionHelper) {
      this.itemsGroup.remove(this.selectionHelper)
      this.selectionHelper = null
    }
    this.selected = null
    this.onSelectionChange(null)
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
      items: this.placedItems.map((p) => ({
        catalogId: p.catalogId,
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        rotY: p.mesh.rotation.y,
        stackedOnIndex: p.stackedOnUid == null ? null : this.placedItems.findIndex((q) => q.uid === p.stackedOnUid),
        bedHeightLevel: p.bedHeightLevel,
      })),
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
        })
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
      this.raycaster.setFromCamera(this.pointerNDC, this.camera)
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
