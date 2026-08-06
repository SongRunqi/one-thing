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
  PersistedPluginHealth,
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
  getPluginHealthFromSettings,
  listPluginHealthFromSettings,
  setPluginHealthInSettings,
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
export {
  installCorePluginDependenciesAsync,
} from './loader.js'
export type {
  CorePluginDependencyInstallAdapters,
  CorePluginDependencyInstallAsyncAdapters,
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
  CORE_PLUGIN_ENTRY_TIMEOUT_MS,
  CORE_PLUGIN_FAILURE_THRESHOLD,
  CORE_PLUGIN_INSTALL_TIMEOUT_MS,
  CORE_PLUGIN_LIFECYCLE_HOOK_TIMEOUT_MS,
  CORE_PLUGIN_PROMPT_CONTEXT_TIMEOUT_MS,
  CorePluginHealthTracker,
  CorePluginTimeoutError,
  isCorePluginTimeoutError,
  runWithPluginTimeout,
} from './runtime-guard.js'
export type {
  CorePluginHealthStatus,
  CorePluginHealthTrackerOptions,
  CorePluginRuntimeHealth,
} from './runtime-guard.js'
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
  CorePluginLifecycleRegistryOptions,
} from './lifecycle.js'
export type {
  CorePluginBootstrapperOptions,
  CorePluginInfo,
  CorePluginManagerHost,
  CorePluginManagerLogger,
  CorePluginManagerOptions,
  CorePluginStateLike,
} from './manager.js'
