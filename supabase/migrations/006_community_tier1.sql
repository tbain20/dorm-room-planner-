-- Migration: community tier 1 (likes, saves/bookmarks, copy attribution, hall/room-type filters).
-- Run this once in the Supabase SQL editor, on top of 001-005. Safe to re-run.

-- 1. Denormalized counters + optional metadata on layouts. Counters start at 0 and are only ever
-- touched via the trigger/RPC functions below (never a direct client UPDATE) — see the notes on
-- each one for why: liking/copying/viewing someone else's layout is an action taken by a user who
-- doesn't own that row, so it can't go through the existing owner-only UPDATE RLS policy.
alter table layouts add column if not exists likes_count integer not null default 0;
alter table layouts add column if not exists view_count integer not null default 0;
alter table layouts add column if not exists copy_count integer not null default 0;
alter table layouts add column if not exists parent_layout_id uuid references layouts(id) on delete set null;
alter table layouts add column if not exists hall text;
alter table layouts add column if not exists room_type text;

drop index if exists layouts_hall_idx;
create index layouts_hall_idx on layouts (hall);
drop index if exists layouts_room_type_idx;
create index layouts_room_type_idx on layouts (room_type);
drop index if exists layouts_parent_layout_id_idx;
create index layouts_parent_layout_id_idx on layouts (parent_layout_id);

-- room_type is "enum-ish" per the brief — free text at the column level (so a bad/old value never
-- blocks a read) but the app only ever writes one of these three. A check constraint would reject
-- anything else outright; skipped on purpose so this stays additive/non-destructive.

-- 2. Likes. One row per (user, layout) — the unique constraint is also what makes "toggle" safe to
-- implement as a plain insert-or-delete from the client without a race-prone read-then-write.
create table if not exists layout_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, layout_id)
);

alter table layout_likes enable row level security;

drop index if exists layout_likes_layout_id_idx;
create index layout_likes_layout_id_idx on layout_likes (layout_id);

-- Deliberately narrow: you can only see/insert/delete your own like rows. This is enough for the
-- client to render "have I liked this?" and toggle it — the public-facing like *count* is the
-- denormalized layouts.likes_count column, not a count query against this table, so there's no
-- need for a broader read policy here.
drop policy if exists "Users can view their own likes" on layout_likes;
create policy "Users can view their own likes"
  on layout_likes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can like layouts" on layout_likes;
create policy "Users can like layouts"
  on layout_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike layouts" on layout_likes;
create policy "Users can unlike layouts"
  on layout_likes for delete
  using (auth.uid() = user_id);

-- Keeps layouts.likes_count in sync. A trigger (not a client-side update call) because the row
-- being updated belongs to whoever created the layout, not whoever's liking it — the existing
-- "Users can update their own layouts" RLS policy would block a plain client UPDATE from anyone
-- else. SECURITY DEFINER lets this function bypass that, but only ever to nudge one integer
-- column by exactly 1, so it doesn't reopen anything the RLS policy is meant to protect.
create or replace function public.handle_layout_like_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update layouts set likes_count = likes_count + 1 where id = new.layout_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update layouts set likes_count = greatest(likes_count - 1, 0) where id = old.layout_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_layout_like_change on layout_likes;
create trigger on_layout_like_change
  after insert or delete on layout_likes
  for each row execute function public.handle_layout_like_change();

-- 3. Saves/bookmarks — same shape as likes, but deliberately a separate table rather than a flag
-- reused from likes: saving-for-later and liking are different actions (you might like a layout
-- you'd never actually use, or save one you're lukewarm on), and keeping them separate means
-- either can be added to/removed from independently in the UI.
create table if not exists layout_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, layout_id)
);

alter table layout_saves enable row level security;

drop index if exists layout_saves_layout_id_idx;
create index layout_saves_layout_id_idx on layout_saves (layout_id);

drop policy if exists "Users can view their own saves" on layout_saves;
create policy "Users can view their own saves"
  on layout_saves for select
  using (auth.uid() = user_id);

drop policy if exists "Users can save layouts" on layout_saves;
create policy "Users can save layouts"
  on layout_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unsave layouts" on layout_saves;
create policy "Users can unsave layouts"
  on layout_saves for delete
  using (auth.uid() = user_id);

-- 4. view_count / copy_count: bumped via RPC rather than a trigger, since there's no dedicated
-- "view" or "copy" row/table to hang a trigger off of — a view is just someone loading a layout
-- into the 3D canvas, and copy_count increments the *original* layout's counter as a side effect
-- of inserting a new row elsewhere. SECURITY DEFINER for the same reason as the likes trigger
-- above (the caller usually isn't the row's owner); both functions only touch layouts that are
-- public or already owned by the caller, and only ever move one counter by exactly 1, so this
-- doesn't grant any broader write access than that.
create or replace function public.increment_layout_view_count(p_layout_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update layouts
  set view_count = view_count + 1
  where id = p_layout_id
    and (is_public = true or user_id = auth.uid());
end;
$$;

create or replace function public.increment_layout_copy_count(p_layout_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update layouts
  set copy_count = copy_count + 1
  where id = p_layout_id
    and (is_public = true or user_id = auth.uid());
end;
$$;

-- Signed-out visitors can browse and view public layouts, so view-count needs to work for the
-- anon role too; copy already requires sign-in in the app itself, but there's no harm granting it
-- the same way (the function's own where-clause is what actually gates anything).
grant execute on function public.increment_layout_view_count(uuid) to anon, authenticated;
grant execute on function public.increment_layout_copy_count(uuid) to anon, authenticated;
