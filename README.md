# Dorm Room Planner

A 3D dorm room layout tool — set your room dimensions, drag furniture in from a catalog,
save layouts, and get a shopping list with retailer links. Built with Vite + React + Three.js,
same stack as "instead.".

## Run it locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Vercel

Same flow as "instead.":

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import the repo
3. Vercel auto-detects Vite — no config needed (build command `npm run build`, output dir `dist`)
4. Deploy

## Project structure

```
src/
  App.jsx           — UI + React state, wires the sidebar/panels to the 3D engine
  roomEngine.js     — all Three.js logic (scene, camera, items, drag/rotate), framework-agnostic
  catalog.js        — furniture items: dims, price, retailer, optional modelUrl for real 3D models
  storage.js        — Supabase-backed save/load/browse/copy for layouts (see "Setting up Supabase")
  supabaseClient.js — Supabase client, reads VITE_SUPABASE_* from .env
  useAuth.js        — React hook tracking the current Supabase auth session
  AuthPanel.jsx      — sign in / sign up form shown on the Saved tab when signed out
  index.css         — styling (warm/editorial theme — see "Visual design")
supabase/
  schema.sql          — full schema for a brand-new Supabase project
  migrations/          — incremental SQL for existing projects (run in order)
public/
  models/            — CC0 glTF furniture models (Kenney Furniture Kit) referenced by catalog.js
```

## Where things stand

- Room shell + dimension input ✅
- Add/drag/rotate furniture, clamped to room bounds ✅
- Warm/editorial visual theme (terracotta + sage + serif headings) — see "Visual design" below.
- Colgate-provided default furniture (bed, desk, chair, wardrobe) — one-click add from the
  Catalog tab, auto-placed against the walls, excluded from the total/shopping list since there's
  nothing to buy, and recoverable any time by clicking the button again. Models chosen to match
  Colgate's real furniture photos/dimensions as closely as free CC0 assets allow. See "Colgate
  default furniture" below.
