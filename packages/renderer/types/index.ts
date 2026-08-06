import type {
	NotifyActivateEvent,
	ShowNotificationRequest,
	ChatMessage,
	ChatMessageMention,
	ChatMessageReaction,
	ChatMessageReactionActor,
	ChatMessageReplyTo,
	ChatSession,
	ContextVariable,
	AgentDefinition,
	AgentsListResponse,
	AgentCreateResponse,
	AgentUpdateRequest,
	AgentUpdateResponse,
	AgentDeleteResponse,
	AgentRestoreResponse,
	UserPrompt,
	PromptReferenceSnapshot,
	PromptListResponse,
	PromptGetResponse,
	PromptCreateRequest,
	PromptCreateResponse,
	PromptUpdateRequest,
	PromptUpdateResponse,
	PromptDeleteRequest,
	PromptDeleteResponse,
	SessionMeta,
	SessionDetails,
	GetSessionsListResponse,
	ActivateSessionResponse,
	GetSessionMessagesResponse,
	GetSessionMessagesPageRequest,
	GetSessionMessagesPageResponse,
	UserMessageMarker,
	GetSessionUserMarkersResponse,
	AISettings,
	AppSettings,
	AIProvider,
	ProviderConfig,
	ModelCapabilityOverride,
	CustomProviderConfig,
	ProviderInfo,
	CodexProviderUsage,
	CodexUsageLimit,
	CodexUsageWindow,
	ProviderEnvStatus,
	GetProviderEnvStatusResponse,
	ProviderUsageResponse,
	ModelInfo,
	OpenRouterModel,
	ColorTheme,
	BaseTheme,
	MessageListDensity,
	TypographyDensity,
	KeyboardShortcut,
	ShortcutSettings,
	EditorSettings,
	ChatSettings,
	ProxySettings,
	NetworkSettings,
	GatewayStatus,
	GatewayGetStatusResponse,
	GatewayStartRequest,
	GatewayStartResponse,
	GatewayStopResponse,
	GatewayWechatAddAccountRequest,
	GatewayWechatAddAccountResponse,
	GatewayWechatStopAccountRequest,
	GatewayWechatStopAccountResponse,
	GatewayWechatRemoveAccountRequest,
	GatewayWechatRemoveAccountResponse,
	GatewayWechatRenameAccountRequest,
	GatewayWechatRenameAccountResponse,
	GatewayWechatLogoutRequest,
	GatewayWechatLogoutResponse,
	MessageOrigin,
	ChannelUserLink,
	ChannelUserProfile,
	ChannelIdentityListLinksRequest,
	ChannelIdentityListLinksResponse,
	ChannelIdentityListProfilesResponse,
	ChannelIdentityCreateLinkRequest,
	ChannelIdentityCreateLinkResponse,
	ChannelIdentityCreateProfileRequest,
	ChannelIdentityCreateProfileResponse,
	ChannelIdentityDeleteLinkResponse,
	ChannelIdentityUpdateProfileRequest,
	ChannelIdentityUpdateProfileResponse,
	ChannelIdentityResolveResponse,
	ChannelReplyDeliveryRecord,
	VoiceAudioChunkPayload,
	VoiceEndpointingMode,
	VoiceEvent,
	VoiceLatencyMilestone,
	VoiceLatencyMilestoneName,
	VoiceRuntimeCommand,
	VoiceRuntimeState,
	VoiceSettings,
	VoiceStartRequest,
	VoiceStopRequest,
	VoiceSubmitUtteranceRequest,
	VoiceSubmitTranscriptRequest,
	VoiceSynthesizeRequest,
	VoiceTestASRRequest,
	VoiceTestTTSRequest,
	VoiceGetStateResponse,
	VoiceSubmitUtteranceResponse,
	VoiceSynthesizeResponse,
	VoiceTTSModel,
	VoiceTTSModelsResponse,
	MusicEvent,
	MusicGetStateResponse,
	MusicSetupRequest,
	MusicSetupResponse,
	MusicNowPlaying,
	MusicCommand,
	MusicCommandRequest,
	MusicCommandResponse,
	MusicRadioState,
	MusicListProvidersResponse,
	MusicGetProgrammeResponse,
	MusicOpenRadioRequest,
	MusicSearchRequest,
	MusicSearchResponse,
	MusicSearchRecordDTO,
	MusicRequestSongRequest,
	MusicRequestSongResponse,
	MusicProgrammeActionRequest,
	MusicProgrammeEntryDTO,
	MusicProviderDescriptorDTO,
	MusicSetProviderRequest,
	MusicBaseResponse,
	MusicLyricLine,
	MusicLyrics,
	MusicDjSpeak,
	MusicRuntimeState,
	MusicPlayerBackend,
	MusicRadioSource,
	MusicEnvStatus,
	MusicSettings,
	MessageAttachment,
	AttachmentMediaType,
	MediaKind,
	MediaSource,
	MediaAsset,
	MediaAssetLink,
	MediaAssetMetadata,
	MediaQuery,
	MediaUsageTag,
	MediaGalleryResponse,
	MediaRebuildResponse,
	MarkdownResolveAssetRequest,
	MarkdownResolveAssetResponse,
	MarkdownSaveAttachmentsRequest,
	MarkdownSaveAttachmentsResponse,
	GetChatHistoryResponse,
	GetSystemPromptSnapshotResponse,
	SystemPromptSkillSnapshot,
	SystemPromptSnapshot,
	SystemPromptToolSnapshot,
	GetSessionsResponse,
	CreateSessionResponse,
	CreateSessionOptions,
	SwitchSessionResponse,
	DeleteSessionResponse,
	RenameSessionResponse,
	CreateBranchResponse,
	UpdateSessionPinResponse,
	GetSettingsResponse,
	SaveSettingsResponse,
	GenerateTitleResponse,
	GetProvidersResponse,
	ToolDefinition,
	ToolParameter,
	ToolCall,
	DiffHunk,
	DiffHunkLine,
	ToolResult,
	ToolPartialResult,
	ToolRenderKind,
	PermissionMode,
	ToolSettings,
	BashToolSettings,
	GetToolsResponse,
	ExecuteToolResponse,
	ContentPart,
	Step,
	StepType,
	// UIMessage types (AI SDK 6.x compatible)
	UIMessage,
	UIMessagePart,
	TextUIPart,
	ReasoningUIPart,
	ToolUIPart,
	ToolUIState,
	FileUIPart,
	StepUIPart,
	ErrorUIPart,
	MessageMetadata,
	UIMessageChunk,
	UIMessageStreamData,
	// MCP types
	MCPServerConfig,
	MCPServerState,
	MCPToolInfo,
	MCPResourceInfo,
	MCPPromptInfo,
	MCPSettings,
	MCPGetServersResponse,
	MCPAddServerResponse,
	MCPUpdateServerResponse,
	MCPRemoveServerResponse,
	MCPConnectServerResponse,
	MCPDisconnectServerResponse,
	MCPRefreshServerResponse,
	MCPGetToolsResponse,
	MCPCallToolResponse,
	MCPGetResourcesResponse,
	MCPReadResourceResponse,
	MCPGetPromptsResponse,
	MCPGetPromptResponse,
	MCPReadConfigFileResponse,
	// ACP types
	ACPAgentConfig,
	ACPAgentState,
	ACPSettings,
	ACPGetAgentsResponse,
	ACPAddAgentResponse,
	ACPUpdateAgentResponse,
	ACPRemoveAgentResponse,
	ACPConnectAgentResponse,
	ACPDisconnectAgentResponse,
	ACPRefreshAgentResponse,
	ACPCancelSessionResponse,
	// Skills types (Official Claude Code Skills)
	SkillDefinition,
	SkillFile,
	SkillSource,
	SkillSettings,
	GetSkillsResponse,
	RefreshSkillsResponse,
	ReadSkillFileResponse,
	OpenSkillDirectoryResponse,
	CreateSkillResponse,
	SkillDirectoryConfig,
	ListSkillDirectoriesResponse,
	AddSkillDirectoryRequest,
	AddSkillDirectoryResponse,
	UpdateSkillDirectoryRequest,
	UpdateSkillDirectoryResponse,
	RemoveSkillDirectoryResponse,
	SetSkillAgentResponse,
	PluginCommandInfo,
	GetPluginCommandsResponse,
	ExecutePluginCommandResponse,
	MemoryAppendRequest,
	MemoryAppendResponse,
	MemoryCaptureDecisionRequest,
	MemoryCaptureDecisionResponse,
	MemoryOverviewResponse,
	MemoryLogsCleanupResponse,
	MemoryLogsListRequest,
	MemoryLogsListResponse,
	MemoryLogsStatsResponse,
	MemoryReadRequest,
	MemoryReadResponse,
	MemorySaveFileRequest,
	MemorySaveFileResponse,
	AbortPluginRequestResult,
	PluginNotificationPayload,
	PluginRequestPayload,
	PluginRequestProgressPayload,
	PluginRequestResult,
	SchedulerSchedule,
	SchedulerRunDetailDTO,
	SchedulerTaskSnapshotDTO,
	SchedulerGetRequest,
	SchedulerGetResponse,
	SchedulerCreateTaskRequest,
	SchedulerUpdateTaskRequest,
	SchedulerDeleteTaskRequest,
	SchedulerWriteTaskResponse,
	SchedulerDeleteTaskResponse,
	SchedulerListRunsRequest,
	SchedulerListRunsResponse,
	SchedulerGetRunRequest,
	SchedulerGetRunResponse,
	SchedulerListResponse,
	SchedulerRunNowRequest,
	SchedulerRunNowResponse,
	SchedulerSetEnabledRequest,
	SchedulerSetEnabledResponse,
	SearchRequest,
	SearchResponse,
	SearchWindowAnchor,
	SearchWindowGuideState,
	SearchWindowOpenOptions,
	SearchWindowShownPayload,
	// Permission types
	PermissionInfo,
	PermissionResponse,
	// Interaction types (agent 提问 → 用户应答)
	InteractionAnswer,
	InteractionGetPendingResponse,
	InteractionOption,
	InteractionOrigin,
	InteractionOutcome,
	InteractionQuestion,
	InteractionQuestionAnswer,
	InteractionRequest,
	InteractionRespondRequest,
	InteractionRespondResponse,
	// Theme types
	ThemeMeta,
	Theme,
	GetThemesResponse,
	GetThemeResponse,
	ApplyThemeResponse,
	RefreshThemesResponse,
	// Variables types
	VariablesListResponse,
	VariablesSetResponse,
	VariablesDeleteResponse,
	// Session goal types
	SessionGoal,
	SessionGoalStatus,
	// Session TOC types
	SessionSegment,
	SessionSegmentFile,
	SessionSegmentOutcome,
	GoalDiffsResponse,
	GoalFileDiff,
	GoalGetResponse,
	GoalSetRequest,
	GoalSetResponse,
	// Token usage / billing types
	GetUsageSummaryRequest,
	GetUsageSummaryResponse,
	GetSessionUsageRequest,
	GetSessionUsageResponse,
	OnethingUsageBreakdownEntry,
	OnethingUsageBucket,
	OnethingUsageSummaryGranularity,
	// Project directories types (independent module)
	ProjectDirsListResponse,
	ProjectDirsGetResponse,
	ProjectDirsAddResponse,
	ProjectDirsUpdateResponse,
	ProjectDirsRemoveResponse,
	TodoPlanChangedPayload,
	TodoPlanCreateRequest,
	TodoPlanCreateResponse,
	TodoPlanDocument,
	TodoPlanGetRequest,
	TodoPlanGetResponse,
	TodoPlanRenameRequest,
	TodoPlanRenameResponse,
	TodoPlanDeleteRequest,
	TodoPlanDeleteResponse,
	TodoPlanSnapshot,
	TodoPlanUpdateResponse,
	TodoPlanUpdateRequest,
	TodoPlanWindowActionRequest,
	PracticeConfig,
	PracticeConfigResponse,
	PracticeEventPayload,
	PracticeLedgerRecord,
	PracticePhaseEdge,
	PracticeSnapshot,
	PracticeSummaryGranularity,
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
} from "@shared/ipc";

