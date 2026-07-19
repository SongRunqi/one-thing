import type {
	AppSettings,
	GetSessionUsageRequest,
	GetUsageSummaryRequest,
	PracticeConfigResponse,
	PracticeSummaryRequest,
} from "@/types";
import type { SessionEventEnvelope } from "@shared/events";
import type { PlatformApi, PlatformCapabilities } from "./types";

function browserClipboardWriteCapability(): boolean {
	return (
		typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText)
	);
}

const webCapabilities: PlatformCapabilities = {
	localFileSystem: false,
	workspaceFileSystem: false,
	nativeWindowControls: false,
	shellTools: false,
	clipboardWrite: browserClipboardWriteCapability(),
	desktopWindows: false,
	globalMenuEvents: false,
};

type Unsubscribe = () => void;
type SessionStreamPayload = { sessionId: string; chunk: unknown };
type SearchActionHandler = (actionId: string) => void;
type TodoPlanWebWindowAction = "open" | "hide" | "toggle" | "pin";
type ImagePreviewUpdatePayload = {
	mode: "single";
	previewId?: string;
	src?: string;
	alt?: string;
};

const searchActionHandlers = new Set<SearchActionHandler>();
const imagePreviewUpdateHandlers = new Set<
	(payload: ImagePreviewUpdatePayload) => void
>();
const TODO_PLAN_WEB_WINDOW_EVENT = "todo-plan:web-window-action";
const MUSIC_UNSUPPORTED = "音乐电台仅在桌面端可用";
const sharedEventSources = new Map<
	string,
	{
		refCount: number;
		source: EventSource;
	}
>();

function emitSearchAction(actionId: string): void {
	for (const handler of searchActionHandlers) handler(actionId);
}

function subscribeSearchAction(callback: SearchActionHandler): Unsubscribe {
	searchActionHandlers.add(callback);
	return () => searchActionHandlers.delete(callback);
}

function emitImagePreviewUpdate(payload: ImagePreviewUpdatePayload): void {
	for (const handler of imagePreviewUpdateHandlers) handler(payload);
}

function subscribeImagePreviewUpdate(
	callback: (payload: ImagePreviewUpdatePayload) => void,
): Unsubscribe {
	imagePreviewUpdateHandlers.add(callback);
	return () => imagePreviewUpdateHandlers.delete(callback);
}

