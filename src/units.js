// Shared unit conversion/formatting for every place a real-world length gets displayed — the
// Session 2 on-model dimension labels and the Session 3 measuring tool (both in roomEngine.js,
// which is deliberately independent of React so it imports this directly), and the selection
// panel's text-based Width/Depth/Height list (App.jsx). Everything in the data model itself stays
// in feet regardless of the chosen display unit (catalog dims, room dims, saved layouts) — only
// how a length gets *shown* to the user changes.
const CM_PER_FOOT = 30.48

export const UNIT_SYSTEMS = [
  { id: 'ft-in', label: 'ft & in' },
  { id: 'ft', label: 'decimal ft' },
  { id: 'cm', label: 'cm' },
]

export const DEFAULT_UNIT_SYSTEM = 'ft-in'

export function formatLength(feet, unit = DEFAULT_UNIT_SYSTEM) {
  if (feet == null || Number.isNaN(feet)) return ''
  if (unit === 'cm') return `${Math.round(feet * CM_PER_FOOT)} cm`
  if (unit === 'ft') return `${feet.toFixed(1)}'`
  // ft-in
  const totalInches = Math.round(feet * 12)
  const wholeFeet = Math.floor(totalInches / 12)
  const inches = totalInches - wholeFeet * 12
  return `${wholeFeet}'${inches}"`
}
