import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  // Read PORT from the shell first (Playwright/CI), then from the root `.env`
  // that the API also loads, so the proxy follows a non-default API port.
  const fileEnv = loadEnv(mode, repoRoot, '')
  const apiPort = process.env.PORT || fileEnv.PORT || '8080'

  return {
    root: webRoot,
    plugins: [react()],
    build: {
      outDir: '../dist/web',
      emptyOutDir: true,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    preview: {
      port: 4173,
    },
  }
})
