#!/usr/bin/env node
// electron-builder 包装器 —— 强制走 npm 的依赖树采集器，并在打包前校验闭包完整性。
//
// 背景（2026-07-29，asar 里缺 fast-deep-equal 导致装完打不开）：
// electron-builder 26.x 的 detectPackageManager 只在"恰好一个锁文件"时按文件判定；
// 本仓库 bun.lock 与 package-lock.json 并存，于是退到环境变量判定，而 `bun run build:mac`
// 会把 npm_config_user_agent=bun.../npm_execpath=.../bun 带进来 → 选中 BunNodeModulesCollector。
// 那个 collector 覆写的 isProdDependency 用 tree.dependencies 而不是 tree._dependencies，
// npm 树里的"重复依赖"节点 dependencies 恰恰是空的 → 它的整棵子依赖被过滤掉。
// 实测：npm collector 收 304 个包（与真实 prod 闭包一致），bun collector 只收 239 个，
// 少掉 95 个（fast-deep-equal / fast-uri / express / body-parser / jose / orderedmap …）。
//
// 这里做两件事：
//   1. 抹掉 npm_config_user_agent / npm_execpath，让 electron-builder 回落到 npm 采集器；
//   2. 预检：用 electron-builder 自己的 collector 跑一遍，和按 node 解析算出的真实 prod
//      闭包对比，缺任何一个就直接失败——不再让残缺的 asar 流到用户手里。
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))

/** 按 node 的解析规则，从 package.json 的 dependencies/optionalDependencies 算出真实 prod 闭包。 */
function groundTruthClosure() {
  const readPkg = (dir) => {
    try {
      return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    } catch {
      return null
    }
  }
  const resolveDir = (fromDir, name) => {
    let cur = fromDir
    while (cur.startsWith(ROOT)) {
      const cand = path.join(cur, 'node_modules', name)
      if (existsSync(path.join(cand, 'package.json'))) return realpathSync(cand)
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
    return null
  }
  const seen = new Set()
  const closure = new Set()
  const walk = (dir) => {
    const real = realpathSync(dir)
    if (seen.has(real)) return
    seen.add(real)
    const pkg = readPkg(real)
    if (!pkg) return
    if (real !== ROOT) closure.add(`${pkg.name}@${pkg.version}`)
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      // 解析不到的多半是别平台的 optional 原生包（sherpa-onnx-linux-* 之类），跳过。
      const d = resolveDir(real, name)
      if (d) walk(d)
    }
  }
  walk(ROOT)
  return closure
}

async function preflight() {
  const nmc = require('app-builder-lib/out/node-module-collector/index.js')
  const { TmpDir } = require('builder-util')
  const { CancellationToken } = require('builder-util-runtime')

  const env = await nmc.determinePackageManagerEnv({ projectDir: ROOT, appDir: ROOT }).value
  if (env.pm !== 'npm') {
    throw new Error(
      `[preflight] electron-builder 选中了 "${env.pm}" 依赖采集器，本仓库只有 npm 采集器能收全依赖。\n` +
        `           检查 package.json 的 packageManager 字段、锁文件组合，以及 npm_config_user_agent/npm_execpath。`,
    )
  }

  const collector = nmc.getCollectorByPackageManager(env.pm, ROOT, new TmpDir('preflight'))
  const mods = await collector.getNodeModules({
    cancellationToken: new CancellationToken(),
    packageName: require('./package.json').name,
  })
  const collected = new Set()
  const walk = (list) => {
    for (const m of list) {
      collected.add(`${m.name}@${m.version}`)
      if (m.dependencies) walk(m.dependencies)
    }
  }
  walk(mods)

  const missing = [...groundTruthClosure()].filter((id) => !collected.has(id)).sort()
  if (missing.length > 0) {
    throw new Error(
      `[preflight] 依赖采集缺 ${missing.length} 个生产依赖，打出来的 asar 会在运行时报 Cannot find module：\n` +
        missing.map((m) => `           - ${m}`).join('\n'),
    )
  }
  console.log(`[preflight] 依赖采集完整：${collected.size} 个包（采集器 = ${env.pm}）`)
}

// 抹掉包管理器指纹，让 electron-builder 走 npm 采集器。
delete process.env.npm_config_user_agent
delete process.env.npm_execpath

try {
  await preflight()
} catch (error) {
  console.error(String(error.message ?? error))
  process.exit(1)
}

const cli = require.resolve('electron-builder/cli.js')
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
child.on('error', (error) => {
  console.error(`electron-builder 启动失败: ${error.message}`)
  process.exit(1)
})
