/**
 * Edit Tool
 *
 * Performs exact, targeted text replacements in files.
 */

import { z } from "zod";
import { createTwoFilesPatch } from "diff";
import type { JsonObjectProperty } from "@onething/core";
import {
	basenamePath,
	dirnamePath,
	joinPaths,
	writeTextFileAsync,
} from "@onething/core/storage";
import { Tool } from "../tool.js";
import { withFileMutationQueue } from "../file-mutation-queue.js";
import {
	findCoreSandboxRootForPath,
	getCoreSandboxBoundary,
	resolveCoreToolPath,
} from "../sandbox.js";
import { prepareExactEditPreview, type ExactEdit } from "../edit-engine.js";
import { trimDiff, truncateDiffForDisplay } from "../replacers.js";
import {
	countLineChanges,
	hashTextFileSnapshot,
	readTextFileSnapshot,
	type TextFileSnapshot,
} from "../file-snapshot.js";
import { recordFileMutationAudit } from "../file-mutation-audit.js";
import type { FileReadTracker } from "../file-read-tracker.js";

const MAX_REVALIDATION_ATTEMPTS = 5;
const LARGE_DELETION_MIN_LINES = 6;
const LARGE_DELETION_RATIO = 5;

export interface EditToolAdapters {
	getDefaultWorkingDirectory?(): string | undefined;
	getFileMutationsDir(): string;
	fileReadTracker?: FileReadTracker;
}

export interface EditMetadata {
	path: string;
	diff: string;
	additions: number;
	deletions: number;
	originalContentHash?: string;
	[key: string]: JsonObjectProperty;
}

interface EditPlan {
	snapshot: TextFileSnapshot;
	contentNew: string;
	diff: string;
	additions: number;
	deletions: number;
	originalContentHash: string;
}

interface EditRisk {
	requiresExplicitPermission: boolean;
	kind?: "large_deletion";
	reason?: string;
}

const ReplaceEditParameters = z.object({
	oldText: z
		.string()
		.describe(
			"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
		),
	newText: z.string().describe("Replacement text for this targeted edit."),
});

export const EditParameters = z.object({
	path: z.string().describe("Path to the file to edit (relative or absolute)"),
	edits: z
		.array(ReplaceEditParameters)
		.min(1)
		.describe(
			"One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
		),
});

function filePermissionPattern(targetPath: string): string {
	return joinPaths(dirnamePath(targetPath), "*");
}

function resolveEditPath(
	filePath: string,
	workingDirectory: string | undefined,
	adapters: EditToolAdapters,
): string {
	return resolveCoreToolPath(filePath, {
		workingDirectory,
		defaultWorkingDirectory: adapters.getDefaultWorkingDirectory?.(),
	});
}

