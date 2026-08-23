-- Migration: custom item entry. Run this once in the Supabase SQL editor, on top of 001-014.
-- Safe to re-run.
--
-- Lets a signed-in user add an item the curated catalog doesn't have — their own name, product
-- URL, and (optionally) real dimensions, paired with an existing catalog item as a purely visual
-- stand-in (its 3D model represents the custom item in the room; nothing else about the stand-in
-- carries over). width/depth/height are nullable on purpose — leaving a dimension blank means
-- "same as the stand-in," not zero (see catalog.js's buildCustomCatalogItem, which falls back to
-- the stand-in's own dims per axis for whichever ones are null).
-- These are personal to the user who created them (RLS below is owner-only for regular users),
-- not global catalog additions — see catalog.js's registerCustomCatalogItem for how the app
-- resolves one alongside the real CATALOG at runtime. Doubles as market research: every
-- submission is a real signal of what's missing from the curated catalog, which is what the
-- broad-SELECT policy at the bottom is for.

create table if not exists custom_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  product_url text,
  price numeric not null default 0,
  width numeric,
  depth numeric,
  height numeric,
  stand_in_catalog_id text not null,
  created_at timestamptz not null default now()
);

alter table custom_items enable row level security;
create index if not exists custom_items_user_id_idx on custom_items (user_id);

drop policy if exists "Users can view their own custom items" on custom_items;
create policy "Users can view their own custom items"
  on custom_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own custom items" on custom_items;
create policy "Users can create their own custom items"
  on custom_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own custom items" on custom_items;
create policy "Users can delete their own custom items"
  on custom_items for delete
  using (auth.uid() = user_id);

-- Tyler-only visibility across every user's submissions, for the simple admin review table (see
-- AdminCustomItemsPage.jsx) — this app has no is_admin flag or role system anywhere yet (see
-- 009_moderation.sql's own note on why reports are reviewed straight from Supabase's table editor
-- instead), so this is gated directly on his account email rather than a new role concept just
-- for one page. Harmless to leave in place; only matches a JWT for that exact email.
drop policy if exists "Tyler can view all custom items for review" on custom_items;
create policy "Tyler can view all custom items for review"
  on custom_items for select
  using (auth.jwt() ->> 'email' = 'tylerabain3@gmail.com');