- Catalog expanded from 12 to 30 placeable items, grouped into collapsible categories/
  subcategories matching Tyler's full dorm-shopping taxonomy. See "Expanded catalog" below —
  including where the other ~120 items from that list went (they're not 3D objects).
- Real glTF models for 23 of 30 catalog items, sourced from Kenney's CC0 Furniture Kit — see
  `public/models/`. The other 7 still use the box placeholder (no close model match, or
  genuinely fine as a plain box — see "Expanded catalog" below).
- Real thumbnail images in the catalog list (rendered from those same models, not sourced product
  photos) instead of flat color swatches — see "Real catalog thumbnails" below.
- Save/load layouts — backed by Supabase (auth + a `layouts` table), gated behind sign-in on the
  "Saved" tab. Your Supabase project is live (`.env` is filled in) — **but you need to run four
  migrations** for the features below. See "Setting up Supabase."
- Doors and windows — fixed-size doors, adjustable windows, both wall-mounted with a wall picker
  and constrained 1D drag along the wall. All four walls now render (was two). Also fixed a real
  bug found along the way: resizing the room used to silently delete your placed furniture. See
  "Doors & windows" below.
- Browse public layouts, copy one into your own account, and a lightweight designer flag +
  "Designed by" attribution — see "Marketplace, level 1" below.
- Real screenshot thumbnails on Browse/Saved rows, captured automatically on every save — see
  "Layout thumbnails" below.
- Packing checklist tab, seeded from Tyler's full ~150-item list on first visit, grouped/
  collapsible like the Catalog tab, with a "hide packed" toggle — see "Packing checklist tab"
  below. Code-reviewed but not yet tested against a live signed-in session (see that section).
- "Goes well with" suggestions when you select a placed item (bed, desk, chair, wardrobe, TV so
  far) — one-click add a related item to the room or the checklist. See "'Goes well with' popup"
  below.
- Shopping list with retailer links — currently plain search-result links. Affiliate tagging
  hook is in `catalog.js` (`AFFILIATE_TAGS`), just needs your real IDs once approved.
- Touch: pinch-to-zoom, `touch-action: none` on the canvas, and a stacked mobile layout below
  760px are in place.
- The Room Planner card (dimensions + door/window add buttons) can be minimized to a title bar
  via a toggle, freeing up screen space — see "Colgate default furniture" below for why this
  landed alongside that feature.

## Setting up Supabase

Your project already exists and `.env` is filled in — the `layouts` table works. Four migrations
have been added since you last ran one — all additive and safe to re-run:

1. Supabase dashboard → **SQL Editor → New query**, paste in the contents of
   [`supabase/migrations/002_marketplace.sql`](supabase/migrations/002_marketplace.sql), and run
   it. This adds a public-read policy for layouts where `is_public = true`, a `profiles` table
   (display name + `is_designer` flag, auto-created for every signup), and repoints
   `layouts.designer_id` at `profiles` so "Designed by" can be looked up in one query.
2. New query → paste in
   [`supabase/migrations/003_checklist.sql`](supabase/migrations/003_checklist.sql), run it. This
   adds the `checklist_items` table (owner-only — no public/marketplace angle here) backing the
   new Checklist tab.
3. New query → paste in
   [`supabase/migrations/004_layout_thumbnails.sql`](supabase/migrations/004_layout_thumbnails.sql),
   run it. This adds a `thumbnail_url` column to `layouts` and creates a public `layout-thumbnails`
   Storage bucket (with RLS: anyone can view, you can only upload/update/delete under your own
   `<user_id>/...` path) — backing the Browse tab's preview images.
4. New query → paste in
   [`supabase/migrations/005_wall_features.sql`](supabase/migrations/005_wall_features.sql), run
   it. Adds a `features` jsonb column to `layouts` (doors/windows — see "Doors & windows" below).
5. That's it — no new env vars needed for any of these.

(`supabase/schema.sql` is the complete from-scratch version, for reference or for setting up a
second environment. Since your project already has the original `layouts` table, use the
migrations above rather than re-running schema.sql.)

**Confirmed this session:** your project does require email confirmation on sign-up (a fresh
test signup got no session back). If you want to test the Checklist or Saved tabs yourself
without setting up email, either click the confirmation link Supabase emails you, or turn
confirmation off under **Authentication → Providers → Email → Confirm email**.

**Making someone a designer today:** there's no approval workflow yet (intentionally, see
"Marketplace, level 2" below) — signed-in users get an "Apply to be a designer" link in the Saved
tab that opens a pre-filled email (edit `DESIGNER_APPLY_EMAIL` in `App.jsx` to your real address).
To actually grant it, open **Table Editor → profiles** in Supabase and flip `is_designer` to
`true` for that user's row.

