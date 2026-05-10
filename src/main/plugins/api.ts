/**
 * Plugin API — the "api" object passed to each plugin's entry function.
 *
 * Wraps onething's infrastructure (EventBus, StreamEngine, ToolRegistry)
 * behind a clean, sandboxed interface. Every handler is try-catch wrapped
 * so a plugin crash doesn't take down the app.
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
import { registerPluginSkillRootProvider } from '../skills/plugin-roots.js'
import type {
  PluginAPI,
  PluginEntry,
  PluginEventHandler,
  PluginToolDefinition,
  PluginToolContext,
  PluginToolResult,
  PluginCommandDefinition,
  MinimalPluginUI,
} from './types.js'

// Track all subscriptions so we can clean up on disable/unload
export interface PluginState {
  api: PluginAPI
  unsubs: Array<() => void>
  commands: Map<string, PluginCommandDefinition>
  toolIds: string[]
  skillRootUnsubs: Array<() => void>
  disposeCallbacks: Array<() => void>
}

export function createPluginAPI(
  pluginId: string,
  eventBus: EventBus,
  streamEngine: StreamEngine,
): { api: PluginAPI; state: PluginState } {
  const unsubs: Array<() => void> = []
  const commands = new Map<string, PluginCommandDefinition>()
  const toolIds: string[] = []
  const skillRootUnsubs: Array<() => void> = []
  const disposeCallbacks: Array<() => void> = []

  const store = new PluginStore(pluginId)

  const ui: MinimalPluginUI = {
    notify(message: string, level: 'info' | 'warn' | 'error' = 'info') {
      // Use session-agnostic notification via EventBus global events
      try {
        eventBus.emitGlobal({
          type: 'plugin:notification',
          pluginId,
          message,
          level,
        })
      } catch (err) {
        console.error(`[Plugin:${pluginId}] notify error:`, err)
      }
    },
  }

  const api: PluginAPI = {
    id: pluginId,

    // ── Tool Registration ──
    registerTool<P extends z.ZodType, M extends ToolMetadata>(
      tool: PluginToolDefinition<P, M>,
    ): void {
      const toolId = `plugin:${pluginId}:${tool.name}`
      try {
        registerToolInRegistry(
          Tool.define(toolId, {
            name: tool.name,
            description: tool.description,
            category: 'custom',
            parameters: tool.parameters,
            permissionGuard: tool.permissionGuard ?? 'permission-gated',
            async execute(args: unknown, ctx: any) {
              const pluginCtx: PluginToolContext<M> = {
                sessionId: ctx.sessionId,
                messageId: ctx.messageId,
                toolCallId: ctx.toolCallId,
                workingDirectory: ctx.workingDirectory,
                abortSignal: ctx.abortSignal,
                metadata(input: { title?: string; metadata?: Partial<M> }) {
                  ctx.metadata?.(input)
                },
              }
              const result: PluginToolResult<M> = await tool.execute(args as any, pluginCtx)
              return {
                title: result.title,
                output: result.output,
                metadata: result.metadata,
              }
            },
          })
        )
        if (!toolIds.includes(toolId)) {
          toolIds.push(toolId)
        }
        console.log(`[Plugin:${pluginId}] Registered tool: ${tool.name}`)
      } catch (err) {
        console.error(`[Plugin:${pluginId}] Failed to register tool "${tool.name}":`, err)
      }
    },

    // ── Event Subscription ──
    on(eventType: string, handler: PluginEventHandler): () => void {
      const wrappedHandler = (envelope: {
        sessionId: string
        sequence: number
        timestamp: number
        event: { type: string; [key: string]: unknown }
      }) => {
        try {
          const result = handler(envelope)
          if (result instanceof Promise) {
            result.catch((err) =>
              console.error(`[Plugin:${pluginId}] Event handler error (${eventType}):`, err),
            )
          }
        } catch (err) {
          console.error(`[Plugin:${pluginId}] Event handler error (${eventType}):`, err)
        }
      }

      // Use onAnySession so the plugin receives events from all sessions
      const unsub = eventBus.onAnySession(
        eventType as any,
        wrappedHandler as any,
        `Plugin:${pluginId}`,
      )
      unsubs.push(unsub)
      return unsub
    },

    // ── Message Injection ──
    steer(sessionId: string, content: string): void {
      try {
        streamEngine.steerMessage(sessionId, content, pluginId)
      } catch (err) {
        console.error(`[Plugin:${pluginId}] steer error:`, err)
      }
    },

    followUp(sessionId: string, content: string): void {
      try {
        streamEngine.followUpMessage(sessionId, content, pluginId)
      } catch (err) {
        console.error(`[Plugin:${pluginId}] followUp error:`, err)
      }
    },

    // ── Command Registration ──
    registerCommand(name: string, options: Omit<PluginCommandDefinition, 'name'>): void {
      const fullName = name.startsWith('/') ? name : `/${name}`
      commands.set(fullName, { name: fullName, ...options })
      console.log(`[Plugin:${pluginId}] Registered command: ${fullName}`)
    },

    registerSkillRoot(provider): void {
      const unsub = registerPluginSkillRootProvider(pluginId, provider)
      skillRootUnsubs.push(unsub)
      import('../ipc/skills.js')
        .then(({ invalidateSkillsCache }) => invalidateSkillsCache())
        .catch(() => undefined)
      console.log(`[Plugin:${pluginId}] Registered skill root provider`)
    },

    onDispose(callback): void {
      disposeCallbacks.push(callback)
    },

    // ── Store ──
    store,

    // ── UI ──
    ui,
  }

  return { api, state: { api, unsubs, commands, toolIds, skillRootUnsubs, disposeCallbacks } }
}

/**
 * Dispose a plugin: unsubscribe all handlers, clear state.
 */
export function disposePlugin(state: PluginState): void {
  for (const callback of state.disposeCallbacks.splice(0)) {
    try {
      callback()
    } catch (err) {
      // ignore
    }
  }

  for (const toolId of state.toolIds) {
    try {
      unregisterToolInRegistry(toolId)
    } catch (err) {
      // ignore
    }
  }
  state.toolIds.length = 0

  for (const unsub of state.skillRootUnsubs) {
    try {
      unsub()
    } catch (err) {
      // ignore
    }
  }
  state.skillRootUnsubs.length = 0

  for (const unsub of state.unsubs) {
    try {
      unsub()
    } catch (err) {
      // ignore
    }
  }
  state.unsubs.length = 0
  state.commands.clear()
}
