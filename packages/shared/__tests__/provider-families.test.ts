import { describe, expect, it } from "vitest";
import {
	isSubscriptionFamilyMember,
	providerFamilyDisplayName,
	providerFamilyOf,
} from "../provider-families";

describe("providerFamilyOf", () => {
	it("resolves both members of a family to the same family", () => {
		expect(providerFamilyOf("openai")?.id).toBe("openai");
		expect(providerFamilyOf("codex")?.id).toBe("openai");
		expect(providerFamilyOf("grok")?.id).toBe("grok");
		expect(providerFamilyOf("grok-oauth")?.id).toBe("grok");
		expect(providerFamilyOf("claude")?.id).toBe("claude");
		expect(providerFamilyOf("claude-code")?.id).toBe("claude");
	});

	it("returns null for providers without a family", () => {
		expect(providerFamilyOf("deepseek")).toBeNull();
		expect(providerFamilyOf("github-copilot")).toBeNull();
	});
});

describe("isSubscriptionFamilyMember", () => {
	it("is true only for the subscription channel", () => {
		expect(isSubscriptionFamilyMember("codex")).toBe(true);
		expect(isSubscriptionFamilyMember("openai")).toBe(false);
		expect(isSubscriptionFamilyMember("kimi")).toBe(false);
	});
});

describe("providerFamilyDisplayName", () => {
	it("names the API member after the vendor", () => {
		expect(providerFamilyDisplayName("openai", "OpenAI")).toBe("OpenAI");
		expect(providerFamilyDisplayName("grok", "Grok")).toBe("Grok");
	});

	it("names the subscription member as vendor · tag", () => {
		expect(providerFamilyDisplayName("codex", "Codex")).toBe("OpenAI · Codex");
		expect(providerFamilyDisplayName("grok-oauth", "Grok (Subscription)")).toBe(
			"Grok · Subscription",
		);
	});

	it("uses the tag alone when it already carries the vendor name", () => {
		expect(providerFamilyDisplayName("claude-code", "Claude Code")).toBe(
			"Claude Code",
		);
	});

	it("falls back to the provider's own name outside a family", () => {
		expect(providerFamilyDisplayName("kimi", "Kimi")).toBe("Kimi");
	});
});
