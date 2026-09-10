import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import RoomDesignerPage from './RoomDesignerPage.jsx'
import HomePage from './HomePage.jsx'
import LayoutDetailPage from './LayoutDetailPage.jsx'
import BrowsePage from './BrowsePage.jsx'
import BoardDetailPage from './BoardDetailPage.jsx'
import JoinLayoutPage from './JoinLayoutPage.jsx'
import AdminCustomItemsPage from './AdminCustomItemsPage.jsx'
import TermsPage from './TermsPage.jsx'
import PrivacyPage from './PrivacyPage.jsx'
import './index.css'
import { Analytics } from '@vercel/analytics/react'
// Attaches window.generateAllThumbnails() for regenerating catalog thumbnails — dev-only, see
// thumbnailRenderer.js. No UI, no runtime cost beyond the import itself.
import './thumbnailRenderer.js'
// / is the marketing homepage (HomePage.jsx) — the "front door" every visitor sees first,
// signed in or not (see HomePage.jsx's own comment for why signed-in users still land here).
// /app is the actual tab-based editor (formerly the catch-all target) — the homepage's room-type
// panels and nav route into it. /layouts/:id (shareable links), /layouts/:id/join (a roommate-
// collaboration invite link — see JoinLayoutPage.jsx; has to be its own route rather than a query
// param on /layouts/:id since that route's fetch requires the layout to be public, which a shared
// layout usually isn't), /browse (the Pinterest-style gallery — see BrowsePage.jsx for why Browse
// moved out of App's own tab-based sidebar), and /boards/:id (a public board's own shareable page
// — see BoardDetailPage.jsx) are unaffected by the homepage addition; the catch-all still renders
// App directly (unchanged behavior for any stray path) rather than redirecting to /.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<App />} />
        <Route path="/design" element={<RoomDesignerPage />} />
        <Route path="/layouts/:id/join" element={<JoinLayoutPage />} />
        <Route path="/layouts/:id" element={<LayoutDetailPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/boards/:id" element={<BoardDetailPage />} />
        <Route path="/admin/custom-items" element={<AdminCustomItemsPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </React.StrictMode>,
)
