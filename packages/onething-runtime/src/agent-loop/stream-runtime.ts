import {
	agentMessagesFromHistory,
	agentProviderCanRunTurn,
	agentSupportsTools,
	buildAgentLoopRuntime,
	resolveAgentModelCapabilities,
	streamAgentLoopProviderChunks,
	type AgentHistoryMessage,
	type AgentLoopOptions,
	type AgentLoopResult,
	type AgentMessage,
	type AgentModelCapabilities,
	type AgentOutputModality,
	type AgentProvider,
	type AgentProviderStreamChunk,
	type AgentSkillContext,
	type AgentSourceToolDefinition,
	type AgentToolChoice,
} from "@onething/core/agent-loop";
import type { Principal } from "@onething/core/permission";
import {
	agentLoopInitSkills,
	agentLoopSkillContexts,
	buildAgentLoopDirectToolsWithAdapters,
	createCoreId,
	getAgentLoopTransientTail,
	maybeCompactAgentLoopContextWithAdapters,
	planAgentLoopPromptBuildOptions,
	planAgentLoopRuntimePreparation,
	planAgentLoopTools,
	resolveAgentLoopContextBudgetWithRegistry,
	injectPendingAgentLoopMessagesWithAdapters,
	runAgentLoopAfterTurnWithAdapters,
	runAgentLoopBeforeTurnWithAdapters,
	type CoreAgentLoopCompactResultLike,
	type CoreAgentLoopCompactSessionLike,
	type CoreAgentLoopContextBudget,
	type CoreAgentLoopDirectToolMetadataUpdate,
	type CoreAgentLoopDirectToolResultLike,
	type CoreAgentLoopInitSkillSnapshot,
	type CoreAgentLoopPendingMessageAdapters,
	type CoreAgentLoopProviderHostContext,
	type CoreAgentLoopProviderRuntimeConfigLike,
	type CoreAgentLoopRuntimeSessionLike,
	type CoreAgentLoopRuntimeSettingsLike,
	type CoreAgentLoopRuntimeToolSettingsLike,
	type CoreAgentLoopSkillLike,
	type CoreAgentLoopToolSettings,
	type CoreBuildPromptOptions,
	type CoreBuildPromptResult,
	type CorePendingAgentLoopChatMessage,
	type PromptSection,
	type CorePendingAgentLoopInputMessage,
	type CorePromptRequestMessage,
} from "@onething/core/engine";
import type { JsonObject } from "@onething/core";
import {
	createAgentProviderFromRuntime,
	getOnethingAgentLoopThinkingOptions,
	isAgentProviderRuntimeSupported,
	type AgentProviderRuntimeConfig,
	type CreateAgentProviderFromRuntimeOptions,
} from "./providers/index.js";
import { createTurnTraceRecorder } from "../evals/trace-store.js";
import {
	DEFAULT_AGENT_MAX_TURNS,
	type EffectiveAgentProfile,
} from "../agents/profile.js";

export interface OnethingAgentLoopChatSettings {
	maxTokens?: number;
	/**
	 * Model round-trips allowed per run before the loop stops with
	 * finishReason 'max_turns'. The core runner's own default (8) is far too
	 * small for real tool-heavy work — every chat run, not just goal-driven
	 * ones, was silently truncated mid-task with no user-facing signal.
	 */
	maxTurns?: number;
	contextCompactThreshold?: number;
	contextCompactEnabled?: boolean;
	contextCompactKeepRecentTurns?: number;
}

/** Applied when neither the agent profile nor settings.chat.maxTurns says. */
export const DEFAULT_CHAT_MAX_TURNS = DEFAULT_AGENT_MAX_TURNS;

export interface OnethingAgentLoopRuntimeSettings<
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined =
		| CoreAgentLoopRuntimeToolSettingsLike
		| undefined,
> extends CoreAgentLoopRuntimeSettingsLike<TToolSettings> {
	chat?: OnethingAgentLoopChatSettings;
}

export interface OnethingAgentLoopRuntimeContext<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined =
		| CoreAgentLoopRuntimeToolSettingsLike
		| undefined,
