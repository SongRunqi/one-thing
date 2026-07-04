import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const children = new Map()
let shuttingDown = false
let forwardChildOutput = true

const isWindows = process.platform === 'win32'
const skipElectron = process.env.ONETHING_DEV_SKIP_ELECTRON === '1'
const verboseStartup = process.env.ONETHING_DEV_VERBOSE === '1'
const projectRoot = process.cwd().replaceAll('\\', '/')

function npmCommand() {
  return isWindows ? 'npm.cmd' : 'npm'
}

function localBin(name) {
  return isWindows ? `node_modules\\.bin\\${name}.cmd` : `node_modules/.bin/${name}`
}

function log(label, message) {
  writeStream(process.stdout, `[${label}] ${message}\n`)
}

function isBrokenOutputPipeError(error) {
  return error?.code === 'EPIPE'
    || error?.code === 'ERR_STREAM_DESTROYED'
    || error?.code === 'ERR_STREAM_WRITE_AFTER_END'
}

function writeStream(stream, text) {
  try {
    stream.write(text)
  } catch (error) {
    if (!isBrokenOutputPipeError(error)) throw error
  }
}

function prefixedPipe(label, stream, target) {
  let pending = ''
  stream.on('data', chunk => {
    if (!forwardChildOutput) return
    const text = `${pending}${chunk.toString()}`
    const lines = text.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) writeStream(target, `[${label}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (forwardChildOutput && pending.length > 0) writeStream(target, `[${label}] ${pending}\n`)
    pending = ''
  })
}

function runBlocking(label, command, args, options = {}) {
  if (options.title) log(label, options.title)
  if (verboseStartup) log(label, `$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: verboseStartup ? 'inherit' : 'pipe',
    encoding: verboseStartup ? undefined : 'utf8',
    shell: isWindows,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (!verboseStartup) {
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      if (output) writeStream(process.stderr, `${output}\n`)
    }
    throw new Error(`${label} exited with code ${result.status}`)
  }
}

function spawnManaged(label, command, args, options = {}) {
  log(label, `$ ${[command, ...args].join(' ')}`)
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
    detached: !isWindows,
  })
  children.set(label, child)
  prefixedPipe(label, child.stdout, process.stdout)
  prefixedPipe(label, child.stderr, process.stderr)
  child.on('error', error => {
    log(label, `error: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    children.delete(label)
    if (shuttingDown) return
    log(label, `exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    shutdown(code && code !== 0 ? code : 0)
  })
  return child
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
  if (!child.pid) return
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

function pidsListeningOn(port) {
  if (isWindows) return []
  const result = spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })
  if (result.status !== 0 && !result.stdout) return []
  return result.stdout
    .split(/\s+/)
    .map(value => Number.parseInt(value, 10))
    .filter(Number.isFinite)
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

function normalizedCommand(command) {
  return command.replaceAll('\\', '/')
}

function isProjectElectronDevCommand(command) {
  const normalized = normalizedCommand(command)
  return (
    normalized.includes(`${projectRoot}/scripts/dev-with-logging.mjs`) ||
    normalized.includes(`${projectRoot}/node_modules/.bin/electron-vite`) ||
    normalized.includes(`${projectRoot}/node_modules/electron-vite/`) ||
    normalized.includes(`${projectRoot}/node_modules/electron/`)
  )
}

function isProjectElectronMainCommand(command) {
  const normalized = normalizedCommand(command)
  return normalized.includes(`${projectRoot}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .`)
}

