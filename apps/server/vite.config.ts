import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { onethingPackageAliases } from '../../onething.aliases'

const projectRoot = resolve(__dirname, '../..')

export default defineConfig({
  root: projectRoot,
  cacheDir: resolve(projectRoot, 'node_modules/.vite/server'),
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(projectRoot, 'packages/shared') },
      ...onethingPackageAliases(projectRoot),
    ],
  },
  build: {
    ssr: resolve(projectRoot, 'apps/server/src/main.ts'),
    target: 'node20',
    outDir: resolve(projectRoot, 'dist/server'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        // Single-file bundle: split dynamic-import chunks re-import main.js,
        // and with a top-level await in flight that cycle deadlocks module
        // evaluation (the electron main build already bundles single-file).
        inlineDynamicImports: true,
      },
    },
  },
})
