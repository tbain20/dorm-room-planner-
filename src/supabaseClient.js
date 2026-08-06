import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    'Supabase is not configured — accounts and cloud-saved layouts are disabled. ' +
    'Copy .env.example to .env, fill in your project URL and anon key, and restart the dev server.'
  )
}

// Falls back to null so the rest of the app can render (room building still works fully
// offline); storage.js and AuthPanel.jsx both check for this before using it.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
