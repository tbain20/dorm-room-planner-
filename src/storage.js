// Cloud persistence for saved room layouts, backed by Supabase (see supabase/schema.sql for the
// table + RLS policies these calls depend on). Each function requires a signed-in user — callers
// should gate access on useAuth()'s session before calling these.
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
    .select('name, room, items, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    name: row.name,
    room: row.room,
    items: row.items,
    savedAt: new Date(row.updated_at).getTime(),
  }))
}

export async function deleteLayout(name) {
  const client = requireClient()
  const user = await requireUser(client)
  const { error } = await client.from('layouts').delete().eq('user_id', user.id).eq('name', name)
  if (error) throw error
}
