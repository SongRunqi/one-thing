import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const binaryPath = join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
const markerPath = join(root, 'node_modules', '.cache', 'onething', 'better-sqlite3-electron.json')
const force = process.argv.includes('--force') || process.env.ONETHING_FORCE_SQLITE_REBUILD === '1'

function readPackageVersion(packageName) {
  const packageJsonPath = join(root, 'node_modules', packageName, 'package.json')
  return JSON.parse(readFileSync(packageJsonPath, 'utf-8')).version
}

async function getElectronAbi(electronVersion) {
  try {
    const nodeAbi = await import('node-abi')
    const getAbi = nodeAbi.getAbi || nodeAbi.default?.getAbi
    if (typeof getAbi === 'function') {
      return getAbi(electronVersion, 'electron')
    }
  } catch {
    // Fall through to version-only freshness checks.
  }
  return null
}

function readMarker() {
  try {
    return JSON.parse(readFileSync(markerPath, 'utf-8'))
  } catch {
    return null
  }
}

function isFresh(expected) {
  if (force || !existsSync(binaryPath)) return false

  const marker = readMarker()
  if (!marker) return false

  const binaryMtimeMs = statSync(binaryPath).mtimeMs
  return (
    marker.electronVersion === expected.electronVersion &&
    marker.electronAbi === expected.electronAbi &&
    marker.betterSqlite3Version === expected.betterSqlite3Version &&
    marker.platform === expected.platform &&
    marker.arch === expected.arch &&
    marker.binaryMtimeMs === binaryMtimeMs
  )
}

function rebuild() {
  const cliPath = join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')
  const result = spawnSync(process.execPath, [cliPath, '-f', '-w', 'better-sqlite3'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const electronVersion = readPackageVersion('electron')
const betterSqlite3Version = readPackageVersion('better-sqlite3')
const electronAbi = await getElectronAbi(electronVersion)
const expected = {
  electronVersion,
  electronAbi,
  betterSqlite3Version,
  platform: process.platform,
  arch: process.arch,
}

if (isFresh(expected)) {
  const abiLabel = electronAbi ? ` ABI ${electronAbi}` : ''
  console.log(`[sqlite] better-sqlite3 is already rebuilt for Electron ${electronVersion}${abiLabel}`)
  process.exit(0)
}

console.log(`[sqlite] rebuilding better-sqlite3 for Electron ${electronVersion}${electronAbi ? ` ABI ${electronAbi}` : ''}`)
rebuild()

if (!existsSync(binaryPath)) {
  throw new Error(`better-sqlite3 rebuild did not produce ${binaryPath}`)
}

mkdirSync(dirname(markerPath), { recursive: true })
writeFileSync(markerPath, JSON.stringify({
  ...expected,
  binaryPath,
  binaryMtimeMs: statSync(binaryPath).mtimeMs,
  rebuiltAt: new Date().toISOString(),
}, null, 2))
console.log('[sqlite] better-sqlite3 rebuild marker updated')
