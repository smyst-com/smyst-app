import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyLangAttributes, detectInitialLang } from './lib/i18n'
import { initAnalytics } from './lib/analytics'
import './index.css'

function clearLegacyOfflinePreview() {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined)
  }

  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => undefined)
  }
}

// 1. Initiale Sprache + RTL/LTR auf <html> setzen, BEVOR React rendert,
//    damit es keinen "Flash of Wrong Direction" gibt.
applyLangAttributes(detectInitialLang())

clearLegacyOfflinePreview()

// 2. Analytics initialisieren mit Consent-Mode-Defaults (alles denied,
//    bis Datenschutz-Einstellungen zustimmen). Wenn VITE_GA_MEASUREMENT_ID nicht gesetzt
//    ist (z. B. lokal), tut diese Funktion nichts.
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
