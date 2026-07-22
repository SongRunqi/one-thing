import type {
	AgentFinishReason,
	AgentJsonObject,
	AgentMessage,
	AgentProvider,
	AgentTool,
	AgentToolChoice,
	AgentTurn,
	AgentTurnRequest,
	AgentTurnStreamEvent,
	AgentUsage,
} from "@onething/core/agent-loop";
import {
	agentContentToText,
	collectAgentTurnFromStream,
} from "@onething/core/agent-loop";
import { agentToolMessageContentToText } from "@onething/core/agent-loop";
import { isCompleteAgentToolArguments } from "@onething/core/agent-loop";
import { readJsonSseData } from "./sse.js";
import type { AgentProviderRequestDumper } from "./request-dump.js";

type FetchFn = typeof globalThis.fetch;

export type {
	AgentProviderRequestDump,
	AgentProviderRequestDumper,
	AgentProviderRequestDumpValue,
} from "./request-dump.js";

function shouldDebugDeepSeekStream(): boolean {
	return (
		process.env.ONETHING_DEBUG_STREAM === "1" ||
		process.env.ONETHING_DEBUG_DEEPSEEK_STREAM === "1"
	);
}

function logTime(): string {
	return new Date().toISOString();
}

function previewText(
	value: string | null | undefined,
	maxLength = 240,
): string {
	return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function elapsedSince(
	previous: number | undefined,
	now = Date.now(),
): number | undefined {
	return previous === undefined ? undefined : now - previous;
}

export interface DeepSeekAgentProviderOptions {
	apiKey: string;
	baseUrl?: string;
	fetchImpl?: FetchFn;
	capabilities?: AgentProvider["capabilities"];
	requestDumper?: AgentProviderRequestDumper;
}

interface DeepSeekToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface DeepSeekMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string;
	tool_calls?: DeepSeekToolCall[];
	tool_call_id?: string;
}

interface DeepSeekTool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: AgentJsonObject;
	};
}

interface DeepSeekRequestBody {
	model: string;
	messages: DeepSeekMessage[];
	stream: true;
	stream_options: { include_usage: true };
	tools?: DeepSeekTool[];
	tool_choice?: AgentToolChoice;
	temperature?: number;
	max_tokens?: number;
	thinking?: { type: "enabled" | "disabled" };
	reasoning_effort?: "high" | "max";
}

interface DeepSeekStreamChunk {
	choices?: Array<{
		index: number;
		delta?: {
			content?: string | null;
			reasoning_content?: string | null;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: "function";
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		prompt_cache_hit_tokens?: number;
		prompt_cache_miss_tokens?: number;
	};
	error?: {
		message?: string;
		type?: string;
		code?: string;
	};
}

interface ToolCallAccumulator {
	id: string;
	name: string;
	arguments: string;
	started: boolean;
	done: boolean;
}

function toDeepSeekMessage(message: AgentMessage): DeepSeekMessage {
	if (message.role === "tool") {
		return {
			role: "tool",
			content: agentToolMessageContentToText(message.content),
			tool_call_id: message.toolCallId ?? "",
		};
	}

	if (message.role === "assistant") {
		const content = agentContentToText(message.content);
		return {
			role: "assistant",
			content: content || null,
			...(message.reasoningContent
				? { reasoning_content: message.reasoningContent }
				: {}),
			...(message.toolCalls?.length
				? {
						tool_calls: message.toolCalls.map((toolCall) => ({
							id: toolCall.id,
							type: "function" as const,
							function: {
								name: toolCall.name,
								arguments: toolCall.arguments,
							},
						})),
					}
				: {}),
		};
	}

	return {
		role: message.role,
		content: agentContentToText(message.content),
	};
}

function toDeepSeekTools(
	tools: AgentTool[] | undefined,
): DeepSeekTool[] | undefined {
	if (!tools?.length) return undefined;
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}));
}

function mapFinishReason(reason: string | null | undefined): AgentFinishReason {
	switch (reason) {
		case "stop":
		case "length":
		case "content_filter":
			return reason;
		case "tool_calls":
			return "tool_calls";
		default:
			return reason ? "unknown" : "unknown";
	}
}

function usageFromChunk(chunk: DeepSeekStreamChunk): AgentUsage | undefined {
	if (!chunk.usage) return undefined;
	const cacheReadTokens = chunk.usage.prompt_cache_hit_tokens;
	return {
		inputTokens: chunk.usage.prompt_tokens,
		outputTokens: chunk.usage.completion_tokens,
		totalTokens: chunk.usage.total_tokens,
		...(cacheReadTokens ? { cacheReadTokens } : {}),
	};
}

function toolCallDoneEvent(
	turn: number,
	entry: ToolCallAccumulator,
): Extract<AgentTurnStreamEvent, { type: "tool-call-done" }> {
	const toolCall = {
		id: entry.id,
		name: entry.name,
		arguments: entry.arguments,
	};
	return { type: "tool-call-done", turn, toolCall };
}

