import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import './index.css'

// Capture direct quiz deep links (hash or path) and normalize to query so OAuth redirects don't drop the code
const hash = window.location.hash || ''
const path = window.location.pathname || ''
const hashMatch = hash.match(/#\/quiz\/([A-Za-z0-9]+)/i)
const pathMatch = path.match(/\/quiz\/([A-Za-z0-9]+)/i)
const query = new URLSearchParams(window.location.search)
const queryCode = query.get('quiz_code')

const detectedCode = (hashMatch?.[1] || pathMatch?.[1] || queryCode || '').toUpperCase()
if (detectedCode) {
  sessionStorage.setItem('pending_quiz_code', detectedCode)
  console.log('[main] captured quiz code', detectedCode, { source: hashMatch ? 'hash' : pathMatch ? 'path' : 'query' })
  // Normalize URL to include quiz_code query and remove path/hash so HashRouter doesn't break
  const url = new URL(window.location.href)
  url.hash = ''
  url.pathname = '/'
  url.searchParams.set('quiz_code', detectedCode)
  if (url.toString() !== window.location.href) {
    console.log('[main] normalizing URL to preserve code through OAuth')
    window.history.replaceState({}, document.title, url.toString())
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
)
