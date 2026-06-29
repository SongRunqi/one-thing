import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'

const PLATFORM_CONFIG = {
  'arm64-darwin': { platform: 'aarch64-apple-darwin', extension: 'tar.gz' },
  'arm64-linux': { platform: 'aarch64-unknown-linux-gnu', extension: 'tar.gz' },
  'x64-darwin': { platform: 'x86_64-apple-darwin', extension: 'tar.gz' },
  'x64-linux': { platform: 'x86_64-unknown-linux-musl', extension: 'tar.gz' },
  'x64-win32': { platform: 'x86_64-pc-windows-msvc', extension: 'zip' },
} as const

const RIPGREP_VERSION = '14.1.1'

export type OnethingRipgrepPlatformKey = keyof typeof PLATFORM_CONFIG

export interface OnethingRipgrepRuntimeAdapters {
  createFetch?: () => typeof fetch
  fetch?: typeof fetch
  spawn?: typeof nodeSpawn
  logger?: Pick<Console, 'log' | 'error'>
  homeDir?: string
  pathEnv?: string
  platform?: NodeJS.Platform
  arch?: string
}

export interface OnethingRipgrepListFilesOptions {
  cwd: string
  glob?: string[]
  hidden?: boolean
  noIgnore?: boolean
}

export interface OnethingRipgrepSearchOptions {
  cwd: string
  pattern: string
  glob?: string[]
  maxCount?: number
  ignoreCase?: boolean
  literal?: boolean
}

export interface OnethingRipgrepSearchResult {
  path: string
  lineNumber: number
  lineText: string
}

let configuredAdapters: OnethingRipgrepRuntimeAdapters = {}
let cachedRgPath: string | null = null

export function configureOnethingRipgrepRuntime(adapters: OnethingRipgrepRuntimeAdapters): void {
  configuredAdapters = { ...configuredAdapters, ...adapters }
}

export function resetOnethingRipgrepRuntimeForTests(): void {
  configuredAdapters = {}
  cachedRgPath = null
}

function adaptersWith(overrides: OnethingRipgrepRuntimeAdapters = {}): Required<Pick<OnethingRipgrepRuntimeAdapters, 'logger'>> & OnethingRipgrepRuntimeAdapters {
  return {
    ...configuredAdapters,
    ...overrides,
    logger: overrides.logger ?? configuredAdapters.logger ?? console,
  }
}

export function getOnethingRipgrepPlatformConfig(
  platformKey: string,
): (typeof PLATFORM_CONFIG)[OnethingRipgrepPlatformKey] | undefined {
  return PLATFORM_CONFIG[platformKey as OnethingRipgrepPlatformKey]
}

function getPlatform(adapters: OnethingRipgrepRuntimeAdapters): NodeJS.Platform {
  return adapters.platform ?? process.platform
}

function getArch(adapters: OnethingRipgrepRuntimeAdapters): string {
  return adapters.arch ?? process.arch
}

function getPathEnv(adapters: OnethingRipgrepRuntimeAdapters): string {
  return adapters.pathEnv ?? process.env.PATH ?? ''
}

function getSpawn(adapters: OnethingRipgrepRuntimeAdapters): typeof nodeSpawn {
  return adapters.spawn ?? nodeSpawn
}

function getFetch(adapters: OnethingRipgrepRuntimeAdapters): typeof fetch {
  const fetchImpl = adapters.createFetch?.() ?? adapters.fetch ?? globalThis.fetch
  if (!fetchImpl) throw new Error('A fetch implementation is required to download ripgrep.')
  return fetchImpl
}

function getBinDir(adapters: OnethingRipgrepRuntimeAdapters): string {
  return path.join(adapters.homeDir ?? os.homedir(), '.onething', 'bin')
}

async function which(command: string, adapters: OnethingRipgrepRuntimeAdapters): Promise<string | null> {
  const isWin = getPlatform(adapters) === 'win32'
  const pathSep = isWin ? ';' : ':'
  const extensions = isWin ? ['.exe', '.cmd', '.bat', ''] : ['']

  for (const dir of getPathEnv(adapters).split(pathSep)) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      try {
        await fs.access(fullPath, fs.constants.X_OK)
        return fullPath
      } catch {
        // Continue searching.
      }
    }
  }
  return null
}

