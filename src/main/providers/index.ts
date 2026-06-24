/**
 * Provider facade
 *
 * AgentProvider runtimes are the chat execution path.
 *
 * ADDING A NEW PROVIDER:
 * 1. Create a new file in src/main/providers/builtin/ (e.g., myprovider.ts)
 * 2. Export it from src/main/providers/builtin/index.ts
 * 3. Register an AgentProvider runtime in src/main/agent-loop/providers/factory.ts
 *
 * The runtime route tests fail if a built-in provider lacks a native route.
 */

import type { ThinkingEffort } from "../../shared/ipc.js";
import { toJsonObject, type JsonValue } from "../../shared/json.js";
import {
	initializeRegistry,
	getAvailableProviders as getProvidersFromRegistry,
	getProviderInfo as getInfoFromRegistry,
	isProviderSupported as isSupportedFromRegistry,
	requiresSystemMerge as requiresSystemMergeFromRegistry,
	requiresOAuth as requiresOAuthFromRegistry,
} from "./registry.js";
import type {
	ProviderConfig,
	ProviderInfo,
} from "./types.js";
import { oauthManager } from "../providers/auth/oauth-manager.js";
import { createAIToolName } from "./tool-name-alias.js";
import {
	dumpProviderRequest,
	type ProviderRequestDumpMode,
} from "./request-dump.js";
import { ACPManager } from "../acp/index.js";
import {
	DEEPSEEK_PROVIDER_ID,
	createDeepSeekAgentRuntimeProvider,
	isACPProviderRuntime as isACPProvider,
	resolveProviderRuntimeRoute,
	type AgentRuntimeProviderConfig,
	type ProviderToolDefinitionMap,
	type ProviderToolSourceDefinition,
} from "./agent-runtime.js";
import {
	agentContentToText,
	collectAgentTurnFromStream,
	streamAgentProviderTurnEvents,
} from "../agent-loop/stream.js";
import { agentModelToolsFromDefinitions } from "../agent-loop/tools.js";
import { agentEventsToProviderStreamChunks } from "../agent-loop/provider-stream.js";
import type {
	AgentContentPart,
	AgentJsonObject,
	AgentMessage,
	AgentMessageContent,
	AgentProvider,
	AgentTool,
	AgentTurnRequest,
} from "../agent-loop/types.js";

type RuntimeProviderConfig = ProviderConfig & AgentRuntimeProviderConfig;

export type {
	ProviderExecutableToolDefinition,
	ProviderToolDefinitionInput,
	ProviderToolDefinitionMap,
	ProviderToolParameter,
	ProviderToolSourceDefinition,
} from "./agent-runtime.js";

type DeepSeekRuntimeConfig = {
	apiKey?: string;
	baseUrl?: string;
	model: string;
};

type ProviderOpaqueValue = JsonValue | object;

type ChatGenerationOptions = {
	temperature?: number;
	maxTokens?: number;
	abortSignal?: AbortSignal;
	/** Explicit thinking toggle for provider-native reasoning controls. */
	thinking?: boolean;
	/** Provider-specific thinking effort. */
	thinkingEffort?: ThinkingEffort;
	/** Provider-specific service tier, used by Codex speed controls. */
	serviceTier?: string;
	/** Optional request dump label for utility calls. */
	debugPurpose?: string;
	/** Optional session correlation written to provider request dump files. */
	debugSessionId?: string;
};

// Multimodal content type for provider messages.
export type AIMessageContent =
	| string
	| Array<
			| { type: "text"; text: string }
			| { type: "image"; image: string; mediaType?: string }
			| { type: "file"; data: string; mediaType: string }
	  >;

type ProviderRawPrimitive = string | number | boolean | null | undefined;
type ProviderRawRecord = { [key: string]: ProviderRawValue };
type ProviderRawValue =
	| ProviderRawPrimitive
	| ProviderRawRecord
	| ProviderRawValue[]
	| Error
	| object;
// Format messages for logging without full base64 data
function recordFromValue(value: ProviderRawValue): ProviderRawRecord {
	return value && typeof value === "object" ? value as ProviderRawRecord : {};
}

// Initialize registry on module load
initializeRegistry();

// Re-export types
export type {
	ProviderInfo,
	ProviderConfig,
	ProviderDefinition,
} from "./types.js";

/**
 * Get list of all available providers
 */
