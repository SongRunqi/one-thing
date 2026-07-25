import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { onethingPackageAliases } from './onething.aliases'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // @onething/* resolution comes from the single shared table.
    alias: onethingPackageAliases(__dirname),
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    alias: {
      // Product assembly tree (prefix entry — covers every subpath).
      '@main': path.resolve(__dirname, 'apps/electron/src/main'),
      '@shared': path.resolve(__dirname, 'packages/shared'),
      '@preload': path.resolve(__dirname, 'apps/electron/src/preload'),
      '@': path.resolve(__dirname, 'packages/renderer'),
    },
  },
})
