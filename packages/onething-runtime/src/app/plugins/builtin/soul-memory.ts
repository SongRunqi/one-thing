import { rename as renameFsPath, rm as rmFsPath } from "node:fs/promises";
import { z } from "zod";
import type {
	ChatMessage,
	AppSettings,
	MemoryAppendRequest,
	MemoryManagedFile,
	MemoryCapturePending,
	MemoryOverview,
	MemoryReadRequest,
	MemorySaveFileRequest,
	SoulMemoryCaptureSettings,
	SoulMemoryReviewSettings,
} from "@shared/ipc.js";
import { DEFAULT_AGENT_ID } from "@shared/ipc.js";
import { getSettings, saveSettings } from "../../stores/settings.js";
import { generateChatResponse } from "../../providers/index.js";
import { recordUsage } from "../../usage/index.js";
import { ONETHING_USAGE_SOURCES } from "@onething/runtime/usage";
import { resolveProviderAuth } from "../../engine/stream/provider-helpers.js";
import * as store from "../../store.js";
import { PluginStore } from "../store.js";
import type {
	AfterAssistantResponseContext,
	PluginAPI,
	PluginCommandContext,
} from "../types.js";
import {
	buildSoulMemoryCaptureCommandStatusInput as coreBuildSoulMemoryCaptureCommandStatusInput,
	buildSoulMemoryOverview as coreBuildSoulMemoryOverview,
	buildSoulMemoryReviewCommandRunContext as coreBuildSoulMemoryReviewCommandRunContext,
	buildSoulMemoryReviewStatusWithAdapters as coreBuildSoulMemoryReviewStatusWithAdapters,
	buildUserMemoryWorkspace as coreBuildUserMemoryWorkspace,
	clampCaptureConfidence as coreClampCaptureConfidence,
	CORE_SOUL_MEMORY_CAPTURE_HOOK_ID,
	CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID,
	CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
	CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
	createSoulMemoryToolProvider as coreCreateSoulMemoryToolProvider,
	dailyNoteTimeHeading as coreDailyNoteTimeHeading,
	discardSoulMemoryPendingCaptureWithAdapters as coreDiscardSoulMemoryPendingCaptureWithAdapters,
	extractLegacyMemoryCandidates as coreExtractLegacyMemoryCandidates,
	applySoulMemoryStatusMutationPlan as coreApplySoulMemoryStatusMutationPlan,
	CORE_SOUL_MEMORY_MANIFEST,
	formatSoulMemoryReviewStatus as coreFormatSoulMemoryReviewStatus,
	formatSoulMemoryCommandStatus as coreFormatSoulMemoryCommandStatus,
	getCoreSoulMemoryCommandSpec,
	getCoreSoulMemoryToolSpec,
	getSoulMemoryPendingCaptures as coreGetSoulMemoryPendingCaptures,
	getSoulMemoryPublicPendingCaptures as coreGetSoulMemoryPublicPendingCaptures,
	handleSoulMemoryGetTool as coreHandleSoulMemoryGetTool,
	handleSoulMemoryCaptureCommand as coreHandleSoulMemoryCaptureCommand,
	handleSoulMemoryCommandGet as coreHandleSoulMemoryCommandGet,
	handleSoulMemoryMemoryCommand as coreHandleSoulMemoryMemoryCommand,
	handleSoulMemoryMemoryTool as coreHandleSoulMemoryMemoryTool,
	handleSoulMemoryReviewCommand as coreHandleSoulMemoryReviewCommand,
	handleSoulMemorySoulCommand as coreHandleSoulMemorySoulCommand,
	handleSoulMemorySoulGetTool as coreHandleSoulMemorySoulGetTool,
	handleSoulMemorySoulUpdateTool as coreHandleSoulMemorySoulUpdateTool,
	hasExplicitMemoryIntent as coreHasExplicitMemoryIntent,
	formatSoulMemoryRememberCommandResult as coreFormatSoulMemoryRememberCommandResult,
	isLikelyRawRequestEcho as coreIsLikelyRawRequestEcho,
	isLowValueDailyNoteLine as coreIsLowValueDailyNoteLine,
	optionalCaptureText as coreOptionalCaptureText,
	parseDailyNoteBullets as coreParseDailyNoteBullets,
	parseDailyNoteCaptureResult as coreParseDailyNoteCaptureResult,
	patchSoulMemorySettingsSectionWithAdapters as corePatchSoulMemorySettingsSectionWithAdapters,
	readSoulMemoryFileExcerptFromContent as coreReadSoulMemoryFileExcerptFromContent,
	resolveSoulMemoryFilePath as coreResolveSoulMemoryFilePath,
	resolveSoulMemoryToolProviderSelection as coreResolveSoulMemoryToolProviderSelection,
	saveSoulMemoryPendingCaptureWithAdapters as coreSaveSoulMemoryPendingCaptureWithAdapters,
	setSoulMemoryPendingCaptures as coreSetSoulMemoryPendingCaptures,
	stripSoulMemoryJsonFence,
	type CoreDailyNoteCaptureApplyResult,
	type CoreDailyNoteCaptureCandidate,
	type CoreDailyNoteCaptureResult,
	type CoreMemoryReviewCandidate,
	type CorePlainReviewTarget,
	type CoreSoulMemoryProviderSelectionSettings,
	type CoreSoulMemoryStatusMutationPlan,
} from "@onething/runtime/plugins";
import {
	configureMemoryDiagnosticsLogger,
	logMemoryDiagnostic,
} from "../../memory/diagnostics-logger.js";
import type {
	CaptureCandidate,
	IndexStatus,
	MemoryWorkspace,
	ResolvedSoulMemorySettings,
} from "@onething/runtime/memory/types";
import {
	LOCAL_CLIENT_USER_ID,
	latestRealOrigin,
} from "../../channel/origin.js";
import {
	CAPTURE_MAX_PENDING,
	CAPTURE_PENDING_STORE_KEY,
	getWorkspace,
	readLimited,
	replaceFileAtomic,
	resolveSessionAgentId,
	resolveSettings,
	SOUL_MEMORY_PLUGIN_ID,
	SOUL_TEMPLATE,
	writeIfMissing,
} from "../../memory/workspace.js";
import {
	appendTextFile,
	ensureDirAsync,
	joinPaths,
	listDirectoryEntries,
	readTextFileAsync,
	relativePath,
	statPath,
} from "@onething/core/storage";
import {
	addHermesMemoryEntry,
	getHermesMemoryStatus,
	readHermesMemoryFile,
	removeHermesMemoryText,
	replaceHermesMemoryText,
} from "@onething/runtime/memory/hermes-file-memory";
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

