export type {
  CorePluginAPI,
  CorePluginCommandContext,
  CorePluginCommandDefinition,
  CorePluginDefinition,
  CorePluginEntry,
  CorePluginEventHandler,
  CorePluginSchedulerAPI,
  CorePluginStore as CorePluginStoreShape,
  CorePluginStoreData,
  CorePluginToolContext,
  CorePluginToolDefinition,
  CorePluginToolResult,
  MinimalCorePluginUI,
  PluginPermissionGuard,
  PluginManifest,
  PluginSettings,
  PluginSource,
} from './types.js'
export { CorePluginStore } from './store.js'
export type { PluginStoreOptions } from './store.js'
export {
  DEFAULT_PLUGIN_ENTRY,
  checkPluginNeedsInstall,
  createBuiltinPluginDefinitions,
  ensureCorePluginsDir,
  getCorePluginSettingsPath,
  getCorePluginStorePath,
  getCorePluginsDir,
  getPluginEnabledFromSettings,
  getPluginEnabledWithAdapters,
  installCorePluginDependencies,
  loadCorePluginEntry,
  parsePluginDirectory,
  readPluginSettingsFile,
  scanCorePlugins,
  scanPluginDirectories,
  setPluginEnabledInSettings,
  setPluginEnabledWithAdapters,
  writePluginSettingsFile,
} from './loader.js'
export type {
  CorePluginDependencyInstallAdapters,
  CoreBuiltinPluginSpec,
  CorePluginEntryModule,
  CorePluginLoaderPathOptions,
  CorePluginLoaderLogger,
  CorePluginSettingsStorageAdapters,
  LoadCorePluginEntryAdapters,
} from './loader.js'
export {
  CorePluginLifecycleRegistry,
} from './lifecycle.js'
export {
  CorePluginBootstrapper,
  CorePluginManager,
} from './manager.js'
export {
  disposeCorePluginState,
} from './api-state.js'
export {
  createCorePluginAPI,
  executeCorePluginTool,
} from './api-builder.js'
export type {
  CorePluginHostToolContext,
  CorePluginHostToolResult,
} from './api-builder.js'
export {
  createScopedPluginScheduler,
  isPluginTaskSnapshot,
  scopePluginTaskId,
  unscopePluginTaskId,
  unscopePluginTaskSnapshot,
} from './scheduler.js'
export type {
  CorePluginScheduledTaskLike,
  CorePluginSchedulerHandleLike,
  CorePluginSchedulerHost,
  CreateScopedPluginSchedulerOptions,
  PluginTaskSnapshotLike,
} from './scheduler.js'
export {
  CORE_LOG_MONITOR_DEFAULT_FLUSH_INTERVAL_MS,
  CORE_LOG_MONITOR_DEFAULT_MAX_BUFFER,
  CORE_LOG_MONITOR_DEFAULT_RETENTION_DAYS,
  CORE_LOG_MONITOR_HIGH_FREQUENCY_EVENTS,
  CORE_LOG_MONITOR_LOG_FILE_PATTERN,
  CORE_LOG_MONITOR_TRACKED_EVENTS,
  CoreLogMonitorBuffer,
  CoreLogMonitorDiskWriter,
  countLogEventTypes,
  createLogEntry,
  createCoreLogMonitorFileDiskAdapters,
  duplicateLogDiskLine,
  ensureCoreLogMonitorDirectory,
  formatLogErrorsNotification,
  formatLogMonitorDate,
  formatLogSearchOutput,
  formatLogStatsNotification,
  formatLogTail,
  getLogMonitorFileDate,
  getLogMonitorFileName,
  getRecentLogErrors,
  logEntryDiskLine,
  normalizeLogTailCount,
  planLogMonitorCleanup,
  registerCoreLogMonitorPlugin,
  searchLogEntries,
  shouldDeleteLogMonitorFile,
  shouldNotifyLogEntry,
  summarizeLogEvent,
} from './log-monitor.js'
export type {
  CoreLogEntry,
  CoreLogEnvelope,
  CoreLogMonitorCleanupOptions,
  CoreLogMonitorBufferOptions,
  CoreLogMonitorDiskStreamLike,
  CoreLogMonitorDiskWriterAdapters,
  CoreLogMonitorDiskWriterOptions,
  CoreLogMonitorCommandContext,
  CoreLogMonitorPluginApi,
  CoreLogMonitorPluginOptions,
  CoreLogMonitorPluginRuntime,
  CoreLogMonitorPushResult,
  CoreLogMonitorSearchArgs,
  CoreLogMonitorToolContext,
} from './log-monitor.js'

export type {
  CorePluginAPIState,
  DisposeCorePluginStateOptions,
} from './api-state.js'
export type {
  CorePluginAPIHost,
  CorePluginAPILogger,
  CreateCorePluginAPIOptions,
} from './api-builder.js'
export type {
  CoreAfterAssistantResponseContext,
  CoreAfterAssistantResponseHook,
  CoreBeforeContextCompactContext,
  CoreBeforeContextCompactHook,
  CorePluginLifecycleLogger,
} from './lifecycle.js'
export type {
  CorePluginBootstrapperOptions,
  CorePluginInfo,
  CorePluginManagerHost,
  CorePluginManagerLogger,
  CorePluginStateLike,
} from './manager.js'