> {
	sessionId: string;
	assistantMessageId: string;
	providerId: string;
	providerConfig: TProviderConfig;
	settings: TSettings;
	toolSettings?: TToolSettings;
	requestedOutputModalities?: AgentOutputModality[];
	abortSignal?: AbortSignal;
	steeringQueue?: OnethingAgentLoopPendingMessageQueue;
	followUpQueue?: OnethingAgentLoopPendingMessageQueue;
	voiceConversation?: boolean;
	speakMode?: boolean;
	/**
	 * Forced tool choice for this run's FIRST model call only (W18b). Rides in
	 * from the send-message command; the core runner applies it to iteration 1
	 * and drops it when the model does not advertise forced tool use.
	 */
	initialToolChoice?: AgentToolChoice;
	/** Actor behind this turn; minted at the engine boundary, carried to tools. */
	principal?: Principal;
	/**
	 * The turn's capability profile, resolved ONCE by the assembly layer before
	 * the run starts (product code cannot read the agent store — that would
	 * point the dependency backwards). Absent means "host without agents": the
	 * adapter/settings fallbacks below still apply.
	 */
	agentProfile?: EffectiveAgentProfile;
}

export interface OnethingAgentLoopPendingMessageQueue {
	drain(): CorePendingAgentLoopInputMessage[];
	enqueue?(message: CorePendingAgentLoopInputMessage): void;
}

export interface OnethingAgentLoopProjectPromptVars {
	active?: CoreBuildPromptOptions["activeProject"];
	known?: CoreBuildPromptOptions["knownProjects"];
}

export interface OnethingAgentLoopLogger {
	log?: (...args: unknown[]) => void;
	info?: (...args: unknown[]) => void;
	warn?: (...args: unknown[]) => void;
	error?: (...args: unknown[]) => void;
}

export interface OnethingAgentLoopPromptResult<
	TPromptMessage extends CorePromptRequestMessage = CorePromptRequestMessage,
> extends Omit<CoreBuildPromptResult, "messages"> {
	messages: TPromptMessage[];
}

/**
 * Session-goal hooks (see docs/design/goal-system.md). Hosts without a goal
 * subsystem omit this. All state lives behind the host's GoalManager; the
 * loop only asks "which prompt should I inject" at two points:
 * - recordUsage: per model round; returns the budget wrap-up steering prompt
 *   exactly once when the goal flips to budget_limited
 * - beginContinuation: when the run would end normally; registers one
 *   continuation and returns its prompt, or undefined to let the run end
 */
export interface OnethingAgentLoopGoalHooks {
	recordUsage(
		sessionId: string,
		usage: { totalTokens?: number },
	): string | undefined;
	beginContinuation(sessionId: string): string | undefined;
}

export interface OnethingAgentLoopRuntimeAdapters<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike,
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult,
> {
	getSession(sessionId: string): TSession | null | undefined;
	getSkillsForSession(workingDirectory?: string, agentId?: string): TSkill[];
	initializeTools?(skills: TSkill[]): Promise<void> | void;
	isProviderSupported?(providerId: string): boolean;
	createProvider?(
		providerId: string,
		config: AgentProviderRuntimeConfig,
		hostContext: CoreAgentLoopProviderHostContext,
	): AgentProvider | undefined;
	resolveModelContextLength?(
		model: string,
		providerId: string,
	): number | undefined | Promise<number | undefined>;
	resolveModelMaxOutputTokens?(
		model: string,
		providerId: string,
	): number | undefined | Promise<number | undefined>;
	getEnabledTools(
		toolSettings?: CoreAgentLoopToolSettings["tools"],
	): Promise<TTool[]>;
	getMCPRouterToolDefinition?(): TTool | null;
	/**
	 * Per-agent tool allowlist (tool ids). Return null/undefined for no
	 * restriction. Hosts without agent-scoped tools can omit this. The session
	 * is passed so hosts can narrow further by session kind (e.g. collab room
	 * turns, docs/design/multi-agent-collab.md D5); return [] to disable tools.
	 */
	getAgentToolAllowlist?(
		agentId: string | undefined,
		session?: unknown,
	): Promise<string[] | null | undefined> | string[] | null | undefined;
	buildProjectPromptVars(
		workingDirectory?: string,
	): OnethingAgentLoopProjectPromptVars;
	buildPrompt(
		options: CoreBuildPromptOptions,
	): Promise<OnethingAgentLoopPromptResult<TPromptMessage>>;
	buildHistoryMessages(
		messages: TChatMessage[],
		session: TSession,
	): THistoryMessage[];
	resolvePromptReferences(
		content: string,
		input: {
			session: TSession | null | undefined;
			settings: TSettings;
		},
	): {
		modelContent: string;
		contentParts?: TContentParts;
	};
	persistInjectedChatMessage(
		sessionId: string,
		message: CorePendingAgentLoopChatMessage<TContentParts>,
	): Promise<void> | void;
	emitInjectedUserMessage?(
		sessionId: string,
		message: CorePendingAgentLoopChatMessage<TContentParts>,
	): Promise<void> | void;
	executeToolDirectly(
		toolName: string,
		args: JsonObject,
		context: {
			sessionId: string;
			messageId: string;
			toolCallId: string;
			workingDirectory?: string;
			workingDirectoryRoots?: string[];
			abortSignal?: AbortSignal;
			onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void;
			onPartialResult?: (update: TPartialToolResult) => void;
		},
	): Promise<TToolResult>;
	compactSessionContext(input: {
		sessionId: string;
		providerId: string;
		configWithApiKey: TProviderConfig & { apiKey: string };
		settings: TSettings;
		keepRecentTurns: number;
		onMessageCreated: (message: unknown) => Promise<void>;
		onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>;
	}): Promise<TCompactResult>;
	emitEvent(sessionId: string, event: unknown): Promise<void>;
	shouldSkipProviderUsageMismatch?(input: {
		providerId: string;
		session: TSession;
		modelContextLength: number;
	}): boolean;
	goal?: OnethingAgentLoopGoalHooks;
	logger?: OnethingAgentLoopLogger;
	createId?(): string;
}