export function getAvailableProviders(): ProviderInfo[] {
	return getProvidersFromRegistry();
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(providerId: string): ProviderInfo | undefined {
	return getInfoFromRegistry(providerId);
}

/**
 * Check if a provider is supported
 * Note: Custom providers (starting with 'custom-') are always supported
 */
export function isProviderSupported(providerId: string): boolean {
	return isSupportedFromRegistry(providerId);
}

/**
 * Check if a provider requires OAuth authentication
 */
export function requiresOAuth(providerId: string): boolean {
	return requiresOAuthFromRegistry(providerId);
}

/**
 * Get OAuth config for an OAuth provider
 * Returns the OAuth token as apiKey for providers that support it
 */
export async function getOAuthProviderConfig(
	providerId: string,
	baseConfig: { baseUrl?: string; model?: string },
): Promise<{ apiKey: string; baseUrl?: string } | null> {
	if (!requiresOAuth(providerId)) {
		return null;
	}

	try {
		const token = await oauthManager.refreshTokenIfNeeded(providerId);
		if (!token) {
			return null;
		}

		return {
			apiKey: token.accessToken,
			baseUrl: baseConfig.baseUrl,
		};
	} catch (error) {
		console.error(`Failed to get OAuth config for ${providerId}:`, error);
		return null;
	}
}

/**
 * Tool call information from AI response
 */
export interface AIToolCall {
	toolCallId: string;
	toolName: string;
	args: AgentJsonObject;
}

/**
 * Chat response result with optional reasoning/thinking content
 */
export interface ChatResponseResult {
	text: string;
	reasoning?: string; // Thinking/reasoning process if available
	toolCalls?: AIToolCall[]; // Tool calls made by the assistant
}

/**
 * Stream chunk types for tool-enabled responses
 * Includes streaming tool input chunks for real-time parameter display
 */
export interface StreamChunkWithTools {
	type:
		| "text"
		| "reasoning"
		| "tool-call"
		| "tool-result"
		| "finish"
		| "tool-input-start"
		| "tool-input-delta"
		| "tool-input-end"
		| "provider-data";
	text?: string;
	reasoning?: string;
	toolCall?: AIToolCall;
		toolResult?: {
			toolCallId: string;
			result: ProviderOpaqueValue;
		};
	/** Streaming tool input - start event */
	toolInputStart?: { toolCallId: string; toolName: string };
	/** Streaming tool input - incremental JSON delta */
	toolInputDelta?: { toolCallId: string; argsTextDelta: string };
	/** Streaming tool input - end event */
	toolInputEnd?: { toolCallId: string };
	/** Finish reason from AI model - used for loop control */
	finishReason?:
		| "stop"
		| "length"
		| "tool-calls"
		| "content-filter"
		| "error"
		| "other"
		| "unknown";
	providerData?:
		| {
				provider: "codex";
				type: "encrypted-reasoning";
				encryptedContent: string;
		  }
		| {
				provider: "codex";
				type: "image-generation-start";
				callId: string;
				status?: string;
		  }
		| {
				provider: "codex";
				type: "image-generation-result";
				callId: string;
				status: string;
				revisedPrompt?: string;
				result: string;
		  };
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
}

function stringifyMessageContent(content: AIMessageContent): string {
	if (content == null) return "";
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content);
	return content
		.map((part) => {
			const record = recordFromValue(part);
			if (record.type === "text" && typeof record.text === "string") {
				return record.text;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function agentContentFromAIMessageContent(content: AIMessageContent): AgentMessageContent {
	if (content == null || typeof content === "string") return content ?? "";
	if (!Array.isArray(content)) return stringifyMessageContent(content);

	const parts: AgentContentPart[] = [];
	for (const part of content) {
		const record = recordFromValue(part);
		if (record.type === "text" && typeof record.text === "string" && record.text) {
			parts.push({ type: "text", text: record.text });
			continue;
		}
		if (record.type === "image" && typeof record.image === "string" && record.image) {
			parts.push({
				type: "image",
				image: record.image,
				...(typeof record.mediaType === "string"
					? { mediaType: record.mediaType }
					: {}),
			});
			continue;
		}
			if (
				part?.type === "file" &&
				typeof part.data === "string" &&
				typeof part.mediaType === "string"
			) {
			parts.push({
					type: "file",
					data: part.data,
					mediaType: part.mediaType,
					...(typeof record.filename === "string"
						? { filename: record.filename }
						: {}),
				});
			}
		}

	return parts.length > 0 ? parts : stringifyMessageContent(content);
}

function isDeepSeekThinkingModel(modelId: string): boolean {
	const lower = modelId.toLowerCase();
	return (
		lower.includes("reasoner") ||
		lower.includes("thinking") ||
		/(^|[^a-z])v4/.test(lower)
	);
}

function normalizeDeepSeekAgentReasoningEffort(
	value: ThinkingEffort | undefined,
): "high" | "max" | undefined {
	if (value === "high" || value === "max") return value;
	if (value === "low" || value === "medium") return "high";
	if (value === "xhigh") return "max";
	return undefined;
}

function resolveDeepSeekAgentThinking(
	modelId: string,
	options: Pick<ChatGenerationOptions, "thinking">,
): "enabled" | "disabled" | undefined {
	if (options.thinking === true) return "enabled";
	if (options.thinking === false) return "disabled";
	if (isDeepSeekThinkingModel(modelId)) return "enabled";
	return undefined;
}

function stringifyToolOutput(output: ProviderOpaqueValue): string {
	if (output == null) return "";
	if (typeof output === "string") return output;
	try {
		return JSON.stringify(output);
	} catch {
		return String(output);
	}
}

interface DeepSeekToolResultItem {
	toolCallId?: string;
	result?: ProviderOpaqueValue;
}

type DeepSeekAgentSourceMessage =
	| {
			role: "tool";
			content: DeepSeekToolResultItem[];
	  }
	| {
			role: "user" | "system" | "developer" | "assistant";
			content?: AIMessageContent;
			reasoningContent?: string;
			toolCalls?: Array<{
				toolCallId: string;
				toolName: string;
				args: AgentJsonObject;
			}>;
	  };

function deepSeekAgentMessagesFromMessages(messages: DeepSeekAgentSourceMessage[]): AgentMessage[] {
	const result: AgentMessage[] = [];

	for (const message of messages) {
		if (message.role === "tool") {
			for (const item of message.content) {
				result.push({
					role: "tool",
					toolCallId: item.toolCallId ?? "",
					content: stringifyToolOutput(item.result ?? null),
				});
			}
			continue;
		}

		if (message.role === "assistant") {
			result.push({
				role: "assistant",
				content:
					message.content === null || message.content === undefined
						? null
						: stringifyMessageContent(message.content as AIMessageContent),
				...(message.reasoningContent
					? { reasoningContent: message.reasoningContent }
					: {}),
				...(message.toolCalls?.length
					? {
							toolCalls: message.toolCalls.map((toolCall) => ({
								id: toolCall.toolCallId,
								name: toolCall.toolName,
								arguments: JSON.stringify(toolCall.args ?? {}),
							})),
						}
					: {}),
			});
			continue;
		}

		if (
			message.role === "system" ||
			message.role === "developer" ||
			message.role === "user"
		) {
			result.push({
				role: message.role === "user" ? "user" : "system",
				content: stringifyMessageContent(message.content as AIMessageContent),
			});
		}
	}

	return result;
}

function utilityAgentMessagesFromMessages(
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
): AgentMessage[] {
	return messages.map((message): AgentMessage => ({
		role: message.role,
		content: agentContentFromAIMessageContent(message.content),
		...(message.reasoningContent
			? { reasoningContent: message.reasoningContent }
			: {}),
	}));
}

function agentMessagesFromToolChatMessages(messages: ToolChatMessage[]): AgentMessage[] {
	const result: AgentMessage[] = [];

	for (const message of messages) {
		if (message.role === "tool") {
			for (const item of message.content) {
				result.push({
					role: "tool",
					toolCallId: item.toolCallId,
					content: stringifyToolOutput(item.result),
				});
			}
			continue;
		}

		if (message.role === "assistant") {
			result.push({
				role: "assistant",
				content: agentContentFromAIMessageContent(message.content),
				...(message.reasoningContent
					? { reasoningContent: message.reasoningContent }
					: {}),
				...(message.toolCalls?.length
					? {
							toolCalls: message.toolCalls.map(toolCall => ({
								id: toolCall.toolCallId,
								name: toolCall.toolName,
								arguments: JSON.stringify(toolCall.args ?? {}),
							})),
						}
					: {}),
			});
			continue;
		}

		result.push({
			role: message.role === "user" ? "user" : "system",
			content: agentContentFromAIMessageContent(message.content),
		});
	}

	return result;
}

function normalizeAgentReasoningEffort(
	value: ThinkingEffort | undefined,
): AgentTurnRequest["reasoningEffort"] {
	if (value === "max" || value === "xhigh") return "max";
	if (value === "high" || value === "medium" || value === "low") return "high";
	return undefined;
}

function utilityAgentThinking(
	options: Pick<ChatGenerationOptions, "thinking">,
): AgentTurnRequest["thinking"] {
	if (options.thinking === true) return "enabled";
	if (options.thinking === false) return "disabled";
	return undefined;
}

async function dumpUtilityAgentRequest(options: {
	providerId: string;
	config: RuntimeProviderConfig;
	messages: AgentMessage[];
	tools?: AgentTool[];
	toolChoice?: "auto" | "none";
	temperature?: number;
	maxTokens?: number;
	thinking?: AgentTurnRequest["thinking"];
	reasoningEffort?: AgentTurnRequest["reasoningEffort"];
		mode: ProviderRequestDumpMode;
		metadata?: ProviderRawRecord;
}): Promise<void> {
	await dumpProviderRequest({
		providerId: options.providerId,
		model: options.config.model,
		mode: options.mode,
		metadata: {
			...options.metadata,
			transport: "agent-provider",
		},
		requestBody: {
			model: options.config.model,
			messages: options.messages,
			stream: true,
			tools: options.tools?.length
				? options.tools.map((tool) => ({
						type: "function",
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.parameters,
						},
					}))
				: undefined,
			tool_choice: options.toolChoice ?? "none",
			temperature: options.temperature,
			max_tokens: options.maxTokens,
			thinking: options.thinking,
			reasoning_effort: options.reasoningEffort,
		},
	});
}

async function runUtilityAgentTurn(
	providerId: string,
	provider: AgentProvider,
	config: RuntimeProviderConfig,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
	options: ChatGenerationOptions,
	mode: ProviderRequestDumpMode,
): Promise<ChatResponseResult | undefined> {
	const agentMessages = utilityAgentMessagesFromMessages(messages);
	const thinking = utilityAgentThinking(options);
	const reasoningEffort = normalizeAgentReasoningEffort(options.thinkingEffort);
	const maxTokens = options.maxTokens || 4096;

	await dumpUtilityAgentRequest({
		providerId,
		config,
		messages: agentMessages,
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		mode,
		metadata: options.debugPurpose || options.debugSessionId
			? {
					purpose: options.debugPurpose,
					sessionId: options.debugSessionId,
				}
			: undefined,
	});

	const request: AgentTurnRequest = {
		model: config.model,
		messages: agentMessages,
		toolChoice: "none",
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		abortSignal: options.abortSignal,
		turn: 1,
	};
	const turn = await collectAgentTurnFromStream(
		streamAgentProviderTurnEvents(provider, request),
	);

	return {
		text: agentContentToText(turn.message.content),
		reasoning: turn.message.reasoningContent || undefined,
		toolCalls: turn.message.toolCalls?.map(toolCall => ({
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: (() => {
				try {
					const parsed = JSON.parse(toolCall.arguments || "{}");
					return parsed && typeof parsed === "object" && !Array.isArray(parsed)
						? parsed
						: {};
				} catch {
					return {};
				}
			})(),
		})),
	};
}

async function* streamUtilityAgentTurn(
	providerId: string,
	provider: AgentProvider,
	config: RuntimeProviderConfig,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
	options: ChatGenerationOptions,
	mode: ProviderRequestDumpMode,
): AsyncGenerator<ReasoningStreamChunk, void, void> {
	const agentMessages = utilityAgentMessagesFromMessages(messages);
	const thinking = utilityAgentThinking(options);
	const reasoningEffort = normalizeAgentReasoningEffort(options.thinkingEffort);
	const maxTokens = options.maxTokens || 4096;

	await dumpUtilityAgentRequest({
		providerId,
		config,
		messages: agentMessages,
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		mode,
		metadata: options.debugPurpose || options.debugSessionId
			? {
					purpose: options.debugPurpose,
					sessionId: options.debugSessionId,
				}
			: undefined,
	});

	const request: AgentTurnRequest = {
		model: config.model,
		messages: agentMessages,
		toolChoice: "none",
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		abortSignal: options.abortSignal,
		turn: 1,
	};

	for await (const event of streamAgentProviderTurnEvents(provider, request)) {
		if (event.type === "reasoning-delta" && event.delta) {
			yield { type: "text", text: "", reasoning: event.delta };
		} else if (event.type === "text-delta" && event.delta) {
			yield { type: "text", text: event.delta };
		} else if (event.type === "finish") {
			yield {
				type: "finish",
				usage: event.usage ?? {
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
				},
			};
		}
	}
}

async function* streamAgentProviderToolTurn(
	providerId: string,
	provider: AgentProvider,
	config: RuntimeProviderConfig,
	messages: ToolChatMessage[],
	tools: ProviderToolDefinitionMap,
	options: {
		temperature?: number;
		maxTokens?: number;
		abortSignal?: AbortSignal;
		thinking?: boolean;
		thinkingEffort?: ThinkingEffort;
		debugSessionId?: string;
		debugTurn?: number;
	},
): AsyncGenerator<StreamChunkWithTools, void, void> {
	const agentMessages = agentMessagesFromToolChatMessages(messages);
	const agentTools = agentModelToolsFromDefinitions(tools);
	const thinking = utilityAgentThinking(options);
	const reasoningEffort = normalizeAgentReasoningEffort(options.thinkingEffort);
	const maxTokens = options.maxTokens || 4096;

	await dumpUtilityAgentRequest({
		providerId,
		config,
		messages: agentMessages,
		tools: agentTools,
		toolChoice: agentTools.length > 0 ? "auto" : "none",
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		mode: "stream-tools",
		metadata: {
			sessionId: options.debugSessionId,
			turn: options.debugTurn,
			originalMessageCount: messages.length,
			convertedMessageCount: agentMessages.length,
		},
	});

	const events = streamAgentProviderTurnEvents(provider, {
		model: config.model,
		messages: agentMessages,
		tools: agentTools,
		toolChoice: agentTools.length > 0 ? "auto" : "none",
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		abortSignal: options.abortSignal,
		turn: options.debugTurn ?? 1,
	});

	for await (const chunk of agentEventsToProviderStreamChunks(events)) {
		if (chunk.type === "turn-start" || chunk.type === "tool-metadata" || chunk.type === "tool-partial-result") {
			continue;
		}
		yield chunk;
	}
}

async function dumpDeepSeekAgentRequest(options: {
	config: DeepSeekRuntimeConfig;
	messages: AgentMessage[];
	tools?: AgentTool[];
	temperature?: number;
	maxTokens?: number;
	thinking?: "enabled" | "disabled";
	reasoningEffort?: "high" | "max";
		mode: ProviderRequestDumpMode;
		metadata?: ProviderRawRecord;
}): Promise<void> {
	await dumpProviderRequest({
		providerId: DEEPSEEK_PROVIDER_ID,
		model: options.config.model,
		mode: options.mode,
		metadata: options.metadata,
		requestBody: {
			model: options.config.model,
			messages: options.messages,
			stream: true,
			stream_options: { include_usage: true },
			tools: options.tools?.length
				? options.tools.map((tool) => ({
						type: "function",
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.parameters,
						},
					}))
				: undefined,
			tool_choice: options.tools?.length ? "auto" : undefined,
			temperature:
				options.thinking === "enabled" ? undefined : options.temperature,
			max_tokens: options.maxTokens,
			thinking: options.thinking ? { type: options.thinking } : undefined,
			reasoning_effort:
				options.thinking === "enabled" ? options.reasoningEffort : undefined,
		},
	});
}

async function generateWithDeepSeekAgent(
	config: DeepSeekRuntimeConfig,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
	options: ChatGenerationOptions = {},
): Promise<ChatResponseResult> {
	const agentMessages = deepSeekAgentMessagesFromMessages(messages);
	const maxTokens = options.maxTokens || 4096;
	const thinking = resolveDeepSeekAgentThinking(config.model, options);
	const reasoningEffort = normalizeDeepSeekAgentReasoningEffort(
		options.thinkingEffort,
	);

	await dumpDeepSeekAgentRequest({
		config,
		messages: agentMessages,
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		mode: "stream-reasoning",
		metadata:
			options.debugPurpose || options.debugSessionId
				? {
						purpose: options.debugPurpose,
						sessionId: options.debugSessionId,
						transport: "deepseek-agent",
					}
				: { transport: "deepseek-agent" },
	});

	const provider = createDeepSeekAgentRuntimeProvider(config);
	const turn = await collectAgentTurnFromStream(streamAgentProviderTurnEvents(provider, {
		model: config.model,
		messages: agentMessages,
		toolChoice: "none",
		maxTokens,
		temperature: thinking === "enabled" ? undefined : options.temperature,
		thinking,
		reasoningEffort,
		abortSignal: options.abortSignal,
		turn: 1,
	}));

	return {
		text: agentContentToText(turn.message.content),
		reasoning: turn.message.reasoningContent || undefined,
	};
}

async function* streamDeepSeekAgentTurn(
	config: DeepSeekRuntimeConfig,
	messages: DeepSeekAgentSourceMessage[],
	tools: ProviderToolDefinitionMap = {},
	options: ChatGenerationOptions & {
		debugTurn?: number;
	} = {},
	mode: ProviderRequestDumpMode = "stream-tools",
	metadata: ProviderRawRecord = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
	const agentMessages = deepSeekAgentMessagesFromMessages(messages);
	const agentTools = agentModelToolsFromDefinitions(tools);
	const maxTokens = options.maxTokens || 4096;
	const thinking = resolveDeepSeekAgentThinking(config.model, options);
	const reasoningEffort = normalizeDeepSeekAgentReasoningEffort(
		options.thinkingEffort,
	);

	await dumpDeepSeekAgentRequest({
		config,
		messages: agentMessages,
		tools: agentTools,
		maxTokens,
		temperature: options.temperature,
		thinking,
		reasoningEffort,
		mode,
		metadata: {
			...metadata,
			sessionId: options.debugSessionId,
			turn: options.debugTurn,
			transport: "deepseek-agent",
		},
	});

	const provider = createDeepSeekAgentRuntimeProvider(config);

	const events = streamAgentProviderTurnEvents(provider, {
		model: config.model,
		messages: agentMessages,
		tools: agentTools,
		toolChoice: agentTools.length > 0 ? "auto" : "none",
		maxTokens,
		temperature: thinking === "enabled" ? undefined : options.temperature,
		thinking,
		reasoningEffort,
		abortSignal: options.abortSignal,
		turn: options.debugTurn ?? 1,
	});

	for await (const chunk of agentEventsToProviderStreamChunks(events)) {
		if (chunk.type === "turn-start" || chunk.type === "tool-metadata" || chunk.type === "tool-partial-result") {
			continue;
		}
		yield chunk;
	}
}

function getLatestUserMessageText(messages: ToolChatMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== "user") continue;
		const text = stringifyMessageContent(message.content).trim();
		if (text) return text;
	}
	return "";
}

