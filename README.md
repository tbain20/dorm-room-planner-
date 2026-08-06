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
- Real glTF models for 9 of 12 catalog items (bed, desk, chair, fridge, wardrobe, bookshelf,
  nightstand, lamp, rug), sourced from Kenney's CC0 Furniture Kit — see `public/models/`. The
  other 3 (mattress, storage cubes, mirror) still use the box placeholder — see "3D catalog" below
  for why.
- Save/load layouts — backed by Supabase (auth + a `layouts` table), gated behind sign-in on the
  "Saved" tab. Your Supabase project is live (`.env` is filled in) — **but you need to run one more
  migration** for the features below. See "Setting up Supabase."
- Browse public layouts, copy one into your own account, and a lightweight designer flag +
  "Designed by" attribution — see "Marketplace, level 1" below.
- Shopping list with retailer links — currently plain search-result links. Affiliate tagging
  hook is in `catalog.js` (`AFFILIATE_TAGS`), just needs your real IDs once approved.
- Touch: pinch-to-zoom, `touch-action: none` on the canvas, and a stacked mobile layout below
  760px are in place.

## Setting up Supabase

Your project already exists and `.env` is filled in — the `layouts` table works. To turn on
browsing/copying public layouts and designer attribution, run the one additional migration:

1. Supabase dashboard → **SQL Editor → New query**, paste in the contents of
   [`supabase/migrations/002_marketplace.sql`](supabase/migrations/002_marketplace.sql), and run
   it. This adds a public-read policy for layouts where `is_public = true`, a `profiles` table
   (display name + `is_designer` flag, auto-created for every signup), and repoints
   `layouts.designer_id` at `profiles` so "Designed by" can be looked up in one query. Safe to
   re-run if you're not sure whether it already applied.
2. That's it — no new env vars needed for this part.

(`supabase/schema.sql` is the complete from-scratch version, for reference or for setting up a
second environment. Since your project already has the original `layouts` table, use the
migration above rather than re-running schema.sql.)

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

**1. Grow the real 3D catalog — 9/12 stubbed in with generic CC0 models, still the long pole**
The models in `public/models/` are generic low-poly stand-ins (Kenney's kit), not the actual
IKEA/Amazon/Target/Best Buy products in the catalog — good enough to stop the room looking like
a pile of boxes, not good enough to ship as "this is the exact item you're buying." For each item:
- Best case: the retailer/manufacturer already has a glTF/GLB (IKEA has some; Wayfair has 3D/AR
  for parts of their catalog via partner APIs)
- Otherwise: model it yourself in Blender (doesn't need to be photoreal — just recognizable and
  correctly scaled) or hire someone on a freelance platform to do a batch of simple furniture
  models

**Mattress / storage cubes / mirror status:** checked Kenney's other asset kits (nothing
furniture-related) and searched Poly Haven / Poly Pizza for standalone matches — nothing turned
up with clearly-verified CC0 licensing and a clean glTF download, and grabbing an unvetted model
off a random itch.io page felt like the wrong tradeoff for three minor items. Current state:
- **Mattress**: still a box, and honestly close to fine as-is — a mattress is fundamentally a
  rounded rectangular box, so this is a low-priority fix.
- **Storage cubes / mirror**: genuinely need either a proper sourced model or ~15 minutes each in
  Blender (simple cube grid; flat panel + frame) — left as boxes for now, isolated from everything
  else so pick this up whenever convenient.

**2. Affiliate programs**
Apply to Amazon Associates, and Impact (covers Target + Best Buy) and Awin (covers IKEA) once
you have a live site to point them at. Drop your tracking IDs into `AFFILIATE_TAGS` in
`catalog.js`.

**3. Mobile — done for now**
Pinch-to-zoom, `touch-action: none` on the canvas (so touch-drag doesn't fight the browser's
scroll/pinch gestures), a stacked layout under 760px, and larger tap targets for buttons are in.
Still untested on a real device — worth a pass with actual hardware before leaning on mobile
traffic.
