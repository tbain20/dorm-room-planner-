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
// icons). A few existing items predate that taxonomy and were retagged into it; School Supplies
// still has zero placeable items — everything in it is checklist-only, so it never shows up here.
// Bathroom used to be the same way, until the Shower Caddy placeholder below gave it its first
// real entry.
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
  'Bathroom',
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

// colgate-bed/bed-full/bed-bunk all share one model now (public/models/colgateBed.glb — a single
// fused mesh with the frame and mattress baked into one surface, replacing the old split
// colgateHeadboard.glb + colgateSlat.glb + colgateMattress.glb pieces) so every bed in the app
// renders identically. That used to support a Low/Standard/Lofted height picker (bedHeights —
// sliding just the mattress+slat to a different peg while the frame's posts stayed grounded), but
// a single fused mesh has no separate mattress piece left to slide independently of the frame — so
// that picker is gone; every bed just renders at its one modeled height now. mattressTopY (see
// below) replaces bedHeights/isMattressSurface for telling stacking (a topper, say) where the
// baked-in mattress surface actually sits, since there's no longer a real mattress sub-object to
// measure it from directly.

// Bed-only bedding flags (Tyler's real 3D scans of a topper/comforter/pillows/throw blanket —
// see public/models/{MatTopper,comforter,pillowBest,throwPillow,throwBlanket}.glb):
// - isBed / mattressDims: which catalog items are beds, and the exact footprint of their fused
//   mattress (see extraModels below) — lets bedding auto-size/auto-target a real bed instead of
//   guessing from the frame's own (larger) footprint.
// - mattressTopY (on a bed item itself, in feet): the fixed local Y its own baked-in mattress
//   surface sits at — every bed's frame+mattress are one fused model now (see the note above), so
//   there's no separate mattress sub-object left to derive this from; it's measured once per bed by
//   histogramming colgateBed.glb's own vertex Y positions for the big flat plateau (the mattress
//   top) and scaling that fraction (~35% of the model's total fitted height) to each bed's own
//   height. roomEngine.js's _topSurfaceY reads it to know where a topper/pillow should land.
// - isMattress (on a bed's own extraModels entry, not the bed item itself): flags which fused extra
//   model is a separate mattress mesh, for roomEngine.js's applyMattressColor to re-tint — unused by
//   any current bed (none has a separate mattress model anymore, see mattressTopY above), but kept
//   as generic support in case a future bed model splits the mattress back out.
// - bedOnly: this item can only ever be added by auto-stacking onto a bed (see addItem/
//   _findBedForAutoPlacement in roomEngine.js) — no floor placement, no unstacking, matching
//   Tyler's "should not be able to be moved off of it" requirement (drag is still allowed *within*
//   the bed's footprint via the existing _clampStackedItem). The mattress topper and pillow still
//   use this; sheets and the comforter/throw blanket don't anymore — see their own entries below.
// - matchBaseFootprint: this item's own w/d is recomputed to exactly match whatever it's currently
//   stacked on (the bed's mattressDims, or another matched layer already resized) every time it's
//   (re)stacked — see _refitFootprint in roomEngine.js. Only the mattress topper gets this now.
// - dressesBed (comforter, throw blanket): instead of stacking onto a bed, clicking this tier swaps
//   out the target bed's own frame model for this one (a real scan of an entire made bed — see
//   roomEngine.js's _applyBedDressing) rather than adding a loose layer. Requires an existing bed
//   the same way bedOnly does, just via a different code path since there's no stacking involved;
//   picking a second dressesBed tier (or a different group entirely) cross-fades the current one out
//   for the new one instead of stacking the two.
// - recolorsMattress (sheets only): no placeable model at all — mirrors recolorsPillows' "this
//   isn't a real object, it's a covering for something already in the room" pattern. Clicking a
//   sheet-set tier asks what color (see App.jsx) and re-tints every placed bed's mattress to it
//   (falling back to the whole fused model when there's no separate isMattress piece — see
//   roomEngine.js's applyMattressColor), clearing any placed mattress topper in the process.
// - colorable: shows the BEDDING_COLOR_SWATCHES picker in the selection panel (see App.jsx) and
//   lets setItemColor() re-tint the model at runtime.
// - hasPoseOptions: shows the flat/diagonal/upright pose picker (see setItemPose in
//   roomEngine.js) — a pillow-specific "how is it resting on the bed" control.
export const BEDDING_COLOR_SWATCHES = [0xf2ede1, 0x8a8f94, 0x2f4257, 0x8a9a7b, 0xd9a6a1, 0x7a2e2e, 0x2a2a2a]