function formatACPPlan(update: ProviderRawValue): string {
	const updateRecord = recordFromValue(update);
	const entries = Array.isArray(updateRecord.entries) ? updateRecord.entries : [];
	if (entries.length === 0) return "ACP agent updated its plan.";
	return [
		"ACP plan:",
		...entries.map((entry) => {
			const entryRecord = recordFromValue(entry);
			const rawStatus = entryRecord.status;
			const rawTitle =
				entryRecord.title ?? entryRecord.content ?? entryRecord.description ?? "";
			const status = typeof rawStatus === "string" && rawStatus
				? `[${rawStatus}] `
				: "";
			const title = typeof rawTitle === "string" ? rawTitle : String(rawTitle);
			return `- ${status}${title}`.trim();
		}),
	].join("\n");
}

function formatACPTool(update: ProviderRawValue): string {
	const updateRecord = recordFromValue(update);
	const rawStatus = updateRecord.status;
	const rawTitle = updateRecord.title ?? updateRecord.toolCallId ?? "tool call";
	const status = typeof rawStatus === "string" && rawStatus ? ` (${rawStatus})` : "";
	const title = typeof rawTitle === "string" ? rawTitle : String(rawTitle);
	return `ACP ${title}${status}`;
}

function mapACPStopReason(stopReason: string): StreamChunkWithTools["finishReason"] {
	if (stopReason === "end_turn") return "stop";
	if (stopReason === "max_tokens") return "length";
	if (stopReason === "cancelled") return "other";
	if (stopReason === "refusal") return "content-filter";
	return "other";
}

