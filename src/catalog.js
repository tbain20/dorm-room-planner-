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
//
// Tiered items (curated-research pass, see curated-research-FINAL.md): a conceptual item that
// research turned up real budget/moderate/premium picks for (e.g. "Mattress Topper") is 3 separate
// CATALOG entries sharing one `groupId` and a `tier` of 'budget'/'moderate'/'premium', instead of
// one generic entry. groupLabel is the conceptual name shown as the group header in the catalog UI
// (App.jsx groups by groupId and renders a 3-way tier picker — see groupedCatalog there); `name` on
// each entry is the real product name for that tier. The pre-existing single id for each concept
// was kept as the id of its 'moderate' tier (not reassigned to a new id) specifically so old saved
// layouts, and every other item's relatedIds pointing at that id, keep resolving to a real, sane
// item with no migration needed — only budget/premium got new `${groupId}-budget`/`-premium` ids.
// All three tiers of a group reuse the same dims/color/modelUrl — real per-tier dimensions weren't
// researched, and the instruction was to keep the existing generic 3D models rather than source new
// ones to match specific real products. `productUrl` holds Tyler's final confirmed product link
// (see final-product-links.md) for every item that pass covered; it's still null on items that
// pass didn't reach — those fall back to catalogItemLink()'s generic retailer search instead of
// erroring or showing a dead button (see catalogItemLink below). A few final picks are deliberate
// brand/retailer swaps from the original research doc (e.g. mini fridges moved from Best Buy to
// Amazon-listed brands, several Target picks became specific Brightroom SKUs) — `name`/`retailer`
// were updated to match the swap, not left pointing at stale product names. None of these links
// carry Tyler's affiliate tag yet — see AFFILIATE_TAGS below for why. `rating`/`reviewCount` are
// set only where the research doc gave a specific number. Where the doc named a product but not a
// price (a handful of the Laundry Hamper/Microwave/Electric Kettle/Blanket Organizer picks), the
// price below is a reasonable market estimate, not sourced — flagged here so it gets
// double-checked once real pricing is available.
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

