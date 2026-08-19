-- Migration: comments (Tier 2, session B4). Run this once in the Supabase SQL editor, on top of
-- 001-009. Safe to re-run.

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references layouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;
create index if not exists comments_layout_id_idx on comments (layout_id);

-- Readable by anyone on a public layout, or by the layout's own owner (covers a private layout's
-- owner previewing their own comments — doesn't come up much today since only public layouts are
-- commentable, but the policy shouldn't silently fail if that ever changes).
drop policy if exists "Comments on public layouts are viewable by anyone" on comments;
create policy "Comments on public layouts are viewable by anyone"
  on comments for select
  using (
    exists (select 1 from layouts l where l.id = layout_id and (l.is_public = true or l.user_id = auth.uid()))
  );

-- Only on layouts that are actually public right now — matches the brief ("anyone can read
-- comments on public layouts, authenticated users can insert their own").
drop policy if exists "Authenticated users can comment on public layouts" on comments;
create policy "Authenticated users can comment on public layouts"
  on comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from layouts l where l.id = layout_id and l.is_public = true)
  );

-- Either the commenter or the layout's owner can delete a comment — the brief calls owner-delete
-- "a reasonable moderation lever to include," so both are allowed rather than picking just one.
drop policy if exists "Users can delete their own comments or layout owners can delete any" on comments;
create policy "Users can delete their own comments or layout owners can delete any"
  on comments for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
  );