function buildEditPlan(
	resolvedPath: string,
	edits: ExactEdit[],
	snapshot: TextFileSnapshot,
): EditPlan {
	if (!snapshot.exists) {
		throw new Error(`File not found: ${resolvedPath}`);
	}

	let preview;
	try {
		preview = prepareExactEditPreview(snapshot.content, edits, resolvedPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to edit ${resolvedPath}: ${message}`);
	}

	const diff = createTwoFilesPatch(
		resolvedPath,
		resolvedPath,
		preview.baseContent,
		preview.newContent,
	);
	const { additions, deletions } = countLineChanges(
		preview.baseContent,
		preview.newContent,
	);

	return {
		snapshot,
		contentNew: preview.finalContent,
		diff: trimDiff(diff),
		additions,
		deletions,
		originalContentHash: snapshot.hash,
	};
}

function getEditRisk(plan: EditPlan): EditRisk {
	if (
		plan.deletions >= LARGE_DELETION_MIN_LINES ||
		plan.deletions >= plan.additions * LARGE_DELETION_RATIO
	) {
		return {
			requiresExplicitPermission: true,
			kind: "large_deletion",
			reason: `Edit removes ${plan.deletions} lines and adds ${plan.additions} lines.`,
		};
	}

	return { requiresExplicitPermission: false };
}

export function createEditTool(
	adapters: EditToolAdapters,
): Tool.Info<typeof EditParameters, EditMetadata> {
	return Tool.define<typeof EditParameters, EditMetadata>("edit", {
		name: "Edit",
		description:
			"Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.\n\nRead the file first with the read tool. The edit will be blocked if the file has not been read in the current session, or if it changed on disk since you last saw it. A file you created or edited earlier in the session counts as seen — no re-read needed.",
		category: "builtin",
		enabled: true,
		autoExecute: false,
		permissionGuard: "permission-gated",
		executionMode: "sequential",
		renderKind: "diff",

		parameters: EditParameters,

		async analyze(args, ctx) {
			const defaultWorkingDirectory = adapters.getDefaultWorkingDirectory?.();
			const resolvedPath = resolveEditPath(
				args.path,
				ctx.workingDirectory,
				adapters,
			);
			const boundary = getCoreSandboxBoundary({
				workingDirectory: ctx.workingDirectory,
				defaultWorkingDirectory,
			});
			const matchedRoot = findCoreSandboxRootForPath(resolvedPath, {
				workingDirectory: ctx.workingDirectory,
				workingDirectoryRoots: ctx.workingDirectoryRoots,
				defaultWorkingDirectory,
			});
			const plan = buildEditPlan(
				resolvedPath,
				args.edits,
				await readTextFileSnapshot(resolvedPath),
			);
			const risk = getEditRisk(plan);
			return {
				effects: [
					{
						kind: risk.requiresExplicitPermission
							? ("file_destructive_edit" as const)
							: ("file_edit" as const),
						resources: [filePermissionPattern(resolvedPath)],
						barrier: true,
						external: !matchedRoot,
						metadata: {
							path: resolvedPath,
							additions: plan.additions,
							deletions: plan.deletions,
							originalContentHash: plan.originalContentHash,
							risk: risk.kind,
							riskReason: risk.reason,
							isExternal: !matchedRoot,
							boundary: matchedRoot ? undefined : boundary,
						},
					},
				],
				preview: {
					title: `Edit ${basenamePath(resolvedPath)}`,
					path: resolvedPath,
					diff: plan.diff,
					additions: plan.additions,
					deletions: plan.deletions,
				},
			};
		},

		async execute(args, ctx) {
			const { path: inputPath, edits } = args;
			const resolvedPath = resolveEditPath(
				inputPath,
				ctx.workingDirectory,
				adapters,
			);

			ctx.updateResult?.({
				content: [
					{ type: "text", text: `Preparing edit for ${resolvedPath}...` },
				],
				details: {
					phase: "preparing",
					path: resolvedPath,
					replacements: edits.length,
				},
			});

			ctx.metadata({
				title: `Editing ${basenamePath(resolvedPath)}`,
				metadata: {
					path: resolvedPath,
					diff: "",
					additions: 0,
					deletions: 0,
				},
			});

			await ctx.beforeSideEffect?.();

			const throwIfAborted = () => {
				if (ctx.abortSignal?.aborted) throw new Error("Operation aborted");
			};
			throwIfAborted();

			return await withFileMutationQueue(resolvedPath, async () => {
				throwIfAborted();

				{
					const emitPlanMetadata = (plan: EditPlan) => {
						const displayDiff = truncateDiffForDisplay(plan.diff);
						ctx.updateResult?.({
							content: [
								{
									type: "text",
									text: displayDiff || `Preparing ${resolvedPath}`,
								},
							],
							details: {
								phase: "preview",
								path: resolvedPath,
								additions: plan.additions,
								deletions: plan.deletions,
								replacements: edits.length,
							},
						});
						ctx.metadata({
							title: `Editing ${basenamePath(resolvedPath)}`,
							metadata: {
								path: resolvedPath,
								diff: displayDiff,
								additions: plan.additions,
								deletions: plan.deletions,
								originalContentHash: plan.originalContentHash,
							},
						});
					};

					const policyEffect = ctx.approvedAnalysis?.effects.find(
						(effect) =>
							effect.kind === "file_edit" ||
							effect.kind === "file_destructive_edit",
					);
					const policyOriginalHash =
						policyEffect?.metadata?.originalContentHash;
					const policyDiff = ctx.approvedAnalysis?.preview?.diff;

					const snapshot = await readTextFileSnapshot(resolvedPath);
					throwIfAborted();

					// Read-before-edit guard: the model must have seen this exact
					// content, either via read() or by having written it itself.
					// A missing file falls through to buildEditPlan's clearer
					// "File not found" error.
					if (snapshot.exists && adapters.fileReadTracker) {
						const checkResult = adapters.fileReadTracker.check(
							ctx.sessionId,
							resolvedPath,
							snapshot.hash,
						);
						if (!checkResult.read) {
							throw new Error(checkResult.reason);
						}
					}

					let approvedPlan = buildEditPlan(resolvedPath, edits, snapshot);
					throwIfAborted();

					if (
						typeof policyOriginalHash === "string" &&
						approvedPlan.originalContentHash !== policyOriginalHash
					) {
						if (policyDiff && approvedPlan.diff !== policyDiff) {
							emitPlanMetadata(approvedPlan);
							throw new Error(
								`File changed after permission approval and the resulting edit diff changed: ${resolvedPath}. Please retry the edit.`,
							);
						}
					}

					emitPlanMetadata(approvedPlan);

					let revalidationAttempts = 0;
					while (true) {
						const latestSnapshot = await readTextFileSnapshot(resolvedPath);
						throwIfAborted();
						if (latestSnapshot.hash === approvedPlan.originalContentHash) {
							await writeTextFileAsync(resolvedPath, approvedPlan.contentNew);
							// The model authored this content, so it has seen it: record
							// it so a follow-up edit needs no intervening re-read.
							adapters.fileReadTracker?.record(
								ctx.sessionId,
								resolvedPath,
								hashTextFileSnapshot(true, approvedPlan.contentNew),
							);
							throwIfAborted();
							break;
						}

						revalidationAttempts++;
						if (revalidationAttempts > MAX_REVALIDATION_ATTEMPTS) {
							throw new Error(
								`File changed repeatedly after edit approval: ${resolvedPath}. Please retry the edit.`,
							);
						}

						let revalidatedPlan: EditPlan;
						try {
							revalidatedPlan = buildEditPlan(
								resolvedPath,
								edits,
								latestSnapshot,
							);
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							throw new Error(
								`File changed after approval and the edit could not be re-applied to latest content: ${message}. Please retry.`,
							);
						}

						if (revalidatedPlan.diff !== approvedPlan.diff) {
							emitPlanMetadata(revalidatedPlan);
							throw new Error(
								`File changed after permission approval and the resulting edit diff changed: ${resolvedPath}. Please retry the edit.`,
							);
						}
						approvedPlan = revalidatedPlan;
					}

					const contentOld = approvedPlan.snapshot.content;
					const audit = await recordFileMutationAudit({
						auditDir: adapters.getFileMutationsDir(),
						sessionId: ctx.sessionId,
						messageId: ctx.messageId,
						toolCallId: ctx.toolCallId,
						operation: "edit",
						path: resolvedPath,
						beforeExists: true,
						beforeContent: contentOld,
						afterContent: approvedPlan.contentNew,
						diff: approvedPlan.diff,
						metadata: {
							additions: approvedPlan.additions,
							deletions: approvedPlan.deletions,
							replacements: edits.length,
						},
					});
					const displayDiff = truncateDiffForDisplay(approvedPlan.diff);
					ctx.metadata({
						metadata: {
							path: resolvedPath,
							diff: displayDiff,
							additions: approvedPlan.additions,
							deletions: approvedPlan.deletions,
							originalContentHash: approvedPlan.originalContentHash,
							auditId: audit.id,
							auditPath: audit.path,
							afterContentHash: audit.afterHash,
						},
					});

					const output = `Successfully edited ${resolvedPath} (${edits.length} replacement${edits.length === 1 ? "" : "s"})`;
					ctx.updateResult?.({
						content: [
							{ type: "text", text: output },
							{ type: "file", path: resolvedPath },
						],
						details: {
							phase: "ready",
							path: resolvedPath,
							diff: displayDiff,
							additions: approvedPlan.additions,
							deletions: approvedPlan.deletions,
							replacements: edits.length,
							auditId: audit.id,
							auditPath: audit.path,
						},
					});

					return {
						title: `Edited ${basenamePath(resolvedPath)}`,
						output,
						metadata: {
							path: resolvedPath,
							diff: displayDiff,
							additions: approvedPlan.additions,
							deletions: approvedPlan.deletions,
							originalContentHash: approvedPlan.originalContentHash,
							auditId: audit.id,
							auditPath: audit.path,
							afterContentHash: audit.afterHash,
						},
					};
				}
			});
		},

		formatValidationError(error) {
			const issues = error.issues.map(
				(issue) => `- ${issue.path.join(".")}: ${issue.message}`,
			);
			return `Invalid edit parameters:\n${issues.join("\n")}`;
		},
	});
}
