import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import {
  CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
  CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
  CORE_LOG_MONITOR_LOG_FILE_PATTERN,
  CORE_LOG_MONITOR_DEFAULT_RETENTION_DAYS as ONETHING_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
  createCoreLogMonitorFileDiskAdapters,
  ensureCoreLogMonitorDirectory,
  registerCoreLogMonitorPlugin,
  type CoreLogMonitorPluginApi,
  type CoreLogMonitorPluginRuntime,
} from '@onething/core/plugins'

// Manifests are product data: the plugin's id/描述/作者只有产品层认识,
// core 只提供无名的日志监控原语(守卫:packages/core knows no concrete
// plugin or feature names)。
/**
 * schema 是这个插件配置的**唯一事实源**(R3 裁决:没有运行期 registerSettings)。
 * 内置插件的 manifest 住在代码里,所以它就写在这儿;用户插件写在 plugin.json。
 * 宿主只读它就能渲染配置区、校验、填默认值 —— 一行插件代码都不执行。
 */
export const ONETHING_LOG_MONITOR_MANIFEST = {
  name: 'log-monitor',
  version: '1.0.0',
  description: 'Real-time agent event logging with disk persistence, daily rotation, and LLM-searchable logs',
  author: 'onething',
  contributes: {
    // 面板的静态存在感(R5 裁决一):宿主凭清单渲染入口,一行插件代码都不跑。
    panels: [
      { id: 'logs', label: 'Agent logs' },
    ],
    settings: {
      title: 'Log monitor',
      schema: {
        type: 'object',
        properties: {
          retentionDays: {
            type: 'integer',
            title: 'Log retention (days)',
            description: 'Daily log files older than this are deleted during cleanup.',
            default: ONETHING_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
            minimum: 1,
            maximum: 365,
          },
          flushIntervalMs: {
            type: 'integer',
            title: 'Flush interval (ms)',
            // 语义:对**已排定**的那次 flush 不生效,下一次排定时才按新值走
            // (定时器已经在跑了,不为了一个日志间隔去重排它)。
            description: 'How long buffered log lines wait before hitting disk. Applies from the next scheduled flush.',
            default: CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
            minimum: 100,
            maximum: 60_000,
          },
          notifyOnErrors: {
            type: 'boolean',
            title: 'Notify on stream errors',
            description: 'Raise a UI notification when an error event is logged.',
            default: true,
          },
        },
      },
    },
  },
}

export const ONETHING_LOG_MONITOR_DEFAULT_CONFIG = {
  retentionDays: ONETHING_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
  flushIntervalMs: CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
  notifyOnErrors: true,
}

export interface OnethingLogMonitorConfig {
  retentionDays: number
  flushIntervalMs: number
  notifyOnErrors: boolean
}

/** 读一份配置快照,缺项回落默认 —— 配置区还没被动过时也要能跑。 */
export function resolveOnethingLogMonitorConfig(raw: unknown): OnethingLogMonitorConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<OnethingLogMonitorConfig>
  return {
    retentionDays: typeof input.retentionDays === 'number'
      ? input.retentionDays
      : ONETHING_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
    flushIntervalMs: typeof input.flushIntervalMs === 'number'
      ? input.flushIntervalMs
      : CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
    notifyOnErrors: typeof input.notifyOnErrors === 'boolean' ? input.notifyOnErrors : true,
  }
}

export function createOnethingLogMonitorSearchToolParameters() {
  return z.object({
    eventType: z.string().optional().describe('Filter by event type, e.g. "tool:call" or "stream:error".'),
    query: z.string().optional().describe('Free-text search in event summaries. Case-insensitive.'),
    limit: z.number().optional().describe('Max results (default 30, max 100).'),
  })
}

export type OnethingLogMonitorSearchToolParameters = ReturnType<typeof createOnethingLogMonitorSearchToolParameters>

export interface RegisterOnethingLogMonitorPluginOptions {
  getLogDir(): string
  logger?: Pick<Console, 'log'>
  /**
   * 配置取值器的覆盖点(测试用)。
   *
   * 生产路径不需要传:实现自己从 `api.settings.get()` 读 —— 配置是插件的能力,
   * 读它属于插件实现,不属于装配层的插座(守卫:facade 禁碰 api.*)。
   */
  getConfig?(): OnethingLogMonitorConfig
}

export type OnethingLogMonitorPluginApi = CoreLogMonitorPluginApi<OnethingLogMonitorSearchToolParameters>

