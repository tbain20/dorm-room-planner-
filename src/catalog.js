import { DEFAULT_CHECKLIST_ITEMS } from './checklistItems.js'

// dims are [width, depth, height] in feet.
// modelUrl (glTF/GLB) makes the engine load a real 3D model instead of a placeholder box —
// it auto-scales and floor-aligns whatever model you point it at. Every model below is CC0 or
// otherwise verified free for commercial use — see public/models/LICENSES.md for the source and
// license of each one (most are from Kenney's Furniture Kit, public domain, no attribution
// required) — stand-ins chosen for silhouette, not exact retailer matches.
//
// Several catalog ids are variants of the same conceptual item (e.g. 'chair'/'chair-cushion'/
// 'chair-rounded') — added as new entries alongside the original rather than replacing it, so
// users get real style variety per category instead of one predetermined option each. See
// "Furniture sourcing" in the README for the full list added in that pass.
//
// This is the "placeable" half of Tyler's full dorm-shopping list — items with a real physical
// footprint worth positioning in the 3D room. The other half (small/consumable items like pens,
// detergent, sticky notes — things that don't make sense as 3D objects) lives in
// checklistItems.js instead, for the packing-checklist tab.
//
// category/subcategory match Tyler's taxonomy (see CATEGORY_ORDER below for display order and
// icons). A few existing items predate that taxonomy and were retagged into it; a few categories
// in the taxonomy (School Supplies, Bathroom) have zero placeable items — everything in those is
// checklist-only — so they never show up here.
export const CATEGORY_ORDER = [
  'Bedding',
  'Furniture & Organization',
  'Kitchen & Food',
  'Cleaning Supplies',
  'Laundry',
  'Sleep & Comfort',
  'Entertainment',
  'Decor',
  'Optional Luxury Items',
]

export const CATEGORY_ICONS = {
  Bedding: '🛏️',
  'Furniture & Organization': '🪑',
  'School Supplies': '📚',
  'Kitchen & Food': '🍽️',
  'Cleaning Supplies': '🧹',
  Laundry: '🧺',
  Bathroom: '🚿',
  'Sleep & Comfort': '😴',
  Entertainment: '🎮',
  Decor: '🖼️',
  'Optional Luxury Items': '🐾',
  Provided: '🎓',
}

// Catalog rows show a real thumbnail (rendered from the item's own glTF model — see
// thumbnailRenderer.js) instead of a flat color swatch when one's been generated. Falls back to
// the swatch + a category icon for box-placeholder items or if the image is missing.
export function thumbnailUrl(cat) {
  return cat.modelUrl ? `/thumbnails/${cat.id}.png` : null
}

// Every CATALOG item has a few relatedIds now (Tyler asked for "goes well with" suggestions on
// every furniture item, not just a sparse starter set) — each entry is either a bare CATALOG id
// (a placeable item — "Add to room") or a "chk:<id>" reference into checklistItems.js's
// DEFAULT_CHECKLIST_ITEMS (a checklist-only item — "Add to checklist"). Resolves against both
// CATALOG and PROVIDED_CATALOG so a Colgate-provided bed frame can still suggest bedding. Kept to
// 2-5 suggestions per item, picked for what plausibly pairs with it in a real room, not
// exhaustive — a longer list would just be noise in the selection panel.
export function resolveRelatedItems(cat) {
  if (!cat.relatedIds) return []
  return cat.relatedIds
    .map((relId) => {
      if (relId.startsWith('chk:')) {
        const item = DEFAULT_CHECKLIST_ITEMS.find((c) => c.id === relId.slice(4))
        if (!item) return null
        return { key: relId, label: item.label, isChecklist: true, category: item.category, subcategory: item.subcategory }
      }
      const item = [...CATALOG, ...PROVIDED_CATALOG].find((c) => c.id === relId)
      if (!item) return null
      return { key: relId, label: item.name, isChecklist: false, catalogId: item.id }
    })
    .filter(Boolean)
}

