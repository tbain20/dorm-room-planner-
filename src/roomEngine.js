import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CATALOG, PROVIDED_CATALOG } from './catalog.js'

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
  constructor(container, { onCartChange, onSelectionChange, onFeatureSelectionChange }) {
    this.container = container
    this.onCartChange = onCartChange || (() => {})
    this.onSelectionChange = onSelectionChange || (() => {})
    this.onFeatureSelectionChange = onFeatureSelectionChange || (() => {})

    this.room = { w: 12, l: 14, h: 9 }
    this.placedItems = [] // { mesh, catalogId, uid }
    this.selected = null
    this.selectionHelper = null
    this.uidCounter = 1

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
    this.room = { w, l, h }
    this.buildRoom()
    this.placedItems.forEach((p) => this._clampItemToRoom(p.mesh))
  }

  buildRoom() {
    this.roomGroup.clear()
    const { w, l, h } = this.room

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
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
    // All four walls, so doors/windows can go on any side — front/right are fainter (lower
    // opacity) since they're most often the ones behind the default camera angle, between the
    // viewer and the room.
    addWall(w, h, 0, -l / 2, 0) // back
    addWall(l, h, -w / 2, 0, Math.PI / 2) // left
    addWall(w, h, 0, l / 2, 0) // front
    addWall(l, h, w / 2, 0, Math.PI / 2) // right

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

  _fitModelToDims(object3d, dims) {
    const [w, d, h] = dims
    const box = new THREE.Box3().setFromObject(object3d)
    const size = new THREE.Vector3()
    box.getSize(size)
    object3d.scale.set(size.x > 0 ? w / size.x : 1, size.y > 0 ? h / size.y : 1, size.z > 0 ? d / size.z : 1)
    const box2 = new THREE.Box3().setFromObject(object3d)
    const center = new THREE.Vector3()
    box2.getCenter(center)
    object3d.position.x -= center.x
    object3d.position.z -= center.z
    object3d.position.y -= box2.min.y
  }

  _loadItemMesh(cat, onReady) {
    if (cat.modelUrl) {
      this.gltfLoader.load(
        cat.modelUrl,
        (gltf) => {
          if (cat.hideNodes) {
            gltf.scene.traverse((o) => { if (cat.hideNodes.includes(o.name)) o.visible = false })
          }
          const group = new THREE.Group()
          this._fitModelToDims(gltf.scene, cat.dims)
          group.add(gltf.scene)
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

  _clampItemToRoom(mesh) {
    // dims is [width, depth, height] — only the first two matter for floor clamping. (A previous
    // version of this destructure skipped depth and grabbed height by mistake, which meant any
    // tall rotated item — e.g. a 6'-tall wardrobe with a 2.08' depth — got clamped as if its
    // footprint were 6' deep, leaving it stuck several feet short of the wall it was dragged
    // toward instead of sitting flush against it.)
    let [w, d] = mesh.userData.dims
    const rotDeg = (((mesh.rotation.y * 180) / Math.PI) % 360 + 360) % 360
    const swapped = (rotDeg > 45 && rotDeg < 135) || (rotDeg > 225 && rotDeg < 315)
    if (swapped) [w, d] = [d, w]
    const halfW = this.room.w / 2 - w / 2
    const halfL = this.room.l / 2 - d / 2
    mesh.position.x = Math.max(-halfW, Math.min(halfW, mesh.position.x))
    mesh.position.z = Math.max(-halfL, Math.min(halfL, mesh.position.z))
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

  addItemAt(catId, x, z, rotY) {
    const cat = ALL_ITEMS.find((c) => c.id === catId)
    if (!cat) return
    this._loadItemMesh(cat, (mesh) => {
      mesh.position.x = x
      mesh.position.z = z
      mesh.rotation.y = rotY || 0
      this._registerItem(mesh, cat)
    })
  }

  _registerItem(mesh, cat) {
    const uid = this.uidCounter++
    mesh.userData.uid = uid
    mesh.userData.catalogId = cat.id
    this.itemsGroup.add(mesh)
    this.placedItems.push({ mesh, catalogId: cat.id, uid })
    this._clampItemToRoom(mesh)
    this._emitCart()
  }

  removeItem(uid) {
    const idx = this.placedItems.findIndex((p) => p.uid === uid)
    if (idx === -1) return
    this.itemsGroup.remove(this.placedItems[idx].mesh)
    this.placedItems.splice(idx, 1)
    if (this.selected && this.selected.uid === uid) this.deselectItem()
    this._emitCart()
  }

  clearAll() {
    ;[...this.placedItems].forEach((p) => this.removeItem(p.uid))
    ;[...this.wallFeatures].forEach((f) => this.removeFeature(f.id))
  }

  rotateSelected(deltaRad = Math.PI / 2) {
    if (!this.selected) return
    this.selected.mesh.rotation.y = (this.selected.mesh.rotation.y + deltaRad) % (Math.PI * 2)
    this._clampItemToRoom(this.selected.mesh)
  }

  selectItem(uid) {
    this.deselectFeature()
    this.deselectItem()
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    this.selected = item
    this.selectionHelper = new THREE.BoxHelper(item.mesh, 0xc1502e)
    this.itemsGroup.add(this.selectionHelper)
    const cat = ALL_ITEMS.find((c) => c.id === item.catalogId)
    this.onSelectionChange({ uid, cat })
  }

  deselectItem() {
    if (this.selectionHelper) {
      this.itemsGroup.remove(this.selectionHelper)
      this.selectionHelper = null
    }
    this.selected = null
    this.onSelectionChange(null)
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
    return {
      room: { ...this.room },
      items: this.placedItems.map((p) => ({
        catalogId: p.catalogId,
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        rotY: p.mesh.rotation.y,
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
    data.items.forEach((it) => this.addItemAt(it.catalogId, it.x, it.z, it.rotY))
    ;(data.features || []).forEach((f) => this.addFeatureAt(f.type, f.wall, f.offset, f.width, f.height))
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
    return Math.max(half, Math.min(length - half, offset))
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
      if (hits.length) {
        let hitMesh = hits[0].object
        while (hitMesh.parent && !this.placedItems.find((p) => p.mesh === hitMesh) && !this.wallFeatures.find((f) => f.mesh === hitMesh)) {
          hitMesh = hitMesh.parent
        }
        const item = this.placedItems.find((p) => p.mesh === hitMesh)
        const feature = this.wallFeatures.find((f) => f.mesh === hitMesh)
        if (item) {
          this.mode = 'drag-item'
          this.selectItem(item.uid)
          const floorPt = getFloorPoint()
          this.dragOffset.set(hitMesh.position.x - floorPt.x, 0, hitMesh.position.z - floorPt.z)
        } else if (feature) {
          this.mode = 'drag-feature'
          this.selectFeature(feature.id)
          const floorPt = getFloorPoint()
          this.dragOffset.x = feature.offset - offsetForFeature(feature, floorPt)
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
      } else if (this.mode === 'drag-item' && this.selected) {
        setPointerNDC(e.clientX, e.clientY)
        const floorPt = getFloorPoint()
        this.selected.mesh.position.x = floorPt.x + this.dragOffset.x
        this.selected.mesh.position.z = floorPt.z + this.dragOffset.z
        this._clampItemToRoom(this.selected.mesh)
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
