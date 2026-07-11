import { rename as renameFsPath, rm as rmFsPath } from "node:fs/promises";
import { z } from "zod";
import type {
	ChatMessage,
	AppSettings,
	CanonicalMemoryAuditEvent,
	CanonicalMemoryRecord,
	MemoryAppendRequest,
	MemoryDreamingStatus,
	MemoryGraphAuditEvent,
	MemoryGraphAuditRequest,
	MemoryGraphDeleteRequest,
	MemoryGraphDuplicate,
	MemoryGraphDuplicateDecisionRequest,
	MemoryGraphEntity,
	MemoryGraphEntityUpsertRequest,
	MemoryGraphListRequest,
	MemoryGraphObservation,
	MemoryGraphObservationUpsertRequest,
	MemoryGraphOverview,
	MemoryGraphRelation,
	MemoryGraphRelationUpsertRequest,
	MemoryIndexStatus,
	MemoryManagedFile,
	MemoryCapturePending,
	MemoryOverview,
	MemoryProfileAuditRequest,
	MemoryProfileDeleteRequest,
	MemoryProfileListRequest,
	MemoryProfileUpsertRequest,
	MemoryReadRequest,
	MemorySaveFileRequest,
	MemorySearchHit,
	MemorySearchRequest,
	SoulMemoryCaptureSettings,
	SoulMemoryDreamingSettings,
	SoulMemoryReviewSettings,
	SchedulerRunTimelineEntryDTO,
} from "../../../shared/ipc.js";
import { DEFAULT_AGENT_ID } from "../../../shared/ipc.js";
import { getSettings, saveSettings } from "../../stores/settings.js";
import { generateChatResponse } from "../../providers/index.js";
import { resolveProviderAuth } from "../../engine/stream/provider-helpers.js";
import { embedTexts } from "../../embeddings/index.js";
import * as store from "../../store.js";
import { PluginStore } from "../store.js";
import type {
	AfterAssistantResponseContext,
	PluginAPI,
	PluginCommandContext,
} from "../types.js";
import {
	buildSoulMemoryCaptureCommandStatusInput as coreBuildSoulMemoryCaptureCommandStatusInput,
	buildSoulMemoryCanonicalGraphMigrationCandidates as coreBuildSoulMemoryCanonicalGraphMigrationCandidates,
	buildSoulMemoryIndexDirtyDiagnostic as coreBuildSoulMemoryIndexDirtyDiagnostic,
	buildSoulMemoryOverview as coreBuildSoulMemoryOverview,
	buildSoulMemoryPendingCaptureMigrationCandidates as coreBuildSoulMemoryPendingCaptureMigrationCandidates,
	buildSoulMemoryPublicDreamingStatus as coreBuildSoulMemoryPublicDreamingStatus,
	buildSoulMemoryReviewCommandRunContext as coreBuildSoulMemoryReviewCommandRunContext,
	buildSoulMemoryReviewStatusWithAdapters as coreBuildSoulMemoryReviewStatusWithAdapters,
	buildUserMemoryWorkspace as coreBuildUserMemoryWorkspace,
	clampCaptureConfidence as coreClampCaptureConfidence,
	CORE_SOUL_MEMORY_DEFAULT_INDEX_STATUS,
	CORE_SOUL_MEMORY_BEFORE_CONTEXT_COMPACT_HOOK_ID,
	CORE_SOUL_MEMORY_CAPTURE_HOOK_ID,
	CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID,
	CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
	CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
	createSoulMemoryToolProvider as coreCreateSoulMemoryToolProvider,
	dailyNoteTimeHeading as coreDailyNoteTimeHeading,
	describeSoulMemoryManagedFileWithAdapters as coreDescribeSoulMemoryManagedFileWithAdapters,
	discardSoulMemoryPendingCaptureWithAdapters as coreDiscardSoulMemoryPendingCaptureWithAdapters,
	extractLegacyMemoryCandidates as coreExtractLegacyMemoryCandidates,
	applySoulMemoryStatusMutationPlan as coreApplySoulMemoryStatusMutationPlan,
	CORE_SOUL_MEMORY_MANIFEST,
	formatSoulMemoryMaybeTimestamp as coreFormatSoulMemoryMaybeTimestamp,
	formatSoulMemoryCanonicalProfileExport as coreFormatSoulMemoryCanonicalProfileExport,
	formatSoulMemoryHits as coreFormatSoulMemoryHits,
	formatSoulMemoryDreamingStatus as coreFormatSoulMemoryDreamingStatus,
	formatSoulMemoryReviewStatus as coreFormatSoulMemoryReviewStatus,
	formatSoulMemoryCommandStatus as coreFormatSoulMemoryCommandStatus,
	formatSoulMemoryToolModelRef as coreFormatSoulMemoryToolModelRef,
	formatSoulMemoryZonedDateTime as coreFormatSoulMemoryZonedDateTime,
	getCoreSoulMemoryCommandSpec,
	getCoreSoulMemoryToolSpec,
	getSoulMemoryDreamingNextRunStatus as coreGetSoulMemoryDreamingNextRunStatus,
	getSoulMemoryPendingCaptures as coreGetSoulMemoryPendingCaptures,
	getSoulMemoryPublicPendingCaptures as coreGetSoulMemoryPublicPendingCaptures,
	handleSoulMemoryGetTool as coreHandleSoulMemoryGetTool,
	handleSoulMemoryActiveMemoryCommand as coreHandleSoulMemoryActiveMemoryCommand,
	handleSoulMemoryCaptureCommand as coreHandleSoulMemoryCaptureCommand,
	handleSoulMemoryCommandGet as coreHandleSoulMemoryCommandGet,
	handleSoulMemoryDreamingCommand as coreHandleSoulMemoryDreamingCommand,
	handleSoulMemoryMemoryCommand as coreHandleSoulMemoryMemoryCommand,
	handleSoulMemoryMemoryTool as coreHandleSoulMemoryMemoryTool,
	handleSoulMemoryReviewCommand as coreHandleSoulMemoryReviewCommand,
	handleSoulMemorySearchTool as coreHandleSoulMemorySearchTool,
	handleSoulMemorySoulCommand as coreHandleSoulMemorySoulCommand,
	handleSoulMemorySoulGetTool as coreHandleSoulMemorySoulGetTool,
	handleSoulMemorySoulUpdateTool as coreHandleSoulMemorySoulUpdateTool,
	hasExplicitMemoryIntent as coreHasExplicitMemoryIntent,
	formatSoulMemoryRememberCommandResult as coreFormatSoulMemoryRememberCommandResult,
	isLikelyRawRequestEcho as coreIsLikelyRawRequestEcho,
	isLowValueDailyNoteLine as coreIsLowValueDailyNoteLine,
	CoreSoulMemoryIndexTracker,
	CoreSoulMemoryIndexSyncScheduler,
	normalizeSoulMemoryCanonicalMergeCandidates as coreNormalizeSoulMemoryCanonicalMergeCandidates,
	normalizeSoulMemorySearchLimit as coreNormalizeSoulMemorySearchLimit,
	optionalCaptureText as coreOptionalCaptureText,
	parseDailyNoteBullets as coreParseDailyNoteBullets,
	parseDailyNoteCaptureResult as coreParseDailyNoteCaptureResult,
	parseDreamingOutput as coreParseDreamingOutput,
	planSoulMemoryCaptureErrorStatusMutation as corePlanSoulMemoryCaptureErrorStatusMutation,
	planSoulMemoryIndexSyncWork as corePlanSoulMemoryIndexSyncWork,
	planSoulMemoryManualDreamingRun as corePlanSoulMemoryManualDreamingRun,
	planSoulMemoryProfileUpsert as corePlanSoulMemoryProfileUpsert,
	patchSoulMemorySettingsSectionWithAdapters as corePatchSoulMemorySettingsSectionWithAdapters,
	readSoulMemoryFileExcerptFromContent as coreReadSoulMemoryFileExcerptFromContent,
	refreshSoulMemoryIndexStatus as coreRefreshSoulMemoryIndexStatus,
	resolveSoulMemoryFilePath as coreResolveSoulMemoryFilePath,
	resolveSoulMemoryToolProviderSelection as coreResolveSoulMemoryToolProviderSelection,
	runSoulMemoryCanonicalEmbeddingWithAdapters as coreRunSoulMemoryCanonicalEmbeddingWithAdapters,
	runSoulMemoryManualDreamingWithAdapters as coreRunSoulMemoryManualDreamingWithAdapters,
	saveSoulMemoryPendingCaptureWithAdapters as coreSaveSoulMemoryPendingCaptureWithAdapters,
	buildSoulMemorySearchResult as coreBuildSoulMemorySearchResult,
	setSoulMemoryPendingCaptures as coreSetSoulMemoryPendingCaptures,
	stripSoulMemoryJsonFence,
	type CoreDailyNoteCaptureApplyResult,
	type CoreDailyNoteCaptureCandidate,
	type CoreDailyNoteCaptureResult,
	type CoreDreamingMemoryAction,
	type CoreDreamingMemoryApplyResult,
	type CoreDreamingMemoryCandidate,
	type CoreDreamingMemoryResult,
	type CoreMemoryReviewCandidate,
	type CorePlainReviewTarget,
	type CoreSoulMemoryProviderSelectionSettings,
	type CoreSoulMemoryStatusMutationPlan,
} from "@onething/runtime/plugins";
import {
	getScheduler,
	isValidTimezone,
	nextCronRunAt,
	parseCronExpression,
} from "../../scheduler/index.js";
import type { SchedulerRunReason } from "../../scheduler/types.js";
import {
	configureMemoryDiagnosticsLogger,
	logMemoryDiagnostic,
} from "../../memory/diagnostics-logger.js";
import type {
	CanonicalMemoryInput,
	CaptureCandidate,
	CaptureCandidateKind,
	DreamingSource,
	IndexStatus,
	MemoryWorkspace,
	ResolvedSoulMemorySettings,
	SearchHit,
} from "@onething/runtime/memory/types";
import {
	LOCAL_CLIENT_USER_ID,
	LOCAL_MEMORY_SCOPE_ID,
} from "../../channel/origin.js";
import {
	CAPTURE_MAX_PENDING,
	CAPTURE_PENDING_STORE_KEY,
	CANONICAL_MIGRATION_STORE_KEY,
	DREAMING_SCHEDULER_TASK_ID,
	getWorkspace,
	GRAPH_MIGRATION_STORE_KEY,
	isIndexableMarkdownPath,
	normalizeMemoryRelativePath,
	readLimited,
	replaceFileAtomic,
	resolveSessionAgentId,
	resolveSettings,
	sha,
	SOUL_MEMORY_PLUGIN_ID,
	SOUL_TEMPLATE,
	truncate,
	writeIfMissing,
	normalizeBulletText,
	previewLine,
	normalizeForDedupe,
	sanitizeMemoryKey,
} from "../../memory/workspace.js";
import {
	appendTextFile,
	dirnamePath,
	ensureDirAsync,
	joinPaths,
	listDirectoryEntries,
	readTextFileAsync,
	readTextFileIfExists,
	relativePath,
	statPath,
	watchDirectoryRecursive,
	type CoreFileWatcher,
} from "@onething/core/storage";
import {
	addHermesMemoryEntry,
	getHermesMemoryStatus,
	readHermesMemoryFile,
	removeHermesMemoryText,
	replaceHermesMemoryText,
} from "@onething/runtime/memory/hermes-file-memory";
import {
	closeDb,
	getDb,
	getFtsTokenizer,
	setOnDbSwitch,
} from "@onething/runtime/memory/database";
import {
	clearMemoryIndex,
	deleteMemoryIndexPaths,
	indexMemoryFile as runtimeIndexMemoryFile,
	listMemoryIndexFiles,
	inspectMemoryIndexFreshness,
	readMemoryIndexCounts,
} from "@onething/runtime/memory/indexer";
import {
	deleteGraphEntity,
	deleteGraphObservation,
	deleteGraphRelation,
	ensureUserSelfEntity,
	getGraphAudit,
	getGraphEntityById,
	getGraphMemoryByIdentifier,
	getGraphObservationById,
	getGraphOverview,
	getGraphRelationById,
	graphSearchContent,
	listGraphDuplicates,
	listGraphEntities,
	listGraphObservations,
	listGraphRelations,
	ignoreGraphDuplicate,
	mergeGraphDuplicate,
	mergeGraphMemory,
	reconcileSingletonGraphObservations,
	rowToGraphDuplicate,
	searchGraphMemory as runtimeSearchGraphMemory,
	upsertGraphCandidates,
	upsertGraphEntity,
	upsertGraphObservation,
	upsertGraphRelation,
} from "@onething/runtime/memory/graph";
import {
	deleteCanonicalMemory,
	getCanonicalMemoryAudit,
	getCanonicalMemoryByIdOrKey,
	getCanonicalMemoryCount,
	listCanonicalMemories,
	rowToCanonicalMemory,
	upsertCanonicalCandidates,
	upsertCanonicalMemory,
} from "@onething/runtime/memory/canonical";
import { searchMarkdownMemoryChunks as runtimeSearchMarkdownMemoryChunks } from "@onething/runtime/memory/search";
import {
	listManagedMemoryFiles as runtimeListManagedMemoryFiles,
	readManagedMemoryFile,
	saveManagedMemoryFile,
} from "@onething/runtime/memory/managed-files";
import { buildSoulMemoryPromptContext as runtimeBuildSoulMemoryPromptContext } from "@onething/runtime/memory/prompt-context";
import { appendMemoryNote as runtimeAppendMemoryNote } from "@onething/runtime/memory/append";
import {
	appendDailyNoteCaptureBullets as runtimeAppendDailyNoteCaptureBullets,
	applyDailyNoteCaptureActions as runtimeApplyDailyNoteCaptureActions,
	buildMemoryCaptureInput as runtimeBuildMemoryCaptureInput,
	dedupeDailyNoteCaptureBullets as runtimeDedupeDailyNoteCaptureBullets,
	runMemoryCapture as runtimeRunMemoryCapture,
} from "@onething/runtime/memory/capture-actions";
import {
	applyMemoryReviewCandidate as runtimeApplyMemoryReviewCandidate,
	buildMemoryReviewInput as runtimeBuildMemoryReviewInput,
	getPlainReviewFile as runtimeGetPlainReviewFile,
	memoryReviewLastTurnKey as runtimeMemoryReviewLastTurnKey,
	readPlainReviewFile as runtimeReadPlainReviewFile,
	runMemoryReview as runtimeRunMemoryReview,
} from "@onething/runtime/memory/review";
import {
	applyDreamingMemoryActions as runtimeApplyDreamingMemoryActions,
	buildDreamingExistingMemorySummary as runtimeBuildDreamingExistingMemorySummary,
	collectDreamingSources as runtimeCollectDreamingSources,
	collectDailyDreamingSources as runtimeCollectDailyDreamingSources,
	runMemoryDreamingSweep as runtimeRunMemoryDreamingSweep,
} from "@onething/runtime/memory/dreaming";
import { runMemoryFlush as runtimeRunMemoryFlush } from "@onething/runtime/memory/flush";
import { runMemoryActiveMemoryRecall as runtimeRunMemoryActiveMemoryRecall } from "@onething/runtime/memory/active-memory";

