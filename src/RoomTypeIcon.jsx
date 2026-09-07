// Stylized isometric room icon for the homepage's room-type showcase (see HomePage.jsx). No real
// rendered layout exists yet for Double/Triple/Common Room, and Single has no marketing screenshot
// either (it's data/logic, not an asset) — so, following the same reasoning RoomFallbackIcon.jsx
// already documents for layout thumbnails (a live 3D render isn't worth the engineering lift here),
// this is a generic isometric box per room type, distinguished by palette tint rather than an
// attempt to depict real furniture. Common Room additionally gets a small accent rectangle standing
// in for a wall-mounted TV, since the brief asks for it to read as a shared lounge, not a bedroom.
const VARIANTS = {
  single: { left: 'var(--sage)', leftOpacity: 0.55, right: 'var(--accent)', rightOpacity: 0.45 },
  double: { left: 'var(--accent)', leftOpacity: 0.4, right: 'var(--sage)', rightOpacity: 0.6 },
  triple: { left: 'var(--accent)', leftOpacity: 0.3, right: 'var(--accent)', rightOpacity: 0.55 },
  common: { left: 'var(--sage)', leftOpacity: 0.4, right: 'var(--sage)', rightOpacity: 0.7 },
}

export default function RoomTypeIcon({ variant = 'single', size = '100%' }) {
  const v = VARIANTS[variant] || VARIANTS.single
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-hidden="true">
      <path d="M50,8 L88,29 L50,50 L12,29 Z" fill="var(--paper-shadow)" stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12,29 L50,50 L50,92 L12,71 Z" fill={v.left} fillOpacity={v.leftOpacity} stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M88,29 L88,71 L50,92 L50,50 Z" fill={v.right} fillOpacity={v.rightOpacity} stroke="rgba(37,29,20,0.15)" strokeWidth="1" strokeLinejoin="round" />
      {variant === 'common' && (
        <polygon points="64.44,51.68 73.56,46.64 73.56,56.72 64.44,61.76" fill="var(--ink)" fillOpacity="0.55" />
      )}
    </svg>
  )
}
