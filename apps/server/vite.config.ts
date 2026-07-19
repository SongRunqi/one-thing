import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const projectRoot = resolve(__dirname, '../..')

export default defineConfig({
  root: projectRoot,
  cacheDir: resolve(projectRoot, 'node_modules/.vite/server'),
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(projectRoot, 'src/shared') },
      { find: '@onething/core/agent-loop', replacement: resolve(projectRoot, 'packages/core/agent-loop/index.ts') },
      { find: '@onething/core/engine', replacement: resolve(projectRoot, 'packages/core/engine/index.ts') },
      { find: '@onething/core/http', replacement: resolve(projectRoot, 'packages/core/http/index.ts') },
      { find: '@onething/core/mcp', replacement: resolve(projectRoot, 'packages/core/mcp/index.ts') },
      { find: '@onething/core/permission', replacement: resolve(projectRoot, 'packages/core/permission/index.ts') },
      { find: '@onething/core/plugins', replacement: resolve(projectRoot, 'packages/core/plugins/index.ts') },
      { find: '@onething/core/session', replacement: resolve(projectRoot, 'packages/core/session/index.ts') },
      { find: '@onething/core/json', replacement: resolve(projectRoot, 'packages/core/json.ts') },
      { find: '@onething/core/storage', replacement: resolve(projectRoot, 'packages/core/storage/index.ts') },
      { find: '@onething/core/tools', replacement: resolve(projectRoot, 'packages/core/tools/index.ts') },
      { find: '@onething/core', replacement: resolve(projectRoot, 'packages/core/index.ts') },
      { find: '@onething/runtime/acp', replacement: resolve(projectRoot, 'packages/onething-runtime/src/acp/index.ts') },
      { find: '@onething/runtime/external-agents', replacement: resolve(projectRoot, 'packages/onething-runtime/src/external-agents/index.ts') },
      { find: '@onething/runtime/auth', replacement: resolve(projectRoot, 'packages/onething-runtime/src/auth/index.ts') },
      { find: '@onething/runtime/mcp', replacement: resolve(projectRoot, 'packages/onething-runtime/src/mcp/index.ts') },
      { find: '@onething/runtime/media', replacement: resolve(projectRoot, 'packages/onething-runtime/src/media/index.ts') },
      { find: '@onething/runtime/memory', replacement: resolve(projectRoot, 'packages/onething-runtime/src/memory/index.ts') },
      { find: '@onething/runtime/scheduler', replacement: resolve(projectRoot, 'packages/onething-runtime/src/scheduler/index.ts') },
      { find: '@onething/runtime/variables', replacement: resolve(projectRoot, 'packages/onething-runtime/src/variables/index.ts') },
      { find: '@onething/runtime/agents', replacement: resolve(projectRoot, 'packages/onething-runtime/src/agents/index.ts') },
      { find: '@onething/runtime/providers', replacement: resolve(projectRoot, 'packages/onething-runtime/src/providers/index.ts') },
      { find: '@onething/runtime/usage', replacement: resolve(projectRoot, 'packages/onething-runtime/src/usage/index.ts') },
      { find: '@onething/runtime/practice', replacement: resolve(projectRoot, 'packages/onething-runtime/src/practice/index.ts') },
      { find: '@onething/runtime/search', replacement: resolve(projectRoot, 'packages/onething-runtime/src/search/index.ts') },
      {
        find: /^@onething\/runtime\/sessions\/(.+)$/,
        replacement: resolve(projectRoot, 'packages/onething-runtime/src/sessions/$1.ts'),
      },
      { find: '@onething/runtime/sessions', replacement: resolve(projectRoot, 'packages/onething-runtime/src/sessions/index.ts') },
      { find: '@onething/runtime/project-dirs', replacement: resolve(projectRoot, 'packages/onething-runtime/src/project-dirs/index.ts') },
      { find: '@onething/runtime/permissions', replacement: resolve(projectRoot, 'packages/onething-runtime/src/permissions/index.ts') },
      { find: '@onething/runtime/plugins', replacement: resolve(projectRoot, 'packages/onething-runtime/src/plugins/index.ts') },
      { find: '@onething/runtime/prompts', replacement: resolve(projectRoot, 'packages/onething-runtime/src/prompts/index.ts') },
      { find: '@onething/runtime/files', replacement: resolve(projectRoot, 'packages/onething-runtime/src/files/index.ts') },
      { find: '@onething/runtime/markdown', replacement: resolve(projectRoot, 'packages/onething-runtime/src/markdown/index.ts') },
      { find: '@onething/runtime/skills', replacement: resolve(projectRoot, 'packages/onething-runtime/src/skills/index.ts') },
      { find: '@onething/runtime/storage', replacement: resolve(projectRoot, 'packages/onething-runtime/src/storage/index.ts') },
      {
        find: /^@onething\/runtime\/tools\/(.+)$/,
        replacement: resolve(projectRoot, 'packages/onething-runtime/src/tools/$1.ts'),
      },
      { find: '@onething/runtime/tools', replacement: resolve(projectRoot, 'packages/onething-runtime/src/tools/index.ts') },
      { find: '@onething/runtime/todo-plan', replacement: resolve(projectRoot, 'packages/onething-runtime/src/todo-plan/index.ts') },
      {
        find: /^@onething\/runtime\/themes\/(.+)$/,
        replacement: resolve(projectRoot, 'packages/onething-runtime/src/themes/$1.ts'),
      },
      { find: '@onething/runtime/themes', replacement: resolve(projectRoot, 'packages/onething-runtime/src/themes/index.ts') },
      { find: '@onething/runtime', replacement: resolve(projectRoot, 'packages/onething-runtime/src/index.ts') },
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
      },
    },
  },
})
