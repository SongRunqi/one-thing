/**
 * IPC Channel Names
 * All IPC channel constants for Electron main <-> renderer communication
 */

export const IPC_CHANNELS = {
  // Chat related
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',

  // Streaming related
  STREAM_CHUNK: 'chat:stream-chunk',
  STREAM_REASONING_DELTA: 'chat:stream-reasoning-delta',
  STREAM_TEXT_DELTA: 'chat:stream-text-delta',
  STREAM_COMPLETE: 'chat:stream-complete',
  STREAM_ERROR: 'chat:stream-error',
  ABORT_STREAM: 'chat:abort-stream',
  GET_ACTIVE_STREAMS: 'chat:get-active-streams',

  // UIMessage streaming (AI SDK 6.x compatible)
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
  UPDATE_SESSION_WORKING_DIRECTORY: 'sessions:update-working-directory',
  GET_SESSION: 'sessions:get',
  GET_SESSION_TOKEN_USAGE: 'sessions:get-token-usage',
  UPDATE_SESSION_MAX_TOKENS: 'sessions:update-max-tokens',
  CONTEXT_SIZE_UPDATED: 'sessions:context-size-updated',
  CONTEXT_COMPACT_STARTED: 'sessions:context-compact-started',
  CONTEXT_COMPACT_COMPLETED: 'sessions:context-compact-completed',
  // Session optimization (metadata separation)
  GET_SESSIONS_LIST: 'sessions:get-list',           // Returns SessionMeta[] only (no messages)
  ACTIVATE_SESSION: 'sessions:activate',            // Mark session as active, return details
  GET_SESSION_MESSAGES: 'sessions:get-messages',    // Returns ChatMessage[] for a session
  GET_SESSION_MESSAGES_PAGE: 'sessions:get-messages-page', // Returns a cursor-addressed ChatMessage page
  GET_SESSION_USER_MARKERS: 'sessions:get-user-markers',   // Returns lightweight user-message nav markers
  SESSION_MESSAGES_CHANGED: 'sessions:messages-changed',  // Event: messages added/updated

  // Settings related
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  OPEN_SETTINGS_WINDOW: 'settings:open-window',
  SETTINGS_CHANGED: 'settings:changed',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',

  // Network related
  TEST_PROXY: 'network:test-proxy',

  // Models related (read from settings.json modelRegistry)
  // Model registry
  GET_MODELS_WITH_CAPABILITIES: 'models:get-with-capabilities',
  GET_ALL_MODELS: 'models:get-all',
  SEARCH_MODELS: 'models:search',
  REFRESH_MODEL_REGISTRY: 'models:refresh-registry',
  GET_MODEL_NAME_ALIASES: 'models:get-name-aliases',
  GET_MODEL_DISPLAY_NAME: 'models:get-display-name',

  // Providers related
  GET_PROVIDERS: 'providers:get-all',
  GET_PROVIDER_USAGE: 'providers:get-usage',

  // Tools related
  GET_TOOLS: 'tools:get-all',
  EXECUTE_TOOL: 'tools:execute',
  CANCEL_TOOL: 'tools:cancel',
  UPDATE_TOOL_CALL: 'tools:update-tool-call',
  REFRESH_ASYNC_TOOLS: 'tools:refresh-async',
  STREAM_TOOL_CALL: 'chat:stream-tool-call',
  STREAM_TOOL_RESULT: 'chat:stream-tool-result',
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
  LIST_MEDIA_ASSETS: 'media:list-assets',
  HIDE_MEDIA_ASSET: 'media:hide-asset',
  REBUILD_MEDIA_LIBRARY: 'media:rebuild-library',
  GET_MEDIA_GALLERY: 'media:get-gallery',
  OPEN_IMAGE_PREVIEW: 'media:open-image-preview',
  GET_IMAGE_PREVIEW: 'media:get-image-preview',
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

  // File Preview related (for reading file content)
  FILE_READ_CONTENT: 'file:read-content',
  FILE_SAVE_CONTENT: 'file:save-content',
  FILE_LIST_DIRECTORY: 'file:list-directory',
  FILE_CREATE: 'file:create',
  FILE_CREATE_DIRECTORY: 'file:create-directory',
  FILE_RENAME: 'file:rename',
  FILE_DELETE: 'file:delete',
  FILE_STAT: 'file:stat',
  FILE_REVEAL: 'file:reveal',
  FILE_WATCH_START: 'file:watch-start',
  FILE_WATCH_STOP: 'file:watch-stop',
  FILE_WATCH_EVENT: 'file:watch-event',

  // Unified event-driven channels (Phase 4)
  SESSION_EVENT: 'session:event',
  SESSION_STREAM: 'session:stream',
  SESSION_COMMAND: 'session:command',

  // Variables subsystem (scalar-only)
  VARIABLES_LIST: 'variables:list',
  VARIABLES_SET: 'variables:set',
  VARIABLES_DELETE: 'variables:delete',

  // Project directories — independent module
  PROJECT_DIRS_LIST: 'project-dirs:list',
  PROJECT_DIRS_GET: 'project-dirs:get',
  PROJECT_DIRS_ADD: 'project-dirs:add',
  PROJECT_DIRS_UPDATE: 'project-dirs:update',
  PROJECT_DIRS_REMOVE: 'project-dirs:remove',

  // Plugin management
  PLUGINS_LIST: 'plugins:list',
  PLUGINS_ENABLE: 'plugins:enable',
  PLUGINS_DISABLE: 'plugins:disable',
  PLUGINS_REFRESH: 'plugins:refresh',
  PLUGINS_COMMANDS: 'plugins:commands',
  PLUGINS_EXECUTE_COMMAND: 'plugins:execute-command',

  // Soul / Memory panel
  MEMORY_OVERVIEW: 'memory:overview',
  MEMORY_READ: 'memory:read',
  MEMORY_SEARCH: 'memory:search',
  MEMORY_APPEND: 'memory:append',
  MEMORY_SAVE_FILE: 'memory:save-file',
  MEMORY_INDEX: 'memory:index',
  MEMORY_RUN_DREAMING: 'memory:run-dreaming',
  MEMORY_CAPTURE_SAVE: 'memory:capture-save',
  MEMORY_CAPTURE_DISCARD: 'memory:capture-discard',
  MEMORY_PROFILE_LIST: 'memory.profile:list',
  MEMORY_PROFILE_SEARCH: 'memory.profile:search',
  MEMORY_PROFILE_UPSERT: 'memory.profile:upsert',
  MEMORY_PROFILE_DELETE: 'memory.profile:delete',
  MEMORY_PROFILE_AUDIT: 'memory.profile:audit',
  MEMORY_PROFILE_EXPORT: 'memory.profile:export',
  MEMORY_GRAPH_OVERVIEW: 'memory.graph:overview',
  MEMORY_GRAPH_ENTITIES_LIST: 'memory.graph.entities:list',
  MEMORY_GRAPH_ENTITIES_UPSERT: 'memory.graph.entities:upsert',
  MEMORY_GRAPH_ENTITIES_DELETE: 'memory.graph.entities:delete',
  MEMORY_GRAPH_OBSERVATIONS_LIST: 'memory.graph.observations:list',
  MEMORY_GRAPH_OBSERVATIONS_UPSERT: 'memory.graph.observations:upsert',
  MEMORY_GRAPH_OBSERVATIONS_DELETE: 'memory.graph.observations:delete',
  MEMORY_GRAPH_RELATIONS_LIST: 'memory.graph.relations:list',
  MEMORY_GRAPH_RELATIONS_UPSERT: 'memory.graph.relations:upsert',
  MEMORY_GRAPH_RELATIONS_DELETE: 'memory.graph.relations:delete',
  MEMORY_GRAPH_DUPLICATES_LIST: 'memory.graph.duplicates:list',
  MEMORY_GRAPH_DUPLICATES_MERGE: 'memory.graph.duplicates:merge',
  MEMORY_GRAPH_DUPLICATES_IGNORE: 'memory.graph.duplicates:ignore',
  MEMORY_GRAPH_AUDIT: 'memory.graph:audit',
  MEMORY_LOGS_LIST: 'memory.logs:list',
  MEMORY_LOGS_STATS: 'memory.logs:stats',
  MEMORY_LOGS_OPEN_FOLDER: 'memory.logs:open-folder',
  MEMORY_LOGS_CLEANUP: 'memory.logs:cleanup',

  // Generic scheduler
  SCHEDULER_LIST: 'scheduler:list',
  SCHEDULER_GET: 'scheduler:get',
  SCHEDULER_RUN_NOW: 'scheduler:run-now',
  SCHEDULER_SET_ENABLED: 'scheduler:set-enabled',

  // App State (restore on startup)
  GET_APP_STATE: 'app-state:get',
  SAVE_UI_STATE: 'app-state:save-ui',

  // Search Everywhere
  SEARCH_WINDOW_TOGGLE: 'search-window:toggle',
  SEARCH_WINDOW_CLOSE: 'search-window:close',
  SEARCH_WINDOW_SHOWN: 'search-window:shown',
  SEARCH_QUERY: 'search:query',
  SEARCH_EXECUTE_ACTION: 'search:execute-action',

  // Todo / Plan
  TODO_PLAN_GET: 'todo-plan:get',
  TODO_PLAN_CREATE: 'todo-plan:create',
  TODO_PLAN_UPDATE: 'todo-plan:update',
  TODO_PLAN_RENAME: 'todo-plan:rename',
  TODO_PLAN_DELETE: 'todo-plan:delete',
  TODO_PLAN_REVEAL_DIRECTORY: 'todo-plan:reveal-directory',
  TODO_PLAN_OPEN_WINDOW: 'todo-plan:open-window',
  TODO_PLAN_HIDE_WINDOW: 'todo-plan:hide-window',
  TODO_PLAN_TOGGLE_WINDOW: 'todo-plan:toggle-window',
  TODO_PLAN_SET_WINDOW_PINNED: 'todo-plan:set-window-pinned',
  TODO_PLAN_CHANGED: 'todo-plan:changed',
} as const
