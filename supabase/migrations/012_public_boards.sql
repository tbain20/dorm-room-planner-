-- Migration: public board pages. Run this once in the Supabase SQL editor, on top of 001-011.
-- Safe to re-run.
--
-- Extends the private boards feature (011_boards.sql) with an is_public flag, same shape as
-- layouts.is_public — a board owner can flip it on to get a shareable /boards/:id page listing
-- the board's contents, e.g. a curated "My Move-In Setup" or "Best Small Singles" collection.
--
-- Note on what a visitor actually sees: board_layouts embeds the real `layouts` row for each
-- entry, and that embed is still subject to the layouts table's own RLS (is_public = true OR you
-- own it) — completely unchanged by this migration. So making a board public does NOT expose any
-- private layout inside it to other people; a visitor to a public board only ever sees the
-- entries that are themselves public layouts. Same graceful drop-the-row-you-can't-see pattern
-- listSavedLayouts()/listMyBoardsWithLayouts() already rely on for a deleted/since-privated
-- layout, reused here rather than invented fresh.

alter table boards add column if not exists is_public boolean not null default false;

-- Second SELECT policy, OR'd with the existing owner-only one (006_community_tier1.sql's
-- comment on layouts' own two-policy split explains the same pattern) — you can always see your
-- own boards, and anyone (including signed-out visitors) can see boards that have been made
-- public.
drop policy if exists "Anyone can view public boards" on boards;
create policy "Anyone can view public boards"
  on boards for select
  using (is_public = true);

-- board_layouts' own SELECT policy (011_boards.sql) only ever let the board's owner read its
-- rows — a public board's contents need to be readable by anyone too, so BoardDetailPage.jsx's
-- embedded board_layouts(layouts(...)) query actually returns rows for a signed-out visitor.
drop policy if exists "Users can view layouts in their own boards" on board_layouts;
create policy "Users can view layouts in boards they own or that are public"
  on board_layouts for select
  using (exists (select 1 from boards b where b.id = board_id and (b.user_id = auth.uid() or b.is_public = true)));
