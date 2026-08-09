/**
 * `onething-plugin://<pluginId>/<path>` —— 插件 webview 的静态资源协议(C1)。
 *
 * 它服务的是**代码区**里的静态根(插件 `dirPath` + `contributes.webviewRoot`),
 * 不是家目录:家目录是数据区(config/kv/storage),把它端到一个 origin 上等于
 * 把用户数据交给 iframe 里的脚本。
 *
 * 五道闸,全部在这一个文件里,并且全部有反例测试:
 *  1. **供给闸**:pluginId 必须解析出一个静态根(未装 / 停用 / 没声明 webview
 *     一律 404,不区分原因 —— 对调用方而言"没有这个东西"是同一句话);
 *  2. **穿越闸**:pathname 先 decodeURIComponent(`%2e%2e` 在 URL 解析期不会被
 *     规范化)再逐段规范化,`..` 当场拒;join 之后必须仍在根内;
 *  3. **symlink 闸**:realpath 复核 —— 根内的一条软链指到 `~/.ssh` 是最省事的
 *     逃逸方式,只比字符串前缀挡不住它;
 *  4. **MIME 闸**:扩展名白名单,不在表里的一律 415(不是 200 + 猜类型);
 *  5. **头闸**:每个响应都带 CSP(iframe 里的 JS 不能出网)与 nosniff。
 *
 * 协议注册为 privileged(standard + supportFetchAPI)—— **必须在 app ready 之前**,
 * 所以 scheme 登记与 handler 挂载是两个函数,分别接在 bootstrap 的同步段与 ready 段。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, session } from 'electron'
import {
  PLUGIN_WEBVIEW_SCHEME,
  buildPluginWebviewCsp,
  pluginWebviewMimeType,
  resolvePluginWebviewRequestSegments,
} from '@onething/core/plugins'

export interface ElectronPluginProtocolStaticRoot {
  pluginId: string
  root: string
}

export interface ElectronPluginProtocolOptions {
  /**
   * pluginId → 绝对静态根。null = 404。
   *
   * 宿主注入(装配层的 `resolvePluginWebviewStaticRoot`)——
   * 协议 handler 自己不认识插件系统,于是它可以被单测直接喂假根。
   */
  resolveStaticRoot(pluginId: string): ElectronPluginProtocolStaticRoot | null
  /** 挂 handler 的 session。缺省 `session.defaultSession`(主窗口用的那个)。 */
  getSession?(): { protocol: { handle: typeof protocol.handle } }
  fetch?: typeof net.fetch
  /** 注入点,测试用。 */
  realpath?(target: string): string
  statSync?(target: string): { isFile(): boolean }
}

/**
 * scheme 登记。**必须在 `app.on('ready')` 之前调用一次。**
 *
 * - `standard: true` —— 没有它,URL 不是"标准"形式,`new URL()` 解不出 host,
 *   `onething-plugin://a/b` 的 pluginId 就取不到,而且 origin 是 opaque 的
 *   一次性值,CSP host-source 也就无从写起。
 * - `supportFetchAPI: true` —— iframe 里的 `fetch('./data.json')` 要能用。
 * - `secure: true` —— 让它被当作可信来源(否则 Chromium 会按 insecure origin
 *   限制一批 API,并且在混合内容判定里吃亏)。
 * - **不开 `corsEnabled`**:开了就等于允许别的 origin 跨过来读插件静态文件。
 *   iframe 读自己 origin 下的资源不需要 CORS。
 */
export function registerElectronPluginProtocolScheme(
  registerSchemesAsPrivileged: typeof protocol.registerSchemesAsPrivileged = protocol.registerSchemesAsPrivileged.bind(protocol),
): void {
  registerSchemesAsPrivileged([
    {
      scheme: PLUGIN_WEBVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      },
    },
  ])
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}

/**
 * 一次请求 → 一个绝对文件路径(或 null/415)。
 *
 * 抽出来是为了让穿越/symlink/MIME 三闸能被逐条测,而不必起一个真的 Electron。
 */