export { SOUL_MEMORY_PLUGIN_ID } from "../../memory/workspace.js";
export type {
	MemoryWorkspace,
	ResolvedSoulMemorySettings,
} from "@onething/runtime/memory/types";

export const soulMemoryManifest = CORE_SOUL_MEMORY_MANIFEST;

type MemoryDatabase = ReturnType<typeof getDb>;

let activeSoulMemoryPluginApi: PluginAPI | null = null;

let lastStatus: IndexStatus = { ...CORE_SOUL_MEMORY_DEFAULT_INDEX_STATUS };
const indexTracker = new CoreSoulMemoryIndexTracker();
const indexSyncScheduler = new CoreSoulMemoryIndexSyncScheduler<
	{
		settings?: AppSettings;
		agentId?: string;
		force?: boolean;
		reason: string;
	},
	IndexStatus
>({
	tracker: indexTracker,
	sync: (options) =>
		syncIndex({
			settings: options.settings,
			agentId: options.agentId,
			force: options.force,
		}),
	logDiagnostic: (event) => {
		logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
	},
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	rescheduleRequest: (options) => ({
		settings: options.settings,
		agentId: options.agentId,
		reason: "dirty-during-sync",
	}),
});
let indexWatcher: CoreFileWatcher | null = null;
let indexWatcherRoot = "";
let indexWatcherDebounce: NodeJS.Timeout | null = null;
const memoryProfileTaskQueues = new Map<string, Promise<void>>();

function markIndexDirty(
	reason: string,
	metadata?: Record<string, unknown>,
): void {
	const state = indexTracker.markDirty(reason);
	logMemoryDiagnostic(
		coreBuildSoulMemoryIndexDirtyDiagnostic({
			reason,
			state,
			metadata: {
				...(metadata || {}),
			},
		}) as Parameters<typeof logMemoryDiagnostic>[0],
	);
}

function markIndexClean(revision: number): void {
	indexTracker.markClean(revision);
}

function resolveAfterResponseAgentId(
	context: AfterAssistantResponseContext,
): string {
	// Resolve the agent ID for after-response tasks (capture, review).
	const target = resolveMemoryTarget(context.sessionId);
	if (target.kind === "channel-user" && target.userId) return target.userId;
	return resolveSessionAgentId(context.sessionId);
}

function latestUserOrigin(
	messages: ChatMessage[],
): ChatMessage["origin"] | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "user" && message.origin) return message.origin;
	}
	return undefined;
}

// ── Multi-user memory target resolution ──────────────────────

export interface SessionMemoryTarget {
	kind: "owner" | "channel-user";
	userId?: string;
	displayName?: string;
	connector?: string;
}

function resolveMemoryTarget(sessionId?: string): SessionMemoryTarget {
	if (!sessionId) return { kind: "owner" };
	const session = store.getSession(sessionId);
	// Only memoryProfileId (written by the channel identity router / profile
	// selection) marks a channel-user session. session.agentId must NOT feed
	// this decision: custom-agent sessions keep their agentsDir workspace.
	const profileId = session?.memoryProfileId;
	if (
		!profileId ||
		profileId === LOCAL_CLIENT_USER_ID ||
		profileId === DEFAULT_AGENT_ID
	)
		return { kind: "owner" };
	// Linked-to-local-owner is already handled above since identity service resolves to local-owner.
	const origin = session ? latestUserOrigin(session.messages) : undefined;
	const identity = origin?.resolvedIdentity;
	return {
		kind: "channel-user",
		userId: profileId,
		displayName: identity?.displayName,
		connector: identity?.externalUserKey?.split(":")[0],
	};
}

async function resolveSessionToolWorkspace(sessionId?: string): Promise<{
	target: SessionMemoryTarget;
	workspace: MemoryWorkspace;
}> {
	const target = resolveMemoryTarget(sessionId);
	if (target.kind === "channel-user" && target.userId) {
		return { target, workspace: await getUserMemoryWorkspace(target.userId) };
	}
	return {
		target,
		workspace: await ensureWorkspace(
			getSettings(),
			resolveSessionAgentId(sessionId),
		),
	};
}

async function getUserMemoryWorkspace(
	userId: string,
): Promise<MemoryWorkspace> {
	const baseWorkspace = getWorkspace(getSettings(), DEFAULT_AGENT_ID);
	const { root: memoryRoot } = baseWorkspace;
	const plan = coreBuildUserMemoryWorkspace({ memoryRoot, userId });
	// Ensure the user directory and daily notes directory exist.
	await ensureDirAsync(plan.root);
	await ensureDirAsync(plan.memoryDir);
	// Wrap the user memory plan into a MemoryWorkspace with settings from the main workspace.
	// Disable canonical/graph capture for channel users.
	const settings = resolveSettings(getSettings());
	return {
		settings: {
			...settings,
			canonicalMemory: { ...settings.canonicalMemory, enabled: false },
		},
		agentId: userId,
		root: plan.root,
		memoryDir: plan.memoryDir,
		soulPath: plan.soulPath,
		userPath: plan.userPath,
		memoryPath: plan.memoryPath,
		dreamsPath: plan.dreamsPath,
		todayPath: plan.todayPath,
		dbPath: plan.dbPath,
	};
}

function buildChannelUserIdentityContext(target: SessionMemoryTarget): string {
	const parts = [
		"The conversation counterpart is NOT the owner. It is user_id <id> (display name: <name>, via <connector>).",
		'Record facts about this person as "user_id <id> …", never as "user …" or "the user …".',
		"Allowed targets: user / memory (this person's notes). soul / dreams targets are forbidden.",
	];
	return parts
		.join("\n")
		.replace(/<id>/g, target.userId || "unknown")
		.replace(/<name>/g, target.displayName || "unknown")
		.replace(/<connector>/g, target.connector || "unknown");
}

// Plain text scan over a channel user's notes (MEMORY.md + daily/). User
// workspaces have no FTS index; the corpus is small enough to scan directly.
async function searchUserMemoryNotes(
	workspace: MemoryWorkspace,
	query: string,
	limit = 8,
): Promise<SearchHit[]> {
	const terms = query
		.toLowerCase()
		.split(/[\s,;、，。]+/)
		.filter(Boolean);
	if (terms.length === 0) return [];

	const files: Array<{ absolutePath: string; path: string }> = [
		{ absolutePath: workspace.memoryPath, path: "MEMORY.md" },
	];
	try {
		const entries = await listDirectoryEntries(workspace.memoryDir);
		for (const entry of entries) {
			if (!entry.isFile || !entry.name.toLowerCase().endsWith(".md")) continue;
			files.push({
				absolutePath: joinPaths(workspace.memoryDir, entry.name),
				path: `daily/${entry.name}`,
			});
		}
	} catch {
		// Daily directory may not exist yet.
	}

	const hits: SearchHit[] = [];
	for (const file of files) {
		const content = await readTextFileIfExists(file.absolutePath);
		if (!content) continue;
		const lines = content.split(/\r?\n/);
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index];
			const lowered = line.toLowerCase();
			const matched = terms.filter((term) => lowered.includes(term)).length;
			if (matched === 0) continue;
			hits.push({
				id: `${file.path}:${index + 1}`,
				path: file.path,
				kind: file.path === "MEMORY.md" ? "memory" : "daily",
				chunkIndex: 0,
				startLine: index + 1,
				endLine: index + 1,
				content: line.trim(),
				score: matched / terms.length,
			});
		}
	}

	hits.sort((left, right) => right.score - left.score);
	return hits.slice(0, limit);
}

function enqueueMemoryProfileTask<T>(
	agentId: string,
	task: () => Promise<T>,
): Promise<T> {
	const previous = memoryProfileTaskQueues.get(agentId) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(task);
	const settled = run.then(
		() => undefined,
		() => undefined,
	);
	memoryProfileTaskQueues.set(agentId, settled);
	settled.finally(() => {
		if (memoryProfileTaskQueues.get(agentId) === settled) {
			memoryProfileTaskQueues.delete(agentId);
		}
	});
	return run;
}

const migratedDailyDirRoots = new Set<string>();

async function migrateLegacyDailyDir(
	root: string,
	memoryDir: string,
): Promise<void> {
	// Daily notes used to live in <root>/memory. The default-path migration in
	// the variables store only covers ~/.onething/notes; custom directories and
	// agent workspaces are renamed lazily here.
	if (migratedDailyDirRoots.has(root)) return;
	migratedDailyDirRoots.add(root);
	const legacyDir = joinPaths(root, "memory");
	if (legacyDir === memoryDir) return;
	const [legacyStat, dailyStat] = await Promise.all([
		statPath(legacyDir),
		statPath(memoryDir),
	]);
	if (!legacyStat?.isDirectory()) return;
	if (dailyStat) {
		// daily/ may already exist as an empty directory (created by an
		// ensureWorkspace call that ran before this migration); only take over
		// when it holds no notes.
		const entries = await listDirectoryEntries(memoryDir).catch(() => null);
		if (!entries || entries.some((entry) => !entry.name.startsWith(".")))
			return;
		try {
			await rmFsPath(memoryDir, { recursive: true, force: true });
		} catch {
			return;
		}
	}
	try {
		await renameFsPath(legacyDir, memoryDir);
		markIndexDirty("daily-dir-migration", { root });
	} catch (error) {
		logMemoryDiagnostic({
			subsystem: "daily",
			operation: "migrate-daily-dir",
			stage: "rename",
			status: "fallback",
			error,
			summary: "Could not rename legacy memory/ directory to daily/.",
			metadata: { root },
		});
	}
}

