// @vitest-environment happy-dom
/**
 * 「我的资料」在渲染侧的两条纯规则(docs/design/agent-dm-user.md §2.4)。
 *
 * 需要 DOM 环境不是因为规则本身用得上它:同模块的 `useUserProfile` 静态引了
 * 设置 store,而那颗 store 在模块求值期就读 `document` 上的主题属性。
 *
 * 缺省链与 app 层刻意不同的那一处(自称是「我」而不是「用户」)就靠这里钉住。
 */
import { describe, expect, it } from 'vitest'
import {
  USER_SELF_LABEL,
  collabUserMentionLabels,
  isCollabUserAuthorLabel,
} from '../useUserProfile'

describe('@ 能点亮用户的写法', () => {
  it('空资料时只剩两个常量词', () => {
    expect(collabUserMentionLabels({})).toEqual(['用户', '我'])
  })

  it('名字与句柄补进来,常量词永远在列', () => {
    expect(collabUserMentionLabels({ configuredName: '一天', handle: 'yitian' }))
      .toEqual(['用户', '我', '一天', 'yitian'])
  })

  it('名字与常量词重合时去重', () => {
    expect(collabUserMentionLabels({ configuredName: '我', handle: 'user' }))
      .toEqual(['用户', '我', 'user'])
  })
})

describe('引用快照的作者是不是用户本人', () => {
  it('旧数据署「用户」、新数据署名字,都算同一个人', () => {
    expect(isCollabUserAuthorLabel('用户', { configuredName: '一天' })).toBe(true)
    expect(isCollabUserAuthorLabel('一天', { configuredName: '一天' })).toBe(true)
    expect(isCollabUserAuthorLabel(USER_SELF_LABEL, {})).toBe(true)
  })

  it('同事的名字不算', () => {
    expect(isCollabUserAuthorLabel('小李', { configuredName: '一天' })).toBe(false)
  })

  it('空署名不算(没有作者可认)', () => {
    expect(isCollabUserAuthorLabel('  ', { configuredName: '一天' })).toBe(false)
    expect(isCollabUserAuthorLabel(undefined, {})).toBe(false)
  })

  it('没配名字时,任何名字都不该被当成"我"', () => {
    expect(isCollabUserAuthorLabel('一天', {})).toBe(false)
  })
})
