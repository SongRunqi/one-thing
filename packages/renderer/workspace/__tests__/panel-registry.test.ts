/**
 * 面板注册表 —— 收编手抄清单之后,这里是那份清单唯一的守卫。
 *
 * 断言的重点不是"内容对不对",而是**别处不许再抄一份**:三个消费方
 * (App.vue / Sidebar.vue / MediaPanel.vue)都必须从这里派生。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_WORKSPACE_PANELS,
  OPENABLE_WORKSPACE_PANEL_IDS,
  WORKSPACE_MENU_PANELS,
  WORKSPACE_NAV_PANELS,
  findWorkspacePanel,
  isOpenableWorkspacePanelId,
  isWorkspacePanelId,
  workspacePanelWindowEvent,
} from '../panel-registry'

function readRendererFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), 'packages/renderer', relativePath), 'utf-8')
}

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

  it('records the window-event entries for the panels that have them', () => {
    expect(workspacePanelWindowEvent('tasks')).toBe('todo-plan:web-window-action')
    expect(workspacePanelWindowEvent('practice')).toBe('practice:open-workspace')
    // 事实源在 stores/agents.ts —— 注册表记录的名字必须与它一致。
    const agentsStore = readRendererFile('stores/agents.ts')
    expect(agentsStore).toContain(`AGENT_OPEN_WORKSPACE_EVENT = '${workspacePanelWindowEvent('agents')}'`)
    expect(() => workspacePanelWindowEvent('media')).toThrow()
  })

  it('gives every panel a label and an icon so no consumer has to invent one', () => {
    for (const panel of BUILTIN_WORKSPACE_PANELS) {
      expect(panel.label, panel.id).toBeTruthy()
      expect(panel.icon, panel.id).toBeTruthy()
      expect(findWorkspacePanel(panel.id)).toBe(panel)
    }
  })

  it('leaves no hand-written panel union behind in the three consumers', () => {
    const app = readRendererFile('App.vue')
    const sidebar = readRendererFile('components/sidebar/Sidebar.vue')
    const mediaPanel = readRendererFile('components/MediaPanel.vue')

    for (const [name, source] of [['App.vue', app], ['Sidebar.vue', sidebar], ['MediaPanel.vue', mediaPanel]] as const) {
      // 手抄的联合长这样:`'media' | 'agents' | …`。留一处就会再次漂移。
      expect(source, name).not.toMatch(/'media'\s*\|\s*'agents'/)
      expect(source, name).toContain("from '@/workspace/panel-registry'")
    }
    // 死成员 'memory' 曾在 Sidebar 的 props 联合里存活了很久。
    expect(sidebar).not.toContain("'memory' | 'media'")
  })
})
