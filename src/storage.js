// Cloud persistence for saved room layouts, backed by Supabase (see supabase/schema.sql for a
// fresh install, or supabase/migrations/ for incremental changes on an existing project). Most
// functions here require a signed-in user — callers should gate access on useAuth()'s session.
// listPublicLayouts() is the one exception: it's read-only and works for signed-out visitors too.
import { supabase } from './supabaseClient.js'

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured — see .env.example')
  }
  return supabase
}

async function requireUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Sign in to manage layouts')
  return data.user
}

export async function saveLayout(name, data) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client
    .from('layouts')
    .upsert(
      { user_id: user.id, name, room: data.room, items: data.items, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,name' }
    )
  if (error) throw error
}

export async function listLayouts() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client
    .from('layouts')
    .select('name, room, items, is_public, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    name: row.name,
    room: row.room,
    items: row.items,
    isPublic: row.is_public,
    savedAt: new Date(row.updated_at).getTime(),
  }))
}

export async function deleteLayout(name) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layouts').delete().eq('user_id', user.id).eq('name', name)
  if (error) throw error
}

// Flips a layout's visibility. Publishing as a designer tags the layout with your designer_id so
// the browse page can show "Designed by [you]"; un-publishing or publishing as a non-designer
// clears it.
export async function setLayoutPublic(name, isPublic) {
  const client = requireClient()
  const user = await requireUser(client)
  const { data: profile } = await client.from('profiles').select('is_designer').eq('id', user.id).single()
  const patch = { is_public: isPublic, designer_id: isPublic && profile?.is_designer ? user.id : null }
  const { error } = await client.from('layouts').update(patch).eq('user_id', user.id).eq('name', name)
  if (error) throw error
}

// Read-only, no auth required — RLS allows anyone to see rows where is_public = true.
export async function listPublicLayouts() {
  const client = requireClient()
  const { data, error } = await client
    .from('layouts')
    .select('id, name, room, items, updated_at, profiles(display_name, is_designer)')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    room: row.room,
    items: row.items,
    savedAt: new Date(row.updated_at).getTime(),
    designerName: row.profiles?.is_designer ? row.profiles.display_name : null,
  }))
}

// Duplicates a browsed layout into the current user's own layouts (new row, new owner,
// always private by default — copying shouldn't auto-publish). Retries with a numbered suffix
// if the name is already taken.
export async function copyLayout(layout) {
  const client = requireClient()
  const user = await requireUser(client)
  let name = `${layout.name} (copy)`
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { error } = await client.from('layouts').insert({
      user_id: user.id,
      name,
      room: layout.room,
      items: layout.items,
      is_public: false,
    })
    if (!error) return name
    if (error.code !== '23505') throw error // not a "name already taken" conflict — give up
    name = `${layout.name} (copy ${attempt + 1})`
  }
  throw new Error('Could not find an available name for the copy — try renaming your existing layouts')
}

export async function getMyProfile() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client.from('profiles').select('display_name, is_designer').eq('id', user.id).single()
  if (error) throw error
  return data
}