export type {
	ChatMessage,
	ChatMessageMention,
	ChatMessageReaction,
	ChatMessageReactionActor,
	ChatMessageReplyTo,
	ChatSession,
	ContextVariable,
	SessionGoal,
	SessionGoalStatus,
	SessionSegment,
	SessionSegmentFile,
	SessionSegmentOutcome,
	GoalDiffsResponse,
	GoalFileDiff,
	GoalGetResponse,
	GoalSetRequest,
	GoalSetResponse,
	GetUsageSummaryRequest,
	GetUsageSummaryResponse,
	GetSessionUsageRequest,
	GetSessionUsageResponse,
	PracticeConfig,
	PracticeConfigResponse,
	PracticeEventPayload,
	PracticeLedgerRecord,
	PracticePhaseEdge,
	PracticeSnapshot,
	PracticeSummaryGranularity,
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
	OnethingUsageBreakdownEntry,
	OnethingUsageBucket,
	OnethingUsageSummaryGranularity,
	AgentDefinition,
	AgentsListResponse,
	AgentCreateResponse,
	AgentUpdateRequest,
	AgentUpdateResponse,
	AgentDeleteResponse,
	AgentRestoreResponse,
	UserPrompt,
	PromptReferenceSnapshot,
	PromptListResponse,
	PromptGetResponse,
	PromptCreateRequest,
	PromptCreateResponse,
	PromptUpdateRequest,
	PromptUpdateResponse,
	PromptDeleteRequest,
	PromptDeleteResponse,
	CreateSessionOptions,
	SessionMeta,
	SessionDetails,
	GetSessionsListResponse,
	ActivateSessionResponse,
	GetSessionMessagesResponse,
	GetSessionMessagesPageRequest,
	GetSessionMessagesPageResponse,
	UserMessageMarker,
	GetSessionUserMarkersResponse,
	GetSystemPromptSnapshotResponse,
	SystemPromptSkillSnapshot,
	SystemPromptSnapshot,
	SystemPromptToolSnapshot,
	AISettings,
	AppSettings,
	AIProvider,
	ProviderConfig,
	ModelCapabilityOverride,
	CustomProviderConfig,
	ProviderInfo,
	CodexProviderUsage,
	CodexUsageLimit,
	CodexUsageWindow,
	ProviderEnvStatus,
	GetProviderEnvStatusResponse,
	ProviderUsageResponse,
	ModelInfo,
	OpenRouterModel,
	ColorTheme,
	BaseTheme,
	MessageListDensity,
	TypographyDensity,
	KeyboardShortcut,
	ShortcutSettings,
	EditorSettings,
	ChatSettings,
	ProxySettings,
	NetworkSettings,
	GatewayStatus,
	GatewayGetStatusResponse,
	GatewayStartRequest,
	GatewayStartResponse,
	GatewayStopResponse,
	GatewayWechatLogoutResponse,
	MessageOrigin,
	ChannelUserLink,
	ChannelUserProfile,
	VoiceAudioChunkPayload,
	VoiceEndpointingMode,
	VoiceEvent,
	VoiceLatencyMilestone,
	VoiceLatencyMilestoneName,
	VoiceRuntimeCommand,
	VoiceRuntimeState,
	VoiceSettings,
	VoiceStartRequest,
	VoiceStopRequest,
	VoiceSubmitUtteranceRequest,
	VoiceSynthesizeRequest,
	VoiceTestASRRequest,
	VoiceTestTTSRequest,
	VoiceGetStateResponse,
	VoiceSubmitUtteranceResponse,
	VoiceSynthesizeResponse,
	VoiceTTSModel,
	VoiceTTSModelsResponse,
	MusicEvent,
	MusicGetStateResponse,
	MusicSetupRequest,
	MusicSetupResponse,
	MusicNowPlaying,
	MusicCommand,
	MusicCommandRequest,
	MusicCommandResponse,
	MusicRadioState,
	MusicListProvidersResponse,
	MusicGetProgrammeResponse,
	MusicOpenRadioRequest,
	MusicSearchRequest,
	MusicSearchResponse,
	MusicSearchRecordDTO,
	MusicRequestSongRequest,
	MusicRequestSongResponse,
	MusicProgrammeActionRequest,
	MusicProgrammeEntryDTO,
	MusicProviderDescriptorDTO,
	MusicSetProviderRequest,
	MusicBaseResponse,
	MusicLyricLine,
	MusicLyrics,
	MusicDjSpeak,
	MusicRuntimeState,
	MusicPlayerBackend,
	MusicRadioSource,
	MusicEnvStatus,
	MusicSettings,
	MessageAttachment,
	AttachmentMediaType,
	MediaKind,
	MediaSource,
	MediaAsset,
	MediaAssetLink,
	MediaAssetMetadata,
	MediaQuery,
	MediaUsageTag,
	MediaGalleryResponse,
	MediaRebuildResponse,
	MarkdownResolveAssetRequest,
	MarkdownResolveAssetResponse,
	MarkdownSaveAttachmentsRequest,
	MarkdownSaveAttachmentsResponse,
	ToolDefinition,
	ToolParameter,
	ToolCall,
	DiffHunk,
	DiffHunkLine,
	ToolResult,
	ToolPartialResult,
	ToolRenderKind,
	PermissionMode,
	ToolSettings,
	BashToolSettings,
	ContentPart,
	Step,
	StepType,
	// UIMessage types (AI SDK 6.x compatible)
	UIMessage,
	UIMessagePart,
	TextUIPart,
	ReasoningUIPart,
	ToolUIPart,
	ToolUIState,
	FileUIPart,
	StepUIPart,
	ErrorUIPart,
	MessageMetadata,
	UIMessageChunk,
	UIMessageStreamData,
	// MCP types
	MCPServerConfig,
	MCPServerState,
	MCPToolInfo,
	MCPResourceInfo,
	MCPPromptInfo,
	MCPSettings,
	ACPAgentConfig,
	ACPAgentState,
	ACPSettings,
	ACPGetAgentsResponse,
	ACPAddAgentResponse,
	ACPUpdateAgentResponse,
	ACPRemoveAgentResponse,
	ACPConnectAgentResponse,
	ACPDisconnectAgentResponse,
	ACPRefreshAgentResponse,
	ACPCancelSessionResponse,
	// Skills types (Official Claude Code Skills)
	SkillDefinition,
	SkillFile,
	SkillSource,
	SkillSettings,
	SkillDirectoryConfig,
	PluginCommandInfo,
	GetPluginCommandsResponse,
	ExecutePluginCommandResponse,
	MemoryAppendRequest,
	MemoryAppendResponse,
	MemoryCaptureDecisionRequest,
	MemoryCaptureDecisionResponse,
	MemoryOverviewResponse,
	MemoryLogsCleanupResponse,
	MemoryLogsListRequest,
	MemoryLogsListResponse,
	MemoryLogsStatsResponse,
	MemoryReadRequest,
	MemoryReadResponse,
	MemorySaveFileRequest,
	MemorySaveFileResponse,
	AbortPluginRequestResult,
	PluginNotificationPayload,
	PluginRequestPayload,
	PluginRequestProgressPayload,
	PluginRequestResult,
	SchedulerSchedule,
	SchedulerRunDetailDTO,
	SchedulerTaskSnapshotDTO,
	SchedulerGetRequest,
	SchedulerGetResponse,
	SchedulerCreateTaskRequest,
	SchedulerUpdateTaskRequest,
	SchedulerDeleteTaskRequest,
	SchedulerWriteTaskResponse,
	SchedulerDeleteTaskResponse,
	SchedulerListRunsRequest,
	SchedulerListRunsResponse,
	SchedulerGetRunRequest,
	SchedulerGetRunResponse,
	SchedulerListResponse,
	SchedulerRunNowRequest,
	SchedulerRunNowResponse,
	SchedulerSetEnabledRequest,
	SchedulerSetEnabledResponse,
	// Permission types
	PermissionInfo,
	PermissionResponse,
	// Interaction types (agent 提问 → 用户应答)
	InteractionAnswer,
	InteractionGetPendingResponse,
	InteractionOption,
	InteractionOrigin,
	InteractionOutcome,
	InteractionQuestion,
	InteractionQuestionAnswer,
	InteractionRequest,
	InteractionRespondRequest,
	InteractionRespondResponse,
	// Theme types
	ThemeMeta,
	Theme,
	TodoPlanChangedPayload,
	TodoPlanCreateRequest,
	TodoPlanCreateResponse,
	TodoPlanDocument,
	TodoPlanGetRequest,
	TodoPlanGetResponse,
	TodoPlanRenameRequest,
	TodoPlanRenameResponse,
	TodoPlanDeleteRequest,
	TodoPlanDeleteResponse,
	TodoPlanSnapshot,
	TodoPlanUpdateResponse,
	TodoPlanUpdateRequest,
};

