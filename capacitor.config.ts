import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.smyst.app',
  appName: 'smyst.com',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Origin der App im WebView = https://smyst.com (statt https://localhost).
    // Google Identity Services lehnt Anfragen von nicht autorisierten Origins
    // ab ("verletzt OAuth-2.0-Richtlinien") — smyst.com ist als JavaScript-
    // Origin des GIS-Clients hinterlegt, localhost nicht.
    hostname: 'smyst.com',
  },
}

export default config
