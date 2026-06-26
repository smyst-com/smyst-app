import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyLangAttributes, detectInitialLang } from './lib/i18n'
import { initAnalytics } from './lib/analytics'
import './index.css'

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        void registration.update()
        window.setInterval(() => {
          void registration.update()
        }, 60 * 60 * 1000)
      })
      .catch((err) => {
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
