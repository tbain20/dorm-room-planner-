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
  App.jsx        — UI + React state, wires the sidebar/panels to the 3D engine
  roomEngine.js  — all Three.js logic (scene, camera, items, drag/rotate), framework-agnostic
  catalog.js     — furniture items: dims, price, retailer, optional modelUrl for real 3D models
  storage.js     — save/load layouts (currently localStorage — see "Next steps")
  index.css      — styling
```

## Where things stand

- Room shell + dimension input ✅
- Add/drag/rotate furniture, clamped to room bounds ✅
- Real glTF models for 9 of 12 catalog items (bed, desk, chair, fridge, wardrobe, bookshelf,
  nightstand, lamp, rug), sourced from Kenney's CC0 Furniture Kit — see `public/models/`. The
  other 3 (mattress, storage cubes, mirror) had no close match in that kit and still use the box
  placeholder rather than force a wrong-looking stand-in.
- Save/load layouts — now backed by Supabase (auth + a `layouts` table), gated behind sign-in on
  the "Saved" tab. **You still need to create the actual Supabase project** — see "Setting up
  Supabase" below. Until you do, the app runs fine but the Saved tab shows a "not configured"
  message instead of localStorage (the old on-device save is gone).
- Shopping list with retailer links — currently plain search-result links. Affiliate tagging
  hook is in `catalog.js` (`AFFILIATE_TAGS`), just needs your real IDs once approved.
- Touch: pinch-to-zoom, `touch-action: none` on the canvas, and a stacked mobile layout below
  760px are in place.

## Setting up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard: **SQL Editor → New query**, paste in the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `layouts` table
   with row-level security so each user can only see their own rows.
3. In **Project Settings → API**, copy the **Project URL** and **anon public** key.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   `.env` is gitignored — never commit real keys.
5. Restart `npm run dev`. The "Saved" tab will now show sign-up/sign-in instead of the
   "not configured" message.
6. By default Supabase requires email confirmation on sign-up. For local testing you can turn
   this off under **Authentication → Providers → Email → Confirm email**, or just click the
   confirmation link Supabase emails you.
7. When you deploy to Vercel, add the same two `VITE_SUPABASE_*` variables in the Vercel project's
   Environment Variables settings — `.env` only applies locally.

## Next steps

**1. Backend + accounts — code done, needs your Supabase project**
`storage.js` now talks to Supabase instead of `localStorage` (`saveLayout` / `listLayouts` /
`deleteLayout`, same call sites in `App.jsx` as before, now async). The `layouts` table already
has `is_public` and `designer_id` columns reserved for the marketplace phase below — follow
"Setting up Supabase" above to make it live.

**2. Grow the real 3D catalog — 9/12 stubbed in with generic CC0 models, still the long pole**
The models in `public/models/` are generic low-poly stand-ins (Kenney's kit), not the actual
IKEA/Amazon/Target/Best Buy products in the catalog — good enough to stop the room looking like
a pile of boxes, not good enough to ship as "this is the exact item you're buying." For each item:
- Best case: the retailer/manufacturer already has a glTF/GLB (IKEA has some; Wayfair has 3D/AR
  for parts of their catalog via partner APIs)
- Otherwise: model it yourself in Blender (doesn't need to be photoreal — just recognizable and
  correctly scaled) or hire someone on a freelance platform to do a batch of simple furniture
  models
- Still no good CC0 match for mattress, storage cubes, or a full-length mirror — those plus any
  retailer-accurate replacements are the remaining gap
- Keep using the box placeholder for anything without a model yet — it degrades gracefully
  already (see `_loadItemMesh` in `roomEngine.js`)

**3. Affiliate programs**
Apply to Amazon Associates, and Impact (covers Target + Best Buy) and Awin (covers IKEA) once
you have a live site to point them at. Drop your tracking IDs into `AFFILIATE_TAGS` in
`catalog.js`.

**4. Designer marketplace**
Once accounts + public layouts exist: a "browse templates" page (list/filter public layouts),
a "copy this layout" action that duplicates it into the current user's own layouts, and a
custom-order flow (a request form + Stripe payment + a way for a designer to open and edit a
specific user's room). Commission split logic lives wherever you calculate the shopping-list
total — attribute a layout's `designer_id` and take your cut off the top before affiliate
payout tracking.

**5. Mobile — done for now**
Pinch-to-zoom, `touch-action: none` on the canvas (so touch-drag doesn't fight the browser's
scroll/pinch gestures), a stacked layout under 760px, and larger tap targets for buttons are in.
Still untested on a real device — worth a pass with actual hardware before leaning on mobile
traffic.
