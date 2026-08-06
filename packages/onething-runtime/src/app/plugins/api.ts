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
  const pluginScheduler = createScopedPluginScheduler({
    pluginId,
    scheduler: getScheduler(),
    disposeCallbacks: schedulerDisposeCallbacks,
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
        return eventBus.onAnySession(
          eventType as any,
          handler as any,
          `Plugin:${id}`,
        )
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

  return result
}

export function disposePlugin(state: PluginState): void {
  disposeCorePluginState(state, {
    unregisterTool: unregisterToolInRegistry,
  })
}
