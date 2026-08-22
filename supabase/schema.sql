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
  bio text,
  display_hall text,
  class_year text,
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
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists layouts_hall_idx on layouts (hall);
create index if not exists layouts_room_type_idx on layouts (room_type);
create index if not exists layouts_parent_layout_id_idx on layouts (parent_layout_id);
create index if not exists layouts_tags_idx on layouts using gin (tags);

-- Roommate collaboration — the simple version (shared edit access, no real-time sync). Defined
-- here, before layouts' own RLS policies below, since two of those policies reference this table
-- in a subquery. See migrations/013_roommate_collaboration.sql for the full narrative on the
-- trust model: a layout's id is the invite token, joining is a self-service insert by whoever
-- opens the link (/layouts/:id/join), not something the owner does to a specific person.
create table if not exists layout_collaborators (
  layout_id uuid not null references layouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (layout_id, user_id)
);

alter table layout_collaborators enable row level security;
create index if not exists layout_collaborators_layout_id_idx on layout_collaborators (layout_id);
create index if not exists layout_collaborators_user_id_idx on layout_collaborators (user_id);

create policy "Users can view collaborators on layouts they own or share"
  on layout_collaborators for select
  using (
    exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
    or exists (select 1 from layout_collaborators lc2 where lc2.layout_id = layout_collaborators.layout_id and lc2.user_id = auth.uid())
  );

create policy "Users can join a layout as a collaborator"
  on layout_collaborators for insert
  with check (user_id = auth.uid());

create policy "Owners can remove collaborators, collaborators can leave"
  on layout_collaborators for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
  );

alter table layouts enable row level security;

-- Three select policies, OR'd together: you can always see your own layouts, anyone (including
-- signed-out visitors) can see layouts that have been made public, and a roommate you've invited
-- as a collaborator (see layout_collaborators below) can see a layout that's neither of those.
create policy "Users can view their own layouts"
  on layouts for select
  using (auth.uid() = user_id);

create policy "Public layouts are viewable by anyone"
  on layouts for select
  using (is_public = true);

create policy "Collaborators can view shared layouts"
  on layouts for select
  using (exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid()));

create policy "Users can insert their own layouts"
  on layouts for insert
  with check (auth.uid() = user_id);

-- Same OR as the select policies above — an invited collaborator can save changes exactly like
-- the owner can (see migrations/013_roommate_collaboration.sql for the full narrative, including
-- why user_id itself can never actually change via this path regardless of what "with check"
-- alone would allow — see the preserve_layout_owner trigger further down).
create policy "Owners and collaborators can update a layout"
  on layouts for update
  using (
    auth.uid() = user_id
    or exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid())
  );

create policy "Users can delete their own layouts"
  on layouts for delete
  using (auth.uid() = user_id);

-- Belt-and-suspenders on top of the update policy above: forces user_id back to whatever it
-- already was on every update, no matter what a client sends — closes off a collaborator's
-- update request reassigning ownership, which "with check" alone can't express (it only sees the
-- new row, not old-vs-new). Same kind of invariant-plain-RLS-can't-express trigger as the
-- likes_count one below.
create or replace function public.preserve_layout_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger on_layout_update_preserve_owner
  before update on layouts
  for each row execute function public.preserve_layout_owner();

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

-- Follows (public profiles — see migrations/007_profiles_follow.sql for the full narrative).
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

create policy "Follows are viewable by anyone"
  on follows for select
  using (true);

create policy "Users can follow others"
  on follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on follows for delete
  using (auth.uid() = follower_id);

-- Featured collections (curated by hand in the Supabase dashboard — see
-- migrations/008_tags_featured.sql for the full narrative and an example insert).
create table if not exists featured_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table featured_collections enable row level security;

create policy "Featured collections are viewable by anyone"
  on featured_collections for select
  using (true);

create table if not exists featured_collection_layouts (
  collection_id uuid not null references featured_collections(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, layout_id)
);

alter table featured_collection_layouts enable row level security;
create index if not exists featured_collection_layouts_collection_id_idx on featured_collection_layouts (collection_id);

create policy "Featured collection layouts are viewable by anyone"
  on featured_collection_layouts for select
  using (true);

-- Reports — basic moderation (see migrations/009_moderation.sql). Reviewed by hand in Supabase's
-- table editor; no client-facing read/update beyond a user seeing their own filed reports.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('layout', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
create index if not exists reports_target_idx on reports (target_type, target_id);
create index if not exists reports_status_idx on reports (status);

create policy "Users can view their own reports"
  on reports for select
  using (auth.uid() = reporter_id);

create policy "Users can file reports"
  on reports for insert
  with check (auth.uid() = reporter_id);

-- Comments (see migrations/010_comments.sql for the full narrative).
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references layouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;
create index if not exists comments_layout_id_idx on comments (layout_id);

create policy "Comments on public layouts are viewable by anyone"
  on comments for select
  using (
    exists (select 1 from layouts l where l.id = layout_id and (l.is_public = true or l.user_id = auth.uid()))
  );

create policy "Authenticated users can comment on public layouts"
  on comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from layouts l where l.id = layout_id and l.is_public = true)
  );

create policy "Users can delete their own comments or layout owners can delete any"
  on comments for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
  );

-- Boards / collections (Pinterest-style gallery redesign, Part B — see
-- migrations/011_boards.sql for the full narrative on why this is separate from layout_saves).
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table boards enable row level security;
create index if not exists boards_user_id_idx on boards (user_id);

-- Two select policies, OR'd together, same split layouts' own two policies use: you can always
-- see your own boards, and anyone (including signed-out visitors) can see boards that have been
-- made public (see migrations/012_public_boards.sql for the full narrative).
create policy "Users can view their own boards"
  on boards for select
  using (auth.uid() = user_id);

create policy "Anyone can view public boards"
  on boards for select
  using (is_public = true);

create policy "Users can create their own boards"
  on boards for insert
  with check (auth.uid() = user_id);

create policy "Users can rename their own boards"
  on boards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own boards"
  on boards for delete
  using (auth.uid() = user_id);

create table if not exists board_layouts (
  board_id uuid not null references boards(id) on delete cascade,
  layout_id uuid not null references layouts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (board_id, layout_id)
);

alter table board_layouts enable row level security;
create index if not exists board_layouts_layout_id_idx on board_layouts (layout_id);

create policy "Users can view layouts in boards they own or that are public"
  on board_layouts for select
  using (exists (select 1 from boards b where b.id = board_id and (b.user_id = auth.uid() or b.is_public = true)));

create policy "Users can add layouts to their own boards"
  on board_layouts for insert
  with check (exists (select 1 from boards b where b.id = board_id and b.user_id = auth.uid()));

create policy "Users can remove layouts from their own boards"
  on board_layouts for delete
  using (exists (select 1 from boards b where b.id = board_id and b.user_id = auth.uid()));
