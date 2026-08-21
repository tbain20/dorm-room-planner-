import * as THREE from 'three'

// Scales+positions a loaded model to match a catalog item's real-world dims (see catalog.js's
// dims convention), floor-aligned and centered on X/Z — shared between roomEngine.js (the live 3D
// view) and thumbnailRenderer.js (dev-only catalog thumbnail generation) so both use identical
// fitting math. A second, drifted copy of this logic previously handled a pre-applied rotation
// incorrectly, which would have baked a badly stretched thumbnail for every Colgate-styled bed.
export function fitModelToDims(object3d, dims) {
  const [w, d, h] = dims
  const box = new THREE.Box3().setFromObject(object3d)
  const size = new THREE.Vector3()
  box.getSize(size)
  // THREE composes an object's world transform as position * rotation * scale — scale always
  // multiplies the model's own *local* axes, before rotation reorients them. If a 90°/270°
  // pre-rotation is already applied to object3d (see modelRotationY in catalog.js) before this
  // runs, the box above was measured in that ROTATED frame, where world X/Z have already swapped
  // relative to the model's raw local X/Z — scale.x needs the "Z" ratio and scale.z needs the "X"
  // ratio, or the model comes out stretched onto the wrong axis.
  const swapped = Math.abs(Math.round(object3d.rotation.y / (Math.PI / 2))) % 2 === 1
  const scaleForX = size.x > 0 ? w / size.x : 1 // ratio that lands a local axis on world X
  const scaleForZ = size.z > 0 ? d / size.z : 1 // ratio that lands a local axis on world Z
  object3d.scale.set(swapped ? scaleForZ : scaleForX, size.y > 0 ? h / size.y : 1, swapped ? scaleForX : scaleForZ)
  const box2 = new THREE.Box3().setFromObject(object3d)
  const center = new THREE.Vector3()
  box2.getCenter(center)
  object3d.position.x -= center.x
  object3d.position.z -= center.z
  object3d.position.y -= box2.min.y
}

// Repaints every material on a loaded model to a flat color — some of Tyler's own Blender exports
// (public/models/colgate*.glb) came through with no material color at all, just flat gray.
export function tintModel(object3d, colorHex) {
  const tint = new THREE.Color(colorHex)
  object3d.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => { if (m.color) m.color.copy(tint) })
  })
}
