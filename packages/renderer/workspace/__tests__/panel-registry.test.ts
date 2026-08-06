/**
 * 面板注册表 —— 收编手抄清单之后,这里是那份清单唯一的守卫。
 *
 * 断言的重点不是"内容对不对",而是**别处不许再抄一份**:三个消费方
 * (App.vue / Sidebar.vue / MediaPanel.vue)都必须从这里派生。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  BUILTIN_WORKSPACE_PANELS,
  OPENABLE_WORKSPACE_PANEL_IDS,
  WORKSPACE_MENU_PANELS,
  WORKSPACE_NAV_PANELS,
  findWorkspacePanel,
  isOpenableWorkspacePanelId,
  isWorkspacePanelId,
  workspacePanelWindowEvent,
  type OpenableWorkspacePanelId,
  type WorkspacePanelId,
} from '../panel-registry'

// 相对本文件定位,不是相对 cwd:vitest 从仓库根跑是约定而不是保证,
// 换个工作目录这些读文件的断言会变成一片 ENOENT,而不是一条清晰的失败。
const RENDERER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readRendererFile(relativePath: string): string {
  return readFileSync(join(RENDERER_ROOT, relativePath), 'utf-8')
}

const CONSUMERS = ['App.vue', 'components/sidebar/Sidebar.vue', 'components/MediaPanel.vue'] as const

describe('workspace panel registry', () => {
  it('keeps the panels the shell had before the refactor, in the same order', () => {
    expect(BUILTIN_WORKSPACE_PANELS.map(panel => panel.id)).toEqual([
      'media', 'agents', 'tasks', 'music', 'practice', 'archive',
    ])
  })

  it('reproduces the sidebar menu exactly as it was (practice is still absent)', () => {
    // 重构是零行为变化的:practice 至今不在侧栏菜单里是**既有缺陷**
    // (设计文档 §2 勘误表 P2 行),注册表如实记录它,补入口是另一件事。
    expect(WORKSPACE_MENU_PANELS.map(panel => panel.id)).toEqual(['media', 'agents', 'tasks', 'music'])
  })

  it('reproduces the panel nav exactly as it was (archive included)', () => {
    expect(WORKSPACE_NAV_PANELS.map(panel => panel.id)).toEqual([
      'media', 'agents', 'tasks', 'music', 'practice', 'archive',
    ])
  })

  it('treats archive as nav-only — it was never an openable workspace panel', () => {
    expect(OPENABLE_WORKSPACE_PANEL_IDS).toEqual(['media', 'agents', 'tasks', 'music', 'practice'])
    expect(isWorkspacePanelId('archive')).toBe(true)
    expect(isOpenableWorkspacePanelId('archive')).toBe(false)
    expect(isOpenableWorkspacePanelId('memory')).toBe(false)
  })

  it('derives the openable id type from the flag instead of re-listing the exception', () => {
    // 手写 `Exclude<WorkspacePanelId, 'archive'>` 会在单一事实源内部再抄一份
    // 特例:再加一个 openable:false 的面板,运行时清单认得它、类型不认得。
    expectTypeOf<OpenableWorkspacePanelId>().toEqualTypeOf<'media' | 'agents' | 'tasks' | 'music' | 'practice'>()
    expectTypeOf<OpenableWorkspacePanelId>().toExtend<WorkspacePanelId>()
    // 运行时清单与类型必须是同一份事实。
    expectTypeOf(OPENABLE_WORKSPACE_PANEL_IDS[0]).toEqualTypeOf<OpenableWorkspacePanelId>()
  })

  it('records the window-event entries for the panels that have them', () => {
    // 三条 window 事件都与**发射端**交叉验证 —— 注册表记的是别人拥有的名字,
    // 抄错了它自己是不会知道的。
    const agentsStore = readRendererFile('stores/agents.ts')
    expect(agentsStore).toContain(`AGENT_OPEN_WORKSPACE_EVENT = '${workspacePanelWindowEvent('agents')}'`)

    const practiceStrip = readRendererFile('components/chat/PracticeStrip.vue')
    expect(practiceStrip).toContain(`new CustomEvent('${workspacePanelWindowEvent('practice')}')`)

    const webPlatform = readRendererFile('platform/web.ts')
    expect(webPlatform).toContain(`TODO_PLAN_WEB_WINDOW_EVENT = "${workspacePanelWindowEvent('tasks')}"`)

    expect(() => workspacePanelWindowEvent('media')).toThrow()
  })

  it('gives every panel a label and an icon so no consumer has to invent one', () => {
    for (const panel of BUILTIN_WORKSPACE_PANELS) {
      expect(panel.label, panel.id).toBeTruthy()
      expect(panel.icon, panel.id).toBeTruthy()
      expect(findWorkspacePanel(panel.id)).toBe(panel)
    }
  })

  it('leaves no hand-written panel list behind in the three consumers', () => {
    for (const relativePath of CONSUMERS) {
      const source = readRendererFile(relativePath)

      // 形态一:类型联合 `'media' | 'agents' | …`。
      // 不写死顺序也不写死引号 —— 本次收编的漂移里就有换序和 archive 多一项,
      // 只认一种写法的正则抓不住下一次。
      expect(source, `${relativePath}: hand-written panel union`)
        .not.toMatch(/["']media["']\s*\|\s*["']agents["']|["']agents["']\s*\|\s*["']media["']/)

      // 形态二:数组字面量 `['media', 'agents', …]`。
      // navItems / workspaceActions 的漂移(practice 漏掉、archive 多出)正是
      // 这个形态 —— 上一版守卫只查联合,恰好放过了它。
      expect(source, `${relativePath}: hand-written panel array`)
        .not.toMatch(/\[\s*["']media["']\s*,\s*["']agents["']|\[\s*["']agents["']\s*,\s*["']media["']/)

      expect(source, `${relativePath}: must derive from the registry`)
        .toContain("from '@/workspace/panel-registry'")
    }

    // 死成员 'memory' 曾在 Sidebar 的 props 联合里存活了很久。
    expect(readRendererFile('components/sidebar/Sidebar.vue')).not.toContain("'memory' | 'media'")
  })
})
