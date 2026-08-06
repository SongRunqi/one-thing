import { z } from 'zod'
import {
  CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
  CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
  CORE_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
  createCoreLogMonitorFileDiskAdapters,
  ensureCoreLogMonitorDirectory,
  registerCoreLogMonitorPlugin,
  type CoreLogMonitorPluginApi,
  type CoreLogMonitorPluginRuntime,
} from '@onething/core/plugins'

// Manifests are product data: the plugin's id/描述/作者只有产品层认识,
// core 只提供无名的日志监控原语(守卫:packages/core knows no concrete
// plugin or feature names)。
export const ONETHING_LOG_MONITOR_MANIFEST = {
  name: 'log-monitor',
  version: '1.0.0',
  description: 'Real-time agent event logging with disk persistence, daily rotation, and LLM-searchable logs',
  author: 'onething',
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
}

export type OnethingLogMonitorPluginApi = CoreLogMonitorPluginApi<OnethingLogMonitorSearchToolParameters>

export function registerOnethingLogMonitorPlugin(
  api: OnethingLogMonitorPluginApi,
  options: RegisterOnethingLogMonitorPluginOptions,
): CoreLogMonitorPluginRuntime {
  const logDir = options.getLogDir()
  const logger = options.logger ?? console

  return registerCoreLogMonitorPlugin(api, {
    maxBuffer: CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
    searchToolParameters: createOnethingLogMonitorSearchToolParameters(),
    diskWriterOptions: {
      flushIntervalMs: CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
      retentionDays: CORE_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
      adapters: createCoreLogMonitorFileDiskAdapters(logDir, { log: logger.log?.bind(logger) }),
    },
    ensureLogDir: () => ensureCoreLogMonitorDirectory(logDir),
    logger,
  })
}
