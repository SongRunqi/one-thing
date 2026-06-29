import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ILINK_BASE_URL, type WechatAuthState } from '../ilink/auth.js'
import { WechatChannel } from '../index.js'
import type { WeixinMessage } from '../ilink/types.js'

describe('WechatChannel', () => {
  it('follows QR login IDC redirects and saves the redirected base URL', async () => {
    const savedStates: WechatAuthState[] = []
    const pollQRCodeStatus = vi.fn()
      .mockResolvedValueOnce({
        status: 'scaned_but_redirect',
        redirect_host: 'redirect.weixin.qq.com',
      })
      .mockResolvedValueOnce({
        status: 'confirmed',
        bot_token: 'bot-token',
        ilink_user_id: 'user-id',
        ilink_bot_id: 'bot-id',
      })

    const channel = new WechatChannel({
      loadAuthState: vi.fn(async () => null),
      saveAuthState: vi.fn(async state => {
        savedStates.push(state)
      }),
      getQRCode: vi.fn(async () => ({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/mock',
      })),
      pollQRCodeStatus,
      delay: vi.fn(async () => {}),
      logger: silentLogger(),
    })

    const auth = await (channel as unknown as {
      resolveAuthState(): Promise<WechatAuthState>
    }).resolveAuthState()

    expect(auth).toEqual({
      botToken: 'bot-token',
      baseUrl: 'https://redirect.weixin.qq.com',
      ilinkUserId: 'user-id',
      ilinkBotId: 'bot-id',
    })
    expect(savedStates).toEqual([auth])
    expect(pollQRCodeStatus).toHaveBeenNthCalledWith(1, 'qr-token', DEFAULT_ILINK_BASE_URL)
    expect(pollQRCodeStatus).toHaveBeenNthCalledWith(2, 'qr-token', 'https://redirect.weixin.qq.com')
  })

  it('fails QR login with a clear message when pair-code verification is required', async () => {
    const channel = new WechatChannel({
      loadAuthState: vi.fn(async () => null),
      saveAuthState: vi.fn(),
      getQRCode: vi.fn(async () => ({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/mock',
      })),
      pollQRCodeStatus: vi.fn(async () => ({ status: 'need_verifycode' })),
      delay: vi.fn(async () => {}),
      logger: silentLogger(),
    })

    await expect((channel as unknown as {
      resolveAuthState(): Promise<WechatAuthState>
    }).resolveAuthState()).rejects.toThrow('pair-code verification')
  })

  it('starts the poller with the saved auth base URL and maps inbound text messages', async () => {
    let inboundHandler: ((msg: WeixinMessage) => Promise<void>) | undefined
    const start = vi.fn(async () => {})
    const channel = new WechatChannel({
      loadAuthState: vi.fn(async () => ({
        botToken: 'saved-token',
        baseUrl: 'https://saved.weixin.example',
      })),
      createPoller: vi.fn((auth, onMessage) => {
        expect(auth).toMatchObject({
          botToken: 'saved-token',
          baseUrl: 'https://saved.weixin.example',
        })
        inboundHandler = onMessage
        return {
          start,
          stop: vi.fn(async () => {}),
        }
      }),
      logger: silentLogger(),
    })
    const onMessage = vi.fn(async () => {})
    channel.onMessage(onMessage)

    await channel.start()
    await inboundHandler?.({
      from_user_id: 'wechat-user',
      context_token: 'context-token',
      item_list: [{ type: 1, text_item: { text: 'hello' } }],
    })

    expect(start).toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith({
      channelId: 'wechat',
      userId: 'wechat-user',
      text: 'hello',
      raw: expect.objectContaining({
        from_user_id: 'wechat-user',
        context_token: 'context-token',
      }),
    })
  })
})

function silentLogger(): Pick<Console, 'log' | 'warn' | 'error'> {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}
