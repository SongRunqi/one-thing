import { afterEach, describe, expect, it, vi } from 'vitest'
import { ILinkPoller } from '../poller.js'
import type { GetUpdatesResponse } from '../types.js'

const originalFetch = globalThis.fetch

describe('ILinkPoller', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('accepts getupdates responses that omit ret but include cursors', async () => {
    const responseBody = {
      msgs: [],
      sync_buf: 'CAAY4ZiNlvAz',
      get_updates_buf: 'CgkIABjhmI2W8DMSOjlkNGJhM2NjNjUxZEBpbS5ib3Q=',
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200 }))
    stubFetch(fetchMock)

    const poller = new ILinkPoller('bot-token', async () => {}, 'https://ilink.example.test')
    const data = await (poller as unknown as {
      pollOnce(): Promise<GetUpdatesResponse>
    }).pollOnce()

    expect(data).toEqual(responseBody)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ilink.example.test/ilink/bot/getupdates',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bot-token',
          AuthorizationType: 'ilink_bot_token',
        }),
      }),
    )
  })

  it('logs and skips malformed getupdates responses without throwing', async () => {
    const responseBody = {
      msgs: 'not-an-array',
      sync_buf: 'sync-cursor',
      get_updates_buf: 'updates-cursor',
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(fetchMock)

    const poller = new ILinkPoller('bot-token', async () => {}, 'https://ilink.example.test')
    const data = await (poller as unknown as {
      pollOnce(): Promise<GetUpdatesResponse>
    }).pollOnce()

    expect(data).toEqual({
      msgs: [],
      sync_buf: 'sync-cursor',
      get_updates_buf: 'updates-cursor',
    })
    expect(consoleError).toHaveBeenCalledWith('[ILinkPoller] Unexpected getupdates response:', responseBody)
  })
})

function stubFetch(fetchMock: typeof fetch): void {
  Object.defineProperty(globalThis, 'fetch', {
    value: fetchMock,
    writable: true,
    configurable: true,
  })
}
