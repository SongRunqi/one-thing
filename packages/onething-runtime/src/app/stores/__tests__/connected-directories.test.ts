import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
}))

vi.mock('../settings.js', () => ({
  getSettings: () => mocks.settings,
}))

import {
  getConnectedDirectories,
  listConnectedSkillRoots,
} from '../connected-directories.js'

function withConnectedDirectories(dirs: unknown): void {
  mocks.settings = { tools: { connectedDirectories: dirs } }
}

describe('接入目录 —— 五个接线点共用的单一读出口', () => {
  beforeEach(() => {
    mocks.settings = {}
  })

  describe('getConnectedDirectories', () => {
    it('未配置时是空数组(五件套全部回落到今天的行为)', () => {
      expect(getConnectedDirectories()).toEqual([])

      mocks.settings = { tools: {} }
      expect(getConnectedDirectories()).toEqual([])
    })

    it('读出用户配置的绝对路径,去重后保序', () => {
      withConnectedDirectories(['/Users/me/vault', '/Users/me/work', '/Users/me/vault'])
      expect(getConnectedDirectories()).toEqual(['/Users/me/vault', '/Users/me/work'])
    })

    it('脏值不炸也不流出:非数组、非字符串、空白、相对路径都被挡掉', () => {
      withConnectedDirectories('not-an-array')
      expect(getConnectedDirectories()).toEqual([])

      withConnectedDirectories([null, 7, '', '   ', 'relative/dir', '/Users/me/vault'])
      expect(getConnectedDirectories()).toEqual(['/Users/me/vault'])
    })
  })

  describe('listConnectedSkillRoots —— 复用自定义技能根这条既有链路', () => {
    it('空列表时不产生任何技能根', () => {
      expect(listConnectedSkillRoots()).toEqual([])
    })

    it('每个接入目录投影成一个启用的自定义根', () => {
      withConnectedDirectories(['/Users/me/vault'])

      expect(listConnectedSkillRoots()).toEqual([
        {
          id: 'connected:/Users/me/vault',
          path: '/Users/me/vault',
          label: '/Users/me/vault',
          agentId: null,
          enabled: true,
        },
      ])
    })

    /**
     * id 与路径解耦是这条复用决策的核心收益:技能 id 形如
     * `custom:<dirId>:<相对路径>`,dirId 稳定,用户挪动目录时 settings 里针对
     * 这些技能的启用/绑定覆盖不会变成孤儿。(note-skills 那条链把绝对路径的
     * sha1 编进 id,正是这里要避开的。)
     */
    it('dirId 带 connected: 前缀,与技能页手工加的 dir-<ts>-<rand> 不会相撞', () => {
      withConnectedDirectories(['/Users/me/vault', '/Users/me/work'])

      const ids = listConnectedSkillRoots().map(root => root.id)
      expect(ids).toEqual(['connected:/Users/me/vault', 'connected:/Users/me/work'])
      expect(ids.every(id => id.startsWith('connected:'))).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })
})
