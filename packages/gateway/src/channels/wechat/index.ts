import type { Channel, InboundMessage, OutboundMessage, TypingMessage } from '../../core/channel.js'
import {
  DEFAULT_ILINK_BASE_URL,
  getQRCode,
  loadAuthState,
  pollQRCodeStatus,
  saveAuthState,
  clearAuthState,
  type WechatAuthState,
  type QRCodeStatusResponse,
} from './ilink/auth.js'
import { ILinkPoller } from './ilink/poller.js'
import { sendText, sendTyping } from './ilink/sender.js'
import type { WeixinMessage } from './ilink/types.js'

interface WechatPollerLike {
  start(): Promise<void>
  stop(): Promise<void>
}

export type WechatAuthEvent =
  | { type: 'saved-auth'; auth: WechatAuthState }
  | { type: 'qr'; qrcode: string; qrUrl: string }
  | { type: 'status'; status: QRCodeStatusResponse['status']; baseUrl: string }
  | { type: 'redirect'; baseUrl: string }
  | { type: 'expired' }
  | { type: 'confirmed'; auth: WechatAuthState }

export interface WechatChannelOptions {
  loadAuthState?: typeof loadAuthState
  saveAuthState?: typeof saveAuthState
  getQRCode?: typeof getQRCode
  pollQRCodeStatus?: typeof pollQRCodeStatus
  createPoller?: (
    auth: WechatAuthState,
    onMessage: (msg: WeixinMessage) => Promise<void>,
  ) => WechatPollerLike
  sendText?: typeof sendText
  sendTyping?: typeof sendTyping
  delay?: (ms: number) => Promise<void>
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
  onAuthEvent?: (event: WechatAuthEvent) => void
}

export class WechatChannel implements Channel {
  readonly id = 'wechat'
  private handler: ((msg: InboundMessage) => Promise<void>) | null = null
  private auth: WechatAuthState | null = null
  private poller: WechatPollerLike | null = null
  private stopped = false

  constructor(private readonly options: WechatChannelOptions = {}) {}

  async start(): Promise<void> {
    this.stopped = false
    this.auth = await this.resolveAuthState()
    this.throwIfStopped()
    const createPoller = this.options.createPoller
      ?? ((auth: WechatAuthState, onMessage: (msg: WeixinMessage) => Promise<void>) =>
        new ILinkPoller(auth.botToken, onMessage, auth.baseUrl))

    this.poller = createPoller(this.auth, async (msg) => {
      if (!msg.from_user_id) return
      const textItem = msg.item_list?.find(item => item.type === 1 && item.text_item?.text)
      if (!textItem?.text_item?.text) return

      await this.handler?.({
        channelId: this.id,
        userId: msg.from_user_id,
        text: textItem.text_item.text,
        raw: msg,
      })
    })
    await this.poller.start()
  }

  async stop(): Promise<void> {
    this.stopped = true
    await this.poller?.stop()
    this.poller = null
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!msg.text.trim()) return

    if (!this.auth) {
      throw new Error('WechatChannel is not started')
    }

    if (!isWeixinMessage(msg.raw)) {
      console.error('[WechatChannel] Cannot send without raw WeixinMessage:', msg.raw)
      return
    }

