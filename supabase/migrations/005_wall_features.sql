-- Migration: doors & windows. Run this once in the Supabase SQL editor, on top of 001-004.
-- Safe to re-run.

alter table layouts add column if not exists features jsonb not null default '[]'::jsonb;
