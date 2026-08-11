import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'

import {
  commandBelongsToDevSelf,
  electronMainCommandPrefix,
  isDevSelfLane,
  lanePorts,
  laneServerOutDir,
} from './lib/dev-self.mjs'

const children = new Map()
let shuttingDown = false
let forwardChildOutput = true

const isWindows = process.platform === 'win32'
const skipElectron = process.env.ONETHING_DEV_SKIP_ELECTRON === '1'
const verboseStartup = process.env.ONETHING_DEV_VERBOSE === '1'
const projectRoot = process.cwd().replaceAll('\\', '/')

// 泳道选择:all(默认)| electron | web。
// electron 与 web 两个模式各管各的进程/端口,可以在两个终端并行跑。
const mode = process.argv[2] ?? 'all'
if (!['all', 'electron', 'web'].includes(mode)) {
  process.stderr.write(`[dev] unknown mode "${mode}" (expected: all | electron | web)\n`)
  process.exit(1)
}
const managesElectron = mode !== 'web'
const managesWeb = mode !== 'electron'

// 泳道身份:默认 = 日常那只(A);dev-self(B)由 scripts/dev-self.mjs 用 env 点亮,
// argv 上的 --dev-self 只是给 ps 看的 marker。两条泳道的端口、产物目录、清扫
// 范围全部按这个布尔分叉,定义在 scripts/lib/dev-self.mjs。
const devSelf = isDevSelfLane()
const ports = lanePorts(devSelf)
const serverOutDir = laneServerOutDir(devSelf)

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

// 清扫只在本泳道内进行:A 的 `dev:electron` 不许碰 B 的进程,反之亦然。
// 判据是命令行里的 dev-self marker(见 lib/dev-self.mjs),不是 env ——
// ps 看不到别人的 env。
function belongsToThisLane(command) {
  return commandBelongsToDevSelf(command) === devSelf
}

function isProjectElectronDevCommand(command) {
  const normalized = normalizedCommand(command)
  if (!belongsToThisLane(normalized)) return false
  return (
    normalized.includes(`${projectRoot}/scripts/dev-with-logging.mjs`) ||
    normalized.includes(`${projectRoot}/node_modules/.bin/electron-vite`) ||
    normalized.includes(`${projectRoot}/node_modules/electron-vite/`) ||
    normalized.includes(`${projectRoot}/node_modules/electron/`)
  )
}

function isProjectElectronMainCommand(command) {
  const normalized = normalizedCommand(command)
  return normalized.includes(electronMainCommandPrefix(projectRoot, devSelf))
}

function isProjectDevRunnerCommand(command) {
  const normalized = normalizedCommand(command)
  if (!belongsToThisLane(normalized)) return false
  // 也匹配从项目根目录用相对路径起的 runner(如 `node scripts/dev-unified.mjs web`)。
  const isRunner = normalized.includes(`${projectRoot}/scripts/dev-unified.mjs`)
    || /(^|[\s/])scripts\/dev-unified\.mjs(\s|$)/.test(normalized)
  if (!isRunner) return false
  const otherMode = normalized.match(/scripts\/dev-unified\.mjs(?:\s+(\S+))?/)?.[1] ?? 'all'
  if (otherMode === 'all' || mode === 'all') return true
  return otherMode === mode
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

function isProjectWebDevCommand(command) {
  const normalized = normalizedCommand(command)
  if (!belongsToThisLane(normalized)) return false
  return normalized.includes('apps/web/vite.config.ts') && normalized.includes('node_modules/.bin/vite')
}

function isProjectServerCommand(command) {
  const normalized = normalizedCommand(command)
  if (!belongsToThisLane(normalized)) return false
  return normalized.includes(`${projectRoot}/${serverOutDir}/main.js`)
    || normalized.includes(`${serverOutDir}/main.js`)
}

async function cleanupStaleProjectProcesses(options = {}) {
  if (managesWeb) {
    await cleanupPids('web dev process', pidsMatchingCommand(isProjectWebDevCommand), options)
    await cleanupPids('server process', pidsMatchingCommand(isProjectServerCommand), options)
  }
  if (managesElectron) {
    await cleanupPids(
      'electron dev process',
      pidsMatchingCommand(isProjectElectronDevCommand),
      options,
    )
  }
}

function managedLaneProcessPids() {
  return [
    ...(managesWeb ? pidsMatchingCommand(isProjectWebDevCommand) : []),
    ...(managesWeb ? pidsMatchingCommand(isProjectServerCommand) : []),
    ...(managesElectron ? pidsMatchingCommand(isProjectElectronDevCommand) : []),
  ].filter((pid, index, pids) => pids.indexOf(pid) === index)
}

function staleProjectProcessPids() {
  return [
    ...pidsMatchingCommand(isProjectDevRunnerCommand),
    ...managedLaneProcessPids(),
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
  if (managesWeb) {
    await cleanupPort(ports.web)
    await cleanupPort(ports.server)
  }
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

// 子进程的 stdin 是 inherit(见 spawnManaged),vite 拿到真实 TTY 后会切到
// raw mode + application cursor keys(DECCKM)来接管快捷键。Ctrl+C 时它被直接
// 杀掉,来不及还原,终端就卡在 DECCKM 里——方向键变成 ^[OA 而不是 ^[[A。
// 这里在所有退出路径上主动还原一次。
function restoreTty() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode?.(false)
  } catch {
    // stdin 已关闭/不是 TTY,忽略。
  }
  if (!process.stdout.isTTY) return
  // \u001b[?1l 退出 application cursor keys;\u001b> 退出 keypad 应用模式;
  // \u001b[?25h 把可能被子进程藏起来的光标显示回来。
  try {
    process.stdout.write('\u001b[?1l\u001b>\u001b[?25h')
  } catch {
    // 管道已断,忽略。
  }
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  restoreTty()
  log('dev', 'stopping managed dev processes; child logs muted')
  forwardChildOutput = false
  // 只清扫 shutdown 进场时已存在的泳道进程:之后新出现的属于接管方 runner,
  // 重新扫描会把接管方刚起的子进程一并杀掉(被接管的 runner 曾因此误杀新 vite)。
  const sweepPids = managedLaneProcessPids()
  for (const child of children.values()) {
    killProcessGroup(child, signal)
  }

  void (async () => {
    await wait(1200)
    await cleanupPids('project dev process', sweepPids.filter(processExists), {
      signal: 'SIGTERM',
      graceMs: 1200,
      quiet: true,
    })
    await wait(1800)
    for (const child of children.values()) {
      killProcessGroup(child, 'SIGKILL')
    }
    await cleanupPids('project dev process', sweepPids.filter(processExists), {
      signal: 'SIGKILL',
      graceMs: 300,
      quiet: true,
    })
    process.exit(code)
  })()
}

// better-sqlite3 只在 Node ABI / 包版本变化时才需要 rebuild;
// 无脑 `npm rebuild` 每次要 ~1.3s,且重写 .node 会连带触发 dev 签名重签。
function ensureBetterSqliteNodeAbi() {
  const markerPath = join('node_modules', '.cache', 'onething-sqlite-abi.json')
  const binaryPath = join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  let pkgVersion = ''
  try {
    pkgVersion = JSON.parse(readFileSync(join('node_modules', 'better-sqlite3', 'package.json'), 'utf8')).version
  } catch {
    // 包不存在时走 rebuild 报错路径。
  }
  const expected = {
    nodeVersion: process.version,
    nodeModulesAbi: process.versions.modules,
    pkgVersion,
  }

  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
    if (
      existsSync(binaryPath)
      && marker.nodeVersion === expected.nodeVersion
      && marker.nodeModulesAbi === expected.nodeModulesAbi
      && marker.pkgVersion === expected.pkgVersion
    ) {
      log('server', 'better-sqlite3 matches Node ABI, skipping rebuild')
      return
    }
  } catch {
    // 标记缺失或损坏 → rebuild。
  }

  runBlocking('server', npmCommand(), ['run', 'rebuild:sqlite:node'], {
    title: 'rebuilding better-sqlite3 for Node',
  })
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, JSON.stringify(expected))
}

