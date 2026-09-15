// Generates public/sitemap.xml at build time: static routes plus every public layout's
// /layouts/:id page, pulled fresh from Supabase since those are never known at build time
// otherwise. Wired in as package.json's "prebuild" so it runs before every `npm run build`.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

try {
  process.loadEnvFile()
} catch {
  // No .env file (e.g. Vercel, where these are already real env vars) — process.env still works.
}

const SITE_URL = 'https://roomex-app.vercel.app'

const STATIC_ROUTES = [
  { path: '/', priority: '1.0' },
  { path: '/browse', priority: '0.8' },
  { path: '/terms', priority: '0.3' },
  { path: '/privacy', priority: '0.3' },
]

function urlEntry(path, priority) {
  return `  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <priority>${priority}</priority>\n  </url>`
}

async function main() {
  const entries = STATIC_ROUTES.map(({ path, priority }) => urlEntry(path, priority))

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data, error } = await supabase.from('layouts').select('id').eq('is_public', true)
    if (error) {
      console.warn('generate-sitemap: could not fetch public layouts, writing static routes only —', error.message)
    } else {
      for (const row of data) {
        entries.push(urlEntry(`/layouts/${row.id}`, '0.5'))
      }
    }
  } else {
    console.warn('generate-sitemap: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set, writing static routes only')
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
  writeFileSync('public/sitemap.xml', xml)
  console.log(`generate-sitemap: wrote ${entries.length} URLs to public/sitemap.xml`)
}

main()
