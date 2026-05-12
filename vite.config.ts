import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// App-only preview config. No offline install layer is registered here; store
// builds should be produced by the native wrapper/tooling.

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    cssTarget: 'safari14',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Trenne große Libs in eigene Chunks für besseres Caching
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
        },
      },
    },
  },
})
