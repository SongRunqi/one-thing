import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronInteractionIpcHandlers } from '../interaction.js'

describe('electron interaction IPC host', () => {
  it('registers both interaction handlers against the provided IPC host', () => {
    const handle = vi.fn()
    const respond = vi.fn().mockReturnValue({ success: true })
    const getPending = vi.fn().mockReturnValue({ success: true, pending: [] })

    registerElectronInteractionIpcHandlers({
      channels: {
        respond: 'interaction:respond',
        getPending: 'interaction:get-pending',
      },
      respond,
      getPending,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(2)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'interaction:respond',
      'interaction:get-pending',
    ])
  })

  /**
   * C3 纪律的行为版:请求体**整体透传**。这条测试盯的是「有人在这一层顺手解构了
   * 几个字段」—— 那样协议加一格就得来改这个文件,而漏改的症状是后端收到一个
   * 少了字段的请求,却没有任何一处报错。
   */
  it('passes the respond payload through whole (no per-field copying)', () => {
    const handle = vi.fn()
    const respond = vi.fn().mockReturnValue({ success: true })
    const getPending = vi.fn().mockReturnValue({ success: true, pending: [] })

    registerElectronInteractionIpcHandlers({
      channels: { respond: 'interaction:respond', getPending: 'interaction:get-pending' },
      respond,
      getPending,
      ipcMain: { handle },
    })

    const respondListener = handle.mock.calls[0][1] as (event: unknown, request: unknown) => unknown
    const payload = {
      sessionId: 's-1',
      toolCallId: 'call-1',
      answers: { q1: { selected: ['dayjs'], freeText: '体积优先' } },
      // 协议将来加的字段:这里必须原样过去,不需要改这个文件。
      futureField: 'must survive',
    }
    expect(respondListener({}, payload)).toEqual({ success: true })
    expect(respond).toHaveBeenCalledWith(payload)

    const getPendingListener = handle.mock.calls[1][1] as (event: unknown, id: string) => unknown
    expect(getPendingListener({}, 's-1')).toEqual({ success: true, pending: [] })
    expect(getPending).toHaveBeenCalledWith('s-1')
  })
})
