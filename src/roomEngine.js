import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CATALOG } from './catalog.js'

// RoomEngine owns the Three.js scene and all room/item state. It's deliberately independent of
// React — it just takes a DOM element to render into and a set of callbacks to report state
// changes back out to. This keeps the 3D logic testable and reusable outside the component tree.
export class RoomEngine {
  constructor(container, { onCartChange, onSelectionChange }) {
    this.container = container
    this.onCartChange = onCartChange || (() => {})
    this.onSelectionChange = onSelectionChange || (() => {})

    this.room = { w: 12, l: 14, h: 9 }
    this.placedItems = [] // { mesh, catalogId, uid }
    this.selected = null
    this.selectionHelper = null
    this.uidCounter = 1

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

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.9)
    dir1.position.set(8, 14, 6)
    this.scene.add(dir1)
    const dir2 = new THREE.DirectionalLight(0x5fa8d3, 0.25)
    dir2.position.set(-8, 6, -6)
    this.scene.add(dir2)

    this.roomGroup = new THREE.Group()
    this.scene.add(this.roomGroup)

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
      new THREE.MeshStandardMaterial({ color: 0x1c3f5e, side: THREE.DoubleSide })
    )
    floor.rotation.x = -Math.PI / 2
    this.roomGroup.add(floor)

    const grid = new THREE.GridHelper(Math.max(w, l), Math.max(w, l), 0x5fa8d3, 0x2b587a)
    grid.position.y = 0.01
    this.roomGroup.add(grid)

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5fa8d3, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0x5fa8d3 })
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
    addWall(w, h, 0, -l / 2, 0)
    addWall(l, h, -w / 2, 0, Math.PI / 2)

    this.fitCamera()
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
    let [w, , d] = mesh.userData.dims
    const rotDeg = (((mesh.rotation.y * 180) / Math.PI) % 360 + 360) % 360
    const swapped = (rotDeg > 45 && rotDeg < 135) || (rotDeg > 225 && rotDeg < 315)
    if (swapped) [w, d] = [d, w]
    const halfW = this.room.w / 2 - w / 2
    const halfL = this.room.l / 2 - d / 2
    mesh.position.x = Math.max(-halfW, Math.min(halfW, mesh.position.x))
    mesh.position.z = Math.max(-halfL, Math.min(halfL, mesh.position.z))
  }

  addItem(catId) {
    const cat = CATALOG.find((c) => c.id === catId)
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
    const cat = CATALOG.find((c) => c.id === catId)
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
    this.roomGroup.add(mesh)
    this.placedItems.push({ mesh, catalogId: cat.id, uid })
    this._clampItemToRoom(mesh)
    this._emitCart()
  }

  removeItem(uid) {
    const idx = this.placedItems.findIndex((p) => p.uid === uid)
    if (idx === -1) return
    this.roomGroup.remove(this.placedItems[idx].mesh)
    this.placedItems.splice(idx, 1)
    if (this.selected && this.selected.uid === uid) this.deselectItem()
    this._emitCart()
  }

  clearAll() {
    ;[...this.placedItems].forEach((p) => this.removeItem(p.uid))
  }

  rotateSelected(deltaRad = Math.PI / 2) {
    if (!this.selected) return
    this.selected.mesh.rotation.y = (this.selected.mesh.rotation.y + deltaRad) % (Math.PI * 2)
    this._clampItemToRoom(this.selected.mesh)
  }

  selectItem(uid) {
    this.deselectItem()
    const item = this.placedItems.find((p) => p.uid === uid)
    if (!item) return
    this.selected = item
    this.selectionHelper = new THREE.BoxHelper(item.mesh, 0xe8a33d)
    this.roomGroup.add(this.selectionHelper)
    const cat = CATALOG.find((c) => c.id === item.catalogId)
    this.onSelectionChange({ uid, cat })
  }

  deselectItem() {
    if (this.selectionHelper) {
      this.roomGroup.remove(this.selectionHelper)
      this.selectionHelper = null
    }
    this.selected = null
    this.onSelectionChange(null)
  }

  _emitCart() {
    const items = this.placedItems.map((p) => ({
      uid: p.uid,
      catalogId: p.catalogId,
      cat: CATALOG.find((c) => c.id === p.catalogId),
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
    }
  }

  loadState(data) {
    this.clearAll()
    this.room = { ...data.room }
    this.buildRoom()
    data.items.forEach((it) => this.addItemAt(it.catalogId, it.x, it.z, it.rotY))
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
      const meshes = this.placedItems.map((p) => p.mesh)
      const hits = this.raycaster.intersectObjects(meshes, true)
      if (hits.length) {
        let hitMesh = hits[0].object
        while (hitMesh.parent && !hitMesh.userData.uid) hitMesh = hitMesh.parent
        const item = this.placedItems.find((p) => p.mesh === hitMesh)
        if (item) {
          this.mode = 'drag-item'
          this.selectItem(item.uid)
          const floorPt = getFloorPoint()
          this.dragOffset.set(hitMesh.position.x - floorPt.x, 0, hitMesh.position.z - floorPt.z)
        }
      } else {
        this.mode = 'orbit'
        this.deselectItem()
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