async function startBackendLane() {
  log('dev', 'preparing web backend')
  ensureBetterSqliteNodeAbi()
  // dev-self 的 server bundle 走独立 outDir:两条泳道往同一个
  // dist/server/main.js 里构建会互相截断,产物路径本身也是进程 marker。
  runBlocking('server', npmCommand(), [
    'run', 'server:build',
    ...(devSelf ? ['--', '--outDir', serverOutDir] : []),
  ], {
    title: 'building web backend',
  })

  spawnManaged('server', 'node', [`${serverOutDir}/main.js`], {
    env: {
      ONETHING_SERVER_HOST: process.env.ONETHING_SERVER_HOST ?? '127.0.0.1',
      ONETHING_SERVER_PORT: process.env.ONETHING_SERVER_PORT ?? String(ports.server),
      ONETHING_CORS_ORIGIN: process.env.ONETHING_CORS_ORIGIN ?? `http://127.0.0.1:${ports.web}`,
    },
  })
  await waitForHttp(`http://127.0.0.1:${ports.server}/api/capabilities`, 'web backend')
}

async function startWebLane() {
  log('dev', 'starting web frontend')
  spawnManaged('web', localBin('vite'), [
    '--config', 'apps/web/vite.config.ts',
    '--host', '127.0.0.1',
    '--port', String(ports.web),
  ])
  await waitForHttp(`http://127.0.0.1:${ports.web}`, 'web frontend')
}

async function startElectronLane() {
  if (skipElectron) return
  log('dev', 'starting Electron')
  spawnManaged('electron', npmCommand(), ['run', 'electron:dev'])
  await waitForProcess(isProjectElectronMainCommand, 'Electron')
}

async function main() {
  process.on('SIGINT', () => shutdown(0, 'SIGINT'))
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'))
  // 兜底:shutdown 之外的退出路径(未捕获异常等)也要还原终端。
  process.on('exit', restoreTty)

  await stopExistingDevProcesses()

  // 三条泳道并行:Electron 不依赖 web 前端;对 server 只有 memory 代理的
  // HTTP 依赖,晚就绪会自动重连。electron/web 先 spawn(子进程即刻在跑),
  // backend 泳道内的同步构建不再垫在 Electron 启动前面。
  const lanes = []
  if (managesElectron) lanes.push(startElectronLane())
  if (managesWeb) lanes.push(startWebLane(), startBackendLane())
  await Promise.all(lanes)

  const readyParts = []
  if (managesElectron && !skipElectron) readyParts.push('Electron dev')
  if (managesWeb) {
    readyParts.push(`Web http://127.0.0.1:${ports.web}`, `API http://127.0.0.1:${ports.server}`)
  }
  log('dev', `ready: ${readyParts.join(', ')}`)
}

main().catch(error => {
  log('dev', error?.stack || String(error))
  shutdown(1, 'SIGTERM')
})
