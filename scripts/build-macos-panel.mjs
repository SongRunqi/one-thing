import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const nativeDir = join(root, 'native', 'macos-panel')
const outputDir = join(root, 'resources', 'native')
const outputFile = join(outputDir, 'macos_panel.node')
const force = process.argv.includes('--force') || process.env.ONETHING_FORCE_NATIVE_REBUILD === '1'

if (process.platform !== 'darwin') {
  mkdirSync(outputDir, { recursive: true })
  console.log('[native] macOS panel bridge skipped on non-macOS platform')
  process.exit(0)
}

const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
if (!existsSync(nodeGyp)) {
  throw new Error('node-gyp is not installed; run npm install or bun install first')
}

function newestInputMtime() {
  const inputs = [
    fileURLToPath(import.meta.url),
    join(nativeDir, 'binding.gyp'),
    join(nativeDir, 'macos_panel.mm'),
    join(root, 'package.json'),
    join(root, 'package-lock.json'),
    join(root, 'bun.lock'),
  ]

  return Math.max(...inputs
    .filter(existsSync)
    .map(file => statSync(file).mtimeMs))
}

function isOutputFresh() {
  return existsSync(outputFile) && statSync(outputFile).mtimeMs >= newestInputMtime()
}

if (!force && isOutputFresh()) {
  console.log(`[native] macOS panel bridge is up to date: ${outputFile}`)
  process.exit(0)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function canRunNodeGypPython(python) {
  try {
    execFileSync(python, ['-c', 'import socket, sys; print(sys.executable)'], {
      cwd: root,
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

function findNodeGypPython() {
  const candidates = unique([
    process.env.NODE_GYP_FORCE_PYTHON,
    process.env.npm_config_python,
    process.env.PYTHON,
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    'python',
  ])

  for (const python of candidates) {
    if (python.includes('/') && !existsSync(python)) continue
    if (canRunNodeGypPython(python)) return python
  }

  throw new Error('No usable Python found for node-gyp. Install Homebrew Python or fix the system Python installation.')
}

const python = findNodeGypPython()
console.log(`[native] using Python for node-gyp: ${python}`)

rmSync(join(nativeDir, 'build'), { recursive: true, force: true })
execFileSync(process.execPath, [nodeGyp, 'rebuild', '--directory', nativeDir, '--python', python], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_GYP_FORCE_PYTHON: python,
    PYTHON: python,
  },
})

mkdirSync(outputDir, { recursive: true })
copyFileSync(join(nativeDir, 'build', 'Release', 'macos_panel.node'), outputFile)
execFileSync('codesign', ['--force', '--sign', '-', outputFile], {
  cwd: root,
  stdio: 'inherit',
})
console.log(`[native] built ${outputFile}`)
