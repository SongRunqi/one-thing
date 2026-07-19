import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const projectRoot = resolve(__dirname, '../..')
const apiTarget = process.env.ONETHING_API_URL || 'http://127.0.0.1:8787'

export default defineConfig({
  root: projectRoot,
  cacheDir: resolve(projectRoot, 'node_modules/.vite/web'),
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(projectRoot, 'src/renderer') },
      { find: '@renderer', replacement: resolve(projectRoot, 'src/renderer') },
      { find: '@shared', replacement: resolve(projectRoot, 'src/shared') },
      { find: '@onething/core/ipc', replacement: resolve(projectRoot, 'packages/core/ipc/index.ts') },
      { find: '@onething/core/slash-commands', replacement: resolve(projectRoot, 'packages/core/slash-commands.ts') },
      { find: '@onething/core', replacement: resolve(projectRoot, 'packages/core/index.ts') },
      { find: '@onething/runtime/providers/model-capability', replacement: resolve(projectRoot, 'packages/onething-runtime/src/providers/model-capability.ts') },
      { find: '@onething/runtime/embeddings/defaults', replacement: resolve(projectRoot, 'packages/onething-runtime/src/embeddings/defaults.ts') },
      { find: '@onething/runtime/search/protocol', replacement: resolve(projectRoot, 'packages/onething-runtime/src/search/protocol.ts') },
      { find: '@onething/runtime/storage', replacement: resolve(projectRoot, 'packages/onething-runtime/src/storage/index.ts') },
      { find: '@onething/runtime/practice', replacement: resolve(projectRoot, 'packages/onething-runtime/src/practice/index.ts') },
      { find: '@onething/runtime/voice/text', replacement: resolve(projectRoot, 'packages/onething-runtime/src/voice/text.ts') },
      { find: '@onething/runtime', replacement: resolve(projectRoot, 'packages/onething-runtime/src/index.ts') },
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