async function ensureWorkspace(
	settings?: AppSettings,
	agentId = DEFAULT_AGENT_ID,
): Promise<MemoryWorkspace> {
	const workspace = getWorkspace(settings, agentId);
	configureMemoryDiagnosticsLogger(workspace.settings.logging);
	await ensureDirAsync(workspace.root);
	await migrateLegacyDailyDir(workspace.root, workspace.memoryDir);
	await ensureDirAsync(workspace.memoryDir);
	await ensureDirAsync(dirnamePath(workspace.dbPath));
	await writeIfMissing(workspace.soulPath, SOUL_TEMPLATE);
	ensureIndexWatcher(workspace);
	return workspace;
}

function ensureIndexWatcher(workspace: MemoryWorkspace): void {
	if (indexWatcher && indexWatcherRoot === workspace.memoryDir) return;
	indexWatcher?.close();
	indexWatcher = null;
	indexWatcherRoot = workspace.memoryDir;

	try {
		indexWatcher = watchDirectoryRecursive(
			workspace.memoryDir,
			(eventType, filename) => {
				if (!filename) return;
				const relativePath = normalizeMemoryRelativePath(
					joinPaths("daily", filename.toString()),
				);
				if (!isIndexableMarkdownPath(relativePath)) return;
				markIndexDirty("filesystem-change", { eventType, relativePath });
				if (indexWatcherDebounce) clearTimeout(indexWatcherDebounce);
				indexWatcherDebounce = setTimeout(() => {
					scheduleIndexSync({
						settings: getSettings(),
						agentId: workspace.agentId,
						reason: "filesystem-change",
					});
				}, 750);
			},
		);
		indexWatcher.on("error", (error) => {
			logMemoryDiagnostic({
				subsystem: "index",
				operation: "watcher",
				stage: "runtime",
				status: "fallback",
				error,
				summary:
					"Memory directory watcher failed; app writes will still mark the index dirty.",
				metadata: { memoryDir: workspace.memoryDir },
			});
			closeIndexWatcher();
		});
	} catch (error) {
		logMemoryDiagnostic({
			subsystem: "index",
			operation: "watcher",
			stage: "start",
			status: "fallback",
			error,
			summary:
				"Could not start memory directory watcher; app writes will still mark the index dirty.",
			metadata: { memoryDir: workspace.memoryDir },
		});
	}
}

function closeIndexWatcher(): void {
	if (indexWatcherDebounce) {
		clearTimeout(indexWatcherDebounce);
		indexWatcherDebounce = null;
	}
	indexWatcher?.close();
	indexWatcher = null;
	indexWatcherRoot = "";
}

function scheduleIndexSync(options: {
	settings?: AppSettings;
	agentId?: string;
	force?: boolean;
	reason: string;
}): void {
	indexSyncScheduler.schedule(options);
}

async function updateSoulFile(options: {
	settings?: AppSettings;
	agentId?: string;
	content: string;
	mode?: "replace" | "append";
	heading?: string;
}): Promise<{ absolutePath: string; mode: "replace" | "append" }> {
	const workspace = await ensureWorkspace(options.settings, options.agentId);
	if (!workspace.settings.enabled) {
		throw new Error("Soul-memory is disabled in settings");
	}
	const content = options.content.trim();
	if (!content) throw new Error("SOUL.md content is empty");

	if (options.mode === "append") {
		const heading = options.heading || new Date().toLocaleString();
		await appendTextFile(workspace.soulPath, `\n## ${heading}\n\n${content}\n`);
		return { absolutePath: workspace.soulPath, mode: "append" };
	}

	await replaceFileAtomic(
		workspace.soulPath,
		content.endsWith("\n") ? content : `${content}\n`,
	);
	return { absolutePath: workspace.soulPath, mode: "replace" };
}

// getDb, ensureFtsTable, ensureCanonicalFtsTable, ensureGraphFtsTable → ../../memory/database.ts
// Wire the db-switch callback to mark the index dirty when workspace changes.
setOnDbSwitch((agentId) => {
	markIndexDirty(`workspace:${agentId}`);
});

function refreshIndexStatus(database: MemoryDatabase): IndexStatus {
	const counts = readMemoryIndexCounts(database);
	lastStatus = coreRefreshSoulMemoryIndexStatus(
		lastStatus,
		counts,
		getFtsTokenizer(),
	);
	return lastStatus;
}

async function syncIndex(
	options: { settings?: AppSettings; force?: boolean; agentId?: string } = {},
): Promise<IndexStatus> {
	const startedAt = Date.now();
	const workspace = await ensureWorkspace(options.settings, options.agentId);
	const runId = sha(`index:${startedAt}:${workspace.root}`).slice(0, 16);
	const syncRevision = indexTracker.dirtyRevision;
	logMemoryDiagnostic({
		subsystem: "index",
		operation: "sync-index",
		stage: "start",
		status: "started",
		runId,
		request: { force: options.force === true, root: workspace.root },
	});
	try {
		const database = getDb(workspace);
		const files = await listMemoryIndexFiles(workspace);
		const freshness = await inspectMemoryIndexFreshness({ database, files });
		deleteMemoryIndexPaths(database, freshness.deletedPaths);

		if (options.force) {
			clearMemoryIndex(database);
		}

		const workPlan = corePlanSoulMemoryIndexSyncWork(freshness, {
			force: options.force,
		});
		if (workPlan.shouldSkipNoChanges) {
			const status = refreshIndexStatus(database);
			markIndexClean(syncRevision);
			logMemoryDiagnostic({
				subsystem: "index",
				operation: "sync-index",
				stage: "finish",
				status: "skipped",
				durationMs: Date.now() - startedAt,
				runId,
				summary: "Index is already current; no Markdown file changes detected.",
				response: {
					checkedFiles: freshness.files.length,
					changedFiles: 0,
					deletedFiles: 0,
					indexedFiles: status.indexedFiles,
					indexedChunks: status.indexedChunks,
					ftsTokenizer: getFtsTokenizer(),
				},
			});
			return status;
		}

		for (const file of workPlan.filesToIndex) {
			const result = await runtimeIndexMemoryFile({
				settings: options.settings,
				workspace,
				database,
				file,
				knownStat: file,
				embedTexts: (settings, values) =>
					embedTexts({ settings: settings ?? getSettings(), values }),
				setLastError: (message) => {
					lastStatus.lastError = message;
				},
				logDiagnostic: (event) => logMemoryDiagnostic(event),
			});
			if (result.embeddingProvider || result.embeddingModel) {
				lastStatus.embeddingProvider = result.embeddingProvider;
				lastStatus.embeddingModel = result.embeddingModel;
				delete lastStatus.lastError;
			}
		}

		const counts = readMemoryIndexCounts(database);
		lastStatus = {
			...lastStatus,
			indexedFiles: counts.indexedFiles,
			indexedChunks: counts.indexedChunks,
			ftsTokenizer: getFtsTokenizer(),
			lastIndexedAt: Date.now(),
		};
		markIndexClean(syncRevision);
		logMemoryDiagnostic({
			subsystem: "index",
			operation: "sync-index",
			stage: "finish",
			status: "ok",
			durationMs: Date.now() - startedAt,
			runId,
			response: {
				checkedFiles: freshness.files.length,
				changedFiles: workPlan.filesToIndex.length,
				deletedFiles: freshness.deletedPaths.length,
				indexedFiles: counts.indexedFiles,
				indexedChunks: counts.indexedChunks,
				ftsTokenizer: getFtsTokenizer(),
				embeddingProvider: lastStatus.embeddingProvider || "",
				embeddingModel: lastStatus.embeddingModel || "",
			},
		});
		return lastStatus;
	} catch (error) {
		logMemoryDiagnostic({
			subsystem: "index",
			operation: "sync-index",
			stage: "finish",
			status: "error",
			durationMs: Date.now() - startedAt,
			runId,
			error,
		});
		throw error;
	}
}

async function searchMemory(options: {
	settings?: AppSettings;
	agentId?: string;
	query: string;
	limit?: number | string;
	minScore?: number;
}): Promise<SearchHit[]> {
	const startedAt = Date.now();
	const runId = sha(`search:${startedAt}:${options.query}`).slice(0, 16);
	const appSettings = options.settings || getSettings();
	const workspace = await ensureWorkspace(appSettings, options.agentId);
	if (!workspace.settings.enabled || !workspace.settings.search.enabled)
		return [];
	await migrateGraphMemoryIfNeeded(workspace, appSettings);
	const database = getDb(workspace);
	const limit = coreNormalizeSoulMemorySearchLimit(
		options.limit,
		workspace.settings.search.maxResults,
	);
	if (indexTracker.dirty) {
		logMemoryDiagnostic({
			subsystem: "search",
			operation: "memory-search",
			stage: "index",
			status: "skipped",
			runId,
			summary:
				"Using existing Markdown index; dirty index sync is deferred off the chat request path.",
			metadata: {
				dirtyReason: indexTracker.dirtyReason,
				revision: indexTracker.dirtyRevision,
				inFlight: indexSyncScheduler.isInFlight(),
			},
		});
	}
	logMemoryDiagnostic({
		subsystem: "search",
		operation: "memory-search",
		stage: "start",
		status: "started",
		runId,
		request: {
			queryPreview: previewLine(options.query, 160),
			queryHash: sha(options.query).slice(0, 16),
			limit,
			embeddingsEnabled: workspace.settings.embeddings.enabled,
		},
	});
	const graphHits = await runtimeSearchGraphMemory({
		settings: appSettings,
		workspace,
		database,
		query: options.query,
		limit,
		minScore: options.minScore,
		embedTexts: (settings, values) =>
			embedTexts({ settings: settings ?? getSettings(), values }),
		setLastError: (message) => {
			lastStatus.lastError = message;
		},
		logDiagnostic: (event) => logMemoryDiagnostic(event),
	});
	const markdownHits = await runtimeSearchMarkdownMemoryChunks({
		settings: appSettings,
		workspace,
		database,
		query: options.query,
		limit,
		minScore: options.minScore,
		embedTexts: (settings, values) =>
			embedTexts({ settings: settings ?? getSettings(), values }),
		setLastError: (message) => {
			lastStatus.lastError = message;
		},
		logDiagnostic: (event) => logMemoryDiagnostic(event),
		runId,
		startedAt,
	});
	const searchResult = coreBuildSoulMemorySearchResult<SearchHit>({
		graphHits,
		markdownHits,
		limit,
		mmrEnabled: workspace.settings.search.mmrEnabled,
		embeddingsEnabled: workspace.settings.embeddings.enabled,
	});
	logMemoryDiagnostic({
		subsystem: "search",
		operation: "memory-search",
		stage: "finish",
		status: "ok",
		durationMs: Date.now() - startedAt,
		runId,
		response: { ...searchResult.summary },
	});
	return searchResult.selected;
}

async function readMemoryFileExcerpt(options: {
	workspace: MemoryWorkspace;
	inputPath: string;
	startLine?: number;
	endLine?: number;
	from?: number;
	lines?: number;
}): Promise<{
	relativePath: string;
	text: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
}> {
	const target = coreResolveSoulMemoryFilePath({
		root: options.workspace.root,
		inputPath: options.inputPath,
		allowDreams: true,
	});
	const content = await readTextFileAsync(target.absolutePath);
	return coreReadSoulMemoryFileExcerptFromContent({
		relativePath: target.relativePath,
		content,
		startLine: options.from || options.startLine,
		endLine: options.endLine,
		lines: options.lines,
		defaultLines: options.workspace.settings.read.defaultLines,
		maxLines: options.workspace.settings.read.maxLines,
	});
}

async function appendMemory(options: {
	settings?: AppSettings;
	agentId?: string;
	content: string;
	target?: "daily" | "memory";
	filePath?: string;
	heading?: string;
}): Promise<{ absolutePath: string; relativePath: string }> {
	const workspace = await ensureWorkspace(options.settings, options.agentId);
	return runtimeAppendMemoryNote({
		workspace,
		content: options.content,
		target: options.target,
		filePath: options.filePath,
		heading: options.heading,
		logDiagnostic: (event) => logMemoryDiagnostic(event),
		onIndexableWrite: (target) => {
			markIndexDirty("daily-note-write", { relativePath: target.relativePath });
			scheduleIndexSync({
				settings: options.settings,
				agentId: workspace.agentId,
				reason: "daily-note-write",
			});
		},
	});
}