// Catalog rows show a real rendered thumbnail for every item — a glTF model render for items with
// modelUrl, or a rendered placeholder box (same shape/color you'd actually see in the room) for
// items without one — see thumbnailRenderer.js. CatalogThumb in App.jsx falls back to a plain
// color swatch + category icon only if the image genuinely fails to load (a 404, or a catalog
// item added after the last `generateAllThumbnails()` run — see that file for how to regenerate).
export function thumbnailUrl(cat) {
  return `/thumbnails/${cat.thumbnailSourceId || cat.id}.png`
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
// roomEngine.js) get a bedHeights map: the fixed local Y (in feet, within the frame's own space)
// that the fused mattress's *bottom* sits at for each preset — modeling how a real Colgate frame
// has a few peg positions the mattress/rails attach at while the frame's own legs and posts stay
// on the floor the whole time. The frame itself never moves; only the mattress (a separate model
// fused on via extraModels — see _loadItemMesh) slides to a different peg. 'standard' always
// matches whatever the frame originally looked like before height presets existed, so a
// freshly-placed bed (and any pre-existing saved layout) renders unchanged by default. Bunk beds
// don't get this — real Colgate bunks are a fixed configuration, no peg adjustment — their two
// mattresses (see bed-bunk below) just sit at one fixed height each.
const COLGATE_BED_HEIGHTS = { low: 0.5, standard: 1.0, lofted: 2.2 } // colgate-bed: 3.0ft frame
const FULL_BED_HEIGHTS = { low: 0.4, standard: 0.8, lofted: 1.6 } // bed-full: 2.2ft frame

export const CATALOG = [
  // ---- Bedding ----
  // No standalone "mattress" prop — every bed frame (colgate-bed, bed-full, bed-bunk) now fuses
  // its own real mattress model on via extraModels, so a separate mattress box wasn't adding
  // anything besides a stacking target. These are the loose bedding layers a student actually
  // shops for, meant to be stacked directly onto a bed's fused mattress (topper → sheets →
  // comforter → pillow — see roomEngine.js's multi-level stacking) via "Put on top of…". Flat,
  // thin placeholder boxes sized to a twin mattress footprint, except the pillow, which reuses the
  // existing pillow.glb (distinct catalog entry from Decor's 'throw-pillow' — same model,
  // different price/category/relatedIds).
  // Mattress Topper — ✅ fully researched (see curated-research-FINAL.md).
  { id: 'mattress-topper-budget', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'budget', name: 'Serta ThermaGel 2" Mattress Topper', price: 65, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08897N2KB', dims: [3.3, 6.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  { id: 'mattress-topper', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'moderate', name: 'ViscoSoft Select 3" Mattress Topper', price: 136, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B01MSL0UA3', dims: [3.3, 6.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  { id: 'mattress-topper-premium', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'premium', name: 'Tempur-Adapt Supreme Mattress Topper', price: 269, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00HEODIZY', dims: [3.3, 6.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  // Mattress Protector — ⚠️ reasonable pick, not tiered (research: budget/moderate are
  // "effectively interchangeable" in this category, no real premium tier) — single entry.
  { id: 'mattress-protector', name: 'SafeRest Waterproof Mattress Protector', price: 25, retailer: 'Amazon', productUrl: null, dims: [3.3, 6.3, 0.15], color: 0xf2efe6, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-topper', 'sheet-set', 'bed-full', 'colgate-bed'] },
  // Twin XL Sheets — ✅ fully researched. Retailer switched Target → Amazon for all three tiers:
  // the researched products (Amazon Basics/Mellanni/LuxClub) are all primarily Amazon listings.
  { id: 'sheet-set-budget', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'budget', name: 'Amazon Basics Microfiber Sheet Set', price: 23, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00Q7O9OIM', dims: [3.3, 6.3, 0.1], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  { id: 'sheet-set', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'moderate', name: 'Mellanni Microfiber Sheet Set', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00NLLUMOE', dims: [3.3, 6.3, 0.1], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  { id: 'sheet-set-premium', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'premium', name: 'Pure Bamboo Sheets', price: 34, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07DZTQ4JC', dims: [3.3, 6.3, 0.1], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  // Comforter — ✅ fully researched. Retailer switched Target → Amazon, same reasoning as sheets.
  { id: 'comforter-budget', groupId: 'comforter', groupLabel: 'Comforter', tier: 'budget', name: 'Bedsure Reversible Comforter', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0BTHK7NW4', dims: [3.5, 5.5, 0.5], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  { id: 'comforter', groupId: 'comforter', groupLabel: 'Comforter', tier: 'moderate', name: 'CozyLux Down-Alternative Comforter Set (5-pc)', price: 48, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0H154HN7T', dims: [3.5, 5.5, 0.5], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  { id: 'comforter-premium', groupId: 'comforter', groupLabel: 'Comforter', tier: 'premium', name: 'Evercool Comforter', price: 70, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0CHR8KYVW', dims: [3.5, 5.5, 0.5], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  // Pillow — ✅ fully researched. Budget tier is a listed 2-pack ($38/pair per the research); the
  // other two tiers are single pillows — kept faithful to the doc's own listed prices rather than
  // normalizing to a per-pillow rate.
  { id: 'bed-pillow-budget', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'budget', name: 'Beckham Hotel Collection Pillow (2-Pack)', price: 38, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0D9WWKGDF', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillow.glb', relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  { id: 'bed-pillow', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'moderate', name: 'Coop Home Goods Memory Foam Pillow', price: 27, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00EINBSEW', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillow.glb', relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  { id: 'bed-pillow-premium', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'premium', name: 'Tempur-Pedic TEMPUR-Cloud Pillow (2-Pack)', price: 65, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FJZT5841', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillow.glb', relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  { id: 'pillowcase-set', name: 'Pillowcase Set', price: 12, retailer: 'Target', dims: [1.7, 2.3, 0.1], color: 0xe0d8c4, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['bed-pillow', 'sheet-set'] },
  // Blanket/Comforter Organizer — new addition from the final-links pass (not part of the
  // original researched category list). Filed under Bedding/Storage since it's meant to pair
  // with the comforter/sheet items above (off-season storage), not general room storage. Price
  // is a market estimate — the final-links doc gave a link but no price (see note at top of file).
  { id: 'blanket-organizer', name: 'Lifewit Blanket/Comforter Organizer', price: 20, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09ZV2TX28', dims: [2.0, 1.3, 1.0], color: 0xd6d0c4, category: 'Bedding', subcategory: 'Storage', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['comforter', 'sheet-set', 'bed-pillow'] },

  // ---- Furniture & Organization ----
  // No plain "Twin XL Bed Frame" here anymore — colgate-bed (below, in PROVIDED_CATALOG) already
  // covers the twin XL need with a real mattress and adjustable height, so a separate purchasable
  // twin using a different (Kenney-kit) model was redundant. bed-full and bed-bunk below fill out
  // the purchasable side for students who want a bigger bed or a bunk. Same category/id-suffix
  // convention as the Colgate-chest/purchasable-chest split elsewhere: full/double doesn't fit a
  // standard dorm frame, but plenty of this app's users aren't in a dorm at all (apartment,
  // off-campus) — see the "not every user is a Colgate student" note on the Colgate section below.
  //
  // Both render as the real Colgate bed pieces — same tintMaterial treatment and color as
  // colgate-bed below. colgateHeadboard.glb (the head/footboard + posts only, no base) is the
  // primary model, needs no rotation — see the "which axis is long" note below. The slat base +
  // mattress fuse on via extraModels' movesWithHeight (same mechanism colgate-bed uses — see
  // _loadItemMesh/setBedHeight in roomEngine.js) so both slide together to whichever height preset
  // is selected, sliding on the headboard/footboard posts rather than a frame that moves with them.
  //
  // dims are listed [long axis, short axis, height] here — width > depth — matching colgate-bed's
  // own convention below, NOT the usual width < depth convention most other items use. That's not
  // cosmetic: colgateSlat.glb (like the old merged ColgateBed.glb, which colgateSlat was carved out
  // of) needs its 90° rotation to land its slats running the right way — a fixed fact of the model
  // + rotation, independent of dims/scale (see _fitModelToDims) — so dims[0] has to be the long
  // head-to-foot measurement or the slats end up running lengthwise instead of across the bed.
  // colgateHeadboard.glb, unlike colgateSlat/the old merged frame, was exported with its head/foot
  // boards already spread along local X — confirmed by histogramming its vertex positions (almost
  // all mass sits at the two extremes of local X with a dead gap in between, i.e. the two boards),
  // so it needs no modelRotationY at all.
  //
  // floorNudge is a stopgap for a real imprecision in colgateHeadboard.glb itself (not something
  // dims/rotation can fix): its four corner-post bottoms aren't quite coplanar — measured by
  // finding each post's own lowest vertex, the worst is ~0.094 raw units above the model's true
  // lowest point (~4" once scaled to a 3ft frame), which is what a normal floor-align picks as
  // y=0 — so the other three posts would float above the floor by varying amounts, most visibly
  // making the headboard end look tilted/short-legged. Nudging the whole model down by that same
  // ~0.094-raw-unit gap (scaled to this item's own height) instead makes the *worst* post the one
  // that's flush and sinks the rest slightly into the floor, which is invisible rather than
  // floating (the opaque floor occludes anything below y=0, and the camera can never see under
  // it). The real fix is leveling those four post bottoms in Blender and re-exporting — this is
  // just damage control until that happens.
  {
    id: 'bed-full', name: 'Full-Size Bed Frame', price: 229, retailer: 'IKEA', dims: [6.4, 4.5, 2.2], color: 0xc9a876,
    category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/colgateHeadboard.glb', tintMaterial: true, floorNudge: 0.25,
    bedHeights: FULL_BED_HEIGHTS,
    extraModels: [
      { modelUrl: '/models/colgateSlat.glb', dims: [6.1, 4.2, 0.25], rotationY: Math.PI / 2, color: 0xc9a876, movesWithHeight: true, stackOffset: 0 },
      { modelUrl: '/models/colgateMattress.glb', dims: [6.2, 4.2, 0.5], color: 0xd8cbb0, movesWithHeight: true, stackOffset: 0.25 },
    ],
    relatedIds: ['mattress-topper', 'sheet-set', 'nightstand', 'chk:mattress-protector', 'chk:comforter'],
  },
  // Rendered as two Colgate frames stacked (bottom bunk's own frame, then a second copy fused on
  // via extraModels) rather than one model stretched to the full 5.5' height — a single stretched
  // frame would just look like one oversized, distorted bed rather than an actual bunk.
  // primaryModelFitDims sizes the bottom frame to its own real proportions instead of the item's
  // full dims (see _loadItemMesh in roomEngine.js); dims stays the true overall footprint/height
  // for room clamping and stacking. Each bunk gets its own fused mattress the same way bed-full
  // does, at a fixed height on its own frame — no bedHeights here, since real Colgate bunks are a
  // fixed configuration with no peg adjustment.
  {
    id: 'bed-bunk', name: 'Bunk Bed Frame', price: 349, retailer: 'Amazon', dims: [6.5, 3.4, 5.5], primaryModelFitDims: [6.5, 3.4, 2.75], color: 0xc9a876,
    category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/ColgateBed.glb', modelRotationY: Math.PI / 2, tintMaterial: true,
    extraModels: [
      { modelUrl: '/models/ColgateBed.glb', dims: [6.5, 3.4, 2.75], rotationY: Math.PI / 2, color: 0xc9a876, yOffset: 2.75 }, // top bunk's own frame
      { modelUrl: '/models/colgateMattress.glb', dims: [6.2, 3.2, 0.5], color: 0xd8cbb0, yOffset: 0.9 }, // bottom bunk mattress — fixed, no bedHeights on this item to move it with
      { modelUrl: '/models/colgateMattress.glb', dims: [6.2, 3.2, 0.5], color: 0xd8cbb0, yOffset: 3.65 }, // top bunk mattress — fixed, same reason
    ],
    relatedIds: ['mattress-topper', 'sheet-set', 'chk:mattress-protector', 'chk:pillowcases', 'chk:comforter'],
  },
  // Storage Bins — ✅ fully researched. Mapped onto the existing under-bed-bins slot as the
  // closest match to the research's generic "Storage Bins" category; premium ($30) is cheaper
  // than moderate ($84) because that's genuinely what the research turned up (a rolling cart vs.
  // a modular drawer set aren't directly comparable on price) — left as-is rather than reordered.
  { id: 'underbed-bins-budget', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'budget', name: 'Amazon Basics Collapsible Fabric Storage Bins (6-Pack)', price: 14, retailer: 'Amazon', productUrl: null, dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  { id: 'underbed-bins', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'moderate', name: 'Target Brightroom 3-Drawer Wide Cart', price: 84, retailer: 'Target', productUrl: 'https://www.target.com/p/3-drawer-wide-cart-white-brightroom/-/A-84242464', dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  { id: 'underbed-bins-premium', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'premium', name: 'IRIS USA Stackable Storage Drawers', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09C2QM669', dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  { id: 'storage-drawers', name: 'Rolling Storage Drawers', price: 45, retailer: 'Amazon', dims: [2.5, 1.5, 1.3], color: 0x8a8a8a, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cabinetBedDrawer.glb', relatedIds: ['dresser'] },
  { id: 'nightstand', name: 'Nightstand', price: 39, retailer: 'IKEA', dims: [1.5, 1.5, 2.0], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/sideTableDrawers.glb', relatedIds: ['bed-full', 'desk-lamp'] },
  { id: 'dresser', name: 'Dresser', price: 129, retailer: 'IKEA', dims: [2.6, 2.0, 2.2], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/kitchenCabinetDrawer.glb', relatedIds: ['mirror'] },
  // Same real item/model as Colgate's provided "Stackable Chest" (see PROVIDED_CATALOG below) —
  // this is the purchasable version, for a student who wants a second one or whose room didn't
  // come with one. Unlike the provided furniture, this one has a price and counts toward the
  // shopping list, since it's genuinely something you'd buy. tintMaterial: true because
  // colgateChest.glb (like the rest of Tyler's Colgate models) came out of Blender as flat gray
  // with no material color — see the note above PROVIDED_CATALOG.
  { id: 'stackable-chest', name: 'Stackable Chest', price: 79, retailer: 'IKEA', dims: [2.58, 2.0, 1.58], color: 0xc9a876, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/colgateChest.glb', tintMaterial: true, relatedIds: ['dresser'] },
  { id: 'wardrobe', name: 'Portable Wardrobe', price: 69, retailer: 'Amazon', dims: [2.3, 1.5, 4.6], color: 0x6f7f8c, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/bookcaseClosedDoors.glb', relatedIds: ['shoe-rack', 'cubes', 'closet-organizer', 'chk:hangers', 'chk:vacuum-storage-bags'] },
  { id: 'cubes', name: 'Storage Cubes (6)', price: 45, retailer: 'Target', dims: [2.6, 1.1, 2.4], color: 0xc9c9c9, category: 'Furniture & Organization', subcategory: 'Closet', relatedIds: ['wardrobe', 'chk:command-hooks'] },
  // Closet Organizer — ⚠️ reasonable pick, not tiered (long-tail commodity pass, see
  // remaining-longtail-picks.md) — single entry, same "no productUrl yet" convention as every
  // other unlinked item until Tyler grabs a real listing.
  { id: 'closet-organizer', name: 'Over-Door Hanging Pocket Organizer (24-Pocket)', price: 15, retailer: 'Amazon', productUrl: null, dims: [1.5, 0.3, 4.0], color: 0x9c8a6b, category: 'Furniture & Organization', subcategory: 'Closet', relatedIds: ['wardrobe', 'colgate-wardrobe', 'chk:hangers'] },
  { id: 'shoe-rack', name: 'Shoe Rack', price: 29, retailer: 'Target', dims: [2.5, 1.0, 2.5], color: 0x6b4f36, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/bookcaseOpenLow.glb', relatedIds: ['wardrobe'] },
  // Laundry Hamper — ✅ fully researched, though the doc didn't list prices for any of the three
  // picks — the prices below are market estimates, not sourced (see the note at the top of this
  // file); double-check them along with productUrl.
  { id: 'hamper-budget', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'budget', name: 'Handy Laundry Collapsible Mesh Pop-Up Hamper (2-Pack)', price: 16, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07CGXZFW6', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'hamper', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'moderate', name: 'Target Brightroom Rolling Hamper', price: 32, retailer: 'Target', productUrl: 'https://www.target.com/p/br-rolling-hamper-white-brightroom/-/A-93226286', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'hamper-premium', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'premium', name: 'Bukere Backpack-Style Laundry Hamper', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09ZP93SDM', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'desk', name: 'Compact Desk', price: 99, retailer: 'IKEA', dims: [3.9, 2.0, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/desk.glb', relatedIds: ['chair', 'lamp', 'shelf', 'desk-organizer', 'monitor-stand', 'chk:pencil-holder'] },
  { id: 'desk-corner', name: 'Corner Desk', price: 149, retailer: 'IKEA', dims: [4.5, 4.5, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/deskCorner.glb', relatedIds: ['chair', 'lamp', 'shelf'] },
  { id: 'chair', name: 'Desk Chair', price: 79, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0x3a3a3a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairDesk.glb', relatedIds: ['desk'] },
  { id: 'chair-cushion', name: 'Cushioned Desk Chair', price: 89, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairCushion.glb', relatedIds: ['desk'] },
  { id: 'chair-rounded', name: 'Rounded-Back Chair', price: 69, retailer: 'Amazon', dims: [1.7, 1.7, 3.0], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairRounded.glb', relatedIds: ['desk'] },
  { id: 'shelf', name: 'Bookshelf', price: 59, retailer: 'IKEA', dims: [2.5, 1.0, 4.0], color: 0x9c7a4d, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseOpen.glb', relatedIds: ['desk', 'chk:books'] },
  { id: 'shelf-closed', name: 'Closed Bookshelf', price: 79, retailer: 'IKEA', dims: [2.5, 1.2, 4.0], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseClosed.glb', relatedIds: ['desk'] },
  { id: 'shelf-wide', name: 'Wide Bookshelf', price: 99, retailer: 'IKEA', dims: [3.5, 1.2, 3.6], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/bookcaseClosedWide.glb', relatedIds: ['desk'] },
  // Desk Organizer/Monitor Stand/Cable Management Box/Desk Hutch — long-tail commodity pass (see
  // remaining-longtail-picks.md). Desk Organizer and Monitor Stand replace what used to be
  // checklist-only stubs (desk/colgate-desk's relatedIds pointed at 'chk:desk-organizer') now
  // that the doc named real, well-reviewed products worth actually placing on the desk — same
  // "graduate it to a real catalog entry" treatment earlier sessions gave other items. Cable
  // Management Box and Desk Hutch are the two extra product ideas flagged at the bottom of that
  // doc, not part of the original master list, added here since both are well-reviewed dorm-
  // specific products with a genuine physical footprint worth placing.
  { id: 'desk-organizer', name: 'Poppin All-In-One Desktop Organizer', price: 34, retailer: 'Amazon', productUrl: null, dims: [1.2, 0.7, 0.6], color: 0x6f8a9c, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['desk', 'colgate-desk', 'chk:pencil-holder'] },
  { id: 'monitor-stand', name: 'Wood Desk Riser w/ Storage Shelf', price: 30, retailer: 'Amazon', productUrl: null, dims: [2.0, 1.0, 0.5], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['desk', 'colgate-desk', 'desk-lamp'] },
  { id: 'cable-management-box', name: 'Bamboo Cable Management Box', price: 25, retailer: 'Amazon', productUrl: null, dims: [1.3, 0.6, 0.5], color: 0xc9a876, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['desk', 'colgate-desk', 'desk-hutch'] },
  { id: 'desk-hutch', name: 'Smart Charging Desk Hutch', price: 89, retailer: 'Amazon', productUrl: null, dims: [2.5, 0.8, 1.8], color: 0xe8e0cf, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['desk', 'colgate-desk', 'cable-management-box'] },
  { id: 'rolling-cart', name: 'Rolling Storage Cart', price: 39, retailer: 'Amazon', dims: [1.3, 1.3, 2.8], color: 0xc9c9c9, category: 'Furniture & Organization', subcategory: 'General Storage', relatedIds: ['chk:fabric-bins'] },
  { id: 'ottoman', name: 'Folding Storage Ottoman', price: 34, retailer: 'Target', dims: [1.5, 1.5, 1.3], color: 0x9c7a4d, category: 'Furniture & Organization', subcategory: 'General Storage', modelUrl: '/models/loungeSofaOttoman.glb', relatedIds: ['throw-pillow', 'rug'] },
  { id: 'lamp', name: 'Floor Lamp', price: 34, retailer: 'Target', dims: [1.0, 1.0, 5.2], color: 0xe8a33d, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundFloor.glb', relatedIds: ['accent-chair', 'chk:string-lights'] },
  { id: 'lamp-square', name: 'Square Floor Lamp', price: 39, retailer: 'Target', dims: [1.0, 1.0, 5.2], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampSquareFloor.glb', relatedIds: ['accent-chair', 'chk:string-lights'] },
  // Desk Lamp — ✅ fully researched.
  { id: 'desk-lamp-budget', groupId: 'desk-lamp', groupLabel: 'Desk Lamp', tier: 'budget', name: 'Clamp Lamp', price: 19, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08XQY5LY6', dims: [0.8, 0.8, 1.6], color: 0xc9b18a, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundTable.glb', relatedIds: ['desk', 'nightstand'] },
  { id: 'desk-lamp', groupId: 'desk-lamp', groupLabel: 'Desk Lamp', tier: 'moderate', name: 'BOHON USB-Charging Gooseneck Desk Lamp', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08SK4DMHR', dims: [0.8, 0.8, 1.6], color: 0xc9b18a, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundTable.glb', relatedIds: ['desk', 'nightstand'] },
  { id: 'desk-lamp-premium', groupId: 'desk-lamp', groupLabel: 'Desk Lamp', tier: 'premium', name: 'Govee Smart Desk Lamp', price: 55, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0GQXN36K5', dims: [0.8, 0.8, 1.6], color: 0xc9b18a, category: 'Furniture & Organization', subcategory: 'Lighting', modelUrl: '/models/lampRoundTable.glb', relatedIds: ['desk', 'nightstand'] },
  // Seating: no non-desk-chair option existed before this — a bean bag already lived under
  // Optional Luxury Items, but nothing here covered "an actual chair or small sofa to sit in
  // that isn't at the desk."
  { id: 'accent-chair', name: 'Accent Chair', price: 149, retailer: 'IKEA', dims: [2.6, 2.6, 2.8], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Seating', modelUrl: '/models/loungeChair.glb', relatedIds: ['lamp', 'rug', 'throw-pillow'] },
  { id: 'loveseat', name: 'Loveseat', price: 299, retailer: 'Amazon', dims: [4.3, 2.6, 2.8], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Seating', modelUrl: '/models/loungeSofa.glb', relatedIds: ['throw-pillow', 'rug', 'lamp'] },
  { id: 'tv', name: 'TV (43")', price: 249, retailer: 'Best Buy', dims: [3.2, 0.3, 1.9], color: 0x1b1b1b, category: 'Furniture & Organization', subcategory: 'Entertainment', modelUrl: '/models/televisionModern.glb', relatedIds: ['chk:streaming-device', 'chk:gaming-console', 'bluetooth-speaker'] },

  // ---- Kitchen & Food ----
  // Mini Fridge — ✅ fully researched.
  { id: 'fridge-budget', groupId: 'fridge', groupLabel: 'Mini Fridge', tier: 'budget', name: 'Upstreman Mini Fridge', price: 110, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09W9KSQBL', dims: [1.6, 1.8, 2.9], color: 0xe4e4e4, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['microwave', 'snack-cart'] },
  { id: 'fridge', groupId: 'fridge', groupLabel: 'Mini Fridge', tier: 'moderate', name: 'DUMOS Mini Fridge', price: 150, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0GX9JT4BD', dims: [1.6, 1.8, 2.9], color: 0xe4e4e4, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['microwave', 'snack-cart'] },
  { id: 'fridge-premium', groupId: 'fridge', groupLabel: 'Mini Fridge', tier: 'premium', name: 'Frostorm Mini Fridge', price: 220, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0GLNPDCHL', dims: [1.6, 1.8, 2.9], color: 0xe4e4e4, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['microwave', 'snack-cart'] },
  // Microwave — ✅ fully researched category, but the doc didn't list prices for any of the three
  // picks — estimates, not sourced (see note at top of file).
  { id: 'microwave-budget', groupId: 'microwave', groupLabel: 'Microwave', tier: 'budget', name: 'Chefman Compact Microwave', price: 60, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0DY95T5HB', dims: [1.8, 1.4, 1.0], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenMicrowave.glb', relatedIds: ['fridge', 'chk:microwave-safe-containers'] },
  { id: 'microwave', groupId: 'microwave', groupLabel: 'Microwave', tier: 'moderate', name: 'Farberware 1000W Microwave', price: 80, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B01EIZSF6I', dims: [1.8, 1.4, 1.0], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenMicrowave.glb', relatedIds: ['fridge', 'chk:microwave-safe-containers'] },
  { id: 'microwave-premium', groupId: 'microwave', groupLabel: 'Microwave', tier: 'premium', name: 'Toshiba Microwave', price: 100, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B076VB5JFQ', dims: [1.8, 1.4, 1.0], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', modelUrl: '/models/kitchenMicrowave.glb', relatedIds: ['fridge', 'chk:microwave-safe-containers'] },
  { id: 'coffee-maker', name: 'Coffee Maker', price: 39, retailer: 'Target', dims: [0.7, 0.9, 1.1], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['electric-kettle', 'fridge'] },
  // Electric Kettle — ✅ fully researched category, but the doc didn't list prices for any of the
  // three picks — estimates, not sourced (see note at top of file).
  { id: 'electric-kettle-budget', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'budget', name: 'Amazon Basics Electric Kettle (1500W)', price: 20, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07PHRH6TL', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },
  { id: 'electric-kettle', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'moderate', name: 'Cosori 1.7L Borosilicate Glass Electric Kettle', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0GGXMFNF7', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },
  { id: 'electric-kettle-premium', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'premium', name: 'Meedome Electric Kettle w/ Tea Infuser', price: 40, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0HB5PWW2H', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },

  // ---- Cleaning Supplies ----
  { id: 'trash-can', name: 'Trash Can', price: 15, retailer: 'Target', dims: [1.0, 1.0, 1.8], color: 0x7a7a7a, category: 'Cleaning Supplies', subcategory: 'Trash', modelUrl: '/models/trashcan.glb', relatedIds: ['chk:trash-bags', 'chk:recycling-bin'] },
  { id: 'handheld-vacuum', name: 'Handheld Vacuum', price: 45, retailer: 'Target', dims: [0.5, 1.1, 0.6], color: 0x3a3a3a, category: 'Cleaning Supplies', subcategory: 'Trash', relatedIds: ['trash-can'] },

  // ---- Laundry ----
  { id: 'drying-rack', name: 'Drying Rack', price: 25, retailer: 'Amazon', dims: [2.0, 1.3, 3.3], color: 0xb0b0b0, category: 'Laundry', subcategory: 'Optional', modelUrl: '/models/coatRackStanding.glb', relatedIds: ['hamper', 'chk:detergent'] },
  { id: 'ironing-board', name: 'Ironing Board', price: 30, retailer: 'Amazon', dims: [4.0, 1.1, 2.9], color: 0xd8d8d8, category: 'Laundry', subcategory: 'Optional', relatedIds: ['chk:iron'] },

  // ---- Sleep & Comfort ----
  // Fan — ⚠️ reasonable pick, not tiered (research flags this as a commodity category where a
  // deep roundup wouldn't change the answer) — single entry, renamed to the researched "moderate"
  // pick since it's the most broadly useful of the three options mentioned.
  { id: 'fan', name: 'Tower Fan (Multi-Speed, Remote)', price: 35, retailer: 'Amazon', productUrl: null, dims: [1.3, 1.3, 3.3], color: 0xe4e4e4, category: 'Sleep & Comfort', relatedIds: ['chk:humidifier'] },

  // ---- Entertainment ----
  { id: 'instrument', name: 'Musical Instrument', price: 199, retailer: 'Amazon', dims: [1.3, 0.5, 3.5], color: 0x8a6b4f, category: 'Entertainment', subcategory: 'Hobbies', relatedIds: ['shelf'] },
  // Bluetooth Speaker — ⚠️ reasonable pick, not tiered (long-tail commodity pass, see
  // remaining-longtail-picks.md) — replaces what used to be a checklist-only stub referenced from
  // the TV's relatedIds ('chk:bluetooth-speaker'), now a real placeable entry.
  { id: 'bluetooth-speaker', name: 'Anker Soundcore Bluetooth Speaker', price: 40, retailer: 'Amazon', productUrl: null, dims: [0.6, 0.6, 0.9], color: 0x1b1b1b, category: 'Entertainment', subcategory: 'Hobbies', relatedIds: ['tv', 'desk'] },

  // ---- Decor ----
  // Area Rug — ✅ fully researched (rectangular 5x3 only — rug-round/rug-square below are shape
  // variants the research didn't cover, left as single entries).
  { id: 'rug-budget', groupId: 'rug', groupLabel: 'Area Rug 5x3', tier: 'budget', name: 'OLANLY Washable Shaggy Rug 5x3', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0D9GFHYKV', dims: [5.0, 3.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRectangle.glb', relatedIds: ['throw-pillow', 'plant'] },
  { id: 'rug', groupId: 'rug', groupLabel: 'Area Rug 5x3', tier: 'moderate', name: 'Soalmost Washable Vintage Rug 5x3', price: 42, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0F5Z2JSFC', dims: [5.0, 3.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRectangle.glb', relatedIds: ['throw-pillow', 'plant'] },
  { id: 'rug-premium', groupId: 'rug', groupLabel: 'Area Rug 5x3', tier: 'premium', name: 'Nourison Rug 5x3 (OEKO-TEX Certified)', price: 65, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0CKY1LWLH', dims: [5.0, 3.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRectangle.glb', relatedIds: ['throw-pillow', 'plant'] },
  { id: 'rug-round', name: 'Round Rug', price: 39, retailer: 'Target', dims: [4.0, 4.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugRound.glb', relatedIds: ['throw-pillow'] },
  { id: 'rug-square', name: 'Square Rug', price: 45, retailer: 'Target', dims: [4.0, 4.0, 0.06], color: 0x7a3f3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/rugSquare.glb', relatedIds: ['throw-pillow'] },
  { id: 'plant', name: 'Potted Plant', price: 29, retailer: 'Target', dims: [1.3, 1.3, 2.5], color: 0x4d6b3f, category: 'Decor', subcategory: 'Room', modelUrl: '/models/pottedPlant.glb', relatedIds: ['rug'] },
  { id: 'throw-pillow', name: 'Throw Pillow', price: 15, retailer: 'Target', dims: [1.3, 1.3, 1.3], color: 0xc27a5e, category: 'Decor', subcategory: 'Room', modelUrl: '/models/pillow.glb', relatedIds: ['loveseat', 'accent-chair'] },
  { id: 'mirror', name: 'Full-Length Mirror', price: 29, retailer: 'Target', dims: [1.3, 0.2, 4.9], color: 0xaad4e8, category: 'Decor', subcategory: 'Wall', relatedIds: ['dresser'] },
  { id: 'poster', name: 'Poster', price: 12, retailer: 'Amazon', dims: [2.0, 0.05, 2.7], color: 0x4d6373, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster-landscape', 'flag'] },
  { id: 'poster-landscape', name: 'Wide Print Poster', price: 18, retailer: 'Amazon', dims: [3.0, 0.05, 2.0], color: 0x6b4f36, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster', 'tapestry'] },
  { id: 'flag', name: 'Flag / Banner', price: 15, retailer: 'Amazon', dims: [3.0, 0.05, 1.8], color: 0xb5654a, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster', 'tapestry'] },
  { id: 'tapestry', name: 'Tapestry', price: 22, retailer: 'Amazon', dims: [4.5, 0.05, 5.5], color: 0x7a3f6b, category: 'Decor', subcategory: 'Wall', relatedIds: ['flag', 'chk:string-lights'] },
  // Curtains — ⚠️ reasonable pick, not tiered (long-tail commodity pass, see
  // remaining-longtail-picks.md). No dedicated "Window" subcategory exists for one item — filed
  // under Wall alongside the other window/wall dressing items (tapestry, flag) it's closest to.
  { id: 'curtains', name: 'Blackout Curtain Panel w/ Grommets', price: 20, retailer: 'Amazon', productUrl: null, dims: [3.0, 0.1, 5.5], color: 0x2b2b2b, category: 'Decor', subcategory: 'Wall', relatedIds: ['tapestry', 'chk:string-lights'] },
  { id: 'corkboard', name: 'Corkboard', price: 14, retailer: 'Target', dims: [2.0, 0.1, 1.5], color: 0xc9a876, category: 'Decor', subcategory: 'Wall', relatedIds: ['poster'] },
  { id: 'wall-clock', name: 'Wall Clock', price: 16, retailer: 'Target', dims: [1.0, 0.1, 1.0], color: 0x2b2b2b, category: 'Decor', subcategory: 'Wall', relatedIds: ['mirror'] },

  // ---- Optional Luxury Items ----
  // Bean Bag Chair — ✅ fully researched.
  { id: 'beanbag-budget', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'budget', name: 'ILPEOD Basic Bean Bag Chair', price: 45, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FZ9R3SNH', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'beanbag', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'moderate', name: 'Corduroy Bean Bag Chair', price: 80, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FXXCCB7J', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'beanbag-premium', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'premium', name: 'Big Joe Fuf 7ft Giant Foam Bean Bag', price: 270, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08T7L23Z7', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
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
// - modelRotationY (bed-shaped models only — ColgateBed.glb, colgateSlat.glb) — their
//   headboard/footboard rail or slat geometry came in aligned to the model's long axis instead of
//   its short one, so non-uniform scale-to-dims stretched them across the bed's long side instead
//   of running the right way. A 90° pre-rotation before fitting swaps which local axis lands on
//   width vs. depth. colgateHeadboard.glb (colgate-bed/bed-full's primary model, carved out of
//   ColgateBed.glb into just the head/footboard + posts) needs no such rotation — it was exported
//   with its head/foot boards already spread along local X, confirmed by histogramming its vertex
//   positions (almost all mass at the two extremes with a dead gap between, i.e. the two boards).
//
// The Stackable Chest is deliberately NOT in this list — see 'stackable-chest' in CATALOG above.
// Colgate doesn't guarantee every room gets one (the PDF's own wording is about variation between
// rooms), so it isn't auto-placed as "provided", but it's the exact same real item/model, just
// treated as purchasable.
export const PROVIDED_CATALOG = [
  // Originally one merged frame model (ColgateBed.glb, still used by bed-bunk above) with a fused
  // mattress on top — but that model bakes the slat base into the same mesh as the head/footboard
  // and posts (no separate "slats" node to hide — confirmed by parsing its POSITION accessor and
  // histogramming vertex Y values: no gap separating a "slats" cluster from everything else), so
  // there was no way to move just the mattress+base and leave the posts alone, or to hide the base
  // entirely. Tyler split the model in Blender into two pieces instead: colgateHeadboard.glb
  // (head/footboard + corner posts, no base — the primary model, stays put) and colgateSlat.glb
  // (just the slat base). The slat and the mattress both fuse on via extraModels'
  // movesWithHeight: true (see _loadItemMesh/setBedHeight in roomEngine.js), each keeping its own
  // stackOffset above the current height preset — the mattress's stackOffset equals the slat's own
  // thickness (0.25ft) so it always sits right on top of the slat, and the pair slides together as
  // a unit to whichever peg is selected while the headboard/footboard posts stay exactly where
  // they are, matching a real adjustable frame.
  //
  // bedHeights (COLGATE_BED_HEIGHTS) is the slat's own base Y at each peg — 'standard' (1.0ft) is
  // NOT "frame height minus mattress height", it's where the old merged model's slat surface
  // actually sat: ColgateBed.glb's tall corner posts/rails reach the full 3.0ft dims height, but
  // histogramming its vertices found ~41% of all 334k clustered in a thin flat band around
  // y=0.23-0.25 (of a 0-0.826 local height range) — the slat plateau — which scales to ~0.9-1.1ft
  // of world height at the 3.0ft dims target; 1.0ft is the middle of that, confirmed visually, and
  // kept as 'standard' so existing saved layouts render at the same height as before this split.
  {
    id: 'colgate-bed', name: 'Twin XL Bed Frame', modelNo: '146RF', dims: [7.0, 3.08, 3.0], color: 0xc9a876,
    category: 'Provided', isProvided: true, modelUrl: '/models/colgateHeadboard.glb', tintMaterial: true, floorNudge: 0.35,
    bedHeights: COLGATE_BED_HEIGHTS,
    extraModels: [
      { modelUrl: '/models/colgateSlat.glb', dims: [6.7, 3.0, 0.25], rotationY: Math.PI / 2, color: 0xc9a876, movesWithHeight: true, stackOffset: 0 },
      { modelUrl: '/models/colgateMattress.glb', dims: [6.67, 3.08, 0.5], color: 0xd8cbb0, movesWithHeight: true, stackOffset: 0.25 },
    ],
    relatedIds: ['chk:mattress-topper-memory-foam-gel-egg-crate', 'chk:mattress-protector', 'chk:pillowcases', 'chk:comforter', 'chk:bed-risers'],
  },
  { id: 'colgate-desk', name: 'Panel Desk', modelNo: '205C42', dims: [3.5, 2.0, 2.5], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateDesk.glb', tintMaterial: true, relatedIds: ['lamp', 'shelf', 'desk-organizer', 'monitor-stand', 'chk:pencil-holder'] },
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

// Buy-button link for a cart item: the real product URL once Tyler has pasted one in (see the
// `productUrl` note at the top of this file), falling back to a retailer search link otherwise.
// Same AFFILIATE_TAGS map as retailerLink applies to a real productUrl too, so filling in
// AFFILIATE_TAGS once affiliate approval comes through starts tagging both kinds of link with no
// further code changes needed.
export function catalogItemLink(cat) {
  if (cat.productUrl) {
    const tag = AFFILIATE_TAGS[cat.retailer]
    if (!tag) return cat.productUrl
    return cat.productUrl + (cat.productUrl.includes('?') ? '&' : '?') + `tag=${encodeURIComponent(tag)}`
  }
  return retailerLink(cat.retailer, cat.name)
}

// Combined id -> catalog entry lookup covering purchasable (CATALOG), Colgate-provided
// (PROVIDED_CATALOG), and any registered custom items (see registerCustomCatalogItem below) —
// the same array roomEngine.js imports directly (as ALL_ITEMS) to resolve a saved layout's items
// against when loading it into the 3D scene, so a custom item registered here is immediately
// resolvable there too with no separate bookkeeping.
export const ALL_CATALOG_ITEMS = [...CATALOG, ...PROVIDED_CATALOG]

export function findCatalogItemById(id) {
  return ALL_CATALOG_ITEMS.find((c) => c.id === id) || null
}

// Builds a catalog-shaped object (same field shape as any real CATALOG entry) from a custom_items
// DB row (see storage.js's listMyCustomItems/createCustomItem) — visual properties (model, color,
// any rotation/tint fixup it needs) come from the chosen stand-in catalog item, everything else
// (name, dims, buy link) is the user's own. id is prefixed 'custom-' so it can never collide with
// a real catalog id. price is required at creation (see CustomItemForm in App.jsx) so shopping-
// list totals/receipt rendering need no null-handling anywhere else in the app.
export function buildCustomCatalogItem(row) {
  const standIn = findCatalogItemById(row.stand_in_catalog_id)
  return {
    id: `custom-${row.id}`,
    customItemId: row.id,
    name: row.name,
    price: row.price,
    retailer: 'Custom Item',
    productUrl: row.product_url || null,
    dims: [row.width, row.depth, row.height],
    color: standIn?.color ?? 0x9c8a6b,
    category: 'Furniture & Organization',
    subcategory: 'My Items',
    modelUrl: standIn?.modelUrl,
    tintMaterial: standIn?.tintMaterial,
    modelRotationY: standIn?.modelRotationY,
    primaryModelFitDims: standIn?.primaryModelFitDims,
    thumbnailSourceId: standIn?.id,
    isCustom: true,
    relatedIds: [],
  }
}

// Splices a synthesized custom item into the live lookup array so add-to-room/shopping-list/
// detail code (all of which resolve items by id against ALL_CATALOG_ITEMS) treats it exactly like
// a real catalog entry. Idempotent — replaces an existing entry with the same id instead of
// duplicating, so calling this again after a remount/refetch is safe.
export function registerCustomCatalogItem(item) {
  const idx = ALL_CATALOG_ITEMS.findIndex((c) => c.id === item.id)
  if (idx >= 0) ALL_CATALOG_ITEMS[idx] = item
  else ALL_CATALOG_ITEMS.push(item)
}

export function unregisterCustomCatalogItem(id) {
  const idx = ALL_CATALOG_ITEMS.findIndex((c) => c.id === id)
  if (idx >= 0) ALL_CATALOG_ITEMS.splice(idx, 1)
}

// Poster/artwork import (Session 5) — standard sold/framed sizes rather than free-form dimensions,
// same simplification the real 'poster'/'poster-landscape' CATALOG entries above already made.
// Values in inches (how these sizes are actually marketed) alongside the feet conversion the room
// engine needs everywhere else.
export const POSTER_SIZE_PRESETS = [
  { label: '11" × 17"', widthIn: 11, heightIn: 17 },
  { label: '18" × 24"', widthIn: 18, heightIn: 24 },
  { label: '24" × 36"', widthIn: 24, heightIn: 36 },
]

// Builds a catalog-shaped object from a custom_posters DB row (see storage.js's
// listMyCustomPosters/uploadCustomPoster) — same [width, depth, height] dims convention as the
// real 'poster' entry above (a thin flat panel, depth is just a frame's worth of thickness), but
// `posterImageUrl` in place of a modelUrl/color — roomEngine.js's _loadItemMesh checks for that
// field first and builds a textured panel (the uploaded image on its two large faces, a plain
// frame color on the thin edges) instead of loading a glTF model or a flat-color placeholder box.
export function buildCustomPosterCatalogItem(row) {
  return {
    id: `poster-${row.id}`,
    customPosterId: row.id,
    name: row.name,
    price: 0,
    retailer: 'Your Upload',
    productUrl: null,
    dims: [row.width_in / 12, 0.05, row.height_in / 12],
    color: 0xe8e0cf,
    category: 'Decor',
    subcategory: 'Wall',
    posterImageUrl: row.image_url,
    isCustomPoster: true,
    relatedIds: [],
  }
}

// Joins a saved layout's `items` array (placement records of the shape `{ catalogId, x, z, rotY,
// ... }` — see roomEngine.js's getState) against the current catalog, the same lookup roomEngine
// does when loading a layout into the 3D scene. Used to render that same data as a flat list
// instead of 3D objects — see LayoutDetailPage's "Shop this room". Drops any catalogId that no
// longer resolves (an item retired from the catalog since the layout was saved) rather than
// showing a broken row — the same defensive skip roomEngine.loadState already does.
export function resolveLayoutCatalogItems(items) {
  if (!items) return []
  return items.map((it) => ALL_CATALOG_ITEMS.find((c) => c.id === it.catalogId)).filter(Boolean)
}

// Shopping summary for a saved layout: how many of its items are actually purchasable (Colgate-
// provided furniture has no price and isn't for sale — same exclusion App.jsx's purchasableCart/
// receipt modal already makes) and what they'd cost. Powers the layout detail page's "Shop this
// room" total and the lightweight "X items · starting at $Y" teaser on Browse cards.
export function layoutShopSummary(items) {
  const purchasable = resolveLayoutCatalogItems(items).filter((c) => !c.isProvided)
  return {
    count: purchasable.length,
    total: purchasable.reduce((sum, c) => sum + c.price, 0),
  }
}
