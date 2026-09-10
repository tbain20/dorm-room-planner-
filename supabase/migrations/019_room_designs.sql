-- Migration: general-purpose Room Designer (any house/apartment room, not just Colgate dorms).
-- Run this once in the Supabase SQL editor, on top of 001-018. Safe to re-run.
--
-- A "design" groups multiple rooms together (unlike `layouts`, which is one row per single dorm
-- room) so a user can build out a whole house/apartment and switch between its rooms from the
-- editor's top-right dropdown. Each design_rooms row holds exactly the same {room, items,
-- features} JSON shape RoomEngine.getState()/loadState() already produce/consume for a dorm
-- layout — see src/roomEngine.js. Private-only for v1: no is_public column, no public policies.

create table if not exists designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table designs enable row level security;
create index if not exists designs_user_id_idx on designs (user_id);

drop policy if exists "Users can view their own designs" on designs;
create policy "Users can view their own designs"
  on designs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own designs" on designs;
create policy "Users can create their own designs"
  on designs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own designs" on designs;
create policy "Users can update their own designs"
  on designs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own designs" on designs;
create policy "Users can delete their own designs"
  on designs for delete
  using (auth.uid() = user_id);

create table if not exists design_rooms (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references designs(id) on delete cascade,
  name text not null default 'Room 1',
  sort_order int not null default 0,
  room jsonb not null,
  items jsonb not null default '[]',
  features jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table design_rooms enable row level security;
create index if not exists design_rooms_design_id_idx on design_rooms (design_id);

drop policy if exists "Users can view rooms in their own designs" on design_rooms;
create policy "Users can view rooms in their own designs"
  on design_rooms for select
  using (exists (select 1 from designs d where d.id = design_id and d.user_id = auth.uid()));

drop policy if exists "Users can create rooms in their own designs" on design_rooms;
create policy "Users can create rooms in their own designs"
  on design_rooms for insert
  with check (exists (select 1 from designs d where d.id = design_id and d.user_id = auth.uid()));

drop policy if exists "Users can update rooms in their own designs" on design_rooms;
create policy "Users can update rooms in their own designs"
  on design_rooms for update
  using (exists (select 1 from designs d where d.id = design_id and d.user_id = auth.uid()))
  with check (exists (select 1 from designs d where d.id = design_id and d.user_id = auth.uid()));

drop policy if exists "Users can delete rooms in their own designs" on design_rooms;
create policy "Users can delete rooms in their own designs"
  on design_rooms for delete
  using (exists (select 1 from designs d where d.id = design_id and d.user_id = auth.uid()));
