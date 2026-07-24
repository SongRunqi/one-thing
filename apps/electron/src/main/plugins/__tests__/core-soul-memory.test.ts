import { describe, expect, it, vi } from "vitest";
import {
	applyDailyNoteLineRemove,
	applyDailyNoteLineReplace,
	applyDailyNoteCaptureActions,
	applyDailyNoteCaptureActionsWithAdapters,
	applyMemoryReviewCandidate,
	applyPlainReviewCandidateToContent,
	applySoulMemoryStatusMutationPlan,
	assertSoulMemoryAccessibleRelativePath,
	buildSoulMemoryAppendPayload,
	buildSoulMemoryRewriteFollowUp,
	buildSoulMemoryCaptureDedupeTextWithAdapters,
	buildSoulMemoryCaptureInput,
	buildSoulMemoryCaptureInputWithAdapters,
	buildSoulMemoryCaptureCommandStatusInput,
	buildSoulMemoryExistingMemorySummary,
	buildHermesMemoryPromptFragment,
	buildSoulMemoryManagedFileCandidates,
	buildSoulMemoryOverview,
	buildSoulMemoryPendingCaptureMigrationCandidates,
	buildSoulMemoryPromptFragments,
	buildSoulMemoryReviewStatus,
	buildSoulMemoryReviewStatusWithAdapters,
	buildSoulMemoryReviewInput,
	buildSoulMemoryReviewInputWithAdapters,
	buildSoulMemoryReviewCommandRunContext,
	cleanReviewDocumentText,
	compactSoulMemoryCaptureInput,
	CORE_HERMES_MEMORY_DELIMITER,
	CORE_SOUL_MEMORY_CAPTURE_HOOK_ID,
	CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE,
	CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE,
	CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_COMMAND_SPECS,
	CORE_SOUL_MEMORY_GET_COMMAND_USAGE,
	CORE_SOUL_MEMORY_MANIFEST,
	CORE_SOUL_MEMORY_PLUGIN_ID,
	CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE,
	CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX,
	CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID,
	CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
	CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_TOOL_SPECS,
	CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
	countMemoryReviewUserTurns,
	createSoulMemoryTimelineEntry,
	createSoulMemoryToolProvider,
	dedupeSoulMemoryCaptureLines,
	dedupeSoulMemoryCaptureLinesWithAdapters,
	dedupeSoulMemoryDailyNoteBullets,
	dedupeSoulMemoryDailyNoteBulletsWithAdapters,
	describeSoulMemoryManagedFile,
	describeSoulMemoryManagedFileWithAdapters,
	filterSoulMemoryPendingCapturesForAgent,
	extractLegacyMemoryCandidates,
	formatHermesMemoryEntries,
	formatSoulMemoryDateString,
	formatSoulMemoryDateStringDaysAgo,
	formatSoulMemoryCaptureCommandStatus,
	formatSoulMemoryCommandFileExcerpt,
	formatSoulMemoryCommandStatus,
	formatSoulMemoryRememberCommandResult,
	formatSoulMemoryReviewIntervalNotification,
	formatSoulMemoryReviewStatus,
	formatSoulMemoryReviewToggleNotification,
	formatSoulMemoryToolModelRef,
	formatMemoryReviewConversation,
	getMemoryReviewProgress,
	hashSoulMemoryText,
	getCoreSoulMemoryCommandSpec,
	getCoreSoulMemoryToolSpec,
	handleSoulMemoryCaptureCommand,
	handleSoulMemoryCommandGet,
	handleSoulMemoryGetTool,
	handleSoulMemoryMemoryCommand,
	handleSoulMemoryMemoryTool,
	handleSoulMemoryReviewCommand,
	handleSoulMemorySoulCommand,
	handleSoulMemorySoulGetTool,
	handleSoulMemorySoulUpdateTool,
	hasExplicitMemoryIntent,
	isLikelyRawRequestEcho,
	estimateSoulMemoryTokens,
	normalizeSoulMemoryBulletText,
	normalizeSoulMemoryForDedupe,
	normalizeSoulMemoryRelativePath,
	parseSoulMemoryCaptureCommand,
	parseSoulMemoryRootCommand,
	planHermesMemoryEntryAdd,
	planHermesMemoryTextRemove,
	planHermesMemoryTextReplace,
	parseDailyNoteBullets,
	parseDailyNoteCaptureResult,
	parseMemoryReviewModelResult,
	patchSoulMemorySettingsSection,
	patchSoulMemorySettingsSectionWithAdapters,
	planSoulMemoryCaptureErrorStatusMutation,
	planSoulMemoryCaptureRuntimeStatusMutation,
	planSoulMemoryCaptureSuccessStatusMutation,
	planSoulMemoryWorkspacePaths,
	planSoulMemoryDailyNoteAppend,
	planSoulMemoryReviewAppliedStatusMutation,
	planSoulMemoryReviewErrorStatusMutation,
	planSoulMemoryReviewNoneStatusMutation,
	planSoulMemoryReviewTurnStatusMutation,
	readSoulMemoryFileExcerptFromContent,
	readSoulMemoryManagedFileExcerptWithAdapters,
	readSoulMemoryManagedFileWithAdapters,
	runSoulMemoryCapture,
	runSoulMemoryReview,
	sanitizeHermesMemoryEntry,
	getSoulMemoryPendingCaptures,
	getSoulMemoryPublicPendingCaptures,
	saveSoulMemoryPendingCaptureWithAdapters,
	discardSoulMemoryPendingCaptureWithAdapters,
	listSoulMemoryManagedFilesWithAdapters,
	saveSoulMemoryManagedFileWithAdapters,
	memoryReviewLastTurnKey,
	removeSoulMemoryPendingCapture,
	resolveSoulMemoryProviderConfig,
	resolveSoulMemoryFilePath,
	resolveSoulMemoryRootPath,
	resolveSoulMemoryAppendTarget,
	resolveSoulMemoryManagedFilePath,
	resolveSoulMemoryPlainReviewFilePath,
	resolveSoulMemoryToolProviderSelection,
	resolveSoulMemoryManagedFileMetadata,
	sanitizeSoulMemoryAgentPathSegment,
	selectSoulMemoryPendingCapture,
	setSoulMemoryPendingCaptures,
	extractSoulMemoryCandidateValue,
	isDurableSoulMemoryCaptureCandidate,
	looksLikeSoulMemoryNameValue,
	sanitizeSoulMemoryKey,
	slugifySoulMemoryKeyPart,
	soulMemoryToolProviderAuthError,
	takeSoulMemoryPendingCapture,
	sortManagedMemoryFiles,
	soulMemoryAsBullet,
	previewSoulMemoryLine,
	truncateSoulMemoryText,
	splitHermesMemoryEntries,
} from "@onething/runtime/plugins";

