/**
 * The product assembly factory: the single recipe that turns the src/app
 * subsystems into a running onething backend.
 *
 * Every host (Electron desktop, CLI daemon, headless server) boots through
 * this function instead of hand-sequencing the initialize* steps — the
 * ordering constraints (variables before tools, engine before Permission, …)
 * live here and nowhere else. Host-specific surfaces arrive through the
 * configure*Host ports and the options/hooks below; importing this module
 * (or any src/app module) performs no configuration by itself.
 */
import { initializeStores, flushAllPendingSaves } from './store.js'
import { getSettings, initializeSettings } from './stores/settings.js'
import { initializeAgents } from './agents/index.js'
import { configureSandboxHost, configureAppToolSandbox } from './tools/core/sandbox.js'
import { configureAppBackgroundJobs } from './tools/core/background-jobs.js'
import { configureAppProviderRegistry } from './providers/index.js'
import { configureAppScheduler } from './scheduler/index.js'
import { configureAppRipgrep } from './utils/ripgrep.js'
import { configureAppSearchProviders } from './search/providers.js'
import { configureAppSkillManage } from './skills/manage.js'
import { configureAppSkillsLoader } from './skills/loader.js'
import { configureAppPermissionGrants } from './permission/permission-grants.js'
import {
  initializeEventSystem,
  shutdownEventSystem,
  getEventBus,
  getStreamChannel,
} from './events/index.js'
import { initializeSessionLayer, shutdownSessionLayer } from './session/index.js'
import {
  initializeStreamEngine,
  shutdownStreamEngine,
  getStreamEngine,
} from './engine/index.js'
import type { BindableStreamSender } from './engine/stream-engine.js'
import { registerBuiltinTriggers } from './engine/triggers/index.js'
import { initializeCollabV3Runtime, shutdownCollabV3Runtime } from './collab/index.js'
import { Permission } from './permission/index.js'
import { bootstrapVariableSystem } from './variables/index.js'
import { bootstrapGoalStreamBreakers } from './goals/runtime-hooks.js'
import { bootstrapProjectDirs } from './project-dirs/index.js'
import {
  initializeToolRegistry,
  initializeHeadlessToolRegistry,
  initializeReadonlyToolRegistry,
} from './tools/index.js'
// Static edges for the builtin tool barrels: the registry loads them via
// dynamic import (tests re-mock them), but a single-file host bundle needs
// these modules ordered BEFORE the factory's top-level await — a
// dynamic-only edge deadlocks (chunked) or TDZ-crashes (inlined) there.
import './tools/builtin/index.js'
import './tools/builtin/headless.js'
import './tools/builtin/readonly.js'
import { initializeSessionSkills } from './skills/session-skills.js'
import { MCPManager, registerMCPTools } from './mcp/index.js'
import { ACPManager } from './acp/index.js'
import { killTrackedDetachedChildren } from './tools/core/bash-executor.js'
import { killAllTerminals } from './terminal/service.js'

/**
 * Wire the runtime-package adapters that used to be import-time side effects.
 * Explicit and idempotent: hosts (and tests) may call it directly; the
 * factory always runs it first.
 */
export function configureAppRuntimeAdapters(): void {
  configureAppToolSandbox()
  configureAppBackgroundJobs()
  configureAppProviderRegistry()
  configureAppScheduler()
  configureAppRipgrep()
  configureAppSearchProviders()
  configureAppSkillManage()
  configureAppSkillsLoader()
  configureAppPermissionGrants()
}

export interface OnethingBackendHooks {
  /** Runs right after settings are loaded (desktop: shortcuts, network proxy). */
  afterSettings?: () => void | Promise<void>
  /** Runs after the engine + triggers are up, before Permission/tools. */
  afterEngine?: () => void | Promise<void>
  /** Runs after the tool registry is ready (desktop: IPC, todo watcher). */
  afterTools?: () => void | Promise<void>
}

export interface OnethingBackendOptions {
  /** Tool sandbox path surface (downloads/home). Omit to keep the host's own wiring. */
  sandboxHost?: { getPath?: (name: string) => string }
  /**
   * 'full' registers every builtin tool (desktop); 'headless' the reduced set;
   * 'readonly' only tools with zero local side effects (server degradation).
   */
  toolRegistry?: 'full' | 'headless' | 'readonly'
  /** Initialize promptVersion from the minimal prompt scene (evals stamping). */
  promptVersion?: boolean
  /** Load session skills during assembly (hosts deferring to plugin bootstrap skip this). */
  sessionSkills?: boolean
  /**
   * Multi-agent collab rooms (docs/design/multi-agent-collab.md): coordinator +
   * roster prompt provider. Desktop opts in; headless hosts without room UI
   * leave it off — the room ingress gate still refuses uncoordinated streams.
   */
  collab?: boolean
  /** Initialize MCP + ACP inline during assembly (hosts may instead do it post-window). */
  mcpAcp?: boolean
  /** Engine sender to bind; hosts that observe the EventBus directly can omit it. */
  sender?: BindableStreamSender
  hooks?: OnethingBackendHooks
}

