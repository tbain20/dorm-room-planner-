import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import LayoutDetailPage from './LayoutDetailPage.jsx'
import './index.css'
import { Analytics } from '@vercel/analytics/react'
// Attaches window.generateAllThumbnails() for regenerating catalog thumbnails — dev-only, see
// thumbnailRenderer.js. No UI, no runtime cost beyond the import itself.
import './thumbnailRenderer.js'
// /layouts/:id (shareable links — see "Comments + shareable links" in the README) is the only
// other route; everything else still lives inside App's own tab-based state, not real routes.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/layouts/:id" element={<LayoutDetailPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </React.StrictMode>,
)
