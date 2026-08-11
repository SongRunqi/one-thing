import { createGrepTool } from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'
import { Ripgrep } from '../../utils/ripgrep.js'

/**
 * 内容检索(2026-08-11 止血 4,`docs/audit/self-hosting-gap-audit-2026-08-11.md`
 * 「三疑点」之一)。
 *
 * 实现一直是完整的,但只在 apps/server 的只读档注册过 —— 桌面端等于没有 Grep,
 * 「找出所有引用点」于是退化成 `bash rg` 再吃一次 30KB 截断。这里给它接上与
 * `find.ts` 同一个 ripgrep 适配器(同一个二进制、同一份 .gitignore 语义),差别
 * 只在 find 找**文件名**、grep 找**文件内容**。
 */
export const GrepTool = createGrepTool({
  search: options => Ripgrep.search(options),
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
})
