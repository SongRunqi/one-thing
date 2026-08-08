/**
 * 边界守卫:renderer 不许 import `@onething/core/plugins` **桶文件**。
 *
 * 实证事故(d83b6ae8 引入、R5.x 期间爆发):platform/electron.ts 从桶里 import
 * `describeNonSerializable`,桶 re-export 的 `loader.ts` 带
 * `import { pathToFileURL } from 'url'` —— Vite 把 node:url externalize 后,
 * 浏览器一求值就抛 "Module url has been externalized for browser compatibility"。
 *
 * 规矩:
 *  - 桶(`@onething/core/plugins`)—— **禁止**;它服务主进程,含 node-only 代码。
 *  - 叶子子路径(`@onething/core/engine/attachment-mime`、
 *    `@onething/core/plugins/request-channel`)—— 允许,先例已有;
 *    但叶子必须零 node 依赖,加叶子前自己掂量。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const RENDERER_ROOT = fileURLToPath(new URL('../..', import.meta.url))

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkSourceFiles(full)
    else if (/\.(ts|vue)$/.test(entry.name)) yield full
  }
}

/** 桶的精确写法:`from '@onething/core/plugins'`(不带子路径、不带尾部引号以外的字符)。 */
const BARREL_IMPORT = /from\s+['"]@onething\/core\/plugins['"]/g

describe('renderer 边界:不吃 core/plugins 桶', () => {
  it('任何 renderer 源文件都不得 import @onething/core/plugins 桶', () => {
    const offenders: string[] = []
    for (const file of walkSourceFiles(RENDERER_ROOT)) {
      const source = fs.readFileSync(file, 'utf-8')
      if (BARREL_IMPORT.test(source)) {
        offenders.push(path.relative(RENDERER_ROOT, file))
      }
    }
    // 发现违规时,报错信息里直接给出正确的叶子写法。
    expect(offenders, `这些文件 import 了 node-only 的桶;请改用叶子子路径(如 @onething/core/plugins/request-channel):\n${offenders.join('\n')}`)
      .toEqual([])
  })
})
