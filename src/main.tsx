import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './lib/changes'
import { initSync } from './lib/sync'

// Frivillig synk: gör ingenting om ingen har loggat in på den här enheten
initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline: appen och visade kartbilder sparas av en service worker (bara i den publicerade versionen)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
