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

		expect(tracker.check("session-1", "/path/to/file.md", "new-hash").read).toBe(
			true,
		);
		expect(tracker.check("session-1", "/path/to/file.md", "old-hash").read).toBe(
			false,
		);
	});

	test("check passes when current hash matches what was seen", () => {
		tracker.record("session-1", "/path/to/file.md", "hash-v1");
		expect(tracker.check("session-1", "/path/to/file.md", "hash-v1").read).toBe(
			true,
		);
	});

	test("check fails when the file changed on disk since it was seen", () => {
		tracker.record("session-1", "/path/to/file.md", "hash-v1");

		const result = tracker.check("session-1", "/path/to/file.md", "hash-v2");
		expect(result.read).toBe(false);
		if (!result.read) {
			expect(result.reason).toContain("changed on disk");
			expect(result.reason).toContain("/path/to/file.md");
		}
	});

	test("an unread file reports 'not read', not 'changed', even with a hash", () => {
		const result = tracker.check("session-1", "/path/to/file.md", "hash-v1");
		expect(result.read).toBe(false);
		if (!result.read) {
			expect(result.reason).toContain("File not read yet");
		}
	});

	test("records survive across turns as long as content is unchanged", () => {
		// There is no per-turn reset: staleness is decided by content, not by
		// how many user messages have gone by since the read.
		tracker.record("session-1", "/path/to/file.md", "hash-v1");
		expect(tracker.check("session-1", "/path/to/file.md", "hash-v1").read).toBe(
			true,
		);
	});
});
