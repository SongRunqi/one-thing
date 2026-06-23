import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const LOG_DIR = path.join(os.homedir(), '.onething', 'log')
const LOG_NAME = process.argv[2] === 'start' ? 'start' : 'dev'
const ACTIVE_LOG = path.join(LOG_DIR, `${LOG_NAME}.log`)
const MAX_LOG_BYTES = readNumberEnv('ONETHING_LOG_MAX_SIZE_MB', 8, 1, 512) * 1024 * 1024
const MAX_ARCHIVES = readNumberEnv('ONETHING_LOG_MAX_ARCHIVES', 30, 1, 500)
const RETENTION_DAYS = readNumberEnv('ONETHING_LOG_RETENTION_DAYS', 14, 1, 365)
const COMPRESS_ARCHIVES = process.env.ONETHING_LOG_COMPRESS !== '0'
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

let activeSize = 0
let archiveCounter = 0
let currentDay = dayKey()
let currentChild = null
let shuttingDown = false
let cleanupTimer = null
const streamLineBuffers = new Map()

function readNumberEnv(name, fallback, min, max) {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  try {
    const stat = fs.statSync(ACTIVE_LOG)
    activeSize = stat.size
    currentDay = dayKey(stat.mtime)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    activeSize = 0
    currentDay = dayKey()
  }
}

function timestamp() {
  return new Date().toISOString()
}

function dayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timestampForFilename() {
  return timestamp().replace(/[:.]/g, '-')
}

function rotateIfNeeded(incomingBytes, reason = 'size') {
  const today = dayKey()
  if (activeSize > 0 && today !== currentDay) {
    rotateActiveLog('date')
    return
  }
  if (activeSize === 0 || activeSize + incomingBytes <= MAX_LOG_BYTES) return
  rotateActiveLog(reason)
}

function rotateActiveLog(reason) {
  const archivePath = path.join(
    LOG_DIR,
    `${LOG_NAME}-${timestampForFilename()}-${String(++archiveCounter).padStart(3, '0')}-${reason}.log`,
  )
  fs.renameSync(ACTIVE_LOG, archivePath)
  activeSize = 0
  currentDay = dayKey()

  if (COMPRESS_ARCHIVES) {
    const compressedPath = `${archivePath}.gz`
    fs.writeFileSync(compressedPath, gzipSync(fs.readFileSync(archivePath), { level: 9 }))
    fs.unlinkSync(archivePath)
  }
  cleanupArchives()
}

function cleanupArchives() {
  let entries
  try {
    entries = fs.readdirSync(LOG_DIR, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  const cutoff = Date.now() - RETENTION_DAYS * 86400000
  const archives = entries
    .filter(entry => entry.isFile())
    .filter(entry => entry.name.startsWith(`${LOG_NAME}-`) && (entry.name.endsWith('.log') || entry.name.endsWith('.log.gz')))
    .map(entry => {
      const filePath = path.join(LOG_DIR, entry.name)
      const stat = fs.statSync(filePath)
      return { filePath, name: entry.name, mtimeMs: stat.mtimeMs }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  const keep = new Set(archives.slice(0, MAX_ARCHIVES).map(entry => entry.filePath))
  for (const entry of archives) {
    if (entry.mtimeMs >= cutoff && keep.has(entry.filePath)) continue
    try {
      fs.unlinkSync(entry.filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}

function writeLogLine(source, text) {
  if (!text) return
  const line = `${timestamp()} [${source}] ${text.replace(/\r?\n$/, '')}\n`
  const chunk = Buffer.from(line)
  rotateIfNeeded(chunk.byteLength)
  fs.appendFileSync(ACTIVE_LOG, chunk)
  activeSize += chunk.byteLength
  currentDay = dayKey()
}

function writeChunk(stream, chunk) {
  const text = chunk.toString()
  stream.write(chunk)
  const source = stream === process.stderr ? 'stderr' : 'stdout'
  const pending = streamLineBuffers.get(source) || ''
  const parts = `${pending}${text}`.split(/\r?\n/)
  streamLineBuffers.set(source, parts.pop() || '')
  for (const line of parts) {
    if (line.length > 0) writeLogLine(source, line)
  }
}

function flushLineBuffers() {
  for (const [source, line] of streamLineBuffers) {
    if (line.length > 0) writeLogLine(source, line)
  }
  streamLineBuffers.clear()
}

function localBin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : ''
  return path.join(process.cwd(), 'node_modules', '.bin', `${name}${suffix}`)
}

function commandLine(command, args) {
  return [command, ...args].join(' ')
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    writeLogLine('runner', `$ ${commandLine(command, args)}`)
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...options,
    })
    currentChild = child

    child.stdout?.on('data', chunk => writeChunk(process.stdout, chunk))
    child.stderr?.on('data', chunk => writeChunk(process.stderr, chunk))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      currentChild = null
      flushLineBuffers()
      writeLogLine('runner', `exit ${commandLine(command, args)} code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      if (signal) {
        reject(Object.assign(new Error(`${command} terminated by ${signal}`), { code, signal }))
      } else if (code && code !== 0) {
        reject(Object.assign(new Error(`${command} exited with code ${code}`), { code }))
      } else {
        resolve()
      }
    })
  })
}

function forwardSignal(signal) {
  if (shuttingDown) return
  shuttingDown = true
  writeLogLine('runner', `received ${signal}`)
  if (currentChild && !currentChild.killed) {
    currentChild.kill(signal)
  }
  setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 250).unref()
}

async function main() {
  ensureLogDir()
  cleanupArchives()
  cleanupTimer = setInterval(cleanupArchives, CLEANUP_INTERVAL_MS)
  cleanupTimer.unref?.()
  writeLogLine('runner', `${LOG_NAME} logging to ${ACTIVE_LOG}`)

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  await run('npm', ['run', 'build:native:mac'])
  await run('npm', ['run', 'rebuild:sqlite:electron'])
  await run(localBin('electron-vite'), [LOG_NAME === 'start' ? 'preview' : 'dev'])
}

main().then(() => {
  flushLineBuffers()
  if (cleanupTimer) clearInterval(cleanupTimer)
  writeLogLine('runner', `${LOG_NAME} completed`)
}).catch(error => {
  flushLineBuffers()
  if (cleanupTimer) clearInterval(cleanupTimer)
  writeLogLine('runner', error?.stack || String(error))
  process.exit(typeof error?.code === 'number' ? error.code : 1)
})
