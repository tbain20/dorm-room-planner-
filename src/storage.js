// Cloud persistence for saved room layouts and the packing checklist, backed by Supabase (see
// supabase/schema.sql for a fresh install, or supabase/migrations/ for incremental changes on an
// existing project). Most functions here require a signed-in user — callers should gate access
// on useAuth()'s session. listPublicLayouts() is the one exception: it's read-only and works for
// signed-out visitors too.
import { supabase } from './supabaseClient.js'
import { DEFAULT_CHECKLIST_ITEMS } from './checklistItems.js'

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

// path convention for the layout-thumbnails bucket — user-id-prefixed so the storage RLS
// policies (which check the first path segment against auth.uid()) work, and stable per layout
// name so re-saving overwrites the old image instead of accumulating orphans.
function thumbnailPath(userId, name) {
  return `${userId}/${encodeURIComponent(name)}.jpg`
}

async function uploadThumbnail(client, userId, name, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob()
  const path = thumbnailPath(userId, name)
  const { error } = await client.storage.from('layout-thumbnails').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (error) throw error
  return client.storage.from('layout-thumbnails').getPublicUrl(path).data.publicUrl
}

// data.thumbnailDataUrl (from roomEngine's captureSnapshot()) is optional — if it's missing, or
// the upload fails for some reason, the layout still saves fine, just without a thumbnail. A
// screenshot is a nice-to-have for the Browse tab, not something worth blocking a save over.
export async function saveLayout(name, data) {
  const client = requireClient()
  const user = await requireUser(client)
  const patch = {
    user_id: user.id, name, room: data.room, items: data.items, features: data.features || [],
    updated_at: new Date().toISOString(),
  }
  if (data.thumbnailDataUrl) {
    try {
      patch.thumbnail_url = await uploadThumbnail(client, user.id, name, data.thumbnailDataUrl)
    } catch (err) {
      console.warn('Thumbnail upload failed, saving layout without one:', err.message)
    }
  }
  const { error } = await client.from('layouts').upsert(patch, { onConflict: 'user_id,name' })
  if (error) throw error
}

export async function listLayouts() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client
    .from('layouts')
    .select('name, room, items, features, is_public, thumbnail_url, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    name: row.name,
    room: row.room,
    items: row.items,
    features: row.features || [],
    isPublic: row.is_public,
    thumbnailUrl: row.thumbnail_url,
    savedAt: new Date(row.updated_at).getTime(),
  }))
}

export async function deleteLayout(name) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layouts').delete().eq('user_id', user.id).eq('name', name)
  if (error) throw error
  // Best-effort cleanup — a leftover thumbnail file isn't worth failing the delete over.
  client.storage.from('layout-thumbnails').remove([thumbnailPath(user.id, name)]).catch(() => {})
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
    .select('id, name, room, items, features, thumbnail_url, updated_at, profiles(display_name, is_designer)')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    room: row.room,
    items: row.items,
    features: row.features || [],
    thumbnailUrl: row.thumbnail_url,
    savedAt: new Date(row.updated_at).getTime(),
    designerName: row.profiles?.is_designer ? row.profiles.display_name : null,
  }))
}

// Duplicates a browsed layout into the current user's own layouts (new row, new owner,
// always private by default — copying shouldn't auto-publish). Retries with a numbered suffix
// if the name is already taken. Reuses the original thumbnail image rather than re-rendering one
// — the room/items are identical to what was copied, so the picture is still accurate, and this
// avoids needing the 3D view to be showing this exact layout at copy time.
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
      features: layout.features || [],
      is_public: false,
      thumbnail_url: layout.thumbnailUrl || null,
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

// Returns the signed-in user's packing checklist, seeding it from DEFAULT_CHECKLIST_ITEMS on
// their very first visit (i.e. whenever they have zero rows yet). Later visits just return
// whatever they've got — including any items they've since deleted or added.
export async function listChecklistItems() {
  const client = requireClient()
  const user = await requireUser(client)
  const select = () =>
    client
      .from('checklist_items')
      .select('id, label, category, subcategory, checked, is_custom')
      .eq('user_id', user.id)
      .order('created_at')

  const { data, error } = await select()
  if (error) throw error
  if (data.length > 0) return data

  const seedRows = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
    user_id: user.id,
    label: item.label,
    category: item.category,
    subcategory: item.subcategory,
    checked: false,
    is_custom: false,
  }))
  const { error: seedError } = await client.from('checklist_items').insert(seedRows)
  if (seedError) throw seedError

  const { data: seeded, error: reselectError } = await select()
  if (reselectError) throw reselectError
  return seeded
}

export async function setChecklistItemChecked(id, checked) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('checklist_items').update({ checked }).eq('id', id).eq('user_id', user.id)
  if (error) throw error
}

export async function addChecklistItem(category, subcategory, label) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client
    .from('checklist_items')
    .insert({ user_id: user.id, category, subcategory, label, checked: false, is_custom: true })
  if (error) throw error
}

export async function deleteChecklistItem(id) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('checklist_items').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw error
}