// Gallery image type for image preview window
export interface GalleryImage {
	id: string;
	src: string; // Full image URL or data URL
	alt?: string; // Image description/title
	thumbnail?: string; // Optional thumbnail URL
}

// Terminal (real PTY) — renderer mirror of packages/shared/ipc/terminal.ts
export interface TerminalInfo {
	id: string;
	title: string;
	cwd: string;
	shell: string;
	cols: number;
	rows: number;
	createdAt: number;
	exited?: { code: number | null };
}

export interface TerminalAttachResult {
	success: boolean;
	info?: TerminalInfo;
	chunks?: Array<{ seq: number; data: string }>;
	lastSeq?: number;
	/** Ring buffer wrapped: write a full reset (\x1bc) before replaying. */
	truncated?: boolean;
	/** Flow-control generation; every ack must carry it. */
	generation?: number;
	error?: string;
}

// Browser (embedded WebContentsView) — renderer mirror of packages/shared/ipc/browser.ts
export interface BrowserTabInfo {
	id: string;
	url: string;
	title: string;
	favicon?: string;
	loading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	crashed?: boolean;
}

export interface BrowserTabsChangedEvent {
	patch: Array<Partial<BrowserTabInfo> & { id: string }>;
	removed?: string[];
	activeTabId?: string | null;
	order?: string[];
}

/** A web element captured in pick mode → structured composer attachment. */
export interface PickedWebElement {
	image: string;
	sourceUrl: string;
	sourceTitle: string;
	excerpt: string;
	clipped: boolean;
}

export interface BrowserPickResponse {
	success: boolean;
	/** Null when the user cancelled — a normal outcome, not an error. */
	element?: PickedWebElement | null;
	error?: string;
}

/** A browser profile — an isolated persistent partition (Chrome-style login). */
export interface BrowserProfile {
	id: string;
	name: string;
}

export interface BrowserProfilesResponse {
	success: boolean;
	profiles: BrowserProfile[];
	activeProfileId: string;
	error?: string;
}

/** Persisted omnibox search-engine selection (table lives in @shared/ipc browser.ts). */
export interface BrowserSearchEngineResponse {
	success: boolean;
	engineId: string;
	error?: string;
}

