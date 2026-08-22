import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import LayoutDetailPage from './LayoutDetailPage.jsx'
import BrowsePage from './BrowsePage.jsx'
import BoardDetailPage from './BoardDetailPage.jsx'
import JoinLayoutPage from './JoinLayoutPage.jsx'
import AdminCustomItemsPage from './AdminCustomItemsPage.jsx'
import './index.css'
import { Analytics } from '@vercel/analytics/react'
// Attaches window.generateAllThumbnails() for regenerating catalog thumbnails — dev-only, see
// thumbnailRenderer.js. No UI, no runtime cost beyond the import itself.
import './thumbnailRenderer.js'
// /layouts/:id (shareable links), /layouts/:id/join (a roommate-collaboration invite link — see
// JoinLayoutPage.jsx; has to be its own route rather than a query param on /layouts/:id since
// that route's fetch requires the layout to be public, which a shared layout usually isn't),
// /browse (the Pinterest-style gallery — see BrowsePage.jsx for why Browse moved out of App's own
// tab-based sidebar), and /boards/:id (a public board's own shareable page — see
// BoardDetailPage.jsx) are the only other routes; everything else still lives inside App's own
// tab-based state, not real routes.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/layouts/:id/join" element={<JoinLayoutPage />} />
        <Route path="/layouts/:id" element={<LayoutDetailPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/boards/:id" element={<BoardDetailPage />} />
        <Route path="/admin/custom-items" element={<AdminCustomItemsPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </React.StrictMode>,
)
