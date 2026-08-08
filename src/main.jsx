import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Attaches window.generateAllThumbnails() for regenerating catalog thumbnails — dev-only, see
// thumbnailRenderer.js. No UI, no runtime cost beyond the import itself.
import './thumbnailRenderer.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