export function resolvePluginProtocolFile(
  requestUrl: string,
  options: ElectronPluginProtocolOptions,
): { ok: true; filePath: string; mime: string; pluginId: string }
  | { ok: false; status: 404 | 415 } {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return { ok: false, status: 404 }
  }
  const pluginId = url.hostname
  const staticRoot = pluginId ? options.resolveStaticRoot(pluginId) : null
  if (!staticRoot) return { ok: false, status: 404 }

  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    // 坏的百分号编码 —— 不猜,直接不服务。
    return { ok: false, status: 404 }
  }
  const segments = resolvePluginWebviewRequestSegments(decoded)
  if (!segments) return { ok: false, status: 404 }

  const realpath = options.realpath ?? ((target: string) => fs.realpathSync.native(target))
  const statSync = options.statSync ?? ((target: string) => fs.statSync(target))

  // 根本身先取 realpath:静态根自己可能是软链(npm 的 workspace link 就是),
  // 拿未解析的根去比前缀会把合法请求判成逃逸。
  let realRoot: string
  try {
    realRoot = realpath(staticRoot.root)
  } catch {
    return { ok: false, status: 404 }
  }

  const joined = path.resolve(realRoot, ...segments)
  // 字符串层面的第一道:join 之后必须仍在根内(`path.resolve` 已经消掉了 `.`,
  // `..` 在 segments 那一步就被拒了,这条是兜底)。
  if (joined !== realRoot && !joined.startsWith(realRoot + path.sep)) {
    return { ok: false, status: 404 }
  }

  const mime = pluginWebviewMimeType(path.basename(joined))
  // MIME 闸排在 realpath 之前:不在白名单的扩展名根本不该触碰文件系统。
  if (!mime) return { ok: false, status: 415 }

  let realFile: string
  try {
    realFile = realpath(joined)
    if (!statSync(realFile).isFile()) return { ok: false, status: 404 }
  } catch {
    return { ok: false, status: 404 }
  }
  // 第二道,也是真正管用的一道:软链解析之后仍须落在根内。
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    return { ok: false, status: 404 }
  }
  // 解析之后扩展名可能变了(`a.html` → `../secrets.env`)—— 复核一次。
  if (pluginWebviewMimeType(path.basename(realFile)) !== mime) {
    return { ok: false, status: 415 }
  }

  return { ok: true, filePath: realFile, mime, pluginId }
}

export function registerElectronPluginProtocol(options: ElectronPluginProtocolOptions): void {
  const target = options.getSession?.() ?? session.defaultSession
  const fetchImpl = options.fetch ?? net.fetch

  target.protocol.handle(PLUGIN_WEBVIEW_SCHEME, async request => {
    const resolved = resolvePluginProtocolFile(request.url, options)
    if (!resolved.ok) {
      return textResponse(
        resolved.status,
        resolved.status === 415
          ? 'Unsupported plugin asset type'
          : 'Plugin asset not found',
      )
    }

    let body: Response
    try {
      // pathToFileURL 而不是拼字符串:空格/中文/`#` 在路径里都会把裸拼的 URL 拧坏。
      body = await fetchImpl(pathToFileURL(resolved.filePath).toString())
    } catch {
      return textResponse(404, 'Plugin asset not found')
    }
    if (!body.ok) return textResponse(404, 'Plugin asset not found')

    const headers = new Headers()
    headers.set('content-type', resolved.mime)
    headers.set('x-content-type-options', 'nosniff')
    // CSP 挂在**每一个**响应上,不只是 HTML:一个被 iframe 直接导航到的 .svg
    // 同样是一份文档,同样需要 default-src 'none'。
    headers.set('content-security-policy', buildPluginWebviewCsp(resolved.pluginId))
    headers.set('cache-control', 'no-cache')
    return new Response(body.body, { status: 200, headers })
  })
}