export interface OnethingAgentLoopRuntimeHostAdapters<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike,
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult,
> {
	getSession(sessionId: string): TSession | null | undefined;
	getSkillsForSession(workingDirectory?: string, agentId?: string): TSkill[];
	initializeTools?(
		skills: CoreAgentLoopInitSkillSnapshot[],
	): Promise<void> | void;
	isProviderSupported?(providerId: string): boolean;
	createProvider?(
		providerId: string,
		config: AgentProviderRuntimeConfig,
		hostContext: CoreAgentLoopProviderHostContext,
	): AgentProvider | undefined;
	resolveModelContextLength?(
		model: string,
		providerId: string,
	): number | undefined | Promise<number | undefined>;
	resolveModelMaxOutputTokens?(
		model: string,
		providerId: string,
	): number | undefined | Promise<number | undefined>;
	getEnabledTools(
		toolSettings?: CoreAgentLoopToolSettings["tools"],
	): Promise<TTool[]>;
	getMCPRouterToolDefinition?(): TTool | null;
	/**
	 * Per-agent tool allowlist (tool ids). Return null/undefined for no
	 * restriction. Hosts without agent-scoped tools can omit this. The session
	 * is passed so hosts can narrow further by session kind (e.g. collab room
	 * turns, docs/design/multi-agent-collab.md D5); return [] to disable tools.
	 */
	getAgentToolAllowlist?(
		agentId: string | undefined,
		session?: unknown,
	): Promise<string[] | null | undefined> | string[] | null | undefined;
	buildProjectPromptVars(
		workingDirectory?: string,
	): OnethingAgentLoopProjectPromptVars;
	buildPrompt(
		options: CoreBuildPromptOptions,
	): Promise<OnethingAgentLoopPromptResult<TPromptMessage>>;
	buildHistoryMessages(
		messages: TChatMessage[],
		session: TSession,
	): THistoryMessage[];
	resolvePromptReferences(
		content: string,
		input: {
			session: TSession | null | undefined;
			settings: TSettings;
			skills: TSkill[];
		},
	): {
		modelContent: string;
		contentParts?: TContentParts;
	};
	persistInjectedChatMessage(
		sessionId: string,
		message: CorePendingAgentLoopChatMessage<TContentParts>,
	): Promise<void> | void;
	executeToolDirectly(
		toolName: string,
		args: JsonObject,
		context: {
			sessionId: string;
			messageId: string;
			toolCallId: string;
			workingDirectory?: string;
			workingDirectoryRoots?: string[];
			abortSignal?: AbortSignal;
			onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void;
			onPartialResult?: (update: TPartialToolResult) => void;
		},
	): Promise<TToolResult>;
	compactSessionContext(input: {
		sessionId: string;
		providerId: string;
		configWithApiKey: TProviderConfig & { apiKey: string };
		settings: TSettings;
		keepRecentTurns: number;
		onMessageCreated: (message: unknown) => Promise<void>;
		onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>;
	}): Promise<TCompactResult>;
	emitEvent(sessionId: string, event: unknown): Promise<void>;
	shouldSkipProviderUsageMismatch?(input: {
		providerId: string;
		session: TSession;
		modelContextLength: number;
	}): boolean;
	goal?: OnethingAgentLoopGoalHooks;
	logger?: OnethingAgentLoopLogger;
	createId?(): string;
}

