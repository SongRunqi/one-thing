import { describe, expect, it } from "vitest";
import {
	renderContextUpdateBlock,
	resolveTurnContextUpdateText,
	visibleMessagesAfterSummary,
} from "../engine/turn-context.js";

describe("resolveTurnContextUpdateText", () => {
	it("attaches on first send and skips empty text", () => {
		expect(resolveTurnContextUpdateText("- datetime: 10:00", [])).toBe("- datetime: 10:00");
		expect(resolveTurnContextUpdateText("", [])).toBeUndefined();
		expect(resolveTurnContextUpdateText("   \n", [])).toBeUndefined();
		expect(resolveTurnContextUpdateText(undefined, [])).toBeUndefined();
	});

	it("dedupes against the most recently injected block", () => {
		const history = [
			{ contextUpdate: "- datetime: 09:00" },
			{},
			{ contextUpdate: "- datetime: 10:00" },
			{},
		];
		expect(resolveTurnContextUpdateText("- datetime: 10:00", history)).toBeUndefined();
		expect(resolveTurnContextUpdateText("- datetime: 11:00", history)).toBe("- datetime: 11:00");
	});

	it("re-attaches when the value reverts to an older block (only the latest counts)", () => {
		const history = [
			{ contextUpdate: "- git_branch: main" },
			{ contextUpdate: "- git_branch: feature/x" },
		];
		expect(resolveTurnContextUpdateText("- git_branch: main", history)).toBe("- git_branch: main");
	});

	it("attaches when no message ever carried a block", () => {
		expect(resolveTurnContextUpdateText("- datetime: 10:00", [{}, {}])).toBe("- datetime: 10:00");
	});
});

describe("visibleMessagesAfterSummary", () => {
	const messages = [
		{ id: "m1", contextUpdate: "- git_branch: main" },
		{ id: "m2" },
		{ id: "m3", contextUpdate: "- git_branch: feature/x" },
		{ id: "m4" },
	];

	it("returns everything when there is no summary anchor", () => {
		expect(visibleMessagesAfterSummary(messages, undefined)).toEqual(messages);
		expect(visibleMessagesAfterSummary(messages, "missing")).toEqual(messages);
	});

	it("drops messages the model no longer sees after compaction", () => {
		expect(visibleMessagesAfterSummary(messages, "m3")).toEqual([{ id: "m4" }]);
	});

	it("re-injects when the last block was summarized away (dedupe uses visible history)", () => {
		// Full history says feature/x was already injected at m3; after
		// compaction up to m3 the model cannot see it, so it must re-inject.
		const visible = visibleMessagesAfterSummary(messages, "m3");
		expect(resolveTurnContextUpdateText("- git_branch: feature/x", visible))
			.toBe("- git_branch: feature/x");
		// Without compaction the same text would be deduped.
		expect(resolveTurnContextUpdateText("- git_branch: feature/x", messages))
			.toBeUndefined();
	});
});

describe("vanishing state invariant (no tombstone needed)", () => {
	it("a variable dropping off the board changes the joined text and re-injects", () => {
		// The board always contains datetime, so state removal shrinks the
		// joined text rather than emptying it — the diff itself is the signal,
		// and the prompt convention says the newest block supersedes all.
		const history = [
			{ contextUpdate: "- datetime: 10:00\n- background_jobs: job1: dev — running" },
		];
		expect(resolveTurnContextUpdateText("- datetime: 10:00", history))
			.toBe("- datetime: 10:00");
	});
});

describe("renderContextUpdateBlock", () => {
	it("renders a byte-stable block appended to the content", () => {
		expect(renderContextUpdateBlock("hello", "- datetime: 10:00")).toBe(
			"hello\n\n<context-update>\n- datetime: 10:00\n</context-update>",
		);
	});
});
