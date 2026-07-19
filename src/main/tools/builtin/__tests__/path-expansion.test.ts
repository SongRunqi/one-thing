import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { WriteTool } from "../write";
import { EditTool } from "../edit";
import { ReadTool } from "../read";
import { Permission } from "../../../permission/index.js";

vi.mock("../../../permission/index.js", () => ({
	Permission: {
		ask: vi.fn().mockResolvedValue(undefined),
	},
}));

describe("builtin file tool path expansion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function createContext(
		beforeSideEffect: () => Promise<void> = vi.fn(async (): Promise<void> => {
			throw new Error("stop before write");
		}),
	) {
		return {
			sessionId: "test-session",
			messageId: "test-message",
			toolCallId: "test-call",
			workingDirectory: "/workspace",
			metadata: vi.fn(),
			beforeSideEffect,
		};
	}

	it("write expands ~ before waiting for ordered write gate", async () => {
		const ctx = createContext();
		const fileName = `.onething-write-path-expansion-${Date.now()}.txt`;
		const expectedPath = path.join(os.homedir(), fileName);

		await expect(
			WriteTool.execute({ path: `~/${fileName}`, content: "hello" }, ctx),
		).rejects.toThrow("stop before write");

		expect(ctx.metadata).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					path: expectedPath,
				}),
			}),
		);
		expect(Permission.ask).not.toHaveBeenCalled();
	});

	it("edit expands ~ before waiting for ordered edit gate", async () => {
		const ctx = createContext();
		const fileName = `.onething-edit-path-expansion-${Date.now()}.txt`;
		const expectedPath = path.join(os.homedir(), fileName);

		await expect(
			EditTool.execute(
				{
					path: `~/${fileName}`,
					edits: [{ oldText: "before", newText: "hello" }],
				},
				ctx,
			),
		).rejects.toThrow("stop before write");

		expect(ctx.metadata).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					path: expectedPath,
				}),
			}),
		);
		expect(Permission.ask).not.toHaveBeenCalled();
	});

	it("edit reads original content after the ordered edit gate", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onething-edit-gate-"));
		const filePath = path.join(dir, "note.txt");
		await fs.writeFile(filePath, "before\n", "utf-8");

		// The file changes while the tool waits at the gate, and the model sees
		// the new content — so the read guard has nothing to object to and the
		// snapshot ordering is what's under test.
		const ctx = createContext(
			vi.fn(async () => {
				await fs.writeFile(filePath, "after\n", "utf-8");
				await ReadTool.execute({ path: filePath }, createContext());
			}),
		);

		await ReadTool.execute({ path: filePath }, ctx);

		const result = await EditTool.execute(
			{
				path: filePath,
				edits: [{ oldText: "after", newText: "done" }],
			},
			ctx,
		);

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("done\n");
		// The diff is based on the post-gate snapshot ('after'), not the original 'before'.
		expect(result.metadata.diff).toContain("-after");
		expect(result.metadata.diff).toContain("+done");
	});

	it("write reads original content after the ordered write gate", async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), "onething-write-gate-"),
		);
		const filePath = path.join(dir, "note.txt");
		await fs.writeFile(filePath, "before\n", "utf-8");

		const ctx = createContext(
			vi.fn(async () => {
				await fs.writeFile(filePath, "latest\n", "utf-8");
				await ReadTool.execute({ path: filePath }, createContext());
			}),
		);

		await ReadTool.execute({ path: filePath }, ctx);

		const result = await WriteTool.execute(
			{
				path: filePath,
				content: "final\n",
			},
			ctx,
		);

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("final\n");
		// The diff is based on the post-gate snapshot ('latest'), not the original 'before'.
		expect(result.metadata.diff).toContain("-latest");
		expect(result.metadata.diff).toContain("+final");
	});

	it("edit rejects a gate-window change the model never saw", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onething-edit-race-"));
		const filePath = path.join(dir, "note.txt");
		await fs.writeFile(filePath, "before\n", "utf-8");

		// Same race as above, except nothing shows the new content to the model:
		// editing now would apply a decision made against content that is gone.
		const ctx = createContext(
			vi.fn(async () => {
				await fs.writeFile(filePath, "after\n", "utf-8");
			}),
		);

		await ReadTool.execute({ path: filePath }, ctx);

		await expect(
			EditTool.execute(
				{ path: filePath, edits: [{ oldText: "after", newText: "done" }] },
				ctx,
			),
		).rejects.toThrow("changed on disk");

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("after\n");
	});
});
