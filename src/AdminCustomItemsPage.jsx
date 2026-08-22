import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { listAllCustomItemsForReview } from './storage.js'
import AuthPanel from './AuthPanel.jsx'

// Tyler-only review table (/admin/custom-items) — every custom item any user has submitted (see
// Session 1: custom item entry), so he can spot real product-gap signals and turn the good ones
// into real curated catalog entries over time. Deliberately just a plain table, no real admin
// tooling — this app has no is_admin flag/role system anywhere (see 009_moderation.sql's own note
// on why the `reports` table is reviewed straight from Supabase's table editor instead of a
// dashboard), so this page is gated the same way migration 015's broad-SELECT policy is: directly
// on Tyler's own account email. The RLS policy is the real enforcement — this page-level check is
// just so anyone else who lands here sees a clear "not for you" instead of an empty, confusing
// table (their own request would come back empty regardless, since RLS only grants that broad
// SELECT to his email).
const ADMIN_EMAIL = 'tylerabain3@gmail.com'

export default function AdminCustomItemsPage() {
  const { session, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isAdmin = session?.user?.email === ADMIN_EMAIL

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    listAllCustomItemsForReview()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const pageStyle = { maxWidth: 1100, margin: '0 auto', padding: '40px 24px 100px', fontFamily: 'var(--font-sans)', color: 'var(--ink)' }

  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div style={pageStyle}>
        <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, marginTop: 20 }}>Not available</h1>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>This page is only for the app's own admin account.</p>
        {!session && <AuthPanel />}
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Dorm Room Planner</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 650, fontSize: 26, marginTop: 12, marginBottom: 4 }}>Custom item submissions</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 24 }}>
        Every item a user has added themselves — real signal for what's missing from the catalog. {items.length} total.
      </p>

      {loading && <div className="empty-note">Loading…</div>}
      {error && <div className="board-popover-error">{error}</div>}

      {!loading && !error && (
        items.length === 0 ? (
          <div className="empty-note">No custom items submitted yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--paper-shadow)' }}>
                  {['Name', 'Product URL', 'Price', 'Dims (W×D×H)', 'Stand-in model', 'Submitted by', 'Date'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--paper-shadow)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {row.product_url ? (
                        <a href={row.product_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          Link ↗
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>${row.price}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{row.width}' × {row.depth}' × {row.height}'</td>
                    <td style={{ padding: '8px 10px', color: 'var(--ink-soft)' }}>{row.stand_in_catalog_id}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--ink-soft)' }}>{row.profiles?.display_name || row.user_id}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
