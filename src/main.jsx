import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import LayoutDetailPage from './LayoutDetailPage.jsx'
import BrowsePage from './BrowsePage.jsx'
import './index.css'
import { Analytics } from '@vercel/analytics/react'
// Attaches window.generateAllThumbnails() for regenerating catalog thumbnails — dev-only, see
// thumbnailRenderer.js. No UI, no runtime cost beyond the import itself.
import './thumbnailRenderer.js'
// /layouts/:id (shareable links) and /browse (the Pinterest-style gallery — see BrowsePage.jsx
// for why Browse moved out of App's own tab-based sidebar) are the only other routes; everything
// else still lives inside App's own tab-based state, not real routes.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/layouts/:id" element={<LayoutDetailPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </React.StrictMode>,
)
