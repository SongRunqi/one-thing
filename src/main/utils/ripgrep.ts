/**
 * Ripgrep Utility
 *
 * Provides fast file searching using ripgrep (rg).
 * Auto-downloads ripgrep binary if not available on the system.
 *
 * Based on OpenCode's implementation.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { spawn } from 'child_process'
import { app } from 'electron'
import { ZipReader, BlobReader, BlobWriter } from '@zip.js/zip.js'

// Platform configurations for ripgrep download
const PLATFORM_CONFIG = {
  'arm64-darwin': { platform: 'aarch64-apple-darwin', extension: 'tar.gz' },
  'arm64-linux': { platform: 'aarch64-unknown-linux-gnu', extension: 'tar.gz' },
  'x64-darwin': { platform: 'x86_64-apple-darwin', extension: 'tar.gz' },
  'x64-linux': { platform: 'x86_64-unknown-linux-musl', extension: 'tar.gz' },
  'x64-win32': { platform: 'x86_64-pc-windows-msvc', extension: 'zip' },
} as const

const RIPGREP_VERSION = '14.1.1'

// Cached ripgrep path
let cachedRgPath: string | null = null

/**
 * Get the bin directory for storing ripgrep
 */
function getBinDir(): string {
  return path.join(app.getPath('userData'), 'bin')
}

/**
 * Check if a command exists in PATH
 */
async function which(command: string): Promise<string | null> {
  const isWin = process.platform === 'win32'
  const pathSep = isWin ? ';' : ':'
  const pathEnv = process.env.PATH || ''
  const extensions = isWin ? ['.exe', '.cmd', '.bat', ''] : ['']

  for (const dir of pathEnv.split(pathSep)) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      try {
        await fs.access(fullPath, fs.constants.X_OK)
        return fullPath
      } catch {
        // Continue searching
      }
    }
  }
  return null
}

/**
 * Download and extract ripgrep binary
 */
async function downloadRipgrep(): Promise<string> {
  const platformKey = `${process.arch}-${process.platform}` as keyof typeof PLATFORM_CONFIG
  const config = PLATFORM_CONFIG[platformKey]

  if (!config) {
    throw new Error(`Unsupported platform: ${platformKey}`)
  }

  const binDir = getBinDir()
  await fs.mkdir(binDir, { recursive: true })

  const rgFilename = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const rgPath = path.join(binDir, rgFilename)

  // Check if already downloaded
  try {
    await fs.access(rgPath, fs.constants.X_OK)
    return rgPath
  } catch {
    // Need to download
  }

  console.log('[Ripgrep] Downloading ripgrep...')

  const filename = `ripgrep-${RIPGREP_VERSION}-${config.platform}.${config.extension}`
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${filename}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ripgrep: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const archivePath = path.join(binDir, filename)
  await fs.writeFile(archivePath, Buffer.from(buffer))

  // Extract based on extension
  if (config.extension === 'tar.gz') {
    await extractTarGz(archivePath, binDir, platformKey)
  } else if (config.extension === 'zip') {
    await extractZip(archivePath, rgPath)
  }

  // Cleanup archive
  await fs.unlink(archivePath)

  // Make executable on Unix
  if (process.platform !== 'win32') {
    await fs.chmod(rgPath, 0o755)
  }

  console.log('[Ripgrep] Downloaded and installed ripgrep')
  return rgPath
}

/**
 * Extract tar.gz archive
 */
async function extractTarGz(archivePath: string, destDir: string, platformKey: string): Promise<void> {
  const args = ['tar', '-xzf', archivePath, '--strip-components=1']

  if (platformKey.endsWith('-darwin')) {
    args.push('--include=*/rg')
  } else if (platformKey.endsWith('-linux')) {
    args.push('--wildcards', '*/rg')
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), {
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

/**
 * Extract zip archive (Windows)
 */
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

/**
 * Get ripgrep binary path (downloads if needed)
 */
export async function getRipgrepPath(): Promise<string> {
  if (cachedRgPath) {
    return cachedRgPath
  }

  // Check system ripgrep first
  const systemRg = await which('rg')
  if (systemRg) {
    cachedRgPath = systemRg
    console.log('[Ripgrep] Using system ripgrep:', systemRg)
    return systemRg
  }

  // Check if we already downloaded it
  const binDir = getBinDir()
  const rgFilename = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const localRg = path.join(binDir, rgFilename)

  try {
    await fs.access(localRg, fs.constants.X_OK)
    cachedRgPath = localRg
    console.log('[Ripgrep] Using local ripgrep:', localRg)
    return localRg
  } catch {
    // Need to download
  }

  // Download ripgrep
  cachedRgPath = await downloadRipgrep()
  return cachedRgPath
}

/**
 * List files matching glob patterns
 */
export async function* listFiles(options: {
  cwd: string
  glob?: string[]
  hidden?: boolean
}): AsyncGenerator<string> {
  const rgPath = await getRipgrepPath()
  const args = ['--files', '--follow']

  if (options.hidden !== false) {
    args.push('--hidden')
  }

  // Always exclude .git
  args.push('--glob=!.git/*')

  // Add glob patterns
  if (options.glob) {
    for (const g of options.glob) {
      args.push(`--glob=${g}`)
    }
  }

  // Verify directory exists
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

  const proc = spawn(rgPath, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
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

  await new Promise<void>((resolve) => {
    proc.on('close', () => resolve())
  })
}

/**
 * Search file contents
 */
export async function search(options: {
  cwd: string
  pattern: string
  glob?: string[]
  maxCount?: number
}): Promise<Array<{
  path: string
  lineNumber: number
  lineText: string
}>> {
  const rgPath = await getRipgrepPath()
  const args = ['-n', '-H', '--field-match-separator=|', '--regexp', options.pattern]

  if (options.glob) {
    for (const g of options.glob) {
      args.push('--glob', g)
    }
  }

  if (options.maxCount) {
    args.push('--max-count', String(options.maxCount))
  }

  args.push(options.cwd)

  const proc = spawn(rgPath, args, {
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

  // Exit code 1 means no matches (not an error)
  if (exitCode === 1) {
    return []
  }

  if (exitCode !== 0) {
    throw new Error(`ripgrep failed: ${stderr}`)
  }

  const results: Array<{
    path: string
    lineNumber: number
    lineText: string
  }> = []

  const lines = stdout.trim().split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue

    const [filePath, lineNumStr, ...rest] = line.split('|')
    if (!filePath || !lineNumStr) continue

    const lineNumber = parseInt(lineNumStr, 10)
    const lineText = rest.join('|')

    results.push({
      path: filePath,
      lineNumber,
      lineText,
    })
  }

  return results
}

/**
 * Ripgrep namespace for compatibility with OpenCode-style imports
 */
export const Ripgrep = {
  filepath: getRipgrepPath,
  files: listFiles,
  search,
}
