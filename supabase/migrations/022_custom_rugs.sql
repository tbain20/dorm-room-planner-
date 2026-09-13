-- Migration: custom rug import. Run this once in the Supabase SQL editor, on top of 001-021.
-- Safe to re-run.
--
-- Lets a signed-in user upload their own rug design (pick a shape, a size, an image) and place it
-- in the room as a flat textured floor slab — see catalog.js's buildCustomRugCatalogItem for how a
-- row here becomes a real, placeable catalog-shaped object, and roomEngine.js's _buildRugMesh for
-- how it renders. Same "personal, registered into the live catalog lookup" pattern as
-- custom_posters (migration 016) — this is that same shape, copied for a floor rug instead of a
-- wall panel. Public bucket, same reasoning as 004_layout_thumbnails.sql/016_custom_posters.sql:
-- the image is only ever shown to others once the layout containing it is made public.

insert into storage.buckets (id, name, public)
values ('custom-rugs', 'custom-rugs', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view custom rugs" on storage.objects;
create policy "Anyone can view custom rugs"
  on storage.objects for select
  using (bucket_id = 'custom-rugs');

drop policy if exists "Users can upload their own custom rugs" on storage.objects;
create policy "Users can upload their own custom rugs"
  on storage.objects for insert
  with check (bucket_id = 'custom-rugs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own custom rugs" on storage.objects;
create policy "Users can delete their own custom rugs"
  on storage.objects for delete
  using (bucket_id = 'custom-rugs' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists custom_rugs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text not null,
  product_url text,
  shape text not null default 'rectangle',
  width_in numeric not null,
  height_in numeric not null,
  created_at timestamptz not null default now()
);

alter table custom_rugs enable row level security;
create index if not exists custom_rugs_user_id_idx on custom_rugs (user_id);

drop policy if exists "Users can view their own custom rugs" on custom_rugs;
create policy "Users can view their own custom rugs"
  on custom_rugs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own custom rugs" on custom_rugs;
create policy "Users can create their own custom rugs"
  on custom_rugs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own custom rugs" on custom_rugs;
create policy "Users can delete their own custom rugs"
  on custom_rugs for delete
  using (auth.uid() = user_id);
