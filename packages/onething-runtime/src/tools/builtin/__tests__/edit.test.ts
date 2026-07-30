import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditTool } from "../edit.js";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

async function tempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
	dirs.push(dir);
	return dir;
}

function createContext(
	workingDirectory: string,
	overrides: Record<string, unknown> = {},
) {
	return {
		sessionId: "test-session",
		messageId: "test-message",
		toolCallId: "test-call",
		workingDirectory,
		workingDirectoryRoots: [workingDirectory],
		metadata: vi.fn(),
		beforeSideEffect: vi.fn(async () => undefined),
		...overrides,
	} as any;
}

async function createTool(prefix: string) {
	const auditDir = await tempDir(prefix);
	return {
		auditDir,
		tool: createEditTool({ getFileMutationsDir: () => auditDir }),
	};
}

describe("runtime edit tool", () => {
	it("edits files and records mutation audit metadata", async () => {
		const dir = await tempDir("onething-runtime-edit");
		const { auditDir, tool } = await createTool("onething-runtime-edit-audit");
		const filePath = path.join(dir, "note.txt");
		const ctx = createContext(dir);
		await fs.writeFile(filePath, "before\n", "utf-8");

		const result = await tool.execute(
			{
				path: "note.txt",
				edits: [{ oldText: "before", newText: "after" }],
			},
			ctx,
		);

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("after\n");
		expect(ctx.beforeSideEffect).toHaveBeenCalled();
		expect(result.metadata).toMatchObject({
			path: filePath,
			auditPath: expect.stringContaining(auditDir),
		});
	});

	it("classifies large deletions as destructive edit effects", async () => {
		const dir = await tempDir("onething-runtime-edit-destructive");
		const { tool } = await createTool(
			"onething-runtime-edit-destructive-audit",
		);
		const original = [
			"start",
			"remove 1",
			"remove 2",
			"remove 3",
			"remove 4",
			"remove 5",
			"remove 6",
			"end",
			"",
		].join("\n");
		const filePath = path.join(dir, "target.txt");
		await fs.writeFile(filePath, original, "utf-8");

		const analysis = await tool.analyze!(
			{
				path: "target.txt",
				edits: [
					{
						oldText: original.trimEnd(),
						newText: "start changed\nend changed",
					},
				],
			},
			createContext(dir),
		);

		expect(analysis.effects[0]).toMatchObject({
			kind: "file_destructive_edit",
			metadata: expect.objectContaining({
				path: filePath,
				risk: "large_deletion",
			}),
		});
		expect(analysis.preview).toMatchObject({
			path: filePath,
			title: "Edit target.txt",
		});
	});

	it("refuses edits when target content changes after approval", async () => {
		const dir = await tempDir("onething-runtime-edit-revalidate");
		const { tool } = await createTool("onething-runtime-edit-revalidate-audit");
		const filePath = path.join(dir, "note.txt");
		const ctx = createContext(dir);
		await fs.writeFile(filePath, "A: old\nB: old\n", "utf-8");

		const analysis = await tool.analyze!(
			{
				path: "note.txt",
				edits: [{ oldText: "A: old", newText: "A: new" }],
			},
			ctx,
		);
		await fs.writeFile(filePath, "A: old\nB: external\n", "utf-8");

		await expect(
			tool.execute(
				{
					path: "note.txt",
					edits: [{ oldText: "A: old", newText: "A: new" }],
				},
				{ ...ctx, approvedAnalysis: analysis },
			),
		).rejects.toThrow("file changed after approval");
		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
			"A: old\nB: external\n",
		);
	});
});
