/**
 * `contributes.theme.background` —— L2.5 背景/材质层的**判据与裁决**(G 期,见
 * `docs/design/plugin-ui/plugin-ui-expression-layers-2026-08.md` §3.3.5)。
 *
 * 三件事在这里,而且只在这里:
 *
 *  1. **图源不是任意 URL,是包内资产。** L2 的颜色白名单刻意禁了 `url()` ——
 *     那条禁令针对的是"任意 URL"(远程加载 / 追踪像素 / 指纹),对包内文件不成立:
 *     C 期的 `onething-plugin://<id>/` 只服务**已启用插件**的静态根,天然是安全图源。
 *     于是背景能力不必打破任何红线,判据直接复用 webview entry 那一份
 *     (`describePluginRelativeAssetPathProblem`),**只在扩展名白名单上分叉**。
 *
 *  2. **参数是枚举出来的三个旋钮**(opacity / blur / fit),不是 CSS 片段。
 *     背景层是"枚举出的一块宿主自留地",不是 CSS 注入的口子 —— 想要别的效果的
 *     正确出口是 L3 webview,不是往这里加第四个字符串字段。
 *
 *  3. **冲突按全局规范顺序后者胜**,与 token 覆盖同一出处
 *     (`comparePluginCanonicalOrder`)。停用的插件不参与裁决 —— 否则关掉一个插件
 *     会改变另一个插件的呈现状态。
 *
 * **声明严、运行期宽**(有意的不对称):
 *  - manifest 里的越界数值(opacity 5、blur 999)**当场判非法并丢弃整条 background**。
 *    它是作者写死的常量,设置页看得见,说出来才有人去改;悄悄钳一下等于把
 *    "作者理解错了"藏起来。
 *  - `api.theme.updateBackground(partial)` 里的越界数值**钳制**。它是用户拖滑杆的
 *    结果,拒绝一次拖拽换来的是一个卡住的控件,而钳住正是用户期待的行为。
 *
 * 判据在 core、IO 在宿主:这里一行 fs / electron 都不吃,真正的读文件仍住在
 * `apps/electron/src/plugins/protocol.ts`(与 webview 同一条协议、同一批闸)。
 */
import { comparePluginCanonicalOrder } from './canonical-order.js'
import {
  describePluginRelativeAssetPathProblem,
  pluginWebviewEntryUrl,
} from './webview.js'

/**
 * 背景图允许的扩展名。
 *
 * 是 `PLUGIN_WEBVIEW_MIME_TYPES` 的**图片子集**:协议那边已经按 MIME 白名单
 * 放行了这些扩展名,这里只是把"能当背景的"再收一道 —— 声明一个 `.js` 当背景图
 * 是作者写错了,不该等到浏览器解码失败才发现。
 *
 * `svg` 留着:它进的是 CSS `background-image`,不是 `<img>` 也不是 iframe ——
 * CSS 背景里的 SVG 不执行脚本、不发外链请求(浏览器按 secure-static 模式解析)。
 */
export const PLUGIN_BACKGROUND_IMAGE_EXTENSIONS: readonly string[] = [
  'png', 'jpg', 'jpeg', 'webp', 'svg', 'gif',
]

/** 铺放方式。cover/contain 映射 background-size,tile 映射 repeat。 */
export const PLUGIN_BACKGROUND_FITS = ['cover', 'contain', 'tile'] as const
export type PluginBackgroundFit = (typeof PLUGIN_BACKGROUND_FITS)[number]

export const PLUGIN_BACKGROUND_DEFAULT_OPACITY = 1
export const PLUGIN_BACKGROUND_DEFAULT_BLUR = 0
export const PLUGIN_BACKGROUND_DEFAULT_FIT: PluginBackgroundFit = 'cover'
export const PLUGIN_BACKGROUND_MIN_OPACITY = 0
export const PLUGIN_BACKGROUND_MAX_OPACITY = 1
export const PLUGIN_BACKGROUND_MIN_BLUR = 0
/** 上限 40px:再高就只是一块糊,而 filter: blur 的代价随半径平方上涨。 */
export const PLUGIN_BACKGROUND_MAX_BLUR = 40

/** 三个旋钮的完整取值(缺省已填)。 */
export interface PluginBackgroundParams {
  opacity: number
  blur: number
  fit: PluginBackgroundFit
}

/** 运行期可调的那一部分。**image 不在里面** —— 换图 = 发新版本。 */
export interface PluginBackgroundParamsPatch {
  opacity?: number
  blur?: number
  fit?: PluginBackgroundFit
}

/** manifest 里的声明形状(未校验)。 */
export interface PluginBackgroundDeclarationLike {
  image?: unknown
  darkImage?: unknown
  opacity?: unknown
  blur?: unknown
  fit?: unknown
}

