import { describe, expect, it } from "vitest";
import {
	createAgentProviderFromRuntime,
	getSupportedAgentProviderRuntimeIds,
	isAgentProviderRuntimeSupported,
	registerAgentProviderRuntime,
} from "../providers/factory.js";
import { builtinProviders } from "../../providers/builtin/index.js";
import type { AgentTurnStreamEvent } from "@onething/core/agent-loop";

describe("agent provider runtime factory", () => {
	const emptyFetch: typeof globalThis.fetch = async () => new Response("");

	it("requires every built-in provider to have an agent runtime route", () => {
		const missing = builtinProviders
			.map((provider) => provider.id)
			.filter((providerId) => !isAgentProviderRuntimeSupported(providerId));

		expect(missing).toEqual([]);
	});

	it("creates supported agent providers from runtime config", () => {
		const deepseek = createAgentProviderFromRuntime(
			"deepseek",
			{
				apiKey: "key",
				baseUrl: "https://example.test",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const acp = createAgentProviderFromRuntime(
			"acp",
			{},
			{
				workingDirectory: "/tmp/work",
				localSessionId: "session-1",
			},
		);
		const codex = createAgentProviderFromRuntime(
			"codex",
			{
				apiKey: "access-token",
				baseUrl: "https://chatgpt.test/backend-api/codex",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const openai = createAgentProviderFromRuntime(
			"openai",
			{
				apiKey: "key",
				baseUrl: "https://openai.test/v1",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const kimi = createAgentProviderFromRuntime(
			"kimi",
			{
				apiKey: "key",
				baseUrl: "https://kimi.test/v1",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const claude = createAgentProviderFromRuntime(
			"claude",
			{
				apiKey: "key",
				baseUrl: "https://anthropic.test/v1",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const gemini = createAgentProviderFromRuntime(
			"gemini",
			{
				apiKey: "key",
				baseUrl: "https://gemini.test/v1beta",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const githubCopilot = createAgentProviderFromRuntime(
			"github-copilot",
			{
				apiKey: "github-token",
				baseUrl: "https://copilot.test",
			},
			{
				fetchImpl: emptyFetch,
			},
		);
		const claudeCode = createAgentProviderFromRuntime(
			"claude-code",
			{
				apiKey: "claude-oauth-token",
				baseUrl: "https://claude-code.test/v1",
			},
			{
				fetchImpl: emptyFetch,
			},
		);

		expect(isAgentProviderRuntimeSupported("deepseek")).toBe(true);
		expect(isAgentProviderRuntimeSupported("acp")).toBe(true);
		expect(isAgentProviderRuntimeSupported("codex")).toBe(true);
		expect(isAgentProviderRuntimeSupported("openai")).toBe(true);
		expect(isAgentProviderRuntimeSupported("kimi")).toBe(true);
		expect(isAgentProviderRuntimeSupported("zhipu")).toBe(true);
		expect(isAgentProviderRuntimeSupported("openrouter")).toBe(true);
		expect(isAgentProviderRuntimeSupported("claude")).toBe(true);
		expect(isAgentProviderRuntimeSupported("gemini")).toBe(true);
		expect(isAgentProviderRuntimeSupported("grok")).toBe(true);
		expect(isAgentProviderRuntimeSupported("grok-oauth")).toBe(true);
		expect(isAgentProviderRuntimeSupported("github-copilot")).toBe(true);
		expect(isAgentProviderRuntimeSupported("claude-code")).toBe(true);
		expect(getSupportedAgentProviderRuntimeIds()).toEqual(
			expect.arrayContaining([
				"deepseek",
				"codex",
				"openai",
				"openrouter",
				"kimi",
				"zhipu",
				"claude",
				"gemini",
				"grok",
				"grok-oauth",
				"github-copilot",
				"claude-code",
				"acp",
			]),
		);
		expect(deepseek?.id).toBe("deepseek");
		expect(codex?.id).toBe("codex");
		expect(openai?.id).toBe("openai");
		expect(kimi?.id).toBe("kimi");
		expect(claude?.id).toBe("claude");
		expect(gemini?.id).toBe("gemini");
		expect(githubCopilot?.id).toBe("github-copilot");
		expect(claudeCode?.id).toBe("claude-code");
		expect(acp?.id).toBe("acp");
	});

	it("passes DeepSeek model token limits from runtime metadata into provider capabilities", () => {
		const provider = createAgentProviderFromRuntime(
			"deepseek",
			{
				apiKey: "key",
				model: "deepseek-v4-pro",
				models: {
					"deepseek-v4-pro": {
						supportsTools: true,
						supportsReasoning: true,
						contextLength: 1_000_000,
						maxOutputTokens: 384_000,
					},
				},
			},
			{
				fetchImpl: emptyFetch,
			},
		);

		expect(provider?.capabilities?.maxInputTokens).toBe(1_000_000);
		expect(provider?.capabilities?.maxOutputTokens).toBe(384_000);
	});

	it("streams GitHub Copilot through the agent runtime with a exchanged Copilot token", async () => {
		const requests: Array<{
			url: string;
			authorization: string;
			integration: string;
		}> = [];
		const fetchImpl: typeof globalThis.fetch = async (input, init) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			requests.push({
				url,
				authorization:
					headers.get("authorization") ?? headers.get("Authorization") ?? "",
				integration: headers.get("Copilot-Integration-Id") ?? "",
			});

			if (url === "https://api.github.com/copilot_internal/v2/token") {
				return new Response(
					JSON.stringify({ token: "copilot-token", expires_in: 1800 }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			return new Response(
				[
					'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}',
					"",
					'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}',
					"",
					"data: [DONE]",
					"",
				].join("\n"),
				{
					status: 200,
					headers: { "content-type": "text/event-stream" },
				},
			);
		};

		const provider = createAgentProviderFromRuntime(
			"github-copilot",
			{
				apiKey: "github-token",
				baseUrl: "https://copilot.test",
				model: "gpt-4o",
			},
			{ fetchImpl },
		);

		if (!provider?.streamTurn)
			throw new Error(
				"GitHub Copilot runtime did not create a stream provider",
			);

		const events: AgentTurnStreamEvent[] = [];
		for await (const event of provider.streamTurn({
			model: "gpt-4o",
			messages: [{ role: "user", content: "hi" }],
			turn: 1,
		})) {
			events.push(event);
		}

		expect(requests).toMatchObject([
			{
				url: "https://api.github.com/copilot_internal/v2/token",
				authorization: "Bearer github-token",
			},
			{
				url: "https://copilot.test/chat/completions",
				authorization: "Bearer copilot-token",
				integration: "vscode-chat",
			},
		]);
		expect(events).toContainEqual({
			type: "text-delta",
			turn: 1,
			delta: "hello",
		});
		expect(events).toContainEqual({
			type: "finish",
			turn: 1,
			finishReason: "stop",
			usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
		});
	});

	it("streams Claude Code through the agent runtime with OAuth headers", async () => {
		let requestHeaders = new Headers();
		let requestBody = "";
		const fetchImpl: typeof globalThis.fetch = async (_input, init) => {
			requestHeaders = new Headers(init?.headers);
			requestBody = typeof init?.body === "string" ? init.body : "";
			return new Response(
				[
					'data: {"type":"message_start","message":{"usage":{"input_tokens":3,"output_tokens":0}}}',
					"",
					'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}',
					"",
					'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
					"",
					"data: [DONE]",
					"",
				].join("\n"),
				{
					status: 200,
					headers: { "content-type": "text/event-stream" },
				},
			);
		};

		const provider = createAgentProviderFromRuntime(
			"claude-code",
			{
				apiKey: "claude-oauth-token",
				baseUrl: "https://claude-code.test/v1",
				model: "claude-sonnet-4",
			},
			{ fetchImpl },
		);

		if (!provider?.streamTurn)
			throw new Error("Claude Code runtime did not create a stream provider");

		const events: AgentTurnStreamEvent[] = [];
		for await (const event of provider.streamTurn({
			model: "claude-sonnet-4",
			messages: [
				{ role: "system", content: "Project instructions" },
				{ role: "user", content: "hi" },
			],
			turn: 1,
		})) {
			events.push(event);
		}

		const body = JSON.parse(requestBody) as {
			system?: Array<{ type: string; text: string }>;
		};
		expect(requestHeaders.get("authorization")).toBe(
			"Bearer claude-oauth-token",
		);
		expect(requestHeaders.get("x-api-key")).toBeNull();
		expect(requestHeaders.get("anthropic-beta")).toContain(
			"claude-code-20250219",
		);
		expect(body.system).toEqual([
			{
				type: "text",
				text: "You are Claude Code, Anthropic's official CLI for Claude.",
			},
			// claude-code enables prompt caching: breakpoint on the system tail.
			{
				type: "text",
				text: "Project instructions",
				cache_control: { type: "ephemeral" },
			},
		]);
		expect(events).toContainEqual({
			type: "text-delta",
			turn: 1,
			delta: "hello",
		});
		expect(events).toContainEqual({
			type: "finish",
			turn: 1,
			finishReason: "stop",
			usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
		});
	});

	it("creates custom OpenAI-compatible agent providers from runtime config", () => {
		const provider = createAgentProviderFromRuntime(
			"custom-local-openai",
			{
				apiKey: "key",
				baseUrl: "https://custom.test/v1",
				model: "custom-model",
				apiType: "openai",
				modelCapabilitiesByModel: {
					"custom-model": {
						tools: false,
						vision: false,
						reasoning: false,
					},
				},
			},
			{
				fetchImpl: emptyFetch,
			},
		);

		expect(isAgentProviderRuntimeSupported("custom-local-openai")).toBe(true);
		expect(provider?.id).toBe("custom-local-openai");
		const capabilities = provider?.capabilities;
		expect(capabilities).toBeDefined();
		expect(capabilities?.supportsTools).toBe(false);
		expect(capabilities?.supportsReasoning).toBe(false);
		expect(capabilities?.capabilities).not.toContain("vision-input");
	});

	it("creates custom Anthropic-compatible agent providers from runtime config", () => {
		const provider = createAgentProviderFromRuntime(
			"custom-local-anthropic",
			{
				apiKey: "key",
				baseUrl: "https://anthropic-compatible.test/v1",
				model: "claude-compatible",
				apiType: "anthropic",
				modelCapabilitiesByModel: {
					"claude-compatible": {
						tools: false,
						vision: false,
						reasoning: false,
					},
				},
			},
			{
				fetchImpl: emptyFetch,
			},
		);

		expect(isAgentProviderRuntimeSupported("custom-local-anthropic")).toBe(
			true,
		);
		expect(provider?.id).toBe("custom-local-anthropic");
		const capabilities = provider?.capabilities;
		expect(capabilities).toBeDefined();
		expect(capabilities?.supportsTools).toBe(false);
		expect(capabilities?.supportsReasoning).toBe(false);
		expect(capabilities?.capabilities).not.toContain("vision-input");
	});

	it("allows additional provider runtimes to register without changing the factory", () => {
		const unregister = registerAgentProviderRuntime(
			"plugin-agent",
			(config) => ({
				id: `plugin-agent:${config.model ?? "default"}`,
				capabilities: {
					capabilities: ["text-input", "text-output"],
					inputModalities: ["text"],
					outputModalities: ["text"],
				},
			}),
		);

		try {
			expect(isAgentProviderRuntimeSupported("plugin-agent")).toBe(true);
			expect(
				createAgentProviderFromRuntime("plugin-agent", { model: "m1" })?.id,
			).toBe("plugin-agent:m1");
			expect(() =>
				registerAgentProviderRuntime("plugin-agent", () => ({
					id: "duplicate",
				})),
			).toThrow("Agent provider runtime already registered: plugin-agent");
		} finally {
			unregister();
		}

		expect(isAgentProviderRuntimeSupported("plugin-agent")).toBe(false);
	});
});
