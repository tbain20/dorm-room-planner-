-- Migration: tags, style filters, featured collections (Tier 2, session B2). Run this once in the
-- Supabase SQL editor, on top of 001-007. Safe to re-run.

-- 1. Tags — a plain text array, nullable. No fixed taxonomy at the DB level (the app suggests a
-- handful of common ones at publish time, but anyone can type a custom one) — same "free text
-- over a rigid enum" call as hall/room_type/class_year in earlier migrations.
alter table layouts add column if not exists tags text[];

-- GIN index for the `@>` (contains) queries the tag filter uses — a plain btree index doesn't
-- help array-containment lookups.
drop index if exists layouts_tags_idx;
create index layouts_tags_idx on layouts using gin (tags);

-- 2. Featured collections — curated directly in Supabase's table editor/SQL editor by Tyler, not
-- through the app. Deliberately no insert/update/delete RLS policy for the anon/authenticated
-- roles below: the dashboard's table editor runs as the project owner and isn't subject to these
-- policies, so "publicly readable, nobody can write via the API" is exactly the intended shape —
-- no admin UI needed at this scale (see brief).
create table if not exists featured_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table featured_collections enable row level security;

drop policy if exists "Featured collections are viewable by anyone" on featured_collections;
create policy "Featured collections are viewable by anyone"
  on featured_collections for select
  using (true);

-- Join table: which layouts are in which collection, and in what order. Composite primary key
-- since a layout only ever needs one row per collection — no separate id column to manage.
create table if not exists featured_collection_layouts (
  collection_id uuid not null references featured_collections(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, layout_id)
);

alter table featured_collection_layouts enable row level security;
create index if not exists featured_collection_layouts_collection_id_idx on featured_collection_layouts (collection_id);

drop policy if exists "Featured collection layouts are viewable by anyone" on featured_collection_layouts;
create policy "Featured collection layouts are viewable by anyone"
  on featured_collection_layouts for select
  using (true);

-- Example of how to actually feature something (run manually, not part of this migration):
--   insert into featured_collections (title, description) values ('Cozy budget rooms', 'Under $500, still feels like home');
--   insert into featured_collection_layouts (collection_id, layout_id, sort_order)
--     values ('<collection-id-from-above>', '<layout-id-from-the-layouts-table>', 0);
