import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { EditTool } from "../edit.js";
import { ReadTool } from "../read.js";
import { WriteTool } from "../write.js";
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

	it("allows consecutive edits after a single read", async () => {
		const { dir, filePath } = await createTmpFile("edit-guard-flow", "v1\n");
		const ctx = createContext(dir);

		// Read → Edit succeeds
		await ReadTool.execute({ path: filePath }, ctx);
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "v1", newText: "v2" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("v2\n");

		// Second edit WITHOUT re-read: the previous edit recorded its own result,
		// so the model has still seen the current content.
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "v2", newText: "v3" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("v3\n");
	});

	it("allows editing a file this session just wrote, without a re-read", async () => {
		const { dir, filePath } = await createTmpFile("edit-after-write", "seed\n");
		const ctx = createContext(dir);

		// Write authors the whole file, so its content is known to the model.
		await ReadTool.execute({ path: filePath }, ctx);
		await WriteTool.execute({ path: filePath, content: "fresh\n" }, ctx);

		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "fresh", newText: "refined" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("refined\n");
	});

	it("allows editing a brand-new file created by write", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-new-file-"));
		createdDirs.push(dir);
		const filePath = path.join(dir, "created.txt");
		const ctx = createContext(dir);

		// Creating a file needs no prior read; editing it right after must not
		// demand one either.
		await WriteTool.execute({ path: filePath, content: "hello\n" }, ctx);
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "hello", newText: "world" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("world\n");
	});

	it("keeps read records across turns when the file is untouched", async () => {
		const { dir, filePath } = await createTmpFile("edit-cross-turn", "v1\n");
		const ctx = createContext(dir);

		await ReadTool.execute({ path: filePath }, ctx);

		// A later user message does not invalidate content the model has seen.
		await EditTool.execute(
			{ path: filePath, edits: [{ oldText: "v1", newText: "v2" }] },
			ctx,
		);
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("v2\n");
	});

	it("blocks edit when the file changed on disk after being read", async () => {
		const { dir, filePath } = await createTmpFile("edit-guard-stale", "v1\n");
		const ctx = createContext(dir);

		await ReadTool.execute({ path: filePath }, ctx);

		// Something outside the session rewrites the file.
		await fs.writeFile(filePath, "changed-by-someone-else\n", "utf-8");

		await expect(
			EditTool.execute(
				{ path: filePath, edits: [{ oldText: "v1", newText: "v2" }] },
				ctx,
			),
		).rejects.toThrow("changed on disk");

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
			"changed-by-someone-else\n",
		);
	});

	it("clearSession drops records so a fresh session must read first", async () => {
		const { dir, filePath } = await createTmpFile("edit-guard-session", "v1\n");
		const ctx = createContext(dir);

		await ReadTool.execute({ path: filePath }, ctx);
		fileReadTracker.clearSession("test-session");

		await expect(
			EditTool.execute(
				{ path: filePath, edits: [{ oldText: "v1", newText: "v2" }] },
				ctx,
			),
		).rejects.toThrow("File not read yet");
	});
});