export function registerOnethingLogMonitorPlugin(
  api: OnethingLogMonitorPluginApi,
  options: RegisterOnethingLogMonitorPluginOptions,
): CoreLogMonitorPluginRuntime {
  const logDir = options.getLogDir()
  const logger = options.logger ?? console

  // 取值器而不是快照值:设置页改一次,下一次 flush / cleanup / 通知就按新值走,
  // 不必等 disable→enable。
  const readConfig = options.getConfig
    ?? (() => resolveOnethingLogMonitorConfig(api.settings?.get?.()))

  const runtime = registerCoreLogMonitorPlugin(api, {
    maxBuffer: CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
    searchToolParameters: createOnethingLogMonitorSearchToolParameters(),
    diskWriterOptions: {
      // 取值器:设置页改一次,下一次 flush / cleanup 就按新值走。
      flushIntervalMs: () => readConfig().flushIntervalMs,
      retentionDays: () => readConfig().retentionDays,
      adapters: createCoreLogMonitorFileDiskAdapters(logDir, { log: logger.log?.bind(logger) }),
    },
    shouldNotify: () => readConfig().notifyOnErrors,
    ensureLogDir: () => ensureCoreLogMonitorDirectory(logDir),
    logger,
  })

  registerOnethingLogMonitorPanel(api, { logDir, readConfig, runtime })

  return runtime
}

// ── 示范面板(R5 验收主体) ────────────────────
//
// "文件列表 + 尾部预览 + 一排按钮" 恰是 soul-memory 当年为之改了 16,989 行宿主
// 代码的那种形态。这里全程只用插件 API:manifest 声明入口、描述树画内容、
// actionId 寻址按钮 —— 宿主一行都不用改。

export interface OnethingLogMonitorPanelApi {
  registerWorkspacePanel(registration: {
    id: string
    render(ctx: { refresh(): void }): unknown
    onAction?(input: { actionId: string; payload?: unknown }, ctx: { refresh(): void }): unknown
  }): void
  storage?: { dir(): string }
}

interface LogMonitorPanelOptions {
  logDir: string
  readConfig(): OnethingLogMonitorConfig
  runtime: CoreLogMonitorPluginRuntime
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function registerOnethingLogMonitorPanel(
  api: OnethingLogMonitorPluginApi & { registerWorkspacePanel?: unknown },
  options: LogMonitorPanelOptions,
): void {
  if (typeof api.registerWorkspacePanel !== 'function') return

  let selectedFile: string | null = null

  const listLogFiles = (): Array<{ name: string; size: number }> => {
    try {
      return fs.readdirSync(options.logDir)
        .filter(name => CORE_LOG_MONITOR_LOG_FILE_PATTERN.test(name))
        .map(name => {
          let size = 0
          try {
            size = fs.statSync(path.join(options.logDir, name)).size
          } catch {
            size = 0
          }
          return { name, size }
        })
        .sort((a, b) => b.name.localeCompare(a.name))
    } catch {
      return []
    }
  }

  const tailOf = (name: string, lines = 20): string => {
    try {
      const raw = fs.readFileSync(path.join(options.logDir, name), 'utf-8')
      return raw.split('\n').filter(Boolean).slice(-lines).join('\n')
    } catch (error) {
      return `Cannot read ${name}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  api.registerWorkspacePanel({
    id: 'logs',
    render() {
      const files = listLogFiles()
      const config = options.readConfig()
      const body: Record<string, unknown> = {
        type: 'stack',
        gap: 'medium',
        children: [
          {
            type: 'markdown',
            text: `In-memory buffer: **${options.runtime.buffer.size}** entries · `
              + `retention **${config.retentionDays}d** · flush **${config.flushIntervalMs}ms**`,
          },
          {
            type: 'list',
            title: 'Log files',
            emptyText: 'No log files yet — they appear once the agent starts streaming.',
            items: files.map(file => ({
              id: file.name,
              title: file.name,
              subtitle: formatBytes(file.size),
              badge: file.name === selectedFile ? 'selected' : undefined,
              actionId: 'select-file',
              payload: { name: file.name },
            })),
          },
          {
            type: 'row',
            children: [
              { type: 'button', label: 'Open log folder', actionId: 'open-folder' },
              { type: 'button', label: 'Clean up old logs', actionId: 'cleanup', variant: 'danger' },
              { type: 'button', label: 'Clear buffer', actionId: 'clear-buffer' },
            ],
          },
        ],
      }

      if (selectedFile) {
        ;(body.children as unknown[]).splice(2, 0, {
          type: 'markdown',
          text: `#### ${selectedFile}\n\n\`\`\`\n${tailOf(selectedFile) || '(empty)'}\n\`\`\``,
        })
      }

      return { version: 1, title: 'Agent logs', body }
    },

    onAction(input: { actionId: string; payload?: unknown }) {
      switch (input.actionId) {
        case 'select-file': {
          const name = (input.payload as { name?: string } | undefined)?.name
          selectedFile = typeof name === 'string' && name === selectedFile ? null : name ?? null
          return { refresh: true }
        }
        case 'open-folder':
          // 打开目录是宿主能力,插件只能说"我想打开它" —— 这里给出路径,
          // 由用户/宿主决定怎么处理(不在插件里 spawn 一个 open)。
          return { refresh: false, notice: `Log folder: ${options.logDir}` }
        case 'cleanup':
          options.runtime.diskWriter.cleanupOldLogs()
          return { refresh: true, notice: 'Old log files cleaned up.' }
        case 'clear-buffer': {
          const cleared = options.runtime.buffer.clear()
          return { refresh: true, notice: `Cleared ${cleared} buffered events.` }
        }
        default:
          return { refresh: false }
      }
    },
  })
}
