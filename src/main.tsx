import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyLangAttributes, detectInitialLang } from './lib/i18n'
import { initAnalytics } from './lib/analytics'
import './index.css'

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[pwa] service worker registration failed', err)
    })
  })
}

// 1. Initiale Sprache + RTL/LTR auf <html> setzen, BEVOR React rendert,
//    damit es keinen "Flash of Wrong Direction" gibt.
applyLangAttributes(detectInitialLang())
registerServiceWorker()

// 2. Lokalen Consent-Adapter initialisieren. Externe Analytics sind deaktiviert.
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