export function createOnethingAgentLoopRuntimeAdapters<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike,
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult = unknown,
>(
	host: OnethingAgentLoopRuntimeHostAdapters<
		TSettings,
		TProviderConfig,
		TToolSettings,
		TSession,
		TChatMessage,
		THistoryMessage,
		TPromptMessage,
		TSkill,
		TTool,
		TContentParts,
		TCompactResult,
		TToolResult,
		TPartialToolResult
	>,
): OnethingAgentLoopRuntimeAdapters<
	TSettings,
	TProviderConfig,
	TToolSettings,
	TSession,
	TChatMessage,
	THistoryMessage,
	TPromptMessage,
	TSkill,
	TTool,
	TContentParts,
	TCompactResult,
	TToolResult,
	TPartialToolResult
> {
	return {
		getSession: host.getSession,
		getSkillsForSession: host.getSkillsForSession,
		initializeTools: host.initializeTools
			? (skills) => host.initializeTools?.(agentLoopInitSkills(skills))
			: undefined,
		isProviderSupported: host.isProviderSupported,
		createProvider: host.createProvider,
		resolveModelContextLength: host.resolveModelContextLength,
		resolveModelMaxOutputTokens: host.resolveModelMaxOutputTokens,
		getEnabledTools: host.getEnabledTools,
		getMCPRouterToolDefinition: host.getMCPRouterToolDefinition,
		getAgentToolAllowlist: host.getAgentToolAllowlist,
		buildProjectPromptVars: host.buildProjectPromptVars,
		buildPrompt: host.buildPrompt,
		buildHistoryMessages: host.buildHistoryMessages,
		resolvePromptReferences(content, input) {
			const settingsWithSkills = input.settings as {
				skills?: { enableSkills?: boolean };
			};
			const skillsEnabled = settingsWithSkills.skills?.enableSkills !== false;
			const skills = skillsEnabled
				? host.getSkillsForSession(
					input.session?.workingDirectory,
					input.session?.agentId,
				)
				: [];
			return host.resolvePromptReferences(content, {
				session: input.session,
				settings: input.settings,
				skills,
			});
		},
		persistInjectedChatMessage: host.persistInjectedChatMessage,
		async emitInjectedUserMessage(sessionId, message) {
			try {
				await host.emitEvent(sessionId, {
					type: "message:user-created",
					message,
				});
			} catch (error) {
				host.logger?.error?.(
					"[AgentLoopRuntime] injected message:user-created emit error:",
					error,
				);
			}
		},
		executeToolDirectly: host.executeToolDirectly,
		compactSessionContext: host.compactSessionContext,
		emitEvent: host.emitEvent,
		shouldSkipProviderUsageMismatch: host.shouldSkipProviderUsageMismatch,
		goal: host.goal,
		logger: host.logger,
		createId: host.createId,
	};
}

export type BuildOnethingAgentLoopStreamRuntimeResult<
	TSkill extends CoreAgentLoopSkillLike = CoreAgentLoopSkillLike,
> =
	| {
			supported: false;
			reason: string;
	  }
	| {
			supported: true;
			runtime: AgentLoopOptions;
			systemPrompt: string;
			/** Named prompt sections built for this turn (for hash-based versioning and snapshots). */
			sections: PromptSection[];
			enabledSkills: TSkill[];
			toolNames: string[];
			mcpToolNames: string[];
			hasTools: boolean;
			supportsTools: boolean;
			modelContextLength: number;
			reservedOutputTokens: number;
	  };

export async function maybeCompactOnethingAgentLoopContext<
	TSettings,
	TProviderConfig extends object,
	TSession extends CoreAgentLoopCompactSessionLike,
	TMessage extends AgentMessage,
	TCompactResult extends
		CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
>(options: {
	ctx: {
		sessionId: string;
		providerId: string;
		providerConfig: TProviderConfig;
		settings: TSettings;
	};
	turn: number;
	messages: TMessage[];
	budget: CoreAgentLoopContextBudget;
	compactEnabled: boolean;
	keepRecentTurns: number;
	rebuildMessages: () => Promise<TMessage[]>;
	adapters: {
		getSession(sessionId: string): TSession | null | undefined;
		compactSessionContext(input: {
			sessionId: string;
			providerId: string;
			configWithApiKey: TProviderConfig & { apiKey: string };
			settings: TSettings;
			keepRecentTurns: number;
			onMessageCreated: (message: unknown) => Promise<void>;
			onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>;
		}): Promise<TCompactResult>;
		emitEvent(sessionId: string, event: unknown): Promise<void>;
		shouldSkipProviderUsageMismatch?: (input: {
			providerId: string;
			session: TSession;
			modelContextLength: number;
			inputTokens?: number;
		}) => boolean;
		logger?: OnethingAgentLoopLogger;
	};
}): Promise<TMessage[] | undefined> {
	return maybeCompactAgentLoopContextWithAdapters({
		ctx: options.ctx,
		turn: options.turn,
		messages: options.messages,
		budget: options.budget,
		compactEnabled: options.compactEnabled,
		keepRecentTurns: options.keepRecentTurns,
		adapters: {
			getSession: options.adapters.getSession,
			compactSessionContext: options.adapters.compactSessionContext,
			emitEvent: (sessionId, event) =>
				options.adapters.emitEvent(sessionId, event),
			shouldSkipProviderUsageMismatch:
				options.adapters.shouldSkipProviderUsageMismatch,
			logger: options.adapters.logger,
			rebuildMessages: options.rebuildMessages,
		},
	});
}

