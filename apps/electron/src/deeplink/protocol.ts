/**
 * `onething://` 的**协议口**(H4,Electron 宿主)。
 *
 * 只做两件事,一件都不多:把 scheme 登记给系统,把到来的 URL 交出去。解析、
 * 确认卡、派发全在别处 —— 这个文件里没有一行知道 `ask` 是什么。
 *
 * **冷启动时序是这里唯一的难点。** macOS 上,如果 app 没在跑,点一条深链会
 * 先拉起进程,`open-url` 可能在 `app.on('ready')` **之前**就到;就算等到了
 * ready,窗口还没建、renderer 还没挂上确认卡的监听 —— 这时候投递等于把那条链
 * 丢进虚空。所以这里有一个队列,而**放行的信号来自渲染层自己**
 * (`markElectronDeepLinkReady`,由 `deeplink:ready` 触发),不是主进程猜的
 * "窗口大概建好了"。猜的那一版会在慢机器上偶发丢链,而偶发丢链是最难报的 bug。
 *
 * 队列有上限:外部世界可以在 app 还没起来的时候连点二十条链接,全部排队等于
 * 让用户开机看到二十张卡。超出上限丢**最旧**的那些(最新的意图才是他要的)。
 */
import { app as electronApp } from 'electron'
import { ONETHING_DEEPLINK_SCHEME } from '@onething/core/plugins/deep-link'

/** 冷启动队列上限。超出丢最旧 —— 用户最后点的那条才是他要的。 */
export const DEEPLINK_COLD_START_QUEUE_MAX = 5

export interface ElectronDeepLinkAppLike {
  setAsDefaultProtocolClient(scheme: string, execPath?: string, args?: string[]): boolean
  on(event: 'open-url', listener: (event: { preventDefault(): void }, url: string) => void): unknown
}

export interface ElectronDeepLinkProtocolOptions {
  /** URL 的投递口。只在"渲染层说自己准备好了"之后才会被调用。 */
  deliver(url: string): void
  app?: ElectronDeepLinkAppLike
  logger?: Pick<Console, 'log' | 'warn'>
}

interface ProtocolState {
  deliver(url: string): void
  logger: Pick<Console, 'log' | 'warn'>
}

let state: ProtocolState | null = null
let ready = false
const pending: string[] = []

/**
 * 登记 scheme + 接上 `open-url`。
 *
 * **必须在同步段调用**(app ready 之前):`open-url` 的第一次触发可能就在 ready
 * 之前,监听挂晚了那条链就没人接。与 `registerElectronPluginProtocolScheme`
 * 同一条理由,同一个位置。
 */
export function registerElectronDeepLinkProtocol(options: ElectronDeepLinkProtocolOptions): void {
  const app = options.app ?? (electronApp as unknown as ElectronDeepLinkAppLike)
  const logger = options.logger ?? console
  state = { deliver: options.deliver, logger }

  try {
    // 开发态(未打包)下 Electron 跑的是 node_modules/.bin/electron,系统要认的是
    // 那个可执行文件 + 项目路径。打包之后一个参数都不用给。
    const registered = process.defaultApp && process.argv.length >= 2
      ? app.setAsDefaultProtocolClient(ONETHING_DEEPLINK_SCHEME, process.execPath, [process.argv[1]])
      : app.setAsDefaultProtocolClient(ONETHING_DEEPLINK_SCHEME)
    logger.log(`[DeepLink] ${ONETHING_DEEPLINK_SCHEME}:// registered: ${registered}`)
  } catch (error) {
    // 注册失败不是致命的:应用照常跑,只是外面点链接不会回到这里。
    logger.warn(`[DeepLink] Failed to register ${ONETHING_DEEPLINK_SCHEME}://: ${String(error)}`)
  }

  app.on('open-url', (event, url) => {
    // preventDefault 是 macOS 的要求:不拦住,系统会认为没人处理。
    event.preventDefault()
    enqueueDeepLink(url)
  })
}

/**
 * 收下一条 URL:能投就投,不能投就排队。
 *
 * 导出它是为了让**别的入口**(将来的 Windows argv / second-instance)复用同一条
 * 队列,而不是各自造一个。
 */
export function enqueueDeepLink(url: string): void {
  if (typeof url !== 'string' || !url) return
  if (ready && state) {
    state.deliver(url)
    return
  }
  pending.push(url)
  while (pending.length > DEEPLINK_COLD_START_QUEUE_MAX) {
    const dropped = pending.shift()
    state?.logger.warn(`[DeepLink] Cold-start queue overflow, dropped: ${String(dropped).slice(0, 80)}`)
  }
}

/**
 * 渲染层已经能画确认卡了 —— 放行队列。
 *
 * 由 `deeplink:ready` 触发。重复调用是安全的(reload 之后 renderer 会再说一次),
 * 那时队列已空,只是把闸留在开着。
 */
export function markElectronDeepLinkReady(): void {
  ready = true
  if (!state) return
  while (pending.length > 0) {
    const url = pending.shift()!
    state.deliver(url)
  }
}

/** 队列里还压着几条(测试 / 诊断用)。 */
export function pendingDeepLinkCount(): number {
  return pending.length
}

/** 测试专用:回到未注册、未放行、队列空的状态。 */
export function resetElectronDeepLinkProtocolForTests(): void {
  state = null
  ready = false
  pending.length = 0
}
