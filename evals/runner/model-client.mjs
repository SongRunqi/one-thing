/**
 * Model Client (Phase 2 runner)
 *
 * Calls AI models via OpenAI-compatible API for offline evaluation.
 * Supports any provider with an OpenAI-compatible chat completions endpoint.
 *
 * Configuration via environment variables:
 *   EVALS_API_KEY      - API key
 *   EVALS_BASE_URL     - Base URL (defaults to https://api.openai.com/v1)
 *   EVALS_MODEL        - Model name (defaults to gpt-4o-mini)
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function getConfig() {
	return {
		apiKey: process.env.EVALS_API_KEY || process.env.OPENAI_API_KEY || "",
		baseUrl: process.env.EVALS_BASE_URL || DEFAULT_BASE_URL,
		model: process.env.EVALS_MODEL || DEFAULT_MODEL,
	};
}

/**
 * Convert our prompt messages to OpenAI-compatible format.
 */
function toOpenAIMessages(messages) {
	return messages.map((m) => {
		if (m.role === "system" || m.role === "developer") {
			return { role: "system", content: m.content };
		}
		if (m.role === "user") {
			return { role: "user", content: m.content };
		}
		if (m.role === "assistant") {
			return { role: "assistant", content: m.content };
		}
		return { role: "user", content: String(m.content || "") };
	});
}

/**
 * Send a chat completion request to the API.
 * Returns { content, toolCalls, usage } or throws on error.
 */
export async function chatCompletion({
	messages,
	model,
	apiKey,
	baseUrl,
	tools,
}) {
	const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

	const body = {
		model,
		messages: toOpenAIMessages(messages),
		temperature: 0, // Deterministic for eval
		max_tokens: 2048,
	};

	if (tools && tools.length > 0) {
		body.tools = tools.map((t) => ({
			type: "function",
			function: {
				name: t.name,
				description: t.description || "",
				parameters: t.parameters || { type: "object", properties: {} },
			},
		}));
		body.tool_choice = "auto";
	}

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
	}

	const data = await response.json();
	const choice = data.choices?.[0];
	if (!choice) {
		throw new Error("No choices in response");
	}

	const message = choice.message || {};
	const toolCalls = (message.tool_calls || []).map((tc) => ({
		id: tc.id,
		name: tc.function?.name || "unknown",
		args: (() => {
			try {
				return JSON.parse(tc.function?.arguments || "{}");
			} catch {
				return {};
			}
		})(),
	}));

	return {
		content: message.content || "",
		toolCalls,
		usage: data.usage || {
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0,
		},
		finishReason: choice.finish_reason || "stop",
	};
}

/**
 * Run a single eval case: build prompt → call model → return response.
 */
export async function runCase({
	promptBuilder,
	userMessage,
	model,
	apiKey,
	baseUrl,
	tools,
}) {
	console.log(`  [RUN] model=${model} baseUrl=${baseUrl}`);

	const result = await promptBuilder({ userMessage });
	const response = await chatCompletion({
		messages: result.messages,
		model,
		apiKey,
		baseUrl,
		tools,
	});

	return {
		...response,
		systemPrompt: result.systemPrompt,
	};
}
