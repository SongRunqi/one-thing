import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const nativeDir = join(root, 'native', 'macos-panel')
const outputDir = join(root, 'resources', 'native')
const outputFile = join(outputDir, 'macos_panel.node')

if (process.platform !== 'darwin') {
  mkdirSync(outputDir, { recursive: true })
  console.log('[native] macOS panel bridge skipped on non-macOS platform')
  process.exit(0)
}

const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
if (!existsSync(nodeGyp)) {
  throw new Error('node-gyp is not installed; run npm install or bun install first')
}

rmSync(join(nativeDir, 'build'), { recursive: true, force: true })
execFileSync(process.execPath, [nodeGyp, 'rebuild', '--directory', nativeDir], {
  cwd: root,
  stdio: 'inherit',
})

mkdirSync(outputDir, { recursive: true })
copyFileSync(join(nativeDir, 'build', 'Release', 'macos_panel.node'), outputFile)
execFileSync('codesign', ['--force', '--sign', '-', outputFile], {
  cwd: root,
  stdio: 'inherit',
})
console.log(`[native] built ${outputFile}`)
