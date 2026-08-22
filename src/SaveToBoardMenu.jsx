import { useState } from 'react'

// Pinterest-style "save to board" popover — check/uncheck which of the user's boards this layout
// sits in, or type a name and create a new board on the spot. Purely presentational/interactive;
// state (the boards list, which layouts are in which) lives in whichever page renders this
// (BrowsePage.jsx's gallery cards, App.jsx's Saved-tab board folders) so both can share one
// component without either owning the other's data.
//
// `memberBoardIds` is a Set of board ids that already contain `layout` — computed by the caller
// (usually by scanning `boards` for `layouts.some(l => l.id === layout.id)`) rather than derived
// in here, since the caller already has to do that scan anyway to decide whether to show a filled
// or empty save icon before this popover ever opens.
export default function SaveToBoardMenu({ boards, memberBoardIds, onToggle, onCreate, onClose }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    const name = draft.trim()
    if (!name || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate(name)
      setDraft('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(board) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onToggle(board, !memberBoardIds.has(board.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="board-popover-backdrop" onClick={onClose} />
      <div className="board-popover" onClick={(e) => e.stopPropagation()}>
        <div className="board-popover-title">Save to board</div>
        <div className="board-popover-list">
          {boards.length === 0 ? (
            <div className="board-popover-empty">No boards yet — create your first one below.</div>
          ) : (
            boards.map((board) => (
              <label key={board.id} className="board-popover-row">
                <input
                  type="checkbox"
                  checked={memberBoardIds.has(board.id)}
                  disabled={busy}
                  onChange={() => handleToggle(board)}
                />
                <span className="board-popover-row-name">{board.name}</span>
                <span className="board-popover-row-count">{board.layouts.length}</span>
              </label>
            ))
          )}
        </div>
        <div className="board-popover-new">
          <input
            placeholder="New board name…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} disabled={busy || !draft.trim()}>+</button>
        </div>
        {error && <div className="board-popover-error">{error}</div>}
      </div>
    </>
  )
}
