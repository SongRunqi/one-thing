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
import { PluginStore } from './store.js'
import {
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
} from './health.js'
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
        // 插件自定义事件是**全局**事件(它不属于任何一次会话),会话事件走
        // per-session 环形缓冲 —— 两条投递面不同,订阅口必须按前缀分流,
        // 否则 api.on('plugin:x:y') 永远收不到东西。
        if (eventType.startsWith('plugin:')) {
          return eventBus.onGlobal(eventType as any, handler as any)
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
