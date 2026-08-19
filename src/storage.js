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
    .select(
      'id, name, room, items, features, is_public, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, parent_layout_id, parent:layouts!parent_layout_id(name, profiles(display_name))'
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error

  // Remix counts ("X people remixed this") — one extra query for however many of this user's own
  // layouts have been copied by someone else, tallied client-side rather than N per-row queries.
  // Best-effort: a failure here shouldn't block the whole list from loading.
  let remixCounts = {}
  const ids = data.map((row) => row.id)
  if (ids.length > 0) {
    const { data: remixRows } = await client.from('layouts').select('parent_layout_id').in('parent_layout_id', ids)
    remixCounts = (remixRows || []).reduce((acc, r) => {
      acc[r.parent_layout_id] = (acc[r.parent_layout_id] || 0) + 1
      return acc
    }, {})
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    room: row.room,
    items: row.items,
    features: row.features || [],
    isPublic: row.is_public,
    thumbnailUrl: row.thumbnail_url,
    savedAt: new Date(row.updated_at).getTime(),
    likesCount: row.likes_count,
    viewCount: row.view_count,
    copyCount: row.copy_count,
    hall: row.hall,
    roomType: row.room_type,
    remixCount: remixCounts[row.id] || 0,
    parentLayoutId: row.parent_layout_id,
    parentLayoutName: row.parent?.name || null,
    parentAuthorName: row.parent?.profiles?.display_name || null,
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
// clears it. hall/roomType are optional and only ever written when publishing (passing them while
// un-publishing would be pointless — the UI only prompts for them at publish time) — if a caller
// unpublishes without passing them, the previously-set values are left alone rather than wiped,
// so re-publishing later doesn't lose them.
export async function setLayoutPublic(name, isPublic, { hall, roomType } = {}) {
  const client = requireClient()
  const user = await requireUser(client)
  const { data: profile } = await client.from('profiles').select('is_designer').eq('id', user.id).single()
  const patch = { is_public: isPublic, designer_id: isPublic && profile?.is_designer ? user.id : null }
  if (isPublic) {
    if (hall) patch.hall = hall
    if (roomType) patch.room_type = roomType
  }
  const { error } = await client.from('layouts').update(patch).eq('user_id', user.id).eq('name', name)
  if (error) throw error
}

// Read-only, no auth required — RLS allows anyone to see rows where is_public = true. `hall` and
// `roomType` are optional exact-match filters (values come from listDistinctHalls() below —
// there's no fixed hall list, so filtering is always against whatever's actually in the data).
export async function listPublicLayouts({ hall, roomType } = {}) {
  const client = requireClient()
  let query = client
    .from('layouts')
    .select(
      'id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, parent_layout_id, profiles(display_name, is_designer), parent:layouts!parent_layout_id(id, name, profiles(display_name))'
    )
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
  if (hall) query = query.eq('hall', hall)
  if (roomType) query = query.eq('room_type', roomType)
  const { data, error } = await query
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
    likesCount: row.likes_count,
    viewCount: row.view_count,
    copyCount: row.copy_count,
    hall: row.hall,
    roomType: row.room_type,
    parentLayoutId: row.parent_layout_id,
    // Null if the original was deleted, or (rare) went private since this copy was made — RLS on
    // the embedded relation still applies, so a no-longer-visible parent just quietly disappears
    // rather than erroring.
    parentLayoutName: row.parent?.name || null,
    parentAuthorName: row.parent?.profiles?.display_name || null,
  }))
}

// Fetches one public layout by id — used by the "Based on X" link so clicking it can load the
// original into the room, not just show its name. Returns null (not a throw) if the layout is
// gone or no longer public, since this is only ever a "nice if it still works" navigation.
export async function getPublicLayoutById(id) {
  const client = requireClient()
  const { data, error } = await client
    .from('layouts')
    .select('id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, parent_layout_id, profiles(display_name, is_designer)')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    name: data.name,
    room: data.room,
    items: data.items,
    features: data.features || [],
    thumbnailUrl: data.thumbnail_url,
    savedAt: new Date(data.updated_at).getTime(),
    designerName: data.profiles?.is_designer ? data.profiles.display_name : null,
    likesCount: data.likes_count,
    viewCount: data.view_count,
    copyCount: data.copy_count,
    hall: data.hall,
    roomType: data.room_type,
    parentLayoutId: data.parent_layout_id,
  }
}