async function downloadRipgrep(adapters: OnethingRipgrepRuntimeAdapters): Promise<string> {
  const platformKey = `${getArch(adapters)}-${getPlatform(adapters)}` as OnethingRipgrepPlatformKey
  const config = PLATFORM_CONFIG[platformKey]

  if (!config) {
    throw new Error(`Unsupported platform: ${platformKey}`)
  }

  const binDir = getBinDir(adapters)
  await fs.mkdir(binDir, { recursive: true })

  const rgFilename = getPlatform(adapters) === 'win32' ? 'rg.exe' : 'rg'
  const rgPath = path.join(binDir, rgFilename)

  try {
    await fs.access(rgPath, fs.constants.X_OK)
    return rgPath
  } catch {
    // Need to download.
  }

  adapters.logger?.log('[Ripgrep] Downloading ripgrep...')

  const filename = `ripgrep-${RIPGREP_VERSION}-${config.platform}.${config.extension}`
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${filename}`

  const response = await getFetch(adapters)(url)
  if (!response.ok) {
    throw new Error(`Failed to download ripgrep: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const archivePath = path.join(binDir, filename)
  await fs.writeFile(archivePath, Buffer.from(buffer))

  if (config.extension === 'tar.gz') {
    await extractTarGz(archivePath, binDir, platformKey, adapters)
  } else if (config.extension === 'zip') {
    await extractZip(archivePath, rgPath)
  }

  await fs.unlink(archivePath)

  if (getPlatform(adapters) !== 'win32') {
    await fs.chmod(rgPath, 0o755)
  }

  adapters.logger?.log('[Ripgrep] Downloaded and installed ripgrep')
  return rgPath
}

