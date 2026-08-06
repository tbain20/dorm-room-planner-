// Local persistence for saved room layouts.
// This keeps layouts on-device, per-browser — good enough for an MVP.
// Swap this module out for real API calls (fetch to your backend) once you add user accounts;
// nothing else in the app needs to change, since App.jsx only talks to these three functions.
const PREFIX = 'dorm-layout:'

export function saveLayout(name, data) {
  localStorage.setItem(PREFIX + name, JSON.stringify({ ...data, name, savedAt: Date.now() }))
}

export function listLayouts() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) {
      try {
        out.push(JSON.parse(localStorage.getItem(key)))
      } catch (e) {
        /* skip corrupt entry */
      }
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function deleteLayout(name) {
  localStorage.removeItem(PREFIX + name)
}
