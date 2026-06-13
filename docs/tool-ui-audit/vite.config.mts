import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src/renderer'),
      '@renderer': resolve(__dirname, '../../src/renderer'),
      '@shared': resolve(__dirname, '../../src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
  },
})
