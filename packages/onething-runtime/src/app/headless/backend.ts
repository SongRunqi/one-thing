import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import type { AppSettings, ChatMessage, ChatSession, PermissionMode } from '@shared/ipc.js'
import type {
  ActiveStreamInfo,
  AskOutputEvent,
  AskRequest,
  AskResult,
  DaemonStreamEvent,
  ProviderSummary,
  SessionSummary,
  ToolSummary,
} from '@shared/cli/protocol.js'
import {
  listOnethingHeadlessProviderModels,
  listOnethingHeadlessProviderSummaries,
  listOnethingHeadlessSessionSummaries,
  listOnethingHeadlessToolSummaries,
  setOnethingHeadlessPermissionMode,
  updateOnethingHeadlessToolSetting,
  upsertOnethingHeadlessProviderConfig,
  useOnethingHeadlessProvider,
} from '@onething/runtime/headless'
import { createOnethingBackend } from '../backend.js'
import { flushAllPendingSaves } from '../store.js'
import {
  createSession,
  deleteSession,
  getCurrentSessionId,
  getSession,
  getSessionsList,
  renameSession,
  saveSettings,
  setCurrentSessionId,
  updateSessionArchived,
  updateSessionModel,
  updateSessionPin,
  updateSessionWorkingDirectory,
} from '../store.js'
import { getSettings } from '../stores/settings.js'
import { getAllToolsAsync } from '../tools/index.js'
import { shutdownEventSystem, getEventBus, getStreamChannel } from '../events/index.js'
import { initializeSessionLayer, shutdownSessionLayer } from '../session/index.js'
import { shutdownStreamEngine, getStreamEngine } from '../engine/index.js'
import { Permission } from '../permission/index.js'
import { MCPManager, registerMCPTools } from '../mcp/index.js'
import { ACPManager } from '../acp/index.js'
import { killTrackedDetachedChildren } from '../tools/core/bash-executor.js'
import { killAllTerminals } from '../terminal/service.js'
import { createDefaultSettings } from '@shared/defaults/settings.js'

type EmitStreamEvent = (event: DaemonStreamEvent) => void

class HeadlessSender extends EventEmitter {
  isDestroyed(): boolean {
    return false
  }

  send(): void {
    // The daemon observes EventBus and StreamChannel directly.
  }
}

interface ActiveStreamRecord extends ActiveStreamInfo {
  resolve: (result: AskResult) => void
  reject: (error: Error) => void
  emit: EmitStreamEvent
  permissionTimers: Map<string, NodeJS.Timeout>
  unsubs: Array<() => void>
}

export class HeadlessBackend {
  private started = false
  private sender = new HeadlessSender()
  private activeStreams = new Map<string, ActiveStreamRecord>()
  private activeStreamBySession = new Map<string, string>()

  async start(): Promise<void> {
    if (this.started) return

    await createOnethingBackend({
      sandboxHost: {
        getPath(name) {
          if (name === 'downloads') return path.join(os.homedir(), 'Downloads')
          if (name === 'home') return os.homedir()
          return os.homedir()
        },
      },
      toolRegistry: 'headless',
      sessionSkills: true,
      mcpAcp: true,
      sender: this.sender,
    })
    this.started = true
  }

  async shutdown(reason = 'daemon shutdown'): Promise<void> {
    for (const stream of this.activeStreams.values()) {
      stream.status = reason === 'daemon restart' ? 'restarting' : 'aborting'
      stream.emit({
        streamId: stream.streamId,
        sessionId: stream.sessionId,
        event: reason === 'daemon restart'
          ? { type: 'error', code: 'DAEMON_RESTART', message: 'Stream interrupted: daemon restarted' }
          : { type: 'done', stopReason: 'aborted' },
      })
    }
    getStreamEngine().abortAll()
    await ACPManager.shutdown()
    await MCPManager.shutdown()
    killTrackedDetachedChildren()
    killAllTerminals() // always a no-op here — the daemon never creates terminals
    shutdownStreamEngine()
    Permission.shutdown()
    shutdownSessionLayer()
    shutdownEventSystem()
    try {
      await flushAllPendingSaves()
    } catch (error) {
      console.error('[Headless] flushAllPendingSaves error:', error)
    }
    this.activeStreams.clear()
    this.activeStreamBySession.clear()
    this.started = false
  }

  getActiveStreams(): ActiveStreamInfo[] {
    return Array.from(this.activeStreams.values()).map(stream => ({
      streamId: stream.streamId,
      sessionId: stream.sessionId,
      ownerClientId: stream.ownerClientId,
      promptPreview: stream.promptPreview,
      startedAt: stream.startedAt,
      status: stream.status,
    }))
  }

