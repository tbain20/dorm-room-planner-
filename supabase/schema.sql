-- Full schema for a brand-new Supabase project. Run this once in the SQL editor
-- (Project → SQL Editor → New query) right after creating your project.
--
-- If you already ran an earlier version of this file against a live project, don't re-run this
-- one — use supabase/migrations/002_marketplace.sql instead, which applies just the delta
-- (public browsing + designer profiles) on top of what you already have.

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
-- publishes) drives the "Designed by" credit on the browse page.
create table if not exists layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  room jsonb not null,
  items jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  designer_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

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
