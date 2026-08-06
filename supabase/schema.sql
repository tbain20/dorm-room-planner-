-- Run this in the Supabase SQL editor (Project → SQL Editor → New query) once, after creating
-- your project. is_public / designer_id are unused today but reserved for the designer
-- marketplace described in README.md — a layout with is_public = true becomes a browsable
-- template other users can copy.

create table if not exists layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  room jsonb not null,
  items jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  designer_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table layouts enable row level security;

-- Each user can only read/write their own layouts. Extend with an `is_public = true` OR-clause
-- on the select policy once the marketplace browse page needs to read other users' layouts.
create policy "Users can view their own layouts"
  on layouts for select
  using (auth.uid() = user_id);

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
