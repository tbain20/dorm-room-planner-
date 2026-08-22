// On-brand stand-in for a layout thumbnail that hasn't loaded (or was never captured) — a small
// isometric room/box rendered in the app's own terracotta/sage/warm-neutral palette, instead of a
// plain 🏠 emoji that reads as a generic "broken image" placeholder rather than part of this app.
// Shared by every surface that shows a layout thumbnail with a fallback: BrowseLayoutCard.jsx,
// BoardDetailPage.jsx, LayoutDetailPage.jsx's hero image, and App.jsx's LayoutThumb (My Layouts,
// Saved from others, profile pages, board folders, Shared with me).
//
// Deliberately just a generic 3D box, not an attempt to depict any specific room's real
// furniture — a live per-layout render was considered and explicitly not what this is; see the
// session notes on why (real engineering lift for a case the thumbnail-encoding bug fix already
// makes rare). Uses CSS custom properties directly in `fill`, which resolve fine here since this
// renders inline in the page's own DOM, not as a standalone .svg file.
export default function RoomFallbackIcon({ size = '100%' }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Room preview unavailable">
      {/* top face — floor/ceiling */}
      <path d="M50,8 L88,29 L50,50 L12,29 Z" fill="var(--paper-shadow)" stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
      {/* left face */}
      <path d="M12,29 L50,50 L50,92 L12,71 Z" fill="var(--sage)" fillOpacity="0.55" stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
      {/* right face */}
      <path d="M88,29 L88,71 L50,92 L50,50 Z" fill="var(--accent)" fillOpacity="0.45" stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}
