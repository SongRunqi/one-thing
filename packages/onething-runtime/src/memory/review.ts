import { readTextFileIfExists } from "@onething/core/storage";
import type { MemoryWorkspace } from "./types.js";
import type { MemoryDiagnosticsLogInput } from "./diagnostics-logger.js";
import { replaceFileAtomic, sha } from "./workspace.js";
import {
	addHermesMemoryEntry,
	readHermesMemoryFile,
	removeHermesMemoryText,
	replaceHermesMemoryText,
	splitHermesMemoryEntries,
} from "./hermes-file-memory.js";
import {
	CORE_HERMES_LONG_TERM_MEMORY_FILENAME,
	CORE_HERMES_USER_MEMORY_FILENAME,
	applyMemoryReviewCandidate as coreApplyMemoryReviewCandidate,
	buildSoulMemoryReviewInputWithAdapters as coreBuildSoulMemoryReviewInputWithAdapters,
	countMemoryReviewUserTurns,
	formatMemoryReviewConversation as formatCoreMemoryReviewConversation,
	getMemoryReviewProgress as getCoreMemoryReviewProgress,
	memoryReviewLastTurnKey as coreMemoryReviewLastTurnKey,
	parseMemoryReviewModelResult as parseCoreMemoryReviewModelResult,
	resolveSoulMemoryPlainReviewFilePath as coreResolveSoulMemoryPlainReviewFilePath,
	runSoulMemoryReview as coreRunSoulMemoryReview,
	type CoreHermesMemoryTarget,
	type CoreMemoryReviewAction,
	type CoreMemoryReviewApplyResult,
	type CoreMemoryReviewCandidate,
	type CoreMemoryReviewMessage,
	type CoreMemoryReviewModelResult,
	type CoreMemoryReviewPlainFile,
	type CoreMemoryReviewProgress,
	type CoreMemoryReviewTarget,
	type CorePlainReviewTarget,
	type CoreSoulMemoryReviewGenerateInput,
	type CoreSoulMemoryReviewProviderRef,
	type CoreSoulMemoryReviewRunResult,
	type CoreSoulMemoryStatusMutationPlan,
} from "../plugins/index.js";

export interface MemoryReviewMessageLike {
	role: string;
	content?: unknown;
}

export type MemoryReviewAction = CoreMemoryReviewAction;
export type MemoryReviewTarget =
	| CoreHermesMemoryTarget
	| Extract<CoreMemoryReviewTarget, "soul" | "dreams">;
export type MemoryReviewCandidate = CoreMemoryReviewCandidate & {
	target: MemoryReviewTarget;
};
export type MemoryReviewModelResult = CoreMemoryReviewModelResult & {
	candidates: MemoryReviewCandidate[];
};
export type MemoryReviewProgress = CoreMemoryReviewProgress;

export const MEMORY_REVIEW_USER_TARGET: CoreHermesMemoryTarget = "user";
export const MEMORY_REVIEW_LONG_TERM_TARGET: CoreHermesMemoryTarget = "memory";
export const MEMORY_REVIEW_USER_FILENAME = CORE_HERMES_USER_MEMORY_FILENAME;
export const MEMORY_REVIEW_LONG_TERM_FILENAME =
	CORE_HERMES_LONG_TERM_MEMORY_FILENAME;

function asCoreMessages(
	messages: MemoryReviewMessageLike[],
): CoreMemoryReviewMessage[] {
	return messages as CoreMemoryReviewMessage[];
}

export function countUserTurns(messages: MemoryReviewMessageLike[]): number {
	return countMemoryReviewUserTurns(asCoreMessages(messages));
}

export function getMemoryReviewProgress(options: {
	messages: MemoryReviewMessageLike[];
	interval: number;
	lastReviewedTurn?: number;
}): MemoryReviewProgress {
	return getCoreMemoryReviewProgress({
		messages: asCoreMessages(options.messages),
		interval: options.interval,
		lastReviewedTurn: options.lastReviewedTurn,
	});
}

export function parseMemoryReviewModelResult(
	value: string,
): MemoryReviewModelResult | null {
	return parseCoreMemoryReviewModelResult(
		value,
	) as MemoryReviewModelResult | null;
}

export function formatMemoryReviewConversation(
	messages: MemoryReviewMessageLike[],
	maxChars: number,
): string {
	return formatCoreMemoryReviewConversation(asCoreMessages(messages), maxChars);
}

export function getPlainReviewFile(
	workspace: MemoryWorkspace,
	target: CorePlainReviewTarget,
): { absolutePath: string; relativePath: "SOUL.md" | "DREAMS.md" } {
	return coreResolveSoulMemoryPlainReviewFilePath({
		soulPath: workspace.soulPath,
		dreamsPath: workspace.dreamsPath,
		target,
	});
}

export async function readPlainReviewFile(
	workspace: MemoryWorkspace,
	target: CorePlainReviewTarget,
): Promise<
	CoreMemoryReviewPlainFile & {
		absolutePath: string;
		relativePath: "SOUL.md" | "DREAMS.md";
	}
> {
	const file = getPlainReviewFile(workspace, target);
	const content = await readTextFileIfExists(file.absolutePath);
	return { ...file, content };
}