    await (this.options.sendText ?? sendText)(this.auth, msg.userId, msg.raw.context_token ?? '', msg.text)
  }

  async typing(msg: TypingMessage): Promise<void> {
    await this.trySendTyping(msg)
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler
  }

  private async resolveAuthState(): Promise<WechatAuthState> {
    const load = this.options.loadAuthState ?? loadAuthState
    const save = this.options.saveAuthState ?? saveAuthState
    const fetchQRCode = this.options.getQRCode ?? getQRCode
    const pollStatus = this.options.pollQRCodeStatus ?? pollQRCodeStatus
    const sleep = this.options.delay ?? delay
    const logger = this.options.logger ?? console
    const saved = await load()
    if (saved) {
      this.emitAuthEvent({ type: 'saved-auth', auth: saved })
      return saved
    }

    while (true) {
      this.throwIfStopped()
      let pollingBaseUrl = DEFAULT_ILINK_BASE_URL
      const qr = await fetchQRCode()
      this.emitAuthEvent({ type: 'qr', qrcode: qr.qrcode, qrUrl: qr.qrcode_img_content })
      logger.log('[WechatChannel] Scan this QR URL to login:')
      logger.log(qr.qrcode_img_content)

      while (true) {
        await sleep(2_000)
        this.throwIfStopped()
        const status = await pollStatus(qr.qrcode, pollingBaseUrl)
        this.emitAuthEvent({ type: 'status', status: status.status, baseUrl: pollingBaseUrl })

        if (status.status === 'confirmed' && status.bot_token) {
          const authState: WechatAuthState = {
            botToken: status.bot_token,
            baseUrl: status.baseurl || pollingBaseUrl || DEFAULT_ILINK_BASE_URL,
            ilinkUserId: status.ilink_user_id,
            ilinkBotId: status.ilink_bot_id,
          }
          await save(authState)
          this.emitAuthEvent({ type: 'confirmed', auth: authState })
          return authState
        }

        if (status.status === 'confirmed' && !status.bot_token) {
          throw new Error('WeChat login confirmed, but iLink did not return a bot token.')
        }

        if (status.status === 'expired') {
          logger.warn('[WechatChannel] QR code expired, requesting a new one')
          this.emitAuthEvent({ type: 'expired' })
          break
        }

        if (status.status === 'scaned_but_redirect') {
          const redirectBaseUrl = normalizeRedirectBaseUrl(status.redirect_host)
          if (redirectBaseUrl) {
            pollingBaseUrl = redirectBaseUrl
            logger.log(`[WechatChannel] QR login redirected to ${redirectBaseUrl}`)
            this.emitAuthEvent({ type: 'redirect', baseUrl: redirectBaseUrl })
          } else {
            logger.warn('[WechatChannel] QR login requested redirect without redirect_host')
          }
          continue
        }

        if (status.status === 'binded_redirect') {
          if (status.bot_token) {
            const authState: WechatAuthState = {
              botToken: status.bot_token,
              baseUrl: status.baseurl || pollingBaseUrl || DEFAULT_ILINK_BASE_URL,
              ilinkUserId: status.ilink_user_id,
            ilinkBotId: status.ilink_bot_id,
          }
          await save(authState)
          this.emitAuthEvent({ type: 'confirmed', auth: authState })
          return authState
        }
          throw new Error('WeChat reports this bot is already bound, but no local iLink bot token is available.')
        }

        if (status.status === 'need_verifycode') {
          throw new Error('WeChat QR login requires pair-code verification, which the onething gateway does not support yet.')
        }

        if (status.status === 'verify_code_blocked') {
          logger.warn('[WechatChannel] WeChat pair-code verification is blocked, requesting a new QR code')
          break
        }
      }
    }
  }

  private async trySendTyping(msg: TypingMessage): Promise<void> {
    if (!this.auth || !isWeixinMessage(msg.raw)) return
    await (this.options.sendTyping ?? sendTyping)(
      this.auth,
      msg.userId,
      msg.raw.context_token,
      msg.status === 'cancel' ? 2 : 1,
    )
  }

  private emitAuthEvent(event: WechatAuthEvent): void {
    this.options.onAuthEvent?.(event)
  }

  private throwIfStopped(): void {
    if (this.stopped) {
      throw new Error('WechatChannel stopped')
    }
  }
}

export { clearAuthState }

function isWeixinMessage(value: unknown): value is WeixinMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Partial<WeixinMessage>
  return typeof msg.from_user_id === 'string'
    && Array.isArray(msg.item_list)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeRedirectBaseUrl(redirectHost: string | undefined): string | undefined {
  const trimmed = redirectHost?.trim()
  if (!trimmed) return undefined
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(withoutTrailingSlash)) return withoutTrailingSlash
  return `https://${withoutTrailingSlash.replace(/^\/+/, '')}`
}
