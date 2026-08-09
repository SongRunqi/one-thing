/**
 * Global Event Types
 *
 * Events not scoped to any session.
 */

import type { PluginNotifySound } from '@onething/core/plugins/notify-sound'

// ── App lifecycle ───────────────────────────────

export interface AppInitializedEvent {
  type: 'app:initialized'
  timestamp: number
}

export interface AppQuittingEvent {
  type: 'app:quitting'
  timestamp: number
}

// ── Settings ────────────────────────────────────

export interface SettingsChangedEvent {
  type: 'settings:changed'
  changedKeys: string[]
}

// ── Session lifecycle ───────────────────────────

export interface SessionCreatedEvent {
  type: 'session:created'
  sessionId: string
  name: string
}

export interface SessionSwitchedEvent {
  type: 'session:switched'
  fromSessionId?: string
  toSessionId: string
}

export interface SessionDeletedEvent {
  type: 'session:deleted'
  sessionId: string
}

// ── MCP server lifecycle ────────────────────────

export interface MCPServerConnectedEvent {
  type: 'mcp:server-connected'
  serverId: string
}

export interface MCPServerDisconnectedEvent {
  type: 'mcp:server-disconnected'
  serverId: string
}

export interface MCPServerErrorEvent {
  type: 'mcp:server-error'
  serverId: string
  error: string
}

// ── Plugin lifecycle ────────────────────────────

export interface PluginLoadedEvent {
  type: 'plugin:loaded'
  pluginId: string
}

export interface PluginErrorEvent {
  type: 'plugin:error'
  pluginId: string
  error: string
}

export interface PluginNotificationEvent {
  type: 'plugin:notification'
  pluginId: string
  message: string
  level: 'info' | 'warn' | 'error'
  /**
   * 机械同步信号 —— 有 kind 就**不给人看**,只驱动宿主刷新。
   *
   * 没有它的时候,插件每次 ctx.refresh() 用户都会收到一条
   * `plugin-panel-refresh:log-monitor:logs` 弹窗;message 里那串是给日志看的
   * 地址,不是给人读的句子。给人看的通知(api.ui.notify、熔断告警)不带 kind。
   */
  kind?: 'config-changed' | 'panel-refresh' | 'catalog-changed'
  /** kind = panel-refresh 时的面板 id。 */
  panelId?: string
  /**
   * 提示音(M1)——**宿主裁决后的结果**:枚举校验、静音、限频都已经在装配层
   * 算完。省略 = 不出声,与 M1 之前逐字节一致。机械信号(带 kind 的那些)永远
   * 不带它:那些不给人看,自然也不该给人听。
   */
  sound?: PluginNotifySound
}

// ── Union ───────────────────────────────────────

export type GlobalEvent =
  | AppInitializedEvent
  | AppQuittingEvent
  | SettingsChangedEvent
  | SessionCreatedEvent
  | SessionSwitchedEvent
  | SessionDeletedEvent
  | MCPServerConnectedEvent
  | MCPServerDisconnectedEvent
  | MCPServerErrorEvent
  | PluginLoadedEvent
  | PluginErrorEvent
  | PluginNotificationEvent