export interface ElectronAPI {
	/**
	 * Resolve the on-disk path of a dropped/picked File. Returns "" when the
	 * file has no local path (pasted content, web platform).
	 */
	getPathForFile: (file: File) => string;
	onSkillActivated: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			skillName: string;
		}) => void,
	) => () => void;
	onStepAdded: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			step: any;
		}) => void,
	) => () => void;
	onStepUpdated: (
		callback: (data: {
			sessionId: string;
			messageId: string;
			stepId: string;
			updates: any;
		}) => void,
	) => () => void;
	onImageGenerated: (
		callback: (data: {
			id: string;
			url?: string;
			base64?: string;
			prompt: string;
			revisedPrompt?: string;
			model: string;
			sessionId: string;
			messageId: string;
			createdAt: number;
		}) => void,
	) => () => void;
	getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>;
	generateTitle: (message: string) => Promise<GenerateTitleResponse>;
	getSystemPromptSnapshot: (
		sessionId: string,
	) => Promise<GetSystemPromptSnapshotResponse>;
	getSessions: () => Promise<GetSessionsResponse>;
	createSession: (
		name: string,
		options?: CreateSessionOptions,
	) => Promise<CreateSessionResponse>;
	getCollabBoard: (
		roomSessionId: string,
	) => Promise<import("@shared/ipc.js").CollabBoardGetResponse>;
	/** User board mutation (W16): the action rides to the reducer untouched. */
	actCollabBoard: (
		roomSessionId: string,
		action: import("@shared/ipc.js").CollabBoardAction,
	) => Promise<import("@shared/ipc.js").CollabBoardActResponse>;
	/** 停止一张卡正在跑的执行(collab-team-v2 §5.1 入口②)。 */
	stopCollabTask: (
		roomSessionId: string,
		taskId: string,
	) => Promise<import("@shared/ipc.js").CollabTaskStopResponse>;
	setCollabRoomFrozen: (
		roomSessionId: string,
		frozen: boolean,
	) => Promise<import("@shared/ipc.js").CollabRoomFrozenResponse>;
	setCollabRoomBudgets: (
		roomSessionId: string,
		budgets: import("@shared/ipc.js").CollabRoomBudgetsPatch,
	) => Promise<import("@shared/ipc.js").CollabRoomBudgetsResponse>;
	/** Room spend today (W13.5): read-only, one shot when the panel opens. */
	getCollabRoomSpend: (
		roomSessionId: string,
	) => Promise<import("@shared/ipc.js").CollabRoomSpendResponse>;
	/**
	 * 人级停止(E5):点名收回某一张在外的牌 —— 三级停止的第三级。
	 *
	 * `expectedEpoch` 是乐观并发的前置条件(仿看板的 `expectedRev`):界面看见这张
	 * 牌时房间是第几代,取自协调器快照的 `floorEpoch`。对不上就拒绝并回报当前代数。
	 */
	revokeCollabRoomLease: (
		roomSessionId: string,
		leaseId: string,
		expectedEpoch: number,
	) => Promise<import("@shared/ipc.js").CollabRoomRevokeLeaseResponse>;
	/** 协调器状态条的冷启动读取;实时更新走 'collab:coordinator-changed' 会话事件。 */
	getCollabCoordinator: (
		roomSessionId: string,
	) => Promise<import("@shared/ipc.js").CollabCoordinatorGetResponse>;
	/**
	 * Agent 活动快照的冷启动补水(D8 观测体系 §3.1);实时更新走
	 * 'collab:agent-changed' 会话事件。`agentIds` 缺席 = 此刻开着心智循环的全部。
	 * desktop-only。
	 */
	getCollabAgentActivity: (
		agentIds?: string[],
	) => Promise<import("@shared/ipc.js").CollabAgentActivityGetResponse>;
	/**
	 * 调度时间轴的尾读(D8 观测体系 §3.3)——「刚才为什么是那样」的读口。
	 * **只读**,新在前;读的是账文件,不经运行时。desktop-only。
	 */
	getCollabSchedulerLog: (
		roomSessionId: string,
		options?: { limit?: number; types?: string[] },
	) => Promise<import("@shared/ipc.js").CollabSchedulerLogTailResponse>;
	/** Team settings (W6): only provided fields change; pmAgentId null clears. */
	updateCollabRoom: (
		roomSessionId: string,
		update: import("@shared/ipc.js").CollabRoomUpdatePatch,
	) => Promise<import("@shared/ipc.js").CollabRoomUpdateResponse>;
	/** 清空这间房的对话记忆(含每位成员的执行会话与已读游标、看板卡片)。不可恢复。
	 *  includeMemberDms 连带成员两两之间的私聊房(跨群共享,须显式勾选)。 */
	clearCollabRoomHistory: (
		roomSessionId: string,
		includeMemberDms?: boolean,
	) => Promise<import("@shared/ipc.js").CollabRoomClearHistoryResponse>;
	/**
	 * 群 folder 的只读列目录(agent-im-chat-ui.md §3.2「文件」块)。folder 的位置
	 * 只有主进程算得出,所以按房间 id 问。desktop-only。
	 */
	listCollabRoomFolder: (
		roomSessionId: string,
	) => Promise<import("@shared/ipc.js").CollabRoomFolderListResponse>;
	/**
	 * 托管私聊房的 get-or-create(agent-im-dm.md D1)。幂等——同一个 agent 永远同一
	 * 间房,所以"打开"与"创建"是同一个调用。失败 = 这个 agent 不该有私聊
	 * (退休 / service / 查无此人)。desktop-only。
	 */
	ensureCollabDmRoom: (
		agentId: string,
	) => Promise<import("@shared/ipc.js").CollabDmRoomEnsureResponse>;
	/** IM emoji reaction (W8): toggle semantics, palette-validated in the app layer. */
	reactToCollabMessage: (
		roomSessionId: string,
		messageId: string,
		emoji: string,
		actor: import("@shared/ipc.js").ChatMessageReactionActor,
	) => Promise<import("@shared/ipc.js").CollabMessageReactResponse>;
	switchSession: (sessionId: string) => Promise<SwitchSessionResponse>;
	getSession: (sessionId: string) => Promise<SwitchSessionResponse>;
	deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>;
	renameSession: (
		sessionId: string,
		newName: string,
	) => Promise<RenameSessionResponse>;
	createBranch: (
		parentSessionId: string,
		branchFromMessageId: string,
	) => Promise<CreateBranchResponse>;
	updateSessionPin: (
		sessionId: string,
		isPinned: boolean,
	) => Promise<UpdateSessionPinResponse>;
	updateSessionModel: (
		sessionId: string,
		provider: string,
		model: string,
	) => Promise<{ success: boolean; error?: string }>;
	updateSessionAgent: (
		sessionId: string,
		agentId: string,
	) => Promise<{ success: boolean; error?: string }>;
	updateSessionPermissionMode: (
		sessionId: string,
		permissionMode: PermissionMode,
	) => Promise<{ success: boolean; error?: string }>;
	updateSessionArchived: (
		sessionId: string,
		isArchived: boolean,
		archivedAt?: number | null,
	) => Promise<{ success: boolean; error?: string }>;
	updateSessionWorkingDirectory: (
		sessionId: string,
		workingDirectory: string | null,
	) => Promise<{ success: boolean; error?: string }>;
	listPermissionGrants: (options: {
		sessionId?: string;
		workspaceRoot?: string;
		userId?: string;
		workspaceId?: string;
	}) => Promise<{
		success: boolean;
		error?: string;
		sessionGrants?: any[];
		workspaceGrants?: any[];
	}>;
	revokePermissionGrant: (
		id: string,
	) => Promise<{ success: boolean; error?: string }>;
	clearSessionPermissionGrants: (
		sessionId: string,
	) => Promise<{ success: boolean; error?: string }>;
	clearWorkspacePermissionGrants: (
		workspaceRoot: string,
	) => Promise<{ success: boolean; error?: string }>;
	// Evals (prompt evaluation) — 👎 downvote + Review + Run + Actions
	recordEvalsDownvote: (request: {
		sessionId: string;
		turnId: string;
		userMessage: string;
		note?: string;
	}) => Promise<{
		success: boolean;
		fixturePath?: string;
		incidentId?: string;
		error?: string;
	}>;

	// Phase 1: Review
	evalsListRecords: (request: {
		negativeOnly?: boolean;
		category?: string;
		sinceTs?: string;
		limit?: number;
		offset?: number;
	}) => Promise<{
		success: boolean;
		records?: Array<Record<string, unknown>>;
		total?: number;
		error?: string;
	}>;
	evalsListFixtures: () => Promise<{
		success: boolean;
		fixtures?: Array<{
			path: string;
			capturedAt: string;
			provider: string;
			model: string;
			sessionId: string;
			turnId: string;
			userMessagePreview: string;
			hasNegative: boolean;
		}>;
		error?: string;
	}>;
	evalsReadFixture: (request: { fixturePath: string }) => Promise<{
		success: boolean;
		fixture?: Record<string, unknown>;
		error?: string;
	}>;
	evalsListResults: () => Promise<{
		success: boolean;
		entries?: Array<{
			ts: string;
			promptVersion: string;
			provider: string;
			runs: number;
			evalSetSize: number;
			scores: Record<string, number>;
			mean: number;
			disabled?: string[];
			cost?: string;
			sentinelScores?: Record<string, number>;
		}>;
		error?: string;
	}>;
	evalsListCases: () => Promise<{
		success: boolean;
		cases?: Array<{
			id: string;
			file: string;
			dir: string;
			description: string;
			fixture: string;
			userMessage: string;
			isSentinel: boolean;
			expect: Record<string, unknown>;
		}>;
		error?: string;
	}>;
	evalsGetCase: (request: { caseId: string }) => Promise<{
		success: boolean;
		case_?: Record<string, unknown>;
		error?: string;
	}>;

	// Phase 2: Run
	evalsRunStart: (request: {
		caseIds?: string[];
		runs: number;
		disabledSections?: string[];
		providerId: string;
		model: string;
	}) => Promise<{ success: boolean; error?: string }>;
	evalsRunCancel: () => Promise<{ success: boolean; error?: string }>;
	onEvalsRunProgress: (
		callback: (event: Record<string, unknown>) => void,
	) => () => void;

	// Phase 3: Actions
	evalsPromoteFixture: (request: {
		fixturePath: string;
		caseId: string;
		description: string;
		expect: { firstToolCall?: string; contains?: string; notContains?: string };
	}) => Promise<{ success: boolean; casePath?: string; error?: string }>;
	evalsRetireCase: (request: {
		caseId: string;
	}) => Promise<{ success: boolean; newPath?: string; error?: string }>;
	evalsGenerateTriage: (request?: { weeks?: number }) => Promise<{
		success: boolean;
		report?: string;
		triagePath?: string;
		error?: string;
	}>;
	evalsReadRunDetail: (request: { detailPath: string }) => Promise<{
		success: boolean;
		detail?: Record<string, unknown>;
		error?: string;
	}>;
	// Evals Workbench (incident-centric)
	evalsIncidentList: () => Promise<{
		success: boolean;
		incidents?: Array<Record<string, unknown>>;
		error?: string;
	}>;
	evalsIncidentGet: (request: { incidentId: string }) => Promise<{
		success: boolean;
		incident?: Record<string, unknown>;
		markdown?: string;
		runs?: Array<Record<string, unknown>>;
		error?: string;
	}>;
	evalsIncidentUpdate: (request: {
		incidentId: string;
		patch: { status?: string; note?: string; rubric?: string; title?: string };
	}) => Promise<{
		success: boolean;
		incident?: Record<string, unknown>;
		error?: string;
	}>;
	evalsIncidentReadFile: (request: {
		incidentId: string;
		relativePath: string;
	}) => Promise<{ success: boolean; content?: string; error?: string }>;
	evalsReplayStart: (request: {
		incidentId: string;
		runs?: number;
		disabledSections?: string[];
		judge?: boolean;
		useCapturedPrompt?: boolean;
		providerId?: string;
		model?: string;
	}) => Promise<{ success: boolean; runId?: string; error?: string }>;
	evalsReplayCancel: (request: {
		incidentId: string;
	}) => Promise<{ success: boolean; error?: string }>;
	onEvalsReplayProgress: (
		callback: (event: Record<string, unknown>) => void,
	) => () => void;
	evalsIncidentAnalyze: (request: { incidentId: string }) => Promise<{
		success: boolean;
		incident?: Record<string, unknown>;
		error?: string;
	}>;
	evalsIncidentPromote: (request: {
		incidentId: string;
		caseId: string;
		description?: string;
	}) => Promise<{ success: boolean; casePath?: string; error?: string }>;
	evalsDiagnoseStart: (request: {
		incidentId: string;
		quick?: boolean;
	}) => Promise<{ success: boolean; error?: string }>;
	onEvalsDiagnoseProgress: (
		callback: (event: Record<string, unknown>) => void,
	) => () => void;
	evalsRoundList: (request: { incidentId: string }) => Promise<{
		success: boolean;
		rounds?: Array<Record<string, unknown>>;
		error?: string;
	}>;
	evalsRoundReplay: (request: {
		incidentId: string;
		round: number;
		runs?: number;
		editedMessages?: unknown[];
		providerId?: string;
		model?: string;
	}) => Promise<{
		success: boolean;
		attempts?: Array<{
			content: string;
			toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
			finishReason: string;
		}>;
		edited?: boolean;
		error?: string;
	}>;
	// Variables subsystem (scalar variables)
	listVariables: (sessionId: string) => Promise<VariablesListResponse>;
	setVariable: (
		sessionId: string,
		name: string,
		value: string,
		description?: string,
		scope?: "global" | "session" | "agent" | "project",
	) => Promise<VariablesSetResponse>;
	deleteVariable: (
		sessionId: string,
		name: string,
	) => Promise<VariablesDeleteResponse>;
	// Session goals
	goalGet: (sessionId: string) => Promise<GoalGetResponse>;
	goalSet: (request: GoalSetRequest) => Promise<GoalSetResponse>;
	goalDiffs: (sessionId: string) => Promise<GoalDiffsResponse>;
	// Token usage / billing
	getUsageSummary: (request: GetUsageSummaryRequest) => Promise<GetUsageSummaryResponse>;
	getSessionUsage: (request: GetSessionUsageRequest) => Promise<GetSessionUsageResponse>;
	// Practice (kegel / pomodoro / exercise log)
	practiceStart: (request: PracticeStartRequest) => Promise<PracticeStateResponse>;
	practicePause: () => Promise<PracticeStateResponse>;
	practiceResume: () => Promise<PracticeStateResponse>;
	practiceStop: (request?: PracticeStopRequest) => Promise<PracticeStateResponse>;
	practiceGetState: () => Promise<PracticeStateResponse>;
	practiceLog: (request: PracticeLogRequest) => Promise<PracticeLogResponse>;
	practiceSummary: (request: PracticeSummaryRequest) => Promise<PracticeSummaryResult>;
	practiceRecent: (request: PracticeRecentRequest) => Promise<PracticeRecentResponse>;
	practiceGetConfig: () => Promise<PracticeConfigResponse>;
	practiceSetConfig: (request: PracticeSetConfigRequest) => Promise<PracticeConfigResponse>;
	onPracticeEvent: (callback: (payload: PracticeEventPayload) => void) => () => void;

	/**
	 * 统一插件请求通道(R2)。payload / result 必须 JSON-可序列化。
	 * server 端按方案 A 返回 501:插件只在 Electron 桌面宿主执行。
	 */
	pluginRequest: (request: PluginRequestPayload) => Promise<PluginRequestResult>;

	abortPluginRequest: (requestId: string) => Promise<AbortPluginRequestResult>;

	onPluginRequestProgress: (
		callback: (payload: PluginRequestProgressPayload) => void,
	) => () => void;

	/**
	 * 插件通知(api.ui.notify + 熔断自动禁用告警)。
	 * 仅 Electron 桌面宿主真会推 —— 插件只在桌面执行(设计文档 §6 方案 A)。
	 */
	onPluginNotification: (
		callback: (payload: PluginNotificationPayload) => void,
	) => () => void;
	// Project directories — independent module
	projectDirsList: () => Promise<ProjectDirsListResponse>;
	projectDirsGet: (path: string) => Promise<ProjectDirsGetResponse>;
	projectDirsAdd: (
		path: string,
		description?: string,
	) => Promise<ProjectDirsAddResponse>;
	projectDirsUpdate: (
		path: string,
		description: string,
	) => Promise<ProjectDirsUpdateResponse>;
	projectDirsRemove: (path: string) => Promise<ProjectDirsRemoveResponse>;
	getSessionTokenUsage: (sessionId: string) => Promise<{
		success: boolean;
		usage?: {
			totalInputTokens: number;
			totalOutputTokens: number;
			totalTokens: number;
			maxTokens: number;
			lastInputTokens: number;
			contextSize: number;
		};
		error?: string;
	}>;
	// Optimized session loading (Phase 4: Metadata Separation)
	getSessionsList: () => Promise<GetSessionsListResponse>;
	activateSession: (sessionId: string) => Promise<ActivateSessionResponse>;
	getSessionMessages: (
		sessionId: string,
	) => Promise<GetSessionMessagesResponse>;
	getSessionMessagesPage: (
		request: GetSessionMessagesPageRequest,
	) => Promise<GetSessionMessagesPageResponse>;
	getSessionUserMarkers: (
		sessionId: string,
	) => Promise<GetSessionUserMarkersResponse>;
	getSessionSegments: (
		sessionId: string,
	) => Promise<{ success: boolean; segments: SessionSegment[] }>;
	onSessionMessagesChanged: (
		callback: (data: {
			sessionId: string;
			action: "added" | "updated" | "deleted";
			messageId?: string;
		}) => void,
	) => () => void;
	getSessionCacheStats: () => Promise<{
		size: number;
		maxSize: number;
		cachedSessionIds: string[];
	}>;
	evictSessionCache: (sessionId: string) => Promise<{ success: boolean }>;
	// System message methods (for /files command persistence)
	addSystemMessage: (
		sessionId: string,
		message: { id: string; role: string; content: string; timestamp: number },
	) => Promise<{ success: boolean; error?: string }>;
	removeFilesChangedMessage: (
		sessionId: string,
	) => Promise<{ success: boolean; removedId?: string | null; error?: string }>;
	removeGitStatusMessage: (
		sessionId: string,
	) => Promise<{ success: boolean; removedId?: string | null; error?: string }>;
	// Generic remove message by ID (for close button functionality)
	removeMessage: (
		sessionId: string,
		messageId: string,
	) => Promise<{ success: boolean; error?: string }>;
	onContextSizeUpdated: (
		callback: (data: { sessionId: string; contextSize: number }) => void,
	) => () => void;
	onContextCompactStarted: (
		callback: (data: { sessionId: string }) => void,
	) => () => void;
	onContextCompactCompleted: (
		callback: (data: {
			sessionId: string;
			success: boolean;
			error?: string;
		}) => void,
	) => () => void;
	updateSessionMaxTokens: (
		sessionId: string,
		maxTokens: number,
	) => Promise<{ success: boolean; error?: string }>;
	getSettings: () => Promise<GetSettingsResponse>;
	saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>;
	openSettingsWindow: (options?: { tab?: string }) => Promise<{ success: boolean }>;
	onSettingsNavigate: (callback: (payload: { tab: string }) => void) => () => void;
	onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
	gatewayGetStatus: () => Promise<GatewayGetStatusResponse>;
	gatewayStart: (
		request?: GatewayStartRequest,
	) => Promise<GatewayStartResponse>;
	gatewayStop: () => Promise<GatewayStopResponse>;
	gatewayWechatLogout: (
		request?: GatewayWechatLogoutRequest,
	) => Promise<GatewayWechatLogoutResponse>;
	gatewayWechatAddAccount: (
		request?: GatewayWechatAddAccountRequest,
	) => Promise<GatewayWechatAddAccountResponse>;
	gatewayWechatStopAccount: (
		request: GatewayWechatStopAccountRequest,
	) => Promise<GatewayWechatStopAccountResponse>;
	gatewayWechatRemoveAccount: (
		request: GatewayWechatRemoveAccountRequest,
	) => Promise<GatewayWechatRemoveAccountResponse>;
	gatewayWechatRenameAccount: (
		request: GatewayWechatRenameAccountRequest,
	) => Promise<GatewayWechatRenameAccountResponse>;
	channelIdentityListLinks: (
		request?: ChannelIdentityListLinksRequest,
	) => Promise<ChannelIdentityListLinksResponse>;
	channelIdentityListProfiles: () => Promise<ChannelIdentityListProfilesResponse>;
	channelIdentityCreateProfile: (
		request: ChannelIdentityCreateProfileRequest,
	) => Promise<ChannelIdentityCreateProfileResponse>;
	channelIdentityUpdateProfile: (
		request: ChannelIdentityUpdateProfileRequest,
	) => Promise<ChannelIdentityUpdateProfileResponse>;
	channelIdentityCreateLink: (
		request: ChannelIdentityCreateLinkRequest,
	) => Promise<ChannelIdentityCreateLinkResponse>;
	channelIdentityDeleteLink: (
		id: string,
	) => Promise<ChannelIdentityDeleteLinkResponse>;
	channelIdentityResolve: (
		origin: MessageOrigin,
	) => Promise<ChannelIdentityResolveResponse>;
	channelDeliveryList: () => Promise<{
		success: boolean;
		deliveries?: ChannelReplyDeliveryRecord[];
		error?: string;
	}>;
	voiceGetState: () => Promise<VoiceGetStateResponse>;
	voiceStart: (
		request?: VoiceStartRequest,
	) => Promise<{ success: boolean; error?: string }>;
	voiceStop: (
		request?: VoiceStopRequest,
	) => Promise<{ success: boolean; error?: string }>;
	voiceSubmitUtterance: (
		request: VoiceSubmitUtteranceRequest,
	) => Promise<VoiceSubmitUtteranceResponse>;
	voiceSubmitTranscript: (
		request: VoiceSubmitTranscriptRequest,
	) => Promise<VoiceSubmitUtteranceResponse>;
	voiceSynthesize: (
		request: VoiceSynthesizeRequest,
	) => Promise<VoiceSynthesizeResponse>;
	voiceTestASR: (
		request: VoiceTestASRRequest,
	) => Promise<VoiceSubmitUtteranceResponse>;
	voiceTestTTS: (
		request: VoiceTestTTSRequest,
	) => Promise<{ success: boolean; error?: string; mimeType?: string }>;
	voiceGetTTSModels: (request?: {
		force?: boolean;
	}) => Promise<VoiceTTSModelsResponse>;
	onVoiceEvent: (callback: (event: VoiceEvent) => void) => () => void;
	voiceRuntimeReady: () => Promise<{ success: boolean }>;
	voiceRuntimeEvent: (event: VoiceEvent) => Promise<{ success: boolean }>;
	voiceAudioChunk: (payload: VoiceAudioChunkPayload) => void;
	onVoiceRuntimeCommand: (
		callback: (command: VoiceRuntimeCommand) => void,
	) => () => void;
	musicGetState: () => Promise<MusicGetStateResponse>;
	musicSetup: (request: MusicSetupRequest) => Promise<MusicSetupResponse>;
	onMusicEvent: (callback: (event: MusicEvent) => void) => () => void;
	musicCommand: (request: MusicCommandRequest) => Promise<MusicCommandResponse>;
	musicGetNowPlaying: () => Promise<MusicNowPlaying | null>;
	musicGetRadio: () => Promise<MusicRadioState>;
	musicOpenRadio: (request: MusicOpenRadioRequest) => Promise<MusicBaseResponse>;
	musicSearch: (request: MusicSearchRequest) => Promise<MusicSearchResponse>;
	musicRequestSong: (request: MusicRequestSongRequest) => Promise<MusicRequestSongResponse>;
	musicGetProgramme: () => Promise<MusicGetProgrammeResponse>;
	musicProgrammeAction: (request: MusicProgrammeActionRequest) => Promise<MusicBaseResponse>;
	musicListProviders: () => Promise<MusicListProvidersResponse>;
	musicSetProvider: (request: MusicSetProviderRequest) => Promise<MusicBaseResponse>;
	musicGetLyrics: () => Promise<MusicLyrics | null>;
	onMusicLyrics: (
		callback: (lyrics: MusicLyrics) => void,
	) => () => void;
	onMusicNowPlaying: (
		callback: (nowPlaying: MusicNowPlaying | null) => void,
	) => () => void;
	onMusicDjSpeak: (callback: (speak: MusicDjSpeak) => void) => () => void;
	musicDjSpeakDone: (id: string) => Promise<void>;
	getSystemTheme: () => Promise<{ success: boolean; theme?: "light" | "dark" }>;
	testProxy: (
		proxy: ProxySettings,
	) => Promise<{ success: boolean; error?: string; status?: number }>;
	onSystemThemeChanged: (
		callback: (theme: "light" | "dark") => void,
	) => () => void;
	// Agent methods
	listAgents: () => Promise<AgentsListResponse>;
	createAgent: (
		name: string,
		systemPrompt?: string,
	) => Promise<AgentCreateResponse>;
	updateAgent: (
		agentId: string,
		updates: Omit<AgentUpdateRequest, "agentId">,
	) => Promise<AgentUpdateResponse>;
	/** 「删除」= 退休或硬删(域模型 §3.2);看响应的 outcome 分文案。 */
	deleteAgent: (agentId: string) => Promise<AgentDeleteResponse>;
	/** 重新入职(域模型 §8):只有 Agents 管理页调它。 */
	restoreAgent: (agentId: string) => Promise<AgentRestoreResponse>;
	// User prompt methods
	listPrompts: () => Promise<PromptListResponse>;
	getPrompt: (request: { id: string }) => Promise<PromptGetResponse>;
	createPrompt: (request: PromptCreateRequest) => Promise<PromptCreateResponse>;
	updatePrompt: (request: PromptUpdateRequest) => Promise<PromptUpdateResponse>;
	deletePrompt: (request: PromptDeleteRequest) => Promise<PromptDeleteResponse>;
	// Theme methods
	getThemes: () => Promise<GetThemesResponse>;
	getTheme: (themeId: string) => Promise<GetThemeResponse>;
	applyTheme: (
		themeId: string,
		mode: "dark" | "light",
	) => Promise<ApplyThemeResponse>;
	refreshThemes: (projectPath?: string) => Promise<RefreshThemesResponse>;
	openThemesFolder: () => Promise<{ success: boolean; error?: string }>;
	getProviders: () => Promise<GetProvidersResponse>;
	getProviderUsage: (providerId: string) => Promise<ProviderUsageResponse>;
	getProviderEnvStatus: (
		providerId: string,
	) => Promise<GetProviderEnvStatusResponse>;
	// New OpenRouter-based model API
	getModelsWithCapabilities: (
		providerId: string,
		options?: { forceRefresh?: boolean },
	) => Promise<{
		success: boolean;
		models?: OpenRouterModel[];
		error?: string;
	}>;
	getAllModels: () => Promise<{
		success: boolean;
		models?: OpenRouterModel[];
		error?: string;
	}>;
	searchModels: (
		query: string,
		providerId?: string,
	) => Promise<{
		success: boolean;
		models?: OpenRouterModel[];
		error?: string;
	}>;
	refreshModelRegistry: () => Promise<{ success: boolean; error?: string }>;
	getModelNameAliases: () => Promise<{
		success: boolean;
		aliases?: Record<string, string>;
		error?: string;
	}>;
	getModelDisplayName: (
		modelId: string,
	) => Promise<{ success: boolean; displayName?: string; error?: string }>;
	// Tools methods
	getTools: () => Promise<GetToolsResponse>;
	executeTool: (
		toolId: string,
		args: Record<string, any>,
		messageId: string,
		sessionId: string,
	) => Promise<ExecuteToolResponse>;
	cancelTool: (toolCallId: string) => Promise<{ success: boolean }>;
	listBackgroundJobs: (options?: { includeInactive?: boolean }) => Promise<{
		success: boolean;
		jobs?: Array<Record<string, any>>;
		error?: string;
	}>;
	stopBackgroundJob: (
		jobId: string,
	) => Promise<{ success: boolean; error?: string }>;
	updateToolCall: (
		sessionId: string,
		messageId: string,
		toolCallId: string,
		updates: Partial<ToolCall>,
	) => Promise<{ success: boolean }>;
	abortStream: (sessionId?: string) => Promise<{ success: boolean }>;
	getActiveStreams: () => Promise<{ success: boolean; streams?: string[] }>;
	resumeAfterToolConfirm: (
		sessionId: string,
		messageId: string,
	) => Promise<{ success: boolean; error?: string }>;

	// Permission methods
	clearSessionPermissions: (
		sessionId: string,
	) => Promise<{ success: boolean; error?: string }>;
	getPendingPermissions: (sessionId: string) => Promise<{
		success: boolean;
		pending?: PermissionInfo[];
		error?: string;
	}>;

	// Interaction methods (agent 提问 → 用户应答). 提问事件走 session:event 通道
	// ('interaction:requested' / 'interaction:settled'),这两条只管补水和写回。
	getPendingInteractions: (
		sessionId: string,
	) => Promise<InteractionGetPendingResponse>;
	respondInteraction: (
		request: InteractionRespondRequest,
	) => Promise<InteractionRespondResponse>;

	// MCP methods
	mcpGetServers: () => Promise<MCPGetServersResponse>;
	mcpAddServer: (config: MCPServerConfig) => Promise<MCPAddServerResponse>;
	mcpUpdateServer: (
		config: MCPServerConfig,
	) => Promise<MCPUpdateServerResponse>;
	mcpRemoveServer: (serverId: string) => Promise<MCPRemoveServerResponse>;
	mcpConnectServer: (serverId: string) => Promise<MCPConnectServerResponse>;
	mcpDisconnectServer: (
		serverId: string,
	) => Promise<MCPDisconnectServerResponse>;
	mcpRefreshServer: (serverId: string) => Promise<MCPRefreshServerResponse>;
	mcpGetTools: () => Promise<MCPGetToolsResponse>;
	mcpCallTool: (
		serverId: string,
		toolName: string,
		args: Record<string, any>,
	) => Promise<MCPCallToolResponse>;
	mcpGetResources: () => Promise<MCPGetResourcesResponse>;
	mcpReadResource: (
		serverId: string,
		uri: string,
	) => Promise<MCPReadResourceResponse>;
	mcpGetPrompts: () => Promise<MCPGetPromptsResponse>;
	mcpGetPrompt: (
		serverId: string,
		name: string,
		args?: Record<string, string>,
	) => Promise<MCPGetPromptResponse>;
	mcpReadConfigFile: (filePath: string) => Promise<MCPReadConfigFileResponse>;

	// ACP methods
	acpGetAgents: () => Promise<ACPGetAgentsResponse>;
	acpAddAgent: (config: ACPAgentConfig) => Promise<ACPAddAgentResponse>;
	acpUpdateAgent: (config: ACPAgentConfig) => Promise<ACPUpdateAgentResponse>;
	acpRemoveAgent: (agentId: string) => Promise<ACPRemoveAgentResponse>;
	acpConnectAgent: (agentId: string) => Promise<ACPConnectAgentResponse>;
	acpDisconnectAgent: (agentId: string) => Promise<ACPDisconnectAgentResponse>;
	acpRefreshAgent: (agentId: string) => Promise<ACPRefreshAgentResponse>;
	acpCancelSession: (
		sessionId: string,
		agentId?: string,
	) => Promise<ACPCancelSessionResponse>;

	// Skills methods (Official Claude Code Skills)
	getSkills: (workingDirectory?: string) => Promise<GetSkillsResponse>;
	refreshSkills: () => Promise<RefreshSkillsResponse>;
	readSkillFile: (
		skillId: string,
		fileName: string,
	) => Promise<ReadSkillFileResponse>;
	openSkillDirectory: (skillId?: string) => Promise<OpenSkillDirectoryResponse>;
	createSkill: (
		name: string,
		description: string,
		instructions: string,
		source: SkillSource,
	) => Promise<CreateSkillResponse>;
	deleteSkill: (
		skillId: string,
	) => Promise<{ success: boolean; error?: string }>;
	toggleSkillEnabled: (
		skillId: string,
		enabled: boolean,
	) => Promise<{ success: boolean; error?: string }>;
	listSkillDirectories: () => Promise<ListSkillDirectoriesResponse>;
	addSkillDirectory: (request: AddSkillDirectoryRequest) =>
		Promise<AddSkillDirectoryResponse>;
	updateSkillDirectory: (request: UpdateSkillDirectoryRequest) =>
		Promise<UpdateSkillDirectoryResponse>;
	removeSkillDirectory: (id: string) => Promise<RemoveSkillDirectoryResponse>;
	setSkillAgent: (
		skillId: string,
		agentId: string | null,
	) => Promise<SetSkillAgentResponse>;

	// Message update methods
	updateMessageThinkingTime: (
		sessionId: string,
		messageId: string,
		thinkingTime: number,
	) => Promise<{ success: boolean }>;

	// Dialog methods
	showOpenDialog: (options: {
		properties?: Array<"openFile" | "openDirectory" | "multiSelections">;
		title?: string;
		defaultPath?: string;
		filters?: Array<{ name: string; extensions: string[] }>;
	}) => Promise<{ canceled: boolean; filePaths: string[] }>;

	// Shell methods
	openPath: (filePath: string) => Promise<string>;
	openExternal: (url: string) => Promise<{ success: boolean }>;
	getDataPath: () => Promise<string>;

	// Clipboard methods
	writeClipboardText: (
		text: string,
	) =>
		| Promise<{ success: boolean; error?: string }>
		| { success: boolean; error?: string };

	// Media methods
	saveImage: (data: {
		url?: string;
		base64?: string;
		prompt: string;
		revisedPrompt?: string;
		model: string;
		sessionId: string;
		messageId: string;
		/** What the image is for, e.g. 'persona-avatar'. */
		usageTags?: MediaUsageTag[];
	}) => Promise<{
		id: string;
		type: "image";
		filePath: string;
		prompt: string;
		revisedPrompt?: string;
		model: string;
		createdAt: number;
		sessionId: string;
		messageId: string;
	}>;
	loadAllMedia: () => Promise<
		{
			id: string;
			type: "image";
			filePath: string;
			prompt: string;
			revisedPrompt?: string;
			model: string;
			createdAt: number;
			sessionId: string;
			messageId: string;
		}[]
	>;
	deleteMedia: (id: string) => Promise<boolean>;
	clearAllMedia: () => Promise<void>;
	readImageBase64: (filePath: string) => Promise<string>;
	listMediaAssets: (query?: MediaQuery) => Promise<MediaAsset[]>;
	hideMediaAsset: (id: string) => Promise<{ success: boolean }>;
	rebuildMediaLibrary: () => Promise<MediaRebuildResponse>;
	getMediaGallery: (
		assetId: string,
		query?: MediaQuery,
	) => Promise<MediaGalleryResponse>;

	// Image preview methods
	openImagePreview: (
		src: string,
		alt?: string,
	) => Promise<{ success: boolean }>;
	getImagePreview: (previewId: string) => Promise<{
		success: boolean;
		src?: string;
		alt?: string;
		error?: string;
	}>;
	openImageGallery: (mediaId: string) => Promise<{ success: boolean }>;
	onImagePreviewUpdate: (
		callback: (data: {
			mode?: "single";
			previewId?: string;
			src?: string;
			alt?: string;
		}) => void,
	) => () => void;

	// OAuth methods
	oauthStart: (providerId: string) => Promise<{
		success: boolean;
		error?: string;
		flowId?: string;
		flowKind?: "pkce-callback" | "manual-pkce" | "device-code";
		pollIntervalMs?: number;
		expiresAt?: number;
		statusMessage?: string;
		// For device flow (GitHub Copilot)
		userCode?: string;
		verificationUri?: string;
		// For manual code entry flow (Claude Code)
		requiresCodeEntry?: boolean;
		state?: string;
		instructions?: string;
	}>;
	oauthCallback: (
		providerId: string,
		code: string,
		state: string,
	) => Promise<{
		success: boolean;
		error?: string;
	}>;
	oauthLogout: (
		providerId: string,
	) => Promise<{ success: boolean; error?: string }>;
	oauthGetStatus: (providerId: string) => Promise<{
		success: boolean;
		providerId?: string;
		isLoggedIn: boolean;
		isExpired?: boolean;
		canRefresh?: boolean;
		expiresAt?: number;
		account?: {
			id?: string;
			email?: string;
			planType?: string;
			isFedramp?: boolean;
		};
		lastError?: string;
		error?: string;
	}>;
	oauthDevicePoll: (
		providerId: string,
		flowId?: string,
	) => Promise<{
		success: boolean;
		completed?: boolean;
		error?: string;
		pollStatus?: string;
	}>;
	oauthRefresh: (
		providerId: string,
	) => Promise<{ success: boolean; error?: string }>;
	onOAuthTokenRefreshed: (
		callback: (data: { providerId: string }) => void,
	) => () => void;
	onOAuthTokenExpired: (
		callback: (data: { providerId: string; error?: string }) => void,
	) => () => void;

	// Window
	closeWindow: () => Promise<{ success: boolean }>;

	// Menu event listeners
	onMenuNewChat: (callback: () => void) => () => void;
	onMenuCloseChat: (callback: () => void) => () => void;
	onMenuNewBrowserTab: (callback: () => void) => () => void;

	// Files methods (for @ file search)
	listFiles: (options: {
		cwd?: string;
		query?: string;
		limit?: number;
	}) => Promise<{
		success: boolean;
		files: string[];
		entries?: Array<{
			path: string;
			type: "file" | "directory";
			source?: "workdir" | "downloads" | "note";
			label?: string;
		}>;
		error?: string;
	}>;

	// File rollback (for /files command)
	rollbackFile: (options: {
		auditPath?: string;
		filePath?: string;
		originalContent?: string;
		isNew?: boolean;
	}) => Promise<{
		success: boolean;
		error?: string;
		auditId?: string;
		filePath?: string;
		restoredExists?: boolean;
	}>;

	// Directories listing (for /cd path completion)
	listDirs: (options: {
		basePath: string;
		query?: string;
		limit?: number;
	}) => Promise<{
		success: boolean;
		dirs: string[];
		basePath: string;
		error?: string;
	}>;

	// File content reading/writing (for file preview panel)
	readFileContent: (
		filePath: string,
		maxSize?: number,
	) => Promise<{
		success: boolean;
		content?: string;
		encoding?: string;
		size?: number;
		mtimeMs?: number;
		isBinary?: boolean;
		error?: string;
	}>;
	saveFileContent: (
		filePath: string,
		content: string,
		expectedMtimeMs?: number,
	) => Promise<{
		success: boolean;
		mtimeMs?: number;
		conflict?: boolean;
		error?: string;
	}>;
	listDirectory: (dirPath: string) => Promise<{
		success: boolean;
		entries?: Array<{
			name: string;
			path: string;
			type: "file" | "directory";
			size?: number;
			mtimeMs?: number;
		}>;
		error?: string;
	}>;
	createFile: (
		filePath: string,
		content?: string,
	) => Promise<{ success: boolean; error?: string }>;
	createDirectory: (
		dirPath: string,
	) => Promise<{ success: boolean; error?: string }>;
	renamePath: (
		oldPath: string,
		newPath: string,
	) => Promise<{ success: boolean; error?: string }>;
	deletePath: (
		targetPath: string,
	) => Promise<{ success: boolean; error?: string }>;
	statPath: (targetPath: string) => Promise<{
		success: boolean;
		type?: "file" | "directory";
		size?: number;
		mtimeMs?: number;
		error?: string;
	}>;
	revealPath: (
		targetPath: string,
	) => Promise<{ success: boolean; error?: string }>;
	watchWorkspace: (
		root: string,
	) => Promise<{ success: boolean; error?: string }>;
	unwatchWorkspace: (root: string) => Promise<{ success: boolean }>;
	onWorkspaceFileChanged: (
		callback: (data: { root: string; path: string; eventType: string }) => void,
	) => () => void;
	resolveMarkdownAsset: (
		request: MarkdownResolveAssetRequest,
	) => Promise<MarkdownResolveAssetResponse>;
	saveMarkdownAttachments: (
		request: MarkdownSaveAttachmentsRequest,
	) => Promise<MarkdownSaveAttachmentsResponse>;

	// Window methods
	setWindowButtonVisibility: (
		visible: boolean,
	) => Promise<{ success: boolean }>;

	// Unified event-driven channels (Phase 4)
	onSessionEvent: (callback: (envelope: any) => void) => () => void;
	onSessionStream: (
		callback: (data: { sessionId: string; chunk: any }) => void,
	) => () => void;
	emitCommand: (
		sessionId: string,
		command: any,
	) => Promise<{ success: boolean; error?: string; result?: any }>;

	// Terminal (real PTY; wire contracts in packages/shared/ipc/terminal.ts)
	createTerminal: (request: {
		cwd?: string;
		shell?: string;
		cols?: number;
		rows?: number;
		sessionId?: string;
	}) => Promise<{ success: boolean; terminal?: TerminalInfo; error?: string }>;
	listTerminals: () => Promise<{
		success: boolean;
		terminals: TerminalInfo[];
		error?: string;
	}>;
	writeTerminal: (
		terminalId: string,
		data: string,
	) => Promise<{ success: boolean; error?: string }>;
	resizeTerminal: (
		terminalId: string,
		cols: number,
		rows: number,
	) => Promise<{ success: boolean; error?: string }>;
	killTerminal: (
		terminalId: string,
	) => Promise<{ success: boolean; error?: string }>;
	attachTerminal: (terminalId: string) => Promise<TerminalAttachResult>;
	/** One-way flow-control ack (no response). bytes = JS string length units. */
	ackTerminal: (terminalId: string, bytes: number, generation: number) => void;
	onTerminalData: (
		callback: (data: { terminalId: string; seq: number; data: string }) => void,
	) => () => void;
	onTerminalExit: (
		callback: (data: { terminalId: string; exitCode: number | null }) => void,
	) => () => void;

	/**
	 * 系统通知 + dock 徽标(wire contracts in packages/shared/ipc/notify.ts)。
	 *
	 * 只执行,不判定:"该不该弹"由 renderer 决定(焦点/可见性/水位/冷却窗全在
	 * store 里)。web 宿主是 no-op —— 那边降级为只剩未读墨点。
	 */
	notify: {
		show: (
			request: ShowNotificationRequest,
		) => Promise<{ success: boolean; error?: string }>;
		setBadge: (
			hasUnread: boolean,
		) => Promise<{ success: boolean; error?: string }>;
		onActivate: (
			callback: (data: NotifyActivateEvent) => void,
		) => () => void;
	};

	// Browser (embedded WebContentsView; wire contracts in packages/shared/ipc/browser.ts)
	hydrateBrowser: () => Promise<{
		success: boolean;
		tabs: BrowserTabInfo[];
		activeTabId: string | null;
		error?: string;
	}>;
	createBrowserTab: (request?: {
		url?: string;
		background?: boolean;
	}) => Promise<{ success: boolean; tab?: BrowserTabInfo; error?: string }>;
	closeBrowserTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	selectBrowserTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	navigateBrowser: (tabId: string, url: string) => Promise<{ success: boolean; error?: string }>;
	browserGoBack: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	browserGoForward: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	reloadBrowser: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	stopBrowser: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	setBrowserBounds: (bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) => Promise<{ success: boolean; error?: string }>;
	setBrowserVisible: (visible: boolean) => Promise<{ success: boolean; error?: string }>;
	pickBrowserElement: (tabId: string) => Promise<BrowserPickResponse>;
	cancelBrowserPick: (tabId: string) => Promise<{ success: boolean; error?: string }>;
	getBrowserSearchEngine: () => Promise<BrowserSearchEngineResponse>;
	setBrowserSearchEngine: (engineId: string) => Promise<BrowserSearchEngineResponse>;
	listBrowserProfiles: () => Promise<BrowserProfilesResponse>;
	addBrowserProfile: (name: string) => Promise<BrowserProfilesResponse>;
	removeBrowserProfile: (profileId: string) => Promise<BrowserProfilesResponse>;
	switchBrowserProfile: (profileId: string) => Promise<BrowserProfilesResponse>;
	onBrowserTabsChanged: (callback: (event: BrowserTabsChangedEvent) => void) => () => void;

	// Skill execution
	executeSkill: (
		skillId: string,
		options: { sessionId: string; input: string },
	) => Promise<{
		success: boolean;
		result?: { output: string };
		error?: string;
	}>;

	// Plugin management
	getPlugins: () => Promise<{
		success: boolean;
		plugins?: Array<{
			id: string;
			name: string;
			version: string;
			description: string;
			author: string;
			loaded: boolean;
			enabled: boolean;
			commands: string[];
			error: string;
			dirPath: string;
			needsInstall: boolean;
		}>;
		error?: string;
	}>;
	enablePlugin: (
		pluginId: string,
	) => Promise<{ success: boolean; error?: string }>;
	disablePlugin: (
		pluginId: string,
	) => Promise<{ success: boolean; error?: string }>;
	refreshPlugins: () => Promise<{ success: boolean; error?: string }>;
	getPluginCommands: () => Promise<GetPluginCommandsResponse>;
	executePluginCommand: (
		commandName: string,
		args: string,
		sessionId: string,
	) => Promise<ExecutePluginCommandResponse>;

	// Soul / Memory panel
	getMemoryOverview: (agentId?: string) => Promise<MemoryOverviewResponse>;
	readMemoryFile: (request: MemoryReadRequest) => Promise<MemoryReadResponse>;
	appendMemory: (request: MemoryAppendRequest) => Promise<MemoryAppendResponse>;
	saveMemoryFile: (
		request: MemorySaveFileRequest,
	) => Promise<MemorySaveFileResponse>;
	listMemoryLogs: (
		request?: MemoryLogsListRequest,
	) => Promise<MemoryLogsListResponse>;
	getMemoryLogStats: () => Promise<MemoryLogsStatsResponse>;
	openMemoryLogFolder: () => Promise<{ success: boolean; error?: string }>;
	cleanupMemoryLogs: () => Promise<MemoryLogsCleanupResponse>;
	saveMemoryCapture: (
		request?: MemoryCaptureDecisionRequest,
	) => Promise<MemoryCaptureDecisionResponse>;
	discardMemoryCapture: (
		request?: MemoryCaptureDecisionRequest,
	) => Promise<MemoryCaptureDecisionResponse>;
	listSchedulerTasks: () => Promise<SchedulerListResponse>;
	getSchedulerTask: (
		request: SchedulerGetRequest,
	) => Promise<SchedulerGetResponse>;
	runSchedulerTaskNow: (
		request: SchedulerRunNowRequest,
	) => Promise<SchedulerRunNowResponse>;
	setSchedulerTaskEnabled: (
		request: SchedulerSetEnabledRequest,
	) => Promise<SchedulerSetEnabledResponse>;
	createSchedulerTask: (
		request: SchedulerCreateTaskRequest,
	) => Promise<SchedulerWriteTaskResponse>;
	updateSchedulerTask: (
		request: SchedulerUpdateTaskRequest,
	) => Promise<SchedulerWriteTaskResponse>;
	deleteSchedulerTask: (
		request: SchedulerDeleteTaskRequest,
	) => Promise<SchedulerDeleteTaskResponse>;
	listSchedulerRuns: (
		request: SchedulerListRunsRequest,
	) => Promise<SchedulerListRunsResponse>;
	getSchedulerRun: (
		request: SchedulerGetRunRequest,
	) => Promise<SchedulerGetRunResponse>;

	// App State
	// `openTabs`/`activeTabIndex` are the legacy (v1) flat tab list, read-only
	// for migration; `workspace` is the v2 whole-tree format written by the
	// workspace store.
	getAppState: () => Promise<{
		currentSessionId: string;
		currentWorkspaceId: string | null;
		openTabs?: Array<{
			type: string;
			sessionId?: string;
			filePath?: string;
			initialFilePath?: string;
			activeFilePath?: string;
			workspaceRoot?: string;
			title?: string;
		}>;
		activeTabIndex?: number;
		workspace?: import("@/stores/workspace-persistence").PersistedWorkspace;
		sidebarCollapsed?: boolean;
		sessionReadMarks?: import("@/stores/session-read-marks").PersistedSessionReadMarks;
	}>;
	saveUIState: (uiState: {
		workspace?: import("@/stores/workspace-persistence").PersistedWorkspace;
		sidebarCollapsed?: boolean;
		sessionReadMarks?: import("@/stores/session-read-marks").PersistedSessionReadMarks;
	}) => Promise<{ success: boolean }>;

	// Search Everywhere
	toggleSearchWindow: (
		options?: SearchWindowOpenOptions,
	) => Promise<{ success: boolean }>;
	closeSearchWindow: () => Promise<{ success: boolean }>;
	setSearchWindowAnchor: (
		anchor: SearchWindowAnchor | null,
	) => Promise<{ success: boolean }>;
	onSearchWindowShown: (
		callback: (payload?: SearchWindowShownPayload | null) => void,
	) => () => void;
	onSearchWindowGuides: (
		callback: (state: SearchWindowGuideState) => void,
	) => () => void;
	searchQuery: (req: SearchRequest) => Promise<SearchResponse>;
	searchExecuteAction: (actionId: string) => Promise<{ success: boolean }>;
	onSearchAction: (callback: (actionId: string) => void) => () => void;

	// Todo / Plan
	getTodoPlan: (request?: TodoPlanGetRequest) => Promise<TodoPlanGetResponse>;
	createTodoPlanNote: (
		request: TodoPlanCreateRequest,
	) => Promise<TodoPlanCreateResponse>;
	updateTodoPlan: (
		request: TodoPlanUpdateRequest,
	) => Promise<TodoPlanUpdateResponse>;
	renameTodoPlanNote: (
		request: TodoPlanRenameRequest,
	) => Promise<TodoPlanRenameResponse>;
	deleteTodoPlanNote: (
		request: TodoPlanDeleteRequest,
	) => Promise<TodoPlanDeleteResponse>;
	revealTodoPlanDirectory: () => Promise<{ success: boolean; error?: string }>;
	openTodoPlanWindow: (
		request?: TodoPlanWindowActionRequest,
	) => Promise<{ success: boolean }>;
	hideTodoPlanWindow: (
		request?: TodoPlanWindowActionRequest,
	) => Promise<{ success: boolean }>;
	toggleTodoPlanWindow: (
		request?: TodoPlanWindowActionRequest,
	) => Promise<{ success: boolean }>;
	setTodoPlanWindowPinned: (
		pinned: boolean,
	) => Promise<{ success: boolean; pinned: boolean }>;
	onTodoPlanChanged: (
		callback: (data: TodoPlanChangedPayload) => void,
	) => () => void;
}

declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}
