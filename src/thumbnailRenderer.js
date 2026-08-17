import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CATALOG } from './catalog.js'

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

// Renders a single glTF model to an off-screen canvas and returns it as a PNG data URL — used to
// generate the static catalog thumbnails in public/thumbnails/. Not used at runtime by normal
// users; see generateAllThumbnails() below for how to regenerate them.
export function renderModelThumbnail(modelUrl, dims, size = 128, hideNodes = null) {
  return new Promise((resolve, reject) => {
    const renderer = getRenderer(size)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)

    // Same warm lighting as the main room scene, for visual consistency with what shows up
    // once the item is actually placed.
    scene.add(new THREE.AmbientLight(0xfff3e4, 0.9))
    const dir1 = new THREE.DirectionalLight(0xfff8ef, 1.0)
    dir1.position.set(4, 6, 5)
    scene.add(dir1)
    const dir2 = new THREE.DirectionalLight(0xf3e6d2, 0.4)
    dir2.position.set(-4, 3, -3)
    scene.add(dir2)

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        const object3d = gltf.scene
        if (hideNodes) {
          object3d.traverse((o) => { if (hideNodes.includes(o.name)) o.visible = false })
        }
        // Scale to the item's real dims, same as roomEngine's _fitModelToDims, so relative
        // proportions (a bed vs. a nightstand) still read correctly in the thumbnail.
        const [w, d, h] = dims
        const rawBox = new THREE.Box3().setFromObject(object3d)
        const rawSize = new THREE.Vector3()
        rawBox.getSize(rawSize)
        object3d.scale.set(rawSize.x > 0 ? w / rawSize.x : 1, rawSize.y > 0 ? h / rawSize.y : 1, rawSize.z > 0 ? d / rawSize.z : 1)

        const box = new THREE.Box3().setFromObject(object3d)
        const center = new THREE.Vector3()
        const boxSize = new THREE.Vector3()
        box.getCenter(center)
        box.getSize(boxSize)
        object3d.position.sub(center)
        scene.add(object3d)

        // Auto-frame: distance scales with each item's own bounding sphere so a nightstand and
        // a bed both fill the frame nicely, rather than a fixed distance that under/over-frames
        // items with very different real-world sizes.
        const radius = Math.max(boxSize.length() / 2, 0.1)
        const theta = Math.PI / 4
        const phi = 1.0
        const dist = radius / Math.sin(camera.fov * (Math.PI / 180) / 2) * 1.15
        camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta))
        camera.lookAt(0, 0, 0)

        renderer.render(scene, camera)
        const dataUrl = renderer.domElement.toDataURL('image/png')

        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose())
        })
        resolve(dataUrl)
      },
      undefined,
      (err) => reject(err)
    )
  })
}

// Dev-only utility, not used by the shipped app. Regenerate catalog thumbnails after adding or
// changing a modelUrl: open the app in a browser, open devtools console, run
//   await generateAllThumbnails()
// It downloads one PNG per catalog item that has a modelUrl, named "<id>.png" — move those into
// public/thumbnails/. Pass { download: false } to just get the data URLs back instead (used to
// generate the initial batch programmatically).
export async function generateAllThumbnails({ download = true, saveToServer = false } = {}) {
  const results = {}
  for (const cat of CATALOG) {
    if (!cat.modelUrl) continue
    try {
      // A brief yield between renders — back-to-back renders on the shared context under load
      // (e.g. a slow GPU, or many items) can otherwise stall waiting on the previous frame.
      await new Promise((r) => setTimeout(r, 60))
      const dataUrl = await renderModelThumbnail(cat.modelUrl, cat.dims, 128, cat.hideNodes)
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
}