function mergeSystemMessagesForGenerateIfNeeded(
	providerId: string,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
): Array<{
	role: "user" | "assistant" | "system";
	content: AIMessageContent;
	reasoningContent?: string;
}> {
	if (!requiresSystemMergeFromRegistry(providerId)) return messages;

	const systemMessages: string[] = [];
	const nonSystemMessages: Array<{
		role: "user" | "assistant";
		content: AIMessageContent;
		reasoningContent?: string;
	}> = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			systemMessages.push(stringifyMessageContent(msg.content));
		} else {
			nonSystemMessages.push({
				role: msg.role,
				content: msg.content,
				reasoningContent: msg.reasoningContent,
			});
		}
	}

	if (systemMessages.length === 0) return messages;
	const firstUserIndex = nonSystemMessages.findIndex((msg) => msg.role === "user");
	if (firstUserIndex === -1) return messages;

	const systemPrefix = systemMessages.filter(Boolean).join("\n\n");
	const originalContent = nonSystemMessages[firstUserIndex].content;
	const mergedPrefix = `[System Instructions]\n${systemPrefix}\n\n[User Message]\n`;

	nonSystemMessages[firstUserIndex] = {
		...nonSystemMessages[firstUserIndex],
		content:
			typeof originalContent === "string"
				? `${mergedPrefix}${originalContent}`
				: [
						{ type: "text", text: mergedPrefix },
						...originalContent,
					],
	};

	return nonSystemMessages;
}

