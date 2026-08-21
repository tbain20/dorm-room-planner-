import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Dev-only endpoint backing window.generateAllThumbnails({ saveToServer: true }) — writes
// regenerated catalog thumbnails straight to public/thumbnails/ instead of triggering 20+
// individual browser downloads you'd have to move by hand. Never runs in a production build
// (configureServer only applies to `vite dev`); see thumbnailRenderer.js for the generator.
function saveThumbnailPlugin() {
  return {
    name: 'save-thumbnail',
    configureServer(server) {
      server.middlewares.use('/__save-thumbnail', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { id, dataUrl } = JSON.parse(body)
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
            const dir = path.resolve(__dirname, 'public/thumbnails')
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(base64, 'base64'))
            res.statusCode = 200
            res.end('ok')
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), saveThumbnailPlugin()],
  // Otherwise Vite's watcher notices new files landing in public/thumbnails/ (written by the
  // plugin above) and force-reloads the page mid-generation, killing window.__thumbs.
  // Trade-off: since the dir is unwatched, Vite's static server never learns a *brand-new*
  // filename exists there until it restarts — a thumbnail for a catalog id that didn't have one
  // before will 404 (silently falling through to the SPA shell) until you restart `vite dev`.
  // Re-generating an *existing* thumbnail (same filename, new content) doesn't have this problem.
  server: { watch: { ignored: ['**/public/thumbnails/**'] } },
})
