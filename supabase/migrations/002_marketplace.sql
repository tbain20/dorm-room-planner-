-- Migration: marketplace foundations (public browsing + designer profiles).
-- Run this once in the Supabase SQL editor, on top of the original supabase/schema.sql.
-- Written to be safe to re-run (drops/recreates policies and triggers by name first).

-- 1. Let anyone read layouts that have been made public. The existing "Users can view their own
-- layouts" policy stays in place — RLS policies of the same command (select) are OR'd together,
-- so a row is visible if it's yours OR it's public. Writes stay owner-only (untouched).
drop policy if exists "Public layouts are viewable by anyone" on layouts;
create policy "Public layouts are viewable by anyone"
  on layouts for select
  using (is_public = true);

-- 2. Profiles: one row per user, public-readable, holds a display name + the designer flag.
-- Keyed on auth.users(id) directly (never modify auth.users itself).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_designer boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Profiles are viewable by anyone" on profiles;
create policy "Profiles are viewable by anyone"
  on profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Auto-create a profile row whenever someone signs up, defaulting display_name to the part
-- of their email before the @ (fine placeholder until there's a profile-editing UI).
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill profiles for anyone who signed up before this migration ran.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- 5. Point designer_id at profiles instead of auth.users, so PostgREST can embed
-- `profiles(display_name, is_designer)` directly in a layouts query for "Designed by" credit.
-- designer_id is null for every row today, so retargeting the FK doesn't touch any data.
alter table layouts drop constraint if exists layouts_designer_id_fkey;
alter table layouts add constraint layouts_designer_id_fkey
  foreign key (designer_id) references profiles(id);