describe("onething runtime soul-memory helpers", () => {
	it("owns the soul-memory plugin manifest in onething runtime", () => {
		expect(CORE_SOUL_MEMORY_PLUGIN_ID).toBe("soul-memory");
		expect(CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX).toBe(
			"memoryReviewLastTurn:",
		);
		expect(memoryReviewLastTurnKey("agent", "session")).toBe(
			"memoryReviewLastTurn:agent:session",
		);
		expect(memoryReviewLastTurnKey("custom:", "agent", "session")).toBe(
			"custom:agent:session",
		);
		expect(CORE_SOUL_MEMORY_MANIFEST).toEqual({
			name: "soul-memory",
			version: "1.0.0",
			description:
				"SOUL.md prompt context, Hermes file memory (USER.md/MEMORY.md), daily-note capture, and periodic review",
			author: "onething",
		});
	});

	it("keeps plugin registration protocol and command parsing in core", () => {
		expect(CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID).toBe("soul-memory");
		expect(CORE_SOUL_MEMORY_CAPTURE_HOOK_ID).toBe("memory-capture");
		expect(CORE_SOUL_MEMORY_REVIEW_HOOK_ID).toBe("memory-review");

		expect(CORE_SOUL_MEMORY_TOOL_SPECS.map((spec) => spec.name)).toEqual([
			"soul_get",
			"soul_update",
			"memory",
			"memory_get",
		]);
		expect(getCoreSoulMemoryToolSpec("soul_update")).toMatchObject({
			permissionGuard: "permission-gated",
		});

		expect(CORE_SOUL_MEMORY_COMMAND_SPECS.map((spec) => spec.name)).toEqual([
			"/memory",
			"/soul",
		]);
		expect(getCoreSoulMemoryCommandSpec("/memory")?.usage).toContain(
			"review <subcommand>",
		);

		expect(parseSoulMemoryRootCommand("capture mode auto")).toEqual({
			action: "capture",
			rest: ["mode", "auto"],
			restText: "mode auto",
		});
		expect(parseSoulMemoryCaptureCommand(["save", "abc123"])).toEqual({
			subcommand: "save",
			id: "abc123",
		});
		expect(
			formatSoulMemoryCaptureCommandStatus({
				enabled: true,
				mode: "auto",
				pending: [{ id: "abcdef123456", content: "remember this" }],
				lastCaptureStatus: "saved",
			}),
		).toContain("Latest pending: abcdef12 remember this");
		expect(buildSoulMemoryRewriteFollowUp("make it warmer")).toContain(
			"make it warmer",
		);
		expect(CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT).toContain(
			"Return markdown bullets only",
		);
	});

	it("normalizes reusable soul-memory text primitives in core", () => {
		expect(
			normalizeSoulMemoryBulletText("  -  用户   今天  验证 headless core  "),
		).toBe("用户 今天 验证 headless core");
		expect(soulMemoryAsBullet("* 用户今天验证 CLI tool call。")).toBe(
			"- 用户今天验证 CLI tool call。",
		);
		expect(
			normalizeSoulMemoryForDedupe(
				"- **用户** [链接](https://example.com) #tag",
			),
		).toBe("用户 tag");
		expect(slugifySoulMemoryKeyPart("DeepSeek Tool Call!")).toBe(
			"deepseek.tool.call",
		);
		expect(slugifySoulMemoryKeyPart("!!!")).toMatch(/^[a-f0-9]{10}$/);
		expect(sanitizeSoulMemoryKey(" User Pref: Theme! ")).toBe(
			"user.pref.theme",
		);
		expect(extractSoulMemoryCandidateValue("User's name is Ada.")).toBe("Ada");
		expect(looksLikeSoulMemoryNameValue("Ada Lovelace")).toBe(true);
		expect(looksLikeSoulMemoryNameValue("prefers compact UI")).toBe(false);
		expect(isDurableSoulMemoryCaptureCandidate({ kind: "summary" })).toBe(
			false,
		);
		expect(isDurableSoulMemoryCaptureCandidate({ kind: "fact" })).toBe(true);
		expect(CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID).toBe("user:self");
		expect(
			buildSoulMemoryPendingCaptureMigrationCandidates([
				{
					content:
						"My name is Ada.\n- I prefer compact updates.\n\nUses headless core.",
					confidence: 0.72,
					explicit: true,
				},
			]),
		).toEqual([
			{
				kind: "identity",
				source: "user",
				confidence: 0.72,
				text: "My name is Ada.",
				sensitivity: "normal",
				target: "memory",
				explicit: true,
			},
			{
				kind: "preference",
				source: "user",
				confidence: 0.72,
				text: "I prefer compact updates.",
				sensitivity: "normal",
				target: "memory",
				explicit: true,
			},
			{
				kind: "fact",
				source: "user",
				confidence: 0.72,
				text: "Uses headless core.",
				sensitivity: "normal",
				target: "memory",
				explicit: true,
			},
		]);
	});

	it("handles memory capture commands in core through capture adapters", async () => {
		expect(
			buildSoulMemoryCaptureCommandStatusInput({
				capture: {
					mode: "auto",
				},
				pending: [{ id: "pending-abcdef", content: "candidate memory" }],
				runtimeStatus: {
					lastCaptureStatus: "saved",
					lastCaptureError: "old error",
				},
			}),
		).toEqual({
			enabled: true,
			mode: "auto",
			pending: [{ id: "pending-abcdef", content: "candidate memory" }],
			lastCaptureStatus: "saved",
			lastCaptureError: "old error",
		});

		const notifications: Array<{
			message: string;
			level?: "info" | "warn" | "error";
		}> = [];
		const savedIds: Array<string | undefined> = [];
		const discardedIds: Array<string | undefined> = [];
		let capture = {
			mode: "off" as "explicit-only" | "auto" | "off",
		};
		const run = (rest: string[]) =>
			handleSoulMemoryCaptureCommand({
				rest,
				ctx: {
					sessionId: "session-1",
					notify: (message, level) => notifications.push({ message, level }),
				},
				getStatus: () => ({
					enabled: capture.mode !== "off",
					mode: capture.mode,
					pending: [{ id: "pending-abcdef", content: "candidate memory" }],
					lastCaptureError: "last error",
				}),
				savePendingCapture: (id) => {
					savedIds.push(id);
					return { relativePath: "memory/2026-06-25.md" };
				},
				discardPendingCapture: (id) => {
					discardedIds.push(id);
					return { id: id || "pending-default" };
				},
				saveSettingsPatch: (patch) => {
					capture = {
						...capture,
						...patch,
					};
					return capture;
				},
			});

		await run(["status"]);
		expect(notifications.at(-1)?.message).toContain("Memory Capture: off");
		expect(notifications.at(-1)?.message).toContain(
			"Latest pending: pending- candidate memory",
		);
		expect(notifications.at(-1)?.message).toContain("Last error: last error");

		await run(["on"]);
		expect(capture.mode).toBe("auto");
		expect(notifications.at(-1)?.message).toBe("Memory Capture is on");

		await run(["mode", "auto"]);
		expect(capture.mode).toBe("auto");
		expect(notifications.at(-1)?.message).toBe("Memory Capture mode: auto");

		await run(["mode", "invalid"]);
		expect(notifications.at(-1)).toEqual({
			message: CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE,
			level: "warn",
		});

		await run(["save", "pending-1"]);
		expect(savedIds).toEqual(["pending-1"]);
		expect(notifications.at(-1)?.message).toBe(
			"Saved pending memory to memory/2026-06-25.md",
		);

		await run(["discard", "abcdef123456"]);
		expect(discardedIds).toEqual(["abcdef123456"]);
		expect(notifications.at(-1)?.message).toBe(
			"Discarded pending memory abcdef12",
		);

		await run(["unknown"]);
		expect(notifications.at(-1)).toEqual({
			message: CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE,
			level: "warn",
		});
	});

	it("routes memory commands in core through action adapters", async () => {
		const notifications: Array<{
			message: string;
			level?: "info" | "warn" | "error";
		}> = [];
		const calls: string[] = [];
		const run = (args: string) =>
			handleSoulMemoryMemoryCommand({
				args,
				ctx: {
					sessionId: "session-1",
					notify: (message, level) => notifications.push({ message, level }),
				},
				handleReview: async (commandArgs) => {
					calls.push(`review:${commandArgs}`);
				},
				handleCapture: async (rest) => {
					calls.push(`capture:${rest.join(" ")}`);
				},
				get: async (path) => {
					calls.push(`get:${path}`);
					return `get result for ${path}`;
				},
				remember: async (input) => {
					calls.push(`${input.action}:${input.content}`);
					return `remembered ${input.content}`;
				},
				status: async () => {
					calls.push("status");
					return "memory status";
				},
			});

		await run("review status");
		await run("capture status");
		await run("get entity:abc");
		await run("remember durable fact");
		await run("append another fact");
		await run("unknown");

		expect(calls).toEqual([
			"review:status",
			"capture:status",
			"get:entity:abc",
			"remember:durable fact",
			"append:another fact",
			"status",
		]);
		expect(notifications.map((item) => item.message)).toContain(
			"get result for entity:abc",
		);
		expect(notifications.map((item) => item.message)).toContain(
			"remembered durable fact",
		);
		expect(notifications.at(-1)?.message).toBe("memory status");
	});

	it("warns for memory command missing arguments in core", async () => {
		const notifications: Array<{
			message: string;
			level?: "info" | "warn" | "error";
		}> = [];
		const run = (args: string) =>
			handleSoulMemoryMemoryCommand({
				args,
				ctx: {
					sessionId: "session-1",
					notify: (message, level) => notifications.push({ message, level }),
				},
				handleReview: async () => {},
				handleCapture: async () => {},
				get: async () => "get",
				remember: async () => "remember",
				status: async () => "status",
			});

		await run("get");
		await run("remember");

		expect(notifications).toEqual([
			{ message: CORE_SOUL_MEMORY_GET_COMMAND_USAGE, level: "warn" },
			{ message: "Usage: /memory remember <text>", level: "warn" },
		]);
	});

	it("formats memory get and remember command adapter results in core", async () => {
		const excerpt = {
			relativePath: "MEMORY.md",
			text: "line 4",
			startLine: 4,
			endLine: 4,
			totalLines: 8,
			truncated: true,
		};

		expect(formatSoulMemoryCommandFileExcerpt(excerpt)).toBe(
			["MEMORY.md:4-4", "line 4", "More content available from line 5."].join(
				"\n\n",
			),
		);
		expect(
			formatSoulMemoryRememberCommandResult({
				relativePath: "memory/2026-06-25.md",
			}),
		).toBe("Remembered in memory/2026-06-25.md");

		await expect(
			handleSoulMemoryCommandGet({
				path: "MEMORY.md",
				readFileExcerpt: () => excerpt,
			}),
		).resolves.toBe(
			["MEMORY.md:4-4", "line 4", "More content available from line 5."].join(
				"\n\n",
			),
		);
	});

	it("handles memory review commands in core through status settings and run adapters", async () => {
		expect(
			buildSoulMemoryReviewCommandRunContext({
				enabled: true,
				review: { enabled: true, interval: 4 },
				messages: [
					{ role: "user", content: "remember this" },
					{ role: "assistant", content: "stored" },
				],
			}),
		).toEqual({
			enabled: true,
			hasSession: true,
			hasRequiredMessages: true,
		});
		expect(
			buildSoulMemoryReviewCommandRunContext({
				enabled: true,
				review: { enabled: true, interval: 4 },
				messages: undefined,
			}),
		).toEqual({
			enabled: true,
			hasSession: false,
			hasRequiredMessages: false,
		});
		expect(
			buildSoulMemoryReviewCommandRunContext({
				enabled: true,
				review: { enabled: true, interval: 0 },
				messages: [{ role: "user", content: "only user" }],
			}),
		).toEqual({
			enabled: false,
			hasSession: true,
			hasRequiredMessages: false,
		});

		const notifications: Array<{
			message: string;
			level?: "info" | "warn" | "error";
		}> = [];
		const patches: Array<{ enabled?: boolean; interval?: number }> = [];
		let review = {
			enabled: false,
			interval: 0,
		};
		let runContext = {
			enabled: true,
			hasSession: true,
			hasRequiredMessages: true,
		};
		let runResult = { lastStatus: "ok" as string | undefined };
		let runError: Error | undefined;
		let runCount = 0;
		const run = (args: string) =>
			handleSoulMemoryReviewCommand({
				args,
				ctx: {
					sessionId: "session-1",
					notify: (message, level) => notifications.push({ message, level }),
				},
				getStatus: () => "review status",
				getSettings: () => review,
				saveSettingsPatch: (patch) => {
					patches.push(patch);
					review = {
						...review,
						...patch,
					};
					return review;
				},
				getRunContext: () => runContext,
				runNow: () => {
					runCount += 1;
					if (runError) throw runError;
					return runResult;
				},
			});

		await run("status");
		expect(notifications.at(-1)?.message).toBe("review status");

		await run("on");
		expect(patches.at(-1)).toEqual({ enabled: true, interval: 10 });
		expect(notifications.at(-1)?.message).toBe(
			formatSoulMemoryReviewToggleNotification(review, "review status"),
		);

		await run("off");
		expect(patches.at(-1)).toEqual({ enabled: false });
		expect(notifications.at(-1)?.message).toBe(
			formatSoulMemoryReviewToggleNotification(review, "review status"),
		);

		await run("interval 7");
		expect(patches.at(-1)).toEqual({ interval: 7, enabled: true });
		expect(notifications.at(-1)?.message).toBe(
			formatSoulMemoryReviewIntervalNotification(review, "review status"),
		);

		await run("interval 0");
		expect(patches.at(-1)).toEqual({ interval: 0, enabled: false });
		expect(notifications.at(-1)?.message).toBe(
			formatSoulMemoryReviewIntervalNotification(review, "review status"),
		);

		await run("interval 201");
		expect(notifications.at(-1)).toEqual({
			message: "Usage: /memory review interval <0-200>",
			level: "warn",
		});

		runContext = {
			enabled: false,
			hasSession: true,
			hasRequiredMessages: true,
		};
		await run("run");
		expect(notifications.at(-1)).toEqual({
			message: "Memory Review is disabled. Use /memory review on first.",
			level: "warn",
		});

		runContext = {
			enabled: true,
			hasSession: false,
			hasRequiredMessages: true,
		};
		await run("run");
		expect(notifications.at(-1)).toEqual({
			message: "No current session found for Memory Review.",
			level: "warn",
		});

		runContext = {
			enabled: true,
			hasSession: true,
			hasRequiredMessages: false,
		};
		await run("run");
		expect(notifications.at(-1)).toEqual({
			message:
				"Memory Review needs at least one user message and one assistant response.",
			level: "warn",
		});

		runContext = { enabled: true, hasSession: true, hasRequiredMessages: true };
		await run("run");
		expect(runCount).toBe(1);
		expect(notifications.at(-2)?.message).toBe("Memory Review started.");
		expect(notifications.at(-1)?.message).toBe("Memory Review finished: ok");

		runResult = { lastStatus: undefined };
		await run("run");
		expect(runCount).toBe(2);
		expect(notifications.at(-1)?.message).toBe("Memory Review finished: none");

		runError = new Error("boom");
		await run("run");
		expect(runCount).toBe(3);
		expect(notifications.at(-1)).toEqual({
			message: "Memory Review failed: boom",
			level: "error",
		});

		await run("wat");
		expect(notifications.at(-1)).toEqual({
			message: CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE,
			level: "warn",
		});
	});

	it("plans Hermes file memory text mutations in core", () => {
		expect(
			splitHermesMemoryEntries(`One${CORE_HERMES_MEMORY_DELIMITER}Two\n`),
		).toEqual(["One", "Two"]);
		expect(sanitizeHermesMemoryEntry(`A${CORE_HERMES_MEMORY_DELIMITER}B`)).toBe(
			"A\nB",
		);
		expect(
			formatHermesMemoryEntries([
				" A ",
				"",
				`B${CORE_HERMES_MEMORY_DELIMITER}C`,
			]),
		).toBe(`A${CORE_HERMES_MEMORY_DELIMITER}B\nC\n`);

		const added = planHermesMemoryEntryAdd("", "First memory");
		expect(added).toMatchObject({ changed: true, matches: 1, beforeChars: 0 });
		expect(added.next).toBe("First memory\n");

		const replaced = planHermesMemoryTextReplace({
			existing: `Old${CORE_HERMES_MEMORY_DELIMITER}Keep\n`,
			oldText: "Old",
			newText: "New",
		});
		expect(replaced).toMatchObject({ changed: true, matches: 1 });
		expect(replaced.next).toBe(`New${CORE_HERMES_MEMORY_DELIMITER}Keep\n`);

		const missing = planHermesMemoryTextReplace({
			existing: "Keep\n",
			oldText: "Missing",
			newText: "New",
		});
		expect(missing).toMatchObject({
			changed: false,
			matches: 0,
			next: "Keep\n",
		});

		const removed = planHermesMemoryTextRemove({
			existing: `A${CORE_HERMES_MEMORY_DELIMITER}B\n`,
			text: "A",
		});
		expect(removed).toMatchObject({ changed: true, matches: 1 });
		expect(removed.next).toBe("B\n");
	});

	it("builds Hermes file memory prompt fragments in core", () => {
		const fragment = buildHermesMemoryPromptFragment({
			user: {
				file: { absolutePath: "/tmp/USER.md", relativePath: "USER.md" },
				content: "User memory.",
			},
			memory: {
				file: { absolutePath: "/tmp/MEMORY.md", relativePath: "MEMORY.md" },
				content: "Long memory.",
			},
			maxChars: 2000,
		});

		expect(fragment).toContain("# Hermes File Memory");
		expect(fragment).toContain("<hermes_user_memory>");
		expect(fragment).toContain("<hermes_long_term_memory>");

		expect(
			buildHermesMemoryPromptFragment({
				user: {
					file: { absolutePath: "/tmp/USER.md", relativePath: "USER.md" },
					content: "",
				},
				memory: {
					file: { absolutePath: "/tmp/MEMORY.md", relativePath: "MEMORY.md" },
					content: "",
				},
				maxChars: 2000,
			}),
		).toBeNull();
	});

	it("handles Hermes memory tool actions in core through file adapters", async () => {
		const changed: Array<{ relativePath: string; reason: string }> = [];
		const baseOptions = {
			enabled: true,
			getStatus: () => ({ files: 2 }),
			read: (target: "user" | "memory") => ({
				file: {
					absolutePath: `/root/${target.toUpperCase()}.md`,
					relativePath: `${target.toUpperCase()}.md`,
				},
				content: target === "user" ? "User profile" : "",
				entries: target === "user" ? ["User profile"] : [],
			}),
			add: (target: "user" | "memory", content: string) => ({
				relativePath: `${target.toUpperCase()}.md`,
				content,
			}),
			replace: (
				target: "user" | "memory",
				oldText: string,
				newText: string,
				replaceAll?: boolean,
			) => ({
				relativePath: `${target.toUpperCase()}.md`,
				changed: oldText === "old",
				matches: oldText === "old" ? 1 : 0,
				newText,
				replaceAll,
			}),
			remove: (
				target: "user" | "memory",
				text: string,
				removeAll?: boolean,
			) => ({
				relativePath: `${target.toUpperCase()}.md`,
				changed: text === "remove me",
				matches: text === "remove me" ? 2 : 0,
				removeAll,
			}),
			markChanged: (relativePath: string, reason: string) => {
				changed.push({ relativePath, reason });
			},
		};
		const run = (
			args: Parameters<typeof handleSoulMemoryMemoryTool>[0]["args"],
		) => handleSoulMemoryMemoryTool({ ...baseOptions, args });

		await expect(
			handleSoulMemoryMemoryTool({
				...baseOptions,
				enabled: false,
				args: { action: "status" },
			}),
		).resolves.toEqual({
			title: "Memory disabled",
			output: "Soul-memory is disabled in settings.",
			metadata: { disabled: true },
		});

		await expect(run({ action: "status" })).resolves.toMatchObject({
			title: "Hermes file memory status",
			output: JSON.stringify({ files: 2 }, null, 2),
			metadata: { files: 2 },
		});

		await expect(
			run({ action: "read", target: "user" }),
		).resolves.toMatchObject({
			title: "Hermes memory: USER.md",
			output: "User profile",
			metadata: {
				target: "user",
				path: "/root/USER.md",
				relativePath: "USER.md",
				chars: "User profile".length,
				entries: 1,
			},
		});
		await expect(run({ action: "read" })).resolves.toMatchObject({
			title: "Hermes memory: MEMORY.md",
			output: "MEMORY.md is empty.",
		});

		await expect(
			run({ action: "add", content: "new memory" }),
		).resolves.toMatchObject({
			title: "Hermes memory added: MEMORY.md",
			output: "Added memory to MEMORY.md.",
		});
		await expect(
			run({ action: "replace", oldText: "old", newText: "new" }),
		).resolves.toMatchObject({
			title: "Hermes memory replaced: MEMORY.md",
			output: "Replaced 1 matching memory entry in MEMORY.md.",
		});
		await expect(
			run({ action: "remove", text: "remove me", all: true }),
		).resolves.toMatchObject({
			title: "Hermes memory removed: MEMORY.md",
			output: "Removed 2 matching memory entries from MEMORY.md.",
		});

		expect(changed).toEqual([
			{ relativePath: "MEMORY.md", reason: "hermes-memory-add" },
			{ relativePath: "MEMORY.md", reason: "hermes-memory-replace" },
			{ relativePath: "MEMORY.md", reason: "hermes-memory-remove" },
		]);

		await expect(
			run({ action: "replace", oldText: "missing", newText: "new" }),
		).resolves.toMatchObject({
			title: "Hermes memory unchanged",
			output: "No exact match found in MEMORY.md.",
		});
		await expect(run({ action: "add" })).rejects.toThrow(
			'content is required for memory action "add"',
		);
		await expect(run({ action: "replace", oldText: "old" })).rejects.toThrow(
			'newText is required for memory action "replace"',
		);
		await expect(run({ action: "remove" })).rejects.toThrow(
			'text, oldText, or content is required for memory action "remove"',
		);
	});

	it("handles soul get and update tools in core through file adapters", async () => {
		await expect(
			handleSoulMemorySoulGetTool({
				enabled: false,
				soulPath: "/root/SOUL.md",
				readSoulContent: () => {
					throw new Error("should not read disabled soul");
				},
			}),
		).resolves.toEqual({
			title: "Soul disabled",
			output: "Soul-memory is disabled in settings.",
			metadata: { disabled: true },
		});

		await expect(
			handleSoulMemorySoulGetTool({
				enabled: true,
				soulPath: "/root/SOUL.md",
				readSoulContent: () => "voice notes",
			}),
		).resolves.toEqual({
			title: "SOUL.md",
			output: "voice notes",
			metadata: { path: "/root/SOUL.md" },
		});

		const updates: Array<{
			content: string;
			mode: "replace" | "append";
			heading?: string;
		}> = [];
		const update = (args: {
			content: string;
			mode: "replace" | "append";
			heading?: string;
		}) => {
			updates.push(args);
			return {
				mode: args.mode,
				absolutePath: "/root/SOUL.md",
				changed: true,
			};
		};

		await expect(
			handleSoulMemorySoulUpdateTool({
				args: { content: "new voice" },
				update,
			}),
		).resolves.toEqual({
			title: "SOUL.md updated",
			output: "SOUL.md updated at /root/SOUL.md. Tell the user what changed.",
			metadata: {
				mode: "replace",
				absolutePath: "/root/SOUL.md",
				changed: true,
			},
		});

		await expect(
			handleSoulMemorySoulUpdateTool({
				args: { content: "appendix", mode: "append", heading: "Tone" },
				update,
			}),
		).resolves.toMatchObject({
			title: "SOUL.md appended",
			output: "SOUL.md appended at /root/SOUL.md. Tell the user what changed.",
		});

		expect(updates).toEqual([
			{ content: "new voice", mode: "replace", heading: undefined },
			{ content: "appendix", mode: "append", heading: "Tone" },
		]);
	});

	it("resolves memory_get tool results in core through file excerpt adapters", async () => {
		await expect(
			handleSoulMemoryGetTool({
				args: { path: "MEMORY.md" },
				enabled: false,
				readFileExcerpt: () => {
					throw new Error("should not read when disabled");
				},
			}),
		).resolves.toEqual({
			title: "Memory disabled",
			output: "Soul-memory is disabled in settings.",
			metadata: { disabled: true },
		});

		await expect(
			handleSoulMemoryGetTool({
				args: { path: "MEMORY.md", startLine: 2, lines: 2 },
				enabled: true,
				readFileExcerpt: (args) => ({
					relativePath: args.path,
					text: "line 2\nline 3",
					startLine: 2,
					endLine: 3,
					totalLines: 6,
					truncated: true,
				}),
			}),
		).resolves.toEqual({
			title: "Memory file: MEMORY.md",
			output:
				"line 2\nline 3\n\n[More content available. Continue from line 4.]",
			metadata: {
				path: "MEMORY.md",
				startLine: 2,
				endLine: 3,
				totalLines: 6,
				truncated: true,
			},
		});
	});

	it("handles soul commands in core through workspace and file adapters", async () => {
		const notifications: Array<{
			message: string;
			level?: "info" | "warn" | "error";
		}> = [];
		const followUps: string[] = [];
		const workspace = {
			soulPath: "/tmp/SOUL.md",
			settings: {
				bootstrapMaxChars: 100,
			},
		};
		const run = (args: string) =>
			handleSoulMemorySoulCommand({
				args,
				ctx: {
					sessionId: "session-1",
					notify: (message, level) => notifications.push({ message, level }),
					followUp: (content) => followUps.push(content),
				},
				getWorkspace: () => workspace,
				readSoulContent: (_workspace, maxChars) =>
					"warm voice\n".repeat(20).slice(0, maxChars),
			});

		await run("status");
		expect(notifications.at(-1)?.message).toContain("SOUL.md: /tmp/SOUL.md");

		await run("show");
		expect(notifications.at(-1)?.message).toContain("warm voice");

		await run("rewrite make the voice warmer");
		expect(followUps.at(-1)).toContain("make the voice warmer");
		expect(notifications.at(-1)?.message).toBe(
			"Queued a SOUL.md revision request for the assistant.",
		);

		await run("rewrite");
		expect(notifications.at(-1)).toEqual({
			message: "Usage: /soul rewrite <instruction>",
			level: "warn",
		});
	});

	it("formats memory status command output in core", () => {
		const output = formatSoulMemoryCommandStatus({
			root: "/memory-root",
			userPath: "/memory-root/USER.md",
			memoryPath: "/memory-root/MEMORY.md",
			review: {
				enabled: true,
				interval: 4,
				turnsUntilReview: 2,
				lastRunAt: Date.UTC(2026, 5, 25, 7, 0, 0),
				lastStatus: "ok",
				lastApplied: 1,
			},
		});

		expect(output).toContain("Root: /memory-root");
		expect(output).toContain("USER.md: /memory-root/USER.md");
		expect(output).toContain("MEMORY.md: /memory-root/MEMORY.md");
		expect(output).toContain(
			"Memory Review: on, every 4 user turns (2 until next)",
		);
		expect(output).toContain("Last review:");
	});

	it("validates accessible managed memory relative paths in core", () => {
		expect(assertSoulMemoryAccessibleRelativePath("USER.md")).toBe("USER.md");
		expect(assertSoulMemoryAccessibleRelativePath("daily\\2026-06-25.md")).toBe(
			"daily/2026-06-25.md",
		);
		expect(
			assertSoulMemoryAccessibleRelativePath("memory\\2026-06-25.md"),
		).toBe("memory/2026-06-25.md");
		expect(() => assertSoulMemoryAccessibleRelativePath("SOUL.md")).toThrow(
			"Only USER.md, MEMORY.md, and files under daily/ can be accessed",
		);
		expect(() => assertSoulMemoryAccessibleRelativePath("DREAMS.md")).toThrow(
			"Only USER.md, MEMORY.md, and files under daily/ can be accessed",
		);
		expect(
			assertSoulMemoryAccessibleRelativePath("DREAMS.md", {
				allowDreams: true,
			}),
		).toBe("DREAMS.md");
	});

	it("builds capture and dreaming prompt inputs in core", async () => {
		expect(
			buildSoulMemoryCaptureInput({
				context: {
					messages: [
						{ role: "user", content: "remember Bun" },
						{ role: "assistant", content: "noted" },
					],
					lastUserMessage: "remember Bun",
					lastAssistantMessage: "noted",
				},
				dailyRelativePath: "memory/2026-06-25.md",
				dailyContent: "- Existing daily note.",
				maxChars: 1000,
			}),
		).toContain("Current daily note (memory/2026-06-25.md):");

		await expect(
			buildSoulMemoryCaptureInputWithAdapters({
				context: {
					messages: [
						{ role: "user", content: "remember Bun" },
						{ role: "assistant", content: "noted" },
					],
					lastUserMessage: "remember Bun",
					lastAssistantMessage: "noted",
				},
				dailyRelativePath: "memory/2026-06-25.md",
				readDailyContent: () => "- Adapter daily note.",
				maxChars: 1000,
			}),
		).resolves.toContain("- Adapter daily note.");

		expect(
			compactSoulMemoryCaptureInput(
				{
					messages: [
						{ role: "system", content: "ignored" },
						{ role: "user", content: "remember Bun" },
						{ role: "assistant", content: "noted" },
					],
					lastUserMessage: "remember Bun",
					lastAssistantMessage: "noted",
				},
				1000,
			),
		).toContain("Latest assistant response:\nnoted");

		expect(
			buildSoulMemoryExistingMemorySummary({
				memoryContent: "Project uses Bun.",
			}),
		).toContain("## Existing MEMORY.md");

		expect(
			buildSoulMemoryReviewInput({
				messages: [
					{ role: "user", content: "Please remember Bun." },
					{ role: "assistant", content: "Noted." },
				],
				soulContent: "Soul fact.",
				dreamsContent: "",
				userContent: "User fact.",
				memoryContent: "Long-term fact.",
				maxChars: 2000,
			}),
		).toContain("# Conversation snapshot");
	});

	it("builds memory review input through core read adapters", async () => {
		const calls: string[] = [];
		const input = await buildSoulMemoryReviewInputWithAdapters({
			messages: [
				{ role: "user", content: "Keep this in memory." },
				{ role: "assistant", content: "Saved." },
			],
			maxChars: 3000,
			async readPlain(target) {
				calls.push(`plain:${target}`);
				return {
					relativePath: target === "soul" ? "SOUL.md" : "DREAMS.md",
					content: `${target} content`,
				};
			},
			async readHermes(target) {
				calls.push(`hermes:${target}`);
				return {
					relativePath: `${target.toUpperCase()}.md`,
					content: `${target} content`,
					entries: [`${target} content`],
				};
			},
		});

		expect(calls.sort()).toEqual([
			"hermes:memory",
			"hermes:user",
			"plain:dreams",
			"plain:soul",
		]);
		expect(input).toContain("# Existing SOUL.md");
		expect(input).toContain("soul content");
		expect(input).toContain("# Existing USER.md");
		expect(input).toContain("memory content");
		expect(input).toContain("# Conversation snapshot");
	});

	it("builds soul-memory prompt context fragments in core", () => {
		const fragments = buildSoulMemoryPromptFragments({
			rulesPrompt: "Rules",
			soulPath: "/memory/SOUL.md",
			soulContent: "Soul content",
			hermesFileMemory: "Hermes memory",
		});

		expect(
			fragments.map((fragment) => `${fragment.role}:${fragment.source}`),
		).toEqual([
			"developer:memory/soul-memory-rules",
			"developer:plugins/soul-memory/SOUL.md",
			"user:plugins/soul-memory/hermes-file-memory",
		]);
		expect(fragments[1].content).toContain("Path: /memory/SOUL.md");

		const emptyFragments = buildSoulMemoryPromptFragments({
			rulesPrompt: "Rules",
			soulPath: "/memory/SOUL.md",
			soulContent: "# SOUL.md\n\n",
			hermesFileMemory: null,
		});
		expect(emptyFragments[1].content).toContain("(empty — SOUL.md has no persona content yet");
	});

	it("patches nested soul-memory settings sections without host store access", () => {
		const settings = {
			general: {
				locale: "zh-CN",
				soulMemory: {
					dreaming: {
						enabled: true,
						frequency: "0 3 * * *",
					},
					capture: {
						enabled: true,
					},
				},
			},
			ai: { provider: "deepseek" },
		};

		expect(
			patchSoulMemorySettingsSection(settings, "dreaming", {
				frequency: "0 4 * * *",
				timezone: "Asia/Shanghai",
			}),
		).toEqual({
			general: {
				locale: "zh-CN",
				soulMemory: {
					dreaming: {
						enabled: true,
						frequency: "0 4 * * *",
						timezone: "Asia/Shanghai",
					},
					capture: {
						enabled: true,
					},
				},
			},
			ai: { provider: "deepseek" },
		});

		expect(
			patchSoulMemorySettingsSection({ general: {} }, "review", {
				enabled: false,
			}),
		).toEqual({
			general: {
				soulMemory: {
					review: {
						enabled: false,
					},
				},
			},
		});
	});

	it("patches soul-memory settings sections through core host adapters", () => {
		let settings = {
			general: {
				soulMemory: {
					review: {
						enabled: true,
						intervalTurns: 8,
					},
				},
			},
		};
		const writes: Array<typeof settings> = [];

		const result = patchSoulMemorySettingsSectionWithAdapters({
			section: "review",
			patch: { intervalTurns: 12 },
			getSettings: () => settings,
			saveSettings: (next) => {
				settings = next;
				writes.push(next);
			},
			resolveSettings: (current) => ({
				review: {
					enabled: Boolean((current.general.soulMemory as any).review.enabled),
					intervalTurns: Number(
						(current.general.soulMemory as any).review.intervalTurns,
					),
				},
			}),
			selectSection: (resolved) => resolved.review,
		});

		expect(result).toEqual({ enabled: true, intervalTurns: 12 });
		expect(writes).toHaveLength(1);
		expect(settings.general.soulMemory.review.intervalTurns).toBe(12);
	});

	it("builds timeline entries and status text in core", () => {
		expect(
			createSoulMemoryTimelineEntry(
				{ type: "step", title: "Dreamed", status: "ok" },
				{ now: () => 123, randomId: () => "entry-1" },
			),
		).toEqual({
			id: "entry-1",
			timestamp: 123,
			type: "step",
			title: "Dreamed",
			status: "ok",
		});

		expect(
			formatSoulMemoryReviewStatus({
				enabled: true,
				interval: 6,
				maxInputChars: 12000,
				timeoutMs: 20000,
				maxCandidates: 4,
				minConfidence: 0.75,
				userTurns: 10,
				turnsUntilReview: 2,
				lastReviewedTurn: 8,
			}),
		).toContain("Last reviewed turn: 8");
	});

	it("builds review status DTOs in core", () => {
		const storeValues = new Map<string, unknown>([
			["lastReviewAt", 500],
			["lastReviewApplied", 2],
			["lastReviewStatus", "stored-review"],
			["review:last:agent-a:s1", 2],
		]);
		const store = {
			get: <T>(key: string) => storeValues.get(key) as T | undefined,
		};

		expect(
			buildSoulMemoryReviewStatus({
				enabled: true,
				settings: {
					enabled: true,
					interval: 5,
					maxInputChars: 12000,
					timeoutMs: 20000,
					maxCandidates: 4,
					minConfidence: 0.75,
				},
				progress: {
					userTurns: 13,
					turnsSinceReview: 3,
					turnsUntilReview: 2,
					shouldReview: false,
				},
				lastReviewedTurn: 10,
				store,
				runtimeStatus: { lastReviewStatus: "runtime-review" },
			}),
		).toMatchObject({
			enabled: true,
			interval: 5,
			userTurns: 13,
			turnsUntilReview: 2,
			lastRunAt: 500,
			lastApplied: 2,
			lastStatus: "stored-review",
			lastReviewedTurn: 10,
		});

		expect(
			buildSoulMemoryReviewStatusWithAdapters({
				enabled: true,
				settings: {
					enabled: true,
					interval: 3,
					maxInputChars: 12000,
					timeoutMs: 20000,
					maxCandidates: 4,
					minConfidence: 0.75,
				},
				messages: [
					{ role: "user" },
					{ role: "assistant" },
					{ role: "user" },
					{ role: "user" },
				],
				keyPrefix: "review:last:",
				agentId: "agent-a",
				sessionId: "s1",
				store,
				runtimeStatus: { lastReviewStatus: "runtime-review" },
			}),
		).toMatchObject({
			enabled: true,
			userTurns: 3,
			turnsSinceReview: 0,
			turnsUntilReview: 0,
			shouldReview: true,
			lastReviewedTurn: 2,
			lastRunAt: 500,
			lastStatus: "stored-review",
		});

		const overview = buildSoulMemoryOverview({
			workspace: {
				enabled: true,
				agentId: "agent-a",
				root: "/memory-root",
				memoryDir: "/memory-root/memory",
				soulPath: "/memory-root/SOUL.md",
				userPath: "/memory-root/USER.md",
				memoryPath: "/memory-root/MEMORY.md",
				dreamsPath: "/memory-root/DREAMS.md",
				todayPath: "/memory-root/memory/2026-06-25.md",
				settings: { enabled: true },
			},
			status: {
				lastCaptureStatus: "runtime-capture",
			},
			captureStatusStore: {
				get: <T>(key: string) =>
					({
						lastCaptureAt: 700,
						lastCaptureStatus: "stored-capture",
					})[key] as T | undefined,
			},
			pendingCaptures: [{ id: "capture-1" }],
			files: [{ relativePath: "MEMORY.md" }],
		});

		expect(overview).toMatchObject({
			enabled: true,
			agentId: "agent-a",
			root: "/memory-root",
			status: {
				lastCaptureAt: 700,
				lastCaptureStatus: "stored-capture",
			},
			pendingCaptures: [{ id: "capture-1" }],
			files: [{ relativePath: "MEMORY.md" }],
		});
	});

	it("applies status mutation plans to an injected store and runtime status in core", () => {
		const storeValues = new Map<string, unknown>([
			["lastCaptureError", "old error"],
		]);
		const runtimeStatus = {
			lastCaptureError: "old error" as string | undefined,
			lastCaptureStatus: "error",
		};

		applySoulMemoryStatusMutationPlan({
			store: {
				set: (key, value) => storeValues.set(key, value),
				delete: (key) => storeValues.delete(key),
			},
			runtimeStatus,
			plan: planSoulMemoryCaptureSuccessStatusMutation({
				status: "approved",
				capturedAt: 100,
			}),
		});

		expect(storeValues.get("lastCaptureStatus")).toBe("approved");
		expect(storeValues.has("lastCaptureError")).toBe(false);
		expect(runtimeStatus).toMatchObject({
			lastCaptureAt: 100,
			lastCaptureStatus: "approved",
		});
		expect(runtimeStatus.lastCaptureError).toBeUndefined();
	});

	it("runs memory capture in core through model and daily-note adapters", async () => {
		let now = 1000;
		const settings = {
			enabled: true,
			mode: "explicit-only" as const,
			maxInputChars: 4000,
			timeoutMs: 1000,
		};
		const context = {
			messages: [
				{
					role: "user",
					content: "please remember that this repo uses Bun scripts",
				},
				{ role: "assistant", content: "Noted." },
			],
			lastUserMessage: "please remember that this repo uses Bun scripts",
			lastAssistantMessage: "Noted.",
		};
		const statusPlans: unknown[] = [];
		const diagnostics: unknown[] = [];
		const notifications: unknown[] = [];
		let generatedPrompt = "";
		const base = {
			sessionId: "session-1",
			assistantMessageId: "assistant-1",
			context,
			enabled: true,
			capture: settings,
			dailyRelativePath: "memory/2026-06-25.md",
			readDailyContent: () => "- Existing note.",
			hash: (value: string) => `hash:${value.length}:${value.slice(0, 8)}`,
			resolveProvider: () => ({
				provider: { id: "provider" },
				providerId: "deepseek",
				model: "deepseek-chat",
				source: "tools",
			}),
			generateCapture: ({
				system,
				prompt,
			}: {
				system: string;
				prompt: string;
			}) => {
				expect(system).toBe(CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT);
				generatedPrompt = prompt;
				return JSON.stringify({
					action: "capture",
					confidence: 0.9,
					memories: [
						{
							action: "add",
							confidence: 0.9,
							content: "用户今天确认 start-electron 使用 Bun scripts。",
						},
					],
				});
			},
			applyDailyActions: () => ({
				relativePath: "memory/2026-06-25.md",
				applied: 1,
				added: 1,
				replaced: 0,
				removed: 0,
				skipped: 0,
			}),
			applyStatusMutation: (plan: unknown) => {
				statusPlans.push(plan);
			},
			notify: (message: string, level?: "info" | "warn" | "error") => {
				notifications.push({ message, level });
			},
			logDiagnostic: (event: unknown) => diagnostics.push(event),
			now: () => now,
		};

		await expect(runSoulMemoryCapture(base)).resolves.toMatchObject({
			status: "saved",
			explicitIntent: true,
			applied: 1,
			relativePath: "memory/2026-06-25.md",
			lastStatus: "daily-saved daily:add:1 replace:0 remove:0 skipped:0",
		});
		expect(generatedPrompt).toContain(
			"Current daily note (memory/2026-06-25.md):",
		);
		expect(generatedPrompt).toContain("Latest user message:");
		expect(statusPlans).toHaveLength(1);
		expect(statusPlans.at(0)).toMatchObject({
			storeSet: [
				["lastCaptureAt", 1000],
				[
					"lastCaptureStatus",
					"daily-saved daily:add:1 replace:0 remove:0 skipped:0",
				],
			],
		});
		expect(notifications).toEqual([
			{ message: "Daily note saved to memory/2026-06-25.md", level: "info" },
		]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					operation: "after-assistant-response",
					stage: "start",
					status: "started",
				}),
				expect.objectContaining({
					operation: "model-classify",
					stage: "request",
					status: "started",
				}),
				expect.objectContaining({
					operation: "after-assistant-response",
					stage: "finish",
					status: "ok",
				}),
			]),
		);

		now = 2000;
		statusPlans.length = 0;
		await expect(
			runSoulMemoryCapture({
				...base,
				sessionId: "session-2",
				capture: { ...settings, mode: "auto" },
				generateCapture: () =>
					JSON.stringify({ action: "none", confidence: 1, memories: [] }),
			}),
		).resolves.toMatchObject({
			status: "none",
			lastStatus: "none",
		});
		expect(statusPlans.at(-1)).toEqual(
			planSoulMemoryCaptureRuntimeStatusMutation("none"),
		);
	});

	it("skips and records memory capture errors in core", async () => {
		const settings = {
			enabled: true,
			mode: "explicit-only" as const,
			maxInputChars: 4000,
			timeoutMs: 1000,
		};
		const context = {
			messages: [
				{ role: "user", content: "No explicit memory intent here." },
				{ role: "assistant", content: "Okay." },
			],
			lastUserMessage: "No explicit memory intent here.",
			lastAssistantMessage: "Okay.",
		};
		const statusPlans: unknown[] = [];
		const diagnostics: unknown[] = [];
		const base = {
			sessionId: "session-1",
			assistantMessageId: "assistant-1",
			context,
			enabled: true,
			capture: settings,
			dailyRelativePath: "memory/2026-06-25.md",
			readDailyContent: () => "",
			hash: (value: string) => `hash:${value.length}`,
			resolveProvider: () => ({
				provider: {},
				providerId: "deepseek",
				model: "deepseek-chat",
			}),
			generateCapture: () => {
				throw new Error("provider failed");
			},
			applyDailyActions: () => null,
			applyStatusMutation: (plan: unknown) => {
				statusPlans.push(plan);
			},
			logDiagnostic: (event: unknown) => diagnostics.push(event),
			now: () => 3000,
		};

		await expect(runSoulMemoryCapture(base)).resolves.toMatchObject({
			status: "skipped",
			explicitIntent: false,
			lastStatus: "skipped",
		});
		expect(statusPlans.at(-1)).toEqual(
			planSoulMemoryCaptureRuntimeStatusMutation("skipped"),
		);
		expect(diagnostics.at(-1)).toMatchObject({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
		});

		statusPlans.length = 0;
		await expect(
			runSoulMemoryCapture({
				...base,
				context: {
					...context,
					lastUserMessage: "please remember that this should be captured",
				},
			}),
		).resolves.toMatchObject({
			status: "error",
			error: "provider failed",
			lastStatus: "error",
		});
		expect(statusPlans.at(-1)).toEqual(
			planSoulMemoryCaptureErrorStatusMutation("provider failed"),
		);
		expect(diagnostics.at(-1)).toMatchObject({
			operation: "after-assistant-response",
			stage: "finish",
			status: "error",
		});
	});

	it("selects memory tool providers from settings in core", () => {
		const settings = {
			ai: {
				provider: "deepseek",
				providers: {
					deepseek: { model: "deepseek-chat" },
					openai: { selectedModels: ["gpt-5.3"] },
				},
				customProviders: [
					{
						id: "custom-local",
						model: "local-model",
						baseUrl: "http://localhost",
					},
				],
			},
			tools: {
				toolCallModel: {
					providerId: "openai",
					model: "gpt-5.3-mini",
				},
			},
		};

		expect(resolveSoulMemoryToolProviderSelection(settings)).toEqual({
			providerId: "openai",
			model: "gpt-5.3-mini",
			source: "tool",
			config: { selectedModels: ["gpt-5.3"], model: "gpt-5.3-mini" },
		});
		expect(formatSoulMemoryToolModelRef(settings)).toBe("openai/gpt-5.3-mini");
		expect(
			resolveSoulMemoryProviderConfig(settings, "custom-local", "local-model")
				.config,
		).toEqual({
			id: "custom-local",
			model: "local-model",
			baseUrl: "http://localhost",
		});

		expect(
			resolveSoulMemoryToolProviderSelection({
				...settings,
				tools: {},
			}).source,
		).toBe("default");

		const selection = resolveSoulMemoryToolProviderSelection(settings);
		expect(
			createSoulMemoryToolProvider(
				selection,
				{
					kind: "api-key",
					apiKey: "test-key",
				},
				"Memory Dreaming",
			),
		).toMatchObject({
			providerId: "openai",
			modelRef: "openai/gpt-5.3-mini",
			config: {
				model: "gpt-5.3-mini",
				selectedModels: ["gpt-5.3"],
				apiKey: "test-key",
				authContext: { kind: "api-key", apiKey: "test-key" },
			},
		});

		expect(
			createSoulMemoryToolProvider(
				{
					...selection,
					config: { model: "fallback-model" },
				},
				{
					kind: "oauth",
					token: "oauth-token",
				},
				"Memory Review",
			),
		).toMatchObject({
			modelRef: "openai/gpt-5.3-mini",
			config: {
				selectedModels: ["gpt-5.3-mini"],
				apiKey: "",
				oauthToken: "oauth-token",
			},
		});

		expect(() =>
			createSoulMemoryToolProvider(selection, null, "Memory Dreaming"),
		).toThrow(soulMemoryToolProviderAuthError(selection, "Memory Dreaming"));
	});

	it("dedupes capture lines against existing memory text in core", async () => {
		const existing = ["- User prefers Bun.", "- Existing note."].join("\n");
		expect(
			dedupeSoulMemoryCaptureLines(existing, [
				"- User prefers Bun.",
				"- New project uses headless core.",
				"- New project uses headless core.",
			]),
		).toEqual(["- New project uses headless core."]);

		expect(
			dedupeSoulMemoryDailyNoteBullets(existing, [
				"User prefers Bun.",
				"User confirmed CLI smoke tests.",
			]),
		).toEqual(["User confirmed CLI smoke tests."]);

		await expect(
			buildSoulMemoryCaptureDedupeTextWithAdapters({
				readMemoryContent: () => "- User prefers Bun.",
				readDailyContent: () => "- Existing note.",
			}),
		).resolves.toBe("- User prefers Bun.\n- Existing note.");

		await expect(
			dedupeSoulMemoryCaptureLinesWithAdapters({
				readMemoryContent: () => "- User prefers Bun.",
				readDailyContent: () => "- Existing note.",
				lines: ["- Existing note.", "- New adapter note."],
			}),
		).resolves.toEqual(["- New adapter note."]);

		await expect(
			dedupeSoulMemoryDailyNoteBulletsWithAdapters({
				readMemoryContent: () => "- User prefers Bun.",
				readDailyContent: () => "- Existing note.",
				bullets: ["Existing note.", "Adapter added note."],
			}),
		).resolves.toEqual(["Adapter added note."]);
	});

	it("describes managed memory files and reads excerpts in core", async () => {
		expect(
			resolveSoulMemoryFilePath({
				root: "/repo/memory-root",
				inputPath: "memory/2026-06-25.md",
			}),
		).toEqual({
			absolutePath: "/repo/memory-root/memory/2026-06-25.md",
			relativePath: "memory/2026-06-25.md",
		});
		expect(() =>
			resolveSoulMemoryFilePath({
				root: "/repo/memory-root",
				inputPath: "../outside.md",
			}),
		).toThrow("Path is outside the configured memory directory");
		expect(
			resolveSoulMemoryManagedFilePath({
				root: "/repo/memory-root",
				inputPath: "DREAMS.md",
			}),
		).toEqual({
			absolutePath: "/repo/memory-root/DREAMS.md",
			relativePath: "DREAMS.md",
		});
		expect(() =>
			resolveSoulMemoryManagedFilePath({
				root: "/repo/memory-root",
				inputPath: "private.md",
			}),
		).toThrow(
			"Only SOUL.md, USER.md, MEMORY.md, DREAMS.md, and files under memory/ can be accessed",
		);
		expect(
			resolveSoulMemoryPlainReviewFilePath({
				soulPath: "/repo/memory-root/SOUL.md",
				dreamsPath: "/repo/memory-root/DREAMS.md",
				target: "soul",
			}),
		).toEqual({
			absolutePath: "/repo/memory-root/SOUL.md",
			relativePath: "SOUL.md",
		});
		expect(
			resolveSoulMemoryPlainReviewFilePath({
				soulPath: "/repo/memory-root/SOUL.md",
				dreamsPath: "/repo/memory-root/DREAMS.md",
				target: "dreams",
			}),
		).toEqual({
			absolutePath: "/repo/memory-root/DREAMS.md",
			relativePath: "DREAMS.md",
		});

		expect(
			resolveSoulMemoryAppendTarget({
				root: "/repo/memory-root",
				memoryPath: "/repo/memory-root/MEMORY.md",
				todayPath: "/repo/memory-root/memory/2026-06-25.md",
			}),
		).toEqual({
			absolutePath: "/repo/memory-root/memory/2026-06-25.md",
			relativePath: "memory/2026-06-25.md",
		});
		expect(() =>
			resolveSoulMemoryAppendTarget({
				root: "/repo/memory-root",
				memoryPath: "/repo/memory-root/MEMORY.md",
				todayPath: "/repo/memory-root/memory/2026-06-25.md",
				target: "memory",
			}),
		).toThrow("MEMORY.md is a legacy compatibility file");
		expect(
			buildSoulMemoryAppendPayload({
				relativePath: "memory\\2026-06-25.md",
				content: "  hello memory  ",
				heading: "Now",
				exists: false,
			}),
		).toEqual({
			heading: "Now",
			content: "hello memory",
			text: "# 2026-06-25\n\n## Now\n\nhello memory\n",
		});
		expect(() =>
			buildSoulMemoryAppendPayload({
				relativePath: "memory/2026-06-25.md",
				content: "   ",
				exists: true,
			}),
		).toThrow("Memory content is empty");
		expect(
			planSoulMemoryDailyNoteAppend({
				bullets: [
					"  - 用户今天完成了 headless core 拆分。 ",
					"",
					"* 用户今天验证了 CLI tool call。",
				],
				heading: "Now",
			}),
		).toEqual({
			heading: "Now",
			content:
				"- 用户今天完成了 headless core 拆分。\n- 用户今天验证了 CLI tool call。",
		});
		expect(
			planSoulMemoryDailyNoteAppend({
				bullets: ["   ", "-   "],
				heading: "Ignored",
			}),
		).toBeNull();
		expect(
			planSoulMemoryDailyNoteAppend({
				bullets: ["用户今天复核了 core 边界。"],
				now: new Date(2026, 5, 25, 8, 9, 0),
			})?.heading,
		).toMatch(/8:09|08:09/);
		expect(
			buildSoulMemoryManagedFileCandidates({
				soulPath: "/repo/memory-root/SOUL.md",
				userPath: "/repo/memory-root/USER.md",
				memoryPath: "/repo/memory-root/MEMORY.md",
				dreamsPath: "/repo/memory-root/DREAMS.md",
				indexedFiles: [
					{
						absolutePath: "/repo/memory-root/MEMORY.md",
						relativePath: "MEMORY.md",
						kind: "memory",
					},
					{
						absolutePath: "/repo/memory-root/memory/2026-06-25.md",
						relativePath: "memory\\2026-06-25.md",
						kind: "daily",
						date: "2026-06-25",
					},
				],
			}),
		).toEqual([
			{
				absolutePath: "/repo/memory-root/SOUL.md",
				relativePath: "SOUL.md",
				kind: "soul",
			},
			{
				absolutePath: "/repo/memory-root/USER.md",
				relativePath: "USER.md",
				kind: "user",
			},
			{
				absolutePath: "/repo/memory-root/MEMORY.md",
				relativePath: "MEMORY.md",
				kind: "memory",
			},
			{
				absolutePath: "/repo/memory-root/DREAMS.md",
				relativePath: "DREAMS.md",
				kind: "dreams",
			},
			{
				absolutePath: "/repo/memory-root/memory/2026-06-25.md",
				relativePath: "memory/2026-06-25.md",
				kind: "daily",
				date: "2026-06-25",
			},
		]);

		expect(
			describeSoulMemoryManagedFile({
				absolutePath: "/tmp/MEMORY.md",
				relativePath: "memory\\2026-06-25.md",
				kind: "daily",
				date: "2026-06-25",
				size: 42,
				mtimeMs: 100,
				content: "# 2026-06-25\n\n- First note\n- Second note",
			}),
		).toEqual({
			absolutePath: "/tmp/MEMORY.md",
			relativePath: "memory/2026-06-25.md",
			kind: "daily",
			date: "2026-06-25",
			size: 42,
			mtimeMs: 100,
			lineCount: 4,
			preview: "- First note - Second note",
		});

		expect(resolveSoulMemoryManagedFileMetadata("SOUL.md")).toEqual({
			relativePath: "SOUL.md",
			kind: "soul",
		});
		expect(
			resolveSoulMemoryManagedFileMetadata("memory\\2026-06-25.md"),
		).toEqual({
			relativePath: "memory/2026-06-25.md",
			kind: "daily",
			date: "2026-06-25",
		});

		await expect(
			describeSoulMemoryManagedFileWithAdapters({
				absolutePath: "/repo/memory-root/SOUL.md",
				relativePath: "SOUL.md",
				kind: "soul",
				statFile: () => ({ isFile: () => true, size: 12, mtimeMs: 50 }),
				readFile: () => "# Soul\n\nSteady voice",
			}),
		).resolves.toMatchObject({
			relativePath: "SOUL.md",
			kind: "soul",
			size: 12,
			mtimeMs: 50,
			preview: "Steady voice",
		});

		const readFullMemoryFile = vi.fn(
			() => "# Soul\n\nFull content should stay lazy",
		);
		const readPreviewMemoryFile = vi.fn(() => "# Soul\n\nPreview only");
		const countMemoryLines = vi.fn(() => 123);
		await expect(
			describeSoulMemoryManagedFileWithAdapters({
				absolutePath: "/repo/memory-root/SOUL.md",
				relativePath: "SOUL.md",
				kind: "soul",
				statFile: () => ({ isFile: () => true, size: 4096, mtimeMs: 51 }),
				countLines: countMemoryLines,
				readFile: readFullMemoryFile,
				readPreviewFile: readPreviewMemoryFile,
			}),
		).resolves.toMatchObject({
			relativePath: "SOUL.md",
			lineCount: 123,
			preview: "Preview only",
		});
		expect(countMemoryLines).toHaveBeenCalledWith(
			"/repo/memory-root/SOUL.md",
			expect.objectContaining({ relativePath: "SOUL.md", kind: "soul" }),
		);
		expect(readPreviewMemoryFile).toHaveBeenCalledWith(
			"/repo/memory-root/SOUL.md",
			expect.objectContaining({ relativePath: "SOUL.md", kind: "soul" }),
			8192,
		);
		expect(readFullMemoryFile).not.toHaveBeenCalled();

		await expect(
			listSoulMemoryManagedFilesWithAdapters({
				soulPath: "/repo/memory-root/SOUL.md",
				userPath: "/repo/memory-root/USER.md",
				memoryPath: "/repo/memory-root/MEMORY.md",
				dreamsPath: "/repo/memory-root/DREAMS.md",
				indexedFiles: [
					{
						absolutePath: "/repo/memory-root/memory/2026-06-25.md",
						relativePath: "memory/2026-06-25.md",
						kind: "daily",
						date: "2026-06-25",
					},
					{
						absolutePath: "/repo/memory-root/ignored.md",
						relativePath: "ignored.md",
						kind: "other",
					},
				],
				statFile: (absolutePath) =>
					absolutePath.endsWith("USER.md")
						? { isFile: () => false, size: 0, mtimeMs: 0 }
						: {
								isFile: () => true,
								size: absolutePath.length,
								mtimeMs: absolutePath.endsWith("2026-06-25.md") ? 500 : 100,
							},
				readFile: (absolutePath) =>
					absolutePath.endsWith("2026-06-25.md")
						? "# 2026-06-25\n\nDaily note"
						: `${absolutePath} content`,
			}),
		).resolves.toMatchObject([
			{ relativePath: "SOUL.md", kind: "soul" },
			{ relativePath: "MEMORY.md", kind: "memory" },
			{ relativePath: "DREAMS.md", kind: "dreams" },
			{
				relativePath: "memory/2026-06-25.md",
				kind: "daily",
				preview: "Daily note",
			},
		]);

		expect(
			readSoulMemoryFileExcerptFromContent({
				relativePath: "MEMORY.md",
				content: ["one", "two", "three", "four"].join("\n"),
				startLine: 2,
				lines: 2,
				defaultLines: 3,
				maxLines: 3,
			}),
		).toEqual({
			relativePath: "MEMORY.md",
			text: "two\nthree",
			startLine: 2,
			endLine: 3,
			totalLines: 4,
			truncated: true,
		});

		await expect(
			readSoulMemoryManagedFileExcerptWithAdapters({
				root: "/repo/memory-root",
				inputPath: "memory/2026-06-25.md",
				startLine: 2,
				lines: 1,
				defaultLines: 3,
				maxLines: 3,
				readFile: (_absolutePath, target) =>
					[`path:${target.relativePath}`, "line two", "line three"].join("\n"),
			}),
		).resolves.toEqual({
			relativePath: "memory/2026-06-25.md",
			text: "line two",
			startLine: 2,
			endLine: 2,
			totalLines: 3,
			truncated: true,
		});

		await expect(
			readSoulMemoryManagedFileWithAdapters({
				root: "/repo/memory-root",
				inputPath: "",
				defaultLines: 3,
				maxLines: 3,
				readFile: () => "",
			}),
		).rejects.toThrow("Memory file path is required");
		await expect(
			readSoulMemoryManagedFileWithAdapters({
				root: "/repo/memory-root",
				inputPath: "USER.md",
				defaultLines: 3,
				maxLines: 3,
				readFile: () => ["alpha", "beta"].join("\n"),
			}),
		).resolves.toMatchObject({
			relativePath: "USER.md",
			text: "alpha\nbeta",
			totalLines: 2,
		});

		expect(normalizeSoulMemoryRelativePath("memory\\2026-06-25.md")).toBe(
			"memory/2026-06-25.md",
		);
		expect(formatSoulMemoryDateString(new Date("2026-06-25T12:34:56Z"))).toBe(
			"2026-06-25",
		);
		expect(
			formatSoulMemoryDateStringDaysAgo(2, new Date("2026-06-25T12:34:56Z")),
		).toBe("2026-06-23");
		expect(hashSoulMemoryText("memory")).toBe(
			"c064fbca9d9de8dd9bb0624984403b28d0da807a69365d4f7fb09123ecb0c405",
		);
		expect(estimateSoulMemoryTokens("one two three")).toBe(4);
		expect(truncateSoulMemoryText("x".repeat(100), 20)).toBe(
			"\n\n[Truncated at 20 chars]",
		);
		expect(previewSoulMemoryLine("  hello\n\tcore   memory  ", 50)).toBe(
			"hello core memory",
		);
		expect(sanitizeSoulMemoryAgentPathSegment("agent/a:b", "default")).toBe(
			"agent_a_b",
		);
		expect(
			resolveSoulMemoryRootPath({
				settings: { directoryMode: "custom", customDirectory: "~/memory" },
				defaultAgentId: "default",
				agentsDir: "/agents",
				aiNoteDir: "/notes",
				expandPath: (value) => value.replace("~", "/home/user"),
			}),
		).toBe("/home/user/memory");
		expect(
			planSoulMemoryWorkspacePaths({
				settings: { directoryMode: "ai-note-dir" },
				defaultAgentId: "default",
				agentsDir: "/agents",
				storePath: "/store",
				aiNoteDir: "/notes",
				today: new Date("2026-06-25T12:34:56Z"),
			}),
		).toMatchObject({
			agentId: "default",
			root: "/notes",
			memoryDir: "/notes/daily",
			soulPath: "/notes/SOUL.md",
			todayPath: "/notes/daily/2026-06-25.md",
			dbPath: "/store/plugin-data/soul-memory.sqlite",
		});
		expect(
			planSoulMemoryWorkspacePaths({
				settings: {
					directoryMode: "custom",
					customDirectory: "/ignored-for-agent",
				},
				agentId: "agent/a",
				defaultAgentId: "default",
				agentsDir: "/agents",
				storePath: "/store",
				aiNoteDir: "/notes",
				today: new Date("2026-06-25T12:34:56Z"),
			}),
		).toMatchObject({
			agentId: "agent/a",
			root: "/agents/agent_a",
			dbPath: "/agents/agent_a/plugin-data/soul-memory.sqlite",
		});

		const writes = new Map<string, { content: string; mtimeMs: number }>();
		await expect(
			saveSoulMemoryManagedFileWithAdapters({
				root: "/repo/memory-root",
				inputPath: "memory/2026-06-25.md",
				content: "Saved note.   \n\n",
				writeFile: (absolutePath, content) => {
					writes.set(absolutePath, { content, mtimeMs: 700 });
				},
				statFile: (absolutePath) => {
					const write = writes.get(absolutePath);
					return write
						? {
								isFile: () => true,
								size: write.content.length,
								mtimeMs: write.mtimeMs,
							}
						: null;
				},
				readFile: (absolutePath) => writes.get(absolutePath)?.content || "",
			}),
		).resolves.toMatchObject({
			relativePath: "memory/2026-06-25.md",
			kind: "daily",
			date: "2026-06-25",
			size: "Saved note.\n".length,
			mtimeMs: 700,
			preview: "Saved note.",
		});
		expect(writes.get("/repo/memory-root/memory/2026-06-25.md")?.content).toBe(
			"Saved note.\n",
		);

		await expect(
			saveSoulMemoryManagedFileWithAdapters({
				root: "/repo/memory-root",
				inputPath: "",
				content: "ignored",
				writeFile: () => undefined,
				statFile: () => null,
				readFile: () => "",
			}),
		).rejects.toThrow("Memory file path is required");
	});

	it("manages pending captures through a core store-like interface", async () => {
		const data = new Map<string, unknown>();
		const store = {
			get: <T>(key: string) => data.get(key) as T | undefined,
			set: <T>(key: string, value: T) => data.set(key, value),
		};
		const captures = [
			{
				id: "old",
				sessionId: "s1",
				agentId: "agent-a",
				createdAt: 1,
				target: "daily" as const,
				heading: "H",
				content: "old",
				confidence: 0.8,
				explicit: false,
				userPreview: "u",
				assistantPreview: "a",
			},
			{
				id: "new",
				sessionId: "s2",
				agentId: "agent-b",
				createdAt: 2,
				target: "memory" as const,
				heading: "H",
				content: "new",
				confidence: 0.9,
				explicit: true,
				userPreview: "u",
				assistantPreview: "a",
			},
		];

		setSoulMemoryPendingCaptures(store, captures, {
			key: "pending",
			maxPending: 10,
		});
		expect(
			getSoulMemoryPendingCaptures(store, {
				key: "pending",
				maxPending: 10,
			}).map((capture) => capture.id),
		).toEqual(["new", "old"]);
		expect(
			filterSoulMemoryPendingCapturesForAgent(
				captures,
				"agent-a",
				"default",
			).map((capture) => capture.id),
		).toEqual(["old"]);
		expect(
			getSoulMemoryPublicPendingCaptures(store, {
				key: "pending",
				maxPending: 10,
				agentId: "agent-b",
				defaultAgentId: "default",
			}).map((capture) => capture.id),
		).toEqual(["new"]);
		expect(selectSoulMemoryPendingCapture(captures, "new").content).toBe("new");
		expect(
			removeSoulMemoryPendingCapture(captures, "old").map(
				(capture) => capture.id,
			),
		).toEqual(["new"]);
		expect(
			takeSoulMemoryPendingCapture(store, {
				key: "pending",
				maxPending: 10,
				id: "new",
			}),
		).toMatchObject({
			selected: { id: "new" },
			remaining: [{ id: "old" }],
		});

		const statusData = new Map<string, unknown>();
		const mutationStore = {
			get: <T>(key: string) => statusData.get(key) as T | undefined,
			set: <T>(key: string, value: T) => {
				statusData.set(key, value);
			},
			delete: (key: string) => {
				statusData.delete(key);
			},
		};
		const runtimeStatus = {
			lastCaptureError: "old error",
			lastCaptureStatus: "error",
		};
		setSoulMemoryPendingCaptures(mutationStore, captures, {
			key: "pending",
			maxPending: 10,
		});

		await expect(
			saveSoulMemoryPendingCaptureWithAdapters({
				store: mutationStore,
				runtimeStatus,
				key: "pending",
				maxPending: 10,
				id: "new",
				saveSelectedCapture: (capture) => ({ path: capture.content }),
			}),
		).resolves.toEqual({ path: "new" });
		expect(
			getSoulMemoryPendingCaptures(mutationStore, {
				key: "pending",
				maxPending: 10,
			}).map((capture) => capture.id),
		).toEqual(["old"]);
		expect(statusData.get("lastCaptureStatus")).toBe("approved");
		expect(statusData.has("lastCaptureError")).toBe(false);
		expect(runtimeStatus.lastCaptureStatus).toBe("approved");
		expect(runtimeStatus.lastCaptureError).toBeUndefined();

		expect(
			discardSoulMemoryPendingCaptureWithAdapters({
				store: mutationStore,
				runtimeStatus,
				key: "pending",
				maxPending: 10,
				id: "old",
			}).id,
		).toBe("old");
		expect(
			getSoulMemoryPendingCaptures(mutationStore, {
				key: "pending",
				maxPending: 10,
			}),
		).toEqual([]);
		expect(statusData.get("lastCaptureStatus")).toBe("discarded");
	});

	it("extracts legacy MEMORY.md bullets into graph candidates", () => {
		expect(
			extractLegacyMemoryCandidates(
				[
					"# MEMORY.md",
					"",
					"## Preferences",
					"- User prefers direct answers.",
					"",
					"## Decisions",
					"- User approved using Bun scripts.",
					"",
					"## Random",
					"- Assistant completed a task.",
				].join("\n"),
			),
		).toEqual([
			expect.objectContaining({
				kind: "preference",
				text: "User prefers direct answers.",
				target: "memory",
			}),
			expect.objectContaining({
				kind: "decision",
				text: "User approved using Bun scripts.",
				target: "memory",
			}),
		]);
	});

	it("detects explicit memory intent without host state", () => {
		expect(hasExplicitMemoryIntent("以后请叫我 Yitian")).toBe(true);
		expect(
			hasExplicitMemoryIntent("please remember that I prefer short answers"),
		).toBe(true);
		expect(hasExplicitMemoryIntent("summarize this file")).toBe(false);
	});

	it("filters raw request echoes while keeping transformed daily notes", () => {
		expect(isLikelyRawRequestEcho("sdk怎么添加已经安装的java jdk？")).toBe(
			true,
		);
		expect(parseDailyNoteBullets("- sdk怎么添加已经安装的java jdk？")).toEqual(
			[],
		);
		expect(parseDailyNoteBullets("- 用户今天学习了 Go array。")).toEqual([
			"用户今天学习了 Go array。",
		]);
	});

	it("parses daily-note add, replace, and remove mutations from compact JSON", () => {
		expect(
			parseDailyNoteCaptureResult(
				JSON.stringify({
					action: "capture",
					confidence: 0.88,
					memories: [
						{
							action: "add",
							confidence: 0.9,
							content: "用户今天在 start-electron 拆分 headless core。",
						},
						{
							action: "replace",
							oldText: "- 用户问了 core。",
							newText: "用户今天确认 headless core 要脱离 Electron。",
						},
						{
							action: "remove",
							text: "- sdk怎么添加已经安装的java jdk？",
						},
						{
							action: "add",
							sensitivity: "secret",
							content: "api key is secret",
						},
					],
				}),
			),
		).toEqual({
			confidence: 0.88,
			candidates: [
				{
					action: "add",
						confidence: 0.9,
					content: "用户今天在 start-electron 拆分 headless core。",
				},
				{
					action: "replace",
					confidence: 0.88,
					oldText: "- 用户问了 core。",
					newText: "用户今天确认 headless core 要脱离 Electron。",
				},
				{
					action: "remove",
					confidence: 0.88,
					text: "- sdk怎么添加已经安装的java jdk？",
				},
			],
		});
	});

	it("applies daily-note line replacement and removal without filesystem access", () => {
		const content = [
			"# 2026-06-25",
			"",
			"- 用户问了 core。",
			"- sdk怎么添加已经安装的java jdk？",
			"",
		].join("\n");

		const replaced = applyDailyNoteLineReplace(
			content,
			"- 用户问了 core。",
			"用户今天确认 headless core 要脱离 Electron。",
		);
		expect(replaced.changed).toBe(true);
		expect(replaced.next).toContain(
			"- 用户今天确认 headless core 要脱离 Electron。",
		);

		const removed = applyDailyNoteLineRemove(
			replaced.next,
			"- sdk怎么添加已经安装的java jdk？",
		);
		expect(removed.changed).toBe(true);
		expect(removed.next).not.toContain("sdk怎么添加");
	});

	it("applies daily-note capture actions through injected host adapters", async () => {
		let content = [
			"# 2026-06-25",
			"",
			"- 用户今天排查旧问题。",
			"- 临时噪音。",
		].join("\n");
		const appended: string[][] = [];

		const result = await applyDailyNoteCaptureActions({
			candidates: [
				{
					action: "replace",
					confidence: 0.9,
					oldText: "- 用户今天排查旧问题。",
					newText: "用户今天完成 headless core 状态拆分。",
				},
				{
					action: "remove",
					confidence: 0.9,
					text: "- 临时噪音。",
				},
				{
					action: "add",
					confidence: 0.9,
					content: "用户今天验证 core 禁用依赖扫描为空。",
				},
				{
					action: "add",
					confidence: 0.9,
					content: "重复项。",
				},
			],
			readContent: () => content,
			writeContent: (next) => {
				content = next;
			},
			dedupeAdditions: (bullets) =>
				bullets.filter((bullet) => bullet !== "重复项。"),
			appendBullets: (bullets) => {
				appended.push(bullets);
				return true;
			},
		});

		expect(result).toEqual({
			applied: 3,
			skipped: 1,
			added: 1,
			replaced: 1,
			removed: 1,
		});
		expect(content).toContain("- 用户今天完成 headless core 状态拆分。");
		expect(content).not.toContain("临时噪音");
		expect(appended).toEqual([["用户今天验证 core 禁用依赖扫描为空。"]]);

		let adapterContent = ["# 2026-06-25", "", "- 旧的 adapter note。"].join(
			"\n",
		);
		const adapterAppended: string[][] = [];
		const adapterResult = await applyDailyNoteCaptureActionsWithAdapters({
			candidates: [
				{
					action: "replace",
					confidence: 0.9,
					oldText: "- 旧的 adapter note。",
					newText: "新的 adapter note。",
				},
				{
					action: "add",
					confidence: 0.9,
					content: "Memory duplicate.",
				},
				{
					action: "add",
					confidence: 0.9,
					content: "Adapter new note.",
				},
			],
			readDailyContent: () => adapterContent,
			writeDailyContent: (next) => {
				adapterContent = next;
			},
			readMemoryContent: () => "- Memory duplicate.",
			appendBullets: (bullets) => {
				adapterAppended.push(bullets);
				return true;
			},
		});

		expect(adapterResult).toEqual({
			applied: 2,
			skipped: 1,
			added: 1,
			replaced: 1,
			removed: 0,
		});
		expect(adapterContent).toContain("- 新的 adapter note。");
		expect(adapterAppended).toEqual([["Adapter new note."]]);
	});

	it("parses memory review results and tracks review progress without main types", () => {
		const messages = [
			{ role: "user", content: "question 1" },
			{ role: "assistant", content: "answer 1" },
			{ role: "user", content: "question 2" },
		];

		expect(countMemoryReviewUserTurns(messages)).toBe(2);
		expect(getMemoryReviewProgress({ messages, interval: 2 })).toMatchObject({
			userTurns: 2,
			turnsSinceReview: 0,
			turnsUntilReview: 0,
			shouldReview: true,
		});

		expect(formatMemoryReviewConversation(messages, 1000)).toBe(
			["User: question 1", "Assistant: answer 1", "User: question 2"].join(
				"\n\n",
			),
		);

		expect(
			parseMemoryReviewModelResult(
				JSON.stringify({
					action: "review",
					confidence: 0.86,
					memories: [
						{
							action: "replace",
							target: "soul",
							oldText: "Keep replies formal.",
							newText: "Keep replies warm.",
							confidence: 0.9,
						},
						{
							action: "add",
							target: "memory",
							content: "api_key = secret",
							sensitivity: "secret",
						},
					],
				}),
			),
		).toEqual({
			confidence: 0.86,
			reason: undefined,
			candidates: [
				{
					action: "replace",
					target: "soul",
					confidence: 0.9,
					content: "Keep replies formal.",
					oldText: "Keep replies formal.",
					newText: "Keep replies warm.",
					text: "Keep replies formal.",
				},
			],
		});
	});

	it("plans memory review status mutations in core", () => {
		expect(
			planSoulMemoryReviewTurnStatusMutation({
				lastTurnKey: "memoryReviewLastTurn:agent:session",
				userTurns: 4,
			}),
		).toMatchObject({
			storeSet: [
				["memoryReviewLastTurn:agent:session", 4],
				["lastReviewTurn", 4],
			],
			runtimePatch: { lastReviewTurn: 4 },
		});
		expect(
			planSoulMemoryReviewNoneStatusMutation({ runAt: 1000 }),
		).toMatchObject({
			storeSet: [
				["lastReviewAt", 1000],
				["lastReviewStatus", "none"],
				["lastReviewApplied", 0],
			],
			storeDelete: ["lastReviewError"],
		});
		expect(
			planSoulMemoryReviewAppliedStatusMutation({
				runAt: 1200,
				applied: 2,
				skipped: 1,
				userTurns: 6,
			}),
		).toMatchObject({
			storeSet: [
				["lastReviewAt", 1200],
				["lastReviewApplied", 2],
				["lastReviewStatus", "applied:2 skipped:1 turn:6"],
			],
		});
		expect(
			planSoulMemoryReviewErrorStatusMutation({
				runAt: 1300,
				errorMessage: "boom",
			}),
		).toMatchObject({
			storeSet: [
				["lastReviewError", "boom"],
				["lastReviewStatus", "error"],
				["lastReviewAt", 1300],
			],
		});
	});

	it("runs memory review in core through model and memory adapters", async () => {
		let now = 1000;
		const settings = {
			enabled: true,
			interval: 2,
			maxInputChars: 4000,
			timeoutMs: 1000,
			maxCandidates: 2,
			minConfidence: 0.7,
		};
		const messages = [
			{ role: "user", content: "Remember I prefer Bun scripts." },
			{ role: "assistant", content: "Got it." },
			{ role: "user", content: "Use that for this repo." },
			{ role: "assistant", content: "I will use Bun." },
		];
		const statusPlans: unknown[] = [];
		const diagnostics: unknown[] = [];
		const notifications: unknown[] = [];
		const appliedCandidates: unknown[] = [];
		let generatedPrompt = "";
		const base = {
			sessionId: "session-1",
			assistantMessageId: "assistant-1",
			agentId: "agent-1",
			keyPrefix: "memoryReviewLastTurn:",
			messages,
			lastUserMessage: "Use that for this repo.",
			lastAssistantMessage: "I will use Bun.",
			enabled: true,
			review: settings,
			hash: (value: string) => `hash:${value.length}:${value.slice(0, 8)}`,
			readPlain: (target: "soul" | "dreams") => ({
				relativePath: target === "soul" ? "SOUL.md" : "DREAMS.md",
				content: target === "soul" ? "Warm voice." : "",
			}),
			readHermes: (target: "user" | "memory") => ({
				relativePath: target === "user" ? "USER.md" : "MEMORY.md",
				content: "",
				entries: [],
			}),
			resolveProvider: () => ({
				provider: { id: "provider" },
				providerId: "deepseek",
				model: "deepseek-chat",
				source: "tools",
			}),
			generateReview: ({
				system,
				prompt,
			}: {
				system: string;
				prompt: string;
			}) => {
				expect(system).toBe(CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT);
				generatedPrompt = prompt;
				return JSON.stringify({
					action: "review",
					confidence: 0.9,
					memories: [
						{
							action: "add",
							target: "memory",
							confidence: 0.92,
							content: "User prefers Bun scripts for this repo.",
						},
						{
							action: "add",
							target: "dreams",
							confidence: 0.4,
							content: "Low confidence idea.",
						},
					],
				});
			},
			applyCandidate: (candidate: unknown, minConfidence: number) => {
				appliedCandidates.push({ candidate, minConfidence });
				const record = candidate as { confidence: number; target: string };
				return record.confidence >= minConfidence
					? {
							changed: true,
							skipped: false,
							relativePath:
								record.target === "memory" ? "MEMORY.md" : "DREAMS.md",
						}
					: { changed: false, skipped: true, relativePath: "DREAMS.md" };
			},
			applyStatusMutation: (plan: unknown) => {
				statusPlans.push(plan);
			},
			notify: (message: string, level?: "info" | "warn" | "error") => {
				notifications.push({ message, level });
			},
			logDiagnostic: (event: unknown) => diagnostics.push(event),
			now: () => now,
		};

		await expect(runSoulMemoryReview(base)).resolves.toMatchObject({
			status: "applied",
			userTurns: 2,
			applied: 1,
			skipped: 1,
			paths: ["MEMORY.md"],
			lastStatus: "applied:1 skipped:1 turn:2",
		});
		expect(generatedPrompt).toContain("# Existing SOUL.md");
		expect(generatedPrompt).toContain("User: Remember I prefer Bun scripts.");
		expect(appliedCandidates).toHaveLength(2);
		expect(statusPlans).toHaveLength(2);
		expect(statusPlans.at(0)).toMatchObject({
			storeSet: [
				["memoryReviewLastTurn:agent-1:session-1", 2],
				["lastReviewTurn", 2],
			],
		});
		expect(statusPlans.at(1)).toMatchObject({
			storeSet: [
				["lastReviewAt", 1000],
				["lastReviewApplied", 1],
				["lastReviewStatus", "applied:1 skipped:1 turn:2"],
			],
		});
		expect(notifications).toEqual([
			{ message: "Memory Review saved 1 update to MEMORY.md", level: "info" },
		]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					operation: "model-review",
					stage: "request",
					status: "started",
				}),
				expect.objectContaining({
					operation: "after-assistant-response",
					stage: "finish",
					status: "ok",
				}),
			]),
		);

		now = 2000;
		statusPlans.length = 0;
		await expect(
			runSoulMemoryReview({
				...base,
				sessionId: "session-2",
				generateReview: () =>
					JSON.stringify({ action: "none", confidence: 1, memories: [] }),
				now: () => now,
			}),
		).resolves.toMatchObject({
			status: "none",
			applied: 0,
			lastStatus: "none",
		});
		expect(statusPlans.at(1)).toMatchObject({
			storeSet: [
				["lastReviewAt", 2000],
				["lastReviewStatus", "none"],
				["lastReviewApplied", 0],
			],
		});
	});

	it("skips and records memory review errors in core", async () => {
		const settings = {
			enabled: true,
			interval: 2,
			maxInputChars: 4000,
			timeoutMs: 1000,
			maxCandidates: 2,
			minConfidence: 0.7,
		};
		const messages = [
			{ role: "user", content: "one" },
			{ role: "assistant", content: "two" },
			{ role: "user", content: "three" },
			{ role: "assistant", content: "four" },
		];
		const statusPlans: unknown[] = [];
		const diagnostics: unknown[] = [];
		const base = {
			sessionId: "session-1",
			assistantMessageId: "assistant-1",
			agentId: "agent-1",
			keyPrefix: "memoryReviewLastTurn:",
			messages,
			lastUserMessage: "three",
			lastAssistantMessage: "four",
			enabled: true,
			review: settings,
			hash: (value: string) => `hash:${value.length}`,
			readPlain: (target: "soul" | "dreams") => ({
				relativePath: `${target}.md`,
				content: "",
			}),
			readHermes: (target: "user" | "memory") => ({
				relativePath: `${target}.md`,
				content: "",
				entries: [],
			}),
			resolveProvider: () => ({
				provider: {},
				providerId: "deepseek",
				model: "deepseek-chat",
			}),
			generateReview: () => {
				throw new Error("provider failed");
			},
			applyCandidate: () => ({
				changed: true,
				skipped: false,
				relativePath: "MEMORY.md",
			}),
			applyStatusMutation: (plan: unknown) => {
				statusPlans.push(plan);
			},
			logDiagnostic: (event: unknown) => diagnostics.push(event),
			now: () => 3000,
		};

		await expect(
			runSoulMemoryReview({
				...base,
				enabled: false,
			}),
		).resolves.toMatchObject({
			status: "skipped",
			userTurns: 2,
		});
		expect(statusPlans).toHaveLength(0);
		expect(diagnostics.at(-1)).toMatchObject({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
		});

		await expect(runSoulMemoryReview(base)).resolves.toMatchObject({
			status: "error",
			error: "provider failed",
			lastStatus: "error",
		});
		expect(statusPlans.at(-1)).toMatchObject({
			storeSet: [
				["lastReviewError", "provider failed"],
				["lastReviewStatus", "error"],
				["lastReviewAt", 3000],
			],
		});
		expect(diagnostics.at(-1)).toMatchObject({
			operation: "after-assistant-response",
			stage: "finish",
			status: "error",
		});
	});

	it("applies plain review document mutations without filesystem access", () => {
		expect(cleanReviewDocumentText(" hello\r\n\n")).toBe("hello");

		const added = applyPlainReviewCandidateToContent("Keep replies formal.\n", {
			action: "add",
			target: "soul",
			confidence: 0.9,
			content: "Prefer concise examples.",
		});
		expect(added).toEqual({
			changed: true,
			skipped: false,
			next: "Keep replies formal.\n\nPrefer concise examples.\n",
		});

		expect(
			applyPlainReviewCandidateToContent(added.next!, {
				action: "add",
				target: "soul",
				confidence: 0.9,
				content: "Prefer concise examples.",
			}),
		).toMatchObject({
			changed: false,
			skipped: true,
			reason: "duplicate",
		});

		const replaced = applyPlainReviewCandidateToContent(added.next!, {
			action: "replace",
			target: "soul",
			confidence: 0.9,
			oldText: "Keep replies formal.",
			newText: "Keep replies warm.",
		});
		expect(replaced.next).toContain("Keep replies warm.");
		expect(replaced.next).not.toContain("Keep replies formal.");

		const removed = applyPlainReviewCandidateToContent(replaced.next!, {
			action: "remove",
			target: "soul",
			confidence: 0.9,
			text: "Prefer concise examples.",
		});
		expect(removed.changed).toBe(true);
		expect(removed.next).not.toContain("Prefer concise examples.");
	});

	it("applies review candidates through injected host adapters", async () => {
		let soulContent = "Keep replies formal.\n";
		const hermesActions: string[] = [];
		const adapters = {
			readPlain: () => ({ content: soulContent, relativePath: "SOUL.md" }),
			writePlain: (_target: "soul" | "dreams", content: string) => {
				soulContent = content;
			},
			readHermes: () => ({
				content: "- Existing durable memory.",
				entries: ["Existing durable memory."],
				relativePath: "MEMORY.md",
			}),
			addHermes: (target: "user" | "memory", content: string) => {
				hermesActions.push(`add:${target}:${content}`);
				return { relativePath: target === "memory" ? "MEMORY.md" : "USER.md" };
			},
			replaceHermes: (
				target: "user" | "memory",
				oldText: string,
				newText: string,
			) => {
				hermesActions.push(`replace:${target}:${oldText}->${newText}`);
				return {
					changed: oldText === "Old durable memory.",
					relativePath: "MEMORY.md",
				};
			},
			removeHermes: (target: "user" | "memory", text: string) => {
				hermesActions.push(`remove:${target}:${text}`);
				return { changed: false, relativePath: "MEMORY.md" };
			},
		};

		await expect(
			applyMemoryReviewCandidate({
				...adapters,
				minConfidence: 0.8,
				candidate: {
					action: "add",
					target: "soul",
					confidence: 0.9,
					content: "Prefer precise status updates.",
				},
			}),
		).resolves.toEqual({
			changed: true,
			skipped: false,
			relativePath: "SOUL.md",
		});
		expect(soulContent).toContain("Prefer precise status updates.");

		await expect(
			applyMemoryReviewCandidate({
				...adapters,
				minConfidence: 0.8,
				candidate: {
					action: "add",
					target: "memory",
					confidence: 0.9,
					content: "Existing durable memory.",
				},
			}),
		).resolves.toEqual({
			changed: false,
			skipped: true,
			relativePath: "MEMORY.md",
			reason: "duplicate",
		});

		await expect(
			applyMemoryReviewCandidate({
				...adapters,
				minConfidence: 0.8,
				candidate: {
					action: "replace",
					target: "memory",
					confidence: 0.9,
					oldText: "Old durable memory.",
					newText: "Updated durable memory.",
				},
			}),
		).resolves.toEqual({
			changed: true,
			skipped: false,
			relativePath: "MEMORY.md",
			reason: undefined,
		});
		expect(hermesActions).toEqual([
			"replace:memory:Old durable memory.->Updated durable memory.",
		]);
	});

	it("sorts managed memory files by core display order", () => {
		expect(
			sortManagedMemoryFiles([
				{
					kind: "daily",
					relativePath: "memory/2026-06-24.md",
					date: "2026-06-24",
					mtimeMs: 1,
				},
				{ kind: "memory", relativePath: "MEMORY.md", mtimeMs: 1 },
				{ kind: "soul", relativePath: "SOUL.md", mtimeMs: 1 },
				{
					kind: "daily",
					relativePath: "memory/2026-06-25.md",
					date: "2026-06-25",
					mtimeMs: 1,
				},
				{ kind: "dreams", relativePath: "DREAMS.md", mtimeMs: 1 },
				{ kind: "user", relativePath: "USER.md", mtimeMs: 1 },
			]).map((file) => file.relativePath),
		).toEqual([
			"SOUL.md",
			"USER.md",
			"MEMORY.md",
			"DREAMS.md",
			"memory/2026-06-25.md",
			"memory/2026-06-24.md",
		]);
	});

});
