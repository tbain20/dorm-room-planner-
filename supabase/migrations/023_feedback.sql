-- Migration: site-wide feedback widget (FeedbackWidget.jsx). Run this once in the Supabase SQL
-- editor, on top of everything before it. Safe to re-run.

-- Same "no dashboard, review by hand in the table editor" pattern as reports
-- (009_moderation.sql) — deliberately no select policy below. user_id is nullable since the
-- whole point is letting signed-out visitors send feedback too, not just signed-in users.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  email text,
  page_url text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Open to everyone, including the anon role (signed-out visitors) — user_id is only trusted when
-- it matches the caller's own auth.uid(), same guard reports' insert policy uses for reporter_id,
-- so a signed-in user can't stamp someone else's id on their submission.
drop policy if exists "Anyone can submit feedback" on feedback;
create policy "Anyone can submit feedback"
  on feedback for insert
  with check (user_id is null or user_id = auth.uid());
