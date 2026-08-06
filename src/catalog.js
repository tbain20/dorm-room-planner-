// dims are [width, depth, height] in feet.
// modelUrl (glTF/GLB) makes the engine load a real 3D model instead of a placeholder box —
// it auto-scales and floor-aligns whatever model you point it at. Models below are from
// Kenney's CC0-licensed Furniture Kit (kenney.nl/assets/furniture-kit, public domain, no
// attribution required) — stand-ins chosen for silhouette, not exact retailer matches. Items
// without a close match in that kit (mattress, storage cubes, mirror) still use box placeholders.
export const CATALOG = [
  { id: 'bed', name: 'Twin XL Bed Frame', price: 189, retailer: 'IKEA', dims: [3.4, 6.5, 2.0], color: 0x8a6b4f, category: 'Sleep', modelUrl: '/models/bedSingle.glb' },
  { id: 'mattress', name: 'Twin XL Mattress', price: 159, retailer: 'Amazon', dims: [3.3, 6.3, 0.8], color: 0xd8cbb0, category: 'Sleep' },
  { id: 'desk', name: 'Compact Desk', price: 99, retailer: 'IKEA', dims: [3.9, 2.0, 2.4], color: 0xb08d57, category: 'Work', modelUrl: '/models/desk.glb' },
  { id: 'chair', name: 'Desk Chair', price: 79, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0x3a3a3a, category: 'Work', modelUrl: '/models/chairDesk.glb' },
  { id: 'fridge', name: 'Mini Fridge', price: 139, retailer: 'Best Buy', dims: [1.6, 1.8, 2.9], color: 0xe4e4e4, category: 'Living', modelUrl: '/models/kitchenFridgeSmall.glb' },
  { id: 'wardrobe', name: 'Portable Wardrobe', price: 69, retailer: 'Amazon', dims: [2.3, 1.5, 4.6], color: 0x6f7f8c, category: 'Storage', modelUrl: '/models/bookcaseClosedDoors.glb' },
  { id: 'shelf', name: 'Bookshelf', price: 59, retailer: 'IKEA', dims: [2.5, 1.0, 4.0], color: 0x9c7a4d, category: 'Storage', modelUrl: '/models/bookcaseOpen.glb' },
  { id: 'cubes', name: 'Storage Cubes (6)', price: 45, retailer: 'Target', dims: [2.6, 1.1, 2.4], color: 0xc9c9c9, category: 'Storage' },
  { id: 'nightstand', name: 'Nightstand', price: 39, retailer: 'IKEA', dims: [1.5, 1.5, 2.0], color: 0x8a6b4f, category: 'Storage', modelUrl: '/models/sideTableDrawers.glb' },
  { id: 'lamp', name: 'Floor Lamp', price: 34, retailer: 'Target', dims: [1.0, 1.0, 5.2], color: 0xe8a33d, category: 'Living', modelUrl: '/models/lampRoundFloor.glb' },
  { id: 'rug', name: 'Area Rug 5x3', price: 49, retailer: 'Amazon', dims: [5.0, 3.0, 0.06], color: 0x7a3f3f, category: 'Living', modelUrl: '/models/rugRectangle.glb' },
  { id: 'mirror', name: 'Full-Length Mirror', price: 29, retailer: 'Target', dims: [1.3, 0.2, 4.9], color: 0xaad4e8, category: 'Living' },
]

// AFFILIATE LINKS — replace with real tracked affiliate links once approved for each program.
// Sign-up starting points: Amazon Associates (affiliate-program.amazon.com), Impact (impact.com
// — covers Target & Best Buy), Awin (awin.com — covers IKEA).
const AFFILIATE_TAGS = {
  // Amazon: 'yourtag-20',
  // Target: 'YOUR_IMPACT_TRACKING_ID',
}

export function retailerLink(retailer, itemName) {
  const q = encodeURIComponent(itemName)
  const map = {
    IKEA: `https://www.ikea.com/us/en/search/?q=${q}`,
    Amazon: `https://www.amazon.com/s?k=${q}`,
    Target: `https://www.target.com/s?searchTerm=${q}`,
    'Best Buy': `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,
  }
  let url = map[retailer] || `https://www.google.com/search?q=${q}`
  const tag = AFFILIATE_TAGS[retailer]
  if (tag) url += (url.includes('?') ? '&' : '?') + `tag=${encodeURIComponent(tag)}`
  return url
}
