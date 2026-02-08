/**
 * IPC Channel Names
 * All IPC channel constants for Electron main <-> renderer communication
 */

export const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  SEND_MESSAGE_STREAM: 'chat:send-message-stream',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',
  EDIT_AND_RESEND: 'chat:edit-and-resend',
  EDIT_AND_RESEND_STREAM: 'chat:edit-and-resend-stream',

  // Streaming related
  STREAM_CHUNK: 'chat:stream-chunk',
  STREAM_REASONING_DELTA: 'chat:stream-reasoning-delta',
  STREAM_TEXT_DELTA: 'chat:stream-text-delta',
  STREAM_COMPLETE: 'chat:stream-complete',
  STREAM_ERROR: 'chat:stream-error',
  ABORT_STREAM: 'chat:abort-stream',
  GET_ACTIVE_STREAMS: 'chat:get-active-streams',

  // UIMessage streaming (AI SDK 5.x compatible)
  UI_MESSAGE_STREAM: 'chat:ui-message-stream',

  // Skill usage notification
  SKILL_ACTIVATED: 'chat:skill-activated',

  // Image generation notification
  IMAGE_GENERATED: 'chat:image-generated',

  // Step tracking for showing AI reasoning process
  STEP_ADDED: 'chat:step-added',
  STEP_UPDATED: 'chat:step-updated',

  // Session related
  GET_SESSIONS: 'sessions:get-all',
  CREATE_SESSION: 'sessions:create',
  SWITCH_SESSION: 'sessions:switch',
  DELETE_SESSION: 'sessions:delete',
  RENAME_SESSION: 'sessions:rename',
  CREATE_BRANCH: 'sessions:create-branch',
  UPDATE_SESSION_PIN: 'sessions:update-pin',
  UPDATE_SESSION_MODEL: 'sessions:update-model',
  UPDATE_SESSION_ARCHIVED: 'sessions:update-archived',
  UPDATE_SESSION_AGENT: 'sessions:update-agent',
  UPDATE_SESSION_WORKING_DIRECTORY: 'sessions:update-working-directory',
  GET_SESSION: 'sessions:get',
  GET_SESSION_TOKEN_USAGE: 'sessions:get-token-usage',
  UPDATE_SESSION_MAX_TOKENS: 'sessions:update-max-tokens',
  CONTEXT_SIZE_UPDATED: 'sessions:context-size-updated',
  CONTEXT_COMPACT_STARTED: 'sessions:context-compact-started',
  CONTEXT_COMPACT_COMPLETED: 'sessions:context-compact-completed',
  SET_SESSION_BUILTIN_MODE: 'sessions:set-builtin-mode',
  GET_SESSION_BUILTIN_MODE: 'sessions:get-builtin-mode',
  PLAN_UPDATED: 'sessions:plan-updated',

  // Session optimization (metadata separation)
  GET_SESSIONS_LIST: 'sessions:get-list',           // Returns SessionMeta[] only (no messages)
  ACTIVATE_SESSION: 'sessions:activate',            // Mark session as active, return details
  GET_SESSION_MESSAGES: 'sessions:get-messages',    // Returns ChatMessage[] for a session
  SESSION_MESSAGES_CHANGED: 'sessions:messages-changed',  // Event: messages added/updated

  // Settings related
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  OPEN_SETTINGS_WINDOW: 'settings:open-window',
  SETTINGS_CHANGED: 'settings:changed',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',

  // Models related
  FETCH_MODELS: 'models:fetch',
  GET_CACHED_MODELS: 'models:get-cached',
  // Model registry (OpenRouter-based with capabilities)
  GET_MODELS_WITH_CAPABILITIES: 'models:get-with-capabilities',
  GET_ALL_MODELS: 'models:get-all',
  SEARCH_MODELS: 'models:search',
  REFRESH_MODEL_REGISTRY: 'models:refresh-registry',
  GET_MODEL_NAME_ALIASES: 'models:get-name-aliases',
  GET_MODEL_DISPLAY_NAME: 'models:get-display-name',

  // Embedding models (from Models.dev registry)
  GET_EMBEDDING_MODELS: 'models:get-embedding',
  GET_ALL_EMBEDDING_MODELS: 'models:get-all-embedding',
  GET_EMBEDDING_DIMENSION: 'models:get-embedding-dimension',

  // Providers related
  GET_PROVIDERS: 'providers:get-all',

  // Tools related
  GET_TOOLS: 'tools:get-all',
  EXECUTE_TOOL: 'tools:execute',
  CANCEL_TOOL: 'tools:cancel',
  UPDATE_TOOL_CALL: 'tools:update-tool-call',
  REFRESH_ASYNC_TOOLS: 'tools:refresh-async',
  STREAM_TOOL_CALL: 'chat:stream-tool-call',
  STREAM_TOOL_RESULT: 'chat:stream-tool-result',
  UPDATE_CONTENT_PARTS: 'chat:update-content-parts',
  UPDATE_MESSAGE_THINKING_TIME: 'chat:update-thinking-time',
  RESUME_AFTER_TOOL_CONFIRM: 'chat:resume-after-tool-confirm',

  // Permission related
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESPOND: 'permission:respond',
  PERMISSION_GET_PENDING: 'permission:get-pending',
  PERMISSION_CLEAR_SESSION: 'permission:clear-session',

  // MCP related
  MCP_GET_SERVERS: 'mcp:get-servers',
  MCP_ADD_SERVER: 'mcp:add-server',
  MCP_UPDATE_SERVER: 'mcp:update-server',
  MCP_REMOVE_SERVER: 'mcp:remove-server',
  MCP_CONNECT_SERVER: 'mcp:connect-server',
  MCP_DISCONNECT_SERVER: 'mcp:disconnect-server',
  MCP_REFRESH_SERVER: 'mcp:refresh-server',
  MCP_GET_TOOLS: 'mcp:get-tools',
  MCP_CALL_TOOL: 'mcp:call-tool',
  MCP_GET_RESOURCES: 'mcp:get-resources',
  MCP_READ_RESOURCE: 'mcp:read-resource',
  MCP_GET_PROMPTS: 'mcp:get-prompts',
  MCP_GET_PROMPT: 'mcp:get-prompt',
  MCP_READ_CONFIG_FILE: 'mcp:read-config-file',

  // Dialog related
  SHOW_OPEN_DIALOG: 'dialog:show-open',

  // Image Preview related
  OPEN_IMAGE_PREVIEW: 'media:open-image-preview',
  OPEN_IMAGE_GALLERY: 'media:open-image-gallery',
  IMAGE_PREVIEW_UPDATE: 'image-preview:update',
  IMAGE_GALLERY_UPDATE: 'image-gallery:update',

  // Skills related (Official Claude Code Skills)
  SKILLS_GET_ALL: 'skills:get-all',
  SKILLS_REFRESH: 'skills:refresh',
  SKILLS_READ_FILE: 'skills:read-file',
  SKILLS_OPEN_DIRECTORY: 'skills:open-directory',
  SKILLS_CREATE: 'skills:create',
  SKILLS_DELETE: 'skills:delete',
  SKILLS_TOGGLE_ENABLED: 'skills:toggle-enabled',

  // Workspace related
  WORKSPACE_GET_ALL: 'workspaces:get-all',
  WORKSPACE_CREATE: 'workspaces:create',
  WORKSPACE_UPDATE: 'workspaces:update',
  WORKSPACE_DELETE: 'workspaces:delete',
  WORKSPACE_SWITCH: 'workspaces:switch',
  WORKSPACE_UPLOAD_AVATAR: 'workspaces:upload-avatar',

  // User Profile related
  USER_PROFILE_GET: 'user-profile:get',
  USER_PROFILE_ADD_FACT: 'user-profile:add-fact',
  USER_PROFILE_UPDATE_FACT: 'user-profile:update-fact',
  USER_PROFILE_DELETE_FACT: 'user-profile:delete-fact',

  // Agent Memory related
  AGENT_MEMORY_GET_RELATIONSHIP: 'agent-memory:get-relationship',
  AGENT_MEMORY_ADD_MEMORY: 'agent-memory:add-memory',
  AGENT_MEMORY_DELETE: 'agent-memory:delete',
  AGENT_MEMORY_RECALL: 'agent-memory:recall',
  AGENT_MEMORY_GET_ACTIVE: 'agent-memory:get-active',
  AGENT_MEMORY_UPDATE_RELATIONSHIP: 'agent-memory:update-relationship',
  AGENT_MEMORY_RECORD_INTERACTION: 'agent-memory:record-interaction',

  // Memory Feedback related (deprecated: use memoryFeedbackRouter from ./memory-feedback.ts)
  /** @deprecated Use memoryFeedbackRouter instead */
  MEMORY_FEEDBACK_RECORD: 'memory-feedback:record',
  /** @deprecated Use memoryFeedbackRouter instead */
  MEMORY_FEEDBACK_GET_STATS: 'memory-feedback:get-stats',

  // Memory Management related
  MEMORY_LIST_FILES: 'memory:list-files',
  MEMORY_GET_FILE: 'memory:get-file',
  MEMORY_UPDATE_FILE: 'memory:update-file',
  MEMORY_DELETE_FILE: 'memory:delete-file',
  MEMORY_DELETE_FILES: 'memory:delete-files',
  MEMORY_EXPORT: 'memory:export',
  MEMORY_EXPORT_WITH_DIALOG: 'memory:export-with-dialog',
  MEMORY_IMPORT: 'memory:import',
  MEMORY_IMPORT_WITH_DIALOG: 'memory:import-with-dialog',
  MEMORY_GET_TAGS: 'memory:get-tags',
  MEMORY_RENAME_TAG: 'memory:rename-tag',
  MEMORY_DELETE_TAG: 'memory:delete-tag',
  MEMORY_GET_STATS: 'memory:get-stats',
  MEMORY_REBUILD_INDEX: 'memory:rebuild-index',

  // Theme related
  THEME_GET_ALL: 'themes:get-all',
  THEME_GET: 'themes:get',
  THEME_APPLY: 'themes:apply',
  THEME_REFRESH: 'themes:refresh',
  THEME_OPEN_FOLDER: 'themes:open-folder',

  // OAuth related
  OAUTH_START: 'oauth:start',
  OAUTH_CALLBACK: 'oauth:callback',
  OAUTH_REFRESH: 'oauth:refresh',
  OAUTH_LOGOUT: 'oauth:logout',
  OAUTH_STATUS: 'oauth:status',
  OAUTH_DEVICE_POLL: 'oauth:device-poll',
  OAUTH_TOKEN_REFRESHED: 'oauth:token-refreshed',
  OAUTH_TOKEN_EXPIRED: 'oauth:token-expired',

  // Files related (for @ file search)
  FILES_LIST: 'files:list',

  // File rollback related
  FILE_ROLLBACK: 'files:rollback',

  // Directories related (for /cd path completion)
  DIRS_LIST: 'dirs:list',

  // Custom Agent related
  CUSTOM_AGENT_GET_ALL: 'custom-agents:get-all',
  CUSTOM_AGENT_REFRESH: 'custom-agents:refresh',
  CUSTOM_AGENT_OPEN_DIRECTORY: 'custom-agents:open-directory',
  CUSTOM_AGENT_CREATE: 'custom-agents:create',
  CUSTOM_AGENT_UPDATE: 'custom-agents:update',
  CUSTOM_AGENT_DELETE: 'custom-agents:delete',
  CUSTOM_AGENT_GET: 'custom-agents:get',
  CUSTOM_AGENT_GET_AVAILABLE_BUILTIN_TOOLS: 'custom-agents:get-available-builtin-tools',
  // CustomAgent permission (for tools that need user confirmation within CustomAgent execution)
  CUSTOM_AGENT_PERMISSION_REQUEST: 'custom-agents:permission-request',
  CUSTOM_AGENT_PERMISSION_RESPOND: 'custom-agents:permission-respond',
  // CustomAgent pin/unpin (for sidebar display)
  CUSTOM_AGENT_PIN: 'custom-agents:pin',
  CUSTOM_AGENT_UNPIN: 'custom-agents:unpin',

  // File Tree related (for right sidebar file browser)
  FILE_TREE_LIST: 'file-tree:list',
  FILE_TREE_WATCH: 'file-tree:watch',
  FILE_TREE_UNWATCH: 'file-tree:unwatch',

  // File Preview related (for reading file content)
  FILE_READ_CONTENT: 'file:read-content',

  // Plugin related
  PLUGINS_GET_ALL: 'plugins:get-all',
  PLUGINS_GET: 'plugins:get',
  PLUGINS_INSTALL: 'plugins:install',
  PLUGINS_UNINSTALL: 'plugins:uninstall',
  PLUGINS_ENABLE: 'plugins:enable',
  PLUGINS_DISABLE: 'plugins:disable',
  PLUGINS_RELOAD: 'plugins:reload',
  PLUGINS_UPDATE_CONFIG: 'plugins:update-config',
  PLUGINS_GET_DIRECTORIES: 'plugins:get-directories',
  PLUGINS_OPEN_DIRECTORY: 'plugins:open-directory',

  // Updater related (method B: check update + open release page)
  UPDATER_CHECK: 'updater:check',
  UPDATER_STATUS: 'updater:status',
  UPDATER_OPEN_RELEASE: 'updater:open-release',
  UPDATER_NEW_VERSION: 'updater:new-version',
} as const
