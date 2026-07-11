import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultVariablesFile, type VariablesFile } from "../schema.js";
import { VariablesStore } from "../store.js";

let saved: VariablesFile | undefined;
let store: VariablesStore;

function createStore() {
	return new VariablesStore({
		loadFromDisk: () => saved ?? createDefaultVariablesFile(),
		saveToDisk: vi.fn((state: VariablesFile) => {
			saved = JSON.parse(JSON.stringify(state));
		}),
	});
}

beforeEach(() => {
	saved = undefined;
	store = createStore();
	store.hydrateForTests(createDefaultVariablesFile());
});

describe("VariablesStore", () => {
	it("reads and writes built-in note directories", () => {
		expect(store.getAiNoteDir()).toBe("~/.onething/memory");
		expect(store.getUserNoteDir()).toBe("");
		expect(store.getWorkNoteDir()).toBe("");

		store.setAiNoteDir("/ai");
		store.setUserNoteDir("/user");
		store.setWorkNoteDir("/work");

		expect(store.getAiNoteDir()).toBe("/ai");
		expect(store.getUserNoteDir()).toBe("/user");
		expect(store.getWorkNoteDir()).toBe("/work");
	});

	it("persists global variables and marks them as global on read", () => {
		store.setGlobalVariables([
			{ name: "topic", value: "headless", updatedAt: 1 },
		]);

		expect(store.getGlobalVariables()).toEqual([
			{ name: "topic", value: "headless", updatedAt: 1, scope: "global" },
		]);
		expect(saved?.global_variables).toEqual([
			{ name: "topic", value: "headless", updatedAt: 1 },
		]);
	});

	it("notifies subscribers and continues when one throws", () => {
		const calls: string[] = [];
		store.subscribe(() => {
			throw new Error("boom");
		});
		store.subscribe(() => calls.push("ok"));
		const originalError = console.error;
		console.error = () => undefined;
		try {
			store.setAiNoteDir("/x");
		} finally {
			console.error = originalError;
		}
		expect(calls).toEqual(["ok"]);
	});
});