// Bed frames that support the Low/Standard/Lofted height presets (see 'Adjustable bed height' in
// roomEngine.js) get a bedHeights map: how far off the floor (in feet) the *entire frame* — legs,
// rails, and any fused mattress together — sits at for each preset, same idea as slide-under bed
// risers you'd actually buy. 'low' is 0 (flush on the floor, the frame's unmodified look) so a
// freshly-placed bed matches how the model always looked before this feature existed. The same
// three riser heights are shared by every bed that supports this — a real riser is an external
// product with its own fixed heights, not something that scales with which bed it's under.
// mattressSurfaceY (a separate, fixed value) is the *local* height within the frame where a
// mattress/bedding surface sits — constant regardless of the riser, used only so bedding stacked
// directly onto a bare frame (see multi-level stacking below) lands at the right spot instead of
// the top of the headboard. Bunk beds get neither — real Colgate bunks are a fixed configuration.
const BED_RISER_HEIGHTS = { low: 0, standard: 0.7, lofted: 2.5 }

export const CATALOG = [
  // ---- Bedding ----
  // No standalone "mattress" prop anymore — every bed frame model (Kenney's kit beds, and
  // colgate-bed's fused stackedModelUrl mattress) already renders its own sleeping surface, so a
  // separate mattress box wasn't adding anything besides a stacking target. These are the loose
  // bedding layers a student actually shops for, meant to be stacked directly onto a bed frame
  // (topper → sheets → comforter → pillow — see roomEngine.js's multi-level stacking) via
  // "Put on top of…". Flat, thin placeholder boxes sized to a twin mattress footprint, except the
  // pillow, which reuses the existing pillow.glb (distinct catalog entry from Decor's
  // 'throw-pillow' — same model, different price/category/relatedIds).
  { id: 'mattress-topper', name: 'Mattress Topper', price: 49, retailer: 'Amazon', dims: [3.3, 6.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-protector', 'sheet-set', 'bed', 'colgate-bed'] },
  { id: 'mattress-protector', name: 'Mattress Protector', price: 25, retailer: 'Amazon', dims: [3.3, 6.3, 0.15], color: 0xf2efe6, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-topper', 'sheet-set', 'bed', 'colgate-bed'] },
  { id: 'sheet-set', name: 'Sheet Set (Fitted + Flat)', price: 29, retailer: 'Target', dims: [3.3, 6.3, 0.1], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed', 'colgate-bed'] },
  { id: 'comforter', name: 'Comforter', price: 45, retailer: 'Target', dims: [3.5, 5.5, 0.5], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['sheet-set', 'bed-pillow', 'bed', 'colgate-bed'] },
  { id: 'bed-pillow', name: 'Pillow', price: 15, retailer: 'Amazon', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillow.glb', relatedIds: ['pillowcase-set', 'comforter', 'bed', 'colgate-bed'] },
  { id: 'pillowcase-set', name: 'Pillowcase Set', price: 12, retailer: 'Target', dims: [1.7, 2.3, 0.1], color: 0xe0d8c4, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['bed-pillow', 'sheet-set'] },

  // ---- Furniture & Organization ----
  { id: 'bed', name: 'Twin XL Bed Frame', price: 189, retailer: 'IKEA', dims: [3.4, 6.5, 2.0], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/bedSingle.glb', bedHeights: BED_RISER_HEIGHTS, mattressSurfaceY: 1.0, relatedIds: ['mattress-topper', 'sheet-set', 'nightstand', 'chk:mattress-protector', 'chk:pillowcases', 'chk:comforter', 'chk:bed-risers'] },
  // Variety additions (see public/models/LICENSES.md) — same category/id-suffix convention as the
  // Colgate-chest/purchasable-chest split earlier: new ids alongside the original, not replacing
  // it. Full/double doesn't fit a standard dorm frame, but plenty of this app's users aren't in a
  // dorm at all (apartment, off-campus) — see the "not every user is a Colgate student" note on
  // the Colgate section below.
  //
  // Both now render as the real Colgate bed frame (ColgateBed.glb) instead of the old Kenney-kit
  // bed models, scaled to their own dims — same modelRotationY/tintMaterial treatment colgate-bed
  // below already uses. The twin ('bed' above) is deliberately left as bedSingle.glb — it's the
  // one frame that's already Colgate-accurate in spirit as a plain purchasable twin.
  { id: 'bed-full', name: 'Full-Size Bed Frame', price: 229, retailer: 'IKEA', dims: [4.5, 6.4, 2.2], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/ColgateBed.glb', modelRotationY: Math.PI / 2, tintMaterial: true, bedHeights: BED_RISER_HEIGHTS, mattressSurfaceY: 1.1, relatedIds: ['mattress-topper', 'sheet-set', 'nightstand', 'chk:mattress-protector', 'chk:comforter'] },
  // Rendered as two Colgate frames stacked (bottom bunk's own frame, then a second copy fused on
  // top via the same stackedModelUrl mechanism colgate-bed uses for its mattress) rather than one
  // model stretched to the full 5.5' height — a single stretched frame would just look like one
  // oversized, distorted bed rather than an actual bunk. primaryModelFitDims sizes the bottom
  // frame to its own real proportions instead of the item's full dims (see _loadItemMesh in
  // roomEngine.js); dims stays the true overall footprint/height for room clamping and stacking.
  // No bedHeights — real Colgate bunks are a fixed configuration, no peg adjustment.
  { id: 'bed-bunk', name: 'Bunk Bed Frame', price: 349, retailer: 'Amazon', dims: [3.4, 6.5, 5.5], primaryModelFitDims: [3.4, 6.5, 2.75], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/ColgateBed.glb', modelRotationY: Math.PI / 2, tintMaterial: true, stackedModelUrl: '/models/ColgateBed.glb', stackedModelRotationY: Math.PI / 2, stackedDims: [3.4, 6.5, 2.75], stackedYOffset: 2.75, stackedColor: 0x8a6b4f, relatedIds: ['mattress-topper', 'sheet-set', 'chk:mattress-protector', 'chk:pillowcases', 'chk:comforter'] },
  { id: 'underbed-bins', name: 'Under-Bed Storage Bins (2)', price: 24, retailer: 'Target', dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed'] },
  { id: 'storage-drawers', name: 'Rolling Storage Drawers', price: 45, retailer: 'Amazon', dims: [2.5, 1.5, 1.3], color: 0x8a8a8a, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cabinetBedDrawer.glb', relatedIds: ['dresser'] },
  { id: 'nightstand', name: 'Nightstand', price: 39, retailer: 'IKEA', dims: [1.5, 1.5, 2.0], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/sideTableDrawers.glb', relatedIds: ['bed', 'desk-lamp'] },
  { id: 'dresser', name: 'Dresser', price: 129, retailer: 'IKEA', dims: [2.6, 2.0, 2.2], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/kitchenCabinetDrawer.glb', relatedIds: ['mirror'] },
  // Same real item/model as Colgate's provided "Stackable Chest" (see PROVIDED_CATALOG below) —
  // this is the purchasable version, for a student who wants a second one or whose room didn't
  // come with one. Unlike the provided furniture, this one has a price and counts toward the
  // shopping list, since it's genuinely something you'd buy. tintMaterial: true because
  // colgateChest.glb (like the rest of Tyler's Colgate models) came out of Blender as flat gray
  // with no material color — see the note above PROVIDED_CATALOG.
  { id: 'stackable-chest', name: 'Stackable Chest', price: 79, retailer: 'IKEA', dims: [2.58, 2.0, 1.58], color: 0xc9a876, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/colgateChest.glb', tintMaterial: true, relatedIds: ['dresser'] },
  { id: 'wardrobe', name: 'Portable Wardrobe', price: 69, retailer: 'Amazon', dims: [2.3, 1.5, 4.6], color: 0x6f7f8c, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/bookcaseClosedDoors.glb', relatedIds: ['shoe-rack', 'cubes', 'chk:hangers', 'chk:vacuum-storage-bags'] },
  { id: 'cubes', name: 'Storage Cubes (6)', price: 45, retailer: 'Target', dims: [2.6, 1.1, 2.4], color: 0xc9c9c9, category: 'Furniture & Organization', subcategory: 'Closet', relatedIds: ['wardrobe', 'chk:command-hooks'] },
  { id: 'shoe-rack', name: 'Shoe Rack', price: 29, retailer: 'Target', dims: [2.5, 1.0, 2.5], color: 0x6b4f36, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/bookcaseOpenLow.glb', relatedIds: ['wardrobe'] },
  { id: 'hamper', name: 'Laundry Hamper', price: 19, retailer: 'Target', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'desk', name: 'Compact Desk', price: 99, retailer: 'IKEA', dims: [3.9, 2.0, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/desk.glb', relatedIds: ['chair', 'lamp', 'shelf', 'chk:desk-organizer', 'chk:pencil-holder'] },
  { id: 'desk-corner', name: 'Corner Desk', price: 149, retailer: 'IKEA', dims: [4.5, 4.5, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/deskCorner.glb', relatedIds: ['chair', 'lamp', 'shelf'] },
  { id: 'chair', name: 'Desk Chair', price: 79, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0x3a3a3a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairDesk.glb', relatedIds: ['desk'] },
  { id: 'chair-cushion', name: 'Cushioned Desk Chair', price: 89, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairCushion.glb', relatedIds: ['desk'] },
  { id: 'chair-rounded', name: 'Rounded-Back Chair', price: 69, retailer: 'Amazon', dims: [1.7, 1.7, 3.0], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairRounded.glb', relatedIds: ['desk'] },
  { id: 'shelf', name: 'Bookshelf', price: 59, retailer: 'IKEA', dims: [2.5, 1.0, 4.0], color: 0x9c7a4d, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseOpen.glb', relatedIds: ['desk', 'chk:books'] },
  { id: 'shelf-closed', name: 'Closed Bookshelf', price: 79, retailer: 'IKEA', dims: [2.5, 1.2, 4.0], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseClosed.glb', relatedIds: ['desk'] },
  { id: 'shelf-wide', name: 'Wide Bookshelf', price: 99, retailer: 'IKEA', dims: [3.5, 1.2, 3.6], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseClosedWide.glb', relatedIds: ['desk'] },
  { id: 'rolling-cart', name: 'Rolling Storage Cart', price: 39, retailer: 'Amazon', dims: [1.3, 1.3, 2.8], color: 0xc9c9c9, category: 'Furniture & Organization', subcategory: 'General Storage', relatedIds: ['chk:fabric-bins'] },
  { id: 'ottoman', name: 'Folding Storage Ottoman', price: 34, retailer: 'Target', dims: [1.5, 1.5, 1.3], color: 0x9c7a4d, category: 'Furniture & Organization', subcategory: 'General Storage', modelUrl: '/models/loungeSofaOttoman.glb', relatedIds: ['throw-pillow', 'rug'] },
  { id: 'lamp', name: 'Floor Lamp', price: 34, retailer: 'Target', dims: [1.0, 1.0, 5.2], color: 0xe8a33d, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundFloor.glb', relatedIds: ['accent-chair', 'chk:string-lights'] },
  { id: 'lamp-square', name: 'Square Floor Lamp', price: 39, retailer: 'Target', dims: [1.0, 1.0, 5.2], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampSquareFloor.glb', relatedIds: ['accent-chair', 'chk:string-lights'] },
  { id: 'desk-lamp', name: 'Desk Lamp', price: 19, retailer: 'Amazon', dims: [0.8, 0.8, 1.6], color: 0xc9b18a, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundTable.glb', relatedIds: ['desk', 'nightstand'] },
  // Seating: no non-desk-chair option existed before this — a bean bag already lived under
  // Optional Luxury Items, but nothing here covered "an actual chair or small sofa to sit in
  // that isn't at the desk."
  { id: 'accent-chair', name: 'Accent Chair', price: 149, retailer: 'IKEA', dims: [2.6, 2.6, 2.8], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Seating', modelUrl: '/models/loungeChair.glb', relatedIds: ['lamp', 'rug', 'throw-pillow'] },
  { id: 'loveseat', name: 'Loveseat', price: 299, retailer: 'Amazon', dims: [4.3, 2.6, 2.8], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Seating', modelUrl: '/models/loungeSofa.glb', relatedIds: ['throw-pillow', 'rug', 'lamp'] },
  { id: 'tv', name: 'TV (43")', price: 249, retailer: 'Best Buy', dims: [3.2, 0.3, 1.9], color: 0x1b1b1b, category: 'Furniture & Organization', subcategory: 'Entertainment', modelUrl: '/models/televisionModern.glb', relatedIds: ['chk:streaming-device', 'chk:gaming-console', 'chk:bluetooth-speaker'] },

  // ---- Kitchen & Food ----
  { id: 'fridge', name: 'Mini Fridge', price: 139, retailer: 'Best Buy', dims: [1.6, 1.8, 2.9], color: 0xe4e4e4, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['microwave', 'snack-cart'] },
  { id: 'microwave', name: 'Microwave', price: 79, retailer: 'Best Buy', dims: [1.8, 1.4, 1.0], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenMicrowave.glb', relatedIds: ['fridge', 'chk:microwave-safe-containers'] },
  { id: 'coffee-maker', name: 'Coffee Maker', price: 39, retailer: 'Target', dims: [0.7, 0.9, 1.1], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['electric-kettle', 'fridge'] },
  { id: 'electric-kettle', name: 'Electric Kettle', price: 25, retailer: 'Amazon', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },

  // ---- Cleaning Supplies ----
  { id: 'trash-can', name: 'Trash Can', price: 15, retailer: 'Target', dims: [1.0, 1.0, 1.8], color: 0x7a7a7a, category: 'Cleaning Supplies', subcategory: 'Trash', modelUrl: '/models/trashcan.glb', relatedIds: ['chk:trash-bags', 'chk:recycling-bin'] },
  { id: 'handheld-vacuum', name: 'Handheld Vacuum', price: 45, retailer: 'Target', dims: [0.5, 1.1, 0.6], color: 0x3a3a3a, category: 'Cleaning Supplies', subcategory: 'Trash', relatedIds: ['trash-can'] },

  // ---- Laundry ----
  { id: 'drying-rack', name: 'Drying Rack', price: 25, retailer: 'Amazon', dims: [2.0, 1.3, 3.3], color: 0xb0b0b0, category: 'Laundry', subcategory: 'Optional', modelUrl: '/models/coatRackStanding.glb', relatedIds: ['hamper', 'chk:detergent'] },
  { id: 'ironing-board', name: 'Ironing Board', price: 30, retailer: 'Amazon', dims: [4.0, 1.1, 2.9], color: 0xd8d8d8, category: 'Laundry', subcategory: 'Optional', relatedIds: ['chk:iron'] },

  // ---- Sleep & Comfort ----
  { id: 'fan', name: 'Fan', price: 25, retailer: 'Target', dims: [1.3, 1.3, 3.3], color: 0xe4e4e4, category: 'Sleep & Comfort', relatedIds: ['chk:humidifier'] },

  // ---- Entertainment ----
  { id: 'instrument', name: 'Musical Instrument', price: 199, retailer: 'Amazon', dims: [1.3, 0.5, 3.5], color: 0x8a6b4f, category: 'Entertainment', subcategory: 'Hobbies', relatedIds: ['shelf'] },

  // ---- Decor ----
  { id: 'rug', name: 'Area Rug 5x3', price: 49, retailer: 'Amazon', dims: [5.0, 3.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRectangle.glb', relatedIds: ['throw-pillow', 'plant'] },
  { id: 'rug-round', name: 'Round Rug', price: 39, retailer: 'Target', dims: [4.0, 4.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRound.glb', relatedIds: ['throw-pillow'] },
  { id: 'rug-square', name: 'Square Rug', price: 45, retailer: 'Target', dims: [4.0, 4.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugSquare.glb', relatedIds: ['throw-pillow'] },
  { id: 'plant', name: 'Potted Plant', price: 29, retailer: 'Target', dims: [1.3, 1.3, 2.5], color: 0x4d6b3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/pottedPlant.glb', relatedIds: ['rug'] },
  { id: 'throw-pillow', name: 'Throw Pillow', price: 15, retailer: 'Target', dims: [1.3, 1.3, 1.3], color: 0xc27a5e, category: 'Decor', subcategory: 'Room', modelUrl: '/models/pillow.glb', relatedIds: ['loveseat', 'accent-chair'] },
  { id: 'mirror', name: 'Full-Length Mirror', price: 29, retailer: 'Target', dims: [1.3, 0.2, 4.9], color: 0xaad4e8, category: 'Decor', subcategory: 'Wall', relatedIds: ['dresser'] },
  { id: 'poster', name: 'Poster', price: 12, retailer: 'Amazon', dims: [2.0, 0.05, 2.7], color: 0x4d6373, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster-landscape', 'flag'] },
  { id: 'poster-landscape', name: 'Wide Print Poster', price: 18, retailer: 'Amazon', dims: [3.0, 0.05, 2.0], color: 0x6b4f36, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster', 'tapestry'] },
  { id: 'flag', name: 'Flag / Banner', price: 15, retailer: 'Amazon', dims: [3.0, 0.05, 1.8], color: 0xb5654a, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster', 'tapestry'] },
  { id: 'tapestry', name: 'Tapestry', price: 22, retailer: 'Amazon', dims: [4.5, 0.05, 5.5], color: 0x7a3f6b, category: 'Decor', subcategory: 'Wall', relatedIds: ['flag', 'chk:string-lights'] },
  { id: 'corkboard', name: 'Corkboard', price: 14, retailer: 'Target', dims: [2.0, 0.1, 1.5], color: 0xc9a876, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster'] },
  { id: 'wall-clock', name: 'Wall Clock', price: 16, retailer: 'Target', dims: [1.0, 0.1, 1.0], color: 0x2b2b2b, category: 'Decor', subcategory: 'Wall', relatedIds: ['mirror'] },

  // ---- Optional Luxury Items ----
  { id: 'beanbag', name: 'Bean Bag Chair', price: 69, retailer: 'Amazon', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'snack-cart', name: 'Snack Cart', price: 49, retailer: 'Amazon', dims: [1.5, 1.3, 2.5], color: 0xb08d57, category: 'Optional Luxury Items', modelUrl: '/models/sideTable.glb', relatedIds: ['bev-cooler', 'fridge'] },
  { id: 'bev-cooler', name: 'Beverage Cooler', price: 89, retailer: 'Best Buy', dims: [1.6, 1.6, 2.6], color: 0xe4e4e4, category: 'Optional Luxury Items', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['snack-cart'] },
]

// Furniture Colgate already provides in every standard residence hall room — the student isn't
// buying these, so they're kept separate from CATALOG (the purchasable list) and carry
// isProvided: true instead of a price. Source: Colgate Office of Residential Life, "Standard
// Residence Hall Furniture," updated 6.1.2026 (PDF). Room-variant sizes (Curtis Hall's smaller
// desk, taller 3-drawer chests) are skipped for v1 — these are the standard-room dimensions,
// verified against the PDF's own numbers.
//
// modelUrl points at Tyler's own Blender models (public/models/colgate*.glb, ColgateBed.glb
// capitalized differently from the rest since that's how the file was delivered) — real,
// purpose-built matches for each item rather than the closest free CC0 stand-in from Kenney's
// kit. These replaced the earlier Kenney placeholders (bedFrameBare.glb's surgically-edited
// headboard, chair.glb, desk.glb, bookcaseClosedDoors.glb) everywhere in this list.
//
// Two fixups every one of these models needed once actually placed in a room:
// - tintMaterial: true — every colgate*.glb exported from Blender with a flat 50% gray material
//   and no texture, so they all rendered as gray plastic instead of the PDF's light oak. The
//   engine now repaints the model's material to the item's own `color` (see _tintModel in
//   roomEngine.js) — same beige (#c9a876) already used for the box-placeholder fallback.
// - modelRotationY (bed only) — ColgateBed.glb's headboard/footboard rail panels came in aligned
//   to the model's long axis instead of its short one, so non-uniform scale-to-dims stretched the
//   rail panel across the bed's long side instead of the head/foot ends. A 90° pre-rotation before
//   fitting swaps which local axis lands on width vs. depth.
//
// The Stackable Chest is deliberately NOT in this list — see 'stackable-chest' in CATALOG above.
// Colgate doesn't guarantee every room gets one (the PDF's own wording is about variation between
// rooms), so it isn't auto-placed as "provided", but it's the exact same real item/model, just
// treated as purchasable.
export const PROVIDED_CATALOG = [
  // The mattress (Twin XL Mattress, colgateMattress.glb, real dims [6.67, 3.08, 0.5]) isn't a
  // separate catalog entry anymore — Tyler wanted the bed to read as one piece rather than two
  // items a student could accidentally separate or delete independently, so it's fused on via
  // stackedModelUrl/stackedDims/stackedColor: the engine loads it as a second model, sizes it to
  // its own real dims, and sets it on top at stackedYOffset (see _loadItemMesh).
  // stackedYOffset (1.0ft) is NOT "frame height minus mattress height" — ColgateBed.glb's tall
  // corner posts/rails reach the full 3.0ft dims height, but the actual slat surface the mattress
  // rests on sits much lower. Found by parsing the glb's POSITION accessor directly (no separate
  // "slats" node to target — it's one merged mesh) and histogramming vertex Y values: ~41% of all
  // 334k vertices cluster in a thin band around y=0.23-0.25 (of a 0-0.826 local height range) —
  // an unmistakable flat plateau, i.e. the slat base — versus ~1000 vertices per bin everywhere
  // else (the thin corner posts). That local band scales to ~0.9-1.1ft of world height once
  // stretched to the 3.0ft dims target; 1.0ft is the middle of that, confirmed visually.
  // bedHeights (BED_RISER_HEIGHTS, same as every other adjustable bed) raises the *whole* frame —
  // legs, rails, and the fused mattress together, since the mattress is a child positioned
  // relative to this frame's own transform — rather than sliding the mattress up independently of
  // a frame that stays put. 'low' is 0, matching the frame's original unmodified floor position,
  // so existing saved layouts render unchanged by default. mattressSurfaceY is the *top* of the
  // fused mattress (stackedYOffset + its own 0.5ft thickness), so anything additionally stacked on
  // this bed rests on top of the mattress rather than clipping into it.
  { id: 'colgate-bed', name: 'Twin XL Bed Frame', modelNo: '146RF', dims: [7.0, 3.08, 3.0], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/ColgateBed.glb', modelRotationY: Math.PI / 2, tintMaterial: true, stackedModelUrl: '/models/colgateMattress.glb', stackedDims: [6.67, 3.08, 0.5], stackedColor: 0xd8cbb0, stackedYOffset: 1.0, bedHeights: BED_RISER_HEIGHTS, mattressSurfaceY: 1.5, relatedIds: ['chk:mattress-topper-memory-foam-gel-egg-crate', 'chk:mattress-protector', 'chk:pillowcases', 'chk:comforter', 'chk:bed-risers'] },
  { id: 'colgate-desk', name: 'Panel Desk', modelNo: '205C42', dims: [3.5, 2.0, 2.5], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateDesk.glb', tintMaterial: true, relatedIds: ['lamp', 'shelf', 'chk:desk-organizer', 'chk:pencil-holder'] },
  { id: 'colgate-chair', name: 'Desk Chair', modelNo: '095', dims: [1.5, 1.83, 2.75], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateChair.glb', tintMaterial: true, relatedIds: ['colgate-desk'] },
  { id: 'colgate-wardrobe', name: 'Two Door Wardrobe', modelNo: '214-2', dims: [3.0, 2.08, 6.0], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateWardrobe.glb', tintMaterial: true, relatedIds: ['shoe-rack', 'cubes', 'chk:hangers', 'chk:vacuum-storage-bags'] },
]

// Default positions for the "Add Colgate furniture" one-click action — against the back wall
// (bed) and the two side walls (desk/chair, wardrobe), scaled to whatever the current room
// dimensions are. Not meant to be clever, just non-overlapping and roughly plausible; the engine's
// normal wall-clamping still applies as a safety net for small rooms.
export function colgateDefaultLayout(room) {
  const byId = Object.fromEntries(PROVIDED_CATALOG.map((c) => [c.id, c]))
  const margin = 0.3
  const bed = byId['colgate-bed']
  const desk = byId['colgate-desk']
  const chair = byId['colgate-chair']
  const wardrobe = byId['colgate-wardrobe']

  const wardrobeZ = -room.l / 2 + wardrobe.dims[0] / 2 + margin

  return [
    // Bed: long side flush against the back wall.
    { catalogId: bed.id, x: 0, z: -room.l / 2 + bed.dims[1] / 2, rotY: 0 },
    // Desk against the left wall, rotated 90° so its depth (not width) touches the wall.
    { catalogId: desk.id, x: -room.w / 2 + desk.dims[1] / 2, z: 0, rotY: Math.PI / 2 },
    // Chair pulled out from the desk, facing the same way.
    { catalogId: chair.id, x: -room.w / 2 + desk.dims[1] + margin + chair.dims[1] / 2, z: 0, rotY: Math.PI / 2 },
    // Wardrobe along the right wall.
    { catalogId: wardrobe.id, x: room.w / 2 - wardrobe.dims[1] / 2, z: wardrobeZ, rotY: -Math.PI / 2 },
  ]
}

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
