/**
 * 插件请求通道 —— UI(renderer/web)→ 插件方向的唯一通路(设计文档 §5 R2)。
 *
 * 三条从第一天就必须在的语义:
 *  - **requestId**:每次调用可寻址,否则 abort/progress 无从投递;
 *  - **abort**:宿主的工具执行上下文里 abortSignal 是一等公民,插件通道没有的话
 *    第一个产品级长任务就撞墙;
 *  - **progress**:同上,长任务必须能吐中间态。
 *
 * 宪法第 2 条(过线皆可序列化)在这里落到运行期:payload / result / progress
 * 都要过一次浅校验。将来把插件搬进子进程时,这条边界原样变成 RPC —— 现在纵容
 * 一个函数或 Map 过线,那天就是全量 API 重写。
 */

export interface CorePluginRequestContext {
  /** 本次调用的地址。abort 与 progress 都按它路由。 */
  readonly requestId: string
  /** 调用方撤销时触发。插件应当据此提前收工。 */
  readonly abortSignal: AbortSignal
  /** 中间态上报;payload 必须 JSON-可序列化。 */
  progress(payload: unknown): void
}

/** payload / 返回值都必须 JSON-可序列化(宪法第 2 条)。 */
export type CorePluginRequestHandler = (
  payload: unknown,
  ctx: CorePluginRequestContext,
) => unknown | Promise<unknown>

export type CorePluginRequestResult =
  | { success: true; result: unknown }
  | { success: false; error: string; aborted?: boolean }

export interface CorePluginRequestInput {
  pluginId: string
  action: string
  payload?: unknown
  /** 省略时由宿主生成。 */
  requestId?: string
  /** 进度上报的出口(宿主决定投到哪条通道)。 */
  onProgress?(input: { requestId: string; pluginId: string; action: string; payload: unknown }): void
}

export const PLUGIN_REQUEST_ABORTED_ERROR = 'Plugin request aborted'

/**
 * 浅校验"能不能过线"。
 *
 * 只走有限深度:这条路径在每次插件调用上,深度遍历一棵大对象是白付的代价。
 * 目标是**当场挡住形状错误**(函数、Symbol、类实例、循环),不是做完备的
 * JSON 等价证明。
 */
const JSON_CHECK_MAX_DEPTH = 4

export function describeNonSerializable(value: unknown, path = 'value', depth = 0): string | null {
  if (value === null) return null
  const kind = typeof value
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return kind === 'number' && !Number.isFinite(value as number)
      ? `${path} is a non-finite number (${String(value)})`
      : null
  }
  if (kind === 'undefined') {
    // 顶层 undefined 等价于"没有 payload";对象成员里的 undefined 会被 JSON 丢掉,
    // 但那是无声丢失,不是形状错误 —— 放行,别为它报错。
    return null
  }
  if (kind === 'function') return `${path} is a function`
  if (kind === 'symbol') return `${path} is a symbol`
  if (kind === 'bigint') return `${path} is a bigint`

  if (depth >= JSON_CHECK_MAX_DEPTH) return null

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = describeNonSerializable(value[index], `${path}[${index}]`, depth + 1)
      if (found) return found
    }
    return null
  }

  if (value instanceof Date) return null
  if (value instanceof Map) return `${path} is a Map (use a plain object)`
  if (value instanceof Set) return `${path} is a Set (use an array)`
  if (value instanceof Promise) return `${path} is a Promise`
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    return `${path} is a typed array (use a plain array or base64 string)`
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) {
    return `${path} is a class instance (${(value as object).constructor?.name || 'unknown'}); pass a plain object`
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const found = describeNonSerializable(child, `${path}.${key}`, depth + 1)
    if (found) return found
  }
  return null
}

export function assertPluginPayloadSerializable(value: unknown, label: string): void {
  const problem = describeNonSerializable(value, label)
  if (problem) {
    throw new Error(`Plugin request payload must be JSON-serializable: ${problem}`)
  }
}

export function normalizePluginRequestAction(action: string): string {
  return action.trim()
}

export function pluginRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Plugin request failed'
}

/**
 * 在飞请求登记簿 —— abort 要能找到那个 AbortController。
 *
 * 单独成类是为了让 manager 与将来的子进程宿主共用同一套寻址语义。
 */
export class CorePluginRequestRegistry {
  private readonly inFlight = new Map<string, { controller: AbortController; pluginId: string }>()
  private sequence = 0

  nextRequestId(pluginId: string): string {
    this.sequence += 1
    return `${pluginId}#${Date.now().toString(36)}-${this.sequence}`
  }

  begin(requestId: string, pluginId: string): AbortController {
    const controller = new AbortController()
    this.inFlight.set(requestId, { controller, pluginId })
    return controller
  }

  end(requestId: string): void {
    this.inFlight.delete(requestId)
  }

  abort(requestId: string): boolean {
    const entry = this.inFlight.get(requestId)
    if (!entry) return false
    entry.controller.abort()
    return true
  }

  /** 插件被拆除时,它名下所有在飞请求一并中止 —— 否则它们会在真空里跑完。 */
  abortForPlugin(pluginId: string): number {
    let aborted = 0
    for (const [requestId, entry] of this.inFlight) {
      if (entry.pluginId !== pluginId) continue
      entry.controller.abort()
      this.inFlight.delete(requestId)
      aborted += 1
    }
    return aborted
  }

  size(): number {
    return this.inFlight.size
  }
}