function markHermesFileMemoryChanged(
	workspace: MemoryWorkspace,
	relativePath: string,
	reason: string,
): void {
	// User-notes workspaces (empty dbPath) have no FTS index; scheduling a sync
	// keyed by their id would create a stray agentsDir workspace.
	if (!workspace.dbPath) return;
	if (!isIndexableMarkdownPath(relativePath)) return;
	markIndexDirty(reason, { relativePath });
	scheduleIndexSync({
		settings: getSettings(),
		agentId: workspace.agentId,
		reason,
	});
}

// Graph CRUD functions extracted to ../../memory/graph.ts

// Canonical memory CRUD extracted to ../../memory/canonical.ts

async function canonicalEmbedding(
	settings: AppSettings | undefined,
	text: string,
): Promise<{ embedding?: number[]; provider?: string; model?: string }> {
	return coreRunSoulMemoryCanonicalEmbeddingWithAdapters({
		settings,
		text,
		getSettings,
		resolveSettings,
		embedTexts,
		hashText: sha,
		previewText: previewLine,
		setLastError: (message) => {
			lastStatus.lastError = message;
		},
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event);
		},
	});
}

async function migrateCanonicalMemoryIfNeeded(
	workspace: MemoryWorkspace,
	settings?: AppSettings,
): Promise<void> {
	if (!workspace.settings.canonicalMemory.enabled) return;
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	if (pluginStore.get<boolean>(CANONICAL_MIGRATION_STORE_KEY) === true) return;

	try {
		const pending = getPendingCaptures(pluginStore);
		const pendingCandidates =
			coreBuildSoulMemoryPendingCaptureMigrationCandidates(
				pending,
			) as CaptureCandidate[];
		if (pendingCandidates.length > 0) {
			await upsertCanonicalCandidates({
				settings,
				workspace,
				candidates: pendingCandidates,
				source: "migration:pending-captures",
				evidence: pending
					.map((capture) => capture.userPreview)
					.filter(Boolean)
					.join("\n"),
				action: "migrate",
			});
			setPendingCaptures(pluginStore, []);
		}

		const legacy = await readTextFileIfExists(workspace.memoryPath);
		const legacyCandidates = extractLegacyMemoryCandidates(legacy);
		if (legacyCandidates.length > 0) {
			await upsertCanonicalCandidates({
				settings,
				workspace,
				candidates: legacyCandidates,
				source: "migration:MEMORY.md",
				evidence: "Imported from legacy MEMORY.md without modifying the file.",
				action: "migrate",
			});
		}

		pluginStore.set(CANONICAL_MIGRATION_STORE_KEY, true);
	} catch (error: any) {
		lastStatus.lastError = `Canonical memory migration failed: ${error?.message || String(error)}`;
	}
}

async function migrateGraphMemoryIfNeeded(
	workspace: MemoryWorkspace,
	settings?: AppSettings,
): Promise<void> {
	if (!workspace.settings.canonicalMemory.enabled) return;
	ensureUserSelfEntity(workspace);
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	if (pluginStore.get<boolean>(GRAPH_MIGRATION_STORE_KEY) === true) {
		reconcileSingletonGraphObservations(workspace);
		return;
	}

	try {
		await migrateCanonicalMemoryIfNeeded(workspace, settings);

		const canonicalRows = listCanonicalMemories({
			workspace,
			includeDeleted: false,
			limit: 500,
		});
		if (canonicalRows.length > 0) {
			await upsertGraphCandidates({
				settings,
				workspace,
				candidates: coreBuildSoulMemoryCanonicalGraphMigrationCandidates(
					canonicalRows,
				) as CaptureCandidate[],
				source: "migration:canonical_memories",
				evidence:
					"Migrated non-deleted rows from legacy canonical_memories without deleting the legacy table.",
				action: "migrate",
			});
		}

		const pending = getPendingCaptures(pluginStore);
		const pendingCandidates =
			coreBuildSoulMemoryPendingCaptureMigrationCandidates(
				pending,
			) as CaptureCandidate[];
		if (pendingCandidates.length > 0) {
			await upsertGraphCandidates({
				settings,
				workspace,
				candidates: pendingCandidates,
				source: "migration:pending-captures",
				evidence: pending
					.map((capture) => capture.userPreview)
					.filter(Boolean)
					.join("\n"),
				action: "migrate",
			});
			setPendingCaptures(pluginStore, []);
		}

		const legacy = await readTextFileIfExists(workspace.memoryPath);
		const legacyCandidates = extractLegacyMemoryCandidates(legacy);
		if (legacyCandidates.length > 0) {
			await upsertGraphCandidates({
				settings,
				workspace,
				candidates: legacyCandidates,
				source: "migration:MEMORY.md",
				evidence:
					"Imported recognizable legacy user facts from MEMORY.md without modifying the file.",
				action: "migrate",
			});
		}

		pluginStore.set(GRAPH_MIGRATION_STORE_KEY, true);
		reconcileSingletonGraphObservations(workspace);
	} catch (error: any) {
		lastStatus.lastError = `Graph memory migration failed: ${error?.message || String(error)}`;
	}
}

async function mergeCanonicalMemory(options: {
	settings?: AppSettings;
	candidates: Array<
		Pick<CaptureCandidate, "kind" | "text"> & Partial<CaptureCandidate>
	>;
	source?: string;
	evidence?: string;
	sessionId?: string;
	messageId?: string;
	action?: CanonicalMemoryAuditEvent["action"];
}): Promise<{
	absolutePath: string;
	relativePath: string;
	applied: number;
	skipped: number;
}> {
	const workspace = await ensureWorkspace(options.settings);
	if (!workspace.settings.enabled) {
		throw new Error("Soul-memory is disabled in settings");
	}
	const candidates = coreNormalizeSoulMemoryCanonicalMergeCandidates(
		options.candidates,
		workspace.settings.canonicalMemory.highConfidenceThreshold,
	) as CaptureCandidate[];
	const result = await upsertCanonicalCandidates({
		settings: options.settings,
		workspace,
		candidates,
		source: options.source || "manual",
		evidence: options.evidence,
		sessionId: options.sessionId,
		messageId: options.messageId,
		action: options.action,
	});

	return {
		absolutePath: workspace.dbPath,
		relativePath: "canonical profile",
		applied: result.applied + result.updated,
		skipped: result.duplicates,
	};
}

async function appendDailyNoteBullets(options: {
	settings?: AppSettings;
	agentId?: string;
	bullets: string[];
	heading?: string;
}): Promise<{ absolutePath: string; relativePath: string } | null> {
	const workspace = await ensureWorkspace(options.settings, options.agentId);
	return runtimeAppendDailyNoteCaptureBullets({
		workspace,
		bullets: options.bullets,
		heading: options.heading,
		logDiagnostic: (event) => logMemoryDiagnostic(event),
		onIndexableWrite: (target) => {
			markIndexDirty("daily-note-write", { relativePath: target.relativePath });
			scheduleIndexSync({
				settings: options.settings,
				agentId: workspace.agentId,
				reason: "daily-note-write",
			});
		},
	});
}

type DailyNoteCaptureCandidate = CoreDailyNoteCaptureCandidate;
type DailyNoteCaptureResult = CoreDailyNoteCaptureResult;

interface DailyNoteCaptureApplyResult extends CoreDailyNoteCaptureApplyResult {
	absolutePath: string;
	relativePath: string;
}

type CaptureStore = Pick<PluginAPI["store"], "get" | "set">;

const extractLegacyMemoryCandidates = coreExtractLegacyMemoryCandidates as (
	content: string,
) => CaptureCandidate[];
const dailyNoteTimeHeading = coreDailyNoteTimeHeading;
const hasExplicitMemoryIntent = coreHasExplicitMemoryIntent;
const stripJsonFence = stripSoulMemoryJsonFence;
const clampCaptureConfidence = coreClampCaptureConfidence;
const optionalCaptureText = coreOptionalCaptureText;
const parseDailyNoteCaptureResult = coreParseDailyNoteCaptureResult as (
	value: string,
) => DailyNoteCaptureResult | null;
const isLikelyRawRequestEcho = coreIsLikelyRawRequestEcho;
const isLowValueDailyNoteLine = coreIsLowValueDailyNoteLine;
const parseDailyNoteBullets = coreParseDailyNoteBullets;
async function buildMemoryCaptureInput(
	context: AfterAssistantResponseContext,
	workspace: MemoryWorkspace,
	maxChars: number,
): Promise<string> {
	return runtimeBuildMemoryCaptureInput({
		workspace,
		context,
		maxChars,
	});
}

async function dedupeDailyNoteBullets(
	workspace: MemoryWorkspace,
	bullets: string[],
): Promise<string[]> {
	return runtimeDedupeDailyNoteCaptureBullets({
		workspace,
		bullets,
	});
}

async function applyDailyNoteCaptureActions(options: {
	settings?: AppSettings;
	workspace?: MemoryWorkspace;
	candidates: DailyNoteCaptureCandidate[];
	heading?: string;
}): Promise<DailyNoteCaptureApplyResult | null> {
	const workspace =
		options.workspace || (await ensureWorkspace(options.settings));
	return runtimeApplyDailyNoteCaptureActions({
		workspace,
		candidates: options.candidates,
		heading: options.heading,
		logDiagnostic: (event) => logMemoryDiagnostic(event),
		onIndexableWrite: (target) => {
			markIndexDirty("daily-note-actions", {
				relativePath: target.relativePath,
			});
			scheduleIndexSync({
				settings: options.settings,
				agentId: workspace.agentId,
				reason: "daily-note-actions",
			});
		},
	});
}

function getPendingCaptures(storeLike: CaptureStore): MemoryCapturePending[] {
	return coreGetSoulMemoryPendingCaptures(storeLike, {
		key: CAPTURE_PENDING_STORE_KEY,
		maxPending: CAPTURE_MAX_PENDING,
	}) as MemoryCapturePending[];
}

function setPendingCaptures(
	storeLike: CaptureStore,
	captures: MemoryCapturePending[],
): void {
	coreSetSoulMemoryPendingCaptures(storeLike, captures, {
		key: CAPTURE_PENDING_STORE_KEY,
		maxPending: CAPTURE_MAX_PENDING,
	});
}

function publicPendingCaptures(agentId?: string): MemoryCapturePending[] {
	return coreGetSoulMemoryPublicPendingCaptures(
		new PluginStore(SOUL_MEMORY_PLUGIN_ID),
		{
			key: CAPTURE_PENDING_STORE_KEY,
			maxPending: CAPTURE_MAX_PENDING,
			agentId,
			defaultAgentId: DEFAULT_AGENT_ID,
		},
	) as MemoryCapturePending[];
}

async function runMemoryCapture(
	api: PluginAPI,
	context: AfterAssistantResponseContext,
	workspaceOverride?: MemoryWorkspace,
): Promise<void> {
	const agentId = resolveAfterResponseAgentId(context);
	const workspace =
		workspaceOverride || (await ensureWorkspace(context.settings, agentId));
	await runtimeRunMemoryCapture<MemoryToolProvider>({
		workspace,
		sessionId: context.sessionId,
		assistantMessageId: context.assistantMessageId,
		context,
		resolveProvider: async () => {
			const provider = await resolveMemoryToolProvider(
				context.settings,
				"Memory Capture",
			);
			return {
				provider,
				providerId: provider.providerId,
				model: String(provider.config.model || "none"),
				source: provider.source,
			};
		},
		generateCapture: ({ provider, system, prompt, temperature, maxTokens }) =>
			generateChatResponse(
				provider.providerId,
				provider.config,
				[
					{ role: "system", content: system },
					{ role: "user", content: prompt },
				],
				{ temperature, maxTokens },
			),
		applyStatusMutation: (plan) => {
			applySoulMemoryStatusMutation(api.store, plan);
		},
		notify: (message, level) => api.ui.notify(message, level),
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
		},
		onIndexableWrite: (target) => {
			// User-notes workspaces have no FTS index; syncing with the user's id
			// would resurrect an agentsDir workspace.
			if (workspaceOverride) return;
			markIndexDirty("daily-note-actions", {
				relativePath: target.relativePath,
			});
			scheduleIndexSync({
				settings: context.settings,
				agentId: workspace.agentId,
				reason: "daily-note-actions",
			});
		},
	});
}

