-- Migration: layout thumbnails. Run this once in the Supabase SQL editor, on top of 001-003.
-- Safe to re-run.

alter table layouts add column if not exists thumbnail_url text;

-- Public bucket: thumbnails are only ever generated for layouts you save, but the URL is only
-- actually shown to others once you make that layout public (same as the row itself) — nothing
-- new is exposed here that layouts' own RLS wasn't already going to expose.
insert into storage.buckets (id, name, public)
values ('layout-thumbnails', 'layout-thumbnails', true)
on conflict (id) do nothing;

-- Ownership is enforced by path prefix (files are stored as "<user_id>/<layout name>.jpg"), the
-- standard Supabase Storage RLS pattern — more portable across Supabase versions than relying on
-- the objects table's owner column.
drop policy if exists "Anyone can view layout thumbnails" on storage.objects;
create policy "Anyone can view layout thumbnails"
  on storage.objects for select
  using (bucket_id = 'layout-thumbnails');

drop policy if exists "Users can upload their own layout thumbnails" on storage.objects;
create policy "Users can upload their own layout thumbnails"
  on storage.objects for insert
  with check (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own layout thumbnails" on storage.objects;
create policy "Users can update their own layout thumbnails"
  on storage.objects for update
  using (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own layout thumbnails" on storage.objects;
create policy "Users can delete their own layout thumbnails"
  on storage.objects for delete
  using (bucket_id = 'layout-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
