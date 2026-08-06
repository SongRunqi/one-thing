/**
 * Plugin API — main-process host adapter for the headless core API builder.
 */

import { Tool } from '../tools/core/tool.js'
import type { ToolMetadata } from '../tools/core/tool.js'
import {
  registerTool as registerToolInRegistry,
  unregisterTool as unregisterToolInRegistry,
} from '../tools/index.js'
import type { EventBus } from '../events/event-bus.js'
import type { StreamEngine } from '../engine/stream-engine.js'
import { z } from 'zod'
import { PluginStore, createPluginStorage } from './store.js'
import {
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
} from './health.js'
import {
  getEffectivePluginConfig,
  subscribePluginConfigChange,
} from './config.js'
import {
  registerPluginSkillRootProvider,
  type PluginSkillRootProvider,
} from '../skills/plugin-roots.js'
import { registerPromptContextProvider } from '../engine/prompt/plugin-context.js'
import {
  registerAfterAssistantResponseHook,
  registerBeforeContextCompactHook,
} from './lifecycle.js'
import { getScheduler } from '../scheduler/index.js'
import type {
  AfterAssistantResponseHook,
  BeforeContextCompactHook,
  PluginAPI,
  PluginCommandDefinition,
  PluginEventHandler,
  PluginPromptContextProvider,
  PluginSchedulerAPI,
  PluginToolDefinition,
} from './types.js'
import {
  createCorePluginAPI,
  createScopedPluginScheduler,
  disposeCorePluginState,
  executeCorePluginTool,
  type CorePluginAPIState,
} from '@onething/core/plugins'

export interface PluginState extends CorePluginAPIState<PluginAPI, PluginCommandDefinition> {}

/**
 * 走全局总线(EventBus.emitGlobal / onGlobal)的事件名单。
 *
 * 与 `packages/shared/events/global-events.ts` 的 GlobalEvent 联合一一对应 ——
 * 那边加一个成员,这里就要加一个,否则插件订阅它会被静默挂到会话面上。
 * 插件自定义事件(`plugin:<id>:<name>`)按前缀归入同一面。
 */
export const GLOBAL_PLUGIN_EVENT_TYPES = new Set([
  'app:initialized',
  'app:quitting',
  'settings:changed',
  'session:created',
  'session:switched',
  'session:deleted',
  'mcp:server-connected',
  'mcp:server-disconnected',
  'mcp:server-error',
  'plugin:loaded',
  'plugin:error',
  'plugin:notification',
])

/** 插件自定义事件:`plugin:<pluginId>:<name>`,三段以上。 */
const CUSTOM_PLUGIN_EVENT = /^plugin:[^:]+:.+$/

export function isGlobalPluginEventType(eventType: string): boolean {
  return GLOBAL_PLUGIN_EVENT_TYPES.has(eventType) || CUSTOM_PLUGIN_EVENT.test(eventType)
}

/** 会话事件都带冒号命名空间;不符合的多半是拼错了,值得吼一声。 */
const KNOWN_SESSION_EVENT_HINT = /^[a-z][\w-]*:[\w:-]+$/i

