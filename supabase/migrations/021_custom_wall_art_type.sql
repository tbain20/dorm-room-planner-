-- Migration: adds custom_posters.art_type. Run this once in the Supabase SQL editor, on top of
-- 001-020. Safe to re-run.
--
-- The "Upload your own poster" flow (migration 016) is now a generalized "Custom Wall Art" flow —
-- Poster/Flag/Tapestry are all upload-only, distinguished by this new column (see catalog.js's
-- WALL_ART_TYPES/buildCustomPosterCatalogItem and PosterUploadForm.jsx's type selector). Existing
-- rows all default to 'poster' since that was the only type before this migration.

alter table custom_posters add column if not exists art_type text not null default 'poster';
