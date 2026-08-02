import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { EditTool } from "../edit.js";
import { WriteTool } from "../write.js";
import { ReadTool } from "../read.js";

const createdDirs: string[] = [];

function createContext() {
	const tmpRoot = path.join(process.cwd(), "TMP");
	return {
		sessionId: "test-session",
		messageId: "test-message",
		toolCallId: "test-call",
		workingDirectory: process.cwd(),
		workingDirectoryRoots: [tmpRoot],
		metadata: vi.fn(),
		beforeSideEffect: vi.fn(async () => undefined),
	};
}

async function createTmpFile(prefix: string, content: string) {
	const dir = path.join(
		process.cwd(),
		"TMP",
		`${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	const filePath = path.join(dir, "target.md");
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
	createdDirs.push(dir);
	return filePath;
}

describe("file tool policy revalidation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await Promise.all(
			createdDirs
				.splice(0)
				.map((dir) => fs.rm(dir, { recursive: true, force: true })),
		);
	});

	it("refuses edit when file changed after policy approval and approved diff changes", async () => {
		const filePath = await createTmpFile("edit-revalidate", "A: old\nB: old\n");
		const ctx = createContext();
		const analysis = await EditTool.analyze!(
			{
				path: filePath,
				edits: [{ oldText: "A: old", newText: "A: new" }],
			},
			ctx,
		);

		await fs.writeFile(filePath, "A: old\nB: external\n", "utf-8");

		await ReadTool.execute({ path: filePath }, ctx);

		await expect(
			EditTool.execute(
				{
					path: filePath,
					edits: [{ oldText: "A: old", newText: "A: new" }],
				},
				{ ...ctx, approvedAnalysis: analysis },
			),
			// Same shape as the sibling case below: first line names the failure and
			// the file, the engine detail follows. `edit` got this treatment while
			// `write` kept the older generic wording — hence the two different
			// expectations in this file, and hence this one going stale.
		).rejects.toThrow("Edit failed: file changed after approval in target.md.");

		// 措辞可以再变,能不能照着办不能变:模型拿到这条之后唯一正确的下一步是
		// 重读文件、用当前内容重试,所以那句指引必须在。
		await expect(
			EditTool.execute(
				{
					path: filePath,
					edits: [{ oldText: "A: old", newText: "A: new" }],
				},
				{ ...ctx, approvedAnalysis: analysis },
			),
		).rejects.toThrow(/Re-read the file and retry/);

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
			"A: old\nB: external\n",
		);
	});

	it("fails clearly when an approved edit no longer applies to latest content", async () => {
		const filePath = await createTmpFile(
			"edit-revalidate-fail",
			"A: old\nB: old\n",
		);
		const ctx = createContext();
		const analysis = await EditTool.analyze!(
			{
				path: filePath,
				edits: [{ oldText: "A: old", newText: "A: new" }],
			},
			ctx,
		);

		await fs.writeFile(filePath, "A: gone\nB: external\n", "utf-8");

		await ReadTool.execute({ path: filePath }, ctx);

		await expect(
			EditTool.execute(
				{
					path: filePath,
					edits: [{ oldText: "A: old", newText: "A: new" }],
				},
				{ ...ctx, approvedAnalysis: analysis },
			),
		// First line names the failure and the file; the engine detail (full
		// path, retry guidance, closest-match snippet) follows below it.
		).rejects.toThrow("Edit failed: target text not found in target.md.");

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
			"A: gone\nB: external\n",
		);
	});

	it("refuses write when target content changes after policy approval", async () => {
		const filePath = await createTmpFile("write-revalidate", "before\n");
		const ctx = createContext();
		const analysis = await WriteTool.analyze!(
			{
				path: filePath,
				content: "final\n",
			},
			ctx,
		);

		await fs.writeFile(filePath, "external\n", "utf-8");

		await ReadTool.execute({ path: filePath }, ctx);

		await expect(
			WriteTool.execute(
				{
					path: filePath,
					content: "final\n",
				},
				{ ...ctx, approvedAnalysis: analysis },
			),
		).rejects.toThrow("File changed after permission approval");

		await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("external\n");
	});
});