export function createPluginAPI(
  pluginId: string,
  eventBus: EventBus,
  streamEngine: StreamEngine,
): { api: PluginAPI; state: PluginState } {
  const store = new PluginStore(pluginId)
  const schedulerDisposeCallbacks: Array<() => void> = []
  // 拆除闸要能被 scheduler 看到,而 state 是 createCorePluginAPI 的返回值 ——
  // 用一个后填的引用把两者接上(register 只在调用时读它)。
  const stateRef: { current: PluginState | null } = { current: null }
  const pluginScheduler = createScopedPluginScheduler({
    pluginId,
    scheduler: getScheduler(),
    disposeCallbacks: schedulerDisposeCallbacks,
    isDisposed: () => Boolean(stateRef.current?.disposed),
  }) as PluginSchedulerAPI

  const result = createCorePluginAPI<
    PluginAPI,
    PluginToolDefinition<z.ZodType, ToolMetadata>,
    PluginEventHandler,
    PluginCommandDefinition,
    Omit<PluginCommandDefinition, 'name'>,
    PluginPromptContextProvider,
    BeforeContextCompactHook,
    AfterAssistantResponseHook,
    PluginSkillRootProvider,
    PluginStore,
    PluginSchedulerAPI
  >({
    pluginId,
    store,
    storage: createPluginStorage(pluginId),
    scheduler: pluginScheduler,
    disposeCallbacks: schedulerDisposeCallbacks,
    onPluginFailure({ pluginId: id, scope, error }) {
      reportPluginRuntimeFailure(id, scope, error)
    },
    onPluginSuccess({ pluginId: id, scope }) {
      reportPluginRuntimeSuccess(id, scope)
    },
    host: {
      registerTool(_, toolId, tool) {
        registerToolInRegistry(
          Tool.define(toolId, {
            name: tool.name,
            description: tool.description,
            category: 'custom',
            parameters: tool.parameters,
            permissionGuard: tool.permissionGuard ?? 'permission-gated',
            async execute(args: unknown, ctx: any) {
              return executeCorePluginTool(tool, args as any, {
                sessionId: ctx.sessionId,
                messageId: ctx.messageId,
                toolCallId: ctx.toolCallId,
                workingDirectory: ctx.workingDirectory,
                abortSignal: ctx.abortSignal,
                metadata(input: { title?: string; metadata?: Partial<ToolMetadata> }) {
                  ctx.metadata?.(input)
                },
              })
            },
          }),
        )
      },
      subscribeEvent(id, eventType, handler) {
        // 会话事件走 per-session 环形缓冲,全局事件走 globalHandlers —— 两条投递面
        // 不同,订阅口必须分流,否则订阅了却永远收不到东西,而且零告警。
        //
        // 判据是**显式的全局事件名单**,不是 startsWith('plugin:'):按前缀分的话,
        // 插件订阅 settings:changed / session:created / mcp:server-* 这些真·全局
        // 事件会被误挂到会话面上,同样永远收不到。
        if (isGlobalPluginEventType(eventType)) {
          return eventBus.onGlobal(eventType as any, handler as any)
        }
        if (!KNOWN_SESSION_EVENT_HINT.test(eventType)) {
          console.warn(
            `[Plugin:${id}] Subscribing to unrecognized event "${eventType}"; `
            + 'treating it as a session event. Global events must be listed in GLOBAL_PLUGIN_EVENT_TYPES.',
          )
        }
        return eventBus.onAnySession(
          eventType as any,
          handler as any,
          `Plugin:${id}`,
        )
      },
      emitPluginEvent(id, eventName, payload) {
        eventBus.emitGlobal({
          type: `plugin:${id}:${eventName}`,
          pluginId: id,
          name: eventName,
          payload,
        } as any)
      },
      steer(_, sessionId, content) {
        streamEngine.steerMessage(sessionId, content, pluginId)
      },
      followUp(_, sessionId, content) {
        streamEngine.followUpMessage(sessionId, content, pluginId)
      },
      notify(id, message, level) {
        eventBus.emitGlobal({
          type: 'plugin:notification',
          pluginId: id,
          message,
          level,
        })
      },
      getPluginConfig: getEffectivePluginConfig,
      onPluginConfigChange: subscribePluginConfigChange,
      registerPromptContextProvider: registerPromptContextProvider,
      registerBeforeContextCompactHook,
      registerAfterAssistantResponseHook,
      registerSkillRoot: registerPluginSkillRootProvider,
      invalidateSkillsCache() {
        return import('../skills/session-skills.js')
          .then(({ invalidateSessionSkillsCache }) => invalidateSessionSkillsCache())
          .catch(() => undefined)
      },
    },
  })

  stateRef.current = result.state
  return result
}

export function disposePlugin(state: PluginState): void {
  disposeCorePluginState(state, {
    unregisterTool: unregisterToolInRegistry,
  })
}
