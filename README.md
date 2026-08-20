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
  main.jsx          — entry point; sets up react-router-dom's two routes (/layouts/:id and *)
  App.jsx           — UI + React state, wires the sidebar/panels to the 3D engine (the "*" route)
  LayoutDetailPage.jsx — standalone /layouts/:id page: static render + likes/comments/lineage
  roomEngine.js     — all Three.js logic (scene, camera, items, drag/rotate), framework-agnostic
  catalog.js        — furniture items: dims, price, retailer, optional modelUrl for real 3D models
  storage.js        — Supabase-backed save/load/browse/copy for layouts (see "Setting up Supabase")
  supabaseClient.js — Supabase client, reads VITE_SUPABASE_* from .env
  useAuth.js        — React hook tracking the current Supabase auth session
  AuthPanel.jsx      — sign in / sign up form shown on the Saved tab when signed out
  index.css         — styling (warm/editorial theme — see "Visual design")
api/
  layout-preview.js — Vercel serverless function; Open Graph meta tags for link-unfurling bots
vercel.json         — routes bot user-agents on /layouts/:id to api/layout-preview.js
supabase/
  schema.sql          — full schema for a brand-new Supabase project
  migrations/          — incremental SQL for existing projects (run in order)
public/
  models/            — CC0 glTF furniture models (Kenney Furniture Kit) referenced by catalog.js
  terms.html         — placeholder Terms of Service (needs real legal review, see that section)
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
- Catalog grown again, from 30 to 44 items — most major categories (beds, desks, desk chairs,
  bookshelves, lighting, rugs) now have 2-3 real style options instead of one predetermined item,
  plus a brand-new Seating subcategory (accent chair, loveseat). Every new model is CC0, sourced
  and logged in `public/models/LICENSES.md`. See "Furniture sourcing" below.
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
- Community tier 1: likes, saves/bookmarks, copy attribution ("Based on X"), hall/room-type
  filters, and Browse as the default landing tab. Code-complete and builds clean, but **needs
  migration 006 run and the whole thing tested by you** — see "Community tier 1" below and
  "Setting up Supabase" above.
- Real screenshot thumbnails on Browse/Saved rows, captured automatically on every save — see
  "Layout thumbnails" below.
- Packing checklist tab, seeded from Tyler's full ~150-item list on first visit, grouped/
  collapsible like the Catalog tab, with a "hide packed" toggle — see "Packing checklist tab"
  below. Code-reviewed but not yet tested against a live signed-in session (see that section).
- "Goes well with" suggestions when you select a placed item — now on all 44 catalog items, not
  just a handful. See "'Goes well with' popup" below and "Item dimensions, stacking, and
  checklist/suggestions fixes" for the expansion.
- A "📏 Dimensions" button on the selection panel (width/depth/height, feet+inches), and stacking
  one item on top of another (e.g. a TV on a desk) via "⬆ Put on top of…" — see "Item dimensions,
  stacking, and checklist/suggestions fixes" below.
- Shopping list with retailer links — currently plain search-result links. Affiliate tagging
  hook is in `catalog.js` (`AFFILIATE_TAGS`), just needs your real IDs once approved.
- Touch: pinch-to-zoom, `touch-action: none` on the canvas, and a stacked mobile layout below
  760px are in place.
- The Room Planner card (dimensions + door/window add buttons) can be minimized to a title bar
  via a toggle, freeing up screen space — see "Colgate default furniture" below for why this
  landed alongside that feature.
- Public profile pages (bio, hall, class year, follower/following counts, their public layouts)
  and follow/unfollow, reachable by clicking any layout's byline anywhere in the app. **Needs
  migration 007 run and tested by you** — see "Public profiles + follow" below.
- Tags on published layouts (suggested chips + custom), a multi-select tag filter on Browse
  (AND logic, combines with hall/room-type), and a "Featured" horizontal-scroll strip curated by
  hand in Supabase. **Needs migration 008 run and tested by you** — see "Tags, filters, featured
  collections" below. **Currently blocks all of Browse until it's run** — see the callout above.
- Basic moderation: a 🚩 report action on layouts and profiles (and now comments, see below),
  reviewed by hand in Supabase — no dashboard UI. Plus a placeholder Terms of Service page
  (`public/terms.html`, linked from the Saved tab) — needs real legal review before this has real
  public users, see that section for the caveat. **Needs migration 009 run** — see "Basic
  moderation + Terms of Service" below.
- Comments on individual layouts, a real shareable `/layouts/:id` route (react-router-dom, new
  dependency), a 🔗 copy-link action, and a Vercel serverless function for Open Graph link
  previews in iMessage/Discord/Slack/etc. **Needs migration 010 run, and the OG preview piece
  specifically can only be tested against your live Vercel deployment, not this dev environment**
  — see "Comments + shareable links + Open Graph previews" below.
- Badges (computed on the fly, not stored) and a leaderboard (top designers, top layouts this
  month) — reachable via a "🏆 Leaderboard" link on Browse. **No migration needed, verified fully
  live against your real data** — see "Badges + leaderboard" below.

## Setting up Supabase

Your project already exists and `.env` is filled in — the `layouts` table works. Five migrations
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
5. New query → paste in
   [`supabase/migrations/006_community_tier1.sql`](supabase/migrations/006_community_tier1.sql),
   run it. Adds likes, saves/bookmarks, copy attribution, and hall/room-type filtering — see
   "Community tier 1" below. (Confirmed run — Browse loads with counts/bylines correctly.)
