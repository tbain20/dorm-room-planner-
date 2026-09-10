-- Migration: profile picture (see ProfilePage.jsx). Run this once in the Supabase SQL editor, on
-- top of 001-019. Safe to re-run.
--
-- avatar_url holds either a preset id (e.g. 'preset-3' — a small fixed set of emoji+color combos
-- the frontend renders, no image file involved) or a real uploaded photo's public URL from the
-- new `avatars` bucket. Same "public bucket, path prefixed by the owner's user id" pattern as
-- 016_custom_posters.sql — a profile picture is meant to be publicly visible on its own, nothing
-- new is exposed by the bucket itself being publicly readable. One file per user (path is just
-- `<user_id>.jpg`, always upserted) rather than one per upload, since there's only ever one
-- current avatar.

alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
