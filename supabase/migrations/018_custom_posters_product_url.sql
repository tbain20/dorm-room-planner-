-- Migration: adds custom_posters.product_url. Run this once in the Supabase SQL editor, on top of
-- 001-017. Safe to re-run.
--
-- 016_custom_posters.sql originally had no product_url column; that file has since been edited so
-- a *fresh* install gets it directly, but if you already ran 016 before this one existed, your
-- live table is missing it. Lets a user paste a link to where they found the poster/artwork so it
-- shows up on the shopping list like any other item's buy link — see PosterUploadForm.jsx and
-- catalog.js's buildCustomPosterCatalogItem.

alter table custom_posters add column if not exists product_url text;