async function* streamDeepSeekResponse(
	response: Response,
	turn: number,
): AsyncGenerator<AgentTurnStreamEvent, void, void> {
	const toolCalls = new Map<number, ToolCallAccumulator>();
	let usage: AgentUsage | undefined;
	let finishReason: AgentFinishReason = "unknown";
	const debugStream = shouldDebugDeepSeekStream();
	let lastDeltaAt: number | undefined;

	for await (const chunk of readJsonSseData<DeepSeekStreamChunk>(response, {
		sourceName: "DeepSeek agent loop",
		invalidMessage: "invalid stream chunk",
	})) {
		if (chunk.error) {
			throw new Error(
				`DeepSeek agent loop error: ${chunk.error.message ?? "unknown error"}`,
			);
		}

		usage = usageFromChunk(chunk) ?? usage;
		const choice = chunk.choices?.[0];
		const delta = choice?.delta;

		if (delta?.reasoning_content) {
			if (debugStream) {
				const now = Date.now();
				console.log("[DeepSeekProvider:SSE] reasoning-delta", {
					time: logTime(),
					gapMs: elapsedSince(lastDeltaAt, now),
					turn,
					chars: delta.reasoning_content.length,
					text: previewText(delta.reasoning_content),
				});
				lastDeltaAt = now;
			}
			yield { type: "reasoning-delta", turn, delta: delta.reasoning_content };
		}

		if (delta?.content) {
			if (debugStream) {
				const now = Date.now();
				console.log("[DeepSeekProvider:SSE] text-delta", {
					time: logTime(),
					gapMs: elapsedSince(lastDeltaAt, now),
					turn,
					chars: delta.content.length,
					text: previewText(delta.content),
				});
				lastDeltaAt = now;
			}
			yield { type: "text-delta", turn, delta: delta.content };
		}

		if (delta?.tool_calls) {
			for (const toolCallDelta of delta.tool_calls) {
				const index = toolCallDelta.index;
				let entry = toolCalls.get(index);
				if (!entry) {
					entry = {
						id: toolCallDelta.id ?? `tool-${turn}-${index}`,
						name: "",
						arguments: "",
						started: false,
						done: false,
					};
					toolCalls.set(index, entry);
				}

				if (toolCallDelta.id) entry.id = toolCallDelta.id;
				if (toolCallDelta.function?.name)
					entry.name += toolCallDelta.function.name;
				const argumentsDelta = toolCallDelta.function?.arguments ?? "";
				if (argumentsDelta) entry.arguments += argumentsDelta;

				if (!entry.started && entry.name) {
					entry.started = true;
					yield {
						type: "tool-call-start",
						turn,
						toolCallId: entry.id,
						toolName: entry.name,
					};
				}

				if (argumentsDelta && entry.name) {
					yield {
						type: "tool-call-delta",
						turn,
						toolCallId: entry.id,
						toolName: entry.name,
						argumentsDelta,
					};
				}

				if (
					!entry.done &&
					entry.name &&
					isCompleteAgentToolArguments(entry.arguments)
				) {
					entry.done = true;
					yield toolCallDoneEvent(turn, entry);
				}
			}
		}

		if (choice?.finish_reason) {
			finishReason = mapFinishReason(choice.finish_reason);
		}
	}

	for (const [, entry] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
		if (!entry.done) {
			yield toolCallDoneEvent(turn, entry);
		}
	}

	yield { type: "finish", turn, finishReason, usage };
}

export function createDeepSeekAgentProvider(
	options: DeepSeekAgentProviderOptions,
): AgentProvider {
	const baseUrl = (options.baseUrl || "https://api.deepseek.com").replace(
		/\/$/,
		"",
	);
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;

	async function* streamTurn(
		request: AgentTurnRequest,
	): AsyncGenerator<AgentTurnStreamEvent, void, void> {
		const tools = toDeepSeekTools(request.tools);
		const body: DeepSeekRequestBody = {
			model: request.model,
			messages: request.messages.map(toDeepSeekMessage),
			stream: true,
			stream_options: { include_usage: true },
		};

		if (tools?.length) {
			body.tools = tools;
			body.tool_choice = request.toolChoice ?? "auto";
		}
		if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
		if (request.thinking) body.thinking = { type: request.thinking };
		if (request.thinking === "enabled" && request.reasoningEffort) {
			// DeepSeek only accepts high/max; anything lower clamps to high.
			body.reasoning_effort = request.reasoningEffort === "max" ? "max" : "high";
		}
		if (request.temperature !== undefined && request.thinking !== "enabled") {
			body.temperature = request.temperature;
		}

		const requestDumpPath = await options.requestDumper?.({
			providerId: "deepseek",
			model: request.model,
			mode: "stream",
			metadata: {
				url: `${baseUrl}/chat/completions`,
				method: "POST",
				turn: request.turn,
			},
			requestBody: body,
		});
		console.log("[DeepSeekAgentProvider] streamTurn request", {
			model: request.model,
			turn: request.turn,
			messageCount: request.messages.length,
			toolCount: request.tools?.length ?? 0,
			thinking: body.thinking?.type ?? "default",
			reasoningEffort: body.reasoning_effort,
			lastUserPreview: previewText(
				agentContentToText(
					[...request.messages]
						.reverse()
						.find((message) => message.role === "user")?.content ?? "",
				),
			),
			requestDumpPath,
		});

		const response = await fetchImpl(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${options.apiKey}`,
			},
			body: JSON.stringify(body),
			signal: request.abortSignal,
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`DeepSeek agent loop API error: ${response.status} ${text}`,
			);
		}

		yield* streamDeepSeekResponse(response, request.turn);
	}

	return {
		id: "deepseek",
		capabilities: options.capabilities ?? {
			capabilities: [
				"text-input",
				"text-output",
				"streaming",
				"tool-calls",
				"reasoning",
			],
			inputModalities: ["text"],
			outputModalities: ["text"],
			supportsTools: true,
			supportsReasoning: true,
			supportsStreaming: true,
		},
		streamTurn,

		async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
			return collectAgentTurnFromStream(streamTurn(request), request.onEvent);
		},
	};
}
