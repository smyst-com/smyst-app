import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

// App-only preview config. No offline install layer is registered here; store
// builds should be produced by the native wrapper/tooling.

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function previewJson(
  res: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void },
  status: number,
  body: unknown,
) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default defineConfig({
  plugins: [
    {
      name: 'smyst-preview-api-stubs',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const method = req.method || 'GET'
          const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname

          if (method === 'GET' && pathname === '/api/health') {
            previewJson(res, 200, { ok: true, service: 'smyst-preview', mode: 'local-vite-preview' })
            return
          }
          if (method === 'GET' && pathname === '/auth/me') {
            previewJson(res, 200, { authenticated: false })
            return
          }
          if (method === 'GET' && pathname === '/api/public/twins') {
            previewJson(res, 200, { twins: [] })
            return
          }
          if (method === 'GET' && pathname === '/api/twins') {
            previewJson(res, 401, { error: { code: 'unauthorized', message: 'Authentication required.' } })
            return
          }
          if (pathname === '/storage/upload-url') {
            previewJson(
              res,
              method === 'GET' ? 405 : 403,
              { error: { code: method === 'GET' ? 'method_not_allowed' : 'forbidden', message: 'Preview storage is disabled.' } },
            )
            return
          }

          next()
        })
      },
    },
  ],
  optimizeDeps: {
    include: [],
    noDiscovery: true,
  },
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
