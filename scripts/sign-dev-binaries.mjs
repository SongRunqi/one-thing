import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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

// codesign 检查(尤其 Electron.app 的 --deep verify)每次要几百毫秒到秒级;
// 按 mtime+size 缓存"上次检查已合格"的结论,未变的二进制直接跳过。
// 缓存只在本脚本签名成功后写入,ONETHING_FORCE_SIGN_CHECK=1 可强制全量检查。
const signCachePath = join(root, 'node_modules', '.cache', 'onething-dev-sign.json')
const forceSignCheck = process.env.ONETHING_FORCE_SIGN_CHECK === '1'

function statFingerprint(targetPath) {
  const stats = statSync(targetPath)
  return { mtimeMs: stats.mtimeMs, size: stats.size }
}

function fingerprintMatches(cached, current) {
  return Boolean(cached) && cached.mtimeMs === current.mtimeMs && cached.size === current.size
}

function loadSignCache() {
  if (forceSignCheck) return { binaries: {} }
  try {
    const cache = JSON.parse(readFileSync(signCachePath, 'utf8'))
    return { binaries: {}, ...cache }
  } catch {
    return { binaries: {} }
  }
}

function saveSignCache(cache) {
  mkdirSync(dirname(signCachePath), { recursive: true })
  writeFileSync(signCachePath, JSON.stringify(cache))
}

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

const cache = loadSignCache()
let signedCount = 0
let cachedCount = 0

for (const binaryPath of nativeBinaries) {
  const key = relative(root, binaryPath)
  const current = statFingerprint(binaryPath)
  if (fingerprintMatches(cache.binaries[key], current)) {
    cachedCount += 1
    continue
  }
  const result = ensureCleanAdhocSignature(binaryPath)
  // 重签会改写文件,指纹必须在签名之后再取。
  cache.binaries[key] = statFingerprint(binaryPath)
  if (!result.signed) continue
  signedCount += 1
  console.log(`[sign] signed ${key}`)
}

// Electron.app 以主可执行文件为指纹代表:--deep 重签会改写它。
const electronExecutablePath = join(electronAppPath, 'Contents', 'MacOS', 'Electron')
let appStatus = 'ok'
if (existsSync(electronExecutablePath)
  && fingerprintMatches(cache.electronApp, statFingerprint(electronExecutablePath))) {
  appStatus = 'cached'
} else {
  const appResult = ensureAppBundleSignature(electronAppPath)
  if (existsSync(electronExecutablePath)) {
    cache.electronApp = statFingerprint(electronExecutablePath)
  }
  if (appResult.signed) {
    appStatus = 'signed'
    console.log(`[sign] signed ${relative(root, electronAppPath)}`)
  }
}

saveSignCache(cache)

console.log(
  `[sign] checked ${nativeBinaries.length} native binaries (${cachedCount} cached), signed ${signedCount}; Electron.app ${appStatus}`,
)