export async function buildMemoryReviewInput(options: {
	workspace: MemoryWorkspace;
	messages: MemoryReviewMessageLike[];
	maxChars: number;
}): Promise<string> {
	return coreBuildSoulMemoryReviewInputWithAdapters({
		messages: asCoreMessages(options.messages),
		maxChars: options.maxChars,
		readPlain: (target) => readPlainReviewFile(options.workspace, target),
		readHermes: (target) => readHermesMemoryFile(options.workspace, target),
	});
}

export async function applyMemoryReviewCandidate(options: {
	workspace: MemoryWorkspace;
	candidate: CoreMemoryReviewCandidate;
	minConfidence: number;
	onIndexableWrite?: (target: { relativePath: string }) => void | Promise<void>;
}): Promise<CoreMemoryReviewApplyResult> {
	const markChanged = async (relativePath?: string): Promise<void> => {
		if (relativePath) await options.onIndexableWrite?.({ relativePath });
	};

	return coreApplyMemoryReviewCandidate({
		candidate: options.candidate,
		minConfidence: options.minConfidence,
		readPlain: (target) => readPlainReviewFile(options.workspace, target),
		writePlain: async (target, content) => {
			const file = getPlainReviewFile(options.workspace, target);
			await replaceFileAtomic(file.absolutePath, content);
			await markChanged(file.relativePath);
		},
		readHermes: async (target) => {
			const existing = await readHermesMemoryFile(options.workspace, target);
			return {
				content: existing.content,
				entries: splitHermesMemoryEntries(existing.content),
				relativePath: existing.file.relativePath,
			};
		},
		addHermes: async (target, content) => {
			const result = await addHermesMemoryEntry({
				workspace: options.workspace,
				target,
				content,
			});
			await markChanged(result.relativePath);
			return { relativePath: result.relativePath };
		},
		replaceHermes: async (target, oldText, newText) => {
			const result = await replaceHermesMemoryText({
				workspace: options.workspace,
				target,
				oldText,
				newText,
				replaceAll: false,
			});
			if (result.changed) await markChanged(result.relativePath);
			return result;
		},
		removeHermes: async (target, text) => {
			const result = await removeHermesMemoryText({
				workspace: options.workspace,
				target,
				text,
				removeAll: false,
			});
			if (result.changed) await markChanged(result.relativePath);
			return result;
		},
	});
}

export async function runMemoryReview<TProvider>(options: {
	workspace: MemoryWorkspace;
	sessionId: string;
	assistantMessageId: string;
	messages: MemoryReviewMessageLike[];
	lastUserMessage: string;
	lastAssistantMessage: string;
	force?: boolean;
	lastReviewedTurn?: number;
	/** When set, candidates targeting targets outside this set are skipped (e.g. channel-user sessions forbid soul/dreams). */
	allowedTargets?: ReadonlySet<string>;
	resolveProvider: () =>
		| CoreSoulMemoryReviewProviderRef<TProvider>
		| Promise<CoreSoulMemoryReviewProviderRef<TProvider>>;
	generateReview: (
		input: CoreSoulMemoryReviewGenerateInput<TProvider>,
	) => string | Promise<string>;
	applyStatusMutation: (
		plan: CoreSoulMemoryStatusMutationPlan,
	) => void | Promise<void>;
	notify?: (
		message: string,
		level?: "info" | "warn" | "error",
	) => void | Promise<void>;
	logDiagnostic?: (event: MemoryDiagnosticsLogInput) => void;
	onIndexableWrite?: (target: { relativePath: string }) => void | Promise<void>;
	now?: () => number;
}): Promise<CoreSoulMemoryReviewRunResult> {
	return coreRunSoulMemoryReview<TProvider>({
		sessionId: options.sessionId,
		assistantMessageId: options.assistantMessageId,
		agentId: options.workspace.agentId,
		messages: asCoreMessages(options.messages),
		lastUserMessage: options.lastUserMessage,
		lastAssistantMessage: options.lastAssistantMessage,
		enabled: options.workspace.settings.enabled,
		review: options.workspace.settings.review,
		force: options.force,
		lastReviewedTurn: options.lastReviewedTurn,
		hash: sha,
		readPlain: (target) => readPlainReviewFile(options.workspace, target),
		readHermes: async (target) => {
			const existing = await readHermesMemoryFile(options.workspace, target);
			return {
				content: existing.content,
				entries: splitHermesMemoryEntries(existing.content),
				relativePath: existing.file.relativePath,
			};
		},
		resolveProvider: options.resolveProvider,
		generateReview: options.generateReview,
		applyCandidate: (candidate, minConfidence) => {
			// Hard-filter targets when allowedTargets is set.
			if (
				options.allowedTargets &&
				candidate.target &&
				!options.allowedTargets.has(candidate.target)
			) {
				return {
					changed: false,
					skipped: true,
					relativePath: undefined,
					reason: `target ${candidate.target} blocked by allowedTargets policy`,
				};
			}
			return applyMemoryReviewCandidate({
				workspace: options.workspace,
				candidate,
				minConfidence,
				onIndexableWrite: options.onIndexableWrite,
			});
		},
		applyStatusMutation: options.applyStatusMutation,
		notify: options.notify,
		logDiagnostic: options.logDiagnostic
			? (event) => options.logDiagnostic?.(event as MemoryDiagnosticsLogInput)
			: undefined,
		now: options.now,
	});
}

export function memoryReviewLastTurnKey(
	agentId: string,
	sessionId: string,
): string {
	return coreMemoryReviewLastTurnKey(agentId, sessionId);
}