6. New query → paste in
   [`supabase/migrations/007_profiles_follow.sql`](supabase/migrations/007_profiles_follow.sql),
   run it. Adds `bio`/`display_hall`/`class_year` to `profiles` and a new `follows` table — see
   "Public profiles + follow" below. **Same limitation as before — I can't run this one for you**
   (anon key only). Until you run it, profile pages show "This profile could not be found" instead
   of a raw schema error (verified live), and the Follow button/Following filter won't work — the
   rest of the app is unaffected.
7. New query → paste in
   [`supabase/migrations/008_tags_featured.sql`](supabase/migrations/008_tags_featured.sql), run
   it. Adds a `tags` array column to `layouts` plus `featured_collections`/
   `featured_collection_layouts` (curated by hand — see that section below for how). **Fixed a
   real bug in this file** — the GIN index line had `USING gin (tags) ON layouts` (wrong clause
   order; Postgres wants `ON table USING method`), which you correctly hit as a syntax error when
   you ran it. Now reads `create index layouts_tags_idx on layouts using gin (tags);` — re-run the
   file, it should go through cleanly this time. (Not yet re-confirmed against your live project
   past that fix — please re-run and let me know if anything else comes up.)
8. New query → paste in
   [`supabase/migrations/009_moderation.sql`](supabase/migrations/009_moderation.sql), run it.
   Adds a `reports` table (reviewed by hand in the table editor — no admin UI). This one doesn't
   block anything else if you skip it for now — the Report button just surfaces whatever error
   comes back, same graceful-degradation pattern as everything else.
9. New query → paste in
   [`supabase/migrations/010_comments.sql`](supabase/migrations/010_comments.sql), run it. Adds a
   `comments` table — see "Comments + shareable links + Open Graph previews" below.
