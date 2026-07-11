import { describe, test, expect, beforeEach } from "vitest";
import { FileReadTracker } from "../file-read-tracker.js";

describe("FileReadTracker", () => {
	let tracker: FileReadTracker;

	beforeEach(() => {
		tracker = new FileReadTracker();
	});

	test("check returns false for unread file", () => {
		const result = tracker.check("session-1", "/path/to/file.md");
		expect(result.read).toBe(false);
		if (!result.read) {
			expect(result.reason).toContain("File not read yet");
			expect(result.reason).toContain("/path/to/file.md");
		}
	});

	test("record then check returns true", () => {
		tracker.record("session-1", "/path/to/file.md", "abc123");
		const result = tracker.check("session-1", "/path/to/file.md");
		expect(result.read).toBe(true);
	});

	test("different sessions are isolated", () => {
		tracker.record("session-1", "/path/to/file.md", "abc123");
		const result = tracker.check("session-2", "/path/to/file.md");
		expect(result.read).toBe(false);
	});

	test("different files are isolated within same session", () => {
		tracker.record("session-1", "/path/to/fileA.md", "hashA");
		expect(tracker.check("session-1", "/path/to/fileA.md").read).toBe(true);
		expect(tracker.check("session-1", "/path/to/fileB.md").read).toBe(false);
	});

	test("invalidate removes read record", () => {
		tracker.record("session-1", "/path/to/file.md", "abc123");
		expect(tracker.check("session-1", "/path/to/file.md").read).toBe(true);

		tracker.invalidate("session-1", "/path/to/file.md");
		expect(tracker.check("session-1", "/path/to/file.md").read).toBe(false);
	});

	test("invalidate on non-existent record is no-op", () => {
		// Should not throw
		tracker.invalidate("session-1", "/path/to/nonexistent.md");
		expect(tracker.check("session-1", "/path/to/nonexistent.md").read).toBe(
			false,
		);
	});

	test("clearSession removes all records for that session", () => {
		tracker.record("session-1", "/path/to/fileA.md", "hashA");
		tracker.record("session-1", "/path/to/fileB.md", "hashB");
		tracker.record("session-2", "/path/to/fileC.md", "hashC");

		tracker.clearSession("session-1");

		expect(tracker.check("session-1", "/path/to/fileA.md").read).toBe(false);
		expect(tracker.check("session-1", "/path/to/fileB.md").read).toBe(false);
		expect(tracker.check("session-2", "/path/to/fileC.md").read).toBe(true);
	});

	test("record overwrites previous record for same file", () => {
		tracker.record("session-1", "/path/to/file.md", "old-hash");
		tracker.record("session-1", "/path/to/file.md", "new-hash");

		// Still counts as "read" (hash is updated internally)
		expect(tracker.check("session-1", "/path/to/file.md").read).toBe(true);
	});
});