  abortStream(streamId: string): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false
    stream.status = 'aborting'
    return getStreamEngine().abort(stream.sessionId, 'CLI active abort')
  }

  async ask(request: AskRequest, ownerClientId: string, emit: EmitStreamEvent): Promise<AskResult> {
    const sessionId = this.resolveSessionId(request.sessionId)
    const streamId = randomUUID()
    const promptPreview = request.prompt.replace(/\s+/g, ' ').trim().slice(0, 120)

    return new Promise<AskResult>((resolve, reject) => {
      const record: ActiveStreamRecord = {
        streamId,
        sessionId,
        ownerClientId,
        promptPreview,
        startedAt: Date.now(),
        status: 'running',
        resolve,
        reject,
        emit,
        permissionTimers: new Map(),
        unsubs: [],
      }

      const cleanup = () => this.cleanupStream(streamId)
      record.unsubs.push(
        getStreamChannel().subscribe(sessionId, chunk => {
          if (chunk.type === 'text-delta') {
            emit({ streamId, sessionId, event: { type: 'text_delta', text: chunk.text } })
          } else if (chunk.type === 'reasoning-delta') {
            emit({ streamId, sessionId, event: { type: 'reasoning_delta', text: chunk.reasoning } })
          }
        }),
        getEventBus().onAny(sessionId, envelope => {
          const event = envelope.event
          switch (event.type) {
            case 'tool:call':
              emit({
                streamId,
                sessionId,
                event: {
                  type: 'tool_use',
                  id: event.toolCall.id,
                  name: event.toolCall.toolName,
                  input: event.toolCall.arguments,
                },
              })
              break
            case 'tool:result':
              emit({
                streamId,
                sessionId,
                event: {
                  type: 'tool_result',
                  id: event.toolCall.id,
                  content: event.toolCall.result ?? event.toolCall.error ?? null,
                  isError: event.toolCall.status === 'failed' || Boolean(event.toolCall.error),
                },
              })
              break
            case 'permission:request':
              if (event.targetChannel !== 'cli') break
              emit({
                streamId,
                sessionId,
                event: {
                  type: 'permission',
                  id: event.requestId,
                  description: event.title,
                  options: ['once', 'session', 'workdir', 'reject'],
                },
              })
              this.startPermissionTimeout(record, event.requestId)
              break
            case 'stream:complete': {
              const stopReason = event.data?.aborted ? 'aborted' : event.data?.error ? 'error' : 'end_turn'
              emit({ streamId, sessionId, event: { type: 'done', stopReason, usage: event.data?.usage } })
              resolve({ streamId, sessionId, stopReason })
              cleanup()
              break
            }
            case 'stream:error':
              emit({ streamId, sessionId, event: { type: 'error', code: 'STREAM_ERROR', message: event.data.error } })
              resolve({ streamId, sessionId, stopReason: 'error' })
              cleanup()
              break
            case 'stream:aborted':
              emit({ streamId, sessionId, event: { type: 'done', stopReason: 'aborted' } })
              resolve({ streamId, sessionId, stopReason: 'aborted' })
              cleanup()
              break
          }
        }, 'CLI daemon stream'),
      )

      this.activeStreams.set(streamId, record)
      this.activeStreamBySession.set(sessionId, streamId)

      getEventBus().emit(sessionId, {
        type: 'command:send-message',
        channel: 'cli',
        content: request.prompt,
        source: request.source || 'cli',
      }).catch(error => {
        emit({
          streamId,
          sessionId,
          event: { type: 'error', code: 'STREAM_START_FAILED', message: errorMessage(error) },
        })
        reject(error instanceof Error ? error : new Error(String(error)))
        cleanup()
      })
    })
  }

  async retryLast(sessionId: string, ownerClientId: string, emit: EmitStreamEvent): Promise<AskResult> {
    const session = getSession(sessionId)
    const lastAssistant = [...(session?.messages || [])].reverse().find(message => message.role === 'assistant')
    if (!lastAssistant) throw new Error('No assistant message to retry')

    const streamId = randomUUID()
    return new Promise<AskResult>((resolve, reject) => {
      const record: ActiveStreamRecord = {
        streamId,
        sessionId,
        ownerClientId,
        promptPreview: 'retry last assistant message',
        startedAt: Date.now(),
        status: 'running',
        resolve,
        reject,
        emit,
        permissionTimers: new Map(),
        unsubs: [],
      }
      const cleanup = () => this.cleanupStream(streamId)
      record.unsubs.push(
        getStreamChannel().subscribe(sessionId, chunk => {
          if (chunk.type === 'text-delta') emit({ streamId, sessionId, event: { type: 'text_delta', text: chunk.text } })
          if (chunk.type === 'reasoning-delta') emit({ streamId, sessionId, event: { type: 'reasoning_delta', text: chunk.reasoning } })
        }),
        getEventBus().onAny(sessionId, envelope => {
          if (envelope.event.type === 'stream:complete') {
            emit({ streamId, sessionId, event: { type: 'done', stopReason: envelope.event.data?.aborted ? 'aborted' : 'end_turn' } })
            resolve({ streamId, sessionId, stopReason: envelope.event.data?.aborted ? 'aborted' : 'end_turn' })
            cleanup()
          } else if (envelope.event.type === 'stream:error') {
            emit({ streamId, sessionId, event: { type: 'error', code: 'STREAM_ERROR', message: envelope.event.data.error } })
            resolve({ streamId, sessionId, stopReason: 'error' })
            cleanup()
          }
        }, 'CLI daemon retry'),
      )
      this.activeStreams.set(streamId, record)
      this.activeStreamBySession.set(sessionId, streamId)
      getEventBus().emit(sessionId, {
        type: 'command:retry-message',
        messageId: lastAssistant.id,
      }).catch(error => {
        reject(error instanceof Error ? error : new Error(String(error)))
        cleanup()
      })
    })
  }

  respondToPermission(sessionId: string, requestId: string, decision: 'once' | 'session' | 'workdir' | 'reject'): void {
    const streamId = this.activeStreamBySession.get(sessionId)
    if (streamId) {
      const stream = this.activeStreams.get(streamId)
      const timer = stream?.permissionTimers.get(requestId)
      if (timer) clearTimeout(timer)
      stream?.permissionTimers.delete(requestId)
    }
    void getEventBus().emit(sessionId, {
      type: 'command:permission-respond',
      channel: 'cli',
      requestId,
      decision,
    })
  }

  listSessions(): SessionSummary[] {
    return listOnethingHeadlessSessionSummaries(getSessionsList())
  }

  newSession(name = 'CLI Chat'): ChatSession {
    const sessionId = randomUUID()
    const session = createSession(sessionId, name)
    setCurrentSessionId(sessionId)
    return session
  }

  useSession(sessionId: string): ChatSession {
    const session = getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    setCurrentSessionId(sessionId)
    return session
  }

  showSession(sessionId?: string): ChatSession {
    const resolved = this.resolveSessionId(sessionId)
    const session = getSession(resolved)
    if (!session) throw new Error(`Session not found: ${resolved}`)
    return session
  }

  renameSession(sessionId: string, name: string): void {
    renameSession(sessionId, name)
  }

  pinSession(sessionId: string, pinned: boolean): void {
    updateSessionPin(sessionId, pinned)
  }

  archiveSession(sessionId: string, archived: boolean): void {
    updateSessionArchived(sessionId, archived, archived ? Date.now() : null)
  }

  deleteSession(sessionId: string): void {
    deleteSession(sessionId)
  }

  sessionCwd(sessionId: string | undefined, cwd?: string | null): string | undefined {
    const resolved = this.resolveSessionId(sessionId)
    if (cwd !== undefined) {
      updateSessionWorkingDirectory(resolved, cwd)
    }
    return getSession(resolved)?.workingDirectory
  }

  sessionModel(sessionId: string | undefined, provider: string, model: string): void {
    updateSessionModel(this.resolveSessionId(sessionId), provider, model)
  }

  listProviders(): ProviderSummary[] {
    return listOnethingHeadlessProviderSummaries(getSettings())
  }

  updateProvider(providerId: string, update: Partial<{ enabled: boolean; apiKey: string; baseUrl: string; model: string; selectedModels: string[] }>): ProviderSummary {
    const settings = getSettings()
    const summary = upsertOnethingHeadlessProviderConfig(
      settings,
      providerId,
      update,
      () => ({
        ...createDefaultSettings().ai.providers.custom,
        model: update.model || '',
        selectedModels: [],
      }),
    )
    saveSettings(settings)
    return summary
  }

  useProvider(providerId: string, model?: string): ProviderSummary {
    const settings = getSettings()
    const summary = useOnethingHeadlessProvider(settings, providerId, model)
    saveSettings(settings)
    return summary
  }

  providerModels(providerId: string): string[] {
    return listOnethingHeadlessProviderModels(getSettings(), providerId)
  }

  async listTools(): Promise<ToolSummary[]> {
    const tools = await getAllToolsAsync()
    return listOnethingHeadlessToolSummaries(tools)
  }

  setTool(toolId: string, update: { enabled?: boolean; autoExecute?: boolean }): void {
    const settings = getSettings()
    updateOnethingHeadlessToolSetting(settings, toolId, update)
    saveSettings(settings)
  }

  setPermissionMode(mode: PermissionMode): AppSettings {
    const settings = getSettings()
    setOnethingHeadlessPermissionMode(settings, mode)
    saveSettings(settings)
    return settings
  }

  private resolveSessionId(sessionId?: string): string {
    if (sessionId && getSession(sessionId)) return sessionId
    const current = getCurrentSessionId()
    if (current && getSession(current)) return current
    return this.newSession().id
  }

  private startPermissionTimeout(stream: ActiveStreamRecord, requestId: string): void {
    if (stream.permissionTimers.has(requestId)) return
    const timer = setTimeout(() => {
      stream.permissionTimers.delete(requestId)
      this.respondToPermission(stream.sessionId, requestId, 'reject')
    }, 60_000)
    timer.unref?.()
    stream.permissionTimers.set(requestId, timer)
  }

  private cleanupStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return
    for (const timer of stream.permissionTimers.values()) clearTimeout(timer)
    for (const unsub of stream.unsubs.splice(0)) {
      try {
        unsub()
      } catch {
        // Best effort cleanup.
      }
    }
    this.activeStreams.delete(streamId)
    if (this.activeStreamBySession.get(stream.sessionId) === streamId) {
      this.activeStreamBySession.delete(stream.sessionId)
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
