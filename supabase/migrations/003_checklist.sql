-- Migration: packing checklist. Run this once in the Supabase SQL editor, on top of
-- 001 (schema.sql) and 002 (marketplace.sql). Safe to re-run.

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  category text not null,
  subcategory text,
  checked boolean not null default false,
  -- true for items the user typed in themselves, false for the preloaded default set — purely
  -- informational (both kinds can be checked/deleted the same way), useful if you ever want to
  -- e.g. let someone reset back to just the defaults.
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

alter table checklist_items enable row level security;

drop policy if exists "Users can view their own checklist items" on checklist_items;
create policy "Users can view their own checklist items"
  on checklist_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own checklist items" on checklist_items;
create policy "Users can insert their own checklist items"
  on checklist_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own checklist items" on checklist_items;
create policy "Users can update their own checklist items"
  on checklist_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own checklist items" on checklist_items;
create policy "Users can delete their own checklist items"
  on checklist_items for delete
  using (auth.uid() = user_id);
