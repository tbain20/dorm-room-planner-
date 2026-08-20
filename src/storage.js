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
export async function setLayoutPublic(name, isPublic, { hall, roomType, tags } = {}) {
  const client = requireClient()
  const user = await requireUser(client)
  const { data: profile } = await client.from('profiles').select('is_designer').eq('id', user.id).single()
  const patch = { is_public: isPublic, designer_id: isPublic && profile?.is_designer ? user.id : null }
  if (isPublic) {
    if (hall) patch.hall = hall
    if (roomType) patch.room_type = roomType
    if (tags && tags.length > 0) patch.tags = tags
  }
  const { error } = await client.from('layouts').update(patch).eq('user_id', user.id).eq('name', name)
  if (error) throw error
}

// Read-only, no auth required — RLS allows anyone to see rows where is_public = true. `hall` and
// `roomType` are optional exact-match filters (values come from listDistinctHalls() below —
// there's no fixed hall list, so filtering is always against whatever's actually in the data).
// `authorIds`, if passed, restricts to just those users' layouts — this is what backs Browse's
// "Following only" filter (see App.jsx: fetches listMyFollowingIds() first, then passes the
// result here rather than this function knowing anything about follows itself). `tags`, if
// passed, requires the layout to have ALL of the given tags (AND, not OR — narrowing, same as
// combining it with hall/roomType) via Postgres array-contains (`@>`).
export async function listPublicLayouts({ hall, roomType, authorIds, tags } = {}) {
  const client = requireClient()
  let query = client
    .from('layouts')
    .select(
      'id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, tags, parent_layout_id, user_id, profiles(display_name, is_designer), parent:layouts!parent_layout_id(id, name, profiles(display_name))'
    )
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
  if (hall) query = query.eq('hall', hall)
  if (roomType) query = query.eq('room_type', roomType)
  if (authorIds) query = query.in('user_id', authorIds.length > 0 ? authorIds : ['00000000-0000-0000-0000-000000000000'])
  if (tags && tags.length > 0) query = query.contains('tags', tags)
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
    authorId: row.user_id,
    authorName: row.profiles?.display_name || null,
    designerName: row.profiles?.is_designer ? row.profiles.display_name : null,
    likesCount: row.likes_count,
    viewCount: row.view_count,
    copyCount: row.copy_count,
    hall: row.hall,
    roomType: row.room_type,
    tags: row.tags || [],
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
    .select('id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, parent_layout_id, user_id, profiles(display_name, is_designer)')
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
    authorId: data.user_id,
    authorName: data.profiles?.display_name || null,
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

// A handful of suggested tags shown as one-click chips in the publish prompt — not an enforced
// taxonomy (see migration 008), just a nudge toward consistent wording so the Browse tag filter
// actually clusters layouts together instead of every user inventing their own synonym.
export const SUGGESTED_TAGS = ['minimalist', 'cozy', 'plant-heavy', 'gaming', 'study-focused']

// Every distinct tag among public layouts, flattened/deduped client-side — `tags` is a Postgres
// array column, so there's no single-column `.select('tags')` shortcut for "distinct elements"
// the way listDistinctHalls() has for a plain text column.
export async function listDistinctTags() {
  const client = requireClient()
  const { data, error } = await client.from('layouts').select('tags').eq('is_public', true).not('tags', 'is', null)
  if (error) throw error
  const all = new Set()
  for (const row of data) {
    for (const tag of row.tags || []) all.add(tag)
  }
  return [...all].sort()
}

// Curated collections for Browse's "Featured" strip. Rows are added by hand in Supabase's table
// editor (see migration 008) — nothing here writes to featured_collections/
// featured_collection_layouts, only reads. Empty array (not a throw) if none exist yet, so the
// caller can just skip rendering the section rather than branching on an error.
export async function listFeaturedCollections() {
  const client = requireClient()
  const { data, error } = await client
    .from('featured_collections')
    .select(
      'id, title, description, featured_collection_layouts(sort_order, layouts(id, name, room, items, features, thumbnail_url, likes_count, copy_count, view_count, user_id, profiles(display_name, is_designer)))'
    )
    .order('created_at', { ascending: true })
    .order('sort_order', { foreignTable: 'featured_collection_layouts', ascending: true })
  if (error || !data) return []
  return data
    .map((collection) => ({
      id: collection.id,
      title: collection.title,
      description: collection.description,
      // A layout can be null here if it was deleted or went private after being featured — RLS on
      // the embed still applies, so those just drop out rather than rendering a broken card.
      layouts: (collection.featured_collection_layouts || [])
        .filter((cl) => cl.layouts)
        .map((cl) => ({
          id: cl.layouts.id,
          name: cl.layouts.name,
          room: cl.layouts.room,
          items: cl.layouts.items,
          features: cl.layouts.features || [],
          thumbnailUrl: cl.layouts.thumbnail_url,
          authorId: cl.layouts.user_id,
          authorName: cl.layouts.profiles?.display_name || null,
          designerName: cl.layouts.profiles?.is_designer ? cl.layouts.profiles.display_name : null,
          likesCount: cl.layouts.likes_count,
          viewCount: cl.layouts.view_count,
          copyCount: cl.layouts.copy_count,
        })),
    }))
    .filter((collection) => collection.layouts.length > 0)
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
      'created_at, layouts(id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, user_id, profiles(display_name, is_designer))'
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
      authorId: row.layouts.user_id,
      authorName: row.layouts.profiles?.display_name || null,
      designerName: row.layouts.profiles?.is_designer ? row.layouts.profiles.display_name : null,
      likesCount: row.layouts.likes_count,
      viewCount: row.layouts.view_count,
      copyCount: row.layouts.copy_count,
      hall: row.layouts.hall,
      roomType: row.layouts.room_type,
      bookmarkedAt: new Date(row.created_at).getTime(),
    }))
}

