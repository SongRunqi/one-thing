import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureAppBundleSignature,
  ensureCleanAdhocSignature,
  isDarwin,
} from './lib/macos-dev-signing.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const electronAppPath = join(root, 'node_modules', 'electron', 'dist', 'Electron.app')

if (!isDarwin) {
  console.log('[sign] dev binary signing skipped on non-macOS platform')
  process.exit(0)
}

function shouldSkipDirectory(dirPath) {
  const electronAppPrefix = `${electronAppPath}${sep}`
  return dirPath === electronAppPath || dirPath.startsWith(electronAppPrefix)
}

function collectNativeBinaries(dirPath, files = []) {
  if (!existsSync(dirPath) || shouldSkipDirectory(dirPath)) return files

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      collectNativeBinaries(entryPath, files)
      continue
    }
    if (entry.isFile() && (entry.name.endsWith('.node') || entry.name.endsWith('.dylib'))) {
      files.push(entryPath)
    }
  }

  return files
}

const nativeBinaries = [
  ...collectNativeBinaries(join(root, 'resources', 'native')),
  ...collectNativeBinaries(join(root, 'node_modules')),
]

let signedCount = 0

for (const binaryPath of nativeBinaries) {
  const result = ensureCleanAdhocSignature(binaryPath)
  if (!result.signed) continue
  signedCount += 1
  console.log(`[sign] signed ${relative(root, binaryPath)}`)
}

const appResult = ensureAppBundleSignature(electronAppPath)
if (appResult.signed) {
  console.log(`[sign] signed ${relative(root, electronAppPath)}`)
}

console.log(
  `[sign] checked ${nativeBinaries.length} native binaries, signed ${signedCount}; Electron.app ${appResult.signed ? 'signed' : 'ok'}`,
)
