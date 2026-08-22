-- Migration: boards / collections (Pinterest-style gallery redesign, Part B). Run this once in
-- the Supabase SQL editor, on top of 001-010. Safe to re-run.
--
-- Lets a user organize the layouts they've saved into named boards ("Fall move-in ideas," "Small
-- single inspo") instead of one flat saved list. Deliberately does NOT touch layout_saves
-- (migration 006) — that plain bookmark table keeps meaning exactly what it always has ("have I
-- saved this?", the heart/star state used all over the app). Boards are a separate organizational
-- layer on top: adding a layout to a board also inserts a layout_saves row for it (see
-- storage.js's addLayoutToBoard), so every boarded layout is still a superset the existing
-- "saved from others" flat query already knows how to fetch. Removing a layout from a board does
-- NOT remove the bookmark — it might still be in another board, or the user may just want to keep
-- it saved unsorted.
--
-- v1 scope, per the brief: boards are private-only, no public board pages yet — just an
-- organizational tool for the user's own saved layouts. RLS below only ever lets a user touch
-- their own boards.

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table boards enable row level security;
create index if not exists boards_user_id_idx on boards (user_id);

drop policy if exists "Users can view their own boards" on boards;
create policy "Users can view their own boards"
  on boards for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own boards" on boards;
create policy "Users can create their own boards"
  on boards for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can rename their own boards" on boards;
create policy "Users can rename their own boards"
  on boards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own boards" on boards;
create policy "Users can delete their own boards"
  on boards for delete
  using (auth.uid() = user_id);

-- Join table: which layouts sit in which of the user's boards. No user_id column of its own —
-- ownership flows through the boards row it points at, same pattern comments (010) uses for
-- "does this belong to something I own."
create table if not exists board_layouts (
  board_id uuid not null references boards(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (board_id, layout_id)
);

alter table board_layouts enable row level security;
create index if not exists board_layouts_layout_id_idx on board_layouts (layout_id);

drop policy if exists "Users can view layouts in their own boards" on board_layouts;
create policy "Users can view layouts in their own boards"
  on board_layouts for select
  using (exists (select 1 from boards b where b.id = board_id and b.user_id = auth.uid()));

drop policy if exists "Users can add layouts to their own boards" on board_layouts;
create policy "Users can add layouts to their own boards"
  on board_layouts for insert
  with check (exists (select 1 from boards b where b.id = board_id and b.user_id = auth.uid()));

drop policy if exists "Users can remove layouts from their own boards" on board_layouts;
create policy "Users can remove layouts from their own boards"
  on board_layouts for delete
  using (exists (select 1 from boards b where b.id = board_id and b.user_id = auth.uid()));