export { SOUL_MEMORY_PLUGIN_ID } from "../../memory/workspace.js";
export type {
	MemoryWorkspace,
	ResolvedSoulMemorySettings,
} from "@onething/runtime/memory/types";

export const soulMemoryManifest = CORE_SOUL_MEMORY_MANIFEST;



let activeSoulMemoryPluginApi: PluginAPI | null = null;

const lastStatus: IndexStatus = {};
const memoryProfileTaskQueues = new Map<string, Promise<void>>();

// How long a conversation must stay quiet before a due review actually runs.
const REVIEW_IDLE_DELAY_MS = 5 * 60 * 1000;

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
	return latestRealOrigin(messages, { role: "user" });
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
	const settings = resolveSettings(getSettings());
	return {
		settings,
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
	await writeIfMissing(workspace.soulPath, SOUL_TEMPLATE);
	return workspace;
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
	});
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

/**
 * Bills a memory-side model call to the usage ledger.
 *
 * These calls run on the tool-call model behind the user's back (capture on
 * every turn, review on idle), so without this they are pure invisible spend —
 * `source: 'memory'` is what makes them show up in the usage panel breakdown.
 */
function billMemoryUsage(
	sessionId: string | undefined,
	provider: { providerId: string; config: { model?: unknown } },
): (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void {
	return (usage) => {
		// Billing must never break memory work.
		try {
			recordUsage({
				sessionId,
				providerId: provider.providerId,
				modelId: String(provider.config.model || ""),
				source: ONETHING_USAGE_SOURCES.memory,
				usage,
			});
		} catch (error) {
			console.error("[soul-memory] recordUsage failed:", error);
		}
	};
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
				{
					temperature,
					maxTokens,
					onUsage: billMemoryUsage(context.sessionId, provider),
				},
			),
		applyStatusMutation: (plan) => {
			applySoulMemoryStatusMutation(api.store, plan);
		},
		notify: (message, level) => api.ui.notify(message, level),
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
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
				{
					temperature,
					maxTokens,
					onUsage: billMemoryUsage(context.sessionId, provider),
				},
			);
		},
		applyStatusMutation: (plan) => {
			applySoulMemoryStatusMutation(api.store, plan);
		},
		notify: (message, level) => api.ui.notify(message, level),
		logDiagnostic: (event) => {
			logMemoryDiagnostic(event as Parameters<typeof logMemoryDiagnostic>[0]);
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
			return appendMemory({
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

export async function getSoulMemoryOverview(
	agentId = DEFAULT_AGENT_ID,
): Promise<MemoryOverview> {
	const settings = getSettings();
	const workspace = await ensureWorkspace(settings, agentId);
	const pluginStore = new PluginStore(SOUL_MEMORY_PLUGIN_ID);
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
			settings: workspace.settings,
		},
		status: lastStatus,
		captureStatusStore: pluginStore,
		pendingCaptures: publicPendingCaptures(workspace.agentId),
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
	});
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

async function resolveMemoryReviewProvider(
	settings: AppSettings,
): Promise<MemoryToolProvider> {
	return resolveMemoryToolProvider(settings, "Memory Review");
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

export const __testing = {
	applyDailyNoteCaptureActions,
	applyMemoryReviewCandidate,
	appendDailyNoteBullets,
	buildMemoryReviewInput,
	buildMemoryCaptureInput,
	dailyNoteExtractionSystemPrompt:
		CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	memoryReviewSystemPrompt: CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
	parseDailyNoteCaptureResult,
	parseDailyNoteBullets,
	isLikelyRawRequestEcho,
	memoryCaptureSystemPrompt: CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	resolveMemoryToolProviderSelection:
		coreResolveSoulMemoryToolProviderSelection as unknown as (
			settings: AppSettings,
		) => MemoryToolProviderSelection,
};

export default function soulMemoryPlugin(api: PluginAPI): void {
	activeSoulMemoryPluginApi = api;
	ensureWorkspace(getSettings()).catch((error) => {
		lastStatus.lastError = error?.message || String(error);
	});

	const soulGetTool = getCoreSoulMemoryToolSpec("soul_get");
	const soulUpdateTool = getCoreSoulMemoryToolSpec("soul_update");
	const memoryTool = getCoreSoulMemoryToolSpec("memory");
	const memoryGetTool = getCoreSoulMemoryToolSpec("memory_get");
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

			const sessionId = context.sessionId;
			const session = sessionId ? store.getSession(sessionId) : undefined;
			return runtimeBuildSoulMemoryPromptContext({
				workspace,
				sessionId,
				userTurnCount: session?.messages.filter(
					(message) => message.role === "user",
				).length,
			});
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

	// Review runs when the conversation goes quiet, not on a hard N-turn beat:
	// each assistant response re-arms an idle timer; only the response that is
	// still the newest one when the timer fires triggers the review (the core
	// runner still enforces the ≥interval user-message lower bound).
	const pendingReviewTimers = new Map<string, NodeJS.Timeout>();
	const scheduleIdleReview = (
		key: string,
		context: AfterAssistantResponseContext,
		run: () => Promise<void>,
	): void => {
		const existing = pendingReviewTimers.get(key);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			pendingReviewTimers.delete(key);
			const session = store.getSession(context.sessionId);
			const lastAssistant = [...(session?.messages ?? [])]
				.reverse()
				.find((message) => message.role === "assistant");
			// A newer turn exists: it re-armed its own timer; this one is stale.
			if (lastAssistant && lastAssistant.id !== context.assistantMessageId)
				return;
			void run().catch((error) => {
				logMemoryDiagnostic({
					subsystem: "review",
					operation: "idle-review",
					stage: "run",
					status: "error",
					sessionId: context.sessionId,
					error,
				});
			});
		}, REVIEW_IDLE_DELAY_MS);
		timer.unref?.();
		pendingReviewTimers.set(key, timer);
	};

	api.afterAssistantResponse(
		CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
		async (context) => {
			const target = resolveMemoryTarget(context.sessionId);
			if (target.kind === "channel-user" && target.userId) {
				const userId = target.userId;
				scheduleIdleReview(`${userId}:${context.sessionId}`, context, async () => {
					const workspace = await getUserMemoryWorkspace(userId);
					await enqueueMemoryProfileTask(userId, () =>
						runMemoryReview(api, context, {
							workspaceOverride: workspace,
							identityContext: buildChannelUserIdentityContext(target),
						}),
					);
				});
			} else {
				const agentId = resolveAfterResponseAgentId(context);
				scheduleIdleReview(`${agentId}:${context.sessionId}`, context, () =>
					enqueueMemoryProfileTask(agentId, () =>
						runMemoryReview(api, context),
					),
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
					logMemoryDiagnostic({
						subsystem: "daily",
						operation: "hermes-file-write",
						stage: "apply",
						status: "ok",
						metadata: { relativePath, reason },
					});
				},
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
			const { workspace } = await resolveSessionToolWorkspace(ctx.sessionId);
			return coreHandleSoulMemoryGetTool({
				args,
				enabled: workspace.settings.enabled,
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

	api.registerCommand(memoryCommand.name, {
		description: memoryCommand.description,
		usage: memoryCommand.usage,
		async handler(args, ctx) {
			await coreHandleSoulMemoryMemoryCommand({
				args,
				ctx,
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
				get: async (filePath) => {
					const workspace = await ensureWorkspace(
						getSettings(),
						resolveSessionAgentId(ctx.sessionId),
					);
					return coreHandleSoulMemoryCommandGet({
						path: filePath,
						readFileExcerpt: (path) =>
							readMemoryFileExcerpt({ workspace, inputPath: path }),
					});
				},
				remember: async ({ content }) => {
					const cmdWorkspace = await ensureWorkspace(
						getSettings(),
						resolveSessionAgentId(ctx.sessionId),
					);
					const result = await addHermesMemoryEntry({
						workspace: cmdWorkspace,
						target: "memory",
						content,
					});
					return coreFormatSoulMemoryRememberCommandResult(result);
				},
				status: async () => {
					const agentId = resolveSessionAgentId(ctx.sessionId);
					const workspace = await ensureWorkspace(getSettings(), agentId);
					const review = buildMemoryReviewStatus(api, workspace, ctx.sessionId);
					return coreFormatSoulMemoryCommandStatus({
						root: workspace.root,
						userPath: workspace.userPath,
						memoryPath: workspace.memoryPath,
						review,
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

}
