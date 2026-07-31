import { describe, expect, it } from 'vitest'
import {
  HISTORY_AUTO_LOAD_THRESHOLD_RATIO,
  getAutoLoadThreshold,
  shouldAutoLoadNewer,
  shouldAutoLoadOlder,
} from '../useHistoryPagination'

/**
 * 历史分页的阈值(从 `MessageList.vue` 抬出,行为逐字不变)。
 *
 * 房面与旧壳共用这一份 —— 补页时机一旦分叉,两个面的翻页手感就会开始不一样,
 * 而没有人会去比。
 */
describe('自动补页阈值', () => {
  it('按可视高度缩放,不要求贴死顶边', () => {
    expect(HISTORY_AUTO_LOAD_THRESHOLD_RATIO).toBe(1.75)
    expect(getAutoLoadThreshold({ clientHeight: 800 })).toBe(1400)
  })

  it('向上:进了阈值且还有更早的页才补', () => {
    const state = { hasMoreBefore: true }
    expect(shouldAutoLoadOlder({ scrollTop: 1400, scrollHeight: 9000, clientHeight: 800 }, state)).toBe(true)
    expect(shouldAutoLoadOlder({ scrollTop: 1401, scrollHeight: 9000, clientHeight: 800 }, state)).toBe(false)
    expect(shouldAutoLoadOlder({ scrollTop: 0, scrollHeight: 9000, clientHeight: 800 }, { hasMoreBefore: false })).toBe(false)
    expect(shouldAutoLoadOlder({ scrollTop: 0, scrollHeight: 9000, clientHeight: 800 }, undefined)).toBe(false)
  })

  it('正在读就不重入(isLoadingOlder 同时守两个方向)', () => {
    const geometry = { scrollTop: 0, scrollHeight: 9000, clientHeight: 800 }
    expect(shouldAutoLoadOlder(geometry, { hasMoreBefore: true, isLoadingOlder: true })).toBe(false)
    expect(shouldAutoLoadNewer(
      { scrollTop: 8200, scrollHeight: 9000, clientHeight: 800 },
      { hasMoreAfter: true, isLoadingOlder: true },
    )).toBe(false)
  })

  it('向下:离底部进了阈值且还有更新的页才补', () => {
    const state = { hasMoreAfter: true }
    // distanceToBottom = 9000 - 6800 - 800 = 1400
    expect(shouldAutoLoadNewer({ scrollTop: 6800, scrollHeight: 9000, clientHeight: 800 }, state)).toBe(true)
    expect(shouldAutoLoadNewer({ scrollTop: 6799, scrollHeight: 9000, clientHeight: 800 }, state)).toBe(false)
    expect(shouldAutoLoadNewer({ scrollTop: 8200, scrollHeight: 9000, clientHeight: 800 }, { hasMoreAfter: false })).toBe(false)
  })
})