type PlainReviewTarget = CorePlainReviewTarget;

function getPlainReviewFile(
	workspace: MemoryWorkspace,
	target: PlainReviewTarget,
): { absolutePath: string; relativePath: "SOUL.md" | "DREAMS.md" } {
	return runtimeGetPlainReviewFile(workspace, target);
}

async function readPlainReviewFile(
	workspace: MemoryWorkspace,
	target: PlainReviewTarget,
): Promise<{
	absolutePath: string;
	relativePath: "SOUL.md" | "DREAMS.md";
	content: string;
}> {
	return runtimeReadPlainReviewFile(workspace, target);
}

async function buildMemoryReviewInput(
	context: AfterAssistantResponseContext,
	workspace: MemoryWorkspace,
	maxChars: number,
): Promise<string> {
	return runtimeBuildMemoryReviewInput({
		workspace,
		messages: context.messages,
		maxChars,
	});
}

async function applyMemoryReviewCandidate(
	workspace: MemoryWorkspace,
	candidate: CoreMemoryReviewCandidate,
	minConfidence: number,
): Promise<{
	changed: boolean;
	skipped: boolean;
	relativePath?: string;
	reason?: string;
}> {
	return runtimeApplyMemoryReviewCandidate({
		workspace,
		candidate,
		minConfidence,
		onIndexableWrite: (target) => {
			markHermesFileMemoryChanged(
				workspace,
				target.relativePath,
				"memory-review-candidate",
			);
		},
	});
}

async function runMemoryReview(
	api: PluginAPI,
	context: AfterAssistantResponseContext,
	options: {
		force?: boolean;
		workspaceOverride?: MemoryWorkspace;
		identityContext?: string;
	} = {},
): Promise<void> {
	const agentId = resolveAfterResponseAgentId(context);
	const workspace =
		options.workspaceOverride ||
		(await ensureWorkspace(context.settings, agentId));
	await runtimeRunMemoryReview<MemoryToolProvider>({
		workspace,
		sessionId: context.sessionId,
		assistantMessageId: context.assistantMessageId,
		messages: context.messages,
		lastUserMessage: context.lastUserMessage,
		lastAssistantMessage: context.lastAssistantMessage,
		force: options.force,
		allowedTargets: options.identityContext
			? new Set(["user", "memory"])
			: undefined,
		lastReviewedTurn: api.store.get<number>(
			runtimeMemoryReviewLastTurnKey(agentId, context.sessionId),
		),
		resolveProvider: async () => {
			const provider = await resolveMemoryToolProvider(
				context.settings,
				"Memory Review",
			);
			return {
				provider,
				providerId: provider.providerId,
				model: String(provider.config.model || "none"),
				source: provider.source,
			};
		},
		generateReview: ({ provider, system, prompt, temperature, maxTokens }) => {
			const finalSystem = options.identityContext
				? `${system}\n\n${options.identityContext}`
				: system;
			return generateChatResponse(
				provider.providerId,
				provider.config,
				[
					{ role: "system", content: finalSystem },
					{ role: "user", content: prompt },
				],
				{ temperature, maxTokens },
			);
		},
		applyStatusMutation: (plan) => {
			applySoulMemoryStatusMutation(api.store, plan);
		},
		notify: (message, level) => api.ui.notify(message, level),
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
		},
		onIndexableWrite: (target) => {
			markHermesFileMemoryChanged(
				workspace,
				target.relativePath,
				"memory-review-candidate",
			);
		},
	});
}

async function savePendingCapture(
	id?: string,
): Promise<{ absolutePath: string; relativePath: string }> {
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	return coreSaveSoulMemoryPendingCaptureWithAdapters({
		store: pluginStore,
		key: CAPTURE_PENDING_STORE_KEY,
		maxPending: CAPTURE_MAX_PENDING,
		id,
		runtimeStatus: lastStatus,
		saveSelectedCapture: async (capture) => {
			const selected = capture as MemoryCapturePending;
			const workspace = await ensureWorkspace(undefined, selected.agentId);
			return selected.target === "memory"
				? mergeGraphMemory({
						workspace,
						agentId: selected.agentId,
						candidates: selected.content.split(/\r?\n/).map((line) => ({
							kind: "fact",
							text: line,
							confidence: selected.confidence,
							source: "user",
							explicit: selected.explicit,
						})),
						source: "pending-capture",
						evidence: selected.userPreview,
						sessionId: selected.sessionId,
					})
				: appendMemory({
						agentId: selected.agentId,
						content: selected.content,
						target: selected.target,
						heading: selected.heading,
					});
		},
	});
}

function discardPendingCapture(id?: string): MemoryCapturePending {
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	return coreDiscardSoulMemoryPendingCaptureWithAdapters({
		store: pluginStore,
		key: CAPTURE_PENDING_STORE_KEY,
		maxPending: CAPTURE_MAX_PENDING,
		id,
		runtimeStatus: lastStatus,
	}) as MemoryCapturePending;
}

function buildPublicDreamingStatus(
	workspace: MemoryWorkspace,
): MemoryDreamingStatus {
	const scheduled = getScheduler().getStatus(DREAMING_SCHEDULER_TASK_ID);
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	return coreBuildSoulMemoryPublicDreamingStatus({
		settings: workspace.settings.dreaming,
		model: coreFormatSoulMemoryToolModelRef(
			asCoreProviderSelectionSettings(getSettings()),
		),
		sources: ["daily"],
		resolveNextRunAt: (frequency, timezone, from) =>
			nextCronRunAt(frequency, timezone, from),
		scheduled,
		store: pluginStore,
		runtimeStatus: lastStatus,
		inFlight: dreamingRunInFlight !== null,
	});
}

export async function getSoulMemoryOverview(
	agentId = DEFAULT_AGENT_ID,
): Promise<MemoryOverview> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, agentId);
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
	await migrateGraphMemoryIfNeeded(workspace, settings);
	let status: MemoryIndexStatus;
	try {
		status = refreshIndexStatus(getDb(workspace));
		if (indexTracker.dirty && !indexSyncScheduler.isInFlight()) {
			scheduleIndexSync({
				settings,
				agentId,
				reason: "overview-refresh",
			});
		}
	} catch (error: any) {
		lastStatus.lastError = error?.message || String(error);
		status = lastStatus;
	}
	const files = (await runtimeListManagedMemoryFiles(
		workspace,
	)) as MemoryManagedFile[];
	return coreBuildSoulMemoryOverview({
		workspace: {
			enabled: workspace.settings.enabled,
			agentId: workspace.agentId,
			root: workspace.root,
			memoryDir: workspace.memoryDir,
			soulPath: workspace.soulPath,
			userPath: workspace.userPath,
			memoryPath: workspace.memoryPath,
			dreamsPath: workspace.dreamsPath,
			todayPath: workspace.todayPath,
			dbPath: workspace.dbPath,
			settings: workspace.settings,
		},
		status,
		captureStatusStore: pluginStore,
		dreaming: buildPublicDreamingStatus(workspace),
		pendingCaptures: publicPendingCaptures(workspace.agentId),
		canonicalCount: getCanonicalMemoryCount(workspace),
		graph: workspace.settings.canonicalMemory.enabled
			? getGraphOverview(workspace)
			: { entities: 0, observations: 0, relations: 0, pendingDuplicates: 0 },
		files,
	}) as MemoryOverview;
}

export async function readSoulMemoryManagedFile(
	request: MemoryReadRequest,
): Promise<{
	relativePath: string;
	text: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
}> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	return readManagedMemoryFile({
		workspace,
		path: request.path,
		startLine: request.startLine,
		endLine: request.endLine,
		lines: request.lines,
		full: request.full,
	});
}

export async function saveSoulMemoryManagedFile(
	request: MemorySaveFileRequest,
): Promise<MemoryManagedFile> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	return saveManagedMemoryFile({
		workspace,
		path: request.path,
		content: request.content,
		onIndexableWrite: (target) => {
			markIndexDirty("managed-file-save", {
				relativePath: target.relativePath,
			});
			scheduleIndexSync({
				settings: getSettings(),
				agentId: request.agentId,
				reason: "managed-file-save",
			});
		},
	});
}

export async function searchSoulMemoryPanel(
	request: MemorySearchRequest,
): Promise<MemorySearchHit[]> {
	const query = request.query.trim();
	if (!query) return [];
	return searchMemory({
		agentId: request.agentId,
		query,
		limit: request.limit,
	});
}

export async function listSoulMemoryProfile(
	request: MemoryProfileListRequest = {},
): Promise<CanonicalMemoryRecord[]> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	await migrateCanonicalMemoryIfNeeded(workspace, settings);
	const memories = listCanonicalMemories({
		workspace,
		query: request.query,
		includeDeleted: request.includeDeleted,
		limit: request.limit,
	});
	return request.limit ? memories.slice(0, request.limit) : memories;
}

export async function searchSoulMemoryProfile(
	request: MemoryProfileListRequest,
): Promise<CanonicalMemoryRecord[]> {
	return listSoulMemoryProfile(request);
}

export async function upsertSoulMemoryProfile(
	request: MemoryProfileUpsertRequest,
): Promise<CanonicalMemoryRecord> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	const existing = request.id
		? getCanonicalMemoryByIdOrKey(workspace, request.id, true)
		: null;
	const plan = corePlanSoulMemoryProfileUpsert(request, existing);
	const result = await upsertCanonicalMemory(workspace, plan.input, {
		settings,
		action: plan.action,
	});
	return result.memory;
}

export async function deleteSoulMemoryProfile(
	request: MemoryProfileDeleteRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	deleteCanonicalMemory(workspace, request.id);
}

export async function getSoulMemoryProfileAudit(
	request: MemoryProfileAuditRequest,
): Promise<CanonicalMemoryAuditEvent[]> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	return getCanonicalMemoryAudit(workspace, request.id);
}

export async function exportSoulMemoryProfile(
	agentId?: string,
): Promise<string> {
	const workspace = await ensureWorkspace(getSettings(), agentId);
	const memories = listCanonicalMemories({ workspace, limit: 500 });
	return coreFormatSoulMemoryCanonicalProfileExport({ memories });
}

export async function getSoulMemoryGraphOverview(
	agentId?: string,
): Promise<MemoryGraphOverview> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, agentId);
	if (!workspace.settings.canonicalMemory.enabled) {
		return { entities: 0, observations: 0, relations: 0, pendingDuplicates: 0 };
	}
	await migrateGraphMemoryIfNeeded(workspace, settings);
	return getGraphOverview(workspace);
}

export async function listSoulMemoryGraphEntities(
	request: MemoryGraphListRequest = {},
): Promise<MemoryGraphEntity[]> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	await migrateGraphMemoryIfNeeded(workspace, settings);
	return listGraphEntities({
		workspace,
		query: request.query,
		includeDeleted: request.includeDeleted,
		limit: request.limit,
	});
}

export async function upsertSoulMemoryGraphEntity(
	request: MemoryGraphEntityUpsertRequest,
): Promise<MemoryGraphEntity> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	const result = upsertGraphEntity(
		workspace,
		{
			id: request.id,
			entityType: request.entityType,
			name: request.name,
			displayName: request.displayName,
			aliases: request.aliases,
			confidence: request.confidence ?? 1,
			sensitivity: request.sensitivity || "normal",
			source: "panel",
			evidence: request.evidence || "Edited in Memory Graph panel.",
		},
		{ settings, action: request.id ? "update" : "create" },
	);
	return result.entity;
}

export async function deleteSoulMemoryGraphEntity(
	request: MemoryGraphDeleteRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	deleteGraphEntity(workspace, request.id);
}

export async function listSoulMemoryGraphObservations(
	request: MemoryGraphListRequest & { entityId?: string } = {},
): Promise<MemoryGraphObservation[]> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	await migrateGraphMemoryIfNeeded(workspace, settings);
	return listGraphObservations({
		workspace,
		query: request.query,
		includeDeleted: request.includeDeleted,
		limit: request.limit,
		entityId: request.entityId,
	});
}

