import { readTextFileIfExists } from "@onething/core/storage";
import type { MemoryWorkspace } from "./types.js";
import type { MemoryDiagnosticsLogInput } from "./diagnostics-logger.js";
import { replaceFileAtomic, sha } from "./workspace.js";
import {
	applyMemoryReviewCandidate as coreApplyMemoryReviewCandidate,
	buildSoulMemoryReviewInputWithAdapters as coreBuildSoulMemoryReviewInputWithAdapters,
	countMemoryReviewUserTurns,
	formatMemoryReviewConversation as formatCoreMemoryReviewConversation,
	getMemoryReviewProgress as getCoreMemoryReviewProgress,
	memoryReviewLastTurnKey as coreMemoryReviewLastTurnKey,
	parseMemoryReviewModelResult as parseCoreMemoryReviewModelResult,
	resolveSoulMemoryPlainReviewFilePath as coreResolveSoulMemoryPlainReviewFilePath,
	runSoulMemoryReview as coreRunSoulMemoryReview,
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
// Hermes 文件记忆已整体移除,复盘只写 SOUL.md / DREAMS.md。
export type MemoryReviewTarget = CoreMemoryReviewTarget;
export type MemoryReviewCandidate = CoreMemoryReviewCandidate & {
	target: MemoryReviewTarget;
};
export type MemoryReviewModelResult = CoreMemoryReviewModelResult & {
	candidates: MemoryReviewCandidate[];
};
export type MemoryReviewProgress = CoreMemoryReviewProgress;

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
	});
}

export async function applyMemoryReviewCandidate(options: {
	workspace: MemoryWorkspace;
	candidate: CoreMemoryReviewCandidate;
	minConfidence: number;

}): Promise<CoreMemoryReviewApplyResult> {
	const markChanged = async (_relativePath?: string): Promise<void> => {};

	return coreApplyMemoryReviewCandidate({
		candidate: options.candidate,
		minConfidence: options.minConfidence,
		readPlain: (target) => readPlainReviewFile(options.workspace, target),
		writePlain: async (target, content) => {
			const file = getPlainReviewFile(options.workspace, target);
			await replaceFileAtomic(file.absolutePath, content);
			await markChanged(file.relativePath);
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
