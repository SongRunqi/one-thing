import { describe, expect, it } from "vitest";
import {
	ONETHING_ACP_PROVIDER_ID,
	acpBuiltinProvider,
	claudeCodeBuiltinProvider,
	codexBuiltinProvider,
	onethingBaseBuiltinProviders,
	onethingPortableBuiltinProviders,
} from "../builtin-providers.js";

describe("onething builtin provider metadata", () => {
	it("declares portable builtin providers in runtime", () => {
		expect(
			onethingPortableBuiltinProviders.map((provider) => provider.id),
		).toEqual([
			"openai",
			"claude",
			"deepseek",
			"kimi",
			"zhipu",
			"qwen",
			"openrouter",
			"gemini",
			"claude-code",
			"grok",
			"grok-oauth",
			"github-copilot",
			"codex",
		]);
	});

	it("keeps OAuth and ACP metadata in runtime", () => {
		expect(claudeCodeBuiltinProvider.info).toMatchObject({
			requiresApiKey: false,
			requiresOAuth: true,
			oauthFlow: "authorization-code",
		});
		expect(acpBuiltinProvider.id).toBe(ONETHING_ACP_PROVIDER_ID);
		expect(codexBuiltinProvider.info).toMatchObject({
			requiresApiKey: false,
			requiresOAuth: true,
			oauthFlow: "authorization-code",
		});
		// Base list = portable + local-machine agent providers (Electron only).
		expect(
			onethingBaseBuiltinProviders
				.slice(onethingPortableBuiltinProviders.length)
				.map((provider) => provider.id),
		).toEqual(["acp", "claude-code-agent"]);
	});
});