export async function buildOnethingAgentLoopStreamRuntime<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike & { messages: TChatMessage[] },
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult = unknown,
>(
	ctx: OnethingAgentLoopRuntimeContext<
		TSettings,
		TProviderConfig,
		TToolSettings
	>,
	historyMessages: THistoryMessage[],
	adapters: OnethingAgentLoopRuntimeAdapters<
		TSettings,
		TProviderConfig,
		TToolSettings,
		TSession,
		TChatMessage,
		THistoryMessage,
		TPromptMessage,
		TSkill,
		TTool,
		TContentParts,
		TCompactResult,
		TToolResult,
		TPartialToolResult
	>,
): Promise<BuildOnethingAgentLoopStreamRuntimeResult<TSkill>> {
	const isSupported =
		adapters.isProviderSupported ?? isAgentProviderRuntimeSupported;
	if (!isSupported(ctx.providerId)) {
		return {
			supported: false,
			reason: `Provider ${ctx.providerId} does not expose an AgentProvider runtime yet`,
		};
	}

	const session = adapters.getSession(ctx.sessionId);
	const preparation = planAgentLoopRuntimePreparation({
		ctx,
		session,
	});
	const sessionWorkingDir = preparation.sessionWorkingDir;
	const sessionWorkingDirRoots = preparation.sessionWorkingDirRoots;
	const enabledSkills = preparation.skillsEnabled
		? adapters.getSkillsForSession(sessionWorkingDir, preparation.agentId)
		: [];
	const effectiveToolSettings = preparation.effectiveToolSettings;

	if (preparation.toolCallsEnabled) {
		await adapters.initializeTools?.(enabledSkills);
	}

	const createProvider =
		adapters.createProvider ??
		((providerId, config, hostContext) =>
			createAgentProviderFromRuntime(
				providerId,
				config,
				hostContext as CreateAgentProviderFromRuntimeOptions,
			));
	const provider = createProvider(
		ctx.providerId,
		preparation.providerRuntimeConfig as AgentProviderRuntimeConfig,
		preparation.providerHostContext,
	);

	if (!provider) {
		return {
			supported: false,
			reason: `Provider ${ctx.providerId} did not create an AgentProvider runtime`,
		};
	}
	if (!agentProviderCanRunTurn(provider)) {
		return {
			supported: false,
			reason: `Provider ${ctx.providerId} AgentProvider runtime does not implement streamTurn or runTurn`,
		};
	}

	const providerCapabilities = await resolveAgentModelCapabilities(
		provider,
		ctx.providerConfig.model,
	);
	const supportsTools = agentSupportsTools(providerCapabilities);
	const toolLoadingEnabled = Boolean(
		preparation.toolCallsEnabled && supportsTools,
	);
	const allEnabledTools = toolLoadingEnabled
		? await adapters.getEnabledTools(effectiveToolSettings?.tools)
		: [];
	const mcpRouterTool = toolLoadingEnabled
		? (adapters.getMCPRouterToolDefinition?.() ?? null)
		: null;
	// The profile snapshot is authoritative when the host resolved one: it was
	// computed from the same agent the prompt was built from, so a mid-turn
	// agent edit cannot hand this run a new prompt with an old allowlist.
	const agentToolAllowlist = !toolLoadingEnabled
		? null
		: ctx.agentProfile
			? ctx.agentProfile.tools
			: await adapters.getAgentToolAllowlist?.(preparation.agentId, session);
	const toolPlan = planAgentLoopTools({
		toolLoadingEnabled,
		allEnabledTools,
		mcpRouterTool,
		toolSettings: effectiveToolSettings,
		allowedToolIds: agentToolAllowlist,
	});
	const projectVars = adapters.buildProjectPromptVars(sessionWorkingDir);
	const budget = await resolveOnethingAgentLoopContextBudget(
		ctx,
		providerCapabilities,
		adapters,
	);
	const buildPromptForHistory = async (
		nextHistoryMessages: THistoryMessage[],
	) =>
		adapters.buildPrompt(
			planAgentLoopPromptBuildOptions({
				ctx: {
					sessionId: ctx.sessionId,
					providerId: ctx.providerId,
					providerConfig:
						ctx.providerConfig as unknown as CoreBuildPromptOptions["providerConfig"],
					settings: ctx.settings,
					voiceConversation: ctx.voiceConversation,
					speakMode: ctx.speakMode,
				},
				agentId: preparation.agentId,
				hasTools: toolPlan.hasTools,
				skills: enabledSkills,
				workingDirectory: sessionWorkingDir,
				workingDirectoryRoots: sessionWorkingDirRoots,
				activeProject: projectVars.active,
				knownProjects: projectVars.known,
				toolNames: toolPlan.toolNames,
				mcpToolNames: toolPlan.mcpToolNames,
				historyMessages: nextHistoryMessages,
			}),
		);
	const requestMessages = await buildPromptForHistory(historyMessages);

	const rebuildAgentMessagesFromSession = async (
		messages: AgentMessage[],
	): Promise<AgentMessage[]> => {
		const latestSession = adapters.getSession(ctx.sessionId);
		if (!latestSession) return messages;

		const rebuiltHistory = adapters.buildHistoryMessages(
			latestSession.messages,
			latestSession,
		);
		const rebuiltPrompt = await buildPromptForHistory(rebuiltHistory);
		return [
			...agentMessagesFromHistory(
				rebuiltPrompt.messages as AgentHistoryMessage[],
				providerCapabilities,
			),
			...getAgentLoopTransientTail(messages),
		];
	};

	const pendingMessageAdapters = createPendingAgentLoopMessageAdapters(
		ctx,
		adapters,
	);
	const turnQueueAdapters = {
		drainSteeringMessages: (): CorePendingAgentLoopInputMessage[] => {
			const drained = ctx.steeringQueue?.drain() ?? [];
			// Consumed messages are no longer retractable — tell the UI so it
			// drops the withdraw affordance on those persisted user messages.
			const messageIds = drained
				.map((message) => message.id)
				.filter((id): id is string => Boolean(id));
			if (messageIds.length > 0) {
				void adapters.emitEvent(ctx.sessionId, {
					type: "steering:consumed",
					messageIds,
				});
			}
			return drained;
		},
		drainFollowUpMessages: (): CorePendingAgentLoopInputMessage[] =>
			ctx.followUpQueue?.drain() ?? [],
	};
	const turnCompactionAdapters = {
		getSession: adapters.getSession,
		compactSessionContext: adapters.compactSessionContext,
		emitEvent: (sessionId: string, event: unknown) =>
			adapters.emitEvent(sessionId, event),
		shouldSkipProviderUsageMismatch: adapters.shouldSkipProviderUsageMismatch,
		logger: adapters.logger,
	};

	const thinkingOptions = getOnethingAgentLoopThinkingOptions(ctx);
	const executeToolDirectlyWithFreshSession = (
		toolName: string,
		args: JsonObject,
		toolContext: {
			sessionId: string;
			messageId: string;
			toolCallId: string;
			workingDirectory?: string;
			workingDirectoryRoots?: string[];
			abortSignal?: AbortSignal;
			onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void;
			onPartialResult?: (update: TPartialToolResult) => void;
		},
	) => {
		const latestSession = adapters.getSession(ctx.sessionId);
		return adapters.executeToolDirectly(toolName, args, {
			...toolContext,
			workingDirectory:
				latestSession?.workingDirectory ?? toolContext.workingDirectory,
			workingDirectoryRoots:
				latestSession?.workingDirectoryRoots ??
				toolContext.workingDirectoryRoots,
		});
	};

	const turnTraceRecorder = createTurnTraceRecorder({
		sessionId: ctx.sessionId,
		turnId: ctx.assistantMessageId,
	});

	const runtime = await buildAgentLoopRuntime({
		provider,
		model: ctx.providerConfig.model,
		messages: agentMessagesFromHistory(
			requestMessages.messages as AgentHistoryMessage[],
			providerCapabilities,
		),
		requestedOutputModalities: ctx.requestedOutputModalities,
		sessionId: ctx.sessionId,
		messageId: ctx.assistantMessageId,
		workingDirectory: sessionWorkingDir,
		abortSignal: ctx.abortSignal,
		maxTurns:
			ctx.agentProfile?.maxTurns ??
			ctx.settings.chat?.maxTurns ??
			DEFAULT_CHAT_MAX_TURNS,
		maxTokens: budget.reservedOutputTokens,
		thinking: thinkingOptions.thinking,
		reasoningEffort: thinkingOptions.reasoningEffort,
		// First model call only — see AgentLoopOptions.initialToolChoice. A
		// standing 'required' would make every round owe another tool call and
		// the run could never end on its own.
		initialToolChoice: ctx.initialToolChoice,
		tools: {
			tools: buildAgentLoopDirectToolsWithAdapters({
				definitions: toolPlan.modelToolDefinitions,
				context: {
					sessionId: ctx.sessionId,
					messageId: ctx.assistantMessageId,
					workingDirectory: sessionWorkingDir,
					workingDirectoryRoots: sessionWorkingDirRoots,
					abortSignal: ctx.abortSignal,
					principal: ctx.principal,
				},
				executeToolDirectly: executeToolDirectlyWithFreshSession,
			}),
			policy: { enabled: toolPlan.hasTools },
		},
		skills: agentLoopSkillContexts(enabledSkills) as AgentSkillContext[],
		prompt: {
			injectSkills: false,
		},
		beforeTurn: async ({ turn, messages }) => {
			const replacement = await runAgentLoopBeforeTurnWithAdapters({
				ctx: compactContext(ctx),
				turn,
				messages,
				budget,
				compactEnabled: ctx.settings.chat?.contextCompactEnabled !== false,
				keepRecentTurns: ctx.settings.chat?.contextCompactKeepRecentTurns ?? 6,
				rebuildMessages: (nextMessages) =>
					rebuildAgentMessagesFromSession(nextMessages as AgentMessage[]),
				adapters: {
					...pendingMessageAdapters,
					...turnQueueAdapters,
					...turnCompactionAdapters,
				},
			});
			if (!replacement) return undefined;
			return {
				messages: replacement.messages as AgentMessage[],
				startNewResponse: replacement.startNewResponse,
			};
		},
		afterTurn: async ({ messages }) => {
			const replacementMessages = await runAgentLoopAfterTurnWithAdapters({
				messages,
				adapters: {
					...pendingMessageAdapters,
					...turnQueueAdapters,
				},
			});
			if (replacementMessages) {
				return replacementMessages as AgentMessage[] | undefined;
			}
			// Goal continuation: only when nothing else (steering / queued user
			// messages) wants the turn — user input always wins over the goal.
			const continuationPrompt = adapters.goal?.beginContinuation(
				ctx.sessionId,
			);
			if (!continuationPrompt) return undefined;
			const withContinuation = await injectPendingAgentLoopMessagesWithAdapters({
				messages,
				pendingMessages: [
					{
						content: continuationPrompt,
						source: "goal",
						timestamp: Date.now(),
						origin: goalInjectionOrigin(),
					},
				],
				adapters: pendingMessageAdapters,
			});
			return withContinuation as AgentMessage[] | undefined;
		},
		// L1 tracing: record every round's exact (request, response) pair —
		// ground truth for "why did the model do this". Serialization is
		// synchronous (the live array mutates right after), writes are queued
		// off the request path.
		onTurnTrace: (event) => {
			turnTraceRecorder.record({
				turn: event.turn,
				request: event.request,
				response: {
					message: event.response.message,
					finishReason: event.response.finishReason,
					usage: event.response.usage,
				},
				toolResultMessages: event.toolResultMessages,
			});
			// Goal accounting rides the same per-round observation point. When
			// the budget flips, the wrap-up notice goes through the steering
			// queue so the next round sees it (injected exactly once).
			const budgetLimitPrompt = adapters.goal?.recordUsage(ctx.sessionId, {
				totalTokens: event.response.usage?.totalTokens,
			});
			if (budgetLimitPrompt) {
				ctx.steeringQueue?.enqueue?.({
					content: budgetLimitPrompt,
					source: "goal",
					timestamp: Date.now(),
					origin: goalInjectionOrigin(),
				});
			}
		},
	});

	return {
		supported: true,
		runtime,
		systemPrompt: requestMessages.systemPrompt,
		sections: requestMessages.sections ?? [],
		enabledSkills,
		toolNames: toolPlan.toolNames,
		mcpToolNames: toolPlan.mcpToolNames,
		hasTools: toolPlan.hasTools,
		supportsTools,
		modelContextLength: budget.modelContextLength,
		reservedOutputTokens: budget.reservedOutputTokens,
	};
}