// Every distinct non-empty `hall` value among public layouts, for populating the Browse filter
// dropdown — hall is free text, not a fixed enum, so the filter's options come from whatever
// students have actually typed in rather than a hardcoded hall list.
export async function listDistinctHalls() {
  const client = requireClient()
  const { data, error } = await client.from('layouts').select('hall').eq('is_public', true).not('hall', 'is', null)
  if (error) throw error
  return [...new Set(data.map((r) => r.hall).filter(Boolean))].sort()
}

// Best-effort — a view "counts" the moment someone loads a layout into the 3D canvas (Browse's
// "View" button, or opening one of your own). No de-duplication per viewer for v1 (see brief).
// Never throws: a signed-out visitor browsing public layouts should never see an error over a
// vanity counter, and the RPC itself is a no-op if the layout isn't visible to the caller.
export async function incrementLayoutViewCount(layoutId) {
  const client = requireClient()
  await client.rpc('increment_layout_view_count', { p_layout_id: layoutId }).catch(() => {})
}

// Duplicates a browsed layout into the current user's own layouts (new row, new owner,
// always private by default — copying shouldn't auto-publish). Retries with a numbered suffix
// if the name is already taken. Reuses the original thumbnail image rather than re-rendering one
// — the room/items are identical to what was copied, so the picture is still accurate, and this
// avoids needing the 3D view to be showing this exact layout at copy time. Tags the new row with
// parent_layout_id so "Based on X" can render on the copy, and bumps the original's copy_count.
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
      parent_layout_id: layout.id || null,
    })
    if (!error) {
      if (layout.id) await client.rpc('increment_layout_copy_count', { p_layout_id: layout.id }).catch(() => {})
      return name
    }
    if (error.code !== '23505') throw error // not a "name already taken" conflict — give up
    name = `${layout.name} (copy ${attempt + 1})`
  }
  throw new Error('Could not find an available name for the copy — try renaming your existing layouts')
}

// Likes — plain insert/delete against layout_likes; the layouts.likes_count denormalized column
// updates itself via a database trigger (see migrations/006_community_tier1.sql), not here.
export async function likeLayout(layoutId) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layout_likes').insert({ user_id: user.id, layout_id: layoutId })
  if (error && error.code !== '23505') throw error // already-liked races are a harmless no-op
}

export async function unlikeLayout(layoutId) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layout_likes').delete().eq('user_id', user.id).eq('layout_id', layoutId)
  if (error) throw error
}

// The signed-in user's own like rows, as a plain array of layout ids — used to render which
// hearts start filled in when the Browse list loads.
export async function listMyLikedLayoutIds() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client.from('layout_likes').select('layout_id').eq('user_id', user.id)
  if (error) throw error
  return data.map((r) => r.layout_id)
}

// Saves/bookmarks — distinct from Copy: this doesn't duplicate the layout into your own editable
// set, it just marks someone else's layout as saved-for-later. Shows up under the Saved tab's
// "Saved from others" view (listSavedLayouts below), separate from "My Layouts".
export async function saveLayoutBookmark(layoutId) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layout_saves').insert({ user_id: user.id, layout_id: layoutId })
  if (error && error.code !== '23505') throw error
}

export async function unsaveLayoutBookmark(layoutId) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layout_saves').delete().eq('user_id', user.id).eq('layout_id', layoutId)
  if (error) throw error
}

export async function listMySavedLayoutIds() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client.from('layout_saves').select('layout_id').eq('user_id', user.id)
  if (error) throw error
  return data.map((r) => r.layout_id)
}

// Full layout data for everything the current user has bookmarked, newest-save-first. The
// embedded `layouts(...)` relation is still subject to the layouts table's own RLS, so a bookmark
// pointing at a layout that's since been deleted or gone private just comes back with a null
// `layouts` and is filtered out here rather than surfacing a broken row.
export async function listSavedLayouts() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client
    .from('layout_saves')
    .select(
      'created_at, layouts(id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, profiles(display_name, is_designer))'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
    .filter((row) => row.layouts)
    .map((row) => ({
      id: row.layouts.id,
      name: row.layouts.name,
      room: row.layouts.room,
      items: row.layouts.items,
      features: row.layouts.features || [],
      thumbnailUrl: row.layouts.thumbnail_url,
      savedAt: new Date(row.layouts.updated_at).getTime(),
      designerName: row.layouts.profiles?.is_designer ? row.layouts.profiles.display_name : null,
      likesCount: row.layouts.likes_count,
      viewCount: row.layouts.view_count,
      copyCount: row.layouts.copy_count,
      hall: row.layouts.hall,
      roomType: row.layouts.room_type,
      bookmarkedAt: new Date(row.created_at).getTime(),
    }))
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
