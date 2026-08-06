/**
 * 插件流状态的装配层接线(R6)。
 *
 * core 管账与清扫语义,这里只做两件宿主的事:
 *  1. 把状态投递到会话事件总线(`content:part`)—— 既有轨道,desktop 的 IPCBridge
 *     与 web 的 SSE 双扇出都是免费的,没有为 R6 新开通道;
 *  2. 在流结束时**强制清扫**该会话的全部插件状态。
 *
 * 第 2 条是本期的核心。插件 show 之后可能抛错、超时、被熔断、被停用,或者干脆
 * 忘了 clear —— 任何一种都会在用户的对话里留下一个永远转圈的状态,而用户没有
 * 任何办法让它消失。所以正确性不能建立在"插件会守规矩"上。
 */
import {
  CorePluginStatusRegistry,
  isPluginStatusSweepEvent,
  type CorePluginStatusPart,
} from '@onething/core/plugins'

/**
 * 全进程一本账。
 *
 * 每插件一本的话,按会话清扫就要遍历所有插件的账 —— 而"扫干净"恰恰是这一期
 * 唯一必须保证的事,不能依赖调用方记得把每本都传进来。
 */
const statusRegistry = new CorePluginStatusRegistry()

export function getPluginStatusRegistry(): CorePluginStatusRegistry {
  return statusRegistry
}

type SessionEventEmitter = (sessionId: string, event: { type: string; [key: string]: unknown }) => void

let emitSessionEvent: SessionEventEmitter | null = null

/** 装配层把会话总线接进来(late-bound host port,与 configure*Host 同构)。 */
export function configurePluginStatusHost(options: { emitSessionEvent: SessionEventEmitter }): void {
  emitSessionEvent = options.emitSessionEvent
}

/** 测试用:拆掉接线并清空账本。 */
export function resetPluginStatusHostForTests(): void {
  emitSessionEvent = null
  statusRegistry.reset()
}

export function emitPluginStatusPart(sessionId: string, part: CorePluginStatusPart): void {
  // 走既有的 content:part 会话事件,不新开轨道(§5.2 第 4 条)。
  emitSessionEvent?.(sessionId, { type: 'content:part', part })
}

/**
 * 流结束时的强制清扫。
 *
 * 三种结束事件都要接(complete / error / aborted)—— 漏一种就漏一类残留,
 * 而 error 与 aborted 恰恰是插件最可能没走到 clear 的那两条路径。
 */
export function sweepPluginStatusForSession(sessionId: string): CorePluginStatusPart[] {
  const cleared = statusRegistry.clearSession(sessionId)
  for (const part of cleared) emitPluginStatusPart(sessionId, part)
  return cleared
}

/**
 * 插件停用 / 熔断 / 卸载时清扫它在**所有**会话里的状态。
 *
 * 只等流结束是不够的:一个刚被熔断禁用的插件,它挂在别的会话上的状态没人再会
 * 来撤下,而那些会话可能几小时后才结束。
 */
export function sweepPluginStatusForPlugin(pluginId: string): Array<{ sessionId: string; part: CorePluginStatusPart }> {
  const cleared = statusRegistry.clearPlugin(pluginId)
  for (const { sessionId, part } of cleared) emitPluginStatusPart(sessionId, part)
  return cleared
}

/** 订阅流结束事件。返回退订函数。 */
export function subscribePluginStatusSweep(eventBus: {
  onAnySessionAny(handler: (envelope: { sessionId: string; event: { type: string } }) => void, label?: string): () => void
}): () => void {
  return eventBus.onAnySessionAny((envelope) => {
    if (!isPluginStatusSweepEvent(envelope.event?.type)) return
    sweepPluginStatusForSession(envelope.sessionId)
  }, 'PluginStatusSweep')
}
