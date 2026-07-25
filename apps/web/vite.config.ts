import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { onethingPackageAliases } from '../../onething.aliases'

const projectRoot = resolve(__dirname, '../..')
const apiTarget = process.env.ONETHING_API_URL || 'http://127.0.0.1:8787'

export default defineConfig({
  root: projectRoot,
  cacheDir: resolve(projectRoot, 'node_modules/.vite/web'),
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(projectRoot, 'packages/renderer') },
      { find: '@renderer', replacement: resolve(projectRoot, 'packages/renderer') },
      { find: '@shared', replacement: resolve(projectRoot, 'packages/shared') },
      ...onethingPackageAliases(projectRoot),
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(projectRoot, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(projectRoot, 'index.html'),
    },
  },
})
