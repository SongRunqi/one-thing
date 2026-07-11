import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { EditTool } from "../edit.js";
import { ReadTool } from "../read.js";
import { fileReadTracker } from "../file-read-tracker.js";

const createdDirs: string[] = [];

function createContext(tmpRoot: string) {
	return {
		sessionId: "test-session",
		messageId: "test-message",
		toolCallId: "test-call",
		workingDirectory: tmpRoot,
		workingDirectoryRoots: [tmpRoot],
		metadata: vi.fn(),
		beforeSideEffect: vi.fn(async () => undefined),
	};
}

async function createTmpFile(prefix: string, content: string) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
	createdDirs.push(dir);
	const filePath = path.join(dir, "note.txt");
	await fs.writeFile(filePath, content, "utf-8");
	return { dir, filePath };
}

describe("EditTool path API", () => {
	afterEach(async () => {
		await Promise.all(
			createdDirs
				.splice(0)
				.map((dir) => fs.rm(dir, { recursive: true, force: true })),
		);
	});

	it("edits files using the path parameter", async () => {
		const { dir, filePath } = await createTmpFile("edit-path-api", "before\n");

		await ReadTool.execute({ path: filePath }, createContext(dir));

		await EditTool.execute(
			{
				path: filePath,
				edits: [{ oldText: "before", newText: "after" }],
			},
			createContext(dir),
		);

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("after\n");
	});

	it("rejects missing path", () => {
		const parsed = EditTool.parameters.safeParse({
			edits: [{ oldText: "before", newText: "after" }],
		});
		expect(parsed.success).toBe(false);
	});
});

describe("read-before-edit guard", () => {
	afterEach(async () => {
		await Promise.all(
			createdDirs
				.splice(0)
				.map((dir) => fs.rm(dir, { recursive: true, force: true })),
		);
	});

	it("blocks edit when file has not been read", async () => {
		const { dir, filePath } = await createTmpFile(
			"edit-guard-block",
			"hello\n",
		);

		await expect(
			EditTool.execute(
				{
					path: filePath,
					edits: [{ oldText: "hello", newText: "world" }],
				},
				createContext(dir),
			),
		).rejects.toThrow("File not read yet");

		// File content unchanged
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("hello\n");
	});

	it("allows consecutive edits after read within same turn", async () => {
		const { dir, filePath } = await createTmpFile("edit-guard-flow", "v1\n");
		const ctx = createContext(dir);

		// Read → Edit succeeds
		await ReadTool.execute({ path: filePath }, ctx);
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "v1", newText: "v2" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("v2\n");

		// Second edit WITHOUT re-read → now allowed (same turn)
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "v2", newText: "v3" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("v3\n");

		// Simulate next turn: reset reads → edit blocked
		fileReadTracker.resetTurn("test-session");
		await expect(
			EditTool.execute(
				{ path: filePath, edits: [{ oldText: "v3", newText: "v4" }] },
				ctx,
			),
		).rejects.toThrow("File not read yet");
	});
});
