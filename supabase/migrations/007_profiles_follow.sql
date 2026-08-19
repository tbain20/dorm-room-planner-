-- Migration: public profiles + follow (Tier 2, session B1). Run this once in the Supabase SQL
-- editor, on top of 001-006. Safe to re-run.

-- 1. Profile fields shown on the new public profile page — all optional/user-entered, never
-- required. class_year is text ("2027", "Class of '27", whatever) rather than a strict int, same
-- "free text over a rigid enum" call as hall/room_type in migration 006.
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists display_hall text;
alter table profiles add column if not exists class_year text;

-- 2. Follows. One row per (follower, followee) — the unique constraint makes "toggle" a plain
-- insert-or-delete, same pattern as layout_likes/layout_saves in migration 006. The check
-- constraint blocks self-follows at the DB level too, not just in the UI (see storage.js's
-- followUser(), which also refuses client-side before the request even goes out).
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table follows enable row level security;
create index if not exists follows_follower_id_idx on follows (follower_id);
create index if not exists follows_followee_id_idx on follows (followee_id);

-- Deliberately wide open on select, unlike layout_likes/layout_saves — following is not a
-- private action in most social products, and a profile page needs to show follower/following
-- counts (and eventually lists) to visitors who aren't signed in at all.
drop policy if exists "Follows are viewable by anyone" on follows;
create policy "Follows are viewable by anyone"
  on follows for select
  using (true);

drop policy if exists "Users can follow others" on follows;
create policy "Users can follow others"
  on follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on follows;
create policy "Users can unfollow"
  on follows for delete
  using (auth.uid() = follower_id);
