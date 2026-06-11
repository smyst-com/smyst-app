import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// App-only preview config. No offline install layer is registered here; store
// builds should be produced by the native wrapper/tooling.

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  build: {
    target: 'es2022',
    cssTarget: 'safari14',
    minify: 'esbuild',
    cssCodeSplit: true,
    reportCompressedSize: false,
    sourcemap: false,
    assetsInlineLimit: 1024,
    rollupOptions: {
      treeshake: {
        preset: 'smallest',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react';
          }
          if (id.includes('CookieConsent') || id.includes('MobileNav') || id.includes('GitHubSignInButton')) {
            return 'deferred-ui';
          }
        },
      },
    },
  },
})
