import { resolve } from 'path'
import { onethingPackageAliases as createOnethingPackageAliases } from './onething.aliases'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const onethingPackageAliases = createOnethingPackageAliases(__dirname)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'apps/electron/src/main.ts'),
          cli: resolve(__dirname, 'apps/electron/src/main/cli/index.ts')
        }
      }
    },
    resolve: {
      alias: [
        ...onethingPackageAliases,
        { find: '@main', replacement: resolve(__dirname, 'apps/electron/src/main') },
        { find: '@shared', replacement: resolve(__dirname, 'packages/shared') }
      ]
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'apps/electron/src/preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: [
        ...onethingPackageAliases,
        { find: '@shared', replacement: resolve(__dirname, 'packages/shared') }
      ]
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: [
        ...onethingPackageAliases,
        { find: '@', replacement: resolve(__dirname, 'packages/renderer') },
        { find: '@renderer', replacement: resolve(__dirname, 'packages/renderer') },
        { find: '@shared', replacement: resolve(__dirname, 'packages/shared') }
      ]
    },
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port: 5173
    }
  }
})