export const CATALOG = [
  // ---- Bedding ----
  // No standalone "mattress" prop — every bed frame (colgate-bed, bed-full, bed-bunk) now fuses
  // its own real mattress model on via extraModels, so a separate mattress box wasn't adding
  // anything besides a stacking target. These are the loose bedding layers a student actually
  // shops for: the topper and pillow/throw still stack directly onto a bed's fused mattress (see
  // roomEngine.js's multi-level stacking) via "Put on top of…"; sheets and the comforter work
  // differently now — see recolorsMattress/dressesBed above.
  // Mattress Topper — ✅ fully researched (see curated-research-FINAL.md). dims are a cosmetic
  // default only (shown before it's ever placed) — matchBaseFootprint resizes it to the exact
  // mattress it's stacked on every time (see roomEngine.js's _refitFootprint), long-first to match
  // the beds' own dims convention (dims[0] = head-to-foot length, see bed-full/colgate-bed below).
  { id: 'mattress-topper-budget', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'budget', name: 'Serta ThermaGel 2" Mattress Topper', price: 65, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08897N2KB', dims: [6.3, 3.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/MatTopper.glb', tintMaterial: true, bedOnly: true, matchBaseFootprint: true, colorable: true, relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  { id: 'mattress-topper', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'moderate', name: 'ViscoSoft Select 3" Mattress Topper', price: 136, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B01MSL0UA3', dims: [6.3, 3.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/MatTopper.glb', tintMaterial: true, bedOnly: true, matchBaseFootprint: true, colorable: true, relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  { id: 'mattress-topper-premium', groupId: 'mattress-topper', groupLabel: 'Mattress Topper', tier: 'premium', name: 'Tempur-Adapt Supreme Mattress Topper', price: 269, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00HEODIZY', dims: [6.3, 3.3, 0.3], color: 0xe8e0cf, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/MatTopper.glb', tintMaterial: true, bedOnly: true, matchBaseFootprint: true, colorable: true, relatedIds: ['mattress-protector', 'sheet-set', 'bed-full', 'colgate-bed'] },
  // Mattress Protector — ⚠️ reasonable pick, not tiered (research: budget/moderate are
  // "effectively interchangeable" in this category, no real premium tier) — single entry.
  { id: 'mattress-protector', name: 'SafeRest Waterproof Mattress Protector', price: 25, retailer: 'Amazon', productUrl: null, dims: [3.3, 6.3, 0.15], color: 0xf2efe6, category: 'Bedding', subcategory: 'Essentials', relatedIds: ['mattress-topper', 'sheet-set', 'bed-full', 'colgate-bed'] },
  // Twin XL Sheets — ✅ fully researched. Retailer switched Target → Amazon for all three tiers:
  // the researched products (Amazon Basics/Mellanni/LuxClub) are all primarily Amazon listings.
  // No placeable model (recolorsPillows' sibling pattern) — a fitted sheet is invisible under
  // whatever's covering the mattress anyway (a topper, or the comforter's now-fused whole-bed
  // model — see comforter below), so instead of a 3D object, clicking a sheet-set tier asks what
  // color (see App.jsx's sheetColorPrompt) and recolors every placed bed's actual mattress model to
  // it (see roomEngine.js's applyMattressColor) — and clears any placed mattress topper, since a
  // topper sits between the mattress and the fitted sheet in real life and would otherwise hide the
  // recolor entirely.
  { id: 'sheet-set-budget', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'budget', name: 'Amazon Basics Microfiber Sheet Set', price: 23, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00Q7O9OIM', dims: [6.3, 3.3, 0.35], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', recolorsMattress: true, relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  { id: 'sheet-set', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'moderate', name: 'Mellanni Microfiber Sheet Set', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00NLLUMOE', dims: [6.3, 3.3, 0.35], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', recolorsMattress: true, relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  { id: 'sheet-set-premium', groupId: 'sheet-set', groupLabel: 'Twin XL Sheet Set', tier: 'premium', name: 'Pure Bamboo Sheets', price: 34, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07DZTQ4JC', dims: [6.3, 3.3, 0.35], color: 0xc9d6e0, category: 'Bedding', subcategory: 'Essentials', recolorsMattress: true, relatedIds: ['comforter', 'bed-pillow', 'pillowcase-set', 'bed-full', 'colgate-bed'] },
  // Comforter — ✅ fully researched. Retailer switched Target → Amazon, same reasoning as sheets.
  // comforter.glb is now Tyler's real scan of an entire made bed (frame + mattress + comforter +
  // pillow fused into one mesh), not just a loose blanket layer — so instead of stacking onto an
  // existing bed's mattress (the old behavior), picking a comforter tier now dresses a placed bed
  // outright: it fades the bed frame's own model out and fades this whole-bed model in at the same
  // spot (see roomEngine.js's _applyBedDressing/dressesBed), so the transition reads as the bed
  // being "made" rather than a new object popping in on top of it. dims are a generic
  // twin-XL-made-bed approximation (matched visually against colgate-bed's own [7.0, 3.08, 3.0]),
  // used for every bed type since there's one shared model regardless of which bed it's dressing.
  // modelRotationY: comforter.glb's own head-to-foot axis came in on local Z, not X — without the
  // rotation, _fitModelToDims (which always maps local X onto dims[0]/length at rotation 0) would
  // stretch the model's naturally-short axis out to the full 7ft length and squash its naturally-
  // long axis down into the 3.4ft width, i.e. exactly backwards. Same fix, same reason, on the
  // throw blanket below (throwBlanket.glb shares this same axis convention).
  { id: 'comforter-budget', groupId: 'comforter', groupLabel: 'Comforter', tier: 'budget', name: 'Bedsure Reversible Comforter', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0BTHK7NW4', dims: [7.0, 3.4, 3.0], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/comforter.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  { id: 'comforter', groupId: 'comforter', groupLabel: 'Comforter', tier: 'moderate', name: 'CozyLux Down-Alternative Comforter Set (5-pc)', price: 48, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0H154HN7T', dims: [7.0, 3.4, 3.0], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/comforter.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  { id: 'comforter-premium', groupId: 'comforter', groupLabel: 'Comforter', tier: 'premium', name: 'Evercool Comforter', price: 70, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0CHR8KYVW', dims: [7.0, 3.4, 3.0], color: 0xb5654a, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/comforter.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['sheet-set', 'bed-pillow', 'bed-full', 'colgate-bed'] },
  // Pillow — ✅ fully researched. Budget tier is a listed 2-pack ($38/pair per the research); the
  // other two tiers are single pillows — kept faithful to the doc's own listed prices rather than
  // normalizing to a per-pillow rate. Uses pillowBest.glb (Tyler's real scan) with pose options —
  // see hasPoseOptions/setItemPose in roomEngine.js for flat/diagonal/upright.
  // poseFlip: pillowBest.glb's own "front" faces the opposite local direction from throwPillow.glb
  // (see decorative-pillow below, which needs no flip) — same diagonal/upright pose math, mirrored,
  // so this model leans/stands the correct way instead of tipping toward the wrong side.
  { id: 'bed-pillow-budget', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'budget', name: 'Beckham Hotel Collection Pillow (2-Pack)', price: 38, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0D9WWKGDF', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillowBest.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, poseFlip: true, relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  { id: 'bed-pillow', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'moderate', name: 'Coop Home Goods Memory Foam Pillow', price: 27, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00EINBSEW', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillowBest.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, poseFlip: true, relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  { id: 'bed-pillow-premium', groupId: 'bed-pillow', groupLabel: 'Pillow', tier: 'premium', name: 'Tempur-Pedic TEMPUR-Cloud Pillow (2-Pack)', price: 65, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FJZT5841', dims: [1.7, 2.3, 0.5], color: 0xfaf6ec, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/pillowBest.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, poseFlip: true, relatedIds: ['pillowcase-set', 'comforter', 'bed-full', 'colgate-bed'] },
  // Pillowcases — ✅ final-links pass (2026-08-25). Previously a single untiered stub; Tyler
  // supplied real budget/moderate/premium links so it's now a proper tiered group like the other
  // Bedding items above. Prices are market estimates (Amazon's rendered price wasn't visible via
  // fetch) — flagged for double-check once real pricing is confirmed, same as other estimated
  // items noted at the top of this file.
  // recolorsPillows (rather than a placeable 3D model of its own): a pillowcase isn't a separate
  // object you'd position in the room, it's a covering for whatever pillow(s) are already there —
  // so clicking it asks what color first (see App.jsx's colorPrompt), then re-tints every
  // already-placed pillow (see hasPoseOptions above — bed-pillow and decorative-pillow are the only
  // two "pillow" catalog items) to that color instead of dropping a new floating placeholder box
  // into the scene.
  { id: 'pillowcase-set-budget', groupId: 'pillowcase-set', groupLabel: 'Pillowcases', tier: 'budget', name: 'Pillow Cases Queen Size Set of 4', price: 10, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07RZSGV99', dims: [1.7, 2.3, 0.1], color: 0xe0d8c4, category: 'Bedding', subcategory: 'Essentials', recolorsPillows: true, relatedIds: ['bed-pillow', 'sheet-set'] },
  { id: 'pillowcase-set', groupId: 'pillowcase-set', groupLabel: 'Pillowcases', tier: 'moderate', name: 'Pillow Cases Queen Size Set of 12', price: 18, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B00XK9CXSA', dims: [1.7, 2.3, 0.1], color: 0xe0d8c4, category: 'Bedding', subcategory: 'Essentials', recolorsPillows: true, relatedIds: ['bed-pillow', 'sheet-set'] },
  { id: 'pillowcase-set-premium', groupId: 'pillowcase-set', groupLabel: 'Pillowcases', tier: 'premium', name: 'Boll & Branch Signature Hemmed Pillowcase Set', price: 59, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0DTBTCL9X', dims: [1.7, 2.3, 0.1], color: 0xe0d8c4, category: 'Bedding', subcategory: 'Essentials', recolorsPillows: true, relatedIds: ['bed-pillow', 'sheet-set'] },
  // Blanket/Throw — ✅ final-links pass. throwBlanket.glb is now (like comforter.glb) a real scan
  // of an entire made bed — frame, mattress, comforter, AND a throw blanket layered on top, fused
  // into one mesh — so this dresses the target bed exactly like the comforter above (see
  // catalog.js's dressesBed / roomEngine.js's _applyBedDressing) rather than stacking a loose throw
  // on top of whatever's currently on the bed. dims are the same generic made-bed approximation the
  // comforter uses — same modeling convention, close enough in size to reuse as-is.
  { id: 'blanket-throw-budget', groupId: 'blanket-throw', groupLabel: 'Blanket/Throw', tier: 'budget', name: 'Bedsure Fleece Throw Blanket', price: 15, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0C1YZJJ5L', dims: [7.0, 3.4, 3.0], color: 0xd8c9a8, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/throwBlanket.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  { id: 'blanket-throw', groupId: 'blanket-throw', groupLabel: 'Blanket/Throw', tier: 'moderate', name: 'SAMIAH LUXE Chunky Knit Throw Blanket', price: 40, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08RRPQHLC', dims: [7.0, 3.4, 3.0], color: 0xd8c9a8, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/throwBlanket.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  { id: 'blanket-throw-premium', groupId: 'blanket-throw', groupLabel: 'Blanket/Throw', tier: 'premium', name: 'Cozy Earth Cuddle Blanket', price: 199, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0DSGLSN1R', dims: [7.0, 3.4, 3.0], color: 0xd8c9a8, category: 'Bedding', subcategory: 'Essentials', modelUrl: '/models/throwBlanket.glb', modelRotationY: Math.PI / 2, tintMaterial: true, dressesBed: true, colorable: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  // Decorative Pillows (throw pillows) — ✅ final-links pass. Only budget has a specific product;
  // moderate/premium share one generic Target search link (no specific product identified for
  // those two tiers) — per Tyler's instruction, both point at the same target.com search rather
  // than a fabricated product pick. Still a real 3-entry tiered group so the tier-picker UI renders
  // normally. Uses throwPillow.glb (Tyler's real scan) with the same pose options as bed-pillow.
  // dims bumped from a cosmetic 1.3' cube to 1.6' (~19") — closer to a real decorative throw
  // pillow's size and less easily lost/hidden under a comforter or bed-pillow at the old scale.
  { id: 'decorative-pillow-budget', groupId: 'decorative-pillow', groupLabel: 'Decorative Pillows', tier: 'budget', name: 'MIULEE Corduroy Striped Throw Pillow Covers (Set of 4)', price: 25, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0CVVVNB9L', dims: [1.6, 1.6, 1.6], color: 0xc27a5e, category: 'Bedding', subcategory: 'Optional', modelUrl: '/models/throwPillow.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  { id: 'decorative-pillow', groupId: 'decorative-pillow', groupLabel: 'Decorative Pillows', tier: 'moderate', name: 'Decorative Pillow (Target)', price: 20, retailer: 'Target', productUrl: 'https://www.target.com/s?searchTerm=decorative+pillows', dims: [1.6, 1.6, 1.6], color: 0xc27a5e, category: 'Bedding', subcategory: 'Optional', modelUrl: '/models/throwPillow.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  { id: 'decorative-pillow-premium', groupId: 'decorative-pillow', groupLabel: 'Decorative Pillows', tier: 'premium', name: 'Decorative Pillow (Target)', price: 35, retailer: 'Target', productUrl: 'https://www.target.com/s?searchTerm=decorative+pillows', dims: [1.6, 1.6, 1.6], color: 0xc27a5e, category: 'Bedding', subcategory: 'Optional', modelUrl: '/models/throwPillow.glb', tintMaterial: true, bedOnly: true, colorable: true, hasPoseOptions: true, relatedIds: ['comforter', 'bed-full', 'colgate-bed'] },
  // Blanket/Comforter Organizer — new addition from the final-links pass (not part of the
  // original researched category list). Filed under Bedding/Storage since it's meant to pair
  // with the comforter/sheet items above (off-season storage), not general room storage. Price
  // is a market estimate — the final-links doc gave a link but no price (see note at top of file).
  { id: 'blanket-organizer', name: 'Lifewit Blanket/Comforter Organizer', price: 20, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09ZV2TX28', dims: [2.0, 1.3, 1.0], color: 0xd6d0c4, category: 'Bedding', subcategory: 'Storage', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['comforter', 'sheet-set', 'bed-pillow'] },

  // ---- Furniture & Organization ----
  // No plain "Twin XL Bed Frame" here anymore — colgate-bed (below, in PROVIDED_CATALOG) already
  // covers the twin XL need with a real fused mattress, so a separate purchasable twin using a
  // different (Kenney-kit) model was redundant. bed-full and bed-bunk below fill out
  // the purchasable side for students who want a bigger bed or a bunk. Same category/id-suffix
  // convention as the Colgate-chest/purchasable-chest split elsewhere: full/double doesn't fit a
  // standard dorm frame, but plenty of this app's users aren't in a dorm at all (apartment,
  // off-campus) — see the "not every user is a Colgate student" note on the Colgate section below.
  //
  // Renders as the real Colgate bed piece — colgateBed.glb, the same single fused frame+mattress
  // model colgate-bed and bed-bunk use below (see the note above BEDDING_COLOR_SWATCHES), just
  // scaled to a full/double footprint instead of a twin XL one. Same tintMaterial treatment and
  // color as colgate-bed. mattressTopY is bed-full's own height (2.2ft) times the ~35% mattress-top
  // fraction measured off the model (see the note above) — 2.2 × 0.35 ≈ 0.77.
  {
    id: 'bed-full', name: 'Full-Size Bed Frame', price: 229, retailer: 'IKEA', dims: [6.4, 4.5, 2.2], color: 0xc9a876,
    category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/colgateBed.glb', tintMaterial: true,
    isBed: true, mattressDims: [6.2, 4.2], mattressTopY: 0.77,
    relatedIds: ['mattress-topper', 'sheet-set', 'nightstand', 'chk:mattress-protector', 'chk:comforter'],
  },
  // Rendered as two Colgate frames stacked (bottom bunk's own frame, then a second copy fused on
  // via extraModels) rather than one model stretched to the full 5.5' height — a single stretched
  // frame would just look like one oversized, distorted bed rather than an actual bunk. Each copy
  // is colgateBed.glb's single fused frame+mattress mesh, so both levels already show their own
  // mattress with no separate mattress model needed (unlike before the model was consolidated).
  // primaryModelFitDims sizes the bottom frame to its own real proportions instead of the item's
  // full dims (see _loadItemMesh in roomEngine.js); dims stays the true overall footprint/height
  // for room clamping and stacking. mattressTopY is the bottom frame's own height (2.75ft, from
  // primaryModelFitDims) times the ~35% mattress-top fraction (see the note above
  // BEDDING_COLOR_SWATCHES) — 2.75 × 0.35 ≈ 0.96 — telling _topSurfaceY where a topper/pillow
  // should land on the bottom bunk (the only level the stacking system can target).
  {
    id: 'bed-bunk', name: 'Bunk Bed Frame', price: 349, retailer: 'Amazon', dims: [6.5, 3.4, 5.5], primaryModelFitDims: [6.5, 3.4, 2.75], color: 0xc9a876,
    category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/colgateBed.glb', tintMaterial: true,
    isBed: true, mattressDims: [6.2, 3.2], mattressTopY: 0.96,
    extraModels: [
      { modelUrl: '/models/colgateBed.glb', dims: [6.5, 3.4, 2.75], color: 0xc9a876, yOffset: 2.75 }, // top bunk's own frame
    ],
    relatedIds: ['mattress-topper', 'sheet-set', 'chk:mattress-protector', 'pillowcase-set', 'chk:comforter'],
  },
  // Storage Bins — ✅ fully researched. Mapped onto the existing under-bed-bins slot as the
  // closest match to the research's generic "Storage Bins" category; premium ($30) is cheaper
  // than moderate ($84) because that's genuinely what the research turned up (a rolling cart vs.
  // a modular drawer set aren't directly comparable on price) — left as-is rather than reordered.
  { id: 'underbed-bins-budget', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'budget', name: 'Amazon Basics Collapsible Fabric Storage Bins (6-Pack)', price: 14, retailer: 'Amazon', productUrl: null, dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  { id: 'underbed-bins', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'moderate', name: 'Target Brightroom 3-Drawer Wide Cart', price: 84, retailer: 'Target', productUrl: 'https://www.target.com/p/3-drawer-wide-cart-white-brightroom/-/A-84242464', dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  { id: 'underbed-bins-premium', groupId: 'underbed-bins', groupLabel: 'Under-Bed Storage Bins', tier: 'premium', name: 'IRIS USA Stackable Storage Drawers', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09C2QM669', dims: [2.2, 1.3, 1.0], color: 0xd6d0c4, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cardboardBoxClosed.glb', relatedIds: ['bed-full'] },
  // Under-bed Storage Drawers — ✅ final-links pass. Single confirmed product, one tier — real
  // link/name swapped in for the old generic "Rolling Storage Drawers" placeholder.
  { id: 'storage-drawers', name: 'Sterilite Wide 3 Drawer Storage Tower', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0B7GRWSVJ', dims: [2.5, 1.5, 1.3], color: 0x8a8a8a, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/cabinetBedDrawer.glb', relatedIds: ['dresser'] },
  { id: 'nightstand', name: 'Nightstand', price: 39, retailer: 'IKEA', dims: [1.5, 1.5, 2.0], color: 0x8a6b4f, category: 'Furniture & Organization', subcategory: 'Bed', modelUrl: '/models/sideTableDrawers.glb', relatedIds: ['bed-full', 'desk-lamp'] },
  // Bed Risers / Bedside Caddy — ✅ final-links pass. Both were checklist-only stubs before;
  // Tyler supplied real single-product links so they're promoted to real placeable entries, same
  // treatment desk-organizer/monitor-stand got in an earlier pass. Prices are market estimates
  // (Amazon's rendered price wasn't visible via fetch) — flagged for double-check.
  { id: 'bed-risers', name: 'EclatBain Adjustable Bed Risers (4-Pack)', price: 25, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0DLNBJ6K9', dims: [0.4, 0.4, 0.4], color: 0x2b2b2b, category: 'Furniture & Organization', subcategory: 'Bed', relatedIds: ['bed-full', 'colgate-bed', 'storage-drawers'] },
  { id: 'bedside-caddy', name: 'Lazzanto Bedside Caddy', price: 50, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0DMRNCLFK', dims: [1.2, 1.0, 1.8], color: 0x2b2b2b, category: 'Furniture & Organization', subcategory: 'Bed', relatedIds: ['bed-full', 'colgate-bed', 'nightstand'] },
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
  // Shoe Rack — ✅ final-links pass, real single-product link (was generic-search-only before).
  { id: 'shoe-rack', name: 'Bumusty 3-Tier Expandable Shoe Rack', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0CRGSVFY7', dims: [2.5, 1.0, 2.5], color: 0x6b4f36, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/bookcaseOpenLow.glb', relatedIds: ['wardrobe'] },
  // Laundry Hamper — ✅ fully researched, though the doc didn't list prices for any of the three
  // picks — the prices below are market estimates, not sourced (see the note at the top of this
  // file); double-check them along with productUrl.
  { id: 'hamper-budget', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'budget', name: 'Handy Laundry Collapsible Mesh Pop-Up Hamper (2-Pack)', price: 16, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07CGXZFW6', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'hamper', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'moderate', name: 'Target Brightroom Rolling Hamper', price: 32, retailer: 'Target', productUrl: 'https://www.target.com/p/br-rolling-hamper-white-brightroom/-/A-93226286', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  { id: 'hamper-premium', groupId: 'hamper', groupLabel: 'Laundry Hamper', tier: 'premium', name: 'Bukere Backpack-Style Laundry Hamper', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B09ZP93SDM', dims: [1.5, 1.5, 2.2], color: 0x4d6373, category: 'Furniture & Organization', subcategory: 'Closet', modelUrl: '/models/trashcan.glb', relatedIds: ['drying-rack', 'chk:detergent', 'chk:dryer-sheets'] },
  // hasLegroom/isChair: lets the collision check (_updateCollisions in roomEngine.js) exempt a
  // desk chair slid in under a desk outright — a chair's backrest is routinely taller than the
  // desk itself, so no height-clearance math could make that pair stop registering as "touching."
  { id: 'desk', name: 'Compact Desk', price: 99, retailer: 'IKEA', dims: [3.9, 2.0, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/desk.glb', hasLegroom: true, relatedIds: ['chair', 'lamp', 'shelf', 'desk-organizer', 'monitor-stand', 'chk:pencil-holder'] },
  { id: 'desk-corner', name: 'Corner Desk', price: 149, retailer: 'IKEA', dims: [4.5, 4.5, 2.4], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/deskCorner.glb', hasLegroom: true, relatedIds: ['chair', 'lamp', 'shelf'] },
  { id: 'chair', name: 'Desk Chair', price: 79, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0x3a3a3a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairDesk.glb', isChair: true, relatedIds: ['desk'] },
  { id: 'chair-cushion', name: 'Cushioned Desk Chair', price: 89, retailer: 'Target', dims: [1.9, 1.9, 3.1], color: 0xb5654a, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairCushion.glb', isChair: true, relatedIds: ['desk'] },
  { id: 'chair-rounded', name: 'Rounded-Back Chair', price: 69, retailer: 'Amazon', dims: [1.7, 1.7, 3.0], color: 0xb08d57, category: 'Furniture & Organization', subcategory: 'Desk', modelUrl: '/models/chairRounded.glb', isChair: true, relatedIds: ['desk'] },
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
  // Storage Ottoman — Type C generic search (no specific product per Tyler's final-links pass);
  // retailer switched Target → Amazon so catalogItemLink()'s generic-search fallback matches.
  { id: 'ottoman', name: 'Folding Storage Ottoman', price: 34, retailer: 'Amazon', productUrl: null, dims: [1.5, 1.5, 1.3], color: 0x9c7a4d, category: 'Furniture & Organization', subcategory: 'General Storage', modelUrl: '/models/loungeSofaOttoman.glb', relatedIds: ['throw-pillow', 'rug'] },
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
  // TV — Type C generic search; retailer switched Best Buy → Amazon per Tyler's final-links pass.
  // canWallMount (not wallMountable): the TV starts on the floor like any normal item, but the
  // selection panel's "Mount on wall" button (App.jsx) can flip a *placed instance* into wall
  // mode — see roomEngine.js's setWallMounted. wallMountable, by contrast, means an item is
  // *always* wall-mounted with no floor mode at all (poster, mirror, etc. below) — the TV needs
  // both, so it gets this separate flag instead.
  // wallMountClipFraction: televisionModern.glb is a single fused mesh (stand + screen, no
  // separate node — checked, so cat.hideNodes can't target just the stand) with its stand
  // occupying the bottom ~40% of its own modeled height. Rather than ship it wall-mounted with
  // its floor stand visibly dangling on the wall, roomEngine.js clips away everything below this
  // fraction of the item's height once it's wall-mounted (see _setWallMountClipActive/
  // _updateWallMountClips) — 0.4 lands the cut right at the seam between the stand/neck and the
  // screen's own bottom bezel, so the screen keeps its real (already-closed) bottom face instead
  // of getting sliced open. The real fix is a Blender re-export with the stand as its own node
  // (or a dedicated wall-mount model); this is damage control until then.
  { id: 'tv', name: 'TV (43")', price: 249, retailer: 'Amazon', productUrl: null, dims: [3.2, 0.3, 1.9], color: 0x1b1b1b, category: 'Furniture & Organization', subcategory: 'Entertainment', modelUrl: '/models/televisionModern.glb', canWallMount: true, wallMountClipFraction: 0.4, relatedIds: ['chk:streaming-device', 'gaming-console', 'bluetooth-speaker'] },
  // Gaming Console — Type C generic search. Previously checklist-only ('chk:gaming-console');
  // Tyler wants it as a real placeable entry now, same promotion desk-organizer/monitor-stand got
  // in an earlier pass. No specific product — price is a rough market estimate.
  { id: 'gaming-console', name: 'Gaming Console', price: 499, retailer: 'Amazon', productUrl: null, dims: [1.5, 1.0, 0.3], color: 0x1b1b1b, category: 'Furniture & Organization', subcategory: 'Entertainment', relatedIds: ['tv', 'bluetooth-speaker'] },

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
  { id: 'coffee-maker', name: 'Coffee Maker', price: 39, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [0.7, 0.9, 1.1], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['electric-kettle', 'fridge'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'air-fryer', name: 'Air Fryer', price: 79, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [1.0, 1.0, 1.1], color: 0x2b2b2b, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['fridge', 'microwave'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'rice-cooker', name: 'Rice Cooker', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [0.8, 0.8, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['fridge', 'microwave'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'toaster', name: 'Toaster', price: 25, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [1.0, 0.6, 0.7], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker', 'fridge'] }, // TODO: placeholder link, replace with real product/search link
  // Electric Kettle — ✅ fully researched category, but the doc didn't list prices for any of the
  // three picks — estimates, not sourced (see note at top of file).
  { id: 'electric-kettle-budget', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'budget', name: 'Amazon Basics Electric Kettle (1500W)', price: 20, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B07PHRH6TL', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },
  { id: 'electric-kettle', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'moderate', name: 'Cosori 1.7L Borosilicate Glass Electric Kettle', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0GGXMFNF7', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },
  { id: 'electric-kettle-premium', groupId: 'electric-kettle', groupLabel: 'Electric Kettle', tier: 'premium', name: 'Meedome Electric Kettle w/ Tea Infuser', price: 40, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0HB5PWW2H', dims: [0.6, 0.6, 0.8], color: 0xc9c9c9, category: 'Kitchen & Food', subcategory: 'Appliances', relatedIds: ['coffee-maker'] },

  // ---- Cleaning Supplies ----
  { id: 'trash-can', name: 'Trash Can', price: 15, retailer: 'Target', productUrl: 'https://www.amazon.com', dims: [1.0, 1.0, 1.8], color: 0x7a7a7a, category: 'Cleaning Supplies', subcategory: 'Trash', modelUrl: '/models/trashcan.glb', relatedIds: ['chk:trash-bags', 'chk:recycling-bin'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'handheld-vacuum', name: 'Handheld Vacuum', price: 45, retailer: 'Target', dims: [0.5, 1.1, 0.6], color: 0x3a3a3a, category: 'Cleaning Supplies', subcategory: 'Trash', relatedIds: ['trash-can'] },

  // ---- Laundry ----
  { id: 'drying-rack', name: 'Drying Rack', price: 25, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [2.0, 1.3, 3.3], color: 0xb0b0b0, category: 'Laundry', subcategory: 'Optional', modelUrl: '/models/coatRackStanding.glb', relatedIds: ['hamper', 'chk:detergent'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'ironing-board', name: 'Ironing Board', price: 30, retailer: 'Amazon', dims: [4.0, 1.1, 2.9], color: 0xd8d8d8, category: 'Laundry', subcategory: 'Optional', relatedIds: ['chk:iron'] },

  // ---- Bathroom ----
  // Shower Caddy — placeholder link for now. Tyler has real tiered research for this one already
  // (Attmu/EUDELE/Rejomiik, see curated-research-FINAL.md) but is deliberately deferring wiring it
  // in until later — this entry exists now purely so modeling can proceed unblocked. First real
  // placeable item in Bathroom (see the CATEGORY_ORDER/note above).
  { id: 'shower-caddy', name: 'Shower Caddy', price: 25, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [0.8, 0.5, 1.5], color: 0xaad4e8, category: 'Bathroom', subcategory: 'Shower', relatedIds: ['chk:shower-shoes'] }, // TODO: placeholder link, replace with real product/search link

  // ---- Sleep & Comfort ----
  // Fan — placeholder link for now, per Tyler's final-links pass (was previously an untiered
  // "reasonable pick" with no link at all — now flagged for a real link like the other Type D
  // placeholders, since Tyler's tiered fan research still hasn't been wired in either).
  { id: 'fan', name: 'Tower Fan (Multi-Speed, Remote)', price: 35, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [1.3, 1.3, 3.3], color: 0xe4e4e4, category: 'Sleep & Comfort', relatedIds: ['humidifier'] }, // TODO: placeholder link, replace with real product/search link
  // Humidifier — placeholder link for now. Was checklist-only before; promoted since it has a
  // real physical footprint worth placing, same as the other Type D promotions in this pass.
  { id: 'humidifier', name: 'Humidifier', price: 30, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [0.8, 0.8, 1.2], color: 0xe4e4e4, category: 'Sleep & Comfort', relatedIds: ['fan'] }, // TODO: placeholder link, replace with real product/search link

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
  // Mirror — placeholder link for now. Tyler has real tiered research already (see
  // curated-research-FINAL.md) but is deliberately deferring wiring it in until later, same as
  // Shower Caddy and Fan above — this just unblocks modeling.
  { id: 'mirror', name: 'Full-Length Mirror', price: 29, retailer: 'Target', productUrl: 'https://www.amazon.com', dims: [1.3, 0.2, 4.9], color: 0xaad4e8, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['dresser'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'poster', name: 'Poster', price: 12, retailer: 'Amazon', dims: [2.0, 0.05, 2.7], color: 0x4d6373, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['poster-landscape', 'flag'] },
  { id: 'poster-landscape', name: 'Wide Print Poster', price: 18, retailer: 'Amazon', dims: [3.0, 0.05, 2.0], color: 0x6b4f36, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['poster', 'tapestry'] },
  { id: 'flag', name: 'Flag / Banner', price: 15, retailer: 'Amazon', dims: [3.0, 0.05, 1.8], color: 0xb5654a, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['poster', 'tapestry'] },
  { id: 'tapestry', name: 'Tapestry', price: 22, retailer: 'Amazon', dims: [4.5, 0.05, 5.5], color: 0x7a3f6b, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['flag', 'chk:string-lights'] },
  // Curtains — ⚠️ reasonable pick, not tiered (long-tail commodity pass, see
  // remaining-longtail-picks.md). No dedicated "Window" subcategory exists for one item — filed
  // under Wall alongside the other window/wall dressing items (tapestry, flag) it's closest to.
  { id: 'curtains', name: 'Blackout Curtain Panel w/ Grommets', price: 20, retailer: 'Amazon', productUrl: null, dims: [3.0, 0.1, 5.5], color: 0x2b2b2b, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['tapestry', 'chk:string-lights'] },
  { id: 'corkboard', name: 'Corkboard', price: 14, retailer: 'Target', dims: [2.0, 0.1, 1.5], color: 0xc9a876, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['poster'] },
  { id: 'wall-clock', name: 'Wall Clock', price: 16, retailer: 'Target', dims: [1.0, 0.1, 1.0], color: 0x2b2b2b, category: 'Decor', subcategory: 'Wall', wallMountable: true, relatedIds: ['mirror'] },

  // ---- Optional Luxury Items ----
  // Bean Bag Chair — ✅ fully researched.
  { id: 'beanbag-budget', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'budget', name: 'ILPEOD Basic Bean Bag Chair', price: 45, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FZ9R3SNH', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'beanbag', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'moderate', name: 'Corduroy Bean Bag Chair', price: 80, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B0FXXCCB7J', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'beanbag-premium', groupId: 'beanbag', groupLabel: 'Bean Bag Chair', tier: 'premium', name: 'Big Joe Fuf 7ft Giant Foam Bean Bag', price: 270, retailer: 'Amazon', productUrl: 'https://www.amazon.com/dp/B08T7L23Z7', dims: [2.8, 2.8, 2.5], color: 0xc1502e, category: 'Optional Luxury Items', modelUrl: '/models/loungeChairRelax.glb', relatedIds: ['rug', 'throw-pillow'] },
  { id: 'snack-cart', name: 'Snack Cart', price: 49, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [1.5, 1.3, 2.5], color: 0xb08d57, category: 'Optional Luxury Items', modelUrl: '/models/sideTable.glb', relatedIds: ['bev-cooler', 'fridge'] }, // TODO: placeholder link, replace with real product/search link
  // Vanity/Makeup Desk & Printer — placeholder link for now, per Tyler's final-links pass; new
  // catalog entries purely to unblock modeling (see Type D note at the top of this file's session).
  { id: 'vanity-desk', name: 'Vanity/Makeup Desk', price: 99, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [2.6, 1.3, 2.4], color: 0xe8e0cf, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['mirror', 'desk-lamp'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'printer', name: 'Printer', price: 79, retailer: 'Amazon', productUrl: 'https://www.amazon.com', dims: [1.5, 1.3, 0.8], color: 0x2b2b2b, category: 'Furniture & Organization', subcategory: 'Desk', relatedIds: ['desk', 'colgate-desk'] }, // TODO: placeholder link, replace with real product/search link
  { id: 'bev-cooler', name: 'Beverage Cooler', price: 89, retailer: 'Best Buy', dims: [1.6, 1.6, 2.6], color: 0xe4e4e4, category: 'Optional Luxury Items', modelUrl: '/models/kitchenFridgeSmall.glb', relatedIds: ['snack-cart'] },
]

// Furniture Colgate already provides in every standard residence hall room — the student isn't
// buying these, so they're kept separate from CATALOG (the purchasable list) and carry
// isProvided: true instead of a price. Source: Colgate Office of Residential Life, "Standard
// Residence Hall Furniture," updated 6.1.2026 (PDF). Room-variant sizes (Curtis Hall's smaller
// desk, taller 3-drawer chests) are skipped for v1 — these are the standard-room dimensions,
// verified against the PDF's own numbers.
//
// modelUrl points at Tyler's own Blender models (public/models/colgate*.glb, colgateBed.glb
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
// - modelRotationY (bed-shaped models) — a model whose long axis came in on the wrong local axis
//   would get its non-uniform scale-to-dims stretched sideways instead of lengthwise; a 90°
//   pre-rotation before fitting swaps which local axis lands on width vs. depth. colgateBed.glb
//   (colgate-bed/bed-full/bed-bunk's shared model — see the note above BEDDING_COLOR_SWATCHES)
//   needs no such rotation — confirmed by measuring its own POSITION accessor bounds, its longest
//   axis is already local X, the same convention _fitModelToDims expects with no rotation applied.
//
// The Stackable Chest is deliberately NOT in this list — see 'stackable-chest' in CATALOG above.
// Colgate doesn't guarantee every room gets one (the PDF's own wording is about variation between
// rooms), so it isn't auto-placed as "provided", but it's the exact same real item/model, just
// treated as purchasable.
export const PROVIDED_CATALOG = [
  // Was briefly split into colgateHeadboard.glb (head/footboard + posts) + colgateSlat.glb (base) +
  // colgateMattress.glb (mattress), fused together via extraModels so the slat+mattress could slide
  // to a Low/Standard/Lofted peg independent of the fixed headboard/footboard posts. Tyler has since
  // gone back to a single colgateBed.glb (frame + mattress fused into one mesh, same file bed-full
  // and bed-bunk use — see the note above BEDDING_COLOR_SWATCHES) so every bed in the app is the
  // same model, which means that peg-adjustment is gone: a single fused mesh has no separate
  // mattress piece left to slide independently of the frame, so this always renders at its one
  // modeled height now (matching how bed-bunk already worked). mattressTopY (3.0 × ~0.35 ≈ 1.05)
  // is this bed's own height times the mattress-top fraction measured by histogramming
  // colgateBed.glb's vertex Y positions for the big flat plateau (the mattress surface) — same
  // technique used to measure the old slat plateau before this consolidation, just re-run against
  // the new mesh. Tells _topSurfaceY where a topper/pillow should land.
  {
    id: 'colgate-bed', name: 'Twin XL Bed Frame', modelNo: '146RF', dims: [7.0, 3.08, 3.0], color: 0xc9a876,
    category: 'Provided', isProvided: true, modelUrl: '/models/colgateBed.glb', tintMaterial: true,
    isBed: true, mattressDims: [6.67, 3.08], mattressTopY: 1.05,
    relatedIds: ['chk:mattress-topper-memory-foam-gel-egg-crate', 'chk:mattress-protector', 'pillowcase-set', 'chk:comforter', 'bed-risers'],
  },
  { id: 'colgate-desk', name: 'Panel Desk', modelNo: '205C42', dims: [3.5, 2.0, 2.5], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateDesk.glb', tintMaterial: true, hasLegroom: true, relatedIds: ['lamp', 'shelf', 'desk-organizer', 'monitor-stand', 'chk:pencil-holder'] },
  { id: 'colgate-chair', name: 'Desk Chair', modelNo: '095', dims: [1.5, 1.83, 2.75], color: 0xc9a876, category: 'Provided', isProvided: true, modelUrl: '/models/colgateChair.glb', tintMaterial: true, isChair: true, relatedIds: ['colgate-desk'] },
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
//
// width/depth/height are each optional (null when the user left that field blank) — falls back
// per-axis to the stand-in's own dims, so "no dimensions entered" renders at the stand-in's real
// size instead of collapsing to 0×0×0.
export function buildCustomCatalogItem(row) {
  const standIn = findCatalogItemById(row.stand_in_catalog_id)
  const fallbackDims = standIn?.dims || [1, 1, 1]
  return {
    id: `custom-${row.id}`,
    customItemId: row.id,
    name: row.name,
    price: row.price,
    retailer: 'Custom Item',
    productUrl: row.product_url || null,
    dims: [
      row.width ?? fallbackDims[0],
      row.depth ?? fallbackDims[1],
      row.height ?? fallbackDims[2],
    ],
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
    productUrl: row.product_url || null,
    dims: [row.width_in / 12, 0.05, row.height_in / 12],
    color: 0xe8e0cf,
    category: 'Decor',
    subcategory: 'Wall',
    wallMountable: true,
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