10. That's it — still no new env vars needed for any of these, including the OG preview
    serverless function below (it reuses `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, already set
    in your Vercel project).

**Run migrations 006–009 in order if you haven't already** — 008 in particular currently blocks
the *entire* Browse list (not just tags), since `listPublicLayouts()` now unconditionally selects
the new `tags` column. Verified live: right now Browse shows zero rows and one clear inline error
("column layouts.tags does not exist") instead of the layouts that are actually there. Every
other migration so far degraded more narrowly (missing a specific feature, not the whole list) —
this is the one where running the migration matters most before you go looking for missing rows.

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
- **Follow-up fixes (after Tyler tried it live)**:
  - **Bed frame, take two**: `bedSingle.glb`'s baked-in headboard wasn't fixable with `hideNodes`
    alone (it's fused into the same mesh primitive as the side rails/legs — no separate node to
    hide), so it needed actual geometry surgery. Wrote a one-off Python script (pygltflib +
    numpy) that loads the glTF, isolates the headboard's 18 triangles by position (the one
    z-extreme with vertices rising well above the rest of the frame's height) out of the 52 in
    the "wood" primitive, and re-exports the buffer with those triangles removed and every
    bufferView after that point in the binary blob re-offset to match. Saved as
    `public/models/bedFrameBare.glb` (still CC0 — a derivative of a public-domain asset), used
    only for `colgate-bed`; the purchasable "Twin XL Bed Frame" elsewhere in the catalog still
    uses the original `bedSingle.glb` since nothing was reported wrong with that one. Result: a
    bare frame with side rails and legs, no headboard, no footboard — `hideNodes: ['cover',
    'pillow']` (added in the same pass) still strips the blue mattress cover and pillow that are
    separate nodes on top of the frame mesh.
  - **A real, unrelated bug found while testing this**: dragging any *tall* item after rotating it
    90° (e.g. the wardrobe, 6' tall but only 2.08' deep) stopped several feet short of the wall
    instead of going flush. Root cause: `_clampItemToRoom` in `roomEngine.js` destructured
    `dims` (`[width, depth, height]`) as `let [w, , d] = dims`, skipping index 1 (depth) and
    grabbing index 2 (**height**) into `d` by mistake — so the wall clamp was using the item's
    *height* as if it were its horizontal footprint. For a squat item this was barely noticeable
    (the bed's height and depth happen to be close); for a 6'-tall wardrobe with a 2.08' depth it
    left a multi-foot gap no amount of dragging could close. Fixed to `let [w, d] = dims` (just
    the first two). Confirmed via direct engine calls that the wardrobe's clamp boundary now
    exactly matches `room.w/2 - depth/2` instead of the old (wrong) `room.w/2 - height/2`, and
    confirmed visually that it now sits flush against the wall.

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

## Community tier 1 (likes, saves, copy attribution, hall/room-type filters)

First slice of "make Browse feel like a community, not a plain list" — explicitly not the full
thing (no profiles, follow, comments, or sharing yet; those are later sessions once this is live
and tested). **I could not run migration 006 or test any of this against your live database** —
see "Setting up Supabase" above. Everything below is code-complete and builds clean; treat it as
reviewed-but-unverified until you've run the migration and clicked through the testing checklist
at the end of this section yourself.

- **Data model**: migration `006_community_tier1.sql` adds `likes_count`/`view_count`/
  `copy_count` (all denormalized integers, default 0), `parent_layout_id` (set when a layout is
  created via Copy, points at the original), and optional `hall`/`room_type` text columns to
  `layouts`; two new tables, `layout_likes` and `layout_saves`, both `(user_id, layout_id)` with a
  unique constraint so toggling is a plain insert-or-delete, never a race-prone read-then-write.
- **Why counters are triggers/RPCs, not client-side updates**: liking, copying, or viewing someone
  *else's* layout is an action taken by a user who doesn't own that row — the existing owner-only
  `layouts` UPDATE policy would block a plain client `.update()` call from anyone but the layout's
  creator. `likes_count` syncs via a `SECURITY DEFINER` trigger on `layout_likes` insert/delete;
  `view_count`/`copy_count` go through two narrow `SECURITY DEFINER` RPC functions
  (`increment_layout_view_count`/`increment_layout_copy_count`) that only ever nudge one column by
  exactly 1, and only on layouts that are public or owned by the caller — bypassing RLS just
  enough to make the counter work, not opening any broader write access.
- **Likes**: heart icon on every Browse/Saved-from-others row, filled + count when you've liked it.
  `likeLayout`/`unlikeLayout`/`listMyLikedLayoutIds` in `storage.js`; the UI updates the count
  optimistically on click rather than refetching the whole list.
- **Saves/bookmarks**: a separate ☆/🔖 button, deliberately not reusing Like — saving-for-later and
  liking are different actions (you might like a layout you'd never use, or bookmark one you're
  lukewarm on). Doesn't duplicate the layout into your own editable set the way Copy does; it just
  marks it. Shows up under the Saved tab's new "Saved from others" view.
- **Saved tab split**: "My Layouts" (yours, editable/publishable, unchanged from before) vs. "Saved
  from others" (bookmarks — new) as two sub-views within the same tab, since they're different
  things now. Both use the same underlying row rendering as Browse for the "others'" case
  (`PublicLayoutRow` in `App.jsx`) to avoid maintaining three near-identical row layouts.
- **Copy attribution**: `copyLayout` now stamps the new row's `parent_layout_id` and bumps the
  original's `copy_count`. Any row with a parent shows "Based on '<name>' by <author>" with a link
  that loads the original (`getPublicLayoutById` — fetches fresh rather than trusting possibly
  stale data already in hand). On your own layouts in "My Layouts", if anyone has copied *from*
  one of yours, it also shows "X people remixed this" (tallied client-side from one extra query
  in `listLayouts`, not N+1 per row).
- **Hall / room-type filters**: two dropdowns above the Browse list. Hall is free text (per the
  brief — no fixed hall list), so its dropdown is populated from whatever distinct values already
  exist among public layouts (`listDistinctHalls`), not hardcoded. Room type is a fixed
  `['single', 'double', 'triple']` (`ROOM_TYPES` in `App.jsx`) since the brief called it
  "enum-ish" — enforced only at the app layer, not a DB check constraint, so old/blank data never
  blocks a read.
- **Publish flow**: going from PRIVATE → PUBLIC in "My Layouts" now opens a small prompt for
  optional hall + room type before publishing (a "Skip & publish" button publishes without them).
  Going PUBLIC → PRIVATE is unchanged — no prompt, since there's nothing to ask at that point.
  Un-publishing never clears previously-set hall/room type, so republishing later doesn't lose them.
- **Landing tab**: default tab changed from Catalog to Browse (`useState('browse')` in `App.jsx`)
  — first thing anyone sees, signed in or not, is real layouts from other students. "start from
  scratch" is one click away in Browse's own header copy (jumps to Catalog), and View/Copy on any
  row are the "start from a copied layout" path — nothing about starting fresh in an empty room
  got harder to reach, it's just no longer the default.
- **Signed-out visitors**: View (and the view-count bump it triggers) works with no session — the
  RPC is granted to the `anon` role, and it silently no-ops rather than erroring if a layout isn't
  visible to the caller. Like/Save redirect to the Saved tab's sign-in gate, same pattern already
  used for Copy.
- **What I verified before the migration was even runnable**: the app builds clean, and Browse
  degrades correctly against the *current* (pre-migration) database — it renders the landing tab,
  filter dropdowns, and empty state, and surfaces a clear inline error (not a crash) when the query
  hits a column/relationship that doesn't exist yet. Confirmed every other tab (Catalog, Your room,
  Checklist) is unaffected by any of this.
- **Testing checklist — please work through this yourself once migration 006 is applied** (from
  the brief, unchanged): like/unlike updates the count and persists across reload; save/bookmark
  shows up under "Saved from others" and is distinct from Copy; copying sets `parent_layout_id`
  and "Based on X" renders on the copy; hall/room-type filters actually filter, including with zero
  layouts tagged yet (shouldn't crash or show a broken empty state — the "match this filter" vs.
  "no public layouts yet" empty-state copy already branches on whether a filter is active); view/
  copy/like counts don't error for a signed-out visitor; the new Browse landing tab works both
  signed in and signed out.

## Public profiles + follow (Tier 2, session B1)

First of the B1–B5 batch (see brief) — each meant to be its own commit, this one specifically:
public profile pages + follow/unfollow. **Needs migration 007 run and tested by you**, same
anon-key limitation as every migration since 006.

- **Not a real route yet**: there's no `react-router-dom` in the app until B4 (shareable links),
  so a profile "page" is a pseudo-tab — `tab === 'profile'` plus a separate `viewingProfileId`
  state, not a URL. Clicking any layout's byline anywhere (Browse, Saved-from-others, another
  profile's layout grid) opens it; "← Back" returns to whichever tab you came from
  (`profileReturnTab`). Worth knowing if you're wondering why a profile link isn't shareable —
  that's coming in B4, not missing by accident.
- **Byline, not just "Designed by"**: every public-layout row (Browse, Saved-from-others, a
  profile's own layout grid) now shows *some* clickable author line — "Designed by X" in sage for
  flagged designers (unchanged styling), "by X" in muted ink for everyone else. Previously only
  designer layouts had any author line at all; now there's always a path to the person who made
  it. `listPublicLayouts`/`listSavedLayouts`/`getPublicLayoutById` all now also select `user_id`
  and expose it as `authorId`/`authorName`.
- **Profile page shows**: display name, DESIGNER badge if applicable, bio, hall/class year (joined
  with a `·` only when both are set), follower/following/public-layout counts, and a grid of their
  public layouts (same row style as Browse, minus the like/save/copy buttons — those act on a
  specific layout mid-browse, less relevant while reading someone's profile). Works signed out —
  `getPublicProfile()` needs no auth, same as `listPublicLayouts`.
- **Follow button**: hidden entirely on your own profile (`session.user.id === viewingProfileId`)
  rather than shown-disabled — per the brief's either/or, this plus the DB check constraint
  (`follower_id <> followee_id`) covers both the "hide it" and "block it server-side" options at
  once. Optimistic local update on click (`followingIds` Set + the viewed profile's
  `followerCount`), no refetch needed.
- **Editing your own profile**: no dedicated settings tab for three optional fields — instead a
  compact inline editor (bio textarea + hall/class-year inputs + Save) right in the Saved tab,
  above the My Layouts/Saved-from-others toggle, plus a "View my public profile →" link. Seeded
  from `getMyProfile()`'s existing call so it never shows stale-empty fields and silently blanks
  out a real bio on first save (caught this while wiring it up — the drafts state needs to be
  populated on profile *load*, not only when you happen to visit your own profile page first).
- **"Following" feed**: not a separate feed UI — a "Following only" checkbox on Browse (shown only
  when signed in), which fetches your following list once and passes it as an `authorIds` filter
  into the existing `listPublicLayouts()` call, same function Browse already used. Shows a
  specific "you're not following anyone yet" empty state rather than the generic
  "no layouts match this filter" one, since the two situations call for different next actions.
- **Verified live (pre-migration)**: confirmed the byline itself already works today, since it
  only depends on the always-present `user_id` column, not anything migration 007 adds — a real
  layout's Browse row correctly showed a clickable "by a student" byline. Clicking it opened the
  profile pseudo-tab and showed a clean "This profile could not be found" message (not a raw
  Postgrest schema error) since `profiles.bio` doesn't exist in the live DB yet — confirms the
  null-on-error handling in `getPublicProfile()` degrades the way it's supposed to. "← Back"
  correctly returned to Browse. Follow/unfollow, the editor, and the Following filter all need
  migration 007 live before they're testable — please work through those yourself.

## Tags, filters, featured collections (Tier 2, session B2)

Second of the B1–B5 batch. **Needs migration 008 run and tested by you.**

- **Tags at publish time**: the same publish-prompt modal from Tier 1 (hall/room type) now also
  has a tag section — `SUGGESTED_TAGS` (minimalist/cozy/plant-heavy/gaming/study-focused) render
  as one-click "+ tag" chips, plus a free-text input (Enter or comma adds it) for anything not on
  the list. Tags are lowercased on add so "Cozy" and "cozy" don't end up as two different filter
  values. "Skip & publish" only skips hall/room type — any tags already picked as chips still go
  through, since picking a tag chip is a separate, lighter action than the hall/room-type prompt.
- **Tag filter chips on Browse**: multi-select, not a dropdown (unlike hall/room-type) — clicking
  a chip toggles it, and multiple selected tags AND together (a layout must have *all* selected
  tags, not any), same "narrowing, not replacing" combination rule as the brief asked for with
  hall/room-type. Implemented via Postgres array-contains (`.contains('tags', [...])` in
  supabase-js) rather than fetching everything and filtering client-side.
- **Featured collections**: `featured_collections` + a `featured_collection_layouts` join table
  (with `sort_order`), both read-only from the app's side — no admin UI, no insert/update/delete
  RLS policy for the anon/authenticated roles at all, since curating these is meant to happen by
  hand in Supabase's table editor (an example `insert` pair is commented at the bottom of
  migration 008 to copy-paste from). Renders as a labeled horizontal-scroll strip at the top of
  Browse, one row per collection, above the hall/room-type filters. `listFeaturedCollections()`
  filters out any collection that ends up with zero visible layouts (deleted/gone-private since
  featuring) rather than rendering an empty strip, and the whole section just doesn't render at
  all if no collections exist yet — no broken empty state to worry about.
- **Verified live (pre-migration)**: confirmed Browse degrades to one clear inline error
  ("column layouts.tags does not exist") instead of crashing, with the hall/room-type filters and
  the rest of the page still rendering normally, and confirmed the Featured section correctly
  renders nothing (not a broken empty box) since `listFeaturedCollections()`'s `.catch()` swallows
  the same missing-table error. Catalog and every other tab are unaffected. Tag filtering itself,
  the publish-time tag chips, and actually featuring a collection all need migration 008 live —
  please work through those yourself once it's run.

## Basic moderation + Terms of Service (Tier 2, session B3)

Third of the B1–B5 batch, done before comments (B4) on purpose, per the brief. **Needs migration
009 run.**

- **Reports table only — no dashboard**: `reports` (`reporter_id`, `target_type` — 'layout' /
  'comment' / 'profile' — `target_id`, `reason`, `status`, defaulting to `'open'`). No
  update/delete policy for the client at all; status changes happen by hand in the table editor,
  which runs as the project owner and isn't subject to RLS — exactly the "no admin UI needed at
  this scale" shape the brief asked for. `select` is scoped to a user's own filed reports (not
  broad), so the client could show "your reports" someday without another migration, but nothing
  reads it back today.
- **🚩 report button**: on every `PublicLayoutRow` (Browse, Saved-from-others) and on the profile
  page (next to Follow). Comments don't exist yet (that's B4), so comment reporting isn't wired up
  — the DB already supports `target_type = 'comment'` for when it lands.
- **Report modal**: three reasons (Spam / Inappropriate / Other), with a free-text box that only
  appears for "Other" — `reportReason`/`reportDetails` get combined into one string
  (`"Other: <text>"`) before hitting `submitReport()`, so the `reports.reason` column stays a
  single plain string rather than needing two.
- **Terms of Service**: `public/terms.html` — a standalone static page (not part of the React
  app/bundle, just a plain file Vite serves as-is), linked from the Saved tab for both signed-in
  and signed-out visitors. **This is a placeholder, not real legal language** — the page says so
  explicitly at the top. Get an actual lawyer (or Colgate's relevant office, if this stays tied to
  Colgate) to review it before this app has real public users at any scale; treat this as "the
  page exists and covers the right topics" (ownership of published content, prohibited content,
  reporting/removal, no warranty), not "legally sound."
- **A real interaction worth knowing about**: adding `tags` to `listPublicLayouts()`'s select list
  in B2 means that until migration 008 is run, the *entire* Browse list fails to load (not just
  tag-related UI) — confirmed live, see the callout in "Setting up Supabase" above. The report
  button itself is fine (its code is correct and unaffected), but you can't reach it from Browse
  until there's a row to click, since no rows render pre-008.
- **Verified live**: `terms.html` renders correctly and is reachable from both the signed-in and
  signed-out Saved tab states. Confirmed (per the note above) that Browse currently shows zero
  rows pre-migration, so the report button on a layout row couldn't be exercised end-to-end in
  this environment — the wiring is the same proven pattern as the like/save/copy buttons already
  working on that same row component, so I'm confident in it, but you should click through it
  yourself once 008 and 009 are both live.

## Comments + shareable links + Open Graph previews (Tier 2, session B4)

Fourth of the B1–B5 batch — the one the brief itself flagged as the most technically involved.
**Needs migration 010 run**; the OG preview piece needs your live Vercel deployment to test at all.

- **Comments**: `comments` table (`layout_id`, `user_id`, `body`) — anyone can read comments on a
  public layout (or their own private one), any authenticated user can post, and either the
  comment's author *or the layout's owner* can delete it (the brief called owner-delete "a
  reasonable moderation lever to include," so both are allowed rather than picking one). Lives
  entirely on the new `/layouts/:id` page — no comment UI on the Browse tab's list rows.
- **`react-router-dom` added** (new dependency, v7) — the first real client-side routing in the
  app. `main.jsx` now wraps everything in a `<BrowserRouter>` with two routes: `/layouts/:id` →
  the new `LayoutDetailPage`, and `*` (everything else) → the existing tab-based `App`. Nothing
  about the existing tab system changed; it's still one big component with `tab` state, just now
  itself living behind a catch-all route instead of being the only thing rendered.
- **`/layouts/:id` — `LayoutDetailPage.jsx`**: a standalone page, deliberately *not* a live 3D
  view — the brief explicitly offered "3D view or a static render" as an either/or, and spinning
  up a second `RoomEngine` instance just for this page would mean duplicating a good chunk of
  `App.jsx`'s Three.js setup for a page whose whole point is to load fast and preview well when
  shared. Shows the layout's thumbnail, name, byline, hall/room type, "Based on X" lineage (links
  to the parent's own `/layouts/:id` page — remixes can chain), like/save/copy/report actions, and
  the comment thread. An "Open in 3D editor" button hands the already-fetched layout data to the
  main app via router state (`navigate('/', { state: { loadLayout } })`) rather than making it
  re-fetch — `App.jsx` picks that up in a new mount effect and clears the state immediately after
  consuming it so navigating back later doesn't reload the same layout again.
- **A real gap, worth knowing about**: profile pages are still the pseudo-tab from session B1, not
  a route — so the author byline on `/layouts/:id` isn't a clickable link to their profile the way
  it is inside the main app. Noted directly in a code comment where it'd naturally go
  (`LayoutDetailPage.jsx`); promoting profiles to a real `/u/:id` route would be a clean follow-up
  now that routing exists, but wasn't in this session's scope.
- **🔗 copy-link button**: on every `PublicLayoutRow` (Browse, Saved-from-others) and on your own
  published layouts in "My Layouts" (only shown once a layout is actually public — no point
  sharing a link to something only you can see). Builds `<origin>/layouts/:id` and puts it on the
  clipboard; falls back to just displaying the raw URL in the notice if the Clipboard API is
  unavailable, rather than failing silently.
- **Open Graph previews — the genuinely unverified part**: `api/layout-preview.js` is a Vercel
  serverless function that serves a minimal HTML page with `og:title`/`og:image`/`og:description`
  tags pulled from Supabase (name + `thumbnail_url`, already existed from the layout-thumbnails
  feature) — this is necessary because client-side React can't produce correct link previews on
  its own; platforms like iMessage/Discord/Slack don't execute JavaScript when unfurling a link,
  so the tags have to already be in the initial HTML response. `vercel.json` routes `/layouts/:id`
  through this function *only* for requests whose user-agent matches a known bot pattern
  (facebookexternalhit, Twitterbot, Discordbot, Slackbot, LinkedInBot, WhatsApp, TelegramBot,
  Googlebot, bingbot, Applebot); every real visitor's request still goes straight to the normal
  React SPA via the same file's SPA-fallback rewrite. No new env vars — the function reads the
  same `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` already set in your Vercel project (env vars
  aren't restricted to build-time just because of the `VITE_` prefix; that prefix only controls
  what Vite embeds into the *client* bundle).
  - **I could not test any of this** — it needs an actual Vercel deployment, and this dev
    environment doesn't have one. Per the brief's own testing note, the only real way to verify it
    is pasting a live `/layouts/:id` link into iMessage/Discord/Slack after deploying. Please do
    that once this is live.
  - **Specifically flagged as an open question, not something to debug blindly if it doesn't
    work**: Apple's iMessage link-preview fetcher doesn't publish a stable, documented
    user-agent string the way Facebook/Twitter/Discord's crawlers do. It's included in the bot
    pattern as a best guess, but if iMessage previews specifically don't render while everything
    else does, that's the most likely reason — worth its own small follow-up investigation rather
    than assuming the whole approach is broken.
  - Per the brief's own escape hatch ("if it's taking significantly longer... ship comments and
    the route first, treat OG previews as its own follow-up") — comments and the route are solid
    and verified locally; OG previews are written and should be reviewed as their own small
    follow-up once you can actually test them live.
- **Verified live (what's testable without Vercel)**: navigating directly to a `/layouts/:id` URL
  in the dev server resolves correctly via `react-router-dom` (not a 404, not falling through to
  the main app) — tested with a nonexistent id and confirmed the clean "This layout isn't
  available" state renders (same behavior a since-privated layout would get, since
  `getPublicLayoutById()` already treated both cases identically from session B1). The "←" back
  link correctly returns to the main app, and the main app itself still loads and behaves
  correctly after adding the router — the "Browse" landing tab, existing tabs, and the
  now-expected pre-migration `layouts.tags` error all rendered exactly as before. Comments
  themselves (post/delete/RLS), the copy-link button's actual clipboard behavior, and — critically
  — the OG previews all need you to test once 010 is run and this is deployed.
  - **Follow-up check**: also loaded a real public layout's `/layouts/:id` URL (not just a
    nonexistent one) — name, byline, dims, like count, and action buttons all rendered with real
    data from your database; the Comments section correctly showed a clean inline "Could not find
    the table 'public.comments'" message rather than crashing, confirming migration 010's
    not-yet-run state degrades the same way every other migration-gated feature in this app does.

## Badges + leaderboard (Tier 3, session B5)

The lower-effort half of B5 — the brief explicitly separated this from roommate collaboration
(see the note at the end of this section for why that part isn't built). **No migration needed
at all**, and unlike everything since session B1, this was **fully verified live against your
real Supabase data**, not just checked for graceful degradation.

- **No new table, on purpose**: the brief called a dedicated awarding/scoring system overkill at
  this scale ("even just computed client-side from existing counts... no need to build fancy") —
  both badges and the leaderboard are pure functions over data that already exists
  (`likes_count`/`copy_count` on every public layout, live since migration 006). Nothing is
  cached or stored; refresh the page and it recomputes from current numbers. `getLeaderboard()`
  and `computeBadges()` in `storage.js` have the honest caveat in a comment: this fetches *every*
  public layout to aggregate client-side, which is fine at today's scale and would need to move
  server-side (an RPC or materialized view) if the public-layout count ever gets large.
- **Badges**: shown on the profile page next to the DESIGNER badge — "🎨 5+ layouts published",
  "🏆 10+ copies", "❤️ 25+ likes", each only appearing once a profile's public layouts cross that
  threshold (summed across all of them, not per-layout).
- **Leaderboard**: a new pseudo-tab (`tab === 'leaderboard'`, same non-URL pattern as the profile
  page from B1), reachable via a "🏆 Leaderboard" link in Browse's header. Two lists: top 10
  designers by total likes+copies across their public layouts (clicking a row opens their
  profile), and top 10 layouts updated in the last 30 days by likes+copies (clicking one loads it
  straight into the room, reusing the same `getPublicLayoutById`-then-load helper as "Based on X"
  links — renamed from `handleViewParent` to `handleViewLayoutById` in `App.jsx` since it's no
  longer only about parents).
- **Verified live — genuinely, not just "doesn't crash"**: this is the first B1–B5 feature that
  needed zero new migrations, so it was testable end-to-end against your real project as-is.
  Confirmed the leaderboard correctly aggregated your one real public layout and its real like
  count ("A student, 1 layout, ♥ 1, Copied 0×"), and confirmed clicking a "top layouts this month"
  row actually loaded that real 14-item layout into the 3D editor correctly (furniture, prices,
  and the "Your room (14)" count all matched). Badges themselves need a profile crossing one of
  the thresholds to see rendered, which none currently do — the logic was reviewed rather than
  visually confirmed for that part specifically.

**Roommate collaboration (the other half of B5) was not built.** The brief was explicit that this
one needs a decision made first, not code written speculatively: a simple async "shared edit
access via a `layout_collaborators` join table, last-write-wins" version, versus a real-time
Google-Docs-style version with live cursors (meaningfully more complex, needs Supabase Realtime
and conflict handling). The brief's own recommendation — start with the simple version if you
build this at all — still stands, but it's a genuine product decision (is this valuable enough to
build now, given B1–B5 is already a large batch?) rather than something to default into. Worth its
own short conversation before a session is spent on it either way.

## Item dimensions, stacking, and checklist/suggestions fixes

Three smaller, unrelated additions requested together — a dimensions button, stacking furniture
on furniture (a TV on a table), and two checklist/catalog bugs (categories stuck at just Bedding,
and "goes well with" suggestions only existing on a handful of items).

- **Dimensions button**: selection panel already showed dims as a small inline line, easy to miss
  — now there's also a dedicated "📏 Dimensions" button next to Rotate that toggles a detail box
  showing width/depth/height in both the standard furniture-listing format (`3'5"`) and the raw
  decimal feet already used elsewhere in the app (`formatFeetInches()` in `App.jsx`).
- **Stacking one item on another** (e.g. a TV on a desk): deliberately button-driven, not
  drag-based — the engine's drag model is floor-plane only (no vertical axis), so dragging
  something up onto a surface would need real collision/surface detection to work reliably, and
  the brief explicitly offered a button as an acceptable alternative. Select the item, click "⬆ Put
  on top of…", then click any other placed item in the 3D view to complete it (or click the same
  button again, or click empty floor, to cancel). Single-level only — an item that already has
  something stacked on it can't itself become a target, so there's no risk of a physically dubious
  three-item tower.
  - **Dragging a stacked item keeps it stacked**: it slides around on top of whatever it's
    resting on, clamped to *that item's* footprint (`_clampStackedItem()`) instead of the room's
    walls — same idea as the existing room-boundary clamp, just measured against the base instead
    of the walls, so a TV can slide around on a desk but not off the edge of it. Rotating a stacked
    item re-clamps against the base the same way. If the item on top is bigger than its base along
    some axis (a big TV on a small side table), there's no room to slide on that axis — it's pinned
    to the base's center there instead of allowing an out-of-bounds position. The **only** way an
    item comes back down to the floor is the explicit "Place on floor" button (`unstackItem()`) —
    an earlier version of this feature dropped it automatically the moment you dragged it, which
    Tyler caught and asked to change; this replaced that behavior entirely, it isn't a toggle.
  - **Picking up the *base* still drops whatever's resting on it**: start dragging the desk out
    from under the TV, and the TV falls back to the floor in place rather than floating in mid-air
    or (unsupported) following the desk in real time. Deleting a base item does the same for
    anything that was stacked on it. This part is unchanged from the first pass — only dragging the
    *topper itself* changed.
  - **Room resize re-syncs stacked items to their base**: resizing the room clamps un-stacked
    items to the new walls first, then re-centers every stacked item on its base's (possibly just
    moved) position and re-clamps it to the base's footprint — otherwise a resize could clamp a
    desk one way and leave its TV clamped independently to the old room bounds, drifting the two
    apart.
  - **Persists through save/load**: `getState()` records stacking by *array position*
    (`stackedOnIndex`), not the live uid — uids are freshly re-minted every time a layout loads
    (several models load in parallel and don't necessarily finish in the order they started), so a
    saved raw uid wouldn't mean anything on the next load. `loadState()` waits for every item in
    the layout to finish loading, then resolves each `stackedOnIndex` back into a real stacking
    relationship via `stackItemOn()`.
  - **Verified live**: added a desk and a TV, called the actual `stackItemOn()`/`unstackItem()`
    engine methods directly and confirmed the math (TV's Y lands exactly at the desk's height, X/Z
    match the desk's position). Verified the *real* UI path end to end with actual clicks (not
    synthetic events — raw `dispatchEvent` `PointerEvent`s can't satisfy this browser's
    `setPointerCapture`, confirmed via a `NotFoundError` in the console when I first tried that
    route, so I used genuine click-tool clicks/drags at camera-projected screen coordinates
    instead): select TV → "Put on top of…" → click the desk → TV visually lands on the desk,
    selection panel switches to "⬇ Place on floor". After Tyler's correction, re-verified by
    dragging the stacked TV toward and past the desk's edge with a real click-drag — it stopped
    exactly at the computed boundary (`deskX + (deskWidth-tvWidth)/2`, confirmed against the actual
    numbers, not just visually) and stayed elevated/stacked the whole time, then confirmed "Place
    on floor" still drops it correctly afterward. Also re-confirmed picking up the *desk* still
    drops the TV to the floor, and round-tripped a stacked layout through `getState()` →
    `loadState()`, confirming the relationship survives with a freshly re-minted uid.
- **Checklist "only shows Bedding" — the real bug, not a missing feature**: `checklistItems.js`
  already had all 11 categories fully populated; the bug was in `listChecklistItems()` in
  `storage.js`, which only ever seeded `DEFAULT_CHECKLIST_ITEMS` once, on an account's very first
  visit with zero rows. An account that first opened the Checklist tab back when that file only
  covered a couple of categories got stuck there forever — later categories added to the file
  never reached an existing account. Fixed to backfill per-category instead of once-globally: on
  every load, any category the user has *literally zero rows in* gets seeded from
  `DEFAULT_CHECKLIST_ITEMS`; a category they've already seen (even if they deleted every item down
  to zero) is left alone, so this can never resurrect something someone deliberately removed —
  only fills in categories that genuinely never existed for that account. **Needs you to test
  signed in** — same auth limitation as every other checklist-touching change in this app (email
  confirmation + no inbox access here).