export const PLUGIN_BACKGROUND_DEFAULT_PARAMS: PluginBackgroundParams = {
  opacity: PLUGIN_BACKGROUND_DEFAULT_OPACITY,
  blur: PLUGIN_BACKGROUND_DEFAULT_BLUR,
  fit: PLUGIN_BACKGROUND_DEFAULT_FIT,
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 文件名的扩展名(小写);没有扩展名时返回 ''。 */
function extensionOf(value: string): string {
  const dot = value.lastIndexOf('.')
  if (dot < 0) return ''
  return value.slice(dot + 1).toLowerCase()
}

/** 背景图路径的判据 = webview entry 的那一份 + 图片扩展名白名单。 */
function describeBackgroundImageProblem(value: unknown, label: string): string | null {
  const problem = describePluginRelativeAssetPathProblem(value, label)
  if (problem) return problem
  if (!PLUGIN_BACKGROUND_IMAGE_EXTENSIONS.includes(extensionOf(value as string))) {
    return `${label} must point at an image file (${PLUGIN_BACKGROUND_IMAGE_EXTENSIONS.join(', ')})`
  }
  return null
}

export function isPluginBackgroundFit(value: unknown): value is PluginBackgroundFit {
  return typeof value === 'string'
    && (PLUGIN_BACKGROUND_FITS as readonly string[]).includes(value)
}

function describeNumberProblem(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string | null {
  if (value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${label} must be a finite number`
  }
  if (value < min || value > max) return `${label} must be between ${min} and ${max}`
  return null
}

/**
 * 一条 `contributes.theme.background` 声明的判据。
 *
 * 返回错误字符串 = **丢弃 background**(不拒载整个插件,与未知锚点 / token 覆盖
 * 同规:降级不拒载,不计熔断 —— 拒载的插件根本不进清单,理由就没地方说)。
 * `undefined` = 没声明,合法。
 */
export function describePluginBackgroundProblem(background: unknown): string | null {
  if (background === undefined) return null
  if (!isPlainRecord(background)) return 'contributes.theme.background must be an object'
  const imageProblem = describeBackgroundImageProblem(
    background.image,
    'contributes.theme.background.image',
  )
  if (imageProblem) return imageProblem
  if (background.darkImage !== undefined) {
    const darkProblem = describeBackgroundImageProblem(
      background.darkImage,
      'contributes.theme.background.darkImage',
    )
    if (darkProblem) return darkProblem
  }
  const opacityProblem = describeNumberProblem(
    background.opacity,
    'contributes.theme.background.opacity',
    PLUGIN_BACKGROUND_MIN_OPACITY,
    PLUGIN_BACKGROUND_MAX_OPACITY,
  )
  if (opacityProblem) return opacityProblem
  const blurProblem = describeNumberProblem(
    background.blur,
    'contributes.theme.background.blur',
    PLUGIN_BACKGROUND_MIN_BLUR,
    PLUGIN_BACKGROUND_MAX_BLUR,
  )
  if (blurProblem) return blurProblem
  if (background.fit !== undefined && !isPluginBackgroundFit(background.fit)) {
    return `contributes.theme.background.fit must be one of ${PLUGIN_BACKGROUND_FITS.join(', ')}`
  }
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 运行期补丁的钳制。
 *
 * 非数字 / NaN / 未知 fit 一律**忽略该字段**(保留上一次的值),越界数字钳进区间。
 * `image` 即使传进来也不看 —— 换图是发新版本的事,不是运行期的事。
 */
export function clampPluginBackgroundParamsPatch(
  patch: unknown,
): PluginBackgroundParamsPatch {
  if (!isPlainRecord(patch)) return {}
  const result: PluginBackgroundParamsPatch = {}
  if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) {
    result.opacity = clamp(patch.opacity, PLUGIN_BACKGROUND_MIN_OPACITY, PLUGIN_BACKGROUND_MAX_OPACITY)
  }
  if (typeof patch.blur === 'number' && Number.isFinite(patch.blur)) {
    result.blur = clamp(patch.blur, PLUGIN_BACKGROUND_MIN_BLUR, PLUGIN_BACKGROUND_MAX_BLUR)
  }
  if (isPluginBackgroundFit(patch.fit)) result.fit = patch.fit
  return result
}

/** manifest 缺省 ⊕ 最新一次 updateBackground。声明先于代码:缺省来自 manifest。 */
export function mergePluginBackgroundParams(
  declaration: PluginBackgroundDeclarationLike,
  patch?: PluginBackgroundParamsPatch | null,
): PluginBackgroundParams {
  return {
    opacity: patch?.opacity
      ?? (typeof declaration.opacity === 'number'
        ? declaration.opacity
        : PLUGIN_BACKGROUND_DEFAULT_OPACITY),
    blur: patch?.blur
      ?? (typeof declaration.blur === 'number'
        ? declaration.blur
        : PLUGIN_BACKGROUND_DEFAULT_BLUR),
    fit: patch?.fit
      ?? (isPluginBackgroundFit(declaration.fit)
        ? declaration.fit
        : PLUGIN_BACKGROUND_DEFAULT_FIT),
  }
}

/**
 * 背景图的 URL —— 与 webview entry **同一个出处**。
 *
 * 路径相对**静态根**(`contributes.webviewRoot`,缺省 `webview/`),协议那边
 * join 的时候会补上根,所以 URL 里不带根这一段。
 */
export function pluginBackgroundImageUrl(pluginId: string, image: string): string {
  return pluginWebviewEntryUrl(pluginId, image)
}

/** 一条背景声明在裁决后的状态(与 token 覆盖的四态同名同义)。 */
export type PluginBackgroundStatus =
  /** 生效中:此刻画在背景层上的就是它。 */
  | 'active'
  /** 被更后者压过:合法,但规范顺序更靠后的插件也声明了背景。 */
  | 'shadowed'
  /** 插件未启用:声明还在,但不参与合成。 */
  | 'inactive'
  /** 声明非法 —— 丢弃,但设置页要说得出来。 */
  | 'invalid'

/** 逐插件的裁决结果(设置页明细用)。 */
export interface PluginBackgroundEntry {
  status: PluginBackgroundStatus
  /** 相对静态根的图路径(原样;invalid 时可能是空串)。 */
  image: string
  darkImage: string
  opacity: number
  blur: number
  fit: PluginBackgroundFit
  /** status === 'invalid' 时的人话原因。 */
  reason?: string
  /** status === 'shadowed' 时压过它的那个插件 id。 */
  shadowedBy?: string
}

/** 胜出的那一条 —— renderer 拿它直接画层,不再做第二次判断。 */
export interface PluginBackgroundDescriptor {
  pluginId: string
  /** `onething-plugin://<id>/<image>` 完整 URL。 */
  imageUrl: string
  /** 深色图;插件没声明 darkImage 时**等于** imageUrl(renderer 不做兜底)。 */
  darkImageUrl: string
  opacity: number
  blur: number
  fit: PluginBackgroundFit
}

export interface PluginBackgroundInput {
  pluginId: string
  enabled: boolean
  /** manifest 的 `contributes.theme.background`(未校验原文)。 */
  background?: unknown
  /** 该插件最近一次 `api.theme.updateBackground` 的结果(内存态,可空)。 */
  runtimeParams?: PluginBackgroundParamsPatch | null
}

export interface PluginBackgroundResolution {
  /** 逐插件裁决(键 = pluginId);没声明背景的插件不出现在表里。 */
  byPlugin: Map<string, PluginBackgroundEntry>
  /** 胜出的背景;没有任何一条 active 时是 null。 */
  winner: PluginBackgroundDescriptor | null
}

/**
 * 裁决一组插件的背景声明。
 *
 * 顺序语义与 token 覆盖逐字相同:先按全局规范顺序排,再顺序写入 —— 后写的赢,
 * 被赢掉的那条标 `shadowed` 并记下赢家。**背景只有一块**,所以这里的"同一个 token"
 * 就是全局唯一那一格。
 */
export function resolvePluginBackgrounds(
  inputs: readonly PluginBackgroundInput[],
): PluginBackgroundResolution {
  const ordered = [...inputs].sort((a, b) => comparePluginCanonicalOrder(a.pluginId, b.pluginId))
  const byPlugin = new Map<string, PluginBackgroundEntry>()
  let winner: { pluginId: string; entry: PluginBackgroundEntry } | null = null

  for (const input of ordered) {
    if (input.background === undefined) continue
    const problem = describePluginBackgroundProblem(input.background)
    if (problem) {
      const raw = isPlainRecord(input.background) ? input.background : {}
      byPlugin.set(input.pluginId, {
        status: 'invalid',
        reason: problem,
        image: typeof raw.image === 'string' ? raw.image : '',
        darkImage: typeof raw.darkImage === 'string' ? raw.darkImage : '',
        ...PLUGIN_BACKGROUND_DEFAULT_PARAMS,
      })
      continue
    }
    const declaration = input.background as PluginBackgroundDeclarationLike
    const params = mergePluginBackgroundParams(
      declaration,
      clampPluginBackgroundParamsPatch(input.runtimeParams ?? undefined),
    )
    const image = declaration.image as string
    const darkImage = typeof declaration.darkImage === 'string' ? declaration.darkImage : ''
    if (!input.enabled) {
      byPlugin.set(input.pluginId, { status: 'inactive', image, darkImage, ...params })
      continue
    }
    const entry: PluginBackgroundEntry = { status: 'active', image, darkImage, ...params }
    if (winner) {
      winner.entry.status = 'shadowed'
      winner.entry.shadowedBy = input.pluginId
    }
    winner = { pluginId: input.pluginId, entry }
    byPlugin.set(input.pluginId, entry)
  }

  return {
    byPlugin,
    winner: winner
      ? {
        pluginId: winner.pluginId,
        imageUrl: pluginBackgroundImageUrl(winner.pluginId, winner.entry.image),
        darkImageUrl: pluginBackgroundImageUrl(
          winner.pluginId,
          winner.entry.darkImage || winner.entry.image,
        ),
        opacity: winner.entry.opacity,
        blur: winner.entry.blur,
        fit: winner.entry.fit,
      }
      : null,
  }
}
