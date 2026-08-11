import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { onethingPackageAliases } from '../../onething.aliases'

const projectRoot = resolve(__dirname, '../..')
const apiTarget = process.env.ONETHING_API_URL || 'http://127.0.0.1:8787'
// 两个 vite dev server(日常泳道 + scripts/dev-self.mjs 的 B 实例)共用一份
// 依赖预构建缓存会互相作废,dev-self 用 env 换成自己的一份。
const cacheDir = process.env.ONETHING_WEB_CACHE_DIR || 'node_modules/.vite/web'

export default defineConfig({
  root: projectRoot,
  cacheDir: resolve(projectRoot, cacheDir),
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
