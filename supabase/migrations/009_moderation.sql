-- Migration: basic moderation — reports (Tier 2, session B3). Run this once in the Supabase SQL
-- editor, on top of 001-008. Safe to re-run.

-- No moderation dashboard yet on purpose (see brief) — reports are reviewed directly in
-- Supabase's table editor until there's enough volume to justify building tooling for it. That's
-- why there's no broad select policy below: the app only ever inserts, never reads reports back
-- in bulk (a user CAN see their own filed reports, for a possible future "my reports" view, but
-- that's it).
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('layout', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
create index if not exists reports_target_idx on reports (target_type, target_id);
create index if not exists reports_status_idx on reports (status);

drop policy if exists "Users can view their own reports" on reports;
create policy "Users can view their own reports"
  on reports for select
  using (auth.uid() = reporter_id);

drop policy if exists "Users can file reports" on reports;
create policy "Users can file reports"
  on reports for insert
  with check (auth.uid() = reporter_id);

-- No update/delete policy for the client — status changes (open → reviewed/actioned/dismissed)
-- happen by hand in the table editor, which runs as the project owner and isn't subject to RLS.
