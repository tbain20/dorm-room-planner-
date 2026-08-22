-- Migration: poster/artwork import. Run this once in the Supabase SQL editor, on top of 001-015.
-- Safe to re-run.
--
-- Lets a signed-in user upload their own image, pick a standard poster size, and place it in the
-- room as a flat framed panel — see catalog.js's buildCustomPosterCatalogItem for how a row here
-- becomes a real, placeable catalog-shaped object (same "personal, registered into the live
-- catalog lookup" pattern Session 1's custom_items uses). Public bucket, same reasoning as
-- 004_layout_thumbnails.sql: the image is only ever shown to others once the layout containing it
-- is made public — nothing new is exposed by the bucket itself being publicly readable.

insert into storage.buckets (id, name, public)
values ('custom-posters', 'custom-posters', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view custom posters" on storage.objects;
create policy "Anyone can view custom posters"
  on storage.objects for select
  using (bucket_id = 'custom-posters');

drop policy if exists "Users can upload their own custom posters" on storage.objects;
create policy "Users can upload their own custom posters"
  on storage.objects for insert
  with check (bucket_id = 'custom-posters' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own custom posters" on storage.objects;
create policy "Users can delete their own custom posters"
  on storage.objects for delete
  using (bucket_id = 'custom-posters' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists custom_posters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text not null,
  width_in numeric not null,
  height_in numeric not null,
  created_at timestamptz not null default now()
);

alter table custom_posters enable row level security;
create index if not exists custom_posters_user_id_idx on custom_posters (user_id);

drop policy if exists "Users can view their own custom posters" on custom_posters;
create policy "Users can view their own custom posters"
  on custom_posters for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own custom posters" on custom_posters;
create policy "Users can create their own custom posters"
  on custom_posters for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own custom posters" on custom_posters;
create policy "Users can delete their own custom posters"
  on custom_posters for delete
  using (auth.uid() = user_id);