/**
 * Generate a chat response through the provider facade.
 * AgentProvider-capable runtimes are required; unsupported providers fail fast.
 * For reasoning models (like deepseek-reasoner, o1), temperature is automatically disabled
 */
export async function generateChatResponse(
	providerId: string,
	config: RuntimeProviderConfig,
	messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
	options: ChatGenerationOptions = {},
): Promise<string> {
	const result = await generateChatResponseWithReasoning(
		providerId,
		config,
		messages,
		options,
	);
	return result.text;
}

/**
 * Stream a chat response through the provider facade.
 * Delegates to the reasoning-capable facade so agent-first routing is maintained in one place.
 * Returns an async generator that yields text chunks
 */
export async function* streamChatResponse(
	providerId: string,
	config: RuntimeProviderConfig,
	messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
	options: { temperature?: number; maxTokens?: number } = {},
): AsyncGenerator<{ text: string; reasoning?: string }, void, void> {
	for await (const chunk of streamChatResponseWithReasoning(
		providerId,
		config,
		messages,
		options,
	)) {
		if (chunk.type === "text" && (chunk.text || chunk.reasoning)) {
			yield { text: chunk.text, reasoning: chunk.reasoning };
		}
	}
}

// Chunk types for streamChatResponseWithReasoning
export type ReasoningStreamChunk =
	| { type: "text"; text: string; reasoning?: string }
	| {
			type: "finish";
			usage: { inputTokens: number; outputTokens: number; totalTokens: number };
	  };

