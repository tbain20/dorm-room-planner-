-- Migration: roommate collaboration — the simple version (shared edit access, no real-time sync,
-- last-write-wins on save, same as the existing single-user save system already works). Run this
-- once in the Supabase SQL editor, on top of 001-012. Safe to re-run.
--
-- Trust model for joining, spelled out since it's a deliberate simplification: a layout's id is
-- the invite token — there's no separate per-invite secret. Anyone signed in who has the link
-- (`/layouts/:id/join`) can add themselves as a collaborator; the app never lets a *stranger* read
-- a private layout's contents first (see the new "Collaborators can view shared layouts" policy
-- below — you have to already be a collaborator, or the owner, to SELECT it), but the join action
-- itself is a blind INSERT keyed only on the id in the URL, same "unguessable UUID = de facto
-- access control" trust level the existing /layouts/:id and /boards/:id shareable-link pages
-- already use for read access — just extended here to grant write access once someone
-- deliberately opens the link and joins. Reasonable for "share this with your actual roommate,"
-- not meant to withstand a link leaking to someone you don't trust.

create table if not exists layout_collaborators (
  layout_id uuid not null references layouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (layout_id, user_id)
);

alter table layout_collaborators enable row level security;
create index if not exists layout_collaborators_layout_id_idx on layout_collaborators (layout_id);
create index if not exists layout_collaborators_user_id_idx on layout_collaborators (user_id);

-- The owner can see the full roster (who else can edit their layout); so can any collaborator
-- already on it (the self-referential exists() is intentional — "am I also a row in this same
-- layout's collaborator list" — a standard "see your own group's roster" RLS pattern).
drop policy if exists "Users can view collaborators on layouts they own or share" on layout_collaborators;
create policy "Users can view collaborators on layouts they own or share"
  on layout_collaborators for select
  using (
    exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
    or exists (select 1 from layout_collaborators lc2 where lc2.layout_id = layout_collaborators.layout_id and lc2.user_id = auth.uid())
  );

-- Self-join only — joining is something you do to yourself by opening an invite link, not
-- something the owner does to a specific person (the app has no way to insert "some other user's
-- id" here since a generic link isn't tied to anyone in particular until it's opened).
drop policy if exists "Users can join a layout as a collaborator" on layout_collaborators;
create policy "Users can join a layout as a collaborator"
  on layout_collaborators for insert
  with check (user_id = auth.uid());

-- The owner can remove a collaborator (kick); a collaborator can remove their own row (leave).
drop policy if exists "Owners can remove collaborators, collaborators can leave" on layout_collaborators;
create policy "Owners can remove collaborators, collaborators can leave"
  on layout_collaborators for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from layouts l where l.id = layout_id and l.user_id = auth.uid())
  );

-- Extends layouts' own SELECT so a collaborator can actually load the shared layout into the
-- editor — previously only the owner (or anyone, if it happened to be public) could read it.
drop policy if exists "Collaborators can view shared layouts" on layouts;
create policy "Collaborators can view shared layouts"
  on layouts for select
  using (exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid()));

-- Extends layouts' own UPDATE the same way, both the visibility check (using) and the
-- post-update validity check (with check) — a collaborator's save doesn't touch user_id (see
-- storage.js's saveSharedLayout), but with check has to allow the resulting row through too, not
-- just let the request past the initial visibility gate.
drop policy if exists "Users can update their own layouts" on layouts;
create policy "Owners and collaborators can update a layout"
  on layouts for update
  using (
    auth.uid() = user_id
    or exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from layout_collaborators lc where lc.layout_id = id and lc.user_id = auth.uid())
  );

-- Belt-and-suspenders on top of the policy above: forces user_id back to whatever it already was
-- on every update, no matter what a client sends. Without this, the permissive "with check" above
-- (needed so a collaborator's own update passes, since it can't just check auth.uid() = user_id)
-- would technically let a collaborator's request reassign ownership by setting user_id to
-- someone else's id — this closes that off unconditionally, the same way the likes_count trigger
-- (migration 006) enforces an invariant plain RLS can't express on its own.
create or replace function public.preserve_layout_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists on_layout_update_preserve_owner on layouts;
create trigger on_layout_update_preserve_owner
  before update on layouts
  for each row execute function public.preserve_layout_owner();