export async function* streamOnethingAgentLoopChunks<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike & { messages: TChatMessage[] },
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult = unknown,
>(
	ctx: OnethingAgentLoopRuntimeContext<
		TSettings,
		TProviderConfig,
		TToolSettings
	>,
	historyMessages: THistoryMessage[],
	adapters: OnethingAgentLoopRuntimeAdapters<
		TSettings,
		TProviderConfig,
		TToolSettings,
		TSession,
		TChatMessage,
		THistoryMessage,
		TPromptMessage,
		TSkill,
		TTool,
		TContentParts,
		TCompactResult,
		TToolResult,
		TPartialToolResult
	>,
): AsyncGenerator<AgentProviderStreamChunk, AgentLoopResult, void> {
	const prepared = await buildOnethingAgentLoopStreamRuntime(
		ctx,
		historyMessages,
		adapters,
	);
	if (!prepared.supported) {
		throw new Error(prepared.reason);
	}

	return yield* streamAgentLoopProviderChunks(prepared.runtime);
}

async function resolveOnethingAgentLoopContextBudget<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike,
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult,
>(
	ctx: OnethingAgentLoopRuntimeContext<
		TSettings,
		TProviderConfig,
		TToolSettings
	>,
	capabilities: AgentModelCapabilities | undefined,
	adapters: OnethingAgentLoopRuntimeAdapters<
		TSettings,
		TProviderConfig,
		TToolSettings,
		TSession,
		TChatMessage,
		THistoryMessage,
		TPromptMessage,
		TSkill,
		TTool,
		TContentParts,
		TCompactResult,
		TToolResult,
		TPartialToolResult
	>,
): Promise<CoreAgentLoopContextBudget> {
	const result = await resolveAgentLoopContextBudgetWithRegistry({
		capabilities,
		providerId: ctx.providerId,
		providerConfig: ctx.providerConfig,
		chatMaxTokens: ctx.settings.chat?.maxTokens,
		contextCompactThreshold: ctx.settings.chat?.contextCompactThreshold,
		resolveModelContextLength: adapters.resolveModelContextLength,
		resolveModelMaxOutputTokens: adapters.resolveModelMaxOutputTokens,
	});

	if (result.error) {
		adapters.logger?.warn?.(
			"[AgentLoopRuntime] Failed to resolve model context budget:",
			result.error,
		);
	}
	return result.budget;
}