- **"Goes well with" suggestions on every item**: previously only ~8 of 44 catalog items had
  `relatedIds` (a deliberately sparse starter set from when the feature first shipped). Every
  catalog item — purchasable and Colgate-provided alike — now has 1-5 suggestions, picked for what
  plausibly pairs with it in a real room (a dresser suggests a mirror, a mini fridge suggests a
  microwave and a snack cart, a rug suggests a throw pillow, etc.), referencing either another
  placeable catalog item or a `chk:`-prefixed checklist item. Wrote a quick Node script against the
  actual `resolveRelatedItems()` function to confirm every single `relatedIds` entry across the
  whole catalog resolves to something real — zero broken references, zero items still empty.

## Furniture sourcing (catalog variety pass)

Independent of Community tier 1 above — a separate brief, done as a separate pass, worth keeping
as its own commit. Most catalog categories had exactly one item; this adds real style variety
without touching the Colgate-specific items (Tyler's modeling those himself in Blender).

- **14 new models, 0 new licensing risk**: every addition comes from the same Kenney Furniture
  Kit zip already in use — it turned out to have enough unused, clearly-CC0 pieces to cover every
  category the brief asked about, so there was no need to pull from Quaternius, Poly Pizza,
  Sketchfab, or itch.io this round (all four were on the list to check; see
  `public/models/LICENSES.md` for the full note on why they weren't needed). Re-downloaded the kit
  fresh from kenney.nl rather than trusting a stale local copy, to confirm current license terms
  before using anything.
- **New catalog ids, old ones untouched**: every addition is a new `id` in `catalog.js`
  (`bed-full`, `chair-cushion`, etc.) alongside the original, never a replacement — same pattern
  already established by `stackable-chest`/`colgate-chest` earlier. 30 → 44 placeable items.
- **What got added, by category**:
  - Beds: `bed-full` (Full-Size Bed Frame, `bedDouble.glb`) and `bed-bunk` (Bunk Bed Frame,
    `bedBunk.glb`) alongside the existing Twin XL. Full-size doesn't fit a standard dorm frame,
    but this app isn't exclusively for dorm students — off-campus/apartment users are real users
    too (same reasoning as the "not every user is a Colgate student" note elsewhere).
  - Desks: `desk-corner` (Corner Desk, `deskCorner.glb`) alongside the existing Compact Desk. Only
    one clean second option turned up in the kit — left at 2 rather than forcing a 3rd.
  - Desk chairs: `chair-cushion` (Cushioned Desk Chair) and `chair-rounded` (Rounded-Back Chair)
    alongside the existing office-style Desk Chair — 3 total, genuinely different silhouettes
    (wheeled office chair vs. two wood chair styles), verified by rendering and eyeballing all
    three side-by-side before committing to them, not just picked by filename.
  - Storage/dresser: `dresser` (`kitchenCabinetDrawer.glb`) — one clean new option. A second
    candidate (`cabinetBedDrawerTable.glb`) turned out to be nearly identical in shape/scale to
    the existing Nightstand once rendered, so it was dropped rather than added just to hit a
    count.
  - Bookshelves: `shelf-closed` and `shelf-wide` alongside the existing open Bookshelf — 3 total,
    spanning open vs. closed-cabinet styles and two different width/height proportions.
  - Lighting: `lamp-square` (a second floor lamp style) and `desk-lamp` (the first non-floor
    lighting option) alongside the existing round Floor Lamp — 3 total, and genuinely covers both
    sub-types the brief called out (floor + desk lamps).
  - Seating: brand new subcategory (`Furniture & Organization → Seating`) — `accent-chair` and
    `loveseat`. There was no non-desk seating option before this beyond the bean bag under Optional
    Luxury Items.
  - Rugs: `rug-round` and `rug-square` alongside the existing rectangular Area Rug — 3 total. A
    third candidate (`rugRounded.glb`, a soft-corner rectangle) was dropped for looking too close
    to the existing rectangle once rendered — square and round are the genuinely distinct options.
- **Retailer links unchanged**: every new item reuses the existing generic
  `retailerLink(retailer, name)` search-link helper, same as everything else in the catalog — no
  attempt to point at a specific real product page, per the brief.
- **Prices are estimates**, picked to be roughly in line with the existing catalog's price points
  for similar real furniture, not sourced from an actual listing — same standard the rest of the
  catalog was already held to.
- **Verified live**: rebuilt clean, generated real thumbnails for all 14 new models through the
  existing `generateAllThumbnails()` pipeline (same one used for the original 23 — see "Real
  catalog thumbnails" below), confirmed all 12 new Furniture & Organization items and both new
  rugs show up in the right subcategories with correct counts, added five of the new items
  (Loveseat, Corner Desk, Dresser, Cushioned Desk Chair, Bunk Bed Frame) into a room and confirmed
  real 3D models load (not placeholder boxes) and the shopping list totals them correctly ($1,015
  for that combination, checked against the sum of their individual prices).
- **Spot-check this yourself**: `public/models/LICENSES.md` has the full per-file table — worth a
  quick manual look given this pulls in outside content, even with the verification step already
  built into how it was sourced.

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