// Reports — no read-back UI (see migration 009); this is the only report-related function
// storage.js needs. `targetType` is 'layout' | 'comment' | 'profile', matching the DB check
// constraint; `reason` is a short label ('spam' | 'inappropriate' | 'other') optionally followed
// by free text the caller has already combined into one string before calling this.
export async function submitReport(targetType, targetId, reason) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('reports').insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason })
  if (error) throw error
}

// Comments — no auth required to read (RLS covers public-layout visibility); posting/deleting
// need a session, same as everything else. Oldest first, like a normal comment thread.
export async function listComments(layoutId) {
  const client = requireClient()
  const { data, error } = await client
    .from('comments')
    .select('id, body, created_at, user_id, profiles(display_name)')
    .eq('layout_id', layoutId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: new Date(row.created_at).getTime(),
    authorId: row.user_id,
    authorName: row.profiles?.display_name || 'A student',
  }))
}

export async function addComment(layoutId, body) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('comments').insert({ layout_id: layoutId, user_id: user.id, body })
  if (error) throw error
}

// RLS allows this for either the comment's author or the layout's owner (moderation lever) —
// see migration 010. No need to check ownership here, the DB is the source of truth for who's
// allowed; a caller without permission just gets an RLS-denied error back.
export async function deleteComment(id) {
  const client = requireClient()
  await requireUser(client)
  const { error } = await client.from('comments').delete().eq('id', id)
  if (error) throw error
}

// Badges/leaderboard (Tier 3, session B5) — deliberately no new table or migration. The brief
// explicitly said a dedicated awarding system isn't worth it at this scale ("even just computed
// client-side from existing counts... no need to build fancy"); leaderboard rankings are the same
// call — computed here from data that already exists (likes_count/copy_count on every public
// layout), not stored or cached anywhere. Fine for the number of layouts this app has today; would
// need to move server-side (an RPC or materialized view) if the public-layout count ever gets
// large enough that fetching all of them client-side stops being cheap.
export async function getLeaderboard() {
  const client = requireClient()
  const { data, error } = await client
    .from('layouts')
    .select('id, name, user_id, likes_count, copy_count, updated_at, thumbnail_url, profiles(display_name, is_designer)')
    .eq('is_public', true)
  if (error) throw error

  const byUser = {}
  for (const row of data) {
    const key = row.user_id
    byUser[key] ??= {
      userId: key,
      displayName: row.profiles?.display_name || 'A student',
      isDesigner: !!row.profiles?.is_designer,
      totalLikes: 0,
      totalCopies: 0,
      layoutCount: 0,
    }
    byUser[key].totalLikes += row.likes_count
    byUser[key].totalCopies += row.copy_count
    byUser[key].layoutCount += 1
  }
  const topDesigners = Object.values(byUser)
    .sort((a, b) => (b.totalLikes + b.totalCopies) - (a.totalLikes + a.totalCopies))
    .slice(0, 10)

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const topLayoutsThisMonth = data
    .filter((row) => new Date(row.updated_at).getTime() >= thirtyDaysAgo)
    .sort((a, b) => (b.likes_count + b.copy_count) - (a.likes_count + a.copy_count))
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      name: row.name,
      thumbnailUrl: row.thumbnail_url,
      authorName: row.profiles?.display_name || 'a student',
      likesCount: row.likes_count,
      copyCount: row.copy_count,
    }))

  return { topDesigners, topLayoutsThisMonth }
}

// Badge thresholds, computed on the fly from a profile's own public layouts (see getPublicProfile
// above) — not stored anywhere, so there's nothing to keep in sync when counts change.
export function computeBadges(layouts) {
  const totalLikes = layouts.reduce((sum, l) => sum + (l.likesCount || 0), 0)
  const totalCopies = layouts.reduce((sum, l) => sum + (l.copyCount || 0), 0)
  const badges = []
  if (layouts.length >= 5) badges.push({ emoji: '🎨', label: `${layouts.length}+ layouts published` })
  if (totalCopies >= 10) badges.push({ emoji: '🏆', label: `${totalCopies}+ copies` })
  if (totalLikes >= 25) badges.push({ emoji: '❤️', label: `${totalLikes}+ likes` })
  return badges
}

