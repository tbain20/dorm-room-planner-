-- Migration: makes custom_items.width/depth/height optional. Run this once in the Supabase SQL
-- editor, on top of 001-016. Safe to re-run.
--
-- 015_custom_items.sql originally created these as NOT NULL; that file has since been edited so a
-- *fresh* install gets nullable columns directly, but if you already ran 015 before this one
-- existed, your live table still has the old NOT NULL constraint — confirmed live: submitting the
-- "Add a custom item" form with any dimension left blank fails with 'null value in column "width"
-- of relation "custom_items" violates not-null constraint' until this runs. Leaving a dimension
-- blank is supposed to mean "same as the stand-in" (see catalog.js's buildCustomCatalogItem),
-- not an error.

alter table custom_items alter column width drop not null;
alter table custom_items alter column depth drop not null;
alter table custom_items alter column height drop not null;