function dispatchTodoPlanWindowAction(
	action: TodoPlanWebWindowAction,
	detail: { request?: unknown; pinned?: boolean } = {},
): void {
	const target = typeof window === "undefined" ? undefined : window;
	if (!target?.dispatchEvent) return;
	const payload = { action, ...detail };
	const event =
		typeof CustomEvent === "function"
			? new CustomEvent(TODO_PLAN_WEB_WINDOW_EVENT, { detail: payload })
			: ({
					type: TODO_PLAN_WEB_WINDOW_EVENT,
					detail: payload,
				} as unknown as Event);
	target.dispatchEvent(event);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			...(init?.body ? { "content-type": "application/json" } : {}),
			...init?.headers,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Request failed: ${response.status} ${response.statusText}`,
		);
	}

	return response.json() as Promise<T>;
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
	return requestJson<T>(path, {
		method: "POST",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function booleanProperty(
	value: unknown,
	key: keyof PlatformCapabilities,
	fallback: boolean,
): boolean {
	if (!value || typeof value !== "object") return fallback;
	const candidate = (
		value as Partial<Record<keyof PlatformCapabilities, unknown>>
	)[key];
	return typeof candidate === "boolean" ? candidate : fallback;
}

function normalizeServerCapabilities(value: unknown): PlatformCapabilities {
	return {
		localFileSystem: booleanProperty(value, "localFileSystem", false),
		workspaceFileSystem: booleanProperty(value, "workspaceFileSystem", false),
		nativeWindowControls: booleanProperty(value, "nativeWindowControls", false),
		shellTools: booleanProperty(value, "shellTools", false),
		clipboardWrite: browserClipboardWriteCapability(),
		desktopWindows: booleanProperty(value, "desktopWindows", false),
		globalMenuEvents: booleanProperty(value, "globalMenuEvents", false),
	};
}

async function refreshWebCapabilities(): Promise<PlatformCapabilities> {
	const capabilities = normalizeServerCapabilities(
		await requestJson("/api/capabilities"),
	);
	Object.assign(webCapabilities, capabilities);
	return webCapabilities;
}

function getPreferredColorScheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia?.("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";
}

function createEventSourceSubscription<T>(
	path: string,
	eventName: string,
	callback: (payload: T) => void,
): Unsubscribe {
	if (typeof EventSource === "undefined") return () => {};

	let entry = sharedEventSources.get(path);
	if (!entry) {
		entry = {
			refCount: 0,
			source: new EventSource(path),
		};
		sharedEventSources.set(path, entry);
	}
	entry.refCount += 1;

	const listener = (event: MessageEvent<string>) => {
		try {
			callback(JSON.parse(event.data) as T);
		} catch (error) {
			console.warn(
				`[Platform:web] Ignored malformed ${eventName} event`,
				error,
			);
		}
	};

	entry.source.addEventListener(eventName, listener);
	return () => {
		const current = sharedEventSources.get(path);
		if (!current) return;
		current.source.removeEventListener(eventName, listener);
		current.refCount -= 1;
		if (current.refCount <= 0) {
			current.source.close();
			sharedEventSources.delete(path);
		}
	};
}

function createSessionMessagesChangedSubscription(
	callback: (data: {
		sessionId: string;
		action: "added" | "updated" | "deleted";
		messageId?: string;
	}) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; message?: { id?: string }; messageId?: string }
				| undefined;
			if (!event?.type) return;

			if (
				event.type === "message:user-created" ||
				event.type === "message:assistant-created" ||
				event.type === "message:created"
			) {
				callback({
					sessionId: envelope.sessionId,
					action: "added",
					messageId: event.message?.id,
				});
				return;
			}

			if (
				event.type === "message:updated" ||
				event.type === "messages:replaced"
			) {
				callback({
					sessionId: envelope.sessionId,
					action: "updated",
					messageId: event.messageId,
				});
				return;
			}

			if (event.type === "message:deleted") {
				callback({
					sessionId: envelope.sessionId,
					action: "deleted",
					messageId: event.messageId,
				});
			}
		},
	);
}

function createStepAddedSubscription(
	callback: (data: {
		sessionId: string;
		messageId: string;
		step: unknown;
	}) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; step?: unknown }
				| undefined;
			if (event?.type !== "step:added") return;
			const step = event.step as { messageId?: unknown } | undefined;
			callback({
				sessionId: envelope.sessionId,
				messageId: typeof step?.messageId === "string" ? step.messageId : "",
				step: event.step,
			});
		},
	);
}

function createStepUpdatedSubscription(
	callback: (data: {
		sessionId: string;
		messageId: string;
		stepId: string;
		updates: unknown;
	}) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; stepId?: unknown; updates?: unknown }
				| undefined;
			if (event?.type !== "step:updated" || typeof event.stepId !== "string")
				return;
			callback({
				sessionId: envelope.sessionId,
				messageId: "",
				stepId: event.stepId,
				updates: event.updates,
			});
		},
	);
}

function createSkillActivatedSubscription(
	callback: (data: {
		sessionId: string;
		messageId: string;
		skillName: string;
	}) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; skillName?: unknown }
				| undefined;
			if (
				event?.type !== "skill:activated" ||
				typeof event.skillName !== "string"
			)
				return;
			callback({
				sessionId: envelope.sessionId,
				messageId: "",
				skillName: event.skillName,
			});
		},
	);
}

function createContextSizeUpdatedSubscription(
	callback: (data: { sessionId: string; contextSize: number }) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; contextSize?: unknown }
				| undefined;
			if (
				event?.type !== "context:size-updated" ||
				typeof event.contextSize !== "number"
			)
				return;
			callback({
				sessionId: envelope.sessionId,
				contextSize: event.contextSize,
			});
		},
	);
}

function createContextCompactStartedSubscription(
	callback: (data: { sessionId: string }) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; message?: unknown }
				| undefined;
			if (event?.type === "context:compact-started") {
				callback({ sessionId: envelope.sessionId });
				return;
			}
			if (!event?.type?.startsWith("message:")) return;
			if (!isContextCompactStartedMessage(event.message)) return;
			callback({ sessionId: envelope.sessionId });
		},
	);
}

function createContextCompactCompletedSubscription(
	callback: (data: {
		sessionId: string;
		success: boolean;
		error?: string;
	}) => void,
): Unsubscribe {
	return createEventSourceSubscription<SessionEventEnvelope>(
		"/api/events",
		"session:event",
		(envelope) => {
			const event = envelope.event as
				| { type?: string; success?: unknown; error?: unknown }
				| undefined;
			if (event?.type !== "context:compact-completed") return;
			callback({
				sessionId: envelope.sessionId,
				success: event.success === true,
				...(typeof event.error === "string" ? { error: event.error } : {}),
			});
		},
	);
}

function isContextCompactStartedMessage(message: unknown): boolean {
	if (!message || typeof message !== "object") return false;
	const content = (message as { content?: unknown }).content;
	if (typeof content !== "string") return false;
	if (
		!content.includes('"context-compact"') ||
		!content.includes('"compacting"')
	)
		return false;

	try {
		const parsed = JSON.parse(content) as { type?: unknown; status?: unknown };
		return parsed.type === "context-compact" && parsed.status === "compacting";
	} catch {
		return false;
	}
}

function unsupported(method: string) {
	return async () => ({
		success: false,
		error: `Platform method "${method}" is not available in the web host yet.`,
	});
}

function unsupportedSubscription(_method: string) {
	return () => () => {};
}

function isSubscriptionMethod(method: string): boolean {
	return /^on[A-Z]/.test(method);
}

export const WEB_DESKTOP_ONLY_PLATFORM_METHODS = [
	"setWindowButtonVisibility",
	"toggleSearchWindow",
	"closeSearchWindow",
	"setSearchWindowAnchor",
	"openPath",
	"getDataPath",
	"onMenuNewChat",
	"onMenuCloseChat",
	"onSearchWindowShown",
	"onSearchWindowGuides",
] as const;

export const WEB_DEFERRED_PLATFORM_METHODS = [] as const;

export const WEB_UNSUPPORTED_PLATFORM_METHODS = [
	...WEB_DESKTOP_ONLY_PLATFORM_METHODS,
	...WEB_DEFERRED_PLATFORM_METHODS,
] as const;

type WebUnsupportedPlatformMethod =
	(typeof WEB_UNSUPPORTED_PLATFORM_METHODS)[number];

const webUnsupportedApi = Object.fromEntries(
	WEB_UNSUPPORTED_PLATFORM_METHODS.map((method) => [
		method,
		isSubscriptionMethod(method)
			? unsupportedSubscription(method)
			: unsupported(method),
	]),
) as Record<WebUnsupportedPlatformMethod, (...args: never[]) => unknown>;

const webApi = {
	...webUnsupportedApi,
	environment: "web" as const,
	capabilities: webCapabilities,
	getCapabilities: refreshWebCapabilities,

	getAppState: () => requestJson("/api/app-state"),
	saveUIState: (uiState: unknown) => postJson("/api/app-state/ui", uiState),

	getSettings: () => requestJson("/api/settings"),
	saveSettings: (settings: AppSettings) => postJson("/api/settings", settings),
	openSettingsWindow: async () => {
		window.location.hash = "#/settings";
		return { success: true };
	},
	testProxy: (proxy: unknown) => postJson("/api/network/test-proxy", { proxy }),
	onSettingsChanged: () => () => {},
	searchQuery: (request: unknown) => postJson("/api/search/query", request),
	searchExecuteAction: async (actionId: string) => {
		const response = await postJson<{
			success: boolean;
			actionId?: string;
			error?: string;
		}>("/api/search/actions", { actionId });
		if (response.success) emitSearchAction(response.actionId || actionId);
		return response;
	},

	getThemes: () => requestJson("/api/themes"),
	getTheme: (themeId: string) =>
		requestJson(`/api/themes/${encodeURIComponent(themeId)}`),
	applyTheme: (themeId: string, mode: "dark" | "light") =>
		postJson(`/api/themes/${encodeURIComponent(themeId)}/apply`, { mode }),
	refreshThemes: (projectPath?: string) =>
		postJson("/api/themes/refresh", { projectPath }),
	openThemesFolder: () => postJson("/api/themes/open-folder"),

	getSystemPromptSnapshot: (sessionId: string) =>
		requestJson(
			`/api/sessions/${encodeURIComponent(sessionId)}/system-prompt-snapshot`,
		),
	listPrompts: () => requestJson("/api/prompts"),
	getPrompt: (request: { id: string }) =>
		requestJson(`/api/prompts/${encodeURIComponent(request.id)}`),
	createPrompt: (request: unknown) => postJson("/api/prompts", request),
	updatePrompt: (request: { id: string }) =>
		postJson(`/api/prompts/${encodeURIComponent(request.id)}/update`, request),
	deletePrompt: (request: { id: string }) =>
		requestJson(`/api/prompts/${encodeURIComponent(request.id)}`, {
			method: "DELETE",
		}),

	getSkills: (workingDirectory?: string) => {
		const query = workingDirectory
			? `?workingDirectory=${encodeURIComponent(workingDirectory)}`
			: "";
		return requestJson(`/api/skills${query}`);
	},
	refreshSkills: () => postJson("/api/skills/refresh"),
	readSkillFile: (skillId: string, fileName: string) =>
		postJson("/api/skills/read-file", { skillId, fileName }),
	openSkillDirectory: (skillId?: string) =>
		postJson("/api/skills/open-directory", { skillId }),
	createSkill: (
		name: string,
		description: string,
		instructions: string,
		source: string,
	) => postJson("/api/skills", { name, description, instructions, source }),
	deleteSkill: (skillId: string) =>
		requestJson(`/api/skills/${encodeURIComponent(skillId)}`, {
			method: "DELETE",
		}),
	toggleSkillEnabled: (skillId: string, enabled: boolean) =>
		postJson(`/api/skills/${encodeURIComponent(skillId)}/toggle`, { enabled }),
	listSkillDirectories: () => requestJson("/api/skills/directories"),
	addSkillDirectory: (request: {
		path: string;
		label?: string;
		agentId?: string | null;
	}) => postJson("/api/skills/directories", request),
	updateSkillDirectory: (request: { id: string }) =>
		postJson(
			`/api/skills/directories/${encodeURIComponent(request.id)}/update`,
			request,
		),
	removeSkillDirectory: (id: string) =>
		requestJson(`/api/skills/directories/${encodeURIComponent(id)}`, {
			method: "DELETE",
		}),
	setSkillAgent: (skillId: string, agentId: string | null) =>
		postJson(`/api/skills/${encodeURIComponent(skillId)}/agent`, { agentId }),
	executeSkill: (skillId: string, options: unknown) =>
		postJson("/api/skills/execute", { skillId, options }),

	getPlugins: () => requestJson("/api/plugins"),
	enablePlugin: (pluginId: string) =>
		postJson("/api/plugins/enable", { pluginId }),
	disablePlugin: (pluginId: string) =>
		postJson("/api/plugins/disable", { pluginId }),
	refreshPlugins: () => postJson("/api/plugins/refresh"),
	getPluginCommands: () => requestJson("/api/plugins/commands"),
	executePluginCommand: (
		commandName: string,
		args: string,
		sessionId: string,
	) =>
		postJson("/api/plugins/execute-command", { commandName, args, sessionId }),
	oauthStart: (providerId: string) =>
		postJson("/api/oauth/start", { providerId }),
	oauthCallback: (providerId: string, code: string, state: string) =>
		postJson("/api/oauth/callback", { providerId, code, state }),
	oauthLogout: (providerId: string) =>
		postJson("/api/oauth/logout", { providerId }),
	oauthGetStatus: (providerId: string) =>
		postJson("/api/oauth/status", { providerId }),
	oauthDevicePoll: (providerId: string, flowId?: string) =>
		postJson("/api/oauth/device-poll", { providerId, flowId }),
	oauthRefresh: (providerId: string) =>
		postJson("/api/oauth/refresh", { providerId }),
	onOAuthTokenRefreshed: (callback: (data: { providerId: string }) => void) =>
		createEventSourceSubscription<{ providerId: string }>(
			"/api/oauth/events",
			"oauth:token-refreshed",
			callback,
		),
	onOAuthTokenExpired: (
		callback: (data: { providerId: string; error?: string }) => void,
	) =>
		createEventSourceSubscription<{ providerId: string; error?: string }>(
			"/api/oauth/events",
			"oauth:token-expired",
			callback,
		),
	gatewayGetStatus: () => requestJson("/api/gateway/status"),
	gatewayStart: (request?: unknown) => postJson("/api/gateway/start", request),
	gatewayStop: () => postJson("/api/gateway/stop"),
	gatewayWechatLogout: (request?: unknown) =>
		postJson("/api/gateway/wechat/logout", request ?? {}),
	gatewayWechatAddAccount: (request?: unknown) =>
		postJson("/api/gateway/wechat/accounts/add", request ?? {}),
	gatewayWechatStopAccount: (request: unknown) =>
		postJson("/api/gateway/wechat/accounts/stop", request),
	gatewayWechatRemoveAccount: (request: unknown) =>
		postJson("/api/gateway/wechat/accounts/remove", request),
	gatewayWechatRenameAccount: (request: unknown) =>
		postJson("/api/gateway/wechat/accounts/rename", request),
	channelIdentityListLinks: (request?: unknown) =>
		postJson("/api/channel-identity/links/list", request ?? {}),
	channelIdentityListProfiles: () =>
		postJson("/api/channel-identity/profiles/list", {}),
	channelIdentityCreateProfile: (request: unknown) =>
		postJson("/api/channel-identity/profiles/create", request),
	channelIdentityUpdateProfile: (request: unknown) =>
		postJson("/api/channel-identity/profiles/update", request),
	channelIdentityCreateLink: (request: unknown) =>
		postJson("/api/channel-identity/links/create", request),
	channelIdentityDeleteLink: (id: string) =>
		postJson("/api/channel-identity/links/delete", { id }),
	channelIdentityResolve: (origin: unknown) =>
		postJson("/api/channel-identity/resolve", { origin }),
	channelDeliveryList: () => requestJson("/api/channel-identity/deliveries"),
	voiceGetState: () => requestJson("/api/voice/state"),
	voiceStart: (request?: unknown) => postJson("/api/voice/start", request),
	voiceStop: (request?: unknown) => postJson("/api/voice/stop", request),
	voiceSubmitUtterance: (request: unknown) =>
		postJson("/api/voice/submit-utterance", request),
	voiceSubmitTranscript: (request: unknown) =>
		postJson("/api/voice/submit-transcript", request),
	voiceSynthesize: (request: unknown) =>
		postJson("/api/voice/synthesize", request),
	voiceTestASR: (request: unknown) => postJson("/api/voice/test-asr", request),
	voiceTestTTS: (request: unknown) => postJson("/api/voice/test-tts", request),
	voiceGetTTSModels: (request?: unknown) =>
		postJson("/api/voice/tts-models", request),
	onVoiceEvent: (callback: (event: unknown) => void) =>
		createEventSourceSubscription("/api/voice/events", "voice:event", callback),
	voiceRuntimeReady: () => postJson("/api/voice/runtime-ready"),
	voiceRuntimeEvent: (event: unknown) =>
		postJson("/api/voice/runtime-event", event),
	voiceAudioChunk: (payload: unknown) => {
		void postJson("/api/voice/audio-chunk", payload).catch(() => {
			// Fire-and-forget PCM uplink; drops are tolerated on the web build.
		});
	},
	onVoiceRuntimeCommand: (callback: (command: unknown) => void) =>
		createEventSourceSubscription(
			"/api/voice/runtime-commands",
			"voice:runtime-command",
			callback,
		),
	acpGetAgents: () => requestJson("/api/acp/agents"),
	acpAddAgent: (config: unknown) => postJson("/api/acp/agents", { config }),
	acpUpdateAgent: (config: unknown) =>
		postJson("/api/acp/agents/update", { config }),
	acpRemoveAgent: (agentId: string) =>
		postJson("/api/acp/agents/remove", { agentId }),
	acpConnectAgent: (agentId: string) =>
		postJson("/api/acp/agents/connect", { agentId }),
	acpDisconnectAgent: (agentId: string) =>
		postJson("/api/acp/agents/disconnect", { agentId }),
	acpRefreshAgent: (agentId: string) =>
		postJson("/api/acp/agents/refresh", { agentId }),
	acpCancelSession: (sessionId: string, agentId?: string) =>
		postJson("/api/acp/sessions/cancel", { sessionId, agentId }),

	getTodoPlan: (request?: unknown) => postJson("/api/todo-plan/get", request),
	createTodoPlanNote: (request: unknown) =>
		postJson("/api/todo-plan/create", request),
	updateTodoPlan: (request: unknown) =>
		postJson("/api/todo-plan/update", request),
	renameTodoPlanNote: (request: unknown) =>
		postJson("/api/todo-plan/rename", request),
	deleteTodoPlanNote: (request: unknown) =>
		postJson("/api/todo-plan/delete", request),
	revealTodoPlanDirectory: () => postJson("/api/todo-plan/reveal-directory"),
	openTodoPlanWindow: (request?: unknown) => {
		dispatchTodoPlanWindowAction("open", { request });
		return Promise.resolve({ success: true });
	},
	hideTodoPlanWindow: (request?: unknown) => {
		dispatchTodoPlanWindowAction("hide", { request });
		return Promise.resolve({ success: true });
	},
	toggleTodoPlanWindow: (request?: unknown) => {
		dispatchTodoPlanWindowAction("toggle", { request });
		return Promise.resolve({ success: true });
	},
	setTodoPlanWindowPinned: (pinned: boolean) => {
		dispatchTodoPlanWindowAction("pin", { pinned });
		return Promise.resolve({ success: true, pinned });
	},

	// The radio drives ncm-cli's mpv on the host machine, so a browser client
	// would only make audio come out of the server. Unsupported by design.
	musicGetState: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicSetup: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	onMusicEvent: () => () => {},
	musicCommand: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicGetNowPlaying: () => Promise.resolve(null),
	musicGetRadio: () =>
		Promise.resolve({ active: false, intent: '', programmeLength: 0, canResume: false }),
	musicOpenRadio: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicSearch: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicRequestSong: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicGetProgramme: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicProgrammeAction: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicListProviders: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicSetProvider: () => Promise.resolve({ success: false, error: MUSIC_UNSUPPORTED }),
	musicGetLyrics: () => Promise.resolve(null),
	onMusicLyrics: () => () => {},
	onMusicNowPlaying: () => () => {},
	onMusicDjSpeak: () => () => {},
	musicDjSpeakDone: () => Promise.resolve(),

	listAgents: () => requestJson("/api/agents"),
	createAgent: (name: string, systemPrompt?: string) =>
		postJson("/api/agents", { name, systemPrompt }),
	updateAgent: (
		agentId: string,
		updates: { name?: string; systemPrompt?: string },
	) => postJson(`/api/agents/${encodeURIComponent(agentId)}/update`, updates),
	deleteAgent: (agentId: string) =>
		requestJson(`/api/agents/${encodeURIComponent(agentId)}`, {
			method: "DELETE",
		}),

	getProviders: () => requestJson("/api/providers"),
	getProviderUsage: (providerId: string) =>
		requestJson(`/api/providers/${encodeURIComponent(providerId)}/usage`),
	getProviderEnvStatus: (providerId: string) =>
		requestJson(`/api/providers/${encodeURIComponent(providerId)}/env-status`),
	getModelsWithCapabilities: (
		providerId: string,
		options?: { forceRefresh?: boolean },
	) => {
		const query = options?.forceRefresh ? "?forceRefresh=true" : "";
		return requestJson(
			`/api/providers/${encodeURIComponent(providerId)}/models${query}`,
		);
	},
	getAllModels: () => requestJson("/api/models"),
	searchModels: (query: string, providerId?: string) =>
		postJson("/api/models/search", { query, providerId }),
	refreshModelRegistry: () => postJson("/api/models/refresh"),
	getModelNameAliases: () => requestJson("/api/models/name-aliases"),
	getModelDisplayName: (modelId: string) =>
		requestJson(`/api/models/${encodeURIComponent(modelId)}/display-name`),

	getTools: () => requestJson("/api/tools"),
	executeTool: (
		toolId: string,
		args: Record<string, unknown>,
		messageId: string,
		sessionId: string,
	) =>
		postJson("/api/tools/execute", {
			toolId,
			arguments: args,
			messageId,
			sessionId,
		}),
	cancelTool: (toolCallId: string) =>
		postJson("/api/tools/cancel", { toolCallId }),
	updateToolCall: (
		sessionId: string,
		messageId: string,
		toolCallId: string,
		updates: unknown,
	) =>
		postJson("/api/tools/update-call", {
			sessionId,
			messageId,
			toolCallId,
			updates,
		}),
	listBackgroundJobs: (options?: { includeInactive?: boolean }) => {
		const query = options?.includeInactive ? "?includeInactive=true" : "";
		return requestJson(`/api/tools/background-jobs${query}`);
	},
	stopBackgroundJob: (jobId: string) =>
		postJson(`/api/tools/background-jobs/${encodeURIComponent(jobId)}/stop`),

	mcpGetServers: () => requestJson("/api/mcp/servers"),
	mcpAddServer: (config: unknown) => postJson("/api/mcp/servers", config),
	mcpUpdateServer: (config: { id?: string }) =>
		postJson(
			`/api/mcp/servers/${encodeURIComponent(config.id || "")}/update`,
			config,
		),
	mcpRemoveServer: (serverId: string) =>
		requestJson(`/api/mcp/servers/${encodeURIComponent(serverId)}`, {
			method: "DELETE",
		}),
	mcpConnectServer: (serverId: string) =>
		postJson(`/api/mcp/servers/${encodeURIComponent(serverId)}/connect`),
	mcpDisconnectServer: (serverId: string) =>
		postJson(`/api/mcp/servers/${encodeURIComponent(serverId)}/disconnect`),
	mcpRefreshServer: (serverId: string) =>
		postJson(`/api/mcp/servers/${encodeURIComponent(serverId)}/refresh`),
	mcpGetTools: () => requestJson("/api/mcp/tools"),
	mcpCallTool: (
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	) => postJson("/api/mcp/tools/call", { serverId, toolName, arguments: args }),
	mcpGetResources: () => requestJson("/api/mcp/resources"),
	mcpReadResource: (serverId: string, uri: string) =>
		postJson("/api/mcp/resources/read", { serverId, uri }),
	mcpGetPrompts: () => requestJson("/api/mcp/prompts"),
	mcpGetPrompt: (
		serverId: string,
		name: string,
		args?: Record<string, string>,
	) => postJson("/api/mcp/prompts/get", { serverId, name, arguments: args }),
	mcpReadConfigFile: (filePath: string) =>
		postJson("/api/mcp/config-file/read", { filePath }),

	listFiles: (request: unknown) => postJson("/api/files/list", request),
	listDirs: (request: unknown) => postJson("/api/dirs/list", request),
	readFileContent: (filePath: string, maxSize?: number) =>
		postJson("/api/files/read", { path: filePath, maxSize }),
	saveFileContent: (
		filePath: string,
		content: string,
		expectedMtimeMs?: number,
	) =>
		postJson("/api/files/save", { path: filePath, content, expectedMtimeMs }),
	rollbackFile: (request: unknown) => postJson("/api/files/rollback", request),
	watchWorkspace: (root: string) =>
		postJson("/api/files/watch/start", { root }),
	unwatchWorkspace: (root: string) =>
		postJson("/api/files/watch/stop", { root }),
	onWorkspaceFileChanged: (
		callback: (payload: {
			root: string;
			path: string;
			eventType: string;
		}) => void,
	) =>
		createEventSourceSubscription(
			"/api/files/watch/events",
			"workspace:file-changed",
			callback,
		),
	listDirectory: (dirPath: string) =>
		postJson("/api/files/list-directory", { path: dirPath }),
	statPath: (targetPath: string) =>
		postJson("/api/files/stat", { path: targetPath }),
	createFile: (filePath: string, content?: string) =>
		postJson("/api/files/create", { path: filePath, content }),
	createDirectory: (dirPath: string) =>
		postJson("/api/files/create-directory", { path: dirPath }),
	renamePath: (oldPath: string, newPath: string) =>
		postJson("/api/files/rename", { oldPath, newPath }),
	deletePath: (targetPath: string) =>
		postJson("/api/files/delete", { path: targetPath }),
	revealPath: (targetPath: string) =>
		postJson("/api/files/reveal", { path: targetPath }),
	resolveMarkdownAsset: (request: unknown) =>
		postJson("/api/markdown/resolve-asset", request),
	saveMarkdownAttachments: (request: unknown) =>
		postJson("/api/markdown/save-attachments", request),
	recordEvalsDownvote: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsListRecords: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsListFixtures: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsReadFixture: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsListResults: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsListCases: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsGetCase: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsRunStart: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsRunCancel: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	onEvalsRunProgress: () => () => {},
	evalsPromoteFixture: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsRetireCase: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsGenerateTriage: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsReadRunDetail: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsIncidentList: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsIncidentGet: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsIncidentUpdate: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsIncidentReadFile: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsReplayStart: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsReplayCancel: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	onEvalsReplayProgress: () => () => {},
	evalsIncidentAnalyze: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsIncidentPromote: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsDiagnoseStart: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	onEvalsDiagnoseProgress: () => () => {},
	evalsRoundList: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	evalsRoundReplay: async () => ({
		success: false,
		error: "Evals is not supported in the web build",
	}),
	listVariables: (sessionId: string) =>
		postJson("/api/variables/list", { sessionId }),
	setVariable: (
		sessionId: string,
		name: string,
		value: string,
		description?: string,
		scope?: "global" | "session",
	) =>
		postJson("/api/variables/set", {
			sessionId,
			name,
			value,
			description,
			scope,
		}),
	deleteVariable: (sessionId: string, name: string) =>
		postJson("/api/variables/delete", { sessionId, name }),

	// Session goals — Electron-only for now (see docs/design/goal-system.md)
	goalGet: async () => ({
		success: false,
		error: "Goals are not supported in the web build",
	}),
	goalSet: async () => ({
		success: false,
		error: "Goals are not supported in the web build",
	}),
	goalDiffs: async () => ({
		success: false,
		error: "Goals are not supported in the web build",
	}),

	getUsageSummary: (request: GetUsageSummaryRequest) =>
		postJson("/api/usage/summary", request),

	getSessionUsage: (request: GetSessionUsageRequest) =>
		postJson("/api/usage/session", request),

	// Practice runs on the Electron main process; the web build has no engine.
	// Values mirror ONETHING_PRACTICE_DEFAULT_CONFIG (no value import: the
	// runtime practice module pulls node:fs into the bundle).
	practiceStart: async () => ({ snapshot: { status: "idle" as const } }),
	practicePause: async () => ({ snapshot: { status: "idle" as const } }),
	practiceResume: async () => ({ snapshot: { status: "idle" as const } }),
	practiceStop: async () => ({ snapshot: { status: "idle" as const } }),
	practiceGetState: async () => ({ snapshot: { status: "idle" as const } }),
	practiceLog: async () => {
		throw new Error("Practice logging is not supported in the web build");
	},
	practiceSummary: async (request: PracticeSummaryRequest) => ({
		granularity: request.granularity,
		buckets: [],
	}),
	practiceRecent: async () => ({ records: [] }),
	practiceGetConfig: async (): Promise<PracticeConfigResponse> => ({
		config: {
			kegel: { holdSec: 10, relaxSec: 5, reps: 20, sets: 3, setRestSec: 60, sound: true },
			pomodoro: { minutes: 25, categories: ["学习", "看视频", "写作", "其他"] },
		},
	}),
	practiceSetConfig: async (): Promise<PracticeConfigResponse> => ({
		config: {
			kegel: { holdSec: 10, relaxSec: 5, reps: 20, sets: 3, setRestSec: 60, sound: true },
			pomodoro: { minutes: 25, categories: ["学习", "看视频", "写作", "其他"] },
		},
	}),
	onPracticeEvent: () => () => {},

	projectDirsList: () => requestJson("/api/project-dirs"),
	projectDirsGet: (path: string) => postJson("/api/project-dirs/get", { path }),
	projectDirsAdd: (path: string, description?: string) =>
		postJson("/api/project-dirs", { path, description }),
	projectDirsUpdate: (path: string, description: string) =>
		postJson("/api/project-dirs/update", { path, description }),
	projectDirsRemove: (path: string) =>
		postJson("/api/project-dirs/remove", { path }),

	saveImage: (data: unknown) => postJson("/api/media/save-image", data),
	loadAllMedia: () => requestJson("/api/media/legacy-images"),
	deleteMedia: (id: string) => postJson("/api/media/delete", { id }),
	clearAllMedia: () => postJson("/api/media/clear-all"),
	readImageBase64: (filePath: string) =>
		postJson("/api/media/read-image", { filePath }),
	listMediaAssets: (query?: {
		kind?: string;
		source?: string;
		search?: string;
		includeHidden?: boolean;
	}) => {
		const params = new URLSearchParams();
		if (query?.kind) params.set("kind", query.kind);
		if (query?.source) params.set("source", query.source);
		if (query?.search) params.set("search", query.search);
		if (query?.includeHidden) params.set("includeHidden", "true");
		const suffix = params.toString() ? `?${params.toString()}` : "";
		return requestJson(`/api/media/assets${suffix}`);
	},
	hideMediaAsset: (id: string) => postJson("/api/media/assets/hide", { id }),
	rebuildMediaLibrary: () => postJson("/api/media/rebuild"),
	getMediaGallery: (assetId: string, query?: unknown) =>
		postJson("/api/media/gallery", { assetId, query }),
	onImageGenerated: (callback: (payload: unknown) => void) =>
		createEventSourceSubscription(
			"/api/media/events",
			"media:image-generated",
			callback,
		),
	openImagePreview: async (src: string, alt?: string) => {
		const response = await postJson<{ success?: boolean; previewId?: string }>(
			"/api/media/preview/open",
			{ src, alt },
		);
		if (response.success) {
			emitImagePreviewUpdate({
				mode: "single",
				previewId: response.previewId,
				src,
				alt,
			});
		}
		return response;
	},
	getImagePreview: (previewId: string) =>
		postJson("/api/media/preview/get", { previewId }),
	onImagePreviewUpdate: subscribeImagePreviewUpdate,
	openImageGallery: (mediaId: string) =>
		postJson("/api/media/gallery/open", { mediaId }),

	getMemoryOverview: (agentId?: string) =>
		postJson("/api/memory/overview", agentId ? { agentId } : {}),
	readMemoryFile: (request: unknown) => postJson("/api/memory/read", request),
	appendMemory: (request: unknown) => postJson("/api/memory/append", request),
	saveMemoryFile: (request: unknown) =>
		postJson("/api/memory/save-file", request),
	listMemoryLogs: (request?: unknown) =>
		postJson("/api/memory/logs/list", request ?? {}),
	getMemoryLogStats: () => postJson("/api/memory/logs/stats", {}),
	openMemoryLogFolder: () => postJson("/api/memory/logs/open-folder", {}),
	cleanupMemoryLogs: () => postJson("/api/memory/logs/cleanup", {}),
	saveMemoryCapture: (request?: unknown) =>
		postJson("/api/memory/capture/save", request ?? {}),
	discardMemoryCapture: (request?: unknown) =>
		postJson("/api/memory/capture/discard", request ?? {}),

	getSessionsList: () => requestJson("/api/sessions"),
	// 会话列表一律元数据(与 Electron IPC GET_SESSIONS 行为一致);消息经
	// activate/分页接口按会话加载,不存在全量含消息的列表请求。
	getSessions: () => requestJson("/api/sessions"),
	createSession: (name: string, options?: { sessionId?: string }) =>
		postJson("/api/sessions", { name, sessionId: options?.sessionId }),
	activateSession: (sessionId: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/activate`),
	getSession: (sessionId: string) =>
		requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`),
	switchSession: (sessionId: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/switch`),
	deleteSession: (sessionId: string) =>
		requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
			method: "DELETE",
		}),
	renameSession: (sessionId: string, newName: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
			name: newName,
		}),
	createBranch: (parentSessionId: string, branchFromMessageId: string) =>
		postJson("/api/sessions/branch", { parentSessionId, branchFromMessageId }),
	updateSessionArchived: (
		sessionId: string,
		isArchived: boolean,
		archivedAt?: number | null,
	) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
			isArchived,
			archivedAt,
		}),
	updateSessionWorkingDirectory: (
		sessionId: string,
		workingDirectory: string | null,
	) =>
		postJson(
			`/api/sessions/${encodeURIComponent(sessionId)}/working-directory`,
			{ workingDirectory },
		),
	updateSessionAgent: (sessionId: string, agentId: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/agent`, {
			agentId,
		}),
	updateSessionPermissionMode: (sessionId: string, permissionMode: unknown) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
			permissionMode,
		}),
	updateSessionModel: (sessionId: string, provider: string, model: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
			provider,
			model,
		}),
	updateSessionMaxTokens: (sessionId: string, maxTokens: number) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/max-tokens`, {
			maxTokens,
		}),
	getPendingPermissions: (sessionId: string) =>
		requestJson(
			`/api/sessions/${encodeURIComponent(sessionId)}/permissions/pending`,
		),
	clearSessionPermissions: (sessionId: string) =>
		postJson(
			`/api/sessions/${encodeURIComponent(sessionId)}/permissions/clear`,
		),
	listPermissionGrants: (options: unknown) =>
		postJson("/api/permission-grants/list", options),
	revokePermissionGrant: (id: string) =>
		postJson("/api/permission-grants/revoke", { id }),
	clearSessionPermissionGrants: (sessionId: string) =>
		postJson("/api/permission-grants/session/clear", { sessionId }),
	clearWorkspacePermissionGrants: (workspaceRoot: string) =>
		postJson("/api/permission-grants/workspace/clear", { workspaceRoot }),

	getSessionMessagesPage: (request: unknown) =>
		postJson("/api/session-messages/page", request),
	getSessionUserMarkers: (sessionId: string) =>
		requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/user-markers`),
	onSessionMessagesChanged: createSessionMessagesChangedSubscription,
	// Web build has no in-process session LRU cache to report on; stub keeps
	// the "cached" tab badge silently off instead of wiring a server endpoint.
	getSessionCacheStats: () =>
		Promise.resolve({ size: 0, maxSize: 0, cachedSessionIds: [] }),
	evictSessionCache: () => Promise.resolve({ success: true }),
	getChatHistory: (sessionId: string) =>
		postJson("/api/chat/history", { sessionId }),
	generateTitle: (message: string) => postJson("/api/chat/title", { message }),
	getSessionMessages: (sessionId: string) =>
		postJson("/api/chat/messages", { sessionId }),
	getSessionTokenUsage: (sessionId: string) =>
		postJson("/api/chat/token-usage", { sessionId }),
	updateSessionPin: (sessionId: string, isPinned: boolean) =>
		postJson("/api/chat/update-session-pin", { sessionId, isPinned }),
	addSystemMessage: (sessionId: string, message: unknown) =>
		postJson("/api/chat/add-system-message", { sessionId, message }),
	removeFilesChangedMessage: (sessionId: string) =>
		postJson("/api/chat/remove-system-marker", {
			sessionId,
			markerType: "files-changed",
		}),
	removeGitStatusMessage: (sessionId: string) =>
		postJson("/api/chat/remove-system-marker", {
			sessionId,
			markerType: "git-status",
		}),
	removeMessage: (sessionId: string, messageId: string) =>
		postJson("/api/chat/remove-message", { sessionId, messageId }),
	updateMessageThinkingTime: (
		sessionId: string,
		messageId: string,
		thinkingTime: number,
	) =>
		postJson("/api/chat/update-thinking-time", {
			sessionId,
			messageId,
			thinkingTime,
		}),
	emitCommand: (sessionId: string, command: unknown) =>
		postJson(
			`/api/sessions/${encodeURIComponent(sessionId)}/commands`,
			command,
		),
	resumeAfterToolConfirm: (sessionId: string, messageId: string) =>
		postJson(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
			type: "command:resume-after-confirm",
			messageId,
		}),
	abortStream: (sessionId?: string) =>
		postJson("/api/streams/abort", { sessionId }),
	getActiveStreams: () => requestJson("/api/streams/active"),

	getSystemTheme: async () => ({
		success: true,
		theme: getPreferredColorScheme(),
	}),
	onContextSizeUpdated: createContextSizeUpdatedSubscription,
	onContextCompactStarted: createContextCompactStartedSubscription,
	onContextCompactCompleted: createContextCompactCompletedSubscription,
	onSystemThemeChanged: (callback: (theme: "light" | "dark") => void) => {
		const media = window.matchMedia?.("(prefers-color-scheme: dark)");
		if (!media) return () => {};
		const listener = () => callback(getPreferredColorScheme());
		media.addEventListener("change", listener);
		return () => media.removeEventListener("change", listener);
	},

	writeClipboardText: async (text: string) => {
		if (!navigator.clipboard?.writeText) {
			return {
				success: false,
				error: "Clipboard write is not available in this browser.",
			};
		}
		await navigator.clipboard.writeText(text);
		return { success: true };
	},
	openExternal: async (url: string) => {
		if (typeof window === "undefined" || typeof window.open !== "function") {
			return {
				success: false,
				error: "Opening external URLs is not available in this browser.",
			};
		}
		window.open(url, "_blank", "noopener,noreferrer");
		return { success: true };
	},
	showOpenDialog: async () => ({
		canceled: true,
		filePaths: [],
	}),

	onSessionEvent: (callback: (envelope: SessionEventEnvelope) => void) =>
		createEventSourceSubscription("/api/events", "session:event", callback),
	onSessionStream: (callback: (payload: SessionStreamPayload) => void) =>
		createEventSourceSubscription("/api/events", "session:stream", callback),
	onStepAdded: createStepAddedSubscription,
	onStepUpdated: createStepUpdatedSubscription,
	onSkillActivated: createSkillActivatedSubscription,
	onTodoPlanChanged: (callback: (payload: unknown) => void) =>
		createEventSourceSubscription(
			"/api/todo-plan/events",
			"todo-plan:changed",
			callback,
		),

	listSchedulerTasks: () => requestJson("/api/scheduler/tasks"),
	getSchedulerTask: (request: unknown) =>
		postJson("/api/scheduler/tasks/get", request),
	runSchedulerTaskNow: (request: unknown) =>
		postJson("/api/scheduler/tasks/run-now", request),
	setSchedulerTaskEnabled: (request: unknown) =>
		postJson("/api/scheduler/tasks/enabled", request),
	createSchedulerTask: (request: unknown) =>
		postJson("/api/scheduler/tasks", request),
	updateSchedulerTask: (request: unknown) =>
		postJson("/api/scheduler/tasks/update", request),
	deleteSchedulerTask: (request: unknown) =>
		postJson("/api/scheduler/tasks/delete", request),
	listSchedulerRuns: (request: unknown) =>
		postJson("/api/scheduler/runs", request),
	getSchedulerRun: (request: unknown) =>
		postJson("/api/scheduler/runs/get", request),

	// Browsers never expose local file paths.
	getPathForFile: () => "",

	onMenuNewChat: () => () => {},
	onMenuCloseChat: () => () => {},
	onSearchAction: subscribeSearchAction,
};

export function createWebPlatformApi(): PlatformApi {
	refreshWebCapabilities().catch(() => {
		// Keep the conservative startup defaults when the server is unreachable.
	});
	return new Proxy(webApi, {
		get(target, property: string | symbol) {
			if (property in target) return target[property as keyof typeof target];
			if (typeof property === "string") {
				return isSubscriptionMethod(property)
					? unsupportedSubscription(property)
					: unsupported(property);
			}
			return undefined;
		},
	}) as unknown as PlatformApi;
}
