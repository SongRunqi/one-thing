// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTabs } from '../useTabs'
import type { WorkbenchTab } from '@/types/tabs'

describe('useTabs workbench tabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        saveUIState: vi.fn().mockResolvedValue({ success: true }),
      },
    })
  })

  it('reuses one workbench tab for files in the same workspace', () => {
    const tabs = useTabs('session-1')

    const first = tabs.addWorkbenchTab('/repo/src/a.ts', '/repo')
    const second = tabs.addWorkbenchTab('/repo/src/b.ts', '/repo')

    expect(second.id).toBe(first.id)
    expect(tabs.tabs.value.filter(tab => tab.type === 'workbench')).toHaveLength(1)
    expect((tabs.activeTab.value as WorkbenchTab).title).toBe('repo')
    expect((tabs.activeTab.value as WorkbenchTab).activeFilePath).toBe('/repo/src/b.ts')
  })

  it('creates separate workbench tabs for different workspaces', () => {
    const tabs = useTabs('session-1')

    tabs.addWorkbenchTab('/repo-a/src/a.ts', '/repo-a')
    tabs.addWorkbenchTab('/repo-b/src/b.ts', '/repo-b')

    const workbenches = tabs.tabs.value.filter(tab => tab.type === 'workbench') as WorkbenchTab[]
    expect(workbenches.map(tab => tab.title)).toEqual(['repo-a', 'repo-b'])
  })

  it('upgrades legacy file tabs when restoring app state', () => {
    const tabs = useTabs('session-1')

    tabs.restore([
      { type: 'chat', sessionId: 'session-1' },
      { type: 'file', filePath: '/notes/IVA/109 IN.md', title: '109 IN.md' },
    ], 1)

    expect(tabs.activeTab.value.type).toBe('workbench')
    expect((tabs.activeTab.value as WorkbenchTab).workspaceRoot).toBe('/notes/IVA')
    expect((tabs.activeTab.value as WorkbenchTab).title).toBe('IVA')
    expect(tabs.serialize().tabs[1]).toMatchObject({
      type: 'workbench',
      workspaceRoot: '/notes/IVA',
      initialFilePath: '/notes/IVA/109 IN.md',
    })
  })
})