function isProjectDevRunnerCommand(command) {
  const normalized = normalizedCommand(command)
  return normalized.includes(`${projectRoot}/scripts/dev-unified.mjs`)
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function cleanupPids(label, pids, options = {}) {
  if (pids.length === 0) return
  const signal = options.signal ?? 'SIGTERM'
  const graceMs = options.graceMs ?? 2000
  const quiet = options.quiet ?? false
  if (!quiet) log('dev', `stopping stale ${label}: ${pids.join(', ')}`)
  for (const pid of pids) killPid(pid, signal)
  for (let attempt = 0; attempt < Math.ceil(graceMs / 100); attempt += 1) {
    await wait(100)
    if (pids.every(pid => !processExists(pid))) return
  }
  if (signal === 'SIGKILL') return
  for (const pid of pids) {
    if (processExists(pid)) killPid(pid, 'SIGKILL')
  }
}

async function cleanupPort(port) {
  await cleanupPids(`process on port ${port}`, pidsListeningOn(port))
}

async function cleanupStaleProjectProcesses(options = {}) {
  await cleanupPids(
    'web dev process',
    pidsMatchingCommand(command => {
      const normalized = normalizedCommand(command)
      return normalized.includes('apps/web/vite.config.ts') && normalized.includes('node_modules/.bin/vite')
    }),
    options,
  )
  await cleanupPids(
    'server process',
    pidsMatchingCommand(command => normalizedCommand(command).includes(`${projectRoot}/dist/server/main.js`)
      || normalizedCommand(command).includes('dist/server/main.js')),
    options,
  )
  await cleanupPids(
    'electron dev process',
    pidsMatchingCommand(isProjectElectronDevCommand),
    options,
  )
}

function staleProjectProcessPids() {
  return [
    ...pidsMatchingCommand(isProjectDevRunnerCommand),
    ...pidsMatchingCommand(command => {
      const normalized = normalizedCommand(command)
      return normalized.includes('apps/web/vite.config.ts') && normalized.includes('node_modules/.bin/vite')
    }),
    ...pidsMatchingCommand(command => normalizedCommand(command).includes(`${projectRoot}/dist/server/main.js`)
      || normalizedCommand(command).includes('dist/server/main.js')),
    ...pidsMatchingCommand(isProjectElectronDevCommand),
  ].filter((pid, index, pids) => pids.indexOf(pid) === index)
}

async function cleanupStaleProjectRunners(options = {}) {
  await cleanupPids(
    'dev runner',
    pidsMatchingCommand(isProjectDevRunnerCommand),
    options,
  )
}

async function waitForNoStaleProjectProcesses(timeoutMs = 5000) {
  const attempts = Math.ceil(timeoutMs / 100)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (staleProjectProcessPids().length === 0) return
    await wait(100)
  }
  await cleanupPids('project dev process', staleProjectProcessPids(), {
    signal: 'SIGKILL',
    graceMs: 300,
    quiet: true,
  })
}

async function stopExistingDevProcesses() {
  await cleanupStaleProjectRunners({ graceMs: 5000 })
  await cleanupStaleProjectProcesses({ graceMs: 3500 })
  await cleanupPort(5174)
  await cleanupPort(8787)
  await waitForNoStaleProjectProcesses()
  await wait(300)
}

async function waitForHttp(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Retry until the dev server is ready.
    }
    await wait(250)
  }
  throw new Error(`${label} did not become ready at ${url}`)
}

async function waitForProcess(predicate, label, timeoutMs = 90000) {
  const attempts = Math.ceil(timeoutMs / 250)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pids = pidsMatchingCommand(predicate)
    if (pids.length > 0) return pids
    await wait(250)
  }
  throw new Error(`${label} did not start`)
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  log('dev', 'stopping managed dev processes; child logs muted')
  forwardChildOutput = false
  for (const child of children.values()) {
    killProcessGroup(child, signal)
  }

  void (async () => {
    await wait(1200)
    await cleanupStaleProjectProcesses({ signal: 'SIGTERM', graceMs: 1200, quiet: true })
    await wait(1800)
    for (const child of children.values()) {
      killProcessGroup(child, 'SIGKILL')
    }
    await cleanupStaleProjectProcesses({ signal: 'SIGKILL', graceMs: 300, quiet: true })
    process.exit(code)
  })()
}

async function main() {
  process.on('SIGINT', () => shutdown(0, 'SIGINT'))
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'))

  await stopExistingDevProcesses()

  log('dev', 'preparing web backend')
  runBlocking('server', npmCommand(), ['run', 'rebuild:sqlite:node'], {
    title: 'checking better-sqlite3 for Node',
  })
  runBlocking('server', npmCommand(), ['run', 'server:build'], {
    title: 'building web backend',
  })

  spawnManaged('server', 'node', ['dist/server/main.js'], {
    env: {
      ONETHING_SERVER_HOST: process.env.ONETHING_SERVER_HOST ?? '127.0.0.1',
      ONETHING_SERVER_PORT: process.env.ONETHING_SERVER_PORT ?? '8787',
      ONETHING_CORS_ORIGIN: process.env.ONETHING_CORS_ORIGIN ?? 'http://127.0.0.1:5174',
    },
  })
  await waitForHttp('http://127.0.0.1:8787/api/capabilities', 'web backend')

  log('dev', 'starting web frontend')
  spawnManaged('web', localBin('vite'), ['--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1'])
  await waitForHttp('http://127.0.0.1:5174', 'web frontend')

  if (!skipElectron) {
    log('dev', 'starting Electron')
    spawnManaged('electron', npmCommand(), ['run', 'electron:dev'])
    await waitForProcess(isProjectElectronMainCommand, 'Electron')
  }

  log(
    'dev',
    `ready: ${skipElectron ? '' : 'Electron dev, '}Web http://127.0.0.1:5174, API http://127.0.0.1:8787`,
  )
}

main().catch(error => {
  log('dev', error?.stack || String(error))
  shutdown(1, 'SIGTERM')
})