/**
 * Stream a chat response with reasoning/thinking content
 * Returns an async generator that yields text and reasoning chunks, plus finish with usage
 */
export async function* streamChatResponseWithReasoning(
	providerId: string,
	config: RuntimeProviderConfig,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
	options: {
		temperature?: number;
		maxTokens?: number;
		abortSignal?: AbortSignal;
		thinking?: boolean;
		thinkingEffort?: ThinkingEffort;
		serviceTier?: string;
	} = {},
): AsyncGenerator<ReasoningStreamChunk, void, void> {
	const effectiveMessages = mergeSystemMessagesForGenerateIfNeeded(
		providerId,
		messages,
	);
	const runtimeRoute = resolveProviderRuntimeRoute(providerId, config);

	if (runtimeRoute.kind === "deepseek") {
		for await (const chunk of streamDeepSeekAgentTurn(
			config,
			effectiveMessages,
			{},
			options,
			"stream-reasoning",
		)) {
			if (chunk.type === "reasoning" && chunk.reasoning) {
				yield { type: "text" as const, text: "", reasoning: chunk.reasoning };
			} else if (chunk.type === "text" && chunk.text) {
				yield { type: "text" as const, text: chunk.text };
			} else if (chunk.type === "finish") {
				yield {
					type: "finish" as const,
					usage: chunk.usage ?? {
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
					},
				};
			}
		}
		return;
	}

	if (runtimeRoute.kind === "agent") {
		yield* streamUtilityAgentTurn(
			providerId,
			runtimeRoute.provider,
			config,
			effectiveMessages,
			options,
			"stream-reasoning",
		);
		return;
	}

	throw new Error(
		`Provider ${providerId} does not have an AgentProvider runtime for stream-reasoning.`,
	);
}

/**
 * Generate a chat response with reasoning/thinking content
 * Returns both the response text and reasoning process
 *
 * AgentProvider-capable runtimes are routed locally.
 */
export async function generateChatResponseWithReasoning(
	providerId: string,
	config: RuntimeProviderConfig,
	messages: Array<{
		role: "user" | "assistant" | "system";
		content: AIMessageContent;
		reasoningContent?: string;
	}>,
	options: ChatGenerationOptions = {},
): Promise<ChatResponseResult> {
	if (isACPProvider(providerId)) {
		let text = "";
		let reasoning = "";
		for await (const chunk of streamACPChatResponseWithTools(
			config,
			messages as ToolChatMessage[],
			{
				abortSignal: options.abortSignal,
				debugSessionId: options.debugSessionId,
				workingDirectory: config.baseUrl,
			},
		)) {
			if (chunk.type === "text" && chunk.text) text += chunk.text;
			if (chunk.type === "reasoning" && chunk.reasoning) reasoning += chunk.reasoning;
		}
		return { text, reasoning: reasoning || undefined };
	}

	const effectiveMessages = mergeSystemMessagesForGenerateIfNeeded(
		providerId,
		messages,
	);
	const runtimeRoute = resolveProviderRuntimeRoute(providerId, config);

	if (runtimeRoute.kind === "deepseek") {
		return generateWithDeepSeekAgent(config, effectiveMessages, options);
	}

	if (runtimeRoute.kind === "agent") {
		const agentResult = await runUtilityAgentTurn(
			providerId,
			runtimeRoute.provider,
			config,
			effectiveMessages,
			options,
			"generate",
		);
		if (agentResult) return agentResult;
	}

	throw new Error(
		`Provider ${providerId} does not have an AgentProvider runtime for generate.`,
	);
}

/**
 * Stream callbacks for real-time updates
 */
export interface StreamCallbacks {
	onReasoningDelta?: (delta: string) => void;
	onTextDelta?: (delta: string) => void;
	onComplete?: (result: ChatResponseResult) => void;
	onError?: (error: Error) => void;
}

/**
 * Check if a model should use streaming
 * Now returns true for all models to provide faster feedback
 */
