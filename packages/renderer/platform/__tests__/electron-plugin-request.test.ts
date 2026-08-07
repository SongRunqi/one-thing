/**
 * 过线前的 payload 自检(真机走查修复)。
 *
 * R2 的序列化校验只在**插件那一侧**跑。渲染侧发出去之前什么也不查,于是一个
 * 不可克隆的 payload 得到的是 Electron 原生的 "An object could not be cloned" ——
 * 没有 pluginId、没有 action、没有字段路径。插件作者拿着这句话无从下手。
 */
import { describe, expect, it, vi } from 'vitest'
import { createElectronPlatformApi } from '../electron'

function createApi() {
  const pluginRequest = vi.fn(async () => ({ success: true, requestId: 'r1', result: null }))
  const platform = createElectronPlatformApi({ pluginRequest } as never)
  return { platform, pluginRequest }
}

describe('electron platformApi.pluginRequest — payload guard', () => {
  it('forwards a serializable payload untouched', async () => {
    const { platform, pluginRequest } = createApi()
    const request = { pluginId: 'notes', action: 'search', payload: { q: 'x', nested: { n: 1 } } }

    await platform.pluginRequest(request as never)

    expect(pluginRequest).toHaveBeenCalledWith(request)
  })

  it('rejects with our own error — naming the plugin, the action, and the field', async () => {
    const { platform, pluginRequest } = createApi()

    await expect(platform.pluginRequest({
      pluginId: 'notes',
      action: 'panel:action:inbox',
      payload: { actionId: 'go', payload: { onPick: () => {} } },
    } as never)).rejects.toThrow(/notes\/panel:action:inbox.*onPick is a function/s)

    // **只查不修**:边界不该悄悄把不可序列化的东西修好 —— 那会把"有人在往线上
    // 塞它"这件事藏起来。修在源头。
    expect(pluginRequest).not.toHaveBeenCalled()
  })

  it('says "JSON-serializable" so the fix is obvious from the message alone', async () => {
    const { platform } = createApi()
    await expect(platform.pluginRequest({
      pluginId: 'notes',
      action: 'search',
      payload: { when: new Map() },
    } as never)).rejects.toThrow(/JSON-serializable/)
  })
})
