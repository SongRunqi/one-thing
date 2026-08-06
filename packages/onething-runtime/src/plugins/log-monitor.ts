import { z } from 'zod'
import {
  CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
  CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
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

  return registerCoreLogMonitorPlugin(api, {
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
}
