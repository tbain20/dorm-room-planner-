-- Fixes "infinite recursion detected in policy for relation layouts" caused by migration 013.
-- Run this once in the Supabase SQL editor, on top of 001-013. Safe to re-run.
--
-- Root cause: 013 gave layouts a SELECT/UPDATE policy that queries layout_collaborators, and gave
-- layout_collaborators a SELECT policy that queries layouts right back. Postgres evaluates a
-- table's RLS policies every time that table is touched, including inside another policy's
-- subquery — so layouts' policy triggers layout_collaborators' policy, which triggers layouts'
-- policy again, forever. That loop is what Postgres reports as "infinite recursion detected in
-- policy for relation layouts".
--
-- Fix: move the two cross-table checks into SECURITY DEFINER functions. A SECURITY DEFINER
-- function runs as its owner (the migration-running role, which owns these tables), and a table's
-- owner is exempt from that table's own RLS by default (Postgres only enforces RLS on owners when
-- a table has FORCE ROW LEVEL SECURITY set, which these tables don't) — so a query inside one of
-- these functions reads the table directly instead of re-triggering its RLS policy. That breaks
-- the cycle: layouts' policy calls is_layout_collaborator(), which reads layout_collaborators
-- directly (no RLS re-entry), and layout_collaborators' policy calls owns_layout(), which reads
-- layouts directly (no RLS re-entry either).

create or replace function public.owns_layout(p_layout_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from layouts l where l.id = p_layout_id and l.user_id = auth.uid());
$$;

create or replace function public.is_layout_collaborator(p_layout_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from layout_collaborators lc where lc.layout_id = p_layout_id and lc.user_id = auth.uid());
$$;

grant execute on function public.owns_layout(uuid) to authenticated, anon;
grant execute on function public.is_layout_collaborator(uuid) to authenticated, anon;

drop policy if exists "Users can view collaborators on layouts they own or share" on layout_collaborators;
create policy "Users can view collaborators on layouts they own or share"
  on layout_collaborators for select
  using (
    public.owns_layout(layout_id)
    or public.is_layout_collaborator(layout_id)
  );

drop policy if exists "Owners can remove collaborators, collaborators can leave" on layout_collaborators;
create policy "Owners can remove collaborators, collaborators can leave"
  on layout_collaborators for delete
  using (
    user_id = auth.uid()
    or public.owns_layout(layout_id)
  );

drop policy if exists "Collaborators can view shared layouts" on layouts;
create policy "Collaborators can view shared layouts"
  on layouts for select
  using (public.is_layout_collaborator(id));

drop policy if exists "Owners and collaborators can update a layout" on layouts;
create policy "Owners and collaborators can update a layout"
  on layouts for update
  using (
    auth.uid() = user_id
    or public.is_layout_collaborator(id)
  )
  with check (
    auth.uid() = user_id
    or public.is_layout_collaborator(id)
  );