export interface OnethingBackend {
  engine: ReturnType<typeof getStreamEngine>
  eventBus: ReturnType<typeof getEventBus>
  streamChannel: ReturnType<typeof getStreamChannel>
  shutdown(): Promise<void>
}

export async function createOnethingBackend(
  options: OnethingBackendOptions = {},
): Promise<OnethingBackend> {
  configureAppRuntimeAdapters()
  if (options.sandboxHost) configureSandboxHost(options.sandboxHost)

  initializeStores()
  await initializeSettings()
  // Agents are read on every turn (and once per room member); warm the cache
  // here so nothing downstream pays a synchronous read + normalize.
  await initializeAgents()
  await options.hooks?.afterSettings?.()

  initializeEventSystem()
  initializeSessionLayer()
  initializeStreamEngine()
  registerBuiltinTriggers()

  if (options.promptVersion) {
    // promptVersion stamps eval traces with the live minimal-scene output so
    // recorded incidents replay against the prompt that actually shipped.
    try {
      const { initPromptVersion, buildOnethingSystemPrompt } = await import('@onething/runtime')
      const { system, developer } = await buildOnethingSystemPrompt({ hasTools: false, skills: [] })
      initPromptVersion([system, ...developer].filter(Boolean).join('\n\n'))
    } catch (error) {
      console.warn('[Backend] Failed to initialize promptVersion:', error)
    }
  }

  await options.hooks?.afterEngine?.()

  Permission.initialize(
    getEventBus(),
    sessionId => getStreamEngine().getChannel(sessionId),
    sessionId => getStreamEngine().getPermissionMode(sessionId),
  )

  // Variables must precede the tool registry (the variable tool reads a
  // populated registry); goal breakers and project dirs are order-free but
  // belong before the first stream.
  bootstrapVariableSystem()
  bootstrapGoalStreamBreakers()
  bootstrapProjectDirs()

  if (options.toolRegistry === 'full') {
    await initializeToolRegistry()
  } else if (options.toolRegistry === 'readonly') {
    await initializeReadonlyToolRegistry()
  } else {
    await initializeHeadlessToolRegistry()
  }
  await options.hooks?.afterTools?.()

  if (options.sessionSkills) {
    await initializeSessionSkills()
  }

  if (options.collab) {
    // Room prompts are assembled as persona-only system prompts inside the
    // prompt build path (engine/prompt/system-prompt.ts collabRoomOverrides)
    // — no plugin prompt provider involved. Static import (top of file): a
    // dynamic import here left the collab modules bundled INSIDE the desktop
    // entry chunk (the ingress gate references them statically), and the CLI
    // daemon's dynamic load then pulled the whole electron entry into Node.
    //
    // D6-a(docs/design/collab-actor-v3.md §6):协作的生产路径从 v2 协调器换成
    // v3 actor 运行时。boot 里那一趟 marker 门控的迁移住在它里面 —— 单向门只有
    // 一个触发点,而这里是唯一一个会在启动时走到它的地方。
    //
    // `await`:迁移与房账续播都要落盘,而它们必须排在第一条用户消息之前 ——
    // 一间还没续播完的房收到 posted,会把上一条命没投完的广播与新消息交错投出去。
    await initializeCollabV3Runtime()
  }

  if (options.mcpAcp) {
    const settings = getSettings()
    await MCPManager.initialize(settings.mcp || { enabled: true, servers: [] })
    await registerMCPTools()
    ACPManager.initialize(settings.acp || { enabled: true, agents: [] })
  }

  if (options.sender) {
    getStreamEngine().bind(options.sender)
  }

  return {
    engine: getStreamEngine(),
    eventBus: getEventBus(),
    streamChannel: getStreamChannel(),
    async shutdown() {
      if (options.collab) {
        try {
          await shutdownCollabV3Runtime()
        } catch (error) {
          console.error('[Backend] collab shutdown error:', error)
        }
      }
      getStreamEngine().abortAll()
      if (options.mcpAcp) {
        await ACPManager.shutdown()
        await MCPManager.shutdown()
      }
      killTrackedDetachedChildren()
      // No-op unless a host actually created terminals. NOTE: the Electron
      // host quits through its beforeQuit cleanup table, not this shutdown —
      // it calls killAllTerminals there itself.
      killAllTerminals()
      shutdownStreamEngine()
      Permission.shutdown()
      shutdownSessionLayer()
      shutdownEventSystem()
      try {
        await flushAllPendingSaves()
      } catch (error) {
        console.error('[Backend] flushAllPendingSaves error:', error)
      }
    },
  }
}
