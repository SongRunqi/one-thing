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
  buildPluginEntryImportSpecifier,
  checkPluginMinAppVersion,
  checkPluginNeedsInstall,
  compareCoreSemver,
  scanPluginSourceEntries,
  validatePluginContributes,
  createBuiltinPluginDefinitions,
  ensureCorePluginsDir,
  getCorePluginSettingsPath,
  getCorePluginStorePath,
  getCorePluginsDir,
  getPluginEnabledFromSettings,
  getPluginEnabledWithAdapters,
  getPluginConfigFromSettings,
  getPluginHealthFromSettings,
  listPluginHealthFromSettings,
  setPluginConfigInSettings,
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
  CorePluginScanTrust,
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
  CORE_PLUGIN_REQUEST_TIMEOUT_MS,
  CORE_PLUGIN_SETTINGS_HOOK_TIMEOUT_MS,
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
export { deepFreezeCorePluginValue } from './freeze.js'
export {
  PLUGIN_DEFERRED_REGISTRIES,
  PLUGIN_OPEN_REGISTRIES,
  PLUGIN_REGISTRY_POLICY,
  PLUGIN_SCOPE_FAMILIES,
  PLUGIN_SEVERITY_TABLE,
  classifyPluginScope,
  describePluginSurface,
  resolvePluginScopeSeverity,
} from './policy.js'
export type {
  PluginFailureRemedy,
  PluginOpenRegistry,
  PluginRegistryPolicy,
  PluginRegistryTeardown,
  PluginScopeFamily,
  PluginSeverityRule,
  ResolvedPluginSeverity,
} from './policy.js'
export {
  CORE_PLUGIN_STATUS_MAX_ID,
  CORE_PLUGIN_STATUS_MAX_LABEL,
  CORE_PLUGIN_STATUS_MAX_PER_PLUGIN,
  CORE_PLUGIN_STATUS_MAX_PLUGINS_PER_SESSION,
  CORE_PLUGIN_STATUS_MAX_SESSIONS,
  CORE_PLUGIN_STATUS_THROTTLE_MS,
  CorePluginStatusRegistry,
  PLUGIN_STATUS_PART_TYPE,
} from './status.js'
export type {
  CorePluginStatusKey,
  CorePluginStatusPart,
  CorePluginStatusRecord,
  CorePluginStatusRegistryOptions,
} from './status.js'
export type { CorePluginStatusAPI } from './types.js'
export {
  MAX_PANEL_DEPTH,
  PANEL_TREE_SCAN_DEPTH,
  PLUGIN_PANEL_INVOKE_ACTION,
  PLUGIN_PANEL_PROTOCOL_VERSION,
  PLUGIN_PANEL_RENDER_ACTION,
  describePluginPanelResultProblem,
  isReservedPluginPanelAction,
  validatePluginPanelActionResult,
  validatePluginPanelTree,
} from './panel.js'
export type {
  CorePluginPanelContext,
  CorePluginPanelRegistration,
  PluginPanelActionResult,
  PluginPanelButtonNode,
  PluginPanelEmptyStateNode,
  PluginPanelFormField,
  PluginPanelFormNode,
  PluginPanelListItem,
  PluginPanelListNode,
  PluginPanelMarkdownNode,
  PluginPanelNode,
  PluginPanelRowNode,
  PluginPanelStackNode,
  PluginPanelTree,
} from './panel.js'
export {
  PLUGIN_DATA_LEGACY_BACKUP_DIR,
  PLUGIN_KV_FILE_NAME,
  PLUGIN_LEGACY_KV_FILE_NAME,
  PLUGIN_ORPHAN_ARCHIVE_LIMIT,
  PLUGIN_SETTINGS_KEYS,
  PluginStorageError,
  archiveCorePluginData,
  assertSafePluginDirName,
  assertSafePluginFileName,
  createCorePluginStorage,
  decidePluginOrphanArchive,
  findCorePluginDataOrphans,
  getCorePluginDataDir,
  getCorePluginDataFootprint,
  getCorePluginKvPath,
  getCorePluginLegacyKvPath,
  migrateLegacyPluginKv,
  restoreCorePluginDataArchive,
} from './storage.js'
export type {
  ArchiveCorePluginDataResult,
  CorePluginDataFootprint,
  CorePluginDataOrphan,
  CorePluginStorage,
  CreateCorePluginStorageOptions,
  PluginOrphanArchiveDecision,
  PluginStorageErrorCode,
} from './storage.js'
export {
  createCorePluginAPI,
  executeCorePluginTool,
} from './api-builder.js'
export type {
  CorePluginHostToolContext,
  CorePluginHostToolResult,
} from './api-builder.js'
export {
  CorePluginRequestRegistry,
  PLUGIN_REQUEST_ABORTED_ERROR,
  assertPluginPayloadSerializable,
  describeNonSerializable,
  normalizePluginRequestAction,
  pluginRequestErrorMessage,
} from './request-channel.js'
export type {
  CorePluginRequestContext,
  CorePluginRequestHandler,
  CorePluginRequestInput,
  CorePluginRequestResult,
} from './request-channel.js'
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