/**
 * Origin stamped on goal-injected messages. They persist as regular user
 * messages (history rebuilds must replay them byte-identically), and the
 * renderer folds them into a compact "goal continuation" line by matching
 * origin.source === 'goal'.
 */
function goalInjectionOrigin(): {
	transport: "api";
	source: "goal";
	receivedAt: number;
} {
	return { transport: "api", source: "goal", receivedAt: Date.now() };
}

function createPendingAgentLoopMessageAdapters<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
	TSession extends CoreAgentLoopRuntimeSessionLike &
		CoreAgentLoopCompactSessionLike,
	TChatMessage,
	THistoryMessage extends CorePromptRequestMessage,
	TPromptMessage extends CorePromptRequestMessage,
	TSkill extends CoreAgentLoopSkillLike,
	TTool extends AgentSourceToolDefinition,
	TContentParts,
	TCompactResult extends CoreAgentLoopCompactResultLike,
	TToolResult extends CoreAgentLoopDirectToolResultLike,
	TPartialToolResult,
>(
	ctx: OnethingAgentLoopRuntimeContext<
		TSettings,
		TProviderConfig,
		TToolSettings
	>,
	adapters: OnethingAgentLoopRuntimeAdapters<
		TSettings,
		TProviderConfig,
		TToolSettings,
		TSession,
		TChatMessage,
		THistoryMessage,
		TPromptMessage,
		TSkill,
		TTool,
		TContentParts,
		TCompactResult,
		TToolResult,
		TPartialToolResult
	>,
): CoreAgentLoopPendingMessageAdapters<TContentParts> {
	return {
		createPendingMessageId: adapters.createId ?? createCoreId,
		resolvePromptReferences: (content) => {
			const session = adapters.getSession(ctx.sessionId);
			return adapters.resolvePromptReferences(content, {
				session,
				settings: ctx.settings,
			});
		},
		persistInjectedChatMessage: async (injectedMessage) => {
			await adapters.persistInjectedChatMessage(ctx.sessionId, injectedMessage);
			await adapters.emitInjectedUserMessage?.(ctx.sessionId, injectedMessage);
		},
	};
}

function compactContext<
	TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
	TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
	TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
>(
	ctx: OnethingAgentLoopRuntimeContext<
		TSettings,
		TProviderConfig,
		TToolSettings
	>,
) {
	return {
		sessionId: ctx.sessionId,
		providerId: ctx.providerId,
		providerConfig: ctx.providerConfig,
		settings: ctx.settings,
	};
}

export { agentLoopInitSkills };
export type { CoreAgentLoopContextBudget as OnethingAgentLoopContextBudget };