export async function upsertSoulMemoryGraphObservation(
	request: MemoryGraphObservationUpsertRequest,
): Promise<MemoryGraphObservation> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	if (!getGraphEntityById(workspace, request.entityId, true)) {
		throw new Error(`Graph entity not found: ${request.entityId}`);
	}
	const result = await upsertGraphObservation(
		workspace,
		{
			id: request.id,
			entityId: request.entityId,
			kind: request.kind,
			slot: request.slot,
			value: request.value,
			text: request.text || request.value,
			confidence: request.confidence ?? 1,
			sensitivity: request.sensitivity || "normal",
			status: request.status || "active",
			source: "panel",
			evidence: request.evidence || "Edited in Memory Graph panel.",
		},
		{ settings, action: request.id ? "update" : "create" },
	);
	return result.observation;
}

export async function deleteSoulMemoryGraphObservation(
	request: MemoryGraphDeleteRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	deleteGraphObservation(workspace, request.id);
}

export async function listSoulMemoryGraphRelations(
	request: MemoryGraphListRequest & { entityId?: string } = {},
): Promise<MemoryGraphRelation[]> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	await migrateGraphMemoryIfNeeded(workspace, settings);
	return listGraphRelations({
		workspace,
		query: request.query,
		includeDeleted: request.includeDeleted,
		limit: request.limit,
		entityId: request.entityId,
	});
}

export async function upsertSoulMemoryGraphRelation(
	request: MemoryGraphRelationUpsertRequest,
): Promise<MemoryGraphRelation> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	if (!getGraphEntityById(workspace, request.fromEntityId, true))
		throw new Error(`Graph entity not found: ${request.fromEntityId}`);
	if (!getGraphEntityById(workspace, request.toEntityId, true))
		throw new Error(`Graph entity not found: ${request.toEntityId}`);
	const result = await upsertGraphRelation(
		workspace,
		{
			id: request.id,
			fromEntityId: request.fromEntityId,
			relationType: request.relationType,
			toEntityId: request.toEntityId,
			text: request.text,
			confidence: request.confidence ?? 1,
			sensitivity: request.sensitivity || "normal",
			status: request.status || "active",
			source: "panel",
			evidence: request.evidence || "Edited in Memory Graph panel.",
		},
		{ settings, action: request.id ? "update" : "create" },
	);
	return result.relation;
}

export async function deleteSoulMemoryGraphRelation(
	request: MemoryGraphDeleteRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	deleteGraphRelation(workspace, request.id);
}

export async function listSoulMemoryGraphDuplicates(
	request: MemoryGraphListRequest = {},
): Promise<MemoryGraphDuplicate[]> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, request.agentId);
	await migrateGraphMemoryIfNeeded(workspace, settings);
	return listGraphDuplicates({
		workspace,
		query: request.query,
		limit: request.limit,
	});
}

export async function mergeSoulMemoryGraphDuplicate(
	request: MemoryGraphDuplicateDecisionRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	mergeGraphDuplicate(workspace, request.id);
}

export async function ignoreSoulMemoryGraphDuplicate(
	request: MemoryGraphDuplicateDecisionRequest,
): Promise<void> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	ignoreGraphDuplicate(workspace, request.id);
}

export async function getSoulMemoryGraphAudit(
	request: MemoryGraphAuditRequest,
): Promise<MemoryGraphAuditEvent[]> {
	const workspace = await ensureWorkspace(getSettings(), request.agentId);
	return getGraphAudit(workspace, request.id);
}

export async function appendSoulMemoryPanel(
	request: MemoryAppendRequest,
): Promise<{
	absolutePath: string;
	relativePath: string;
}> {
	return appendMemory({
		agentId: request.agentId,
		content: request.content,
		target: "daily",
		heading: request.heading,
	});
}

export async function rebuildSoulMemoryIndex(
	agentId?: string,
): Promise<MemoryIndexStatus> {
	return syncIndex({ force: true, agentId });
}

export async function runSoulMemoryDreamingNow(
	agentId?: string,
): Promise<DreamingRunResult | null> {
	return coreRunSoulMemoryManualDreamingWithAdapters<DreamingRunResult>({
		agentId,
		defaultAgentId: DEFAULT_AGENT_ID,
		hasActivePluginApi: Boolean(activeSoulMemoryPluginApi),
		runWithPluginApi: async (plan) =>
			runMemoryDreamingSweep(activeSoulMemoryPluginApi!, {
				agentId: plan.agentId,
				reason: plan.reason,
				force: plan.force,
			}),
		runWithScheduler: (plan) =>
			getScheduler().runNow(DREAMING_SCHEDULER_TASK_ID, {
				reason: plan.reason,
				force: plan.force,
			}) as Promise<{
				ok: boolean;
				error?: string;
				result?: DreamingRunResult | null;
			}>,
	});
}

export async function saveSoulMemoryPendingCapture(id?: string): Promise<{
	absolutePath: string;
	relativePath: string;
}> {
	return savePendingCapture(id);
}

export async function discardSoulMemoryPendingCapture(
	id?: string,
): Promise<MemoryCapturePending> {
	return discardPendingCapture(id);
}

type DreamingRunResult = {
	status: "applied" | "none" | "skipped";
	applied: number;
	sourceFiles: string[];
	report: string;
	memory: string;
	runAt: number;
	nextRunAt?: number;
	timeline?: SchedulerRunTimelineEntryDTO[];
};

let dreamingRunInFlight: Promise<DreamingRunResult | null> | null = null;

type DreamingMemoryAction = CoreDreamingMemoryAction;
type DreamingMemoryCandidate = CoreDreamingMemoryCandidate;
type DreamingMemoryResult = CoreDreamingMemoryResult;

type DreamingMemoryApplyResult = CoreDreamingMemoryApplyResult;

const parseDreamingOutput = coreParseDreamingOutput as (
	text: string,
) => DreamingMemoryResult;

type SoulMemoryStatusStoreWriter = Pick<PluginAPI["store"], "set" | "delete">;

function applySoulMemoryStatusMutation(
	storeLike: SoulMemoryStatusStoreWriter,
	plan: CoreSoulMemoryStatusMutationPlan,
): void {
	coreApplySoulMemoryStatusMutationPlan({
		store: storeLike,
		runtimeStatus: lastStatus,
		plan,
	});
}

async function collectDailyDreamingSources(
	workspace: MemoryWorkspace,
): Promise<DreamingSource[]> {
	return runtimeCollectDailyDreamingSources(workspace) as Promise<
		DreamingSource[]
	>;
}

async function collectDreamingSources(
	workspace: MemoryWorkspace,
): Promise<{ sources: DreamingSource[] }> {
	return runtimeCollectDreamingSources(workspace) as Promise<{
		sources: DreamingSource[];
	}>;
}

interface MemoryToolProviderSelection {
	providerId: string;
	config: any;
	model: string;
	source: "tool" | "default";
}

interface MemoryToolProvider extends MemoryToolProviderSelection {
	modelRef: string;
}

function asCoreProviderSelectionSettings(
	settings: AppSettings,
): CoreSoulMemoryProviderSelectionSettings {
	return settings as unknown as CoreSoulMemoryProviderSelectionSettings;
}

async function resolveMemoryToolProvider(
	settings: AppSettings,
	purpose: string,
): Promise<MemoryToolProvider> {
	const selection = coreResolveSoulMemoryToolProviderSelection(
		asCoreProviderSelectionSettings(settings),
	) as MemoryToolProviderSelection;
	const authContext = await resolveProviderAuth(
		selection.providerId,
		selection.config,
	);
	return coreCreateSoulMemoryToolProvider(
		selection,
		authContext,
		purpose,
	) as MemoryToolProvider;
}

async function resolveDreamingProvider(
	settings: AppSettings,
): Promise<MemoryToolProvider> {
	return resolveMemoryToolProvider(settings, "Memory Dreaming");
}

async function resolveMemoryReviewProvider(
	settings: AppSettings,
): Promise<MemoryToolProvider> {
	return resolveMemoryToolProvider(settings, "Memory Review");
}

async function buildDreamingExistingMemorySummary(
	workspace: MemoryWorkspace,
): Promise<string> {
	return runtimeBuildDreamingExistingMemorySummary(workspace);
}

async function applyDreamingMemoryActions(
	workspace: MemoryWorkspace,
	result: DreamingMemoryResult,
	runAt: Date,
): Promise<DreamingMemoryApplyResult> {
	return runtimeApplyDreamingMemoryActions({
		workspace,
		result,
		runAt,
		logDiagnostic: (event) => logMemoryDiagnostic(event),
		onIndexableWrite: (target) => {
			markHermesFileMemoryChanged(
				workspace,
				target.relativePath,
				"dreaming-memory-actions",
			);
		},
	}) as Promise<DreamingMemoryApplyResult>;
}

async function runMemoryDreamingSweep(
	api: PluginAPI,
	options: {
		reason: SchedulerRunReason;
		agentId?: string;
		force?: boolean;
		settings?: AppSettings;
		now?: Date;
	},
): Promise<DreamingRunResult | null> {
	if (dreamingRunInFlight) return dreamingRunInFlight;
	dreamingRunInFlight = (async () => {
		const settings = options.settings || getSettings();
		const workspace = await ensureWorkspace(settings, options.agentId);
		return (await runtimeRunMemoryDreamingSweep<MemoryToolProvider>({
			workspace,
			reason: options.reason,
			force: options.force,
			now: options.now,
			getNextRunAt: (dreaming, from) =>
				coreGetSoulMemoryDreamingNextRunStatus(dreaming, nextCronRunAt, from),
			resolveProvider: async () => {
				const provider = await resolveDreamingProvider(settings);
				return {
					provider,
					modelRef: provider.modelRef,
					source: provider.source,
				};
			},
			generateDreaming: ({
				provider,
				system,
				prompt,
				temperature,
				maxTokens,
			}) =>
				generateChatResponse(
					provider.providerId,
					provider.config,
					[
						{ role: "system", content: system },
						{ role: "user", content: prompt },
					],
					{ temperature, maxTokens },
				),
			applyStatusMutation: (plan) => {
				applySoulMemoryStatusMutation(api.store, plan);
			},
			logDiagnostic: (event) => {
				logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
			},
			onIndexableWrite: (target) => {
				markHermesFileMemoryChanged(
					workspace,
					target.relativePath,
					"dreaming-memory-actions",
				);
			},
		})) as DreamingRunResult | null;
	})();

	try {
		return await dreamingRunInFlight;
	} catch (error: any) {
		throw error;
	} finally {
		dreamingRunInFlight = null;
	}
}

function saveDreamingSettingsPatch(
	patch: Partial<SoulMemoryDreamingSettings>,
): ResolvedSoulMemorySettings["dreaming"] {
	return corePatchSoulMemorySettingsSectionWithAdapters({
		section: "dreaming",
		patch,
		getSettings: () => getSettings(),
		saveSettings: (settings) => saveSettings(settings),
		resolveSettings: (settings) => resolveSettings(settings),
		selectSection: (settings) => settings.dreaming,
	});
}

function saveCaptureSettingsPatch(
	patch: Partial<SoulMemoryCaptureSettings>,
): ResolvedSoulMemorySettings["capture"] {
	return corePatchSoulMemorySettingsSectionWithAdapters({
		section: "capture",
		patch,
		getSettings: () => getSettings(),
		saveSettings: (settings) => saveSettings(settings),
		resolveSettings: (settings) => resolveSettings(settings),
		selectSection: (settings) => settings.capture,
	});
}

function saveReviewSettingsPatch(
	patch: Partial<SoulMemoryReviewSettings>,
): ResolvedSoulMemorySettings["review"] {
	return corePatchSoulMemorySettingsSectionWithAdapters({
		section: "review",
		patch,
		getSettings: () => getSettings(),
		saveSettings: (settings) => saveSettings(settings),
		resolveSettings: (settings) => resolveSettings(settings),
		selectSection: (settings) => settings.review,
	});
}

