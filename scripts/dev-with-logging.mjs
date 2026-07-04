import { spawn, spawnSync } from 'node:child_process'
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
let forwardChildOutput = true
let cleanupTimer = null
const streamLineBuffers = new Map()
const managedChildren = new Set()
const isWindows = process.platform === 'win32'
const verboseStartup = process.env.ONETHING_DEV_VERBOSE === '1'
const projectRoot = process.cwd().replaceAll('\\', '/')

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

function writeChunk(stream, chunk, options = {}) {
  const text = chunk.toString()
  const source = stream === process.stderr ? 'stderr' : 'stdout'
  const pending = streamLineBuffers.get(source) || ''
  const parts = `${pending}${text}`.split(/\r?\n/)
  streamLineBuffers.set(source, parts.pop() || '')
  for (const line of parts) {
    if (line.length > 0) writeLogLine(source, line)
  }
  if (forwardChildOutput && options.forward !== false) safeStreamWrite(stream, chunk)
}

function flushLineBuffers() {
  for (const [source, line] of streamLineBuffers) {
    if (line.length > 0) writeLogLine(source, line)
  }
  streamLineBuffers.clear()
}

function localBin(name) {
  const suffix = isWindows ? '.cmd' : ''
  return path.join(process.cwd(), 'node_modules', '.bin', `${name}${suffix}`)
}

function commandLine(command, args) {
  return [command, ...args].join(' ')
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      title,
      forwardOutput = true,
      enableForwardOutputAfter,
      ...spawnOptions
    } = options
    let bufferedOutput = ''
    let shouldForwardOutput = forwardOutput
    if (title) safeStreamWrite(process.stdout, `${title}\n`)
    writeLogLine('runner', `$ ${commandLine(command, args)}`)
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: isWindows,
      detached: !isWindows,
      ...spawnOptions,
    })
    currentChild = child
    managedChildren.add(child)

    if (typeof enableForwardOutputAfter === 'function') {
      void enableForwardOutputAfter().then(() => {
        shouldForwardOutput = true
      }).catch(() => {
        shouldForwardOutput = true
      })
    }

    const bufferChunk = chunk => {
      bufferedOutput = `${bufferedOutput}${chunk.toString()}`.slice(-20000)
    }
    child.stdout?.on('data', chunk => {
      bufferChunk(chunk)
      writeChunk(process.stdout, chunk, { forward: shouldForwardOutput })
    })
    child.stderr?.on('data', chunk => {
      bufferChunk(chunk)
      writeChunk(process.stderr, chunk, { forward: shouldForwardOutput })
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      currentChild = null
      managedChildren.delete(child)
      flushLineBuffers()
      writeLogLine('runner', `exit ${commandLine(command, args)} code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      if (shuttingDown) {
        resolve()
        return
      }
      if (signal) {
        if (forwardOutput === false && bufferedOutput.trim()) {
          safeStreamWrite(process.stderr, `${bufferedOutput.trim()}\n`)
        }
        reject(Object.assign(new Error(`${command} terminated by ${signal}`), { code, signal }))
      } else if (code && code !== 0) {
        if (forwardOutput === false && bufferedOutput.trim()) {
          safeStreamWrite(process.stderr, `${bufferedOutput.trim()}\n`)
        }
        reject(Object.assign(new Error(`${command} exited with code ${code}`), { code }))
      } else {
        resolve()
      }
    })
  })
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isBrokenOutputPipeError(error) {
  return error?.code === 'EPIPE'
    || error?.code === 'ERR_STREAM_DESTROYED'
    || error?.code === 'ERR_STREAM_WRITE_AFTER_END'
}

function safeStreamWrite(stream, chunk) {
  try {
    stream.write(chunk)
  } catch (error) {
    if (!isBrokenOutputPipeError(error)) throw error
  }
}

function normalizedCommand(command) {
  return command.replaceAll('\\', '/')
}

function pidsMatchingCommand(predicate) {
  if (isWindows) return []
  const result = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
  })
  if (result.status !== 0 || !result.stdout) return []

  const pids = []
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (!match) continue
    const pid = Number.parseInt(match[1], 10)
    const command = match[2] ?? ''
    if (!Number.isFinite(pid) || pid === process.pid) continue
    if (command.includes('/bin/zsh -c') || command.includes('/bin/bash -c') || /\brg\b/.test(command)) continue
    if (predicate(command)) pids.push(pid)
  }
  return [...new Set(pids)]
}

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPid(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal)
  } catch {
    // Process already exited.
  }
}

function killProcessGroup(child, signal = 'SIGTERM') {
  if (!child?.pid) return
  if (isWindows) {
    killPid(child.pid, signal)
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    killPid(child.pid, signal)
  }
}

function isProjectElectronDevCommand(command) {
  const normalized = normalizedCommand(command)
  return (
    normalized.includes(`${projectRoot}/node_modules/.bin/electron-vite`) ||
    normalized.includes(`${projectRoot}/node_modules/electron-vite/`) ||
    normalized.includes(`${projectRoot}/node_modules/electron/`)
  )
}

function isProjectElectronMainCommand(command) {
  const normalized = normalizedCommand(command)
  return normalized.includes(`${projectRoot}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .`)
}

async function waitForProcess(predicate, timeoutMs = 90000) {
  const attempts = Math.ceil(timeoutMs / 250)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (pidsMatchingCommand(predicate).length > 0) return
    await wait(250)
  }
  throw new Error('process did not start')
}

async function cleanupElectronDevProcesses(signal = 'SIGTERM') {
  const pids = pidsMatchingCommand(isProjectElectronDevCommand)
  if (pids.length === 0) return
  writeLogLine('runner', `stopping electron dev processes: ${pids.join(', ')}`)
  for (const pid of pids) killPid(pid, signal)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(100)
    if (pids.every(pid => !processExists(pid))) return
  }
  for (const pid of pids) {
    if (processExists(pid)) killPid(pid, 'SIGKILL')
  }
}

function forwardSignal(signal) {
  if (shuttingDown) return
  shuttingDown = true
  writeLogLine('runner', `received ${signal}`)
  safeStreamWrite(process.stdout, `[dev] stopping Electron dev processes; child logs muted\n`)
  forwardChildOutput = false
  for (const child of managedChildren) {
    killProcessGroup(child, signal)
  }
  void (async () => {
    await wait(1200)
    await cleanupElectronDevProcesses('SIGTERM')
    await wait(1800)
    for (const child of managedChildren) {
      killProcessGroup(child, 'SIGKILL')
    }
    await cleanupElectronDevProcesses('SIGKILL')
    process.exit(0)
  })()
}

async function main() {
  ensureLogDir()
  cleanupArchives()
  cleanupTimer = setInterval(cleanupArchives, CLEANUP_INTERVAL_MS)
  cleanupTimer.unref?.()
  writeLogLine('runner', `${LOG_NAME} logging to ${ACTIVE_LOG}`)

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  const forwardPrepOutput = verboseStartup
  await run('npm', ['run', 'build:native:mac'], {
    title: 'checking native panel bridge',
    forwardOutput: forwardPrepOutput,
  })
  await run('npm', ['run', 'sign:dev:mac'], {
    title: 'checking macOS dev signatures',
    forwardOutput: forwardPrepOutput,
  })
  await cleanupElectronDevProcesses()
  await run(localBin('electron-vite'), [LOG_NAME === 'start' ? 'preview' : 'dev'], {
    title: 'launching Electron window',
    forwardOutput: verboseStartup,
    enableForwardOutputAfter: verboseStartup
      ? undefined
      : () => waitForProcess(isProjectElectronMainCommand),
  })
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
