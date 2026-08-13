/**
 * 「接入目录」的单一读出口。
 *
 * 用户在设置里加一个目录,它同时获得五件套能力:@ 引用 / 搜索 /
 * **直接编辑(免逐次确认)** / SKILL.md 自动发现 / markdown 附件根。
 * 五个接线点散在四个子系统里,但它们必须看见**同一份清单** —— 五处各读一次
 * settings 就是五份判据,迟早在某个归一细节上分家(而其中一处是权限面)。
 *
 * 所以这里是唯一的读点,下面五个接线点全部从这里取:
 *   1. `files/file-search.ts`            @ / 文件选择器根
 *   2. `search/providers.ts`             搜索根
 *   3. `tools/sandbox.ts`                沙箱可写根(权限面)
 *   4. `app/skills/loader.ts`            技能发现根
 *   5. `app/markdown/asset-service.ts`   markdown 附件根
 *
 * 存在性不在这里判:目录可以后挂后建,而且这个函数在 analyze 热路径上被调用
 * (每次 write/edit 审批判定一次),不能每次都去 stat 盘。不存在的目录在各
 * 接线点自然降级 —— 沙箱根永不匹配、技能扫描跳过、搜索列不出东西 —— 都不炸。
 */

import { normalizeConnectedDirectories } from '@shared/defaults/settings.js'
import type { SkillDirectoryConfig } from '@shared/ipc/skills.js'
import { getSettings } from './settings.js'

/** 用户配置的接入目录(绝对路径、去重、已过归一)。默认空数组。 */
export function getConnectedDirectories(): string[] {
  return normalizeConnectedDirectories(getSettings().tools?.connectedDirectories)
}

/**
 * 接入目录投影成技能自定义根。
 *
 * 复用 `listCustomSkillRoots` 那条既有链路,而不是 note-skills 的插件链路:
 * 后者的技能 id 里嵌的是**绝对路径的 sha1**(`plugin:<id>:<hash>:<rel>`),
 * 用户挪一次目录,settings 里所有针对这些技能的启用/绑定覆盖就全成孤儿;
 * 而且它会给每个技能强塞 note 语义的 `<note_skill_context>`。
 * 自定义根这条链的 id 是 `custom:<dirId>:<rel>`,dirId 与路径无关,挪目录 id 不变。
 *
 * dirId 用 `connected:` 前缀 + 路径,和用户在技能页手工加的目录(`dir-<ts>-<rand>`)
 * 天然不撞;而技能设置页读的是 `settings.skills.customDirectories` **原始值**,
 * 不经过这个适配器,所以这些合成根不会漏进那个列表里去。
 */
export function listConnectedSkillRoots(): SkillDirectoryConfig[] {
  return getConnectedDirectories().map(path => ({
    id: `connected:${path}`,
    path,
    label: path,
    agentId: null,
    enabled: true,
  }))
}
