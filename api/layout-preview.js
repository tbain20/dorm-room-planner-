// Vercel serverless function — serves a minimal HTML shell with Open Graph meta tags for
// link-unfurling bots. See vercel.json's rewrite: ONLY requests whose user-agent matches a known
// bot get routed here; every real visitor goes straight to the normal React SPA and never hits
// this function. This exists because client-side-only React can't produce correct link previews
// on its own — iMessage/Discord/Slack/etc. don't execute JavaScript when unfurling a link, so the
// og: meta tags have to already be present in the initial HTML response, which only a server
// (this function) can provide.
//
// NOT TESTED AGAINST A LIVE DEPLOYMENT — this needs Vercel, and this dev environment doesn't have
// one. Test by pasting a real /layouts/:id link into iMessage/Discord/Slack after deploying (see
// the brief's own testing note — this genuinely can't be verified from localhost). If a preview
// doesn't render for a given platform, the most likely culprit is that platform's crawler sending
// a user-agent string not covered by BOT_UA_PATTERN in vercel.json — Apple's iMessage link-
// preview fetcher in particular doesn't publish a stable, documented user-agent, so it may not be
// reliably catchable this way at all; treat that one as a known open question, not a bug to chase
// blindly.
export default async function handler(req, res) {
  const id = req.query.id
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  let title = 'Dorm Room Planner'
  let description = 'A 3D dorm room layout, shared from Dorm Room Planner.'
  let image = null

  if (supabaseUrl && supabaseAnonKey && id) {
    try {
      const restUrl = `${supabaseUrl}/rest/v1/layouts?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=name,thumbnail_url`
      const resp = await fetch(restUrl, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      })
      if (resp.ok) {
        const rows = await resp.json()
        if (rows[0]) {
          title = rows[0].name
          image = rows[0].thumbnail_url || null
        }
      }
      // A non-OK response (layout deleted/private/bad id) just falls through to the generic
      // fallback title/description above — a broken preview shouldn't 500 the whole function.
    } catch {
      // Same reasoning — a Supabase hiccup degrades to the generic fallback, not an error page.
    }
  }

  const pageUrl = `https://${req.headers.host}/layouts/${id || ''}`
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // 5 minutes at the edge — long enough to matter for a link that gets unfurled by several
  // platforms in quick succession, short enough that a re-published/renamed layout's preview
  // doesn't stay stale for long.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta http-equiv="refresh" content="0; url=${esc(pageUrl)}">
</head>
<body>
<p>${esc(title)} — <a href="${esc(pageUrl)}">view on Dorm Room Planner</a></p>
</body>
</html>`)
}