function buildDreamingStatus(
	api: PluginAPI,
	workspace: MemoryWorkspace,
): ReturnType<typeof coreBuildSoulMemoryPublicDreamingStatus> {
	const scheduled = api.scheduler.getStatus(DREAMING_SCHEDULER_TASK_ID);
	return coreBuildSoulMemoryPublicDreamingStatus({
		settings: workspace.settings.dreaming,
		model: coreFormatSoulMemoryToolModelRef(
			asCoreProviderSelectionSettings(getSettings()),
		),
		sources: ["daily"],
		resolveNextRunAt: nextCronRunAt,
		scheduled,
		store: api.store,
		runtimeStatus: lastStatus,
		inFlight: dreamingRunInFlight !== null,
	});
}

function formatDreamingStatus(
	api: PluginAPI,
	workspace: MemoryWorkspace,
): string {
	return coreFormatSoulMemoryDreamingStatus(
		buildDreamingStatus(api, workspace),
	);
}

function buildMemoryReviewStatus(
	api: PluginAPI,
	workspace: MemoryWorkspace,
	sessionId: string,
): ReturnType<typeof coreBuildSoulMemoryReviewStatusWithAdapters> {
	return coreBuildSoulMemoryReviewStatusWithAdapters({
		enabled: workspace.settings.enabled,
		settings: workspace.settings.review,
		messages: store.getSession(sessionId)?.messages ?? [],
		agentId: workspace.agentId,
		sessionId,
		store: api.store,
		runtimeStatus: lastStatus,
	});
}

function formatMemoryReviewStatus(
	api: PluginAPI,
	workspace: MemoryWorkspace,
	sessionId: string,
): string {
	return coreFormatSoulMemoryReviewStatus(
		buildMemoryReviewStatus(api, workspace, sessionId),
	);
}

async function handleMemoryReviewCommand(
	api: PluginAPI,
	args: string,
	ctx: PluginCommandContext,
): Promise<void> {
	const getStatus = async (): Promise<string> => {
		const { workspace } = await resolveSessionToolWorkspace(ctx.sessionId);
		return formatMemoryReviewStatus(api, workspace, ctx.sessionId);
	};
	const getRunContext = async () => {
		const { workspace } = await resolveSessionToolWorkspace(ctx.sessionId);
		const session = store.getSession(ctx.sessionId);
		return coreBuildSoulMemoryReviewCommandRunContext({
			enabled: workspace.settings.enabled,
			review: workspace.settings.review,
			messages: session?.messages,
		});
	};

	await coreHandleSoulMemoryReviewCommand({
		args,
		ctx,
		getStatus,
		getSettings: () => resolveSettings(getSettings()).review,
		saveSettingsPatch: saveReviewSettingsPatch,
		getRunContext,
		runNow: async () => {
			const settings = getSettings();
			const { target, workspace } = await resolveSessionToolWorkspace(
				ctx.sessionId,
			);
			const session = store.getSession(ctx.sessionId);
			if (!session) return { lastStatus: "none" };
			const lastAssistant = [...session.messages]
				.reverse()
				.find(
					(message) => message.role === "assistant" && message.content.trim(),
				);
			const lastUser = [...session.messages]
				.reverse()
				.find((message) => message.role === "user" && message.content.trim());
			if (!lastAssistant || !lastUser) return { lastStatus: "none" };
			const provider = await resolveMemoryReviewProvider(settings);
			const isChannelUser = target.kind === "channel-user" && target.userId;
			await runMemoryReview(
				api,
				{
					sessionId: ctx.sessionId,
					assistantMessageId: lastAssistant.id,
					session,
					messages: session.messages,
					lastUserMessage: lastUser.content,
					lastAssistantMessage: lastAssistant.content,
					providerId: provider.providerId,
					providerConfig: provider.config,
					settings,
				},
				isChannelUser
					? {
							force: true,
							workspaceOverride: workspace,
							identityContext: buildChannelUserIdentityContext(target),
						}
					: { force: true },
			);
			const status = buildMemoryReviewStatus(api, workspace, ctx.sessionId);
			return { lastStatus: status.lastStatus };
		},
	});
}

function registerDreamingTask(api: PluginAPI): void {
	api.scheduler.register({
		id: DREAMING_SCHEDULER_TASK_ID,
		name: "Memory Dreaming Promotion",
		tags: ["soul-memory", "memory", "dreaming"],
		enabled: () => {
			const settings = resolveSettings(getSettings());
			return settings.enabled && settings.dreaming.enabled;
		},
		schedule: () => {
			const settings = resolveSettings(getSettings());
			if (!settings.enabled || !settings.dreaming.enabled) return null;
			return {
				kind: "cron",
				expr: settings.dreaming.frequency,
				...(settings.dreaming.timezone
					? { timezone: settings.dreaming.timezone }
					: {}),
			};
		},
		timeoutMs: () => resolveSettings(getSettings()).dreaming.timeoutMs + 5000,
		async run(context) {
			const settings = getSettings();
			logMemoryDiagnostic({
				subsystem: "scheduler",
				operation: "managed-task",
				stage: "run",
				status: "started",
				runId: context.taskId,
				request: {
					taskId: context.taskId,
					reason: context.reason,
					scheduledFor: context.scheduledFor,
				},
			});
			const startedAt = Date.now();
			try {
				const result = await runMemoryDreamingSweep(api, {
					reason: context.reason,
					force: context.reason === "manual",
					settings,
					now: new Date(context.scheduledFor),
				});
				logMemoryDiagnostic({
					subsystem: "scheduler",
					operation: "managed-task",
					stage: "finish",
					status: "ok",
					durationMs: Date.now() - startedAt,
					runId: context.taskId,
					response: {
						taskId: context.taskId,
						resultStatus: result?.status || "none",
						applied: result?.applied || 0,
					},
				});
				return result;
			} catch (error) {
				logMemoryDiagnostic({
					subsystem: "scheduler",
					operation: "managed-task",
					stage: "finish",
					status: "error",
					durationMs: Date.now() - startedAt,
					runId: context.taskId,
					error,
				});
				throw error;
			}
		},
	});
}

async function handleDreamingCommand(
	api: PluginAPI,
	args: string,
	ctx: PluginCommandContext,
): Promise<void> {
	await coreHandleSoulMemoryDreamingCommand({
		args,
		ctx,
		getStatus: async () =>
			formatDreamingStatus(api, await ensureWorkspace(getSettings())),
		saveSettingsPatch: saveDreamingSettingsPatch,
		clearLastRun: () => {
			api.store.delete("lastDreamingRunKey");
		},
		refreshSchedule: () => {
			api.scheduler.refresh(DREAMING_SCHEDULER_TASK_ID);
		},
		runNow: () =>
			api.scheduler.runNow(DREAMING_SCHEDULER_TASK_ID, {
				reason: "manual",
				force: true,
			}) as Promise<{
				ok: boolean;
				error?: string;
				result?: DreamingRunResult | null;
			}>,
		getTimezone: () => getSettings().general.soulMemory?.dreaming?.timezone,
		validateFrequency: (frequency) => {
			parseCronExpression(frequency);
		},
		isValidTimezone,
	});
}

const formatHits = coreFormatSoulMemoryHits as (hits: SearchHit[]) => string;

async function activeMemoryRecall(options: {
	sessionId: string;
	agentId?: string;
	settings: AppSettings;
	api: PluginAPI;
}): Promise<string | null> {
	const resolved = resolveSettings(options.settings);
	const agentId = options.agentId || resolveSessionAgentId(options.sessionId);
	const session = store.getSession(options.sessionId);

	return runtimeRunMemoryActiveMemoryRecall<MemoryToolProvider>({
		sessionId: options.sessionId,
		agentId,
		messages: session?.messages ?? [],
		settings: resolved,
		sessionDisabled: Boolean(
			options.api.store.get<boolean>(
				`active-memory-disabled:${options.sessionId}`,
			),
		),
		search: ({ query, limit }) =>
			searchMemory({
				settings: options.settings,
				agentId,
				query,
				limit,
			}),
		resolveProvider: () =>
			resolveMemoryToolProvider(options.settings, "Active Memory"),
		providerId: (provider) => provider.providerId,
		providerModel: (provider) => String(provider.config.model || "none"),
		generateFilter: ({ provider, system, prompt, temperature, maxTokens }) =>
			generateChatResponse(
				provider.providerId,
				provider.config,
				[
					{ role: "system", content: system },
					{ role: "user", content: prompt },
				],
				{ temperature, maxTokens },
			),
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
		},
		logger: console,
	});
}

export const __testing = {
	applyDailyNoteCaptureActions,
	applyMemoryReviewCandidate,
	applyDreamingMemoryActions,
	appendDailyNoteBullets,
	buildMemoryReviewInput,
	buildMemoryCaptureInput,
	buildDreamingExistingMemorySummary,
	closeIndexWatcherForTesting: closeIndexWatcher,
	collectDreamingSources,
	dailyNoteExtractionSystemPrompt:
		CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	memoryReviewSystemPrompt: CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
	memoryDreamingSystemPrompt: CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT,
	parseDreamingOutput,
	parseDailyNoteCaptureResult,
	parseDailyNoteBullets,
	isLikelyRawRequestEcho,
	memoryCaptureSystemPrompt: CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	memoryFlushSystemPrompt: CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
	resolveMemoryToolProviderSelection:
		coreResolveSoulMemoryToolProviderSelection as unknown as (
			settings: AppSettings,
		) => MemoryToolProviderSelection,
};

