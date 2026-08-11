import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  DEV_SELF_ELECTRON_ENTRY,
  DEV_SELF_OUT_DIR,
  DEV_SELF_PORTS,
  DEV_SELF_RUNNER_FLAG,
  DEV_SELF_USER_DATA_DIR_NAME,
  DEV_SELF_WEB_CACHE_DIR,
  devSelfStorePath,
} from './lib/dev-self.mjs'

// 自举开发的 B 实例入口(`bun run dev:self`)。
//
// 它本身不管进程,只做一件事:把"这是 dev-self 泳道"这件事翻译成一组 env,
// 然后把活交给既有的 dev-unified —— 泳道并行、清扫、TTY 还原、日志滚动都
// 已经在那边写好了,这里不再造第二套。
//
// 隔离的四样(store / 端口 / 日志 / 产物)全部落在 env 上,任何一项都可以
// 在外面用同名 env 覆盖:
//   ONETHING_STORE_PATH      默认 ~/.onething-dev(空 store 是合法起点,
//                            脚本不做任何拷贝 —— 要不要播种由人决定)
//   ONETHING_RENDERER_PORT   5273(electron.vite.config.ts 读它)
//   ONETHING_SERVER_PORT     8887
//   web 前端                 5274(dev-unified 用 --port 传给 vite)
// 日志跟着 store 走:<store>/log/dev.log,不与 ~/.onething/log/dev.log 混写。

const mode = process.argv[2] ?? 'electron'
if (!['all', 'electron', 'web'].includes(mode)) {
  process.stderr.write(`[dev-self] unknown mode "${mode}" (expected: all | electron | web)\n`)
  process.exit(1)
}

const storePath = devSelfStorePath()
const rendererPort = process.env.ONETHING_RENDERER_PORT ?? String(DEV_SELF_PORTS.renderer)
const webPort = process.env.ONETHING_WEB_PORT ?? String(DEV_SELF_PORTS.web)
const serverPort = process.env.ONETHING_SERVER_PORT ?? String(DEV_SELF_PORTS.server)

// store 先建出来:横幅里写的路径必须是真的,dev-with-logging 也要往
// <store>/log 里写第一行。
mkdirSync(path.join(storePath, 'log'), { recursive: true })

const env = {
  ...process.env,
  ONETHING_DEV_SELF: '1',
  ONETHING_STORE_PATH: storePath,
  ONETHING_RENDERER_PORT: rendererPort,
  ONETHING_WEB_PORT: webPort,
  ONETHING_SERVER_PORT: serverPort,
  ONETHING_SERVER_HOST: process.env.ONETHING_SERVER_HOST ?? '127.0.0.1',
  ONETHING_CORS_ORIGIN: process.env.ONETHING_CORS_ORIGIN ?? `http://127.0.0.1:${webPort}`,
  // apps/web 的 /api 代理指向 dev-self 自己的 server。
  ONETHING_API_URL: process.env.ONETHING_API_URL ?? `http://127.0.0.1:${serverPort}`,
  // 两个 vite dev server 共用一份 optimize 缓存会互相作废,给 dev-self 独立一份。
  ONETHING_WEB_CACHE_DIR: process.env.ONETHING_WEB_CACHE_DIR ?? DEV_SELF_WEB_CACHE_DIR,
  // 产物错开:两只 electron-vite dev 同时往 out/ 写同一批文件是竞态。
  ONETHING_ELECTRON_OUT_DIR: process.env.ONETHING_ELECTRON_OUT_DIR ?? DEV_SELF_OUT_DIR,
  ELECTRON_ENTRY: process.env.ELECTRON_ENTRY ?? DEV_SELF_ELECTRON_ENTRY,
  // Chromium profile(localStorage / cookie / cache)也归 dev store,
  // 顺带让 Electron 的 helper 子进程命令行带上 dev-self marker。
  // 注意不能直接写 ELECTRON_CLI_ARGS:electron-vite 的 cli 无条件用
  // `options['--']` 覆盖它(空数组也是真值),env 传的会被清成 []。
  // 只能让 dev-with-logging 把它拼成 `electron-vite dev -- <args>`。
  ONETHING_ELECTRON_ARGS: process.env.ONETHING_ELECTRON_ARGS ?? JSON.stringify([
    `--user-data-dir=${path.join(storePath, DEV_SELF_USER_DATA_DIR_NAME)}`,
  ]),
}

function banner() {
  const lines = [
    'onething dev-self — 自举开发的 B 实例(跑本仓工作树代码)',
    `  mode      ${mode}`,
    `  store     ${storePath}`,
    `  log       ${path.join(storePath, 'log', 'dev.log')}`,
    `  out       ${env.ONETHING_ELECTRON_OUT_DIR}`,
  ]
  if (mode !== 'web') lines.push(`  renderer  http://127.0.0.1:${rendererPort}`)
  if (mode !== 'electron') {
    lines.push(`  web       http://127.0.0.1:${webPort}`)
    lines.push(`  api       http://127.0.0.1:${serverPort}`)
  }
  lines.push('  A 实例(~/.onething,5173/5174/8787,out/)不受影响:两边的清扫互不越界')
  const width = Math.max(...lines.map(line => [...line].length))
  const rule = '─'.repeat(Math.min(width, 78))
  process.stdout.write(`${rule}\n${lines.join('\n')}\n${rule}\n`)
}

banner()

const child = spawn(
  process.execPath,
  [path.join(process.cwd(), 'scripts', 'dev-unified.mjs'), mode, DEV_SELF_RUNNER_FLAG],
  { cwd: process.cwd(), env, stdio: 'inherit' },
)

let forwarding = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (forwarding) return
    forwarding = true
    try {
      child.kill(signal)
    } catch {
      // 子进程已退出。
    }
  })
}

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0)
})
