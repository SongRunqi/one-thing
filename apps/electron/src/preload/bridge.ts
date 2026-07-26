import { clipboard, contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "@shared/ipc.js";
import type {
	GetSessionMessagesPageRequest,
	GetSessionUsageRequest,
	GetSessionUsageResponse,
	GetUsageSummaryRequest,
	GetUsageSummaryResponse,
	MediaQuery,
	MarkdownResolveAssetRequest,
	MarkdownSaveAttachmentsRequest,
	PromptCreateRequest,
	PromptDeleteRequest,
	PromptGetRequest,
	PromptUpdateRequest,
	GetProviderEnvStatusResponse,
	ProviderUsageResponse,
	SchedulerCreateTaskRequest,
	SchedulerDeleteTaskRequest,
	SchedulerGetRunRequest,
	SchedulerListRunsRequest,
	SchedulerUpdateTaskRequest,
	SearchRequest,
	SearchWindowAnchor,
	SearchWindowGuideState,
	SearchWindowOpenOptions,
	SearchWindowShownPayload,
	TodoPlanWindowActionRequest,
	PracticeConfigResponse,
	PracticeEventPayload,
	PracticeLogRequest,
	PracticeLogResponse,
	PracticeRecentRequest,
	PracticeRecentResponse,
	PracticeSetConfigRequest,
	PracticeStartRequest,
	PracticeStateResponse,
	PracticeStopRequest,
	PracticeSummaryRequest,
	PracticeSummaryResult,
} from "@shared/ipc.js";

const electronAPI = {
	onSkillActivated: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			skillName: string;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.SKILL_ACTIVATED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SKILL_ACTIVATED, listener);
	},

	onStepAdded: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			step: any;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.STEP_ADDED, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.STEP_ADDED, listener);
	},

	onStepUpdated: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			stepId: string;
			updates: any;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.STEP_UPDATED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.STEP_UPDATED, listener);
	},

	onImageGenerated: (
		callback: (data: {
			id: string;
			url: string;
			prompt: string;
			revisedPrompt?: string;
			model: string;
			sessionId: string;
			messageId: string;
			createdAt: number;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.IMAGE_GENERATED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_GENERATED, listener);
	},

	// ── Unified event-driven channels (Phase 4) ──────
	onSessionEvent: (callback: (envelope: any) => void) => {
		const listener = (_event: any, envelope: any) => callback(envelope);
		ipcRenderer.on(IPC_CHANNELS.SESSION_EVENT, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SESSION_EVENT, listener);
	},

	onSessionStream: (
		callback: (data: { sessionId: string; chunk: any }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.SESSION_STREAM, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STREAM, listener);
	},

	emitCommand: (sessionId: string, command: any) =>
		// 给main线程发送消息
		ipcRenderer.invoke(IPC_CHANNELS.SESSION_COMMAND, { sessionId, command }),

	// ── Terminal (real PTY) ──────
	createTerminal: (request: {
		cwd?: string;
		shell?: string;
		cols?: number;
		rows?: number;
		sessionId?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, request ?? {}),
	listTerminals: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_LIST),
	writeTerminal: (terminalId: string, data: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, { terminalId, data }),
	resizeTerminal: (terminalId: string, cols: number, rows: number) =>
		ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, { terminalId, cols, rows }),
	killTerminal: (terminalId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_KILL, { terminalId }),
	attachTerminal: (terminalId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_ATTACH, { terminalId }),
	// One-way send, not invoke: pure notification at flush cadence — a lost
	// ack only delays resume, and the attach generation resets the ledger.
	ackTerminal: (terminalId: string, bytes: number, generation: number) => {
		ipcRenderer.send(IPC_CHANNELS.TERMINAL_ACK, { terminalId, bytes, generation });
	},
	onTerminalData: (
		callback: (data: { terminalId: string; seq: number; data: string }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, listener);
	},
	onTerminalExit: (
		callback: (data: { terminalId: string; exitCode: number | null }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, listener);
	},

	// ── Browser (embedded WebContentsView) ──────
	hydrateBrowser: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_HYDRATE),
	createBrowserTab: (request?: { url?: string; background?: boolean }) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CREATE_TAB, request ?? {}),
	closeBrowserTab: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CLOSE_TAB, { tabId }),
	selectBrowserTab: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SELECT_TAB, { tabId }),
	navigateBrowser: (tabId: string, url: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_NAVIGATE, { tabId, url }),
	browserGoBack: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GO_BACK, { tabId }),
	browserGoForward: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GO_FORWARD, { tabId }),
	reloadBrowser: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RELOAD, { tabId }),
	stopBrowser: (tabId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_STOP, { tabId }),
	setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_BOUNDS, { bounds }),
	setBrowserVisible: (visible: boolean) =>
		ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_VISIBLE, { visible }),
	onBrowserTabsChanged: (callback: (event: any) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.BROWSER_TABS_CHANGED, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.BROWSER_TABS_CHANGED, listener);
	},

	// Permission grant management
	listPermissionGrants: (options: {
		sessionId?: string;
		workspaceRoot?: string;
		userId?: string;
		workspaceId?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_LIST_GRANTS, options),
	revokePermissionGrant: (id: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_REVOKE_GRANT, { id }),
	clearSessionPermissionGrants: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_SESSION_GRANTS, {
			sessionId,
		}),
	clearWorkspacePermissionGrants: (workspaceRoot: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_WORKSPACE_GRANTS, {
			workspaceRoot,
		}),

	// ── Streaming methods ───────────────────────────
	abortStream: (sessionId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ABORT_STREAM, { sessionId }),

	getActiveStreams: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVE_STREAMS),

	getChatHistory: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, { sessionId }),

	generateTitle: (message: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GENERATE_TITLE, { message }),

	getSystemPromptSnapshot: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_PROMPT_SNAPSHOT, { sessionId }),

	resumeAfterToolConfirm: (sessionId: string, messageId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, {
			sessionId,
			messageId,
		}),

	// Session methods
	getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),

	createSession: (name: string, options?: { sessionId?: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, {
			name,
			sessionId: options?.sessionId,
		}),

	switchSession: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SWITCH_SESSION, { sessionId }),

	getSession: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION, { sessionId }),

	deleteSession: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, { sessionId }),

	renameSession: (sessionId: string, newName: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.RENAME_SESSION, { sessionId, newName }),

	createBranch: (parentSessionId: string, branchFromMessageId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.CREATE_BRANCH, {
			parentSessionId,
			branchFromMessageId,
		}),

	updateSessionPin: (sessionId: string, isPinned: boolean) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_PIN, {
			sessionId,
			isPinned,
		}),

	updateSessionModel: (sessionId: string, provider: string, model: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_MODEL, {
			sessionId,
			provider,
			model,
		}),

	updateSessionAgent: (sessionId: string, agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_AGENT, {
			sessionId,
			agentId,
		}),

	updateSessionPermissionMode: (sessionId: string, permissionMode: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_PERMISSION_MODE, {
			sessionId,
			permissionMode,
		}),

	updateSessionArchived: (
		sessionId: string,
		isArchived: boolean,
		archivedAt?: number | null,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_ARCHIVED, {
			sessionId,
			isArchived,
			archivedAt,
		}),

	updateSessionWorkingDirectory: (
		sessionId: string,
		workingDirectory: string | null,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_WORKING_DIRECTORY, {
			sessionId,
			workingDirectory,
		}),

	// ── Variables subsystem ─────────────────────────────────────
	// Live updates arrive through the existing session:variables-updated
	// event; these RPCs are for explicit fetches and writes.
	listVariables: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_LIST, { sessionId }),

	setVariable: (
		sessionId: string,
		name: string,
		value: string,
		description?: string,
		scope?: "global" | "session",
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_SET, {
			sessionId,
			name,
			value,
			description,
			scope,
		}),

	deleteVariable: (sessionId: string, name: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_DELETE, { sessionId, name }),

	// ── Session goals ───────────────────────────────────────────
	// Live updates arrive through the session:goal-updated event; these
	// RPCs are the initial fetch and the /goal command's mutations.
	goalGet: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GOAL_GET, { sessionId }),

	goalSet: (request: {
		sessionId: string
		action: "create" | "update" | "clear"
		objective?: string
		status?: "active" | "paused"
		tokenBudget?: number | null
	}) => ipcRenderer.invoke(IPC_CHANNELS.GOAL_SET, request),

	goalDiffs: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GOAL_DIFFS, { sessionId }),

	// ── Token usage / billing ───────────────────────────────────
	getUsageSummary: (
		request: GetUsageSummaryRequest,
	): Promise<GetUsageSummaryResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_USAGE_SUMMARY, request),

	getSessionUsage: (
		request: GetSessionUsageRequest,
	): Promise<GetSessionUsageResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_USAGE, request),

	// ── Practice (kegel / pomodoro / exercise log) ──────────────
	practiceStart: (request: PracticeStartRequest): Promise<PracticeStateResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_START, request),

	practicePause: (): Promise<PracticeStateResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_PAUSE),

	practiceResume: (): Promise<PracticeStateResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_RESUME),

	practiceStop: (request?: PracticeStopRequest): Promise<PracticeStateResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_STOP, request),

	practiceGetState: (): Promise<PracticeStateResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_GET_STATE),

	practiceLog: (request: PracticeLogRequest): Promise<PracticeLogResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_LOG, request),

	practiceSummary: (request: PracticeSummaryRequest): Promise<PracticeSummaryResult> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_SUMMARY, request),

	practiceRecent: (request: PracticeRecentRequest): Promise<PracticeRecentResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_RECENT, request),

	practiceGetConfig: (): Promise<PracticeConfigResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_GET_CONFIG),

	practiceSetConfig: (request: PracticeSetConfigRequest): Promise<PracticeConfigResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_SET_CONFIG, request),

	onPracticeEvent: (callback: (payload: PracticeEventPayload) => void) => {
		const listener = (_event: any, payload: PracticeEventPayload) => callback(payload);
		ipcRenderer.on(IPC_CHANNELS.PRACTICE_EVENT, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.PRACTICE_EVENT, listener);
	},

	// Project directories — independent module
	projectDirsList: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_LIST),

	projectDirsGet: (path: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_GET, { path }),

	projectDirsAdd: (path: string, description?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_ADD, { path, description }),

	projectDirsUpdate: (path: string, description: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_UPDATE, { path, description }),

	projectDirsRemove: (path: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_REMOVE, { path }),

	getSessionTokenUsage: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_TOKEN_USAGE, sessionId),

	onContextSizeUpdated: (
		callback: (data: { sessionId: string; contextSize: number }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, listener);
	},

	onContextCompactStarted: (
		callback: (data: { sessionId: string }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.CONTEXT_COMPACT_STARTED, listener);
		return () =>
			ipcRenderer.removeListener(
				IPC_CHANNELS.CONTEXT_COMPACT_STARTED,
				listener,
			);
	},

	onContextCompactCompleted: (
		callback: (data: {
			sessionId: string;
			success: boolean;
			error?: string;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED, listener);
		return () =>
			ipcRenderer.removeListener(
				IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED,
				listener,
			);
	},

	updateSessionMaxTokens: (sessionId: string, maxTokens: number) =>
		ipcRenderer.invoke(
			IPC_CHANNELS.UPDATE_SESSION_MAX_TOKENS,
			sessionId,
			maxTokens,
		),

	// ============================================================================
	// Optimized Session Loading (Phase 4: Metadata Separation)
	// ============================================================================

	// Get sessions list (metadata only, no messages) - for fast startup
	getSessionsList: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS_LIST),

	// Activate session (returns details, no messages) - for session switching
	activateSession: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACTIVATE_SESSION, { sessionId }),

	// Get session messages (on-demand loading) - only when messages need to be displayed
	getSessionMessages: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_MESSAGES, { sessionId }),

	// Get a cursor-addressed page of session messages
	getSessionMessagesPage: (request: GetSessionMessagesPageRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_MESSAGES_PAGE, request),

	// Get lightweight user-message markers for navigation
	getSessionUserMarkers: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_USER_MARKERS, { sessionId }),

	// Get the session's table-of-contents segments
	getSessionSegments: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_SEGMENTS, { sessionId }),

	// Listen for messages changed event (for real-time sync)
	onSessionMessagesChanged: (
		callback: (data: {
			sessionId: string;
			action: "added" | "updated" | "deleted";
			messageId?: string;
		}) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.SESSION_MESSAGES_CHANGED, listener);
		return () =>
			ipcRenderer.removeListener(
				IPC_CHANNELS.SESSION_MESSAGES_CHANGED,
				listener,
			);
	},

	// In-memory session LRU cache (main process): stats + eviction on tab close
	getSessionCacheStats: () =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_CACHE_STATS),
	evictSessionCache: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVICT_SESSION_CACHE, { sessionId }),

	// System message methods (for /files command persistence)
	addSystemMessage: (
		sessionId: string,
		message: { id: string; role: string; content: string; timestamp: number },
	) => ipcRenderer.invoke("add-system-message", { sessionId, message }),

	removeFilesChangedMessage: (sessionId: string) =>
		ipcRenderer.invoke("remove-files-changed-message", { sessionId }),

	removeGitStatusMessage: (sessionId: string) =>
		ipcRenderer.invoke("remove-git-status-message", { sessionId }),

	// Generic remove message by ID (for close button functionality)
	removeMessage: (sessionId: string, messageId: string) =>
		ipcRenderer.invoke("remove-message", { sessionId, messageId }),

	// Settings methods
	getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

	saveSettings: (settings: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

	openSettingsWindow: (options?: { tab?: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS_WINDOW, options),

	onSettingsNavigate: (callback: (payload: { tab: string }) => void) => {
		const listener = (_event: any, payload: { tab: string }) => callback(payload);
		ipcRenderer.on(IPC_CHANNELS.SETTINGS_NAVIGATE, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_NAVIGATE, listener);
	},

	onSettingsChanged: (callback: (settings: any) => void) => {
		const listener = (_event: any, settings: any) => callback(settings);
		ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, listener);
	},

	// Gateway / IM channel methods
	gatewayGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_GET_STATUS),

	gatewayStart: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_START, request || {}),

	gatewayStop: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_STOP),

	gatewayWechatLogout: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_WECHAT_LOGOUT, request || {}),

	gatewayWechatAddAccount: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_WECHAT_ADD_ACCOUNT, request || {}),

	gatewayWechatStopAccount: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_WECHAT_STOP_ACCOUNT, request),

	gatewayWechatRemoveAccount: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_WECHAT_REMOVE_ACCOUNT, request),

	gatewayWechatRenameAccount: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_WECHAT_RENAME_ACCOUNT, request),

	channelIdentityListLinks: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_LIST_LINKS, request || {}),

	channelIdentityListProfiles: () =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_LIST_PROFILES),

	channelIdentityCreateProfile: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_CREATE_PROFILE, request),

	channelIdentityUpdateProfile: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_UPDATE_PROFILE, request),

	channelIdentityCreateLink: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_CREATE_LINK, request),

	channelIdentityDeleteLink: (id: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_DELETE_LINK, { id }),

	channelIdentityResolve: (origin: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_IDENTITY_RESOLVE, { origin }),

	channelDeliveryList: () =>
		ipcRenderer.invoke(IPC_CHANNELS.CHANNEL_DELIVERY_LIST),

	// Voice methods
	voiceGetState: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_GET_STATE),

	voiceStart: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_START, request || {}),

	voiceStop: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_STOP, request || {}),

	voiceSubmitUtterance: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_SUBMIT_UTTERANCE, request),

	voiceSubmitTranscript: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_SUBMIT_TRANSCRIPT, request),

	voiceSynthesize: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_SYNTHESIZE, request),

	voiceTestASR: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_TEST_ASR, request),

	voiceTestTTS: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_TEST_TTS, request),

	voiceGetTTSModels: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_GET_TTS_MODELS, request || {}),

	onVoiceEvent: (callback: (event: any) => void) => {
		const listener = (_event: any, event: any) => callback(event);
		ipcRenderer.on(IPC_CHANNELS.VOICE_EVENT, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_EVENT, listener);
	},

	voiceRuntimeReady: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_RUNTIME_READY),

	voiceRuntimeEvent: (event: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.VOICE_RUNTIME_EVENT, event),

	voiceAudioChunk: (payload: any) =>
		ipcRenderer.send(IPC_CHANNELS.VOICE_AUDIO_CHUNK, payload),

	onVoiceRuntimeCommand: (callback: (command: any) => void) => {
		const listener = (_event: any, command: any) => callback(command);
		ipcRenderer.on(IPC_CHANNELS.VOICE_RUNTIME_COMMAND, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.VOICE_RUNTIME_COMMAND, listener);
	},

	// Music radio methods
	musicGetState: () => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_GET_STATE),

	musicSetup: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_SETUP, request),

	onMusicEvent: (callback: (event: any) => void) => {
		const listener = (_event: any, event: any) => callback(event);
		ipcRenderer.on(IPC_CHANNELS.MUSIC_EVENT, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.MUSIC_EVENT, listener);
	},

	musicCommand: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_COMMAND, request),

	musicGetNowPlaying: () =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_GET_NOW_PLAYING),

	musicGetRadio: () => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_GET_RADIO),

	musicOpenRadio: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_OPEN_RADIO, request),

	musicSearch: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_SEARCH, request),

	musicRequestSong: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_REQUEST_SONG, request),

	musicGetProgramme: () => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_GET_PROGRAMME),

	musicProgrammeAction: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_PROGRAMME_ACTION, request),

	musicListProviders: () => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_LIST_PROVIDERS),

	musicSetProvider: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_SET_PROVIDER, request),

	musicGetLyrics: () => ipcRenderer.invoke(IPC_CHANNELS.MUSIC_GET_LYRICS),

	onMusicLyrics: (callback: (lyrics: any) => void) => {
		const listener = (_event: any, lyrics: any) => callback(lyrics);
		ipcRenderer.on(IPC_CHANNELS.MUSIC_LYRICS, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.MUSIC_LYRICS, listener);
	},

	onMusicNowPlaying: (callback: (nowPlaying: any) => void) => {
		const listener = (_event: any, nowPlaying: any) => callback(nowPlaying);
		ipcRenderer.on(IPC_CHANNELS.MUSIC_NOW_PLAYING, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.MUSIC_NOW_PLAYING, listener);
	},

	onMusicDjSpeak: (callback: (speak: any) => void) => {
		const listener = (_event: any, speak: any) => callback(speak);
		ipcRenderer.on(IPC_CHANNELS.MUSIC_DJ_SPEAK, listener);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.MUSIC_DJ_SPEAK, listener);
	},

	musicDjSpeakDone: (id: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MUSIC_DJ_SPEAK_DONE, { id }),

	getSystemTheme: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_THEME),

	testProxy: (proxy: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TEST_PROXY, {
			proxy: JSON.parse(JSON.stringify(proxy)),
		}),

	onSystemThemeChanged: (callback: (theme: "light" | "dark") => void) => {
		const listener = (_event: any, theme: "light" | "dark") => callback(theme);
		ipcRenderer.on(IPC_CHANNELS.SYSTEM_THEME_CHANGED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_THEME_CHANGED, listener);
	},

	// Agent methods
	listAgents: () => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_LIST),

	createAgent: (name: string, systemPrompt?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.AGENTS_CREATE, { name, systemPrompt }),

	updateAgent: (
		agentId: string,
		updates: { name?: string; systemPrompt?: string },
	) => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_UPDATE, { agentId, ...updates }),

	deleteAgent: (agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.AGENTS_DELETE, { agentId }),

	// Theme methods
	getThemes: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_ALL),

	getTheme: (themeId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.THEME_GET, themeId),

	applyTheme: (themeId: string, mode: "dark" | "light") =>
		ipcRenderer.invoke(IPC_CHANNELS.THEME_APPLY, themeId, mode),

	refreshThemes: (projectPath?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.THEME_REFRESH, projectPath),

	openThemesFolder: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_OPEN_FOLDER),

	// Model registry methods (reads from settings.json modelRegistry)
	getModelsWithCapabilities: (
		providerId: string,
		options?: { forceRefresh?: boolean },
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES, {
			providerId,
			forceRefresh: options?.forceRefresh,
		}),

	getAllModels: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_MODELS),

	searchModels: (query: string, providerId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SEARCH_MODELS, { query, providerId }),

	refreshModelRegistry: () =>
		ipcRenderer.invoke(IPC_CHANNELS.REFRESH_MODEL_REGISTRY),

	getModelNameAliases: () =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_NAME_ALIASES),

	getModelDisplayName: (modelId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_DISPLAY_NAME, { modelId }),

	// Providers methods
	getProviders: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDERS),

	getProviderUsage: (providerId: string): Promise<ProviderUsageResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDER_USAGE, { providerId }),

	getProviderEnvStatus: (
		providerId: string,
	): Promise<GetProviderEnvStatusResponse> =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDER_ENV_STATUS, {
			providerId,
		}),

	// Tools methods
	getTools: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TOOLS),

	executeTool: (
		toolId: string,
		args: Record<string, any>,
		messageId: string,
		sessionId: string,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_TOOL, {
			toolId,
			arguments: args,
			messageId,
			sessionId,
		}),

	cancelTool: (toolCallId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.CANCEL_TOOL, { toolCallId }),

	listBackgroundJobs: (options?: { includeInactive?: boolean }) =>
		ipcRenderer.invoke(IPC_CHANNELS.BACKGROUND_JOBS_LIST, options || {}),

	stopBackgroundJob: (jobId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.BACKGROUND_JOBS_STOP, { jobId }),

	updateToolCall: (
		sessionId: string,
		messageId: string,
		toolCallId: string,
		updates: Record<string, any>,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_TOOL_CALL, {
			sessionId,
			messageId,
			toolCallId,
			updates,
		}),

	// MCP methods
	mcpGetServers: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_SERVERS),

	mcpAddServer: (config: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_ADD_SERVER, { config }),

	mcpUpdateServer: (config: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE_SERVER, { config }),

	mcpRemoveServer: (serverId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_REMOVE_SERVER, { serverId }),

	mcpConnectServer: (serverId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT_SERVER, { serverId }),

	mcpDisconnectServer: (serverId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT_SERVER, { serverId }),

	mcpRefreshServer: (serverId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_REFRESH_SERVER, { serverId }),

	mcpGetTools: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_TOOLS),

	mcpCallTool: (
		serverId: string,
		toolName: string,
		args: Record<string, any>,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, {
			serverId,
			toolName,
			arguments: args,
		}),

	mcpGetResources: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_RESOURCES),

	mcpReadResource: (serverId: string, uri: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_READ_RESOURCE, { serverId, uri }),

	mcpGetPrompts: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_PROMPTS),

	mcpGetPrompt: (
		serverId: string,
		name: string,
		args?: Record<string, string>,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_PROMPT, {
			serverId,
			name,
			arguments: args,
		}),

	mcpReadConfigFile: (filePath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MCP_READ_CONFIG_FILE, { filePath }),

	// ACP methods
	acpGetAgents: () => ipcRenderer.invoke(IPC_CHANNELS.ACP_GET_AGENTS),

	acpAddAgent: (config: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_ADD_AGENT, { config }),

	acpUpdateAgent: (config: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_UPDATE_AGENT, { config }),

	acpRemoveAgent: (agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_REMOVE_AGENT, { agentId }),

	acpConnectAgent: (agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_CONNECT_AGENT, { agentId }),

	acpDisconnectAgent: (agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_DISCONNECT_AGENT, { agentId }),

	acpRefreshAgent: (agentId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_REFRESH_AGENT, { agentId }),

	acpCancelSession: (sessionId: string, agentId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.ACP_CANCEL_SESSION, { sessionId, agentId }),

	// Skills methods (Official Claude Code Skills)
	getSkills: (workingDirectory?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET_ALL, { workingDirectory }),

	refreshSkills: () => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_REFRESH),

	readSkillFile: (skillId: string, fileName: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_READ_FILE, { skillId, fileName }),

	openSkillDirectory: (skillId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_OPEN_DIRECTORY, { skillId }),

	createSkill: (
		name: string,
		description: string,
		instructions: string,
		source: "user" | "project",
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_CREATE, {
			name,
			description,
			instructions,
			source,
		}),

	deleteSkill: (skillId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, { skillId }),

	toggleSkillEnabled: (skillId: string, enabled: boolean) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_TOGGLE_ENABLED, {
			skillId,
			enabled,
		}),

	listSkillDirectories: () =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST_DIRECTORIES),

	addSkillDirectory: (request: {
		path: string;
		label?: string;
		agentId?: string | null;
	}) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_ADD_DIRECTORY, request),

	updateSkillDirectory: (request: {
		id: string;
		enabled?: boolean;
		label?: string;
		agentId?: string | null;
	}) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_UPDATE_DIRECTORY, request),

	removeSkillDirectory: (id: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_REMOVE_DIRECTORY, { id }),

	setSkillAgent: (skillId: string, agentId: string | null) =>
		ipcRenderer.invoke(IPC_CHANNELS.SKILLS_SET_AGENT, { skillId, agentId }),

	// Message update methods
	updateMessageThinkingTime: (
		sessionId: string,
		messageId: string,
		thinkingTime: number,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.UPDATE_MESSAGE_THINKING_TIME, {
			sessionId,
			messageId,
			thinkingTime,
		}),

	// Dialog methods
	showOpenDialog: (options: {
		properties?: Array<"openFile" | "openDirectory" | "multiSelections">;
		title?: string;
		defaultPath?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options),

	// Shell methods
	openPath: (filePath: string) =>
		ipcRenderer.invoke("shell:open-path", filePath),

	openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

	getDataPath: () => ipcRenderer.invoke("app:get-data-path"),

	// Window methods
	setWindowButtonVisibility: (visible: boolean) =>
		ipcRenderer.invoke("window:set-button-visibility", visible),

	// File methods
	// Resolves the on-disk path of a dropped/picked File so attachments can
	// carry it to the model (pasted files have no path and yield "").
	getPathForFile: (file: File) => {
		try {
			return webUtils.getPathForFile(file);
		} catch {
			return "";
		}
	},

	// Clipboard methods
	writeClipboardText: (text: string) => {
		try {
			clipboard.writeText(String(text ?? ""));
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},

	// Media methods
	saveImage: (data: {
		url?: string;
		base64?: string;
		prompt: string;
		revisedPrompt?: string;
		model: string;
		sessionId: string;
		messageId: string;
	}) => ipcRenderer.invoke("media:save-image", data),

	loadAllMedia: () => ipcRenderer.invoke("media:load-all"),

	deleteMedia: (id: string) => ipcRenderer.invoke("media:delete", id),

	clearAllMedia: () => ipcRenderer.invoke("media:clear-all"),

	readImageBase64: (filePath: string) =>
		ipcRenderer.invoke("media:read-image-base64", filePath),

	listMediaAssets: (query?: MediaQuery) =>
		ipcRenderer.invoke(IPC_CHANNELS.LIST_MEDIA_ASSETS, query),

	hideMediaAsset: (id: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.HIDE_MEDIA_ASSET, id),

	rebuildMediaLibrary: () =>
		ipcRenderer.invoke(IPC_CHANNELS.REBUILD_MEDIA_LIBRARY),

	getMediaGallery: (assetId: string, query?: MediaQuery) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_MEDIA_GALLERY, { assetId, query }),

	// Image preview methods
	openImagePreview: (src: string, alt?: string) => {
		console.log("[Preload] openImagePreview called:", {
			src: src.substring(0, 50),
			alt,
		});
		return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_PREVIEW, { src, alt });
	},

	getImagePreview: (previewId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.GET_IMAGE_PREVIEW, previewId),

	onImagePreviewUpdate: (
		callback: (data: {
			mode: "single";
			previewId?: string;
			src?: string;
			alt?: string;
		}) => void,
	) => {
		const listener = (
			_event: any,
			data: { mode: "single"; previewId?: string; src?: string; alt?: string },
		) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener);
	},

	// Image gallery methods (now uses mediaId - gallery loads its own data)
	openImageGallery: (mediaId: string) => {
		console.log("[Preload] openImageGallery called:", { mediaId });
		return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_GALLERY, { mediaId });
	},

	// Permission methods. Responses go through emitCommand() with
	// type: 'command:permission-respond' (EventBus channel affinity validation).
	// Permission requests arrive via session:event channel as 'permission:request'.
	getPendingPermissions: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_PENDING, sessionId),

	clearSessionPermissions: (sessionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_SESSION, sessionId),

	// OAuth methods
	oauthStart: (providerId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_START, { providerId }),

	oauthLogout: (providerId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_LOGOUT, { providerId }),

	oauthGetStatus: (providerId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_STATUS, { providerId }),

	oauthDevicePoll: (providerId: string, flowId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_DEVICE_POLL, { providerId, flowId }),

	oauthRefresh: (providerId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_REFRESH, { providerId }),

	oauthCallback: (providerId: string, code: string, state: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.OAUTH_CALLBACK, {
			providerId,
			code,
			state,
		}),

	// OAuth event listeners
	onOAuthTokenRefreshed: (callback: (data: { providerId: string }) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, listener);
	},

	onOAuthTokenExpired: (
		callback: (data: { providerId: string; error?: string }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.OAUTH_TOKEN_EXPIRED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_TOKEN_EXPIRED, listener);
	},

	// Window
	closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

	// Menu event listeners
	onMenuNewChat: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu:new-chat", listener);
		return () => ipcRenderer.removeListener("menu:new-chat", listener);
	},

	onMenuCloseChat: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu:close-chat", listener);
		return () => ipcRenderer.removeListener("menu:close-chat", listener);
	},

	// Files methods (for @ file search)
	listFiles: (options: { cwd?: string; query?: string; limit?: number }) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILES_LIST, options),

	// File rollback (prefer auditPath for hash-revalidated rollback)
	rollbackFile: (options: {
		auditPath?: string;
		filePath?: string;
		originalContent?: string;
		isNew?: boolean;
	}) => ipcRenderer.invoke(IPC_CHANNELS.FILE_ROLLBACK, options),

	// Directories listing (for /cd path completion)
	listDirs: (options: { basePath: string; query?: string; limit?: number }) =>
		ipcRenderer.invoke(IPC_CHANNELS.DIRS_LIST, options),

	// File content reading/writing (for file preview panel)
	readFileContent: (filePath: string, maxSize?: number) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_CONTENT, {
			path: filePath,
			maxSize,
		}),
	saveFileContent: (
		filePath: string,
		content: string,
		expectedMtimeMs?: number,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_CONTENT, {
			path: filePath,
			content,
			expectedMtimeMs,
		}),
	listDirectory: (dirPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST_DIRECTORY, { path: dirPath }),
	createFile: (filePath: string, content?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE, { path: filePath, content }),
	createDirectory: (dirPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE_DIRECTORY, { path: dirPath }),
	renamePath: (oldPath: string, newPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, { oldPath, newPath }),
	deletePath: (targetPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, { path: targetPath }),
	statPath: (targetPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_STAT, { path: targetPath }),
	revealPath: (targetPath: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_REVEAL, { path: targetPath }),
	watchWorkspace: (root: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_START, { root }),
	unwatchWorkspace: (root: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_STOP, { root }),
	onWorkspaceFileChanged: (
		callback: (data: { root: string; path: string; eventType: string }) => void,
	) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.FILE_WATCH_EVENT, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.FILE_WATCH_EVENT, listener);
	},

	resolveMarkdownAsset: (request: MarkdownResolveAssetRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.MARKDOWN_RESOLVE_ASSET, request),

	saveMarkdownAttachments: (request: MarkdownSaveAttachmentsRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.MARKDOWN_SAVE_ATTACHMENTS, request),

	// ── Plugin management ───────────────────────────
	getPlugins: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_LIST),

	enablePlugin: (pluginId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_ENABLE, { pluginId }),

	disablePlugin: (pluginId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_DISABLE, { pluginId }),

	refreshPlugins: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_REFRESH),

	getPluginCommands: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_COMMANDS),

	executePluginCommand: (
		commandName: string,
		args: string,
		sessionId: string,
	) =>
		ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_EXECUTE_COMMAND, {
			commandName,
			args,
			sessionId,
		}),

	// ── Soul / Memory panel ────────────────────────
	getMemoryOverview: (agentId?: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.MEMORY_OVERVIEW, { agentId }),

	readMemoryFile: (request: {
		path: string;
		agentId?: string;
		startLine?: number;
		endLine?: number;
		lines?: number;
		full?: boolean;
	}) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_READ, request),

	appendMemory: (request: {
		content: string;
		agentId?: string;
		target?: "daily";
		heading?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_APPEND, request),

	saveMemoryFile: (request: {
		path: string;
		content: string;
		agentId?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SAVE_FILE, request),

	listMemoryLogs: (request?: {
		limit?: number;
		query?: string;
		level?: string;
		subsystem?: string;
		status?: string;
		since?: number;
	}) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LOGS_LIST, request),

	getMemoryLogStats: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LOGS_STATS),

	openMemoryLogFolder: () =>
		ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LOGS_OPEN_FOLDER),

	cleanupMemoryLogs: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LOGS_CLEANUP),

	saveMemoryCapture: (request?: { id?: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CAPTURE_SAVE, request),

	discardMemoryCapture: (request?: { id?: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CAPTURE_DISCARD, request),

	listSchedulerTasks: () => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_LIST),

	getSchedulerTask: (request: { id: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_GET, request),

	runSchedulerTaskNow: (request: { id: string; force?: boolean }) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_RUN_NOW, request),

	setSchedulerTaskEnabled: (request: { id: string; enabled: boolean }) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_SET_ENABLED, request),

	createSchedulerTask: (request: SchedulerCreateTaskRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_CREATE_TASK, request),

	updateSchedulerTask: (request: SchedulerUpdateTaskRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_UPDATE_TASK, request),

	deleteSchedulerTask: (request: SchedulerDeleteTaskRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_DELETE_TASK, request),

	listSchedulerRuns: (request: SchedulerListRunsRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_LIST_RUNS, request),

	getSchedulerRun: (request: SchedulerGetRunRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_GET_RUN, request),

	// ── User Prompts ───────────────────────────────
	listPrompts: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_LIST),

	getPrompt: (request: PromptGetRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_GET, request),

	createPrompt: (request: PromptCreateRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_CREATE, request),

	updatePrompt: (request: PromptUpdateRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_UPDATE, request),

	deletePrompt: (request: PromptDeleteRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_DELETE, request),

	// ── App State (restore on startup) ─────────────
	getAppState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_STATE),

	saveUIState: (uiState: {
		openTabs?: Array<{
			type: string;
			sessionId?: string;
			filePath?: string;
			title?: string;
		}>;
		activeTabIndex?: number;
		sidebarCollapsed?: boolean;
	}) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_UI_STATE, uiState),

	// ── Search Everywhere ──────────────────────────
	toggleSearchWindow: (options?: SearchWindowOpenOptions) =>
		ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WINDOW_TOGGLE, options),

	closeSearchWindow: () => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WINDOW_CLOSE),

	setSearchWindowAnchor: (anchor: SearchWindowAnchor | null) =>
		ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WINDOW_SET_ANCHOR, anchor),

	onSearchWindowShown: (
		callback: (payload?: SearchWindowShownPayload | null) => void,
	) => {
		const listener = (_event: any, payload?: SearchWindowShownPayload | null) =>
			callback(payload);
		ipcRenderer.on(IPC_CHANNELS.SEARCH_WINDOW_SHOWN, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_WINDOW_SHOWN, listener);
	},

	onSearchWindowGuides: (callback: (state: SearchWindowGuideState) => void) => {
		const listener = (_event: any, state: SearchWindowGuideState) =>
			callback(state);
		ipcRenderer.on(IPC_CHANNELS.SEARCH_WINDOW_GUIDES, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_WINDOW_GUIDES, listener);
	},

	searchQuery: (req: SearchRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.SEARCH_QUERY, req),

	searchExecuteAction: (actionId: string) =>
		ipcRenderer.invoke(IPC_CHANNELS.SEARCH_EXECUTE_ACTION, actionId),

	onSearchAction: (callback: (actionId: string) => void) => {
		const listener = (_event: any, actionId: string) => callback(actionId);
		ipcRenderer.on(IPC_CHANNELS.SEARCH_ACTION, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_ACTION, listener);
	},

	// Todo / Plan
	getTodoPlan: (request?: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_GET, request),

	createTodoPlanNote: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_CREATE, request),

	updateTodoPlan: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_UPDATE, request),

	renameTodoPlanNote: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_RENAME, request),

	deleteTodoPlanNote: (request: any) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_DELETE, request),

	revealTodoPlanDirectory: () =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_REVEAL_DIRECTORY),

	openTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_OPEN_WINDOW, request),

	hideTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_HIDE_WINDOW, request),

	toggleTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_TOGGLE_WINDOW, request),

	setTodoPlanWindowPinned: (pinned: boolean) =>
		ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_SET_WINDOW_PINNED, { pinned }),

	onTodoPlanChanged: (callback: (data: any) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.TODO_PLAN_CHANGED, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.TODO_PLAN_CHANGED, listener);
	},

	// Evals (prompt evaluation) — 👎 downvote + Review + Run + Actions
	recordEvalsDownvote: (request: {
		sessionId: string;
		turnId: string;
		userMessage: string;
		note?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_RECORD_DOWNVOTE, request),

	// Phase 1: Review (read-only)
	evalsListRecords: (request: {
		negativeOnly?: boolean;
		category?: string;
		sinceTs?: string;
		limit?: number;
		offset?: number;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_LIST_RECORDS, request),

	evalsListFixtures: () => ipcRenderer.invoke(IPC_CHANNELS.EVALS_LIST_FIXTURES),

	evalsReadFixture: (request: { fixturePath: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_READ_FIXTURE, request),

	evalsListResults: () => ipcRenderer.invoke(IPC_CHANNELS.EVALS_LIST_RESULTS),

	evalsListCases: () => ipcRenderer.invoke(IPC_CHANNELS.EVALS_LIST_CASES),

	evalsGetCase: (request: { caseId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_GET_CASE, request),

	// Phase 2: Run
	evalsRunStart: (request: {
		caseIds?: string[];
		runs: number;
		disabledSections?: string[];
		providerId: string;
		model: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_RUN_START, request),

	evalsRunCancel: () => ipcRenderer.invoke(IPC_CHANNELS.EVALS_RUN_CANCEL),

	onEvalsRunProgress: (callback: (event: any) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.EVALS_RUN_PROGRESS, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.EVALS_RUN_PROGRESS, listener);
	},

	// Phase 3: Actions
	evalsPromoteFixture: (request: {
		fixturePath: string;
		caseId: string;
		description: string;
		expect: {
			firstToolCall?: string;
			contains?: string;
			notContains?: string;
		};
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_PROMOTE_FIXTURE, request),

	evalsRetireCase: (request: { caseId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_RETIRE_CASE, request),

	evalsGenerateTriage: (request?: { weeks?: number }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_GENERATE_TRIAGE, request || {}),

	evalsReadRunDetail: (request: { detailPath: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_READ_RUN_DETAIL, request),

	// Evals Workbench (incident-centric)
	evalsIncidentList: () =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_LIST),

	evalsIncidentGet: (request: { incidentId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_GET, request),

	evalsIncidentUpdate: (request: {
		incidentId: string;
		patch: { status?: string; note?: string; rubric?: string; title?: string };
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_UPDATE, request),

	evalsIncidentReadFile: (request: {
		incidentId: string;
		relativePath: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_READ_FILE, request),

	evalsReplayStart: (request: {
		incidentId: string;
		runs?: number;
		disabledSections?: string[];
		judge?: boolean;
		useCapturedPrompt?: boolean;
		providerId?: string;
		model?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_REPLAY_START, request),

	evalsReplayCancel: (request: { incidentId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_REPLAY_CANCEL, request),

	onEvalsReplayProgress: (callback: (event: any) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.EVALS_REPLAY_PROGRESS, listener);
		return () =>
			ipcRenderer.removeListener(IPC_CHANNELS.EVALS_REPLAY_PROGRESS, listener);
	},

	evalsIncidentAnalyze: (request: { incidentId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_ANALYZE, request),

	evalsIncidentPromote: (request: {
		incidentId: string;
		caseId: string;
		description?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_INCIDENT_PROMOTE, request),

	evalsDiagnoseStart: (request: { incidentId: string; quick?: boolean }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_DIAGNOSE_START, request),

	onEvalsDiagnoseProgress: (callback: (event: any) => void) => {
		const listener = (_event: any, data: any) => callback(data);
		ipcRenderer.on(IPC_CHANNELS.EVALS_DIAGNOSE_PROGRESS, listener);
		return () =>
			ipcRenderer.removeListener(
				IPC_CHANNELS.EVALS_DIAGNOSE_PROGRESS,
				listener,
			);
	},

	evalsRoundList: (request: { incidentId: string }) =>
		ipcRenderer.invoke(IPC_CHANNELS.EVALS_ROUND_LIST, request),

	evalsRoundReplay: (request: {
		incidentId: string;
		round: number;
		runs?: number;
		editedMessages?: unknown[];
		providerId?: string;
		model?: string;
	}) => ipcRenderer.invoke(IPC_CHANNELS.EVALS_ROUND_REPLAY, request),
};

export function installOnethingPreloadBridge(): void {
	contextBridge.exposeInMainWorld("electronAPI", electronAPI);
}
