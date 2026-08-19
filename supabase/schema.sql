-- Full schema for a brand-new Supabase project. Run this once in the SQL editor
-- (Project → SQL Editor → New query) right after creating your project.
--
-- If you already ran an earlier version of this file against a live project, don't re-run this
-- one — use the numbered files in supabase/migrations/ instead, which apply just the deltas
-- (public browsing + designer profiles, then the packing checklist) on top of what you already
-- have.

-- Profiles: one row per user, public-readable, holds a display name + the designer flag used by
-- the marketplace. Keyed on auth.users(id) directly — never modify auth.users itself.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_designer boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles are viewable by anyone"
  on profiles for select
  using (true);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Layouts: a saved room. is_public makes it browsable; designer_id (set only when a designer
-- publishes) drives the "Designed by" credit on the browse page; thumbnail_url points at a JPEG
-- snapshot in the layout-thumbnails storage bucket (captured on every save); features holds
-- doors/windows (see roomEngine.js's getState()).
create table if not exists layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  room jsonb not null,
  items jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  designer_id uuid references profiles(id),
  thumbnail_url text,
  features jsonb not null default '[]'::jsonb,
  likes_count integer not null default 0,
  view_count integer not null default 0,
  copy_count integer not null default 0,
  parent_layout_id uuid references layouts(id) on delete set null,
  hall text,
  room_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists layouts_hall_idx on layouts (hall);
create index if not exists layouts_room_type_idx on layouts (room_type);
create index if not exists layouts_parent_layout_id_idx on layouts (parent_layout_id);

alter table layouts enable row level security;

-- Two select policies, OR'd together: you can always see your own layouts, and anyone
-- (including signed-out visitors) can see layouts that have been made public.
create policy "Users can view their own layouts"
  on layouts for select
  using (auth.uid() = user_id);

create policy "Public layouts are viewable by anyone"
  on layouts for select
  using (is_public = true);

create policy "Users can insert their own layouts"
  on layouts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own layouts"
  on layouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own layouts"
  on layouts for delete
  using (auth.uid() = user_id);

-- Storage bucket for layout thumbnails (JPEG snapshots, captured on every save). Public read;
-- write/update/delete scoped to "<user_id>/..." path prefixes.
insert into storage.buckets (id, name, public)
values ('layout-thumbnails', 'layout-thumbnails', true)
on conflict (id) do nothing;

create policy "Anyone can view layout thumbnails"
  on storage.objects for select
  using (bucket_id = 'layout-thumbnails');

create policy "Users can upload their own layout thumbnails"
  on storage.objects for insert
  with check (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own layout thumbnails"
  on storage.objects for update
  using (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own layout thumbnails"
  on storage.objects for delete
  using (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

-- Packing checklist: private to each user (no public/marketplace angle here, unlike layouts).
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  category text not null,
  subcategory text,
  checked boolean not null default false,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

alter table checklist_items enable row level security;

create policy "Users can view their own checklist items"
  on checklist_items for select
  using (auth.uid() = user_id);

create policy "Users can insert their own checklist items"
  on checklist_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own checklist items"
  on checklist_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own checklist items"
  on checklist_items for delete
  using (auth.uid() = user_id);

-- Community tier 1: likes, saves/bookmarks, and the denormalized counters they (and copy/view
-- actions) feed on layouts. See migrations/006_community_tier1.sql for the full narrative on why
-- likes_count/copy_count/view_count are only ever touched via trigger/RPC, never a direct client
-- UPDATE — the short version is that liking/copying/viewing someone else's layout is an action
-- taken by a user who doesn't own that row, which the owner-only layouts UPDATE policy blocks.
create table if not exists layout_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, layout_id)
);

alter table layout_likes enable row level security;
create index if not exists layout_likes_layout_id_idx on layout_likes (layout_id);

create policy "Users can view their own likes"
  on layout_likes for select
  using (auth.uid() = user_id);

create policy "Users can like layouts"
  on layout_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike layouts"
  on layout_likes for delete
  using (auth.uid() = user_id);

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

create trigger on_layout_like_change
  after insert or delete on layout_likes
  for each row execute function public.handle_layout_like_change();

create table if not exists layout_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, layout_id)
);

alter table layout_saves enable row level security;
create index if not exists layout_saves_layout_id_idx on layout_saves (layout_id);

create policy "Users can view their own saves"
  on layout_saves for select
  using (auth.uid() = user_id);

create policy "Users can save layouts"
  on layout_saves for insert
  with check (auth.uid() = user_id);

create policy "Users can unsave layouts"
  on layout_saves for delete
  using (auth.uid() = user_id);

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

grant execute on function public.increment_layout_view_count(uuid) to anon, authenticated;
grant execute on function public.increment_layout_copy_count(uuid) to anon, authenticated;
