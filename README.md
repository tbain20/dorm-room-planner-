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
- Real glTF model loading (auto-scaled to fit catalog dims) — wired up, only one demo item uses
  it right now (`demo3d` in `catalog.js`). Swap in real model URLs as you source them.
- Save/load layouts — currently per-browser via `localStorage`. Fine for testing, not for real
  users (no accounts, doesn't sync across devices).
- Shopping list with retailer links — currently plain search-result links. Affiliate tagging
  hook is in `catalog.js` (`AFFILIATE_TAGS`), just needs your real IDs once approved.

## Next steps

**1. Backend + accounts**
Right now nothing is tied to a user. You'll want:
- Auth (Clerk or Supabase Auth are both fast to wire into a Vite app)
- A `layouts` table (user_id, room dims, items JSON, is_public, designer_id) — replace
  `storage.js` with real API calls; nothing else in the app needs to change, since `App.jsx`
  only talks to `saveLayout` / `listLayouts` / `deleteLayout`
- This unlocks cross-device saving, and is also the foundation for the designer marketplace
  (a "layout" with `is_public: true` is a template other users can browse and copy)

**2. Grow the real 3D catalog**
This is the long pole. For each item you want a real model for:
- Best case: the retailer/manufacturer already has a glTF/GLB (IKEA has some; Wayfair has 3D/AR
  for parts of their catalog via partner APIs)
- Otherwise: model it yourself in Blender (doesn't need to be photoreal — just recognizable and
  correctly scaled) or hire someone on a freelance platform to do a batch of simple furniture
  models
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

**5. Mobile**
This is a plain web app so it already works on phones, but dragging/orbiting a 3D scene with
touch is fiddly — worth a pass on touch-specific interaction tuning (pinch-to-zoom, larger hit
targets) before you lean on mobile traffic.