export function shouldUseStreaming(
	_providerId: string,
	_modelId: string,
): boolean {
	// Always use streaming for all models for faster feedback
	return true;
}

/**
 * Generate a short title for a chat conversation
 */
export async function generateChatTitle(
	providerId: string,
	config: RuntimeProviderConfig,
	userMessage: string,
	options: Pick<
		ChatGenerationOptions,
		"thinking" | "thinkingEffort" | "serviceTier" | "debugSessionId"
	> = {},
): Promise<string> {
	if (isACPProvider(providerId)) {
		return userMessage
			.replace(/\s+/g, " ")
			.trim()
			.replace(/^[`"'“”‘’#:\-\s]+/, "")
			.slice(0, 40) || "ACP Chat";
	}

	const systemPrompt = [
		"Create a short topic title from the user's first message.",
		"Use the same language as the message when possible.",
		"Compress the message into its core subject or task instead of copying it verbatim.",
		"Prefer 2-5 English words or 4-12 CJK characters when possible.",
		"Respond with the title only. Do not add quotes, punctuation wrappers, or explanations.",
	].join("\n");

	const response = await generateChatResponse(
		providerId,
		config,
		[
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userMessage },
		],
		{
			temperature: 0.2,
			maxTokens: 20,
			thinking: options.thinking ?? false,
			thinkingEffort: options.thinking ? options.thinkingEffort : undefined,
			serviceTier: options.serviceTier,
			debugPurpose: "chat-title",
			debugSessionId: options.debugSessionId,
		},
	);

	// Clean up the title - remove quotes
	return response
		.replace(/\s+/g, " ")
		.replace(/^title\s*:\s*/i, "")
		.trim()
		.replace(/^[`"'“”‘’#:\-\s]+/, "")
		.replace(/[`"'“”‘’\s]+$/, "");
}

/**
 * Message type for tool-enabled chat
 * Supports regular messages, assistant messages with tool calls, and tool result messages
 */
export type ToolChatMessage =
	| {
			role: "user" | "system" | "developer";
			content: AIMessageContent;
	  }
	| {
			role: "assistant";
			content: AIMessageContent;
			toolCalls?: Array<{
				toolCallId: string;
				toolName: string;
				args: AgentJsonObject;
			}>;
			reasoningContent?: string;
			codexEncryptedReasoning?: string[];
	  }
	| {
			role: "tool";
			content: Array<{
					type: "tool-result";
					toolCallId: string;
					toolName: string;
					result: ProviderOpaqueValue;
				}>;
	  };

async function* streamACPChatResponseWithTools(
	config: RuntimeProviderConfig,
	messages: ToolChatMessage[],
	options: {
		abortSignal?: AbortSignal;
		debugSessionId?: string;
		workingDirectory?: string;
	} = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
	const agentId = config.model;
	const prompt = getLatestUserMessageText(messages);
	if (!prompt) {
		throw new Error("ACP prompt is empty");
	}

	const localSessionId = options.debugSessionId || `acp-${agentId}`;
	const cwd = options.workingDirectory || config.baseUrl || process.cwd();

	for await (const event of ACPManager.streamPrompt(agentId, {
		localSessionId,
		prompt,
		cwd,
		abortSignal: options.abortSignal,
	})) {
		if (event.type === "warning") {
			yield { type: "reasoning", reasoning: event.message };
			continue;
		}

		if (event.type === "finish") {
			yield {
				type: "finish",
				finishReason: mapACPStopReason(event.stopReason),
				usage: event.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
			};
			continue;
		}

		const update = recordFromValue(event.notification.update);
		const updateContent = recordFromValue(update.content);
		switch (update.sessionUpdate) {
			case "agent_message_chunk":
				if (updateContent.type === "text" && typeof updateContent.text === "string" && updateContent.text) {
					yield { type: "text", text: updateContent.text };
				}
				break;
			case "agent_thought_chunk":
				if (updateContent.type === "text" && typeof updateContent.text === "string" && updateContent.text) {
					yield { type: "reasoning", reasoning: updateContent.text };
				}
				break;
			case "plan":
				yield { type: "reasoning", reasoning: formatACPPlan(update) };
				break;
			case "tool_call":
			case "tool_call_update":
				yield { type: "reasoning", reasoning: formatACPTool(update) };
				break;
			case "usage_update":
				break;
			default:
				break;
		}
	}
}

/**
 * Stream a chat response with tools support
 * Returns an async generator that yields text, reasoning, and tool call chunks
 */
export async function* streamChatResponseWithTools(
	providerId: string,
	config: RuntimeProviderConfig,
	messages: ToolChatMessage[],
	tools: ProviderToolDefinitionMap,
	options: {
		temperature?: number;
		maxTokens?: number;
		abortSignal?: AbortSignal;
		/** Per-model thinking toggle for native-thinking providers. */
		thinking?: boolean;
		/** Provider-specific thinking effort. */
		thinkingEffort?: ThinkingEffort;
		/** Provider-specific service tier, used by Codex speed controls. */
		serviceTier?: string;
		/** Provider-native Codex tools such as ChatGPT backend image generation. */
		codexNativeTools?: string[];
		/** Debug-only session correlation written to provider request dump files. */
		debugSessionId?: string;
		/** Debug-only stream turn correlation written to provider request dump files. */
		debugTurn?: number;
		/** Session working directory for local ACP agents. */
		workingDirectory?: string;
	} = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
	const runtimeRoute = resolveProviderRuntimeRoute(providerId, config);
	if (runtimeRoute.kind === "acp") {
		yield* streamACPChatResponseWithTools(config, messages, options);
		return;
	}

	if (runtimeRoute.kind === "deepseek") {
		yield* streamDeepSeekAgentTurn(
			config,
			messages,
			tools,
			options,
			"stream-tools",
			{
				originalMessageCount: messages.length,
				convertedMessageCount: messages.length,
			},
		);
		return;
	}

	if (runtimeRoute.kind === "agent") {
		yield* streamAgentProviderToolTurn(
			providerId,
			runtimeRoute.provider,
			config,
			messages,
			tools,
			options,
		);
		return;
	}

	throw new Error(
		`Provider ${providerId} does not have an AgentProvider runtime for stream-tools.`,
	);
}

export function convertToolDefinitionsForProvider(
	toolDefinitions: ProviderToolSourceDefinition[],
): ProviderToolDefinitionMap {
	const result: ProviderToolDefinitionMap = {};
	const usedNames = new Set<string>();

	for (const tool of toolDefinitions) {
		const providerToolName = createAIToolName(tool.id, usedNames);
		result[providerToolName] = {
			description: tool.description,
			parameters: tool.parameters,
			parameterSchema: tool.parameterSchema ? toJsonObject(tool.parameterSchema) : undefined,
		};
	}

	return result;
}

// ============================================================================
// UIMessage-based streaming
// ============================================================================

/**
 * UIMessage 格式的消息。
 */
import type { UIMessage } from "../../shared/ipc.js";

type ToolUIPartForProvider = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

function isToolUIPartForProvider(part: UIMessage["parts"][number]): part is ToolUIPartForProvider {
	return part.type.startsWith("tool-");
}

function toolChatMessagesFromUIMessages(messages: UIMessage[]): ToolChatMessage[] {
	const result: ToolChatMessage[] = [];

	for (const message of messages) {
		const content = aiMessageContentFromUIParts(message.parts);

		if (message.role === "system" || message.role === "user") {
			result.push({ role: message.role, content });
			continue;
		}

		const reasoningContent = message.parts
			.filter((part) => part.type === "reasoning")
			.map((part) => part.text)
			.join("");
		const toolCalls: Array<{
			toolCallId: string;
			toolName: string;
			args: AgentJsonObject;
		}> = [];
			const toolResults: Array<{
				type: "tool-result";
				toolCallId: string;
				toolName: string;
				result: ProviderOpaqueValue;
			}> = [];

		for (const part of message.parts) {
			if (!isToolUIPartForProvider(part)) continue;
			const toolName =
				part.toolName || part.type.replace(/^tool-/, "") || "tool";
			toolCalls.push({
				toolCallId: part.toolCallId,
				toolName,
				args: part.input ?? {},
			});
			if (
				part.state === "output-available" ||
				part.state === "output-error"
			) {
					toolResults.push({
						type: "tool-result",
						toolCallId: part.toolCallId,
						toolName,
						result:
							part.state === "output-error"
								? { error: part.errorText ?? "Tool failed" }
								: part.output === undefined
									? null
									: part.output as ProviderOpaqueValue,
					});
				}
		}

		result.push({
			role: "assistant",
			content,
			...(reasoningContent ? { reasoningContent } : {}),
			...(toolCalls.length ? { toolCalls } : {}),
		});
		if (toolResults.length) {
			result.push({ role: "tool", content: toolResults });
		}
	}

	return result;
}

function aiMessageContentFromUIParts(parts: UIMessage["parts"]): AIMessageContent {
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.filter(Boolean)
		.join("\n");
	const fileParts = parts.filter((part) => part.type === "file");

	if (fileParts.length === 0) return text;

	const contentParts: Exclude<AIMessageContent, string> = [];
	if (text) contentParts.push({ type: "text", text });

	for (const part of fileParts) {
		if (part.mediaType.startsWith("image/")) {
			contentParts.push({
				type: "image",
				image: part.url,
				mediaType: part.mediaType,
			});
			continue;
		}
		contentParts.push({
			type: "file",
			data: part.url,
			mediaType: part.mediaType,
		});
	}

	return contentParts;
}

/**
 * Stream chat response using UIMessage format through AgentProvider runtimes.
 */
export async function* streamChatWithUIMessages(
	providerId: string,
	config: RuntimeProviderConfig,
	uiMessages: UIMessage[],
	tools: ProviderToolDefinitionMap,
	options: {
		temperature?: number;
		maxTokens?: number;
		abortSignal?: AbortSignal;
	} = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
	const toolMessages = toolChatMessagesFromUIMessages(uiMessages);
	const runtimeRoute = resolveProviderRuntimeRoute(providerId, config);

	if (runtimeRoute.kind === "deepseek") {
		yield* streamDeepSeekAgentTurn(
			config,
			toolMessages,
			tools,
			options,
			"stream-ui-messages",
			{
				uiMessageCount: uiMessages.length,
				modelMessageCount: toolMessages.length,
			},
		);
		return;
	}

	if (runtimeRoute.kind === "agent") {
		yield* streamAgentProviderToolTurn(
			providerId,
			runtimeRoute.provider,
			config,
			toolMessages,
			tools,
			options,
		);
		return;
	}

	throw new Error(
		`Provider ${providerId} does not have an AgentProvider runtime for stream-ui-messages.`,
	);
}

export const providerRegistry: Record<string, ProviderInfo> =
	Object.fromEntries(getProvidersFromRegistry().map((p) => [p.id, p]));
