import { describe, expect, it } from "vitest";
import {
	renderContextUpdateBlock,
	resolveTurnContextUpdateText,
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

describe("renderContextUpdateBlock", () => {
	it("renders a byte-stable block appended to the content", () => {
		expect(renderContextUpdateBlock("hello", "- datetime: 10:00")).toBe(
			"hello\n\n<context-update>\n- datetime: 10:00\n</context-update>",
		);
	});
});