async function extractTarGz(
  archivePath: string,
  destDir: string,
  platformKey: string,
  adapters: OnethingRipgrepRuntimeAdapters,
): Promise<void> {
  const args = ['tar', '-xzf', archivePath, '--strip-components=1']

  if (platformKey.endsWith('-darwin')) {
    args.push('--include=*/rg')
  } else if (platformKey.endsWith('-linux')) {
    args.push('--wildcards', '*/rg')
  }

  await new Promise<void>((resolve, reject) => {
    const proc = getSpawn(adapters)(args[0], args.slice(1), {
      cwd: destDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tar extraction failed: ${stderr}`))
      } else {
        resolve()
      }
    })

    proc.on('error', reject)
  })
}

async function extractZip(archivePath: string, destPath: string): Promise<void> {
  const fileBuffer = await fs.readFile(archivePath)
  const blob = new Blob([fileBuffer])
  const zipReader = new ZipReader(new BlobReader(blob))

  const entries = await zipReader.getEntries()
  let rgEntry: (typeof entries)[0] | undefined

  for (const entry of entries) {
    if (entry.filename.endsWith('rg.exe') && !entry.directory) {
      rgEntry = entry
      break
    }
  }

  if (!rgEntry || !('getData' in rgEntry)) {
    await zipReader.close()
    throw new Error('rg.exe not found in zip archive')
  }

  const rgBlob = await (rgEntry as any).getData(new BlobWriter())
  const rgBuffer = await rgBlob.arrayBuffer()
  await fs.writeFile(destPath, Buffer.from(rgBuffer))
  await zipReader.close()
}

export async function getOnethingRipgrepPath(
  adaptersOverride: OnethingRipgrepRuntimeAdapters = {},
): Promise<string> {
  const adapters = adaptersWith(adaptersOverride)
  if (cachedRgPath) return cachedRgPath

  const systemRg = await which('rg', adapters)
  if (systemRg) {
    cachedRgPath = systemRg
    adapters.logger.log('[Ripgrep] Using system ripgrep:', systemRg)
    return systemRg
  }

  const binDir = getBinDir(adapters)
  const rgFilename = getPlatform(adapters) === 'win32' ? 'rg.exe' : 'rg'
  const localRg = path.join(binDir, rgFilename)

  try {
    await fs.access(localRg, fs.constants.X_OK)
    cachedRgPath = localRg
    adapters.logger.log('[Ripgrep] Using local ripgrep:', localRg)
    return localRg
  } catch {
    // Need to download.
  }

  cachedRgPath = await downloadRipgrep(adapters)
  return cachedRgPath
}

export function buildOnethingRipgrepFileListArgs(options: Pick<OnethingRipgrepListFilesOptions, 'glob' | 'hidden' | 'noIgnore'>): string[] {
  const args = ['--files', '--follow']

  if (options.hidden !== false) {
    args.push('--hidden')
  }

  if (options.noIgnore) {
    args.push('--no-ignore')
  }

  args.push('--glob=!.git/*')

  if (options.glob) {
    for (const glob of options.glob) {
      args.push(`--glob=${glob}`)
    }
  }

  return args
}

export function buildOnethingRipgrepSearchArgs(options: OnethingRipgrepSearchOptions): string[] {
  const args = ['-n', '-H', '--color=never', '--hidden', '--field-match-separator=|']

  if (options.ignoreCase) args.push('--ignore-case')
  if (options.literal) args.push('--fixed-strings')

  if (options.glob) {
    for (const glob of options.glob) {
      args.push('--glob', glob)
    }
  }

  if (options.maxCount) {
    args.push('--max-count', String(options.maxCount))
  }

  args.push('--regexp', options.pattern, options.cwd)
  return args
}

export function parseOnethingRipgrepSearchOutput(stdout: string): OnethingRipgrepSearchResult[] {
  const results: OnethingRipgrepSearchResult[] = []

  const lines = stdout.trim().split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue

    const [filePath, lineNumStr, ...rest] = line.split('|')
    if (!filePath || !lineNumStr) continue

    const lineNumber = Number.parseInt(lineNumStr, 10)
    if (!Number.isFinite(lineNumber)) continue

    results.push({
      path: filePath,
      lineNumber,
      lineText: rest.join('|'),
    })
  }

  return results
}

export async function* listOnethingRipgrepFiles(
  options: OnethingRipgrepListFilesOptions,
  adaptersOverride: OnethingRipgrepRuntimeAdapters = {},
): AsyncGenerator<string> {
  const adapters = adaptersWith(adaptersOverride)
  const rgPath = await getOnethingRipgrepPath(adapters)
  const args = buildOnethingRipgrepFileListArgs(options)

  try {
    const stats = await fs.stat(options.cwd)
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${options.cwd}`)
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${options.cwd}`)
    }
    throw error
  }

  adapters.logger.log(`[Ripgrep] Spawning: ${rgPath} ${args.join(' ')}`)
  adapters.logger.log(`[Ripgrep] cwd: ${options.cwd}`)

  const proc = getSpawn(adapters)(rgPath, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  let processClosed = false
  let closeResolve: (() => void) | null = null
  const closePromise = new Promise<void>((resolve) => {
    closeResolve = resolve
  })

  proc.on('close', (code) => {
    adapters.logger.log(`[Ripgrep] Process closed with code: ${code}`)
    processClosed = true
    if (closeResolve) closeResolve()
  })

  proc.on('error', (error) => {
    adapters.logger.error('[Ripgrep] Spawn error:', error)
    processClosed = true
    if (closeResolve) closeResolve()
  })

  let buffer = ''

  for await (const chunk of proc.stdout!) {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line) yield line
    }
  }

  if (buffer) yield buffer

  if (!processClosed) {
    await closePromise
  }
}

export async function searchOnethingRipgrep(
  options: OnethingRipgrepSearchOptions,
  adaptersOverride: OnethingRipgrepRuntimeAdapters = {},
): Promise<OnethingRipgrepSearchResult[]> {
  const adapters = adaptersWith(adaptersOverride)
  const rgPath = await getOnethingRipgrepPath(adapters)
  const args = buildOnethingRipgrepSearchArgs(options)

  const proc = getSpawn(adapters)(rgPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  proc.stdout?.on('data', (data) => {
    stdout += data.toString()
  })

  proc.stderr?.on('data', (data) => {
    stderr += data.toString()
  })

  const exitCode = await new Promise<number>((resolve) => {
    proc.on('close', (code) => resolve(code ?? 1))
  })

  if (exitCode === 1) {
    return []
  }

  if (exitCode !== 0) {
    throw new Error(`ripgrep failed: ${stderr}`)
  }

  return parseOnethingRipgrepSearchOutput(stdout)
}

export async function getRipgrepPath(): Promise<string> {
  return getOnethingRipgrepPath()
}

export async function* listFiles(options: OnethingRipgrepListFilesOptions): AsyncGenerator<string> {
  yield* listOnethingRipgrepFiles(options)
}

export async function search(options: OnethingRipgrepSearchOptions): Promise<OnethingRipgrepSearchResult[]> {
  return searchOnethingRipgrep(options)
}

export const OnethingRipgrep = {
  filepath: getOnethingRipgrepPath,
  files: listOnethingRipgrepFiles,
  search: searchOnethingRipgrep,
}

export const Ripgrep = {
  filepath: getRipgrepPath,
  files: listFiles,
  search,
}