export default function soulMemoryPlugin(api: PluginAPI): void {
	activeSoulMemoryPluginApi = api;
	ensureWorkspace(getSettings())
		.then((workspace) => migrateGraphMemoryIfNeeded(workspace, getSettings()))
		.catch((error) => {
			lastStatus.lastError = error?.message || String(error);
		});
	registerDreamingTask(api);

	const soulGetTool = getCoreSoulMemoryToolSpec("soul_get");
	const soulUpdateTool = getCoreSoulMemoryToolSpec("soul_update");
	const memoryTool = getCoreSoulMemoryToolSpec("memory");
	const memorySearchTool = getCoreSoulMemoryToolSpec("memory_search");
	const memoryGetTool = getCoreSoulMemoryToolSpec("memory_get");
	const activeMemoryCommand = getCoreSoulMemoryCommandSpec("/active-memory");
	const dreamingCommand = getCoreSoulMemoryCommandSpec("/dreaming");
	const memoryCommand = getCoreSoulMemoryCommandSpec("/memory");
	const soulCommand = getCoreSoulMemoryCommandSpec("/soul");

	api.registerPromptContextProvider(
		CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID,
		async (context) => {
			const settings = context.settings || getSettings();
			const target = resolveMemoryTarget(context.sessionId);
			const isChannelUser = target.kind === "channel-user" && target.userId;
			const workspace = isChannelUser
				? await getUserMemoryWorkspace(target.userId!)
				: await ensureWorkspace(
						settings,
						resolveSessionAgentId(context.sessionId),
					);
			if (!workspace.settings.enabled) return [];
			if (!isChannelUser) {
				await migrateGraphMemoryIfNeeded(workspace, settings);
			}

			const sessionId = context.sessionId;
			const session = sessionId ? store.getSession(sessionId) : undefined;
			return runtimeBuildSoulMemoryPromptContext({
				workspace,
				sessionId,
				userTurnCount: session?.messages.filter(
					(message) => message.role === "user",
				).length,
				activeMemory:
					!isChannelUser && sessionId
						? () =>
								activeMemoryRecall({
									sessionId,
									agentId: workspace.agentId,
									settings,
									api,
								})
						: null,
			});
		},
	);

	api.beforeContextCompact(
		CORE_SOUL_MEMORY_BEFORE_CONTEXT_COMPACT_HOOK_ID,
		async (context) => {
			const settings = context.settings;
			const target = resolveMemoryTarget(context.sessionId);
			const isChannelUser = target.kind === "channel-user" && target.userId;
			const workspace = isChannelUser
				? await getUserMemoryWorkspace(target.userId!)
				: await ensureWorkspace(
						settings,
						resolveSessionAgentId(context.sessionId),
					);
			const result = await runtimeRunMemoryFlush<MemoryToolProvider>({
				workspace,
				sessionId: context.sessionId,
				messagesToSummarize: context.messagesToSummarize,
				resolveProvider: async () => {
					const provider = await resolveMemoryToolProvider(
						settings,
						"Memory Flush",
					);
					return {
						provider,
						providerId: provider.providerId,
						model: String(provider.config.model || "none"),
						source: provider.source,
					};
				},
				generateFlush: ({ provider, system, prompt, temperature, maxTokens }) =>
					generateChatResponse(
						provider.providerId,
						provider.config,
						[
							{ role: "system", content: system },
							{ role: "user", content: prompt },
						],
						{ temperature, maxTokens },
					),
				logDiagnostic: (event) => logMemoryDiagnostic(event),
				onIndexableWrite: (target) => {
					if (isChannelUser) return; // No index watcher for user workspaces.
					markIndexDirty("daily-note-write", {
						relativePath: target.relativePath,
					});
					scheduleIndexSync({
						settings,
						agentId: workspace.agentId,
						reason: "daily-note-write",
					});
				},
			});
			if (result.status === "ok") {
				lastStatus.lastFlushAt = result.flushedAt;
				delete lastStatus.lastFlushError;
				api.store.set("lastFlushAt", lastStatus.lastFlushAt);
				api.store.delete("lastFlushError");
			} else if (result.status === "error") {
				lastStatus.lastFlushError = result.error;
				api.store.set("lastFlushError", result.error);
			}
		},
	);

	api.afterAssistantResponse(
		CORE_SOUL_MEMORY_CAPTURE_HOOK_ID,
		async (context) => {
			const target = resolveMemoryTarget(context.sessionId);
			if (target.kind === "channel-user" && target.userId) {
				const workspace = await getUserMemoryWorkspace(target.userId);
				await enqueueMemoryProfileTask(target.userId, () =>
					runMemoryCapture(api, context, workspace),
				);
			} else {
				const agentId = resolveAfterResponseAgentId(context);
				await enqueueMemoryProfileTask(agentId, () =>
					runMemoryCapture(api, context),
				);
			}
		},
	);

	api.afterAssistantResponse(
		CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
		async (context) => {
			const target = resolveMemoryTarget(context.sessionId);
			if (target.kind === "channel-user" && target.userId) {
				const workspace = await getUserMemoryWorkspace(target.userId);
				await enqueueMemoryProfileTask(target.userId, () =>
					runMemoryReview(api, context, {
						workspaceOverride: workspace,
						identityContext: buildChannelUserIdentityContext(target),
					}),
				);
			} else {
				const agentId = resolveAfterResponseAgentId(context);
				await enqueueMemoryProfileTask(agentId, () =>
					runMemoryReview(api, context),
				);
			}
		},
	);

	api.registerTool({
		...soulGetTool,
		parameters: z.object({}),
		async execute(_args, ctx) {
			const { workspace } = await resolveSessionToolWorkspace(ctx.sessionId);
			return coreHandleSoulMemorySoulGetTool({
				enabled: workspace.settings.enabled,
				soulPath: workspace.soulPath,
				readSoulContent: () => readTextFileAsync(workspace.soulPath),
			});
		},
	});

	api.registerTool({
		...soulUpdateTool,
		parameters: z.object({
			content: z.string().min(1),
			mode: z.enum(["replace", "append"]).optional(),
			heading: z.string().optional(),
		}),
		async execute(args, ctx) {
			const target = resolveMemoryTarget(ctx.sessionId);
			if (target.kind === "channel-user") {
				throw new Error(
					"soul_update is not available in channel-user sessions; SOUL.md belongs to the owner.",
				);
			}
			return coreHandleSoulMemorySoulUpdateTool({
				args,
				update: (input) =>
					updateSoulFile({
						agentId: resolveSessionAgentId(ctx.sessionId),
						content: input.content,
						mode: input.mode,
						heading: input.heading,
					}),
			});
		},
	});

	api.registerTool({
		...memoryTool,
		parameters: z.object({
			action: z.enum(["status", "read", "add", "replace", "remove"]),
			target: z.enum(["user", "memory"]).optional(),
			content: z.string().optional(),
			oldText: z.string().optional(),
			newText: z.string().optional(),
			text: z.string().optional(),
			all: z.boolean().optional(),
		}),
		async execute(args, ctx) {
			const { workspace } = await resolveSessionToolWorkspace(ctx.sessionId);
			return coreHandleSoulMemoryMemoryTool({
				args,
				enabled: workspace.settings.enabled,
				getStatus: () => getHermesMemoryStatus(workspace),
				read: (target) => readHermesMemoryFile(workspace, target),
				add: (target, content) =>
					addHermesMemoryEntry({ workspace, target, content }),
				replace: (target, oldText, newText, replaceAll) =>
					replaceHermesMemoryText({
						workspace,
						target,
						oldText,
						newText,
						replaceAll,
					}),
				remove: (target, text, removeAll) =>
					removeHermesMemoryText({
						workspace,
						target,
						text,
						removeAll,
					}),
				markChanged: (relativePath, reason) => {
					markHermesFileMemoryChanged(workspace, relativePath, reason);
				},
			});
		},
	});

	api.registerTool({
		...memorySearchTool,
		parameters: z.object({
			query: z.string().min(1),
			limit: z.coerce.number().int().min(1).max(20).optional(),
			maxResults: z.coerce.number().int().min(1).max(20).optional(),
			minScore: z.number().min(0).max(1).optional(),
		}),
		async execute(args, ctx) {
			const target = resolveMemoryTarget(ctx.sessionId);
			return coreHandleSoulMemorySearchTool({
				args,
				search: async (input) => {
					if (target.kind === "channel-user" && target.userId) {
						const workspace = await getUserMemoryWorkspace(target.userId);
						return searchUserMemoryNotes(
							workspace,
							input.query,
							typeof input.limit === "number" ? input.limit : undefined,
						);
					}
					return searchMemory({
						agentId: resolveSessionAgentId(ctx.sessionId),
						query: input.query,
						limit: input.limit,
						minScore: input.minScore,
					});
				},
				formatHits,
			});
		},
	});

	api.registerTool({
		...memoryGetTool,
		parameters: z.object({
			path: z.string().min(1),
			startLine: z.number().int().min(1).optional(),
			endLine: z.number().int().min(1).optional(),
			from: z.number().int().min(1).optional(),
			lines: z.number().int().min(1).optional(),
		}),
		async execute(args, ctx) {
			const { target, workspace } = await resolveSessionToolWorkspace(
				ctx.sessionId,
			);
			// User workspaces have no sqlite db; never touch graph/canonical there.
			const isChannelUser = target.kind === "channel-user";
			return coreHandleSoulMemoryGetTool({
				args,
				enabled: workspace.settings.enabled,
				getGraph: (path) => {
					if (isChannelUser) return null;
					const graph = getGraphMemoryByIdentifier(workspace, path);
					return graph
						? {
								type: graph.type,
								output: graphSearchContent(workspace, graph),
								metadata: graph.value,
							}
						: null;
				},
				getCanonical: (path) => {
					if (isChannelUser) return null;
					const memory = getCanonicalMemoryByIdOrKey(workspace, path);
					return memory ? memory : null;
				},
				readFileExcerpt: (input) =>
					readMemoryFileExcerpt({
						workspace,
						inputPath: input.path,
						startLine: input.startLine,
						endLine: input.endLine,
						from: input.from,
						lines: input.lines,
					}),
			});
		},
	});

	api.registerCommand(activeMemoryCommand.name, {
		description: activeMemoryCommand.description,
		usage: activeMemoryCommand.usage,
		async handler(args, ctx) {
			await coreHandleSoulMemoryActiveMemoryCommand({
				args,
				ctx,
				store: api.store,
				getSettings,
				saveSettings,
				getGlobalEnabled: (settings) =>
					settings.general.soulMemory?.activeMemory?.enabled !== false,
				setGlobalEnabled: (current, enabled) => ({
					...current,
					general: {
						...current.general,
						soulMemory: {
							...current.general.soulMemory,
							activeMemory: {
								...current.general.soulMemory?.activeMemory,
								enabled,
							},
						},
					},
				}),
			});
		},
	});

	api.registerCommand(dreamingCommand.name, {
		description: dreamingCommand.description,
		usage: dreamingCommand.usage,
		async handler(args, ctx) {
			await handleDreamingCommand(api, args, ctx);
		},
	});

	api.registerCommand(memoryCommand.name, {
		description: memoryCommand.description,
		usage: memoryCommand.usage,
		async handler(args, ctx) {
			await coreHandleSoulMemoryMemoryCommand({
				args,
				ctx,
				handleDreaming: (commandArgs) =>
					handleDreamingCommand(api, commandArgs, ctx),
				handleReview: (commandArgs) =>
					handleMemoryReviewCommand(api, commandArgs, ctx),
				handleCapture: (rest) =>
					coreHandleSoulMemoryCaptureCommand({
						rest,
						ctx,
						getStatus: () => {
							const capture = resolveSettings(getSettings()).capture;
							return coreBuildSoulMemoryCaptureCommandStatusInput({
								capture,
								pending: getPendingCaptures(api.store),
								runtimeStatus: lastStatus,
							});
						},
						savePendingCapture,
						discardPendingCapture,
						saveSettingsPatch: saveCaptureSettingsPatch,
					}),
				search: async (query) => {
					const hits = await searchMemory({
						agentId: resolveSessionAgentId(ctx.sessionId),
						query,
					});
					return formatHits(hits);
				},
				get: async (filePath) => {
					const workspace = await ensureWorkspace(
						getSettings(),
						resolveSessionAgentId(ctx.sessionId),
					);
					return coreHandleSoulMemoryCommandGet({
						path: filePath,
						getGraph: (path) => {
							const graph = getGraphMemoryByIdentifier(workspace, path);
							return graph
								? {
										type: graph.type,
										output: graphSearchContent(workspace, graph),
										metadata: graph.value,
									}
								: null;
						},
						getCanonical: (path) =>
							getCanonicalMemoryByIdOrKey(workspace, path),
						readFileExcerpt: (path) =>
							readMemoryFileExcerpt({ workspace, inputPath: path }),
					});
				},
				remember: async ({ content }) => {
					const cmdWorkspace = await ensureWorkspace(
						getSettings(),
						resolveSessionAgentId(ctx.sessionId),
					);
					const target = await mergeGraphMemory({
						workspace: cmdWorkspace,
						settings: getSettings(),
						agentId: resolveSessionAgentId(ctx.sessionId),
						candidates: [
							{
								kind: "fact",
								text: content,
								confidence: 1,
								source: "user",
								explicit: true,
							},
						],
						source: "command",
						evidence: content,
					});
					return coreFormatSoulMemoryRememberCommandResult(target);
				},
				index: () =>
					syncIndex({
						agentId: resolveSessionAgentId(ctx.sessionId),
						force: true,
					}),
				status: async () => {
					const agentId = resolveSessionAgentId(ctx.sessionId);
					const workspace = await ensureWorkspace(getSettings(), agentId);
					const status = refreshIndexStatus(getDb(workspace));
					if (indexTracker.dirty && !indexSyncScheduler.isInFlight()) {
						scheduleIndexSync({
							settings: getSettings(),
							agentId,
							reason: "memory-command-status",
						});
					}
					const graph = getGraphOverview(workspace);
					const review = buildMemoryReviewStatus(api, workspace, ctx.sessionId);
					return coreFormatSoulMemoryCommandStatus({
						root: workspace.root,
						dbPath: workspace.dbPath,
						userPath: workspace.userPath,
						memoryPath: workspace.memoryPath,
						graph,
						canonicalRows: getCanonicalMemoryCount(workspace),
						index: status,
						review,
						dreaming: {
							enabled: workspace.settings.dreaming.enabled,
							frequency: workspace.settings.dreaming.frequency,
							timezone: workspace.settings.dreaming.timezone,
							nextRunAt: buildDreamingStatus(api, workspace).nextRunAt,
						},
					});
				},
			});
		},
	});

	api.registerCommand(soulCommand.name, {
		description: soulCommand.description,
		usage: soulCommand.usage,
		async handler(args, ctx) {
			await coreHandleSoulMemorySoulCommand({
				args,
				ctx,
				getWorkspace: () =>
					ensureWorkspace(getSettings(), resolveSessionAgentId(ctx.sessionId)),
				readSoulContent: (workspace, maxChars) =>
					readLimited(workspace.soulPath, maxChars),
			});
		},
	});

	api.onDispose(() => {
		closeDb();
	});
}
