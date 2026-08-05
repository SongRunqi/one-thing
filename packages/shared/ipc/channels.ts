/**
 * IPC Channel Names
 * All IPC channel constants for Electron main <-> renderer communication
 */

export const IPC_CHANNELS = {
	// Chat related
	GET_CHAT_HISTORY: "chat:get-history",
	CLEAR_CHAT: "chat:clear",
	GENERATE_TITLE: "chat:generate-title",
	GET_SYSTEM_PROMPT_SNAPSHOT: "chat:get-system-prompt-snapshot",

	// Streaming control
	ABORT_STREAM: "chat:abort-stream",
	GET_ACTIVE_STREAMS: "chat:get-active-streams",

	// Skill usage notification
	SKILL_ACTIVATED: "chat:skill-activated",

	// Image generation notification
	IMAGE_GENERATED: "chat:image-generated",

	// Step tracking for showing AI reasoning process
	STEP_ADDED: "chat:step-added",
	STEP_UPDATED: "chat:step-updated",

	// Session related
	GET_SESSIONS: "sessions:get-all",
	CREATE_SESSION: "sessions:create",
	SWITCH_SESSION: "sessions:switch",
	DELETE_SESSION: "sessions:delete",
	RENAME_SESSION: "sessions:rename",
	CREATE_BRANCH: "sessions:create-branch",
	UPDATE_SESSION_PIN: "sessions:update-pin",
	UPDATE_SESSION_MODEL: "sessions:update-model",
	UPDATE_SESSION_AGENT: "sessions:update-agent",
	UPDATE_SESSION_PERMISSION_MODE: "sessions:update-permission-mode",
	UPDATE_SESSION_ARCHIVED: "sessions:update-archived",
	UPDATE_SESSION_WORKING_DIRECTORY: "sessions:update-working-directory",
	GET_SESSION: "sessions:get",
	GET_SESSION_TOKEN_USAGE: "sessions:get-token-usage",
	UPDATE_SESSION_MAX_TOKENS: "sessions:update-max-tokens",
	CONTEXT_SIZE_UPDATED: "sessions:context-size-updated",
	CONTEXT_COMPACT_STARTED: "sessions:context-compact-started",
	CONTEXT_COMPACT_COMPLETED: "sessions:context-compact-completed",
	// Session optimization (metadata separation)
	GET_SESSIONS_LIST: "sessions:get-list", // Returns SessionMeta[] only (no messages)
	ACTIVATE_SESSION: "sessions:activate", // Mark session as active, return details
	GET_SESSION_MESSAGES: "sessions:get-messages", // Returns ChatMessage[] for a session
	GET_SESSION_MESSAGES_PAGE: "sessions:get-messages-page", // Returns a cursor-addressed ChatMessage page
	GET_SESSION_USER_MARKERS: "sessions:get-user-markers", // Returns lightweight user-message nav markers
	GET_SESSION_SEGMENTS: "sessions:get-segments", // Returns the session's TOC segments
	SESSION_MESSAGES_CHANGED: "sessions:messages-changed", // Event: messages added/updated
	GET_SESSION_CACHE_STATS: "sessions:get-cache-stats", // Returns in-memory LRU cache stats
	EVICT_SESSION_CACHE: "sessions:evict-cache", // Evicts a session from the in-memory LRU cache

	// Settings related
	GET_SETTINGS: "settings:get",
	SAVE_SETTINGS: "settings:save",
	OPEN_SETTINGS_WINDOW: "settings:open-window",
	SETTINGS_NAVIGATE: "settings:navigate", // main → settings window: jump to a tab
	SETTINGS_CHANGED: "settings:changed",
	GET_SYSTEM_THEME: "settings:get-system-theme",
	SYSTEM_THEME_CHANGED: "settings:system-theme-changed",

	// Voice related
	VOICE_GET_STATE: "voice:get-state",
	VOICE_START: "voice:start",
	VOICE_STOP: "voice:stop",
	VOICE_SUBMIT_UTTERANCE: "voice:submit-utterance",
	VOICE_SUBMIT_TRANSCRIPT: "voice:submit-transcript",
	VOICE_SYNTHESIZE: "voice:synthesize",
	VOICE_TEST_ASR: "voice:test-asr",
	VOICE_TEST_TTS: "voice:test-tts",
	VOICE_GET_TTS_MODELS: "voice:get-tts-models",
	VOICE_EVENT: "voice:event",
	VOICE_RUNTIME_COMMAND: "voice:runtime-command",
	VOICE_RUNTIME_EVENT: "voice:runtime-event",
	VOICE_RUNTIME_READY: "voice:runtime-ready",
	VOICE_AUDIO_CHUNK: "voice:audio-chunk",

	// Music radio related
	MUSIC_GET_STATE: "music:get-state",
	MUSIC_SETUP: "music:setup",
	MUSIC_EVENT: "music:event",
	/** Transport controls for the composer's music bar (main -> ncm-cli directly). */
	MUSIC_COMMAND: "music:command",
	/** main -> renderer: what is playing, or null when nothing is. */
	MUSIC_NOW_PLAYING: "music:now-playing",
	/**
	 * renderer -> main pull of the same answer. MUSIC_NOW_PLAYING only fires on
	 * change, so a renderer that subscribes mid-song (reload, second window)
	 * must ask once or it waits until the next track for its first update.
	 */
	MUSIC_GET_NOW_PLAYING: "music:get-now-playing",
	/** renderer -> main: radio brief snapshot (active/intent/lastError). */
	MUSIC_GET_RADIO: "music:get-radio",
	/** main -> renderer: the current song's timed lyrics, once per song start. */
	MUSIC_LYRICS: "music:lyrics",
	/** renderer -> main pull of the same (reload mid-song). */
	MUSIC_GET_LYRICS: "music:get-lyrics",
	/**
	 * main -> renderer: the DJ's synthesized patter to play in the gap before a
	 * song. Audio rides here (not mpv) so music and voice stay on separate
	 * tracks; the renderer plays it and acks on MUSIC_DJ_SPEAK_DONE.
	 */
	MUSIC_DJ_SPEAK: "music:dj-speak",
	/** renderer -> main: DJ patter finished (or failed) playing, keyed by id. */
	MUSIC_DJ_SPEAK_DONE: "music:dj-speak-done",
	/** renderer -> main: open/retune the station from the bar (empty intent = DJ's call). */
	MUSIC_OPEN_RADIO: "music:open-radio",
	/** renderer -> main: song search for the panel's request box. */
	MUSIC_SEARCH: "music:search",
	/** renderer -> main: cut a named song in as the next track. */
	MUSIC_REQUEST_SONG: "music:request-song",
	/** renderer -> main: the visible programme queue for the panel. */
	MUSIC_GET_PROGRAMME: "music:get-programme",
	/** renderer -> main: panel edits (remove=skip signal, promote, move). */
	MUSIC_PROGRAMME_ACTION: "music:programme-action",
	/** renderer -> main: available music CLI providers (settings selector). */
	MUSIC_LIST_PROVIDERS: "music:list-providers",
	/** renderer -> main: switch the music CLI provider (a retune: programme cleared). */
	MUSIC_SET_PROVIDER: "music:set-provider",

	// Gateway / IM channel related
	GATEWAY_GET_STATUS: "gateway:get-status",
	GATEWAY_START: "gateway:start",
	GATEWAY_STOP: "gateway:stop",
	GATEWAY_WECHAT_LOGOUT: "gateway:wechat-logout",
	GATEWAY_WECHAT_ADD_ACCOUNT: "gateway:wechat-add-account",
	GATEWAY_WECHAT_STOP_ACCOUNT: "gateway:wechat-stop-account",
	GATEWAY_WECHAT_REMOVE_ACCOUNT: "gateway:wechat-remove-account",
	GATEWAY_WECHAT_RENAME_ACCOUNT: "gateway:wechat-rename-account",

	// Channel identity and IM reply routing
	CHANNEL_IDENTITY_LIST_LINKS: "channel-identity:list-links",
	CHANNEL_IDENTITY_LIST_PROFILES: "channel-identity:list-profiles",
	CHANNEL_IDENTITY_CREATE_PROFILE: "channel-identity:create-profile",
	CHANNEL_IDENTITY_UPDATE_PROFILE: "channel-identity:update-profile",
	CHANNEL_IDENTITY_CREATE_LINK: "channel-identity:create-link",
	CHANNEL_IDENTITY_DELETE_LINK: "channel-identity:delete-link",
	CHANNEL_IDENTITY_RESOLVE: "channel-identity:resolve",
	CHANNEL_DELIVERY_LIST: "channel-delivery:list",

	// Agents related
	AGENTS_LIST: "agents:list",
	AGENTS_CREATE: "agents:create",
	AGENTS_UPDATE: "agents:update",
	/** UI 的「删除」= 退休或硬删(域模型 §3.2);响应里的 outcome 说明是哪种。 */
	AGENTS_DELETE: "agents:delete",
	/** 重新入职(域模型 §8):退休翻回 active。入口只在 Agents 管理页。 */
	AGENTS_RESTORE: "agents:restore",

	// User prompt snippets
	PROMPTS_LIST: "prompts:list",
	PROMPTS_GET: "prompts:get",
	PROMPTS_CREATE: "prompts:create",
	PROMPTS_UPDATE: "prompts:update",
	PROMPTS_DELETE: "prompts:delete",

	// Network related
	TEST_PROXY: "network:test-proxy",

	// Models related (read from settings.json modelRegistry)
	// Model registry
	GET_MODELS_WITH_CAPABILITIES: "models:get-with-capabilities",
	GET_ALL_MODELS: "models:get-all",
	SEARCH_MODELS: "models:search",
	REFRESH_MODEL_REGISTRY: "models:refresh-registry",
	GET_MODEL_NAME_ALIASES: "models:get-name-aliases",
	GET_MODEL_DISPLAY_NAME: "models:get-display-name",

	// Providers related
	GET_PROVIDERS: "providers:get-all",
	GET_PROVIDER_USAGE: "providers:get-usage",
	GET_PROVIDER_ENV_STATUS: "providers:get-env-status",

	// Tools related
	GET_TOOLS: "tools:get-all",
	EXECUTE_TOOL: "tools:execute",
	CANCEL_TOOL: "tools:cancel",
	UPDATE_TOOL_CALL: "tools:update-tool-call",
	BACKGROUND_JOBS_LIST: "tools:background-jobs:list",
	BACKGROUND_JOBS_STOP: "tools:background-jobs:stop",
	REFRESH_ASYNC_TOOLS: "tools:refresh-async",
	UPDATE_MESSAGE_THINKING_TIME: "chat:update-thinking-time",
	RESUME_AFTER_TOOL_CONFIRM: "chat:resume-after-tool-confirm",

	// Permission related
	PERMISSION_REQUEST: "permission:request",
	PERMISSION_GET_PENDING: "permission:get-pending",
	PERMISSION_CLEAR_SESSION: "permission:clear-session",
	PERMISSION_LIST_GRANTS: "permission:list-grants",
	PERMISSION_REVOKE_GRANT: "permission:revoke-grant",
	PERMISSION_CLEAR_SESSION_GRANTS: "permission:clear-session-grants",
	PERMISSION_CLEAR_WORKSPACE_GRANTS: "permission:clear-workspace-grants",

	// Interaction related (agent 提问 → 用户应答)
	INTERACTION_RESPOND: "interaction:respond",
	INTERACTION_GET_PENDING: "interaction:get-pending",

	// MCP related
	MCP_GET_SERVERS: "mcp:get-servers",
	MCP_ADD_SERVER: "mcp:add-server",
	MCP_UPDATE_SERVER: "mcp:update-server",
	MCP_REMOVE_SERVER: "mcp:remove-server",
	MCP_CONNECT_SERVER: "mcp:connect-server",
	MCP_DISCONNECT_SERVER: "mcp:disconnect-server",
	MCP_REFRESH_SERVER: "mcp:refresh-server",
	MCP_GET_TOOLS: "mcp:get-tools",
	MCP_CALL_TOOL: "mcp:call-tool",
	MCP_GET_RESOURCES: "mcp:get-resources",
	MCP_READ_RESOURCE: "mcp:read-resource",
	MCP_GET_PROMPTS: "mcp:get-prompts",
	MCP_GET_PROMPT: "mcp:get-prompt",
	MCP_READ_CONFIG_FILE: "mcp:read-config-file",

	// ACP related
	ACP_GET_AGENTS: "acp:get-agents",
	ACP_ADD_AGENT: "acp:add-agent",
	ACP_UPDATE_AGENT: "acp:update-agent",
	ACP_REMOVE_AGENT: "acp:remove-agent",
	ACP_CONNECT_AGENT: "acp:connect-agent",
	ACP_DISCONNECT_AGENT: "acp:disconnect-agent",
	ACP_REFRESH_AGENT: "acp:refresh-agent",
	ACP_CANCEL_SESSION: "acp:cancel-session",

	// Dialog related
	SHOW_OPEN_DIALOG: "dialog:show-open",

	// Image Preview related
	LIST_MEDIA_ASSETS: "media:list-assets",
	HIDE_MEDIA_ASSET: "media:hide-asset",
	REBUILD_MEDIA_LIBRARY: "media:rebuild-library",
	GET_MEDIA_GALLERY: "media:get-gallery",
	OPEN_IMAGE_PREVIEW: "media:open-image-preview",
	GET_IMAGE_PREVIEW: "media:get-image-preview",
	OPEN_IMAGE_GALLERY: "media:open-image-gallery",
	IMAGE_PREVIEW_UPDATE: "image-preview:update",
	IMAGE_GALLERY_UPDATE: "image-gallery:update",

	// Skills related
	SKILLS_GET_ALL: "skills:get-all",
	SKILLS_REFRESH: "skills:refresh",
	SKILLS_READ_FILE: "skills:read-file",
	SKILLS_OPEN_DIRECTORY: "skills:open-directory",
	SKILLS_CREATE: "skills:create",
	SKILLS_DELETE: "skills:delete",
	SKILLS_TOGGLE_ENABLED: "skills:toggle-enabled",
	SKILLS_LIST_DIRECTORIES: "skills:list-directories",
	SKILLS_ADD_DIRECTORY: "skills:add-directory",
	SKILLS_UPDATE_DIRECTORY: "skills:update-directory",
	SKILLS_REMOVE_DIRECTORY: "skills:remove-directory",
	SKILLS_SET_AGENT: "skills:set-agent",

	// Theme related
	THEME_GET_ALL: "themes:get-all",
	THEME_GET: "themes:get",
	THEME_APPLY: "themes:apply",
	THEME_REFRESH: "themes:refresh",
	THEME_OPEN_FOLDER: "themes:open-folder",

	// OAuth related
	OAUTH_START: "oauth:start",
	OAUTH_CALLBACK: "oauth:callback",
	OAUTH_REFRESH: "oauth:refresh",
	OAUTH_LOGOUT: "oauth:logout",
	OAUTH_STATUS: "oauth:status",
	OAUTH_DEVICE_POLL: "oauth:device-poll",
	OAUTH_TOKEN_REFRESHED: "oauth:token-refreshed",
	OAUTH_TOKEN_EXPIRED: "oauth:token-expired",

	// Files related (for @ file search)
	FILES_LIST: "files:list",

	// File rollback related
	FILE_ROLLBACK: "files:rollback",

	// Directories related (for /cd path completion)
	DIRS_LIST: "dirs:list",

	// File Preview related (for reading file content)
	FILE_READ_CONTENT: "file:read-content",
	FILE_SAVE_CONTENT: "file:save-content",
	FILE_LIST_DIRECTORY: "file:list-directory",
	FILE_CREATE: "file:create",
	FILE_CREATE_DIRECTORY: "file:create-directory",
	FILE_RENAME: "file:rename",
	FILE_DELETE: "file:delete",
	FILE_STAT: "file:stat",
	FILE_REVEAL: "file:reveal",
	FILE_WATCH_START: "file:watch-start",
	FILE_WATCH_STOP: "file:watch-stop",
	FILE_WATCH_EVENT: "file:watch-event",

	// Markdown asset / attachment related
	MARKDOWN_RESOLVE_ASSET: "markdown:resolve-asset",
	MARKDOWN_SAVE_ATTACHMENTS: "markdown:save-attachments",

	// Unified event-driven channels (Phase 4)
	SESSION_EVENT: "session:event",
	SESSION_STREAM: "session:stream",
	SESSION_COMMAND: "session:command",

	// Variables subsystem (scalar-only)
	VARIABLES_LIST: "variables:list",
	VARIABLES_SET: "variables:set",
	VARIABLES_DELETE: "variables:delete",

	// Session goals
	GOAL_GET: "goal:get",
	GOAL_SET: "goal:set",
	GOAL_DIFFS: "goal:diffs",

	// Project directories — independent module
	PROJECT_DIRS_LIST: "project-dirs:list",
	PROJECT_DIRS_GET: "project-dirs:get",
	PROJECT_DIRS_ADD: "project-dirs:add",
	PROJECT_DIRS_UPDATE: "project-dirs:update",
	PROJECT_DIRS_REMOVE: "project-dirs:remove",

	// Plugin management
	PLUGINS_LIST: "plugins:list",
	PLUGINS_ENABLE: "plugins:enable",
	PLUGINS_DISABLE: "plugins:disable",
	PLUGINS_REFRESH: "plugins:refresh",
	PLUGINS_COMMANDS: "plugins:commands",
	PLUGINS_EXECUTE_COMMAND: "plugins:execute-command",

	// Soul / Memory panel
	MEMORY_OVERVIEW: "memory:overview",
	MEMORY_READ: "memory:read",
	MEMORY_APPEND: "memory:append",
	MEMORY_SAVE_FILE: "memory:save-file",
	MEMORY_CAPTURE_SAVE: "memory:capture-save",
	MEMORY_CAPTURE_DISCARD: "memory:capture-discard",
	MEMORY_LOGS_LIST: "memory.logs:list",
	MEMORY_LOGS_STATS: "memory.logs:stats",
	MEMORY_LOGS_OPEN_FOLDER: "memory.logs:open-folder",
	MEMORY_LOGS_CLEANUP: "memory.logs:cleanup",

	// Generic scheduler
	SCHEDULER_LIST: "scheduler:list",
	SCHEDULER_GET: "scheduler:get",
	SCHEDULER_RUN_NOW: "scheduler:run-now",
	SCHEDULER_SET_ENABLED: "scheduler:set-enabled",
	SCHEDULER_CREATE_TASK: "scheduler:create-task",
	SCHEDULER_UPDATE_TASK: "scheduler:update-task",
	SCHEDULER_DELETE_TASK: "scheduler:delete-task",
	SCHEDULER_LIST_RUNS: "scheduler:list-runs",
	SCHEDULER_GET_RUN: "scheduler:get-run",

	// Window
	WINDOW_CLOSE: "window:close",

	// App State (restore on startup)
	GET_APP_STATE: "app-state:get",
	SAVE_UI_STATE: "app-state:save-ui",

	// Search Everywhere
	SEARCH_WINDOW_TOGGLE: "search-window:toggle",
	SEARCH_WINDOW_CLOSE: "search-window:close",
	SEARCH_WINDOW_SHOWN: "search-window:shown",
	SEARCH_WINDOW_GUIDES: "search-window:guides",
	SEARCH_WINDOW_SET_ANCHOR: "search-window:set-anchor",
	SEARCH_QUERY: "search:query",
	SEARCH_EXECUTE_ACTION: "search:execute-action",
	SEARCH_ACTION: "search:action",

	// Todo / Plan
	TODO_PLAN_GET: "todo-plan:get",
	TODO_PLAN_CREATE: "todo-plan:create",
	TODO_PLAN_UPDATE: "todo-plan:update",
	TODO_PLAN_RENAME: "todo-plan:rename",
	TODO_PLAN_DELETE: "todo-plan:delete",
	TODO_PLAN_REVEAL_DIRECTORY: "todo-plan:reveal-directory",
	TODO_PLAN_OPEN_WINDOW: "todo-plan:open-window",
	TODO_PLAN_HIDE_WINDOW: "todo-plan:hide-window",
	TODO_PLAN_TOGGLE_WINDOW: "todo-plan:toggle-window",
	TODO_PLAN_SET_WINDOW_PINNED: "todo-plan:set-window-pinned",
	TODO_PLAN_CHANGED: "todo-plan:changed",

	// Practice (kegel / pomodoro / exercise log)
	PRACTICE_START: "practice:start",
	PRACTICE_PAUSE: "practice:pause",
	PRACTICE_RESUME: "practice:resume",
	PRACTICE_STOP: "practice:stop",
	PRACTICE_GET_STATE: "practice:get-state",
	PRACTICE_LOG: "practice:log",
	PRACTICE_SUMMARY: "practice:summary",
	PRACTICE_RECENT: "practice:recent",
	PRACTICE_GET_CONFIG: "practice:get-config",
	PRACTICE_SET_CONFIG: "practice:set-config",
	PRACTICE_EVENT: "practice:event",

	// Evals (prompt evaluation) related
	EVALS_RECORD_DOWNVOTE: "evals:record-downvote",

	// Evals Phase 1 - Review (read-only)
	EVALS_LIST_RECORDS: "evals:list-records",
	EVALS_LIST_FIXTURES: "evals:list-fixtures",
	EVALS_READ_FIXTURE: "evals:read-fixture",
	EVALS_READ_SNAPSHOT: "evals:read-snapshot",
	EVALS_LIST_RESULTS: "evals:list-results",

	// Evals Phase 2 - Run
	EVALS_RUN_START: "evals:run-start",
	EVALS_RUN_CANCEL: "evals:run-cancel",
	EVALS_RUN_PROGRESS: "evals:run-progress",
	EVALS_LIST_CASES: "evals:list-cases",
	EVALS_GET_CASE: "evals:get-case",

	// Evals Phase 3 - Actions
	EVALS_PROMOTE_FIXTURE: "evals:promote-fixture",
	EVALS_RETIRE_CASE: "evals:retire-case",
	EVALS_GENERATE_TRIAGE: "evals:generate-triage",
	EVALS_READ_RUN_DETAIL: "evals:read-run-detail",

	// Evals Workbench (incident-centric, W1-W5)
	EVALS_INCIDENT_LIST: "evals:incident-list",
	EVALS_INCIDENT_GET: "evals:incident-get",
	EVALS_INCIDENT_UPDATE: "evals:incident-update",
	EVALS_INCIDENT_READ_FILE: "evals:incident-read-file",
	EVALS_REPLAY_START: "evals:replay-start",
	EVALS_REPLAY_CANCEL: "evals:replay-cancel",
	EVALS_REPLAY_PROGRESS: "evals:replay-progress",
	EVALS_INCIDENT_ANALYZE: "evals:incident-analyze",
	EVALS_INCIDENT_PROMOTE: "evals:incident-promote",
	EVALS_DIAGNOSE_START: "evals:diagnose-start",
	EVALS_DIAGNOSE_PROGRESS: "evals:diagnose-progress",
	EVALS_ROUND_LIST: "evals:round-list",
	EVALS_ROUND_REPLAY: "evals:round-replay",

	// Token usage / billing
	GET_USAGE_SUMMARY: "usage:get-summary",
	GET_SESSION_USAGE: "usage:get-session",

	// Terminal (real PTY, user-driven; distinct from the ACP protocol "terminal")
	TERMINAL_CREATE: "terminal:create",
	TERMINAL_LIST: "terminal:list",
	TERMINAL_WRITE: "terminal:write",
	TERMINAL_RESIZE: "terminal:resize",
	TERMINAL_KILL: "terminal:kill",
	TERMINAL_ATTACH: "terminal:attach",
	// One-way renderer→main flow-control ack (ipcRenderer.send, not invoke)
	TERMINAL_ACK: "terminal:ack",
	// Push main→renderer
	TERMINAL_DATA: "terminal:data",
	TERMINAL_EXIT: "terminal:exit",

	// Browser (embedded WebContentsView; distinct from the WorkbenchTab
	// 'browser' <iframe> which stays only as the apps/web fallback)
	BROWSER_HYDRATE: "browser:hydrate",
	BROWSER_CREATE_TAB: "browser:create-tab",
	BROWSER_CLOSE_TAB: "browser:close-tab",
	BROWSER_SELECT_TAB: "browser:select-tab",
	BROWSER_NAVIGATE: "browser:navigate",
	BROWSER_GO_BACK: "browser:go-back",
	BROWSER_GO_FORWARD: "browser:go-forward",
	BROWSER_RELOAD: "browser:reload",
	BROWSER_STOP: "browser:stop",
	BROWSER_SET_BOUNDS: "browser:set-bounds",
	BROWSER_SET_VISIBLE: "browser:set-visible",
	// Element pick mode: invoke resolves with the picked element (or null on cancel)
	BROWSER_PICK_ELEMENT: "browser:pick-element",
	BROWSER_PICK_CANCEL: "browser:pick-cancel",
	// Search engine (omnibox queries + default new-tab page): get/set the selection
	BROWSER_GET_SEARCH_ENGINE: "browser:get-search-engine",
	BROWSER_SET_SEARCH_ENGINE: "browser:set-search-engine",
	// Profiles (Chrome-style isolated logins): list/add/remove/switch
	BROWSER_LIST_PROFILES: "browser:list-profiles",
	BROWSER_ADD_PROFILE: "browser:add-profile",
	BROWSER_REMOVE_PROFILE: "browser:remove-profile",
	BROWSER_SWITCH_PROFILE: "browser:switch-profile",
	// Push main→renderer: single coalesced tab-state batch
	BROWSER_TABS_CHANGED: "browser:tabs-changed",

	// 系统通知与 dock 徽标(agent-dm-user.md §4.2)。判定在 renderer(焦点/可见性/
	// 水位都在那边),这三条只负责执行与回传点击。
	NOTIFY_SHOW: "notify:show",
	NOTIFY_BADGE: "notify:set-badge",
	// Push main→renderer:用户点了通知,带上要打开的会话。
	NOTIFY_ACTIVATE: "notify:activate",

	// Collab (multi-agent rooms) — board snapshot + room pause switch;
	// board mutations flow through the board tool / coordinator, updates
	// arrive as 'collab:board-changed' session events on the room session.
	COLLAB_BOARD_GET: "collab:board-get",
	// W16: the USER's door into the same reducer the board tool uses — the
	// panel was read-only, so a card could not be moved by hand at all.
	COLLAB_BOARD_ACT: "collab:board-act",
	COLLAB_TASK_STOP: "collab:task-stop",
	COLLAB_ROOM_SET_FROZEN: "collab:room-set-frozen",
	COLLAB_ROOM_SET_BUDGETS: "collab:room-set-budgets",
	COLLAB_ROOM_UPDATE: "collab:room-update",
	// 清空一间房的对话记忆(房间转录 + 每位成员的执行会话与已读游标 + 协调器
	// 状态/摘要/运行时)。看板、房间设置、已花预算一概不动。
	COLLAB_ROOM_CLEAR_HISTORY: "collab:room-clear-history",
	COLLAB_ROOM_SPEND_GET: "collab:room-spend-get",
	// 协调器状态条的冷启动读取;实时更新走 'collab:coordinator-changed' 会话事件
	// (与看板同一条链路)。
	COLLAB_COORDINATOR_GET: "collab:coordinator-get",
	// Agent 活动快照的冷启动补水(D8 观测体系 §3.1);实时更新走
	// 'collab:agent-changed' 会话事件。与协调器那扇门是**两本互不派生的账**:
	// 大脑、信箱、工作卡是跨房的,任何一份房间快照里都没有它们的位置。
	COLLAB_AGENT_ACTIVITY_GET: "collab:agent-activity-get",
	// 调度时间轴的尾读(D8 观测体系 §3.3)。回答四个必答问题里的最后一个 ——
	// 「**刚才**为什么是那样」。前三个问的是此刻,快照答得了;这一个问的是过去,
	// 而过去只在盘上的 scheduler-log.jsonl 里。**只读**,没有写口。
	COLLAB_SCHEDULER_LOG_TAIL: "collab:scheduler-log-tail",
	COLLAB_MESSAGE_REACT: "collab:message-react",
	// 用户 ↔ agent 托管私聊房的 get-or-create(docs/design/agent-im-dm.md D1)。
	// 幂等:id 从 agentId 派生,同一个 agent 永远同一间房。
	COLLAB_DM_ROOM_ENSURE: "collab:dm-room-ensure",
	// 群 folder 的只读列目录(agent-im-chat-ui.md §3.2「文件」块)。folder 的
	// 位置只有主进程算得出(workingDirectory ?? <store>/rooms/<id>),所以不能
	// 让渲染进程拿 file:list-directory 去猜路径。
	COLLAB_ROOM_FOLDER_LIST: "collab:room-folder-list",
} as const;
