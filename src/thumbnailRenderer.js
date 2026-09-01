import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CATALOG, PROVIDED_CATALOG } from './catalog.js'
import { fitModelToDims, tintModel } from './modelFit.js'

// One shared renderer/loader for the whole batch — creating a fresh WebGLRenderer per model
// hits the browser's concurrent-context limit (~16) partway through a ~25-item catalog, silently
// corrupting the later renders ("Too many active WebGL contexts" / context lost). Reusing a
// single canvas and clearing between renders avoids that entirely.
let sharedRenderer = null
function getRenderer(size) {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    sharedRenderer.setPixelRatio(2)
  }
  sharedRenderer.setSize(size, size)
  return sharedRenderer
}

const gltfLoader = new GLTFLoader()
function loadGltf(url) {
  return new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject))
}

// Frames whatever's currently in `scene` (already populated and centered near the origin) and
// renders it to a PNG data URL — shared tail end for both the model and box thumbnail paths below.
function renderFramedScene(scene, boxSize, size) {
  const renderer = getRenderer(size)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  const radius = Math.max(boxSize.length() / 2, 0.1)
  const theta = Math.PI / 4
  const phi = 1.0
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 180 / 2)) * 1.15
  camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta))
  camera.lookAt(0, 0, 0)
  renderer.render(scene, camera)
  const dataUrl = renderer.domElement.toDataURL('image/png')
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose())
  })
  return dataUrl
}

function litScene() {
  const scene = new THREE.Scene()
  // Same warm lighting as the main room scene, for visual consistency with what shows up once
  // the item is actually placed.
  scene.add(new THREE.AmbientLight(0xfff3e4, 0.9))
  const dir1 = new THREE.DirectionalLight(0xfff8ef, 1.0)
  dir1.position.set(4, 6, 5)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xf3e6d2, 0.4)
  dir2.position.set(-4, 3, -3)
  scene.add(dir2)
  return scene
}

// Renders a catalog item's glTF model (plus any fused extraModels — e.g. a bed's mattress) to an
// off-screen canvas and returns it as a PNG data URL. Mirrors roomEngine.js's _loadItemMesh as
// closely as this dev-only, DOM-free context allows: same modelRotationY/tintMaterial/
// primaryModelFitDims/extraModels handling via the shared fitModelToDims/tintModel (see
// modelFit.js), so a thumbnail always matches how the item actually looks once placed.
export async function renderModelThumbnail(cat, size = 128) {
  const scene = litScene()
  const gltf = await loadGltf(cat.modelUrl)
  const object3d = gltf.scene
  if (cat.hideNodes) {
    object3d.traverse((o) => { if (cat.hideNodes.includes(o.name)) o.visible = false })
  }
  if (cat.modelRotationY) object3d.rotation.y = cat.modelRotationY
  if (cat.tintMaterial) tintModel(object3d, cat.color)
  fitModelToDims(object3d, cat.primaryModelFitDims || cat.dims)
  if (cat.primaryModelOffsetX) object3d.position.x += cat.primaryModelOffsetX
  const group = new THREE.Group()
  group.add(object3d)

  if (cat.extraModels) {
    for (const extra of cat.extraModels) {
      try {
        const extraGltf = await loadGltf(extra.modelUrl)
        if (extra.rotationY) extraGltf.scene.rotation.y = extra.rotationY
        if (extra.color) tintModel(extraGltf.scene, extra.color)
        fitModelToDims(extraGltf.scene, extra.dims)
        extraGltf.scene.position.y += extra.yOffset || 0
        if (extra.xOffset) extraGltf.scene.position.x += extra.xOffset
        group.add(extraGltf.scene)
      } catch (err) {
        console.warn(`Extra model failed to load for thumbnail "${cat.name}".`, err)
      }
    }
  }

  const box = new THREE.Box3().setFromObject(group)
  const center = new THREE.Vector3()
  const boxSize = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(boxSize)
  group.position.sub(center)
  scene.add(group)

  return renderFramedScene(scene, boxSize, size)
}

// For catalog items with no 3D model (a flat placeholder box, same as what actually shows up in
// the room — see roomEngine.js's _buildBoxMesh) — still a real rendered picture of what you're
// choosing, not a generic emoji.
export function renderBoxThumbnail(cat, size = 128) {
  const scene = litScene()
  const [w, d, h] = cat.dims
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cat.color }))
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1b2a38 })))
  scene.add(mesh)
  return renderFramedScene(scene, new THREE.Vector3(w, h, d), size)
}

// Dev-only utility, not used by the shipped app. Regenerate catalog thumbnails after adding or
// changing a catalog item: open the app in a browser, open devtools console, run
//   await generateAllThumbnails({ saveToServer: true })
// which writes one PNG per item (both CATALOG and PROVIDED_CATALOG — modeled or box) straight to
// public/thumbnails/ via the dev server's save endpoint (see vite.config.js). Pass
// { saveToServer: false } to just get the data URLs back instead.
export async function generateAllThumbnails({ download = false, saveToServer = true } = {}) {
  const results = {}
  for (const cat of [...CATALOG, ...PROVIDED_CATALOG]) {
    try {
      // A brief yield between renders — back-to-back renders on the shared context under load
      // (e.g. a slow GPU, or many items) can otherwise stall waiting on the previous frame.
      await new Promise((r) => setTimeout(r, 60))
      const dataUrl = cat.modelUrl ? await renderModelThumbnail(cat) : renderBoxThumbnail(cat)
      results[cat.id] = dataUrl
      if (download) {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `${cat.id}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      if (saveToServer) {
        // Dev-server-only endpoint (see vite.config.js) — writes straight to
        // public/thumbnails/ via the Vite dev server's Node process.
        await fetch('/__save-thumbnail', {
          method: 'POST',
          body: JSON.stringify({ id: cat.id, dataUrl }),
        })
      }
      console.log(`✓ ${cat.id}`)
    } catch (err) {
      console.warn(`✗ ${cat.id} — ${err.message || err}`)
    }
  }
  return results
}

if (typeof window !== 'undefined') {
  window.generateAllThumbnails = generateAllThumbnails
  window.renderModelThumbnail = renderModelThumbnail
  window.renderBoxThumbnail = renderBoxThumbnail
}