export async function getMyProfile() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client
    .from('profiles')
    .select('display_name, is_designer, bio, display_hall, class_year')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data
}

// Only ever touches fields explicitly passed — omit a key entirely to leave it alone, pass ''
// to clear it. Used by the small inline profile-editor in the Saved tab (bio/hall/class year are
// all optional, so there's no dedicated "profile settings" tab for this yet).
export async function updateMyProfile({ bio, displayHall, classYear } = {}) {
  const client = requireClient()
  const user = await requireUser(client)
  const patch = {}
  if (bio !== undefined) patch.bio = bio
  if (displayHall !== undefined) patch.display_hall = displayHall
  if (classYear !== undefined) patch.class_year = classYear
  if (Object.keys(patch).length === 0) return
  const { error } = await client.from('profiles').update(patch).eq('id', user.id)
  if (error) throw error
}

// Follow/unfollow — plain insert/delete against `follows`, same toggle shape as likes/saves.
// followUser() refuses a self-follow before the request even goes out; the DB has the same rule
// as a check constraint (migration 007), so it's blocked either way.
export async function followUser(followeeId) {
  const client = requireClient()
  const user = await requireUser(client)
  if (user.id === followeeId) throw new Error("You can't follow yourself")
  const { error } = await client.from('follows').insert({ follower_id: user.id, followee_id: followeeId })
  if (error && error.code !== '23505') throw error
}

export async function unfollowUser(followeeId) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('follows').delete().eq('follower_id', user.id).eq('followee_id', followeeId)
  if (error) throw error
}

// The signed-in user's own following list, as plain ids — used both to render "Following" vs
// "Follow" on a profile page and as the id list behind Browse's "Following only" filter.
export async function listMyFollowingIds() {
  const client = requireClient()
  const user = await requireUser(client)
  const { data, error } = await client.from('follows').select('followee_id').eq('follower_id', user.id)
  if (error) throw error
  return data.map((r) => r.followee_id)
}

// Everything a public profile page needs in one call: the profile fields, follower/following
// counts, and their public layouts. No auth required — `follows`/`profiles`/public `layouts` rows
// are all readable by anyone, so this works for signed-out visitors too. Returns null (not a
// throw) for a user id that doesn't exist, so the caller can show a clean "not found" state.
export async function getPublicProfile(userId) {
  const client = requireClient()
  const { data: profile, error } = await client
    .from('profiles')
    .select('id, display_name, is_designer, bio, display_hall, class_year')
    .eq('id', userId)
    .maybeSingle()
  if (error || !profile) return null

  const [followerRes, followingRes, layoutsRes] = await Promise.all([
    client.from('follows').select('id', { count: 'exact', head: true }).eq('followee_id', userId),
    client.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
    client
      .from('layouts')
      .select('id, name, room, items, features, thumbnail_url, updated_at, likes_count, view_count, copy_count, hall, room_type, parent_layout_id')
      .eq('user_id', userId)
      .eq('is_public', true)
      .order('updated_at', { ascending: false }),
  ])

  return {
    id: profile.id,
    displayName: profile.display_name,
    isDesigner: profile.is_designer,
    bio: profile.bio,
    displayHall: profile.display_hall,
    classYear: profile.class_year,
    followerCount: followerRes.count || 0,
    followingCount: followingRes.count || 0,
    layouts: (layoutsRes.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      room: row.room,
      items: row.items,
      features: row.features || [],
      thumbnailUrl: row.thumbnail_url,
      savedAt: new Date(row.updated_at).getTime(),
      likesCount: row.likes_count,
      viewCount: row.view_count,
      copyCount: row.copy_count,
      hall: row.hall,
      roomType: row.room_type,
      parentLayoutId: row.parent_layout_id,
    })),
  }
}

// Returns the signed-in user's packing checklist, seeding it from DEFAULT_CHECKLIST_ITEMS the
// first time a given *category* shows up (not just once ever, on the very first load) — so an
// account seeded back when checklistItems.js only covered a couple of categories automatically
// backfills whichever ones were added to that file since, instead of staying stuck at whatever
// existed the day the tab was first opened. Only ever adds items from a category the user has
// literally zero rows in yet — a category they've already seen (even down to zero rows because
// they deleted every default item in it) is left alone, so this never resurrects something
// someone deliberately removed.
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

  const existingCategories = new Set(data.map((row) => row.category))
  const missing = DEFAULT_CHECKLIST_ITEMS.filter((item) => !existingCategories.has(item.category))
  if (missing.length === 0) return data

  const seedRows = missing.map((item) => ({
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