## Setting up Supabase (fresh project, from scratch)

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql) (includes everything, including
   the marketplace tables — a new project doesn't need the migration file separately).
3. In **Project Settings → API**, copy the **Project URL** and **anon public** key.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   `.env` is gitignored — never commit real keys.
5. Restart `npm run dev`.
6. By default Supabase requires email confirmation on sign-up. For local testing you can turn
   this off under **Authentication → Providers → Email → Confirm email**, or just click the
   confirmation link Supabase emails you.
7. When you deploy to Vercel, add the same two `VITE_SUPABASE_*` variables in the Vercel project's
   Environment Variables settings — `.env` only applies locally.

## Visual design

Replaced the original navy "blueprint/CAD" theme with a warmer, editorial furniture-catalog
look — the earlier theme read as architecture software, which works against an 18-year-old
furnishing a dorm room. New direction:
- Palette: warm off-white background, white cards, terracotta (`#C1502E`) as the one primary
  accent (CTAs, add buttons, active states), sage (`#6B7A5E`) used sparingly for secondary tags
  (retailer names, "Designed by" credit, public/designer badges).
- Type: Fraunces (serif) for headings and item/product names, Inter (sans) for UI/body text,
  JetBrains Mono kept only for prices and the dimension number inputs — not for headings or labels
  anymore.
- 3D scene: warm wood-tone floor, barely-there reference grid (was a bright blue drafting grid),
  soft near-white translucent walls (was a hard-edged wireframe).
- Shapes: 8–12px corner radius and soft shadows throughout, replacing the old 2px "technical"
  corners and hard borders.
All of this lives in `src/index.css` plus light JSX tweaks in `App.jsx`/`AuthPanel.jsx`
(copy changes, a few inline style updates) and material/light colors in `roomEngine.js`.

## Colgate default furniture

Source: Colgate Office of Residential Life, "Standard Residence Hall Furniture," updated
6.1.2026 (PDF Tyler provided) — bed, mattress, desk, chair, and wardrobe. Lives in `catalog.js`
as `PROVIDED_CATALOG`, a separate array from the purchasable `CATALOG` — each item carries
`isProvided: true` and no price.

- **Adding them**: a "🎓 Colgate dorm room?" card at the top of the Catalog tab, one button
  ("Add Colgate furniture") that places the bed, desk, chair, and wardrobe via
  `colgateDefaultLayout(room)` in `catalog.js` — bed along the back wall, desk+chair along the
  left wall, wardrobe alone along the right wall, scaled to whatever the current room dimensions
  are.
- **Recoverable after deletion**: the button is idempotent, not a one-time action — it only adds
  whichever of those four items aren't currently in the room, so deleting one (or all) and
  clicking the button again brings back just what's missing without duplicating anything still
  there. (Earlier version disabled the button permanently after first use, which meant deleting a
  Colgate item lost it for good; fixed per Tyler's explicit request.)
- **Matched against real photos**: the models were chosen by rendering several free CC0
  candidates from Kenney's Furniture Kit (`public/models/`) and comparing each against the PDF's
  actual product photos, not just picked by name — e.g. the desk chair uses `chair.glb` (a plain
  4-leg wood chair) instead of the office-chair-with-wheels model that ships elsewhere in the
  catalog, since Colgate's real chair is solid wood with no wheels. Colors unified to a light oak
  tone (`#c9a876`) matching the PDF photos. This is a "closest free shape match," not a pixel-
  identical replica — see the one open gap below.
  - **Known gap**: the PDF's bed is a bare metal-frame style with wood headboard/footboard ends
    and the mattress sold separately; no bare-frame twin bed exists in the free CC0 kit, so
    `bedSingle.glb` (which has a built-in upholstered/bedding look) is used as the closest
    available proportions-wise — not a strong shape match. Fixing this for real would need actual
    3D modeling (Blender) or a licensed asset.
- **The mattress is deliberately not auto-placed.** The bed frame model already renders bedding
  on top of it, and the engine has no concept of stacking one item on another (everything sits
  at floor level) — a separate flat box at floor level would just overlap/clip through the bed
  frame. The mattress is still in `PROVIDED_CATALOG` so the data matches the source list and it's
  there if you want to place or inspect it manually.
- **Stackable Chest is *not* part of the default set.** Colgate doesn't guarantee every room gets
  one, so it isn't auto-placed as "provided" — instead it's a normal purchasable `CATALOG` entry
  (`stackable-chest`, $79, same real dims/model as before) that shows up in the Furniture &
  Organization → Bed section like anything else, and *does* count toward the shopping list total,
  unlike the four items above.
- **Treated like any other placed item** — selectable, rotatable, movable, removable. The
  selection panel and cart list show "Included by Colgate" / a sage "COLGATE" tag instead of a
  price, and both the total and the shopping-list modal filter on `isProvided` so nothing shows
  up as something to buy.
- **Room-variant sizes skipped for v1**: Curtis Hall's smaller desk (2.5×1.67×2.5) isn't modeled —
  everyone gets the standard-room dimensions from the PDF. Worth a toggle later if it turns out to
  matter.
- **Not built**: an automatic/forced default (it's opt-in via the button, not applied to every
  new room) — a lot of users of this app won't be Colgate students, so auto-applying Colgate-
  specific furniture by default felt wrong. Revisit if usage data says otherwise.
- **Verified live**: added the 4 default items, deleted the wardrobe, clicked "Add Colgate
  furniture" again and confirmed only the wardrobe came back (no duplicates of the other three);
  added the Stackable Chest from the catalog and confirmed it renders with its own thumbnail, adds
  a real 3D model to the room, and is the only line item in the shopping list ($79 total) while
  the four provided items stay excluded; confirmed the Room Planner card's collapse toggle hides
  the dimension inputs and door/window buttons down to just the title bar and back.

## Expanded catalog

Source: Tyler's full dorm-shopping list (~150 items across 11 categories, pasted in chat — no
separate file). Restructured `CATALOG` in `catalog.js` around that taxonomy and split the list
into two buckets, per the explicit instruction not to force every single item into the 3D room:

- **Placeable** (real physical footprint worth positioning) — these are in `CATALOG`. Grew from
  12 to 30 items: the original 12 retagged into the new `category`/`subcategory` fields, plus 18
  new items (under-bed bins, rolling storage drawers, shoe rack, laundry hamper, rolling cart,
  storage ottoman, TV, microwave, trash can, drying rack, ironing board, fan, musical instrument,
  potted plant, throw pillow, bean bag chair, snack cart, beverage cooler). 23 of the 30 have a
  real glTF model (new Kenney Furniture Kit pulls in `public/models/`); the other 7 (mattress,
  storage cubes, mirror, rolling cart, ironing board, fan, musical instrument) use the box
  placeholder — either no close match in the kit, or a box is honestly fine (a mattress really is
  just a box).
- **Checklist-only** (small/consumable — pens, detergent, sticky notes, individual dishware,
  etc.) — these are **not** in `CATALOG`. They're in the new `checklistItems.js` instead
  (`DEFAULT_CHECKLIST_ITEMS`, ~128 items with `label`/`category`/`subcategory`), matching the
  data shape the packing-checklist tab (a separate feature) will need to seed a new user's list.
  **Nothing reads this file yet** — no checklist tab exists in the app; it's prepared data, not a
  built feature. Wiring it up is its own session.
- Two categories from the taxonomy (School Supplies, Bathroom) have zero placeable items — every
  item in those is checklist-only — so they never appear in the 3D catalog, only in
  `checklistItems.js`.
- **UI**: the Catalog tab now groups items by category as collapsible sections (all collapsed by
  default, so it's not one long scroll), with subcategory labels inside each open section. New
  CSS classes `.category-header`/`.category-meta`/`.subcategory-label` in `index.css`; grouping
  logic lives inline in `App.jsx` (`groupedCatalog`), not in `catalog.js`, since it's presentation
  concern rather than data.
- A handful of placeable items intentionally reuse the same model as a visually-similar item
  (e.g. `trashcan.glb` for both "Trash Can" and "Laundry Hamper") rather than adding a near-
  duplicate silhouette — same reuse pattern already established for the Colgate furniture.

## Real catalog thumbnails

Catalog rows now show an actual image per item instead of a flat color swatch — rendered from
each item's own glTF model (`thumbnailRenderer.js`), not sourced product photos, so this doesn't
reopen the licensing question the CC0 models were chosen to avoid.

- **How it works**: `renderModelThumbnail()` loads a model into an off-screen Three.js scene
  (same warm lighting as the room), scales it to the item's real dims so relative proportions
  still read (a bed looks bigger than a nightstand), auto-frames the camera to each item's own
  bounding sphere, and exports a 256×256 PNG (`toDataURL`). Generated **once**, ahead of time —
  not at runtime for every visitor. The 23 static PNGs live in `public/thumbnails/` (~200KB
  total) and `CatalogThumb` in `App.jsx` just points an `<img>` at `/thumbnails/<id>.png`.
- **Fallback**: items without a `modelUrl` (mattress, storage cubes, etc.) keep the color swatch,
  now with a small category emoji overlaid (reusing `CATEGORY_ICONS`) instead of a blank chip. If
  a thumbnail image 404s for any reason, `CatalogThumb` falls back to the same swatch+icon
  automatically (`onError`) — a missing PNG file degrades gracefully instead of breaking the row.
- **Regenerating thumbnails** (after adding a new item or changing a `modelUrl`): run the app
  locally, open devtools console, run `await generateAllThumbnails({ saveToServer: true })`. That
  writes straight into `public/thumbnails/` via a small dev-only Vite middleware
  (`/__save-thumbnail` in `vite.config.js` — real filesystem access via the Vite dev server's own
  Node process, never included in a production build). Omit `saveToServer` (or pass `download:
  true`, the default) to get one browser download per item instead if you'd rather move files
  by hand.
- **A build note, in case you touch this later**: generating many thumbnails back-to-back on one
  shared WebGL context needs a short delay between renders (already in the code, `60ms`) — without
  it, a long catalog can exhaust the browser's concurrent-WebGL-context budget partway through and
  silently produce blank/corrupt images for the rest. Also, if you use the `saveToServer` path,
  note that Vite's dev-server file watcher is configured to ignore `public/thumbnails/` — without
  that, new files landing there mid-generation trigger a full page reload that kills the batch.

## Packing checklist tab

New "Checklist" tab, gated behind sign-in (reuses the same `AuthPanel`/session as Saved). Same
interaction model as "instead."'s to-do list minus date/time fields — a checkable list grouped by
category, with add/remove.

- **Data**: `checklist_items` table (migration 003) — `user_id`, `label`, `category`,
  `subcategory`, `checked`, `is_custom`. Owner-only RLS, no public/marketplace angle here (unlike
  `layouts`).
- **First visit seeds automatically**: `listChecklistItems()` in `storage.js` checks if you have
  zero rows and, if so, bulk-inserts all 128 items from `checklistItems.js`'s
  `DEFAULT_CHECKLIST_ITEMS` (prepared back when the catalog was split into placeable vs.
  checklist-only items) before returning. Every visit after that just returns whatever you've
  actually got, including anything you've since deleted or added — it only seeds once.
- **UI**: same collapsible category-section pattern as the Catalog tab (all collapsed by default),
  but over `CHECKLIST_CATEGORY_ORDER` — all 11 of Tyler's categories, including School Supplies
  and Bathroom, which have zero placeable items but plenty of checklist ones. Each row is a
  checkbox + label (strikethrough when checked) + a delete `×`; each open category has an inline
  "add an item" field at the bottom that adds straight into that category (no subcategory —
  custom items land in an unlabeled group at the end of the section).
- **"Hide packed" toggle**: filters checked rows out of view, but category headers keep showing
  true totals (e.g. "5/5") even when every row in that category is hidden — a fully-packed
  category collapsing out of the list entirely felt like it would read as a bug, not a feature.
- **Not built**: bulk actions (check/delete-all), category-level custom items with a
  user-typed category name (the spec's "or an 'Other' category" — you can already add a custom
  item to any existing category, just not invent a brand new one), a reset-to-defaults button.
- **Not verified live**: I couldn't get a real signed-in session in this environment (Supabase
  requires email confirmation on your project, and I don't have inbox access — confirmed a fresh
  test signup gets no session back). Verified: builds clean, the sign-in gate renders correctly,
  no console errors, and the storage.js/App.jsx logic got a careful review pass — but the actual
  seed-on-first-visit / check / add / delete round-trip against your database needs you to try it
  once signed in.

## "Goes well with" popup

Select a placed item with `relatedIds` and the selection panel now shows a "Goes well with"
section below Rotate/Remove — one row per related item, each with a one-click "+ Room" (adds
straight into the 3D room) or "+ Checklist" (adds to your packing checklist) button.

- **Data**: `relatedIds` is a plain array on a `CATALOG`/`PROVIDED_CATALOG` item — a bare id
  (`'mattress'`) points at another placeable catalog item; a `chk:`-prefixed id
  (`'chk:mattress-protector'`) points at a checklist-only item by its slug, resolved via
  `resolveRelatedItems()` in `catalog.js`.
- **Checklist items now have stable slug ids** (`checklistItems.js`, derived automatically from
  each label via a small `slugify()` — not hand-typed, so there's no risk of the id and the label
  drifting out of sync). These ids are purely a client-side lookup key for this feature; they're
  never sent to the database (`checklist_items` rows use their own uuid primary key).
  Verified all 128 are unique, including disambiguating the one duplicate label ("Laundry bag"
  appears under two categories in Tyler's original list).
- **Kept deliberately sparse, per the instructions**: only 5 items have `relatedIds` so far — bed
  (→ mattress + bedding essentials), the Colgate-provided bed frame (→ the same bedding essentials,
  since the frame is provided but the bedding isn't), desk (→ chair, lamp, desk organization),
  chair (→ desk), wardrobe (→ shoe rack, storage cubes, closet essentials), and TV (→ streaming/
  gaming/speaker essentials). Add more over time by adding a `relatedIds` array to any catalog
  item — no other wiring needed.
- **"+ Checklist" while signed out**: switches to the Checklist tab (which shows the sign-in
  gate) rather than failing silently or erroring — same redirect pattern already used for "Copy to
  your layouts" on the Browse tab.
- **Known rough edge, left as-is for v1**: "+ Checklist" always inserts a new row — it doesn't
  check whether you already have that item (e.g. from the default seed) and would check it
  instead. Given the checklist may not even be loaded yet when you click this (it's lazy-loaded
  only when you visit the Checklist tab), avoiding that meant either an extra fetch on every click
  or accepting occasional duplicates; duplicates felt like the smaller cost for v1. A checkbox
  that's already there twice is a minor annoyance, not a bug that loses data.
- **Verified live** (this one I could fully test, no auth required to place items into the room):
  added the bed, confirmed all 5 related rows render with correct pill colors, clicked "+ Room" on
  the mattress and watched it land in the room with the total updating correctly, and confirmed
  "+ Checklist" redirects to the sign-in gate when signed out. Also spot-checked the wardrobe/TV/
  Colgate-bed mappings resolve correctly via direct console calls.

## Layout thumbnails (Browse + Saved tabs)

Both the Browse and Saved tabs now show a real screenshot of each layout instead of a text-only
row (Saved wasn't explicitly asked for, but it's the exact same data/component, so showing it
there too was close to free).

- **Captured on every save**, not just on publish. `roomEngine.js`'s new `captureSnapshot()`
  grabs the live 3D canvas at save time and `storage.js`'s `saveLayout` uploads it to the
  `layout-thumbnails` Storage bucket, storing the public URL on the row. Deliberately *not*
  captured at publish time (toggling a layout public/private on the Saved tab) — the layout you're
  publishing isn't necessarily the one currently loaded in the 3D view, so a live capture then
  could easily screenshot the wrong room. Capturing at save time means the image always matches
  the exact `room`/`items` it's attached to.
- **A real rendering bug I caught before it shipped**: the renderer runs `alpha: true` with no
  `scene.background` — in the live app the warm CSS gradient behind the canvas shows through the
  transparent parts (above/around the room). JPEG has no alpha channel, so naively exporting that
  canvas turned every transparent pixel solid **black** — a jarring black band around every
  thumbnail. Fixed by setting `scene.background` to the theme's warm off-white for just that one
  render call, then restoring it to `null` immediately after so live rendering is unaffected.
  Screenshotted the before/after myself to confirm — worth knowing about if you touch
  `captureSnapshot()` later.
- **Copying a layout reuses the original thumbnail** rather than re-rendering one (the room/items
  are identical to what was copied, so the existing image is still accurate) — avoids needing the
  3D view to be showing that exact layout at copy time.
- **Deleting a layout best-effort deletes its thumbnail file too** (won't fail the delete if that
  part errors — an orphaned image in storage is a much smaller problem than a delete that
  silently doesn't work).
- **Fallback**: layouts saved before this feature (or if an upload ever fails) have
  `thumbnail_url: null` — rows show a plain 🏠 icon instead of breaking. Same pattern as
  `CatalogThumb`'s swatch fallback.
- **Verified live**: tested `captureSnapshot()` directly against a throwaway `RoomEngine`
  instance (no auth needed for this part) — confirmed it correctly captures placed furniture, and
  caught + fixed the black-background bug by actually looking at the rendered output before and
  after the fix. Verified the Browse tab still degrades gracefully (clear error message, no
  crash) against your live project pre-migration. The actual Storage upload/RLS path needs you to
  test signed in, once you've run migration 004 — same auth limitation as the checklist feature.

## Doors & windows

The last of the seven-feature batch, and the one you flagged as most complex — built last, on
top of everything above.

**A real, pre-existing bug found and fixed along the way**: resizing the room (width/length
inputs) was silently deleting all placed furniture from view. `buildRoom()` calls
`roomGroup.clear()` on every resize to rebuild the floor/grid/walls, and furniture meshes were
children of that same group — so they got detached from the scene graph too. The data model
still thought they existed (the cart count and selection panel didn't change), they just stopped
rendering. I caught this by testing the resize path myself (placed a bed, changed the width
input, watched it disappear) before building anything new on top of it, since doors/windows
needed that exact code path to keep *their* meshes alive across resizes too. Fixed by giving
furniture and wall features their own top-level groups (`itemsGroup`, `featuresGroup`), separate
from the shell group that actually gets rebuilt.

- **Doors**: fixed 3.0' × 6.67' (36"×80", standard residence hall door) — not resizable, matching
  the spec. Rendered as an outlined opening on the wall plus a floor-level swing arc + door-leaf
  line (the standard architectural floor-plan door symbol, projected onto the floor since this is
  a 3D perspective view rather than a top-down plan) — not real geometry cut into the wall mesh,
  per the explicit instruction to skip CSG boolean subtraction here.
- **Windows**: adjustable width (1.5–6') and height (2–5') via number inputs when selected,
  rendered as a translucent light-blue pane with a frame + cross mullion, sitting at a fixed 2.5'
  sill height.
- **All four walls now render** (previously only back + left existed) — necessary so doors/
  windows can go on any side; still faint/translucent, same visual treatment as before.
- **Placement/drag model**: "+Door"/"+Window" buttons in the Room Planner card add one centered
  on the back wall (not a click-a-wall-to-place flow — see below for why); dragging a selected
  door/window slides it along its *current* wall's length only (1D, clamped so it can't slide
  past the wall's corners — reuses the same floor-plane raycasting technique as furniture drag,
  projected onto whichever world axis that wall runs along). To put one on a *different* wall,
  the selection panel has a 4-button wall picker instead of supporting drag-across-walls — that
  would need detecting proximity to a neighboring wall mid-drag and re-projecting coordinates,
  meaningfully more complex for a rare action a dedicated button handles in one click.
- **A real bug caught during testing, not just written correctly on the first try**: reassigning
  a door/window's wall or resizing a window correctly updated the 3D mesh, but the selection
  panel didn't re-render — `setFeatureWall`/`setFeatureSize` mutated the engine's internal state
  and moved the mesh, but never re-told React about it, so the wall picker and width/height
  inputs silently went stale (clicking "Right" moved the door but the button stayed showing
  "Back" as active). Caught by checking the actual DOM/computed styles after clicking, not just
  eyeballing a screenshot. Fixed with a shared `_emitFeatureSelection()` re-emit after any in-place
  mutation to the selected feature.
- **Selection is mutually exclusive** with furniture — selecting a door deselects any selected
  item and vice versa, both directions enforced inside the engine (not just in React), so there's
  never a state where both panels could try to render at once.
- **Persisted through save/load**: `getState()`/`loadState()` include a `features` array
  alongside `items`; `layouts.features` (migration 005) carries it through Supabase the same way
  `items` already does.
- **Not built**: true geometry cutting (explicitly out of scope per the spec), drag-to-reassign-
  wall, and multiple doors/windows auto-avoiding each other's position when added (two "+Door"
  clicks both center on the back wall and overlap until you drag one — a minor rough edge, not
  fixed, in the interest of keeping default placement simple as instructed).
- **Verified**: the resize-persistence fix and full door/window flow (add, wall picker, resize,
  remove, coexisting with furniture, mutual-exclusivity, mobile layout) live in the browser.
  Precisely verified drag-along-wall and boundary clamping via real `PointerEvent`s dispatched at
  camera-projected screen coordinates against a throwaway engine instance (not just reasoning
  about the code) — confirmed an offset moves correctly mid-drag and clamps exactly at
  `wallLength − width/2` when dragged past a wall's end. Verified the `getState()`/`loadState()`
  round-trip for both items and features together (had to account for furniture's async glTF
  loading in the test itself — an immediate post-add snapshot legitimately races the model load).

## Marketplace, level 1 (browse + designer attribution — done)

- **Publish/unpublish**: each row in the Saved tab has a PUBLIC/PRIVATE toggle
  (`setLayoutPublic` in `storage.js`). Publishing as a flagged designer stamps the layout with
  your `designer_id`; publishing as a regular user leaves it public but uncredited.
- **Browse tab**: lists every public layout (works for signed-out visitors too — it's a
  read-only RLS policy, no auth required). Each row has a "View" button (loads it into the main
  3D canvas without saving) and a "Copy" button (saves a new private copy into your own account —
  requires sign-in; clicking it while signed out sends you to the Saved tab instead of failing
  silently).
- **Designer flag**: `profiles.is_designer`, off by default, no self-serve approval flow — see
  "Making someone a designer today" above.
- Deliberately not built: profile-editing UI (display name defaults to your email prefix), any
  kind of moderation/reporting on public layouts, sorting/filtering the browse list beyond
  newest-first. Add these once there's enough real usage to know which ones matter.

## Marketplace, level 2 (custom orders + payment — not started, on purpose)

Holding off on this until level 1 has real usage — Stripe Checkout, a `design_requests` table,
webhooks, and refund/failure handling are a lot of surface area to build speculatively for zero
current designers. When you're ready: a "Request a custom design" form → Stripe Checkout for the
request fee → a `design_requests` table (`requester_id`, `designer_id`, room dims, notes, status,
price, `stripe_payment_id`) → the designer gets a link to load that user's room in the normal
editor and save changes back as the delivery. Commission split logic (designer's cut of a
shopping-list checkout) comes after that loop works, not before.

## Next steps

**The seven-feature batch (Colgate furniture → doors & windows) is done** — see the dedicated
sections above for each one. What's left is mostly pre-existing, cross-cutting work:

**1. Grow the real 3D catalog — 23/30 stubbed in with generic CC0 models, still the long pole**
The models in `public/models/` are generic low-poly stand-ins (Kenney's kit), not the actual
IKEA/Amazon/Target/Best Buy products in the catalog — good enough to stop the room looking like
a pile of boxes, not good enough to ship as "this is the exact item you're buying." For each item:
- Best case: the retailer/manufacturer already has a glTF/GLB (IKEA has some; Wayfair has 3D/AR
  for parts of their catalog via partner APIs)
- Otherwise: model it yourself in Blender (doesn't need to be photoreal — just recognizable and
  correctly scaled) or hire someone on a freelance platform to do a batch of simple furniture
  models

**Remaining 7 box-placeholder items** (mattress, storage cubes, mirror, rolling cart, ironing
board, fan, musical instrument): checked Kenney's other asset kits and searched Poly Haven / Poly
Pizza for standalone matches — nothing turned up with clearly-verified CC0 licensing and a clean
glTF download for the first three, and grabbing an unvetted model off a random itch.io page felt
like the wrong tradeoff. The mattress is honestly close to fine as a box — a mattress is
fundamentally a rounded rectangular box. The rest genuinely need either a proper sourced model or
~15 minutes each in Blender — isolated from everything else, pick up whenever convenient.

**2. Affiliate programs**
Apply to Amazon Associates, and Impact (covers Target + Best Buy) and Awin (covers IKEA) once
you have a live site to point them at. Drop your tracking IDs into `AFFILIATE_TAGS` in
`catalog.js`.

**3. Mobile — functional, one known layout rough edge**
Pinch-to-zoom, `touch-action: none` on the canvas (so touch-drag doesn't fight the browser's
scroll/pinch gestures), a stacked layout under 760px, and larger tap targets for buttons are in.
The item/feature selection panel is absolutely positioned and can grow tall (especially with a
"Goes well with" section full of related items) — on narrow screens a tall panel anchored to the
bottom can overlap the Room Planner card at the top. Not fixed — would need a real mobile-specific
layout pass for that panel (e.g. a bottom sheet), not a quick tweak. Still untested on real
hardware — worth a pass with an actual device before leaning on mobile traffic.

**4. Marketplace, level 2** — Stripe-backed custom design requests. Deliberately not started; see
"Marketplace, level 2" above for why.
