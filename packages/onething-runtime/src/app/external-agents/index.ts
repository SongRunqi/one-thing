import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  createClaudeCodeConnector,
  CLAUDE_CODE_AGENT_CONNECTOR_ID,
} from '@onething/runtime/external-agents'
import type {
  ExternalAgentConnector,
  ExternalAgentPermissionAsk,
  ExternalAgentSessionLink,
} from '@onething/runtime/external-agents'
import { Permission } from '../permission/index.js'
import { getSession, getSettings } from '../store.js'
import { getStorePath } from '../stores/paths.js'
import { resolveClaudeCodeHostToolSurface } from './host-tools.js'
import type { ChatMessage } from '@shared/ipc.js'

export { resolveClaudeCodeHostToolSurface } from './host-tools.js'

// ---------------------------------------------------------------------------
// CLI detection
// ---------------------------------------------------------------------------

const CLAUDE_CANDIDATE_PATHS = [
  join(homedir(), '.local/bin/claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
]

let cachedClaudeExecutable: string | null | undefined

/** Locate the locally installed Claude Code CLI; cached for the process lifetime. */
export function findClaudeExecutable(): string | undefined {
  if (cachedClaudeExecutable !== undefined) return cachedClaudeExecutable ?? undefined
  for (const candidate of CLAUDE_CANDIDATE_PATHS) {
    if (existsSync(candidate)) {
      cachedClaudeExecutable = candidate
      return candidate
    }
  }
  try {
    const resolved = execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf8' }).trim()
    cachedClaudeExecutable = resolved || null
  } catch {
    cachedClaudeExecutable = null
  }
  return cachedClaudeExecutable ?? undefined
}

// ---------------------------------------------------------------------------
// Session link persistence (module-owned; survives app restarts)
// ---------------------------------------------------------------------------

type SessionLinkStore = Record<string, ExternalAgentSessionLink>

function sessionLinksPath(): string {
  return join(getStorePath(), 'external-agents', 'session-links.json')
}

function linkKey(connectorId: string, localSessionId: string): string {
  return `${connectorId}:${localSessionId}`
}

function readSessionLinks(): SessionLinkStore {
  try {
    return JSON.parse(readFileSync(sessionLinksPath(), 'utf8')) as SessionLinkStore
  } catch {
    return {}
  }
}

function writeSessionLinks(store: SessionLinkStore): void {
  const path = sessionLinksPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8')
}

export function resolveExternalAgentSessionLink(
  connectorId: string,
  localSessionId: string,
): ExternalAgentSessionLink | undefined {
  return readSessionLinks()[linkKey(connectorId, localSessionId)]
}

export function persistExternalAgentSessionLink(link: ExternalAgentSessionLink): void {
  const store = readSessionLinks()
  store[linkKey(link.connectorId, link.localSessionId)] = link
  writeSessionLinks(store)
}

// ---------------------------------------------------------------------------
// Permission bridge
// ---------------------------------------------------------------------------

function resolveActiveAssistantMessageId(sessionId: string): string | undefined {
  const messages = getSession(sessionId)?.messages as ChatMessage[] | undefined
  if (!messages) return undefined
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') return messages[index].id
  }
  return undefined
}

async function askExternalAgentPermission(ask: ExternalAgentPermissionAsk): Promise<boolean> {
  const messageId = ask.messageId ?? resolveActiveAssistantMessageId(ask.localSessionId) ?? ''
  try {
    await Permission.ask({
      type: 'external-agent',
      title: `Claude Code: ${ask.toolName}`,
      callId: undefined,
      sessionId: ask.localSessionId,
      messageId,
      metadata: {
        connectorId: ask.connectorId,
        toolName: ask.toolName,
        input: JSON.parse(JSON.stringify(ask.input ?? null)),
      },
      workingDirectory: ask.cwd,
    })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Spawn environment
// ---------------------------------------------------------------------------

/**
 * Environment for spawned agent CLIs. A GUI-launched app carries no shell
 * proxy variables, and a direct connection to the model APIs is
 * region-blocked (403 "Request not allowed") — so the app's own proxy
 * settings are translated into the standard env vars. Existing env values
 * win so a shell-launched dev run keeps its own proxy.
 */
export function resolveExternalAgentSpawnEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  const proxy = getSettings().network?.proxy
  if (proxy?.enabled && proxy.url) {
    env.HTTPS_PROXY = env.HTTPS_PROXY ?? proxy.url
    env.HTTP_PROXY = env.HTTP_PROXY ?? proxy.url
    env.https_proxy = env.https_proxy ?? proxy.url
    env.http_proxy = env.http_proxy ?? proxy.url
    if (proxy.bypassRules) {
      const noProxy = proxy.bypassRules.split(';').map(rule => rule.trim()).filter(Boolean).join(',')
      env.NO_PROXY = env.NO_PROXY ?? noProxy
      env.no_proxy = env.no_proxy ?? noProxy
    }
  }
  return env
}

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

let connectors: Record<string, ExternalAgentConnector | undefined> | undefined

export function getExternalAgentConnectors(): Record<string, ExternalAgentConnector | undefined> {
  if (connectors) return connectors
  connectors = {
    [CLAUDE_CODE_AGENT_CONNECTOR_ID]: createClaudeCodeConnector({
      executablePath: findClaudeExecutable(),
      permissionHandler: askExternalAgentPermission,
      resolveSpawnEnv: resolveExternalAgentSpawnEnv,
      // E3 宿主工具面:协作工具经进程内 MCP 注入 SDK,发言权回到房间(§2)。
      // 连接器仍会再问一次 E0 能力表(`hostTools`)—— 装上不等于开着。
      hostToolSurface: resolveClaudeCodeHostToolSurface,
      logger: console,
    }),
  }
  return connectors
}

export async function disposeExternalAgentConnectors(): Promise<void> {
  if (!connectors) return
  await Promise.allSettled(
    Object.values(connectors).filter(Boolean).map(connector => connector!.dispose()),
  )
  connectors = undefined
}
