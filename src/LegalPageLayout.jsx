import { useEffect } from 'react'
import { Link } from 'react-router-dom'

// Shared chrome for /terms and /privacy (TermsPage.jsx, PrivacyPage.jsx) — a plain readable
// document page, matching the light "back link + serif heading" pattern BoardDetailPage.jsx and
// LayoutDetailPage.jsx already use for standalone routes outside the main app shell.
export default function LegalPageLayout({ title, updated, children }) {
  useEffect(() => {
    document.title = `${title} — Dorm Room Planner`
  }, [title])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 100px', fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
      <Link to="/" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>← Dorm Room Planner</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, fontSize: 28, marginTop: 20, marginBottom: 4 }}>{title}</h1>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 32 }}>Last updated: {updated}</div>
      <div className="legal-body" style={{ fontSize: 14.5, lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  )
}
