import crypto from "node:crypto";
import os from "os";
import path from "path";
import { toJsonObject, type JsonObject } from "@onething/core";

import {
	CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
} from "../prompts/tasks/index.js";

export {
	CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
	CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
} from "../prompts/tasks/index.js";

export type CoreCaptureCandidateKind =
	| "identity"
	| "preference"
	| "decision"
	| "project"
	| "constraint"
	| "fact"
	| "summary"
	| "episodic"
	| "ignore";

export interface CoreCaptureCandidate {
	kind: CoreCaptureCandidateKind;
	source: "user" | "assistant" | "conversation";
	confidence: number;
	text: string;
	memoryKey?: string;
	value?: string;
	reason?: string;
	sensitivity?: "normal" | "sensitive" | "secret";
	target?: "memory" | "daily" | "ignore";
	explicit?: boolean;
}

const CORE_DURABLE_CAPTURE_KINDS = new Set<CoreCaptureCandidateKind>([
	"identity",
	"preference",
	"decision",
	"project",
	"constraint",
	"fact",
]);

export function isDurableSoulMemoryCaptureCandidate(
	candidate: Pick<CoreCaptureCandidate, "kind">,
): boolean {
	return CORE_DURABLE_CAPTURE_KINDS.has(candidate.kind);
}

export function sanitizeSoulMemoryKey(value: string): string {
	return value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^a-z0-9_.-]+/g, ".")
		.replace(/\.{2,}/g, ".")
		.replace(/^\.+|\.+$/g, "")
		.slice(0, 160);
}

export function extractSoulMemoryCandidateValue(text: string): string {
	const cleaned = normalizeSoulMemoryBulletText(text).replace(/\.$/, "").trim();
	const patterns = [
		/(?:user(?:'s)? name is|user is named|user identifies as|user is known as|call the user|call user)\s+([^.;,\n]+)/i,
		/(?:user is|the user is)\s+([^.;,\n]+)/i,
		/(?:my name is|i am|i'm|call me)\s+([^.;,\n]+)/i,
		/(?:我叫|我是|我的名字是)\s*([^。；，\n]+)/,
	];
	for (const pattern of patterns) {
		const match = cleaned.match(pattern);
		if (match?.[1]) return match[1].replace(/^["'""]+|["'""]+$/g, "").trim();
	}
	return cleaned;
}

export function looksLikeSoulMemoryNameValue(value: string): boolean {
	const words = value.trim().split(/\s+/).filter(Boolean);
	return (
		words.length <= 3 &&
		value.length <= 80 &&
		!/\b(prefers?|likes?|works?|uses?|wants?|needs?|developer|engineer|project)\b/i.test(
			value,
		)
	);
}

export function buildSoulMemoryPendingCaptureMigrationCandidates(
	pending: readonly Pick<
		CoreSoulMemoryCapturePending,
		"content" | "confidence" | "explicit"
	>[],
): CoreCaptureCandidate[] {
	const candidates: CoreCaptureCandidate[] = [];
	for (const capture of pending) {
		for (const line of capture.content.split(/\r?\n/)) {
			const text = normalizeSoulMemoryBulletText(line);
			if (!text) continue;
			const lower = text.toLowerCase();
			const kind: CoreCaptureCandidateKind =
				/name is|identifies as|user is|我叫|我是/i.test(text)
					? "identity"
					: lower.includes("prefer")
						? "preference"
						: "fact";
			candidates.push({
				kind,
				source: "user",
				confidence: capture.confidence,
				text,
				sensitivity: "normal",
				target: "memory",
				explicit: capture.explicit,
			});
		}
	}
	return candidates;
}

export type CoreDailyNoteCaptureAction = "add" | "replace" | "remove";

export interface CoreDailyNoteCaptureCandidate {
	action: CoreDailyNoteCaptureAction;
	confidence: number;
	content?: string;
	oldText?: string;
	newText?: string;
	text?: string;
	reason?: string;
}

export interface CoreDailyNoteCaptureResult {
	candidates: CoreDailyNoteCaptureCandidate[];
	confidence: number;
	reason?: string;
}

export interface CoreDailyNoteCaptureApplyResult {
	applied: number;
	skipped: number;
	added: number;
	replaced: number;
	removed: number;
}

export interface ApplyDailyNoteCaptureActionsOptions {
	candidates: CoreDailyNoteCaptureCandidate[];
	readContent: () => CoreMaybePromise<string>;
	writeContent: (content: string) => CoreMaybePromise<void>;
	dedupeAdditions: (bullets: string[]) => CoreMaybePromise<string[]>;
	appendBullets: (bullets: string[]) => CoreMaybePromise<boolean>;
}

export interface ApplyDailyNoteCaptureActionsWithAdaptersOptions {
	candidates: CoreDailyNoteCaptureCandidate[];
	readDailyContent: () => CoreMaybePromise<string>;
	writeDailyContent: (content: string) => CoreMaybePromise<void>;
	readMemoryContent: () => CoreMaybePromise<string>;
	appendBullets: (bullets: string[]) => CoreMaybePromise<boolean>;
}

type CoreMaybePromise<T> = T | Promise<T>;

export const CORE_SOUL_MEMORY_PLUGIN_ID = "soul-memory";
export const CORE_SOUL_MEMORY_MANIFEST = {
	name: CORE_SOUL_MEMORY_PLUGIN_ID,
	version: "1.0.0",
	description:
		"SOUL.md prompt context, daily-note capture, and periodic review",
	author: "onething",
} as const;

export const CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID = "soul-memory";
export const CORE_SOUL_MEMORY_CAPTURE_HOOK_ID = "memory-capture";
export const CORE_SOUL_MEMORY_REVIEW_HOOK_ID = "memory-review";

export type CoreSoulMemoryPluginHookId =
	| typeof CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID
	| typeof CORE_SOUL_MEMORY_CAPTURE_HOOK_ID
	| typeof CORE_SOUL_MEMORY_REVIEW_HOOK_ID;

export type CoreSoulMemoryToolPermissionGuard = "safe" | "permission-gated";

export interface CoreSoulMemoryToolSpec {
	name: string;
	description: string;
	permissionGuard: CoreSoulMemoryToolPermissionGuard;
}

export const CORE_SOUL_MEMORY_TOOL_SPECS = [
	{
		name: "soul_get",
		description:
			"Read SOUL.md, the assistant voice and stance file. Use when the user asks to inspect or revise the assistant personality.",
		permissionGuard: "safe",
	},
	{
		name: "soul_update",
		description:
			"Replace or append to SOUL.md. Use only when the user explicitly asks to change the assistant voice/personality, and tell the user after it changes.",
		permissionGuard: "permission-gated",
	},
	{
		name: "memory_get",
		description:
			"Read USER.md, MEMORY.md, DREAMS.md, or a daily note (daily/YYYY-MM-DD.md) by line range.",
		permissionGuard: "safe",
	},
] as const satisfies readonly CoreSoulMemoryToolSpec[];

export type CoreSoulMemoryToolName =
	(typeof CORE_SOUL_MEMORY_TOOL_SPECS)[number]["name"];

export function getCoreSoulMemoryToolSpec(
	name: CoreSoulMemoryToolName,
): CoreSoulMemoryToolSpec;
export function getCoreSoulMemoryToolSpec(
	name: string,
): CoreSoulMemoryToolSpec | undefined;
export function getCoreSoulMemoryToolSpec(
	name: string,
): CoreSoulMemoryToolSpec | undefined {
	return CORE_SOUL_MEMORY_TOOL_SPECS.find((spec) => spec.name === name);
}

export interface CoreSoulMemoryCommandSpec {
	name: string;
	description: string;
	usage: string;
}

export const CORE_SOUL_MEMORY_COMMAND_SPECS = [
	{
		name: "/memory",
		description: "Inspect and maintain the memory files (SOUL.md/DREAMS.md and daily notes)",
		usage:
			"/memory status|get <path>|capture <subcommand>|review <subcommand>",
	},
	{
		name: "/soul",
		description: "Inspect or explicitly revise SOUL.md",
		usage: "/soul status|show|path|rewrite <instruction>",
	},
] as const satisfies readonly CoreSoulMemoryCommandSpec[];

export type CoreSoulMemoryCommandName =
	(typeof CORE_SOUL_MEMORY_COMMAND_SPECS)[number]["name"];

export function getCoreSoulMemoryCommandSpec(
	name: CoreSoulMemoryCommandName,
): CoreSoulMemoryCommandSpec;
export function getCoreSoulMemoryCommandSpec(
	name: string,
): CoreSoulMemoryCommandSpec | undefined;
export function getCoreSoulMemoryCommandSpec(
	name: string,
): CoreSoulMemoryCommandSpec | undefined {
	return CORE_SOUL_MEMORY_COMMAND_SPECS.find((spec) => spec.name === name);
}

export interface CoreSoulMemoryCommandTokens {
	tokens: string[];
}

export function parseSoulMemoryCommandTokens(
	args: string,
): CoreSoulMemoryCommandTokens {
	return {
		tokens: args.trim().split(/\s+/).filter(Boolean),
	};
}

export interface CoreSoulMemoryRootCommandPlan {
	action: string;
	rest: string[];
	restText: string;
}

export function parseSoulMemoryRootCommand(
	args: string,
	defaultAction = "status",
): CoreSoulMemoryRootCommandPlan {
	const [rawAction = defaultAction, ...rest] =
		parseSoulMemoryCommandTokens(args).tokens;
	return {
		action: rawAction.toLowerCase(),
		rest,
		restText: rest.join(" "),
	};
}

export interface CoreSoulMemoryCaptureCommandPlan {
	subcommand: string;
	id?: string;
}

export function parseSoulMemoryCaptureCommand(
	rest: readonly string[],
): CoreSoulMemoryCaptureCommandPlan {
	const [rawSub = "status", rawId] = rest;
	return {
		subcommand: rawSub.toLowerCase(),
		id: rawId,
	};
}

export interface CoreSoulMemoryCommandNotificationContext {
	sessionId: string;
	notify(message: string, level?: "info" | "warn" | "error"): void;
	followUp?(content: string): void;
}

export interface CoreSoulMemoryCaptureCommandStatusInput {
	enabled: boolean;
	mode: string;
	pending: readonly { id: string; content: string }[];
	lastCaptureStatus?: string;
	lastCaptureError?: string;
}

export function buildSoulMemoryCaptureCommandStatusInput(options: {
	capture: Pick<CoreSoulMemoryCaptureCommandStatusInput, "mode">;
	pending: readonly { id: string; content: string }[];
	runtimeStatus?: Pick<
		CoreSoulMemoryRuntimeStatus,
		"lastCaptureStatus" | "lastCaptureError"
	>;
}): CoreSoulMemoryCaptureCommandStatusInput {
	return {
		enabled: options.capture.mode !== "off",
		mode: options.capture.mode,
		pending: options.pending,
		lastCaptureStatus: options.runtimeStatus?.lastCaptureStatus,
		lastCaptureError: options.runtimeStatus?.lastCaptureError,
	};
}

export function formatSoulMemoryCaptureCommandStatus(
	input: CoreSoulMemoryCaptureCommandStatusInput,
): string {
	const latest = input.pending[0];
	return [
		`Memory Capture: ${input.enabled ? "on" : "off"}`,
		`Mode: ${input.mode}`,
		`Pending: ${input.pending.length}`,
		input.lastCaptureStatus ? `Last result: ${input.lastCaptureStatus}` : "",
		input.lastCaptureError ? `Last error: ${input.lastCaptureError}` : "",
		latest ? `Latest pending: ${latest.id.slice(0, 8)} ${latest.content}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

export const CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE =
	"Usage: /memory capture status|save [id]|discard [id]|on|off|mode explicit-only|auto|off";

export const CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE =
	"Usage: /memory capture mode explicit-only|auto|off";

export type CoreSoulMemoryCaptureCommandMode = "explicit-only" | "auto" | "off";

export interface CoreSoulMemoryCaptureCommandSettingsPatch {
	mode?: CoreSoulMemoryCaptureCommandMode;
}

export interface CoreSoulMemoryCaptureCommandSettingsResult {
	mode: string;
}

export interface CoreSoulMemoryCaptureCommandSaveResult {
	relativePath: string;
}

export interface CoreSoulMemoryCaptureCommandDiscardResult {
	id: string;
}

export interface HandleSoulMemoryCaptureCommandOptions {
	rest: readonly string[];
	ctx: CoreSoulMemoryCommandNotificationContext;
	getStatus: () => CoreMaybePromise<CoreSoulMemoryCaptureCommandStatusInput>;
	savePendingCapture: (
		id?: string,
	) => CoreMaybePromise<CoreSoulMemoryCaptureCommandSaveResult>;
	discardPendingCapture: (
		id?: string,
	) => CoreMaybePromise<CoreSoulMemoryCaptureCommandDiscardResult>;
	saveSettingsPatch: (
		patch: CoreSoulMemoryCaptureCommandSettingsPatch,
	) => CoreMaybePromise<CoreSoulMemoryCaptureCommandSettingsResult>;
}

export function isSoulMemoryCaptureCommandMode(
	value: string | undefined,
): value is CoreSoulMemoryCaptureCommandMode {
	return value === "explicit-only" || value === "auto" || value === "off";
}

export async function handleSoulMemoryCaptureCommand(
	options: HandleSoulMemoryCaptureCommandOptions,
): Promise<void> {
	const { subcommand: sub, id: rawId } = parseSoulMemoryCaptureCommand(
		options.rest,
	);
	if (sub === "status") {
		options.ctx.notify(
			formatSoulMemoryCaptureCommandStatus(await options.getStatus()),
		);
		return;
	}
	if (sub === "save" || sub === "approve") {
		const target = await options.savePendingCapture(rawId);
		options.ctx.notify(`Saved pending memory to ${target.relativePath}`);
		return;
	}
	if (sub === "discard" || sub === "drop") {
		const discarded = await options.discardPendingCapture(rawId);
		options.ctx.notify(`Discarded pending memory ${discarded.id.slice(0, 8)}`);
		return;
	}
	if (sub === "on" || sub === "off") {
		const capture = await options.saveSettingsPatch({
			mode: sub === "on" ? "auto" : "off",
		});
		options.ctx.notify(`Memory Capture is ${capture.mode === "off" ? "off" : "on"}`);
		return;
	}
	if (sub === "mode") {
		if (!isSoulMemoryCaptureCommandMode(rawId)) {
			options.ctx.notify(CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE, "warn");
			return;
		}
		const capture = await options.saveSettingsPatch({ mode: rawId });
		options.ctx.notify(`Memory Capture mode: ${capture.mode}`);
		return;
	}
	options.ctx.notify(CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE, "warn");
}

export const CORE_SOUL_MEMORY_GET_COMMAND_USAGE = "Usage: /memory get <path>";

export interface HandleSoulMemoryMemoryCommandOptions {
	args: string;
	ctx: CoreSoulMemoryCommandNotificationContext;
	handleReview: (args: string) => CoreMaybePromise<void>;
	handleCapture: (rest: readonly string[]) => CoreMaybePromise<void>;
	get: (path: string) => CoreMaybePromise<string>;
	status: () => CoreMaybePromise<string>;
}

export async function handleSoulMemoryMemoryCommand(
	options: HandleSoulMemoryMemoryCommandOptions,
): Promise<void> {
	const { action, rest, restText } = parseSoulMemoryRootCommand(options.args);
	if (action === "review") {
		await options.handleReview(restText || "status");
		return;
	}
	if (action === "capture") {
		await options.handleCapture(rest);
		return;
	}
	if (action === "get") {
		const filePath = restText;
		if (!filePath) {
			options.ctx.notify(CORE_SOUL_MEMORY_GET_COMMAND_USAGE, "warn");
			return;
		}
		options.ctx.notify(await options.get(filePath));
		return;
	}
	if (action === "remember" || action === "append") {
		// Hermes 文件记忆已移除,没有可写的长期记忆文件了。
		options.ctx.notify(
			`/memory ${action} 已下线:长期记忆文件写入(Hermes file memory)已移除。`,
			"warn",
		);
		return;
	}
	options.ctx.notify(await options.status());
}

export function formatSoulMemoryCommandFileExcerpt(
	excerpt: CoreSoulMemoryFileExcerpt,
): string {
	return [
		`${excerpt.relativePath}:${excerpt.startLine}-${excerpt.endLine}`,
		excerpt.text,
		excerpt.truncated
			? `More content available from line ${excerpt.endLine + 1}.`
			: "",
	]
		.filter(Boolean)
		.join("\n\n");
}

export interface HandleSoulMemoryCommandGetOptions {
	path: string;
	readFileExcerpt: (
		path: string,
	) => CoreMaybePromise<CoreSoulMemoryFileExcerpt>;
}

export async function handleSoulMemoryCommandGet(
	options: HandleSoulMemoryCommandGetOptions,
): Promise<string> {
	return formatSoulMemoryCommandFileExcerpt(
		await options.readFileExcerpt(options.path),
	);
}

export function soulMemoryCommandErrorMessage(error: unknown): string {
	return error && typeof error === "object" && "message" in error
		? String((error as { message?: unknown }).message)
		: String(error);
}

export const CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE =
	"Usage: /memory review status|on|off|interval <n>|run";

export interface CoreSoulMemoryReviewCommandSettings {
	enabled: boolean;
	interval: number;
}

export interface CoreSoulMemoryReviewCommandSettingsPatch {
	enabled?: boolean;
	interval?: number;
}

export interface CoreSoulMemoryReviewCommandRunContext {
	enabled: boolean;
	hasSession: boolean;
	hasRequiredMessages: boolean;
}

export interface CoreSoulMemoryReviewCommandRunResult {
	lastStatus?: string;
}

export interface HandleSoulMemoryReviewCommandOptions {
	args: string;
	ctx: CoreSoulMemoryCommandNotificationContext;
	getStatus: () => CoreMaybePromise<string>;
	getSettings: () => CoreMaybePromise<CoreSoulMemoryReviewCommandSettings>;
	saveSettingsPatch: (
		patch: CoreSoulMemoryReviewCommandSettingsPatch,
	) => CoreMaybePromise<CoreSoulMemoryReviewCommandSettings>;
	getRunContext: () => CoreMaybePromise<CoreSoulMemoryReviewCommandRunContext>;
	runNow: () => CoreMaybePromise<CoreSoulMemoryReviewCommandRunResult>;
}

export function formatSoulMemoryReviewToggleNotification(
	review: CoreSoulMemoryReviewCommandSettings,
	status: string,
): string {
	return [`Memory Review is ${review.enabled ? "on" : "off"}`, status].join(
		"\n",
	);
}

export function formatSoulMemoryReviewIntervalNotification(
	review: CoreSoulMemoryReviewCommandSettings,
	status: string,
): string {
	return [
		`Memory Review interval: ${review.interval === 0 ? "disabled" : `${review.interval} user turns`}`,
		status,
	].join("\n");
}

export function buildSoulMemoryReviewCommandRunContext(options: {
	enabled: boolean;
	review: CoreSoulMemoryReviewCommandSettings;
	messages?: readonly CoreMemoryReviewMessage[] | null;
}): CoreSoulMemoryReviewCommandRunContext {
	const messages = options.messages || [];
	const hasAssistant = messages.some(
		(message) =>
			message.role === "assistant" &&
			typeof message.content === "string" &&
			message.content.trim(),
	);
	const hasUser = messages.some(
		(message) =>
			message.role === "user" &&
			typeof message.content === "string" &&
			message.content.trim(),
	);
	return {
		enabled:
			options.enabled && options.review.enabled && options.review.interval > 0,
		hasSession: Boolean(options.messages),
		hasRequiredMessages: Boolean(hasAssistant && hasUser),
	};
}

export async function handleSoulMemoryReviewCommand(
	options: HandleSoulMemoryReviewCommandOptions,
): Promise<void> {
	const { action, rest } = parseSoulMemoryRootCommand(options.args);

	if (action === "status") {
		options.ctx.notify(await options.getStatus());
		return;
	}

	if (action === "on" || action === "off") {
		const current = await options.getSettings();
		const review = await options.saveSettingsPatch(
			action === "on"
				? {
						enabled: true,
						interval: current.interval > 0 ? current.interval : 10,
					}
				: { enabled: false },
		);
		options.ctx.notify(
			formatSoulMemoryReviewToggleNotification(
				review,
				await options.getStatus(),
			),
		);
		return;
	}

	if (action === "interval") {
		const value = Number(rest[0]);
		if (!Number.isInteger(value) || value < 0 || value > 200) {
			options.ctx.notify("Usage: /memory review interval <0-200>", "warn");
			return;
		}
		const review = await options.saveSettingsPatch({
			interval: value,
			enabled: value !== 0,
		});
		options.ctx.notify(
			formatSoulMemoryReviewIntervalNotification(
				review,
				await options.getStatus(),
			),
		);
		return;
	}

	if (action === "run") {
		const context = await options.getRunContext();
		if (!context.enabled) {
			options.ctx.notify(
				"Memory Review is disabled. Use /memory review on first.",
				"warn",
			);
			return;
		}
		if (!context.hasSession) {
			options.ctx.notify("No current session found for Memory Review.", "warn");
			return;
		}
		if (!context.hasRequiredMessages) {
			options.ctx.notify(
				"Memory Review needs at least one user message and one assistant response.",
				"warn",
			);
			return;
		}
		options.ctx.notify("Memory Review started.");
		try {
			const result = await options.runNow();
			options.ctx.notify(
				`Memory Review finished: ${result.lastStatus || "none"}`,
			);
		} catch (error) {
			options.ctx.notify(
				`Memory Review failed: ${soulMemoryCommandErrorMessage(error)}`,
				"error",
			);
		}
		return;
	}

	options.ctx.notify(CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE, "warn");
}

export interface CoreSoulMemoryToolResult<TMetadata extends object = object> {
	title: string;
	output: string;
	metadata: TMetadata;
}

export function disabledSoulMemoryToolResult(
	title = "Memory disabled",
): CoreSoulMemoryToolResult<{ disabled: true }> {
	return {
		title,
		output: "Soul-memory is disabled in settings.",
		metadata: { disabled: true },
	};
}

export interface CoreSoulMemorySoulGetToolResultMetadata {
	path: string;
}

export interface HandleSoulMemorySoulGetToolOptions {
	enabled: boolean;
	soulPath: string;
	readSoulContent: () => CoreMaybePromise<string>;
}

export async function handleSoulMemorySoulGetTool(
	options: HandleSoulMemorySoulGetToolOptions,
): Promise<
	CoreSoulMemoryToolResult<
		CoreSoulMemorySoulGetToolResultMetadata | { disabled: true }
	>
> {
	if (!options.enabled) {
		return disabledSoulMemoryToolResult("Soul disabled");
	}
	return {
		title: "SOUL.md",
		output: await options.readSoulContent(),
		metadata: { path: options.soulPath },
	};
}

export interface CoreSoulMemorySoulUpdateToolArgs {
	content: string;
	mode?: "replace" | "append";
	heading?: string;
}

export interface CoreSoulMemorySoulUpdateResult {
	mode: "replace" | "append";
	absolutePath: string;
	[key: string]: unknown;
}

export interface HandleSoulMemorySoulUpdateToolOptions<
	TResult extends CoreSoulMemorySoulUpdateResult,
> {
	args: CoreSoulMemorySoulUpdateToolArgs;
	update: (
		args: Required<
			Pick<CoreSoulMemorySoulUpdateToolArgs, "content" | "mode">
		> & {
			heading?: string;
		},
	) => CoreMaybePromise<TResult>;
}

export async function handleSoulMemorySoulUpdateTool<
	TResult extends CoreSoulMemorySoulUpdateResult,
>(
	options: HandleSoulMemorySoulUpdateToolOptions<TResult>,
): Promise<CoreSoulMemoryToolResult<TResult>> {
	const result = await options.update({
		content: options.args.content,
		mode: options.args.mode || "replace",
		heading: options.args.heading,
	});
	const action = result.mode === "append" ? "appended" : "updated";
	return {
		title: `SOUL.md ${action}`,
		output: `SOUL.md ${action} at ${result.absolutePath}. Tell the user what changed.`,
		metadata: result,
	};
}

export interface CoreSoulMemoryGetToolArgs {
	path: string;
	startLine?: number;
	endLine?: number;
	from?: number;
	lines?: number;
}

export const CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID = "user:self";

export function slugifySoulMemoryKeyPart(value: string): string {
	const slug = value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/['"`]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, ".")
		.replace(/^\.+|\.+$/g, "")
		.slice(0, 80);
	return (
		slug || crypto.createHash("sha256").update(value).digest("hex").slice(0, 10)
	);
}

export interface HandleSoulMemoryGetToolOptions {
	args: CoreSoulMemoryGetToolArgs;
	enabled: boolean;
	readFileExcerpt: (
		args: CoreSoulMemoryGetToolArgs,
	) => CoreMaybePromise<CoreSoulMemoryFileExcerpt>;
}

export function formatSoulMemoryFileExcerptToolOutput(
	excerpt: CoreSoulMemoryFileExcerpt,
): string {
	const continuation = excerpt.truncated
		? `\n\n[More content available. Continue from line ${excerpt.endLine + 1}.]`
		: "";
	return `${excerpt.text}${continuation}`;
}

export async function handleSoulMemoryGetTool(
	options: HandleSoulMemoryGetToolOptions,
): Promise<CoreSoulMemoryToolResult> {
	if (!options.enabled) {
		return disabledSoulMemoryToolResult();
	}

	const excerpt = await options.readFileExcerpt(options.args);
	return {
		title: `Memory file: ${excerpt.relativePath}`,
		output: formatSoulMemoryFileExcerptToolOutput(excerpt),
		metadata: {
			path: excerpt.relativePath,
			startLine: excerpt.startLine,
			endLine: excerpt.endLine,
			totalLines: excerpt.totalLines,
			truncated: excerpt.truncated,
		},
	};
}

export function buildSoulMemoryRewriteFollowUp(instruction: string): string {
	return [
		"Read the current SOUL.md with soul_get, then revise it according to this instruction:",
		instruction,
		"",
		"Use soul_update only if a concrete change is warranted. After changing it, tell me what changed.",
	].join("\n");
}

export interface CoreSoulMemorySoulCommandWorkspace {
	soulPath: string;
	settings: {
		bootstrapMaxChars: number;
	};
}

export interface HandleSoulMemorySoulCommandOptions<
	TWorkspace extends CoreSoulMemorySoulCommandWorkspace,
> {
	args: string;
	ctx: CoreSoulMemoryCommandNotificationContext;
	getWorkspace: () => CoreMaybePromise<TWorkspace>;
	readSoulContent: (
		workspace: TWorkspace,
		maxChars: number,
	) => CoreMaybePromise<string>;
}

export function formatSoulMemorySoulStatus(
	workspace: CoreSoulMemorySoulCommandWorkspace,
): string {
	return [
		`SOUL.md: ${workspace.soulPath}`,
		`Prompt cap: ${workspace.settings.bootstrapMaxChars} chars`,
		"Updates are explicit and permission-gated through soul_update.",
	].join("\n");
}

export async function handleSoulMemorySoulCommand<
	TWorkspace extends CoreSoulMemorySoulCommandWorkspace,
>(options: HandleSoulMemorySoulCommandOptions<TWorkspace>): Promise<void> {
	const { action, restText } = parseSoulMemoryRootCommand(options.args);
	const workspace = await options.getWorkspace();
	if (action === "path" || action === "status") {
		options.ctx.notify(formatSoulMemorySoulStatus(workspace));
		return;
	}
	if (action === "show") {
		const content = await options.readSoulContent(
			workspace,
			workspace.settings.bootstrapMaxChars,
		);
		options.ctx.notify(truncateSoulMemoryText(content, 4000));
		return;
	}
	if (action === "rewrite" || action === "refine") {
		const instruction = restText.trim();
		if (!instruction) {
			options.ctx.notify(`Usage: /soul ${action} <instruction>`, "warn");
			return;
		}
		options.ctx.followUp?.(buildSoulMemoryRewriteFollowUp(instruction));
		options.ctx.notify("Queued a SOUL.md revision request for the assistant.");
		return;
	}
	options.ctx.notify(
		"Usage: /soul status|show|path|rewrite <instruction>",
		"warn",
	);
}

export interface CoreSoulMemoryCommandStatusReview {
	enabled: boolean;
	interval: number;
	turnsUntilReview: number;
	lastRunAt?: number;
	lastStatus?: string;
	lastApplied?: number;
}

export interface CoreSoulMemoryCommandStatusInput {
	root: string;
	userPath: string;
	memoryPath: string;
	review: CoreSoulMemoryCommandStatusReview;
}

export function formatSoulMemoryCommandStatus(
	input: CoreSoulMemoryCommandStatusInput,
): string {
	const { review } = input;
	return [
		`Root: ${input.root}`,
		`USER.md: ${input.userPath}`,
		`MEMORY.md: ${input.memoryPath}`,
		`Memory Review: ${review.enabled ? `on, every ${review.interval} user turns (${review.turnsUntilReview} until next)` : "off"}`,
		review.lastRunAt
			? `Last review: ${formatSoulMemoryMaybeTimestamp(review.lastRunAt)} (${review.lastStatus || "unknown"}, applied ${review.lastApplied ?? 0})`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

export function getSoulMemoryDailyDateFromFileName(
	name: string,
): string | undefined {
	return name.match(/^(\d{4}-\d{2}-\d{2})(?:-[^/]+)?\.md$/)?.[1];
}

export type CoreMemoryReviewAction = "add" | "replace" | "remove";
// Hermes 文件记忆(USER.md / MEMORY.md 的条目读写)已整体移除:不再注入提示词、
// 不再有 memory 工具、复盘也不再往这两个文件写。复盘只剩 SOUL.md / DREAMS.md。
// 这两个文件本身仍在盘上,memory 面板与 memory_get 照常按普通文件读取。
export type CorePlainReviewTarget = "soul" | "dreams";
export type CoreMemoryReviewTarget = CorePlainReviewTarget;
export type CoreMemoryManagedFileKind =
	| "soul"
	| "user"
	| "memory"
	| "dreams"
	| "daily";

export interface CoreMemoryReviewCandidate {
	action: CoreMemoryReviewAction;
	target: CoreMemoryReviewTarget;
	confidence: number;
	content?: string;
	oldText?: string;
	newText?: string;
	text?: string;
	reason?: string;
}

export interface CoreMemoryReviewModelResult {
	candidates: CoreMemoryReviewCandidate[];
	confidence: number;
	reason?: string;
}

export interface CoreMemoryReviewProgress {
	userTurns: number;
	turnsSinceReview: number;
	turnsUntilReview: number;
	shouldReview: boolean;
}

export interface CoreMemoryReviewMessage {
	role: string;
	content?: unknown;
}

export type CorePlainReviewMutationResult = {
	changed: boolean;
	skipped: boolean;
	next?: string;
	reason?: string;
};

export interface CoreMemoryReviewApplyResult {
	changed: boolean;
	skipped: boolean;
	relativePath?: string;
	reason?: string;
}

export interface CoreMemoryReviewPlainFile {
	content: string;
	relativePath: string;
}

export interface ApplyMemoryReviewCandidateOptions {
	candidate: CoreMemoryReviewCandidate;
	minConfidence: number;
	readPlain: (
		target: CorePlainReviewTarget,
	) => CoreMaybePromise<CoreMemoryReviewPlainFile>;
	writePlain: (
		target: CorePlainReviewTarget,
		content: string,
	) => CoreMaybePromise<void>;
}

export interface CoreManagedMemoryFileSortable {
	kind: CoreMemoryManagedFileKind;
	date?: string;
	mtimeMs: number;
	relativePath: string;
}

export function normalizeSoulMemoryBulletText(value: string): string {
	return value
		.replace(/^\s*[-*]\s+/, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function soulMemoryAsBullet(value: string): string {
	const text = normalizeSoulMemoryBulletText(value);
	return text ? `- ${text}` : "";
}

export function normalizeSoulMemoryForDedupe(value: string): string {
	return value
		.replace(/^\s*[-*]\s+/, "")
		.replace(/\[[^\]]*]\([^)]*\)/g, "")
		.replace(/[`*_>#]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export function extractLegacyMemoryCandidates(
	content: string,
): CoreCaptureCandidate[] {
	const candidates: CoreCaptureCandidate[] = [];
	let section = "";
	for (const rawLine of content.split(/\r?\n/)) {
		const heading = rawLine.match(/^##\s+(.+?)\s*$/);
		if (heading) {
			section = heading[1].toLowerCase();
			continue;
		}
		if (!/^\s*[-*]\s+\S/.test(rawLine)) continue;
		const text = normalizeSoulMemoryBulletText(rawLine);
		const lower = text.toLowerCase();
		let kind: CoreCaptureCandidateKind | null = null;
		if (
			/user(?:'s)? name is|user identifies as|user is known as|my name is|i am|i'm|我叫|我是/i.test(
				text,
			)
		) {
			kind = "identity";
		} else if (
			section.includes("preference") ||
			lower.includes("prefers") ||
			lower.includes("preference")
		) {
			kind = "preference";
		} else if (
			section.includes("decision") &&
			/user|用户|approved|decided|agreed/i.test(text)
		) {
			kind = "decision";
		} else if (/^user\b|the user\b|用户/.test(lower)) {
			kind = "fact";
		}
		if (!kind) continue;
		candidates.push({
			kind,
			source: "user",
			confidence: 0.78,
			text,
			sensitivity: "normal",
			target: "memory",
			explicit: false,
		});
	}
	return candidates;
}

export function dailyNoteTimeHeading(date = new Date()): string {
	return date.toLocaleTimeString();
}

export function formatSoulMemoryDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function formatSoulMemoryDateStringDaysAgo(
	daysAgo: number,
	now = new Date(),
): string {
	const date = new Date(now);
	date.setDate(date.getDate() - daysAgo);
	return formatSoulMemoryDateString(date);
}

export function hashSoulMemoryText(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex");
}

export function estimateSoulMemoryTokens(value: string): number {
	const words = value.trim().split(/\s+/).filter(Boolean).length;
	const charEstimate = Math.ceil(value.length / 4);
	return Math.max(words, charEstimate, 1);
}

export function truncateSoulMemoryText(
	value: string,
	maxChars: number,
): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n\n[Truncated at ${maxChars} chars]`;
}

export function previewSoulMemoryLine(value: string, maxChars = 220): string {
	return truncateSoulMemoryText(value.replace(/\s+/g, " ").trim(), maxChars);
}

export function formatSoulMemoryZonedDateTime(
	date: Date,
	timezone?: string,
): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			...(timezone ? { timeZone: timezone } : {}),
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZoneName: "short",
		}).format(date);
	} catch {
		return date.toLocaleString();
	}
}

export function formatSoulMemoryMaybeTimestamp(
	epochMs: number | undefined,
	timezone?: string,
): string {
	if (!epochMs) return "never";
	return formatSoulMemoryZonedDateTime(new Date(epochMs), timezone);
}

export interface CoreSoulMemoryTimelineEntry {
	id: string;
	timestamp: number;
	type: string;
	title: string;
	detail?: string;
	durationMs?: number;
	status?: string;
	metadata?: Record<string, unknown>;
}

export interface CoreSoulMemoryTimelineEntryInput
	extends Omit<CoreSoulMemoryTimelineEntry, "id" | "timestamp"> {
	id?: string;
	timestamp?: number;
}

export function createSoulMemoryTimelineEntry(
	input: CoreSoulMemoryTimelineEntryInput,
	options: {
		now?: () => number;
		randomId?: () => string;
	} = {},
): CoreSoulMemoryTimelineEntry {
	const randomId =
		options.randomId ??
		(() =>
			globalThis.crypto?.randomUUID?.() ??
			`entry-${Math.random().toString(36).slice(2)}`);
	return {
		id: input.id ?? randomId(),
		timestamp: input.timestamp ?? options.now?.() ?? Date.now(),
		type: input.type,
		title: input.title,
		...(input.detail ? { detail: input.detail } : {}),
		...(typeof input.durationMs === "number"
			? { durationMs: input.durationMs }
			: {}),
		...(input.status ? { status: input.status } : {}),
		...(input.metadata ? { metadata: input.metadata } : {}),
	};
}

export interface CoreSoulMemoryStatusStore {
	get<T>(key: string): T | undefined;
}

export interface CoreSoulMemorySchedulerStatus {
	nextRunAt?: number;
	lastRunAt?: number;
	lastRunReason?: string;
	lastError?: string;
	inFlight?: boolean;
}

export interface CoreSoulMemoryNextRunStatus {
	nextRunAt?: number;
	error?: string;
}

export interface CoreSoulMemoryRuntimeStatus {
	lastDreamingAt?: number;
	lastDreamingError?: string;
	lastDreamingApplied?: number;
	lastDreamingStatus?: string;
	lastDreamingSourceFiles?: string[];
	lastDreamingNextRunAt?: number;
	lastReviewAt?: number;
	lastReviewError?: string;
	lastReviewApplied?: number;
	lastReviewStatus?: string;
	lastReviewTurn?: number;
	lastCaptureAt?: number;
	lastCaptureError?: string;
	lastCaptureStatus?: string;
}

export interface CoreSoulMemoryOverviewWorkspace<TSettings> {
	enabled: boolean;
	agentId: string;
	root: string;
	memoryDir: string;
	soulPath: string;
	userPath: string;
	memoryPath: string;
	dreamsPath: string;
	todayPath: string;
	settings: TSettings;
}

export interface BuildSoulMemoryOverviewOptions<
	TSettings,
	TStatus extends CoreSoulMemoryRuntimeStatus,
	TPendingCapture,
	TFile,
> {
	workspace: CoreSoulMemoryOverviewWorkspace<TSettings>;
	status: TStatus;
	captureStatusStore?: CoreSoulMemoryStatusStore;
	pendingCaptures: TPendingCapture[];
	files: TFile[];
}

export type CoreSoulMemoryOverview<
	TSettings,
	TStatus extends CoreSoulMemoryRuntimeStatus,
	TPendingCapture,
	TFile,
> = CoreSoulMemoryOverviewWorkspace<TSettings> & {
	status: TStatus;
	pendingCaptures: TPendingCapture[];
	files: TFile[];
};

export function mergeSoulMemoryCaptureStatus<
	TStatus extends CoreSoulMemoryRuntimeStatus,
>(status: TStatus, store?: CoreSoulMemoryStatusStore): TStatus {
	return {
		...status,
		lastCaptureAt: store?.get<number>("lastCaptureAt") ?? status.lastCaptureAt,
		lastCaptureError:
			store?.get<string>("lastCaptureError") ?? status.lastCaptureError,
		lastCaptureStatus:
			store?.get<string>("lastCaptureStatus") ?? status.lastCaptureStatus,
	};
}

export function buildSoulMemoryOverview<
	TSettings,
	TStatus extends CoreSoulMemoryRuntimeStatus,
	TPendingCapture,
	TFile,
>(
	options: BuildSoulMemoryOverviewOptions<
		TSettings,
		TStatus,
		TPendingCapture,
		TFile
	>,
): CoreSoulMemoryOverview<TSettings, TStatus, TPendingCapture, TFile> {
	return {
		...options.workspace,
		status: mergeSoulMemoryCaptureStatus(
			options.status,
			options.captureStatusStore,
		),
		pendingCaptures: options.pendingCaptures,
		files: options.files,
	};
}

export interface CoreSoulMemoryStatusMutationPlan {
	storeSet: Array<[string, unknown]>;
	storeDelete: string[];
	runtimePatch: Partial<CoreSoulMemoryRuntimeStatus>;
	runtimeDelete: Array<keyof CoreSoulMemoryRuntimeStatus>;
}

export interface CoreSoulMemoryStatusStoreWriter {
	set(key: string, value: unknown): void;
	delete(key: string): void;
}

export function applySoulMemoryStatusMutationPlan(options: {
	store?: CoreSoulMemoryStatusStoreWriter;
	runtimeStatus?: CoreSoulMemoryRuntimeStatus;
	plan: CoreSoulMemoryStatusMutationPlan;
}): void {
	for (const [key, value] of options.plan.storeSet) {
		options.store?.set(key, value);
	}
	for (const key of options.plan.storeDelete) {
		options.store?.delete(key);
	}
	if (options.runtimeStatus) {
		Object.assign(options.runtimeStatus, options.plan.runtimePatch);
		for (const key of options.plan.runtimeDelete) {
			delete options.runtimeStatus[key];
		}
	}
}

export function planSoulMemoryCaptureSuccessStatusMutation(input: {
	status: string;
	capturedAt?: number;
}): CoreSoulMemoryStatusMutationPlan {
	const capturedAt = input.capturedAt ?? Date.now();
	return {
		storeSet: [
			["lastCaptureAt", capturedAt],
			["lastCaptureStatus", input.status],
		],
		storeDelete: ["lastCaptureError"],
		runtimePatch: {
			lastCaptureAt: capturedAt,
			lastCaptureStatus: input.status,
		},
		runtimeDelete: ["lastCaptureError"],
	};
}

export function planSoulMemoryCaptureErrorStatusMutation(
	errorMessage: string,
): CoreSoulMemoryStatusMutationPlan {
	return {
		storeSet: [
			["lastCaptureError", errorMessage],
			["lastCaptureStatus", "error"],
		],
		storeDelete: [],
		runtimePatch: {
			lastCaptureError: errorMessage,
			lastCaptureStatus: "error",
		},
		runtimeDelete: [],
	};
}

export function planSoulMemoryCaptureRuntimeStatusMutation(
	status: string,
): CoreSoulMemoryStatusMutationPlan {
	return {
		storeSet: [],
		storeDelete: [],
		runtimePatch: {
			lastCaptureStatus: status,
		},
		runtimeDelete: [],
	};
}

export function planSoulMemoryCaptureDiscardStatusMutation(): CoreSoulMemoryStatusMutationPlan {
	return {
		storeSet: [["lastCaptureStatus", "discarded"]],
		storeDelete: [],
		runtimePatch: {
			lastCaptureStatus: "discarded",
		},
		runtimeDelete: [],
	};
}

export function planSoulMemoryReviewTurnStatusMutation(input: {
	lastTurnKey: string;
	userTurns: number;
}): CoreSoulMemoryStatusMutationPlan {
	return {
		storeSet: [
			[input.lastTurnKey, input.userTurns],
			["lastReviewTurn", input.userTurns],
		],
		storeDelete: [],
		runtimePatch: {
			lastReviewTurn: input.userTurns,
		},
		runtimeDelete: [],
	};
}

export function planSoulMemoryReviewNoneStatusMutation(
	input: { runAt?: number } = {},
): CoreSoulMemoryStatusMutationPlan {
	const runAt = input.runAt ?? Date.now();
	return {
		storeSet: [
			["lastReviewAt", runAt],
			["lastReviewStatus", "none"],
			["lastReviewApplied", 0],
		],
		storeDelete: ["lastReviewError"],
		runtimePatch: {
			lastReviewAt: runAt,
			lastReviewStatus: "none",
			lastReviewApplied: 0,
		},
		runtimeDelete: ["lastReviewError"],
	};
}

export function planSoulMemoryReviewAppliedStatusMutation(input: {
	runAt?: number;
	applied: number;
	skipped: number;
	userTurns: number;
}): CoreSoulMemoryStatusMutationPlan {
	const runAt = input.runAt ?? Date.now();
	const status = `applied:${input.applied} skipped:${input.skipped} turn:${input.userTurns}`;
	return {
		storeSet: [
			["lastReviewAt", runAt],
			["lastReviewApplied", input.applied],
			["lastReviewStatus", status],
		],
		storeDelete: ["lastReviewError"],
		runtimePatch: {
			lastReviewAt: runAt,
			lastReviewApplied: input.applied,
			lastReviewStatus: status,
		},
		runtimeDelete: ["lastReviewError"],
	};
}

export function planSoulMemoryReviewErrorStatusMutation(input: {
	errorMessage: string;
	runAt?: number;
}): CoreSoulMemoryStatusMutationPlan {
	const runAt = input.runAt ?? Date.now();
	return {
		storeSet: [
			["lastReviewError", input.errorMessage],
			["lastReviewStatus", "error"],
			["lastReviewAt", runAt],
		],
		storeDelete: [],
		runtimePatch: {
			lastReviewError: input.errorMessage,
			lastReviewStatus: "error",
			lastReviewAt: runAt,
		},
		runtimeDelete: [],
	};
}

export interface CoreSoulMemoryReviewStatus {
	enabled: boolean;
	interval: number;
	maxInputChars: number;
	timeoutMs: number;
	maxCandidates: number;
	minConfidence: number;
	userTurns: number;
	turnsSinceReview?: number;
	turnsUntilReview: number;
	shouldReview?: boolean;
	lastRunAt?: number;
	lastApplied?: number;
	lastStatus?: string;
	lastError?: string;
	lastReviewedTurn?: number;
}

export interface CoreSoulMemoryReviewSettings {
	enabled: boolean;
	interval: number;
	maxInputChars: number;
	timeoutMs: number;
	maxCandidates: number;
	minConfidence: number;
}

export const CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX =
	"memoryReviewLastTurn:";

export interface CoreAppSettingsWithSoulMemory {
	general: {
		soulMemory?: unknown;
	};
}

export function patchSoulMemorySettingsSection<
	TSettings extends CoreAppSettingsWithSoulMemory,
	TPatch extends object,
>(settings: TSettings, section: string, patch: TPatch): TSettings {
	const soulMemory =
		settings.general.soulMemory &&
		typeof settings.general.soulMemory === "object" &&
		!Array.isArray(settings.general.soulMemory)
			? (settings.general.soulMemory as Record<string, unknown>)
			: {};
	const currentSection = soulMemory[section];
	const sectionObject =
		currentSection &&
		typeof currentSection === "object" &&
		!Array.isArray(currentSection)
			? (currentSection as Record<string, unknown>)
			: {};

	return {
		...settings,
		general: {
			...settings.general,
			soulMemory: {
				...soulMemory,
				[section]: {
					...sectionObject,
					...patch,
				},
			},
		},
	} as TSettings;
}

export interface PatchSoulMemorySettingsSectionWithAdaptersOptions<
	TSettings extends CoreAppSettingsWithSoulMemory,
	TPatch extends object,
	TResolved,
	TResult,
> {
	section: string;
	patch: TPatch;
	getSettings(): TSettings;
	saveSettings(settings: TSettings): void;
	resolveSettings(settings: TSettings): TResolved;
	selectSection(resolved: TResolved): TResult;
}

export function patchSoulMemorySettingsSectionWithAdapters<
	TSettings extends CoreAppSettingsWithSoulMemory,
	TPatch extends object,
	TResolved,
	TResult,
>(
	options: PatchSoulMemorySettingsSectionWithAdaptersOptions<
		TSettings,
		TPatch,
		TResolved,
		TResult
	>,
): TResult {
	const current = options.getSettings();
	options.saveSettings(
		patchSoulMemorySettingsSection(current, options.section, options.patch),
	);
	return options.selectSection(options.resolveSettings(options.getSettings()));
}

export interface BuildSoulMemoryReviewStatusOptions {
	enabled: boolean;
	settings: CoreSoulMemoryReviewSettings;
	progress: CoreMemoryReviewProgress;
	lastReviewedTurn?: number;
	store?: CoreSoulMemoryStatusStore;
	runtimeStatus?: CoreSoulMemoryRuntimeStatus;
}

export interface BuildSoulMemoryReviewStatusWithAdaptersOptions {
	enabled: boolean;
	settings: CoreSoulMemoryReviewSettings;
	messages: CoreMemoryReviewMessage[];
	keyPrefix?: string;
	agentId: string;
	sessionId: string;
	store?: CoreSoulMemoryStatusStore;
	runtimeStatus?: CoreSoulMemoryRuntimeStatus;
}

export function buildSoulMemoryReviewStatus(
	options: BuildSoulMemoryReviewStatusOptions,
): CoreSoulMemoryReviewStatus {
	const store = options.store;
	const runtimeStatus = options.runtimeStatus;
	return {
		enabled:
			options.enabled &&
			options.settings.enabled &&
			options.settings.interval > 0,
		interval: options.settings.interval,
		maxInputChars: options.settings.maxInputChars,
		timeoutMs: options.settings.timeoutMs,
		maxCandidates: options.settings.maxCandidates,
		minConfidence: options.settings.minConfidence,
		...options.progress,
		lastRunAt:
			store?.get<number>("lastReviewAt") ?? runtimeStatus?.lastReviewAt,
		lastApplied:
			store?.get<number>("lastReviewApplied") ??
			runtimeStatus?.lastReviewApplied,
		lastStatus:
			store?.get<string>("lastReviewStatus") ?? runtimeStatus?.lastReviewStatus,
		lastError:
			store?.get<string>("lastReviewError") ?? runtimeStatus?.lastReviewError,
		lastReviewedTurn: options.lastReviewedTurn,
	};
}

export function buildSoulMemoryReviewStatusWithAdapters(
	options: BuildSoulMemoryReviewStatusWithAdaptersOptions,
): CoreSoulMemoryReviewStatus {
	const lastReviewedTurn = options.store?.get<number>(
		memoryReviewLastTurnKey(
			options.keyPrefix ?? CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX,
			options.agentId,
			options.sessionId,
		),
	);
	const progress = getMemoryReviewProgress({
		messages: options.messages,
		interval: options.settings.interval,
		lastReviewedTurn,
	});
	return buildSoulMemoryReviewStatus({
		enabled: options.enabled,
		settings: options.settings,
		progress,
		lastReviewedTurn,
		store: options.store,
		runtimeStatus: options.runtimeStatus,
	});
}

export function formatSoulMemoryReviewStatus(
	status: CoreSoulMemoryReviewStatus,
): string {
	return [
		`Memory Review: ${status.enabled ? "on" : "off"}`,
		`Interval: ${status.interval > 0 ? `every ${status.interval} user turns` : "disabled"}`,
		`Progress: ${status.userTurns} user turns total, ${status.turnsUntilReview} until next review`,
		`Input cap: ${status.maxInputChars} chars, timeout ${Math.round(status.timeoutMs / 1000)}s`,
		`Candidates: up to ${status.maxCandidates}, min confidence ${status.minConfidence}`,
		`Last run: ${formatSoulMemoryMaybeTimestamp(status.lastRunAt)}`,
		`Last result: ${status.lastStatus || "none"}${typeof status.lastApplied === "number" ? `, applied ${status.lastApplied}` : ""}`,
		typeof status.lastReviewedTurn === "number"
			? `Last reviewed turn: ${status.lastReviewedTurn}`
			: "",
		status.lastError ? `Last error: ${status.lastError}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

export interface CoreSoulMemoryCaptureInputContext {
	messages: Array<{ role: string; content: string }>;
	lastUserMessage: string;
	lastAssistantMessage: string;
}

export interface CoreSoulMemoryPromptFragment {
	role: "developer" | "user";
	source: string;
	content: string;
}

export interface BuildSoulMemoryPromptFragmentsInput {
	rulesPrompt: string;
	soulPath: string;
	soulContent: string;
}

/**
 * A SOUL.md that only carries markdown headings (e.g. the "# SOUL.md" seed
 * template) or whitespace has no persona content yet.
 */
export function isSoulMemorySoulContentEmpty(content: string): boolean {
	return content
		.split("\n")
		.every((line) => !line.trim() || line.trim().startsWith("#"));
}

export function buildSoulMemoryPromptFragments(
	input: BuildSoulMemoryPromptFragmentsInput,
): CoreSoulMemoryPromptFragment[] {
	const soulBody = isSoulMemorySoulContentEmpty(input.soulContent)
		? "(empty — SOUL.md has no persona content yet; it grows through periodic reviews or explicit soul_update calls.)"
		: input.soulContent;
	const fragments: CoreSoulMemoryPromptFragment[] = [
		{
			role: "developer",
			source: "memory/soul-memory-rules",
			content: input.rulesPrompt,
		},
		{
			role: "developer",
			source: "plugins/soul-memory/SOUL.md",
			content: [
				"# SOUL.md",
				`Path: ${input.soulPath}`,
				"",
				soulBody,
			].join("\n"),
		},
	];





	return fragments;
}

export function compactSoulMemoryCaptureInput(
	context: CoreSoulMemoryCaptureInputContext,
	maxChars: number,
): string {
	const recent = context.messages
		.filter(
			(message) => message.role === "user" || message.role === "assistant",
		)
		.slice(-6)
		.map(
			(message) =>
				`${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`,
		)
		.join("\n\n");
	return truncateSoulMemoryText(
		[
			"Recent conversation tail:",
			recent,
			"",
			"Latest user message:",
			context.lastUserMessage,
			"",
			"Latest assistant response:",
			context.lastAssistantMessage,
		].join("\n"),
		maxChars,
	);
}

export interface CoreSoulMemoryCapturePromptInput {
	context: CoreSoulMemoryCaptureInputContext;
	dailyRelativePath: string;
	dailyContent: string;
	maxChars: number;
}

export interface BuildSoulMemoryCaptureInputWithAdaptersOptions
	extends Omit<CoreSoulMemoryCapturePromptInput, "dailyContent"> {
	readDailyContent: () => CoreMaybePromise<string>;
}

export function buildSoulMemoryCaptureInput(
	input: CoreSoulMemoryCapturePromptInput,
): string {
	const dailyMaxChars = Math.max(
		200,
		Math.min(8000, Math.floor(input.maxChars * 0.35)),
	);
	const dailySection = input.dailyContent.trim()
		? truncateSoulMemoryText(input.dailyContent.trim(), dailyMaxChars)
		: "(empty)";
	const conversationBudget = Math.max(
		300,
		input.maxChars - dailySection.length - 240,
	);
	const conversation = compactSoulMemoryCaptureInput(
		input.context,
		conversationBudget,
	);
	return truncateSoulMemoryText(
		[
			`Current daily note (${input.dailyRelativePath}):`,
			dailySection,
			"",
			conversation,
		].join("\n"),
		input.maxChars,
	);
}

export async function buildSoulMemoryCaptureInputWithAdapters(
	options: BuildSoulMemoryCaptureInputWithAdaptersOptions,
): Promise<string> {
	const dailyContent = await Promise.resolve(options.readDailyContent()).catch(
		() => "",
	);
	return buildSoulMemoryCaptureInput({
		context: options.context,
		dailyRelativePath: options.dailyRelativePath,
		dailyContent,
		maxChars: options.maxChars,
	});
}

export interface BuildSoulMemoryCaptureDedupeTextWithAdaptersOptions {
	readMemoryContent: () => CoreMaybePromise<string>;
	readDailyContent: () => CoreMaybePromise<string>;
}

export async function buildSoulMemoryCaptureDedupeTextWithAdapters(
	options: BuildSoulMemoryCaptureDedupeTextWithAdaptersOptions,
): Promise<string> {
	const [memoryContent, dailyContent] = await Promise.all([
		Promise.resolve(options.readMemoryContent()).catch(() => ""),
		Promise.resolve(options.readDailyContent()).catch(() => ""),
	]);
	return [memoryContent, dailyContent].join("\n");
}

export interface DedupeSoulMemoryDailyNoteBulletsWithAdaptersOptions
	extends BuildSoulMemoryCaptureDedupeTextWithAdaptersOptions {
	bullets: string[];
}

export async function dedupeSoulMemoryDailyNoteBulletsWithAdapters(
	options: DedupeSoulMemoryDailyNoteBulletsWithAdaptersOptions,
): Promise<string[]> {
	return dedupeSoulMemoryDailyNoteBullets(
		await buildSoulMemoryCaptureDedupeTextWithAdapters(options),
		options.bullets,
	);
}

export interface DedupeSoulMemoryCaptureLinesWithAdaptersOptions
	extends BuildSoulMemoryCaptureDedupeTextWithAdaptersOptions {
	lines: string[];
}

export async function dedupeSoulMemoryCaptureLinesWithAdapters(
	options: DedupeSoulMemoryCaptureLinesWithAdaptersOptions,
): Promise<string[]> {
	return dedupeSoulMemoryCaptureLines(
		await buildSoulMemoryCaptureDedupeTextWithAdapters(options),
		options.lines,
	);
}

export interface CoreSoulMemoryCaptureSettings {
	mode: "explicit-only" | "auto" | "off";
	maxInputChars: number;
	timeoutMs: number;
}

export interface CoreSoulMemoryCaptureApplyResultLike {
	relativePath: string;
	applied: number;
	added: number;
	replaced: number;
	removed: number;
	skipped: number;
}

export interface CoreSoulMemoryCaptureRunDiagnostic {
	subsystem: "capture";
	operation:
		| "after-assistant-response"
		| "model-classify"
		| "model-extract"
		| "daily-note-actions";
	stage: "gate" | "start" | "request" | "response" | "write" | "finish";
	status: "started" | "ok" | "skipped" | "error";
	durationMs?: number;
	sessionId?: string;
	runId?: string;
	summary?: string;
	request?: Record<string, unknown>;
	response?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	error?: unknown;
}

export interface CoreSoulMemoryCaptureProviderRef<TProvider> {
	provider: TProvider;
	providerId: string;
	model: unknown;
	source?: string;
}

export interface CoreSoulMemoryCaptureGenerateInput<TProvider> {
	provider: TProvider;
	system: string;
	prompt: string;
	temperature: number;
	maxTokens: number;
}

export interface CoreSoulMemoryCaptureRunResult {
	status: "skipped" | "none" | "saved" | "error";
	explicitIntent: boolean;
	applied: number;
	added: number;
	replaced: number;
	removed: number;
	skipped: number;
	relativePath?: string;
	lastStatus?: string;
	error?: string;
}

export interface RunSoulMemoryCaptureOptions<TProvider> {
	sessionId: string;
	assistantMessageId: string;
	context: CoreSoulMemoryCaptureInputContext;
	enabled: boolean;
	capture: CoreSoulMemoryCaptureSettings;
	dailyRelativePath: string;
	readDailyContent: () => CoreMaybePromise<string>;
	hash: (value: string) => string;
	resolveProvider: () => CoreMaybePromise<
		CoreSoulMemoryCaptureProviderRef<TProvider>
	>;
	generateCapture: (
		input: CoreSoulMemoryCaptureGenerateInput<TProvider>,
	) => CoreMaybePromise<string>;
	applyDailyActions: (
		candidates: CoreDailyNoteCaptureCandidate[],
	) => CoreMaybePromise<CoreSoulMemoryCaptureApplyResultLike | null>;
	applyStatusMutation: (
		plan: CoreSoulMemoryStatusMutationPlan,
	) => CoreMaybePromise<void>;
	notify?: (
		message: string,
		level?: "info" | "warn" | "error",
	) => CoreMaybePromise<void>;
	logDiagnostic?: (event: CoreSoulMemoryCaptureRunDiagnostic) => void;
	now?: () => number;
	preview?: (value: string, maxChars: number) => string;
}

export async function runSoulMemoryCapture<TProvider>(
	options: RunSoulMemoryCaptureOptions<TProvider>,
): Promise<CoreSoulMemoryCaptureRunResult> {
	const now = options.now ?? Date.now;
	const preview = options.preview ?? truncateSoulMemoryText;
	const startedAt = now();
	const runId = options
		.hash(
			`capture:${options.sessionId}:${options.assistantMessageId}:${startedAt}`,
		)
		.slice(0, 16);
	const logDiagnostic = (
		event: Omit<CoreSoulMemoryCaptureRunDiagnostic, "subsystem">,
	) => {
		options.logDiagnostic?.({
			subsystem: "capture",
			...event,
		});
	};

	if (!options.enabled || options.capture.mode === "off") {
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
			sessionId: options.sessionId,
			runId,
			summary: "Memory capture is disabled.",
		});
		return {
			status: "skipped",
			explicitIntent: false,
			applied: 0,
			added: 0,
			replaced: 0,
			removed: 0,
			skipped: 0,
		};
	}
	if (
		!options.context.lastUserMessage.trim() ||
		!options.context.lastAssistantMessage.trim()
	) {
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
			sessionId: options.sessionId,
			runId,
			summary: "Missing user or assistant text for capture.",
		});
		return {
			status: "skipped",
			explicitIntent: false,
			applied: 0,
			added: 0,
			replaced: 0,
			removed: 0,
			skipped: 0,
		};
	}

	const explicitIntent = hasExplicitMemoryIntent(
		options.context.lastUserMessage,
	);
	logDiagnostic({
		operation: "after-assistant-response",
		stage: "start",
		status: "started",
		sessionId: options.sessionId,
		runId,
		request: {
			mode: options.capture.mode,
			explicitIntent,
			userHash: options.hash(options.context.lastUserMessage).slice(0, 16),
			userPreview: preview(options.context.lastUserMessage, 180),
			assistantHash: options
				.hash(options.context.lastAssistantMessage)
				.slice(0, 16),
			timeoutMs: options.capture.timeoutMs,
		},
	});
	if (options.capture.mode === "explicit-only" && !explicitIntent) {
		await options.applyStatusMutation(
			planSoulMemoryCaptureRuntimeStatusMutation("skipped"),
		);
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
			sessionId: options.sessionId,
			runId,
			summary:
				"explicit-only capture skipped because no explicit memory intent was detected.",
		});
		return {
			status: "skipped",
			explicitIntent,
			applied: 0,
			added: 0,
			replaced: 0,
			removed: 0,
			skipped: 0,
			lastStatus: "skipped",
		};
	}

	try {
		const input = buildSoulMemoryCaptureInput({
			context: options.context,
			dailyRelativePath: options.dailyRelativePath,
			dailyContent: await options.readDailyContent(),
			maxChars: options.capture.maxInputChars,
		});
		const provider = await options.resolveProvider();
		logDiagnostic({
			operation: "model-classify",
			stage: "request",
			status: "started",
			sessionId: options.sessionId,
			runId,
			request: {
				providerId: provider.providerId,
				model: provider.model,
				modelSource: provider.source,
				inputChars: input.length,
				timeoutMs: options.capture.timeoutMs,
			},
		});
		const output = await withSoulMemoryTimeout(
			options.generateCapture({
				provider: provider.provider,
				system: CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
				prompt: input,
				temperature: 0.1,
				maxTokens: 900,
			}),
			options.capture.timeoutMs,
		);

		const parsed = parseDailyNoteCaptureResult(output);
		if (!parsed || parsed.candidates.length === 0) {
			await options.applyStatusMutation(
				planSoulMemoryCaptureRuntimeStatusMutation("none"),
			);
			logDiagnostic({
				operation: "model-extract",
				stage: "response",
				status: "skipped",
				durationMs: now() - startedAt,
				sessionId: options.sessionId,
				runId,
				response: {
					candidates: 0,
					outputHash: options.hash(output).slice(0, 16),
					outputPreview: preview(output, 240),
				},
				summary: "Capture model returned no daily-note mutations.",
			});
			return {
				status: "none",
				explicitIntent,
				applied: 0,
				added: 0,
				replaced: 0,
				removed: 0,
				skipped: 0,
				lastStatus: "none",
			};
		}

		const daily = await options.applyDailyActions(parsed.candidates);
		if (!daily) {
			await options.applyStatusMutation(
				planSoulMemoryCaptureRuntimeStatusMutation("none"),
			);
			logDiagnostic({
				operation: "daily-note-actions",
				stage: "write",
				status: "skipped",
				durationMs: now() - startedAt,
				sessionId: options.sessionId,
				runId,
				response: {
					candidates: parsed.candidates.length,
					outputHash: options.hash(output).slice(0, 16),
				},
				summary:
					"Capture model returned daily-note mutations but none applied.",
			});
			return {
				status: "none",
				explicitIntent,
				applied: 0,
				added: 0,
				replaced: 0,
				removed: 0,
				skipped: parsed.candidates.length,
				lastStatus: "none",
			};
		}

		const captureStatus = [
			options.capture.mode === "auto" ? "auto-saved" : "daily-saved",
			`daily:add:${daily.added} replace:${daily.replaced} remove:${daily.removed} skipped:${daily.skipped}`,
		].join(" ");
		await options.applyStatusMutation(
			planSoulMemoryCaptureSuccessStatusMutation({
				status: captureStatus,
				capturedAt: now(),
			}),
		);
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "finish",
			status: "ok",
			durationMs: now() - startedAt,
			sessionId: options.sessionId,
			runId,
			response: {
				dailyItems: daily.applied,
				added: daily.added,
				replaced: daily.replaced,
				removed: daily.removed,
				skipped: daily.skipped,
				outputHash: options.hash(output).slice(0, 16),
				status: captureStatus,
			},
		});
		if (explicitIntent) {
			await options.notify?.(
				`Daily note saved to ${daily.relativePath}`,
				"info",
			);
		}
		return {
			status: "saved",
			explicitIntent,
			applied: daily.applied,
			added: daily.added,
			replaced: daily.replaced,
			removed: daily.removed,
			skipped: daily.skipped,
			relativePath: daily.relativePath,
			lastStatus: captureStatus,
		};
	} catch (error) {
		const message = soulMemoryCommandErrorMessage(error);
		await options.applyStatusMutation(
			planSoulMemoryCaptureErrorStatusMutation(message),
		);
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "finish",
			status: "error",
			durationMs: now() - startedAt,
			sessionId: options.sessionId,
			runId,
			error,
		});
		return {
			status: "error",
			explicitIntent,
			applied: 0,
			added: 0,
			replaced: 0,
			removed: 0,
			skipped: 0,
			lastStatus: "error",
			error: message,
		};
	}
}

export interface CoreSoulMemoryExistingMemorySummaryInput {
	memoryContent?: string | null;
	maxMemoryChars?: number;
}

export function buildSoulMemoryExistingMemorySummary(
	input: CoreSoulMemoryExistingMemorySummaryInput,
): string {
	const sections: string[] = [];
	const memoryContent = input.memoryContent?.trim();
	if (memoryContent) {
		sections.push(
			[
				"## Existing MEMORY.md",
				truncateSoulMemoryText(memoryContent, input.maxMemoryChars ?? 12000),
			].join("\n\n"),
		);
	}

	return sections.join("\n\n").trim() || "(empty)";
}

export interface CoreSoulMemoryReviewInput {
	messages: CoreMemoryReviewMessage[];
	soulContent: string;
	dreamsContent: string;
	maxChars: number;
}

export interface BuildSoulMemoryReviewInputWithAdaptersOptions {
	messages: CoreMemoryReviewMessage[];
	maxChars: number;
	readPlain(
		target: CorePlainReviewTarget,
	): CoreMaybePromise<CoreMemoryReviewPlainFile>;
}

export function buildSoulMemoryReviewInput(
	input: CoreSoulMemoryReviewInput,
): string {
	const perMemoryFileMaxChars = Math.max(
		1000,
		Math.min(4000, Math.floor(input.maxChars * 0.16)),
	);
	const existingMemory = [
		"# Existing SOUL.md",
		input.soulContent.trim()
			? truncateSoulMemoryText(input.soulContent.trim(), perMemoryFileMaxChars)
			: "(empty)",
		"",
		"# Existing DREAMS.md",
		input.dreamsContent.trim()
			? truncateSoulMemoryText(
					input.dreamsContent.trim(),
					perMemoryFileMaxChars,
				)
			: "(empty)",
	].join("\n");
	const conversationMaxChars = Math.max(
		2000,
		input.maxChars - existingMemory.length - 1000,
	);
	const conversation = formatMemoryReviewConversation(
		input.messages,
		conversationMaxChars,
	);

	return truncateSoulMemoryText(
		[
			"Review this completed conversation snapshot and the current memory files.",
			"",
			existingMemory,
			"",
			"# Conversation snapshot",
			conversation,
		].join("\n"),
		input.maxChars,
	);
}

export async function buildSoulMemoryReviewInputWithAdapters(
	options: BuildSoulMemoryReviewInputWithAdaptersOptions,
): Promise<string> {
	const [soulMemory, dreamsMemory] = await Promise.all([
		options.readPlain("soul"),
		options.readPlain("dreams"),
	]);
	return buildSoulMemoryReviewInput({
		messages: options.messages,
		soulContent: soulMemory.content,
		dreamsContent: dreamsMemory.content,
		maxChars: options.maxChars,
	});
}

export interface CoreSoulMemoryReviewRunDiagnostic {
	subsystem: "review";
	operation: "after-assistant-response" | "model-review";
	stage: "gate" | "request" | "response" | "finish";
	status: "started" | "ok" | "skipped" | "error";
	durationMs?: number;
	sessionId?: string;
	runId?: string;
	summary?: string;
	request?: Record<string, unknown>;
	response?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	error?: unknown;
}

export interface CoreSoulMemoryReviewProviderRef<TProvider> {
	provider: TProvider;
	providerId: string;
	model: unknown;
	source?: string;
}

export interface CoreSoulMemoryReviewGenerateInput<TProvider> {
	provider: TProvider;
	system: string;
	prompt: string;
	temperature: number;
	maxTokens: number;
}

export interface CoreSoulMemoryReviewRunResult {
	status: "skipped" | "none" | "applied" | "error";
	userTurns: number;
	applied: number;
	skipped: number;
	paths: string[];
	lastStatus?: string;
	error?: string;
}

export interface RunSoulMemoryReviewOptions<TProvider> {
	sessionId: string;
	assistantMessageId: string;
	agentId: string;
	keyPrefix?: string;
	messages: CoreMemoryReviewMessage[];
	lastUserMessage: string;
	lastAssistantMessage: string;
	enabled: boolean;
	review: CoreSoulMemoryReviewSettings;
	force?: boolean;
	lastReviewedTurn?: number;
	hash: (value: string) => string;
	readPlain: (
		target: CorePlainReviewTarget,
	) => CoreMaybePromise<CoreMemoryReviewPlainFile>;
	resolveProvider: () => CoreMaybePromise<
		CoreSoulMemoryReviewProviderRef<TProvider>
	>;
	generateReview: (
		input: CoreSoulMemoryReviewGenerateInput<TProvider>,
	) => CoreMaybePromise<string>;
	applyCandidate: (
		candidate: CoreMemoryReviewCandidate,
		minConfidence: number,
	) => CoreMaybePromise<CoreMemoryReviewApplyResult>;
	applyStatusMutation: (
		plan: CoreSoulMemoryStatusMutationPlan,
	) => CoreMaybePromise<void>;
	notify?: (
		message: string,
		level?: "info" | "warn" | "error",
	) => CoreMaybePromise<void>;
	logDiagnostic?: (event: CoreSoulMemoryReviewRunDiagnostic) => void;
	now?: () => number;
}

async function withSoulMemoryTimeout<T>(
	promise: CoreMaybePromise<T>,
	timeoutMs: number,
	timeoutErrorMessage = "timeout",
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.resolve(promise),
			new Promise<T>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(timeoutErrorMessage)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function runSoulMemoryReview<TProvider>(
	options: RunSoulMemoryReviewOptions<TProvider>,
): Promise<CoreSoulMemoryReviewRunResult> {
	const now = options.now ?? Date.now;
	const startedAt = now();
	const runId = options
		.hash(
			`review:${options.sessionId}:${options.assistantMessageId}:${startedAt}`,
		)
		.slice(0, 16);
	const progress = getMemoryReviewProgress({
		messages: options.messages,
		interval: options.review.interval,
		lastReviewedTurn: options.lastReviewedTurn,
	});
	const lastTurnKey = memoryReviewLastTurnKey(
		options.keyPrefix ?? CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX,
		options.agentId,
		options.sessionId,
	);
	const logDiagnostic = (
		event: Omit<CoreSoulMemoryReviewRunDiagnostic, "subsystem">,
	) => {
		options.logDiagnostic?.({
			subsystem: "review",
			...event,
		});
	};

	if (
		!options.enabled ||
		!options.review.enabled ||
		options.review.interval <= 0 ||
		(!options.force && !progress.shouldReview)
	) {
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
			sessionId: options.sessionId,
			runId,
			request: {
				enabled: options.enabled && options.review.enabled,
				interval: options.review.interval,
				userTurns: progress.userTurns,
				turnsUntilReview: progress.turnsUntilReview,
				lastReviewedTurn: options.lastReviewedTurn,
				force: options.force === true,
			},
		});
		return {
			status: "skipped",
			userTurns: progress.userTurns,
			applied: 0,
			skipped: 0,
			paths: [],
		};
	}

	if (!options.lastUserMessage.trim() || !options.lastAssistantMessage.trim()) {
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "gate",
			status: "skipped",
			sessionId: options.sessionId,
			runId,
			summary: "Missing user or assistant text for review.",
		});
		return {
			status: "skipped",
			userTurns: progress.userTurns,
			applied: 0,
			skipped: 0,
			paths: [],
		};
	}

	await options.applyStatusMutation(
		planSoulMemoryReviewTurnStatusMutation({
			lastTurnKey,
			userTurns: progress.userTurns,
		}),
	);

	try {
		const input = await buildSoulMemoryReviewInputWithAdapters({
			messages: options.messages,
			maxChars: options.review.maxInputChars,
			readPlain: options.readPlain,
		});
		const provider = await options.resolveProvider();
		logDiagnostic({
			operation: "model-review",
			stage: "request",
			status: "started",
			sessionId: options.sessionId,
			runId,
			request: {
				providerId: provider.providerId,
				model: provider.model,
				modelSource: provider.source,
				inputChars: input.length,
				userTurns: progress.userTurns,
				interval: options.review.interval,
				timeoutMs: options.review.timeoutMs,
				force: options.force === true,
			},
		});
		const output = await withSoulMemoryTimeout(
			options.generateReview({
				provider: provider.provider,
				system: CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
				prompt: input,
				temperature: 0.1,
				maxTokens: 900,
			}),
			options.review.timeoutMs,
		);

		const parsed = parseMemoryReviewModelResult(output);
		if (!parsed || parsed.confidence < options.review.minConfidence) {
			await options.applyStatusMutation(
				planSoulMemoryReviewNoneStatusMutation({ runAt: now() }),
			);
			logDiagnostic({
				operation: "model-review",
				stage: "response",
				status: "skipped",
				durationMs: now() - startedAt,
				sessionId: options.sessionId,
				runId,
				response: {
					parsed: Boolean(parsed),
					confidence: parsed?.confidence ?? 0,
					outputHash: options.hash(output).slice(0, 16),
				},
				summary: "Review model returned no memory changes above threshold.",
			});
			return {
				status: "none",
				userTurns: progress.userTurns,
				applied: 0,
				skipped: 0,
				paths: [],
				lastStatus: "none",
			};
		}

		let applied = 0;
		let skipped = 0;
		const paths = new Set<string>();
		for (const candidate of parsed.candidates.slice(
			0,
			options.review.maxCandidates,
		)) {
			const result = await options.applyCandidate(
				candidate,
				options.review.minConfidence,
			);
			if (result.changed) {
				applied += 1;
				if (result.relativePath) paths.add(result.relativePath);
			} else if (result.skipped) {
				skipped += 1;
			}
		}

		await options.applyStatusMutation(
			planSoulMemoryReviewAppliedStatusMutation({
				runAt: now(),
				applied,
				skipped,
				userTurns: progress.userTurns,
			}),
		);
		const lastStatus = `applied:${applied} skipped:${skipped} turn:${progress.userTurns}`;
		const changedPaths = Array.from(paths);
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "finish",
			status: "ok",
			durationMs: now() - startedAt,
			sessionId: options.sessionId,
			runId,
			response: {
				applied,
				skipped,
				candidates: parsed.candidates.length,
				paths: changedPaths,
				userTurns: progress.userTurns,
			},
		});
		if (applied > 0) {
			await options.notify?.(
				`Memory Review saved ${applied} update${applied === 1 ? "" : "s"} to ${changedPaths.join(", ")}`,
				"info",
			);
		}
		return {
			status: "applied",
			userTurns: progress.userTurns,
			applied,
			skipped,
			paths: changedPaths,
			lastStatus,
		};
	} catch (error) {
		const message = soulMemoryCommandErrorMessage(error);
		await options.applyStatusMutation(
			planSoulMemoryReviewErrorStatusMutation({
				errorMessage: message,
				runAt: now(),
			}),
		);
		logDiagnostic({
			operation: "after-assistant-response",
			stage: "finish",
			status: "error",
			durationMs: now() - startedAt,
			sessionId: options.sessionId,
			runId,
			error,
		});
		return {
			status: "error",
			userTurns: progress.userTurns,
			applied: 0,
			skipped: 0,
			paths: [],
			lastStatus: "error",
			error: message,
		};
	}
}

export function dedupeSoulMemoryCaptureLines(
	existingText: string,
	lines: string[],
): string[] {
	const existingKeys = new Set(
		existingText
			.split(/\r?\n/)
			.map(normalizeSoulMemoryForDedupe)
			.filter(Boolean),
	);
	return lines.filter((line) => {
		const key = normalizeSoulMemoryForDedupe(line);
		if (!key || existingKeys.has(key)) return false;
		existingKeys.add(key);
		return true;
	});
}

export function dedupeSoulMemoryDailyNoteBullets(
	existingText: string,
	bullets: string[],
): string[] {
	return dedupeSoulMemoryCaptureLines(
		existingText,
		bullets.map((line) => soulMemoryAsBullet(line)),
	)
		.map((line) => normalizeSoulMemoryBulletText(line))
		.filter(Boolean);
}

export function normalizeSoulMemoryRelativePath(relativePath: string): string {
	return relativePath.replace(/\\/g, "/");
}

export function isSoulMemoryManagedRelativePath(relativePath: string): boolean {
	const normalized = normalizeSoulMemoryRelativePath(relativePath);
	return (
		normalized === "SOUL.md" ||
		normalized === "USER.md" ||
		normalized === "MEMORY.md" ||
		normalized === "DREAMS.md" ||
		normalized.startsWith("daily/") ||
		normalized.startsWith("memory/")
	);
}

export function assertSoulMemoryAccessibleRelativePath(
	relativePath: string,
	options: { allowDreams?: boolean } = {},
): string {
	const normalized = normalizeSoulMemoryRelativePath(relativePath);
	if (options.allowDreams && normalized === "DREAMS.md") {
		return normalized;
	}
	if (
		normalized !== "USER.md" &&
		normalized !== "MEMORY.md" &&
		!normalized.startsWith("daily/") &&
		!normalized.startsWith("memory/")
	) {
		throw new Error(
			"Only USER.md, MEMORY.md, and files under daily/ can be accessed",
		);
	}
	return normalized;
}

export interface CoreSoulMemoryWorkspaceSettingsLike {
	directoryMode?: string;
	customDirectory?: string;
}

export interface CoreSoulMemoryWorkspacePathPlanInput {
	settings: CoreSoulMemoryWorkspaceSettingsLike;
	agentId?: string;
	defaultAgentId: string;
	agentsDir: string;
	storePath: string;
	aiNoteDir: string;
	expandPath?: (value: string) => string;
	today?: Date;
}

export interface CoreSoulMemoryWorkspacePathPlan {
	agentId: string;
	root: string;
	memoryDir: string;
	soulPath: string;
	userPath: string;
	memoryPath: string;
	dreamsPath: string;
	todayPath: string;
	dbPath: string;
}

export function sanitizeSoulMemoryAgentPathSegment(
	agentId: string,
	defaultAgentId: string,
): string {
	return agentId.replace(/[^a-zA-Z0-9_-]/g, "_") || defaultAgentId;
}

export function resolveSoulMemoryRootPath(options: {
	settings: CoreSoulMemoryWorkspaceSettingsLike;
	agentId?: string;
	defaultAgentId: string;
	agentsDir: string;
	aiNoteDir: string;
	expandPath?: (value: string) => string;
}): string {
	const agentId = options.agentId || options.defaultAgentId;
	const expand = options.expandPath ?? ((value) => value);
	if (agentId !== options.defaultAgentId) {
		return path.join(
			options.agentsDir,
			sanitizeSoulMemoryAgentPathSegment(agentId, options.defaultAgentId),
		);
	}
	if (
		options.settings.directoryMode === "custom" &&
		options.settings.customDirectory?.trim()
	) {
		return path.resolve(expand(options.settings.customDirectory.trim()));
	}
	return path.resolve(expand(options.aiNoteDir || "~/.onething/memory"));
}

export function planSoulMemoryWorkspacePaths(
	input: CoreSoulMemoryWorkspacePathPlanInput,
): CoreSoulMemoryWorkspacePathPlan {
	const agentId = input.agentId || input.defaultAgentId;
	const root = resolveSoulMemoryRootPath({
		settings: input.settings,
		agentId,
		defaultAgentId: input.defaultAgentId,
		agentsDir: input.agentsDir,
		aiNoteDir: input.aiNoteDir,
		expandPath: input.expandPath,
	});
	const memoryDir = path.join(root, "daily");
	const today = formatSoulMemoryDateString(input.today ?? new Date());
	const dataDir =
		agentId === input.defaultAgentId
			? path.join(input.storePath, "plugin-data")
			: path.join(root, "plugin-data");
	return {
		agentId,
		root,
		memoryDir,
		soulPath: path.join(root, "SOUL.md"),
		userPath: path.join(root, "USER.md"),
		memoryPath: path.join(root, "MEMORY.md"),
		dreamsPath: path.join(root, "DREAMS.md"),
		todayPath: path.join(memoryDir, `${today}.md`),
		dbPath: path.join(dataDir, "soul-memory.sqlite"),
	};
}

/**
 * User memory notes workspace for channel-user sessions.
 * Only produces MEMORY.md + daily/ notes; no SOUL/DREAMS/sqlite.
 * The shared SOUL.md is mounted read-only for review context injection.
 */
export interface CoreUserMemoryNotesPathPlan {
	/** The shared memory root (e.g. ~/.onething/memory). */
	memoryRoot: string;
	/** Resolved root for this user: <memoryRoot>/users/<userId>. */
	root: string;
	/** Daily notes directory: <root>/daily. */
	memoryDir: string;
	/** User MEMORY.md (long-term memory + profile). */
	userPath: string;
	/** Same as userPath — user memory is user profile for channel users. */
	memoryPath: string;
	/** Path to today's daily note. */
	todayPath: string;
	/** Shared SOUL.md (read-only reference for review context). */
	soulPath: string;
	/** No dreams for channel users. */
	dreamsPath: string;
	/** No sqlite for channel users. */
	dbPath: string;
	/** The userId (profile id). */
	userId: string;
}

export function planUserMemoryNotesPaths({
	memoryRoot,
	userId,
	today,
}: {
	memoryRoot: string;
	userId: string;
	today?: Date;
}): CoreUserMemoryNotesPathPlan {
	const root = path.join(memoryRoot, "users", userId);
	const memoryDir = path.join(root, "daily");
	const todayStr = formatSoulMemoryDateString(today ?? new Date());
	return {
		memoryRoot,
		root,
		memoryDir,
		userPath: path.join(root, "MEMORY.md"),
		memoryPath: path.join(root, "MEMORY.md"),
		todayPath: path.join(memoryDir, `${todayStr}.md`),
		soulPath: path.join(memoryRoot, "SOUL.md"),
		dreamsPath: "",
		dbPath: "",
		userId,
	};
}

/** Build a MemoryWorkspace-compatible object for channel-user sessions. */
export function buildUserMemoryWorkspace(options: {
	memoryRoot: string;
	userId: string;
	today?: Date;
}): Omit<CoreUserMemoryNotesPathPlan, "memoryRoot" | "userId"> & {
	memoryRoot: string;
	userId: string;
} {
	const plan = planUserMemoryNotesPaths(options);
	return {
		memoryRoot: plan.memoryRoot,
		userId: plan.userId,
		root: plan.root,
		memoryDir: plan.memoryDir,
		userPath: plan.userPath,
		memoryPath: plan.memoryPath,
		todayPath: plan.todayPath,
		soulPath: plan.soulPath,
		dreamsPath: plan.dreamsPath,
		dbPath: plan.dbPath,
	};
}

export interface CoreSoulMemoryResolvedPath {
	absolutePath: string;
	relativePath: string;
}

export interface CoreSoulMemoryPlainReviewResolvedPath {
	absolutePath: string;
	relativePath: "SOUL.md" | "DREAMS.md";
}

export interface CoreSoulMemoryResolvePathOptions {
	root: string;
	inputPath: string;
	allowDreams?: boolean;
}

function expandSoulMemoryPath(inputPath: string): string {
	if (inputPath.startsWith("~")) {
		return path.join(os.homedir(), inputPath.slice(1));
	}
	return inputPath;
}

function isSoulMemoryPathContained(root: string, targetPath: string): boolean {
	const resolvedRoot = path.resolve(root);
	const resolvedTarget = path.resolve(targetPath);
	return (
		resolvedTarget === resolvedRoot ||
		resolvedTarget.startsWith(resolvedRoot + path.sep)
	);
}

export function resolveSoulMemoryFilePath(
	options: CoreSoulMemoryResolvePathOptions,
): CoreSoulMemoryResolvedPath {
	const expanded = expandSoulMemoryPath(options.inputPath);
	const absolutePath = path.isAbsolute(expanded)
		? path.resolve(expanded)
		: path.resolve(options.root, options.inputPath);
	if (!isSoulMemoryPathContained(options.root, absolutePath)) {
		throw new Error("Path is outside the configured memory directory");
	}
	const relativePath = path.relative(options.root, absolutePath);
	return {
		absolutePath,
		relativePath: assertSoulMemoryAccessibleRelativePath(relativePath, {
			allowDreams: options.allowDreams,
		}),
	};
}

export function resolveSoulMemoryManagedFilePath(
	options: Omit<CoreSoulMemoryResolvePathOptions, "allowDreams">,
): CoreSoulMemoryResolvedPath {
	const expanded = expandSoulMemoryPath(options.inputPath);
	const absolutePath = path.isAbsolute(expanded)
		? path.resolve(expanded)
		: path.resolve(options.root, options.inputPath);
	if (!isSoulMemoryPathContained(options.root, absolutePath)) {
		throw new Error("Path is outside the configured memory directory");
	}
	const relativePath = normalizeSoulMemoryRelativePath(
		path.relative(options.root, absolutePath),
	);
	if (isSoulMemoryManagedRelativePath(relativePath)) {
		return { absolutePath, relativePath };
	}
	throw new Error(
		"Only SOUL.md, USER.md, MEMORY.md, DREAMS.md, and files under memory/ can be accessed",
	);
}

export interface CoreSoulMemoryPlainReviewFilePathOptions {
	soulPath: string;
	dreamsPath: string;
	target: CorePlainReviewTarget;
}

export function resolveSoulMemoryPlainReviewFilePath(
	options: CoreSoulMemoryPlainReviewFilePathOptions,
): CoreSoulMemoryPlainReviewResolvedPath {
	return options.target === "soul"
		? { absolutePath: options.soulPath, relativePath: "SOUL.md" }
		: { absolutePath: options.dreamsPath, relativePath: "DREAMS.md" };
}

export interface CoreSoulMemoryAppendTargetOptions {
	root: string;
	memoryPath: string;
	todayPath: string;
	target?: "daily" | "memory";
	filePath?: string;
}

export function resolveSoulMemoryAppendTarget(
	options: CoreSoulMemoryAppendTargetOptions,
): CoreSoulMemoryResolvedPath {
	const target = options.filePath
		? resolveSoulMemoryFilePath({
				root: options.root,
				inputPath: options.filePath,
			})
		: {
				absolutePath:
					options.target === "memory" ? options.memoryPath : options.todayPath,
				relativePath:
					options.target === "memory"
						? "MEMORY.md"
						: normalizeSoulMemoryRelativePath(
								path.relative(options.root, options.todayPath),
							),
			};

	if (target.relativePath === "MEMORY.md") {
		throw new Error(
			"MEMORY.md is a legacy compatibility file. Append AI notes to the daily memory file instead.",
		);
	}

	return target;
}

export interface CoreSoulMemoryAppendPayloadOptions {
	relativePath: string;
	content: string;
	heading?: string;
	exists: boolean;
	now?: Date;
}

export interface CoreSoulMemoryAppendPayload {
	heading: string;
	content: string;
	text: string;
}

export interface CoreSoulMemoryDailyNoteAppendPlanOptions {
	bullets: readonly string[];
	heading?: string;
	now?: Date;
}

export interface CoreSoulMemoryDailyNoteAppendPlan {
	heading: string;
	content: string;
}

export function planSoulMemoryDailyNoteAppend(
	options: CoreSoulMemoryDailyNoteAppendPlanOptions,
): CoreSoulMemoryDailyNoteAppendPlan | null {
	const bullets = options.bullets
		.map((line) => soulMemoryAsBullet(line))
		.filter(Boolean);
	if (bullets.length === 0) return null;
	return {
		heading: options.heading || dailyNoteTimeHeading(options.now),
		content: bullets.join("\n"),
	};
}

export function buildSoulMemoryAppendPayload(
	options: CoreSoulMemoryAppendPayloadOptions,
): CoreSoulMemoryAppendPayload {
	const content = options.content.trim();
	if (!content) throw new Error("Memory content is empty");

	const heading =
		options.heading || (options.now ?? new Date()).toLocaleString();
	const normalizedRelativePath = normalizeSoulMemoryRelativePath(
		options.relativePath,
	);
	const newDailyPrefix =
		!options.exists &&
		(normalizedRelativePath.startsWith("daily/") ||
			normalizedRelativePath.startsWith("memory/"))
			? `# ${path.basename(normalizedRelativePath, ".md")}\n\n`
			: "\n";

	return {
		heading,
		content,
		text: `${newDailyPrefix}## ${heading}\n\n${content}\n`,
	};
}

export interface CoreSoulMemoryManagedFileInput {
	absolutePath: string;
	relativePath: string;
	kind: CoreMemoryManagedFileKind;
	date?: string;
	size: number;
	mtimeMs: number;
	content: string;
	lineCount?: number;
	maxPreviewChars?: number;
}

export interface CoreSoulMemoryManagedFile {
	absolutePath: string;
	relativePath: string;
	kind: CoreMemoryManagedFileKind;
	date?: string;
	size: number;
	mtimeMs: number;
	lineCount: number;
	preview: string;
}

export interface CoreSoulMemoryManagedFileCandidate {
	absolutePath: string;
	relativePath: string;
	kind: CoreMemoryManagedFileKind;
	date?: string;
}

export interface CoreSoulMemoryManagedFileCandidatesOptions {
	soulPath: string;
	userPath: string;
	memoryPath: string;
	dreamsPath: string;
	indexedFiles: Array<{
		absolutePath: string;
		relativePath: string;
		kind: string;
		date?: string;
	}>;
}

export interface CoreSoulMemoryManagedFileStat {
	isFile?: () => boolean;
	size: number;
	mtimeMs: number;
}

export interface ListSoulMemoryManagedFilesWithAdaptersOptions
	extends CoreSoulMemoryManagedFileCandidatesOptions {
	statFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<CoreSoulMemoryManagedFileStat | null | undefined>;
	countLines?: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<number>;
	readFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<string>;
	readPreviewFile?: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
		maxChars: number,
	) => CoreMaybePromise<string>;
}

export interface DescribeSoulMemoryManagedFileWithAdaptersOptions
	extends CoreSoulMemoryManagedFileCandidate {
	statFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<CoreSoulMemoryManagedFileStat | null | undefined>;
	countLines?: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<number>;
	readFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<string>;
	readPreviewFile?: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
		maxChars: number,
	) => CoreMaybePromise<string>;
}

export interface SaveSoulMemoryManagedFileWithAdaptersOptions {
	root: string;
	inputPath?: string;
	content: string;
	writeFile: (
		absolutePath: string,
		content: string,
		target: CoreSoulMemoryResolvedPath,
	) => CoreMaybePromise<void>;
	statFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<CoreSoulMemoryManagedFileStat | null | undefined>;
	readFile: (
		absolutePath: string,
		candidate: CoreSoulMemoryManagedFileCandidate,
	) => CoreMaybePromise<string>;
}

export function buildSoulMemoryManagedFileCandidates(
	options: CoreSoulMemoryManagedFileCandidatesOptions,
): CoreSoulMemoryManagedFileCandidate[] {
	return [
		{ absolutePath: options.soulPath, relativePath: "SOUL.md", kind: "soul" },
		{ absolutePath: options.userPath, relativePath: "USER.md", kind: "user" },
		{
			absolutePath: options.memoryPath,
			relativePath: "MEMORY.md",
			kind: "memory",
		},
		{
			absolutePath: options.dreamsPath,
			relativePath: "DREAMS.md",
			kind: "dreams",
		},
		...options.indexedFiles
			.filter((file) => file.kind === "daily")
			.map((file) => ({
				absolutePath: file.absolutePath,
				relativePath: normalizeSoulMemoryRelativePath(file.relativePath),
				kind: "daily" as const,
				...(file.date ? { date: file.date } : {}),
			})),
	];
}

export function resolveSoulMemoryManagedFileMetadata(
	relativePath: string,
): Pick<CoreSoulMemoryManagedFileCandidate, "relativePath" | "kind" | "date"> {
	const normalized = normalizeSoulMemoryRelativePath(relativePath);
	const kind: CoreMemoryManagedFileKind =
		normalized === "SOUL.md"
			? "soul"
			: normalized === "USER.md"
				? "user"
				: normalized === "MEMORY.md"
					? "memory"
					: normalized === "DREAMS.md"
						? "dreams"
						: "daily";
	const date =
		kind === "daily" ? normalized.match(/(\d{4}-\d{2}-\d{2})/)?.[1] : undefined;
	return {
		relativePath: normalized,
		kind,
		...(date ? { date } : {}),
	};
}

export function describeSoulMemoryManagedFile(
	input: CoreSoulMemoryManagedFileInput,
): CoreSoulMemoryManagedFile {
	const content = input.content;
	const lineCount =
		input.lineCount ??
		(content.length === 0 ? 0 : content.split(/\r?\n/).length);
	const previewSource = content
		.replace(/^#\s+[^\n]+\n+/, "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 6)
		.join(" ");
	return {
		absolutePath: input.absolutePath,
		relativePath: normalizeSoulMemoryRelativePath(input.relativePath),
		kind: input.kind,
		...(input.date ? { date: input.date } : {}),
		size: input.size,
		mtimeMs: input.mtimeMs,
		lineCount,
		preview: truncateSoulMemoryText(
			previewSource || content.trim(),
			input.maxPreviewChars ?? 360,
		),
	};
}

export async function describeSoulMemoryManagedFileWithAdapters(
	options: DescribeSoulMemoryManagedFileWithAdaptersOptions,
): Promise<CoreSoulMemoryManagedFile | null> {
	const candidate: CoreSoulMemoryManagedFileCandidate = {
		absolutePath: options.absolutePath,
		relativePath: options.relativePath,
		kind: options.kind,
		...(options.date ? { date: options.date } : {}),
	};
	const stat = await Promise.resolve(
		options.statFile(options.absolutePath, candidate),
	).catch(() => null);
	if (!stat || stat.isFile?.() === false) return null;

	const previewReadChars = 8_192;
	const content = await Promise.resolve(
		options.readPreviewFile
			? options.readPreviewFile(
					options.absolutePath,
					candidate,
					previewReadChars,
				)
			: options.readFile(options.absolutePath, candidate),
	).catch(() => "");
	const lineCount =
		options.readPreviewFile && options.countLines
			? await Promise.resolve(
					options.countLines(options.absolutePath, candidate),
				).catch(() => undefined)
			: undefined;
	return describeSoulMemoryManagedFile({
		absolutePath: options.absolutePath,
		relativePath: options.relativePath,
		kind: options.kind,
		...(options.date ? { date: options.date } : {}),
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		content,
		...(typeof lineCount === "number" ? { lineCount } : {}),
	});
}

export async function listSoulMemoryManagedFilesWithAdapters(
	options: ListSoulMemoryManagedFilesWithAdaptersOptions,
): Promise<CoreSoulMemoryManagedFile[]> {
	const candidates = buildSoulMemoryManagedFileCandidates(options);
	const files = await Promise.all(
		candidates.map((candidate) =>
			describeSoulMemoryManagedFileWithAdapters({
				...candidate,
				statFile: options.statFile,
				countLines: options.countLines,
				readFile: options.readFile,
				readPreviewFile: options.readPreviewFile,
			}),
		),
	);

	return sortManagedMemoryFiles(
		files.filter((file): file is CoreSoulMemoryManagedFile => Boolean(file)),
	);
}

export async function saveSoulMemoryManagedFileWithAdapters(
	options: SaveSoulMemoryManagedFileWithAdaptersOptions,
): Promise<CoreSoulMemoryManagedFile> {
	if (!options.inputPath?.trim())
		throw new Error("Memory file path is required");
	const target = resolveSoulMemoryManagedFilePath({
		root: options.root,
		inputPath: options.inputPath,
	});
	const content = `${options.content.replace(/\s+$/u, "")}\n`;
	await Promise.resolve(
		options.writeFile(target.absolutePath, content, target),
	);

	const metadata = resolveSoulMemoryManagedFileMetadata(target.relativePath);
	const described = await describeSoulMemoryManagedFileWithAdapters({
		absolutePath: target.absolutePath,
		...metadata,
		statFile: options.statFile,
		readFile: options.readFile,
	});
	if (!described)
		throw new Error(`Saved file could not be read: ${target.relativePath}`);
	return described;
}

export interface CoreSoulMemoryFileExcerptOptions {
	relativePath: string;
	content: string;
	startLine?: number;
	endLine?: number;
	lines?: number;
	full?: boolean;
	defaultLines: number;
	maxLines: number;
}

export interface ReadSoulMemoryManagedFileExcerptWithAdaptersOptions
	extends Omit<CoreSoulMemoryFileExcerptOptions, "relativePath" | "content"> {
	root: string;
	inputPath: string;
	readFile: (
		absolutePath: string,
		target: CoreSoulMemoryResolvedPath,
	) => CoreMaybePromise<string>;
}

export interface ReadSoulMemoryManagedFileWithAdaptersOptions
	extends Omit<
		ReadSoulMemoryManagedFileExcerptWithAdaptersOptions,
		"inputPath"
	> {
	inputPath?: string;
}

export interface CoreSoulMemoryFileExcerpt {
	relativePath: string;
	text: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
}

export function readSoulMemoryFileExcerptFromContent(
	options: CoreSoulMemoryFileExcerptOptions,
): CoreSoulMemoryFileExcerpt {
	const allLines = options.content.split(/\r?\n/);
	const startLine = Math.max(1, options.startLine || 1);
	const requestedLines = options.full
		? allLines.length
		: options.lines ||
			(options.endLine
				? Math.max(1, options.endLine - startLine + 1)
				: options.defaultLines);
	const maxLines = options.full ? allLines.length : options.maxLines;
	const lineCount = Math.max(1, Math.min(maxLines, requestedLines));
	const startIndex = Math.min(allLines.length, startLine - 1);
	const endIndex = Math.min(allLines.length, startIndex + lineCount);
	const explicitEnd = options.endLine
		? Math.min(allLines.length, options.endLine)
		: endIndex;
	const effectiveEndIndex = Math.min(endIndex, explicitEnd);
	return {
		relativePath: normalizeSoulMemoryRelativePath(options.relativePath),
		text: allLines.slice(startIndex, effectiveEndIndex).join("\n"),
		startLine: startIndex + 1,
		endLine: effectiveEndIndex,
		totalLines: allLines.length,
		truncated: effectiveEndIndex < allLines.length,
	};
}

export async function readSoulMemoryManagedFileExcerptWithAdapters(
	options: ReadSoulMemoryManagedFileExcerptWithAdaptersOptions,
): Promise<CoreSoulMemoryFileExcerpt> {
	const target = resolveSoulMemoryManagedFilePath({
		root: options.root,
		inputPath: options.inputPath,
	});
	const content = await options.readFile(target.absolutePath, target);
	return readSoulMemoryFileExcerptFromContent({
		relativePath: target.relativePath,
		content,
		startLine: options.startLine,
		endLine: options.endLine,
		lines: options.lines,
		full: options.full,
		defaultLines: options.defaultLines,
		maxLines: options.maxLines,
	});
}

export async function readSoulMemoryManagedFileWithAdapters(
	options: ReadSoulMemoryManagedFileWithAdaptersOptions,
): Promise<CoreSoulMemoryFileExcerpt> {
	if (!options.inputPath?.trim())
		throw new Error("Memory file path is required");
	return readSoulMemoryManagedFileExcerptWithAdapters({
		...options,
		inputPath: options.inputPath,
	});
}

export interface CoreSoulMemoryCapturePending {
	id: string;
	sessionId: string;
	agentId?: string;
	createdAt: number;
	target: "daily" | "memory";
	heading: string;
	content: string;
	confidence: number;
	explicit: boolean;
	reason?: string;
	userPreview: string;
	assistantPreview: string;
}

export interface CoreSoulMemoryCaptureStore {
	get<T>(key: string): T | undefined;
	set<T>(key: string, value: T): void;
}

export interface CoreSoulMemoryPendingCaptureOptions {
	key: string;
	maxPending: number;
}

export interface CoreSoulMemoryPublicPendingCaptureOptions
	extends CoreSoulMemoryPendingCaptureOptions {
	agentId?: string;
	defaultAgentId: string;
}

export interface CoreSoulMemoryPendingCaptureTakeOptions
	extends CoreSoulMemoryPendingCaptureOptions {
	id?: string;
}

export interface CoreSoulMemoryPendingCaptureTakePlan {
	selected: CoreSoulMemoryCapturePending;
	remaining: CoreSoulMemoryCapturePending[];
}

export type CoreSoulMemoryPendingCaptureMutationStore = Pick<
	CoreSoulMemoryCaptureStore,
	"get" | "set"
> &
	CoreSoulMemoryStatusStoreWriter;

export interface CoreSoulMemoryPendingCaptureSaveOptions<TResult>
	extends CoreSoulMemoryPendingCaptureTakeOptions {
	store: CoreSoulMemoryPendingCaptureMutationStore;
	runtimeStatus?: CoreSoulMemoryRuntimeStatus;
	saveSelectedCapture: (
		capture: CoreSoulMemoryCapturePending,
	) => CoreMaybePromise<TResult>;
}

export interface CoreSoulMemoryPendingCaptureDiscardOptions
	extends CoreSoulMemoryPendingCaptureTakeOptions {
	store: CoreSoulMemoryPendingCaptureMutationStore;
	runtimeStatus?: CoreSoulMemoryRuntimeStatus;
}

export function normalizeSoulMemoryPendingCaptures(
	value: unknown,
	maxPending: number,
): CoreSoulMemoryCapturePending[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is CoreSoulMemoryCapturePending =>
			Boolean(
				item && typeof item.id === "string" && typeof item.content === "string",
			),
		)
		.sort((left, right) => right.createdAt - left.createdAt)
		.slice(0, maxPending);
}

export function getSoulMemoryPendingCaptures(
	storeLike: Pick<CoreSoulMemoryCaptureStore, "get">,
	options: CoreSoulMemoryPendingCaptureOptions,
): CoreSoulMemoryCapturePending[] {
	return normalizeSoulMemoryPendingCaptures(
		storeLike.get<CoreSoulMemoryCapturePending[]>(options.key),
		options.maxPending,
	);
}

export function setSoulMemoryPendingCaptures(
	storeLike: Pick<CoreSoulMemoryCaptureStore, "set">,
	captures: CoreSoulMemoryCapturePending[],
	options: CoreSoulMemoryPendingCaptureOptions,
): void {
	storeLike.set(options.key, captures.slice(0, options.maxPending));
}

export function filterSoulMemoryPendingCapturesForAgent(
	captures: CoreSoulMemoryCapturePending[],
	agentId: string | undefined,
	defaultAgentId: string,
): CoreSoulMemoryCapturePending[] {
	const resolvedAgentId = agentId || defaultAgentId;
	return captures.filter(
		(capture) => (capture.agentId || defaultAgentId) === resolvedAgentId,
	);
}

export function selectSoulMemoryPendingCapture(
	captures: CoreSoulMemoryCapturePending[],
	id?: string,
): CoreSoulMemoryCapturePending {
	const selected = id
		? captures.find((capture) => capture.id === id)
		: captures[0];
	if (!selected) throw new Error("No pending memory capture found");
	return selected;
}

export function removeSoulMemoryPendingCapture(
	captures: CoreSoulMemoryCapturePending[],
	selectedId: string,
): CoreSoulMemoryCapturePending[] {
	return captures.filter((capture) => capture.id !== selectedId);
}

export function getSoulMemoryPublicPendingCaptures(
	storeLike: Pick<CoreSoulMemoryCaptureStore, "get">,
	options: CoreSoulMemoryPublicPendingCaptureOptions,
): CoreSoulMemoryCapturePending[] {
	return filterSoulMemoryPendingCapturesForAgent(
		getSoulMemoryPendingCaptures(storeLike, options),
		options.agentId,
		options.defaultAgentId,
	);
}

export function takeSoulMemoryPendingCapture(
	storeLike: Pick<CoreSoulMemoryCaptureStore, "get">,
	options: CoreSoulMemoryPendingCaptureTakeOptions,
): CoreSoulMemoryPendingCaptureTakePlan {
	const captures = getSoulMemoryPendingCaptures(storeLike, options);
	const selected = selectSoulMemoryPendingCapture(captures, options.id);
	return {
		selected,
		remaining: removeSoulMemoryPendingCapture(captures, selected.id),
	};
}

export async function saveSoulMemoryPendingCaptureWithAdapters<TResult>(
	options: CoreSoulMemoryPendingCaptureSaveOptions<TResult>,
): Promise<TResult> {
	const plan = takeSoulMemoryPendingCapture(options.store, options);
	const target = await options.saveSelectedCapture(plan.selected);
	setSoulMemoryPendingCaptures(options.store, plan.remaining, options);
	applySoulMemoryStatusMutationPlan({
		store: options.store,
		runtimeStatus: options.runtimeStatus,
		plan: planSoulMemoryCaptureSuccessStatusMutation({ status: "approved" }),
	});
	return target;
}

export function discardSoulMemoryPendingCaptureWithAdapters(
	options: CoreSoulMemoryPendingCaptureDiscardOptions,
): CoreSoulMemoryCapturePending {
	const plan = takeSoulMemoryPendingCapture(options.store, options);
	setSoulMemoryPendingCaptures(options.store, plan.remaining, options);
	applySoulMemoryStatusMutationPlan({
		store: options.store,
		runtimeStatus: options.runtimeStatus,
		plan: planSoulMemoryCaptureDiscardStatusMutation(),
	});
	return plan.selected;
}

export interface CoreSoulMemoryProviderConfigLike {
	model?: string;
	selectedModels?: string[];
	[key: string]: unknown;
}

export interface CoreSoulMemoryCustomProviderLike
	extends CoreSoulMemoryProviderConfigLike {
	id: string;
}

export interface CoreSoulMemoryProviderSelectionSettings {
	ai: {
		provider?: string;
		providers: Record<string, CoreSoulMemoryProviderConfigLike | undefined>;
		customProviders?: CoreSoulMemoryCustomProviderLike[];
	};
	tools?: {
		toolCallModel?: {
			providerId?: string;
			model?: string;
		};
	};
}

export interface CoreSoulMemoryToolProviderSelection {
	providerId: string;
	config: CoreSoulMemoryProviderConfigLike;
	model: string;
	source: "tool" | "default";
}

export type CoreSoulMemoryProviderAuthLike =
	| { kind: "api-key"; apiKey: string; [key: string]: unknown }
	| { kind: "oauth"; token: unknown; [key: string]: unknown }
	| { kind: string; [key: string]: unknown };

export interface CoreSoulMemoryResolvedToolProvider<
	TAuth extends CoreSoulMemoryProviderAuthLike = CoreSoulMemoryProviderAuthLike,
> extends CoreSoulMemoryToolProviderSelection {
	modelRef: string;
	config: CoreSoulMemoryProviderConfigLike & {
		model: string;
		selectedModels: string[];
		apiKey: string;
		authContext: TAuth;
		oauthToken?: unknown;
	};
}

export function soulMemoryProviderExists(
	settings: CoreSoulMemoryProviderSelectionSettings,
	providerId: string,
): boolean {
	return Boolean(
		settings.ai.providers[providerId] ||
			(settings.ai.customProviders || []).some(
				(provider) => provider.id === providerId,
			),
	);
}

export function getSoulMemoryProviderDefaultModel(
	settings: CoreSoulMemoryProviderSelectionSettings,
	providerId: string,
): string {
	const custom = (settings.ai.customProviders || []).find(
		(provider) => provider.id === providerId,
	);
	if (custom?.model) return custom.model;
	const providerConfig = settings.ai.providers[providerId];
	return providerConfig?.model || providerConfig?.selectedModels?.[0] || "";
}

export function getDefaultSoulMemoryToolProviderId(
	settings: CoreSoulMemoryProviderSelectionSettings,
): string {
	if (
		settings.ai.provider &&
		soulMemoryProviderExists(settings, settings.ai.provider)
	)
		return settings.ai.provider;
	const configured = Object.entries(settings.ai.providers).find(([, config]) =>
		Boolean(config?.model || config?.selectedModels?.[0]),
	)?.[0];
	if (configured) return configured;
	return (
		(settings.ai.customProviders || []).find((provider) =>
			Boolean(provider.model),
		)?.id || ""
	);
}

export function resolveSoulMemoryProviderConfig(
	settings: CoreSoulMemoryProviderSelectionSettings,
	providerId: string,
	model: string,
): { providerId: string; config: CoreSoulMemoryProviderConfigLike } {
	const custom = (settings.ai.customProviders || []).find(
		(provider) => provider.id === providerId,
	);
	if (custom) {
		return {
			providerId,
			config: {
				...custom,
				model,
			},
		};
	}
	const providerConfig = settings.ai.providers[providerId];
	if (!providerConfig) {
		throw new Error(`Dreaming provider is not configured: ${providerId}`);
	}
	return {
		providerId,
		config: {
			...providerConfig,
			model,
		},
	};
}

export function resolveSoulMemoryToolProviderSelection(
	settings: CoreSoulMemoryProviderSelectionSettings,
): CoreSoulMemoryToolProviderSelection {
	const configuredProviderId =
		settings.tools?.toolCallModel?.providerId?.trim() || "";
	const configuredModel = settings.tools?.toolCallModel?.model?.trim() || "";
	const useConfiguredProvider = Boolean(
		configuredProviderId &&
			soulMemoryProviderExists(settings, configuredProviderId),
	);
	const providerId = useConfiguredProvider
		? configuredProviderId
		: getDefaultSoulMemoryToolProviderId(settings);
	const model =
		useConfiguredProvider && configuredModel
			? configuredModel
			: getSoulMemoryProviderDefaultModel(settings, providerId);
	if (!providerId || !model) {
		throw new Error(
			"Tool provider/model is not configured for memory background tasks.",
		);
	}
	const resolved = resolveSoulMemoryProviderConfig(settings, providerId, model);
	return {
		providerId,
		config: resolved.config,
		model,
		source: useConfiguredProvider ? "tool" : "default",
	};
}

export function formatSoulMemoryToolModelRef(
	settings: CoreSoulMemoryProviderSelectionSettings,
): string {
	try {
		const selection = resolveSoulMemoryToolProviderSelection(settings);
		return `${selection.providerId}/${selection.model}${selection.source === "tool" ? "" : " (default)"}`;
	} catch {
		return "tool provider/model not configured";
	}
}

export function soulMemoryToolProviderAuthError(
	selection: Pick<CoreSoulMemoryToolProviderSelection, "providerId" | "model">,
	purpose: string,
): string {
	return (
		`${purpose} provider auth is unavailable for ${selection.providerId}/${selection.model}. ` +
		"Open Tools settings and configure the tool provider/model, or reconnect the provider."
	);
}

export function createSoulMemoryToolProvider<
	TAuth extends CoreSoulMemoryProviderAuthLike,
>(
	selection: CoreSoulMemoryToolProviderSelection,
	authContext: TAuth | null | undefined,
	purpose: string,
): CoreSoulMemoryResolvedToolProvider<TAuth> {
	if (!authContext) {
		throw new Error(soulMemoryToolProviderAuthError(selection, purpose));
	}

	return {
		...selection,
		modelRef: `${selection.providerId}/${selection.model}`,
		config: {
			...selection.config,
			model: selection.model,
			selectedModels: selection.config.selectedModels?.length
				? selection.config.selectedModels
				: [selection.model],
			apiKey:
				authContext.kind === "api-key" && "apiKey" in authContext
					? String(authContext.apiKey)
					: "",
			authContext,
			oauthToken:
				authContext.kind === "oauth" && "token" in authContext
					? authContext.token
					: selection.config.oauthToken,
		},
	};
}

export function stripExternalUntrustedBlocks(text: string): string {
	return text.replace(
		/<<<EXTERNAL_UNTRUSTED_CONTENT\b[^>]*>>>[\s\S]*?<<<END_EXTERNAL_UNTRUSTED_CONTENT\b[^>]*>>>/g,
		" ",
	);
}

export function hasExplicitMemoryIntent(text: string): boolean {
	const normalized = text.normalize("NFKC").toLowerCase();
	return [
		/记住/,
		/记录/,
		/保存.*记忆/,
		/以后.*(叫我|称呼我|记得|请)/,
		/以后你.*(叫我|称呼我|记得)/,
		/remember (this|that|me|my|i am|i'm)/,
		/please remember/,
		/call me\b/,
		/my name is\b/,
		/i prefer\b/,
	].some((pattern) => pattern.test(normalized));
}

export function stripSoulMemoryJsonFence(value: string): string {
	const trimmed = value.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fenced?.[1]?.trim() || trimmed;
}

export function clampCaptureConfidence(
	value: unknown,
	fallback: number,
): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, Math.min(1, value))
		: fallback;
}

export function normalizeDailyNoteCaptureAction(
	value: unknown,
): CoreDailyNoteCaptureAction | null {
	const action = String(value || "add").toLowerCase();
	if (action === "add" || action === "replace" || action === "remove")
		return action;
	return null;
}

export function optionalCaptureText(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function cleanDailyNoteCaptureText(value: unknown): string | undefined {
	const text = optionalCaptureText(value);
	if (!text) return undefined;
	const normalized = normalizeSoulMemoryBulletText(text);
	return normalized && !isLowValueDailyNoteLine(normalized)
		? normalized
		: undefined;
}

export function parseDailyNoteCaptureResult(
	value: string,
): CoreDailyNoteCaptureResult | null {
	const jsonText = stripSoulMemoryJsonFence(value).trim();
	if (!jsonText || jsonText.toUpperCase() === "NONE") return null;

	const start = jsonText.indexOf("{");
	const end = jsonText.lastIndexOf("}");
	if (start < 0 || end <= start) {
		const additions = parseDailyNoteBullets(jsonText).map(
			(content): CoreDailyNoteCaptureCandidate => ({
				action: "add",
				confidence: 0.75,
				content,
			}),
		);
		return additions.length > 0
			? { candidates: additions, confidence: 0.75 }
			: null;
	}

	try {
		const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
			action?: unknown;
			confidence?: unknown;
			memories?: unknown;
			candidates?: unknown;
			items?: unknown;
			reason?: unknown;
		};
		if (String(parsed.action || "").toLowerCase() === "none") return null;

		const confidence = clampCaptureConfidence(parsed.confidence, 0.75);
		const rawItems = Array.isArray(parsed.memories)
			? parsed.memories
			: Array.isArray(parsed.candidates)
				? parsed.candidates
				: Array.isArray(parsed.items)
					? parsed.items
					: [];

		const candidates = rawItems
			.map((item): CoreDailyNoteCaptureCandidate | null => {
				if (!item || typeof item !== "object") return null;
				const record = item as Record<string, unknown>;
				const action = normalizeDailyNoteCaptureAction(record.action);
				if (!action) return null;

				const sensitivity = String(
					record.sensitivity || "normal",
				).toLowerCase();
				if (
					(sensitivity === "secret" || sensitivity === "sensitive") &&
					action !== "remove"
				)
					return null;

				const candidateConfidence = clampCaptureConfidence(
					record.confidence,
					confidence,
				);
				const reason =
					typeof record.reason === "string"
						? record.reason.slice(0, 500)
						: undefined;

				if (action === "add") {
					const content =
						cleanDailyNoteCaptureText(record.content) ||
						cleanDailyNoteCaptureText(record.memory) ||
						cleanDailyNoteCaptureText(record.text);
					if (!content) return null;
					return {
						action,
						confidence: candidateConfidence,
						content,
						...(reason ? { reason } : {}),
					};
				}

				if (action === "replace") {
					const oldText =
						optionalCaptureText(record.oldText) ||
						optionalCaptureText(record.old_text) ||
						optionalCaptureText(record.text);
					const newText =
						cleanDailyNoteCaptureText(record.newText) ||
						cleanDailyNoteCaptureText(record.new_text) ||
						cleanDailyNoteCaptureText(record.content);
					if (!oldText || typeof newText !== "string") return null;
					return {
						action,
						confidence: candidateConfidence,
						oldText,
						newText,
						...(reason ? { reason } : {}),
					};
				}

				const text =
					optionalCaptureText(record.text) ||
					optionalCaptureText(record.oldText) ||
					optionalCaptureText(record.old_text) ||
					optionalCaptureText(record.content);
				if (!text) return null;
				return {
					action,
					confidence: candidateConfidence,
					text,
					...(reason ? { reason } : {}),
				};
			})
			.filter((item): item is CoreDailyNoteCaptureCandidate => Boolean(item));

		if (candidates.length === 0) return null;
		return {
			candidates,
			confidence,
			reason:
				typeof parsed.reason === "string"
					? parsed.reason.slice(0, 500)
					: undefined,
		};
	} catch {
		return null;
	}
}

export function stripCandidateNarration(value: string): string {
	return normalizeSoulMemoryBulletText(value)
		.replace(
			/^用户(?:说|问|询问|要求|请求|想要|让我|叫我|提到|表示)[：:\s]+/u,
			"",
		)
		.replace(
			/^User\s+(?:asked|requested|wants?|needs?|said|told|mentioned)\s+(?:that\s+|to\s+|whether\s+|if\s+)?/iu,
			"",
		)
		.trim();
}

export function isLikelyRawRequestEcho(value: string): boolean {
	const text = normalizeSoulMemoryBulletText(value);
	const bare = stripCandidateNarration(text);
	const lower = bare.toLowerCase();
	if (!bare) return true;
	if (/[?？]\s*$/.test(bare)) return true;
	if (
		/^(?:怎么|如何|为什么|为啥|讲讲|解释|帮我|给我|请|能不能|可以|是否|更新|检查|修|改|添加|删除|把|不用调整|看下|看看)/u.test(
			bare,
		)
	) {
		return true;
	}
	if (
		/^(?:how|why|what|can you|could you|please|explain|tell me|update|check|fix|change|add|remove|look at)\b/i.test(
			lower,
		)
	) {
		return true;
	}
	if (
		/^User\s+(?:asked|requested|wants?|needs?)\b/i.test(text) &&
		!/\b(?:confirmed|clarified|decided|prefers|final rule|constraint)\b/i.test(
			text,
		)
	) {
		return true;
	}
	if (
		/^用户(?:问|询问|要求|请求|想要|让我|叫我)/u.test(text) &&
		!/(?:确认|明确|纠正|规则|偏好|约束|决定)/u.test(text)
	) {
		return true;
	}
	return false;
}

export function isLowValueDailyNoteLine(text: string): boolean {
	const normalized = normalizeSoulMemoryBulletText(text);
	if (!normalized) return true;
	if (isLikelyRawRequestEcho(normalized)) return true;
	if (/^\{[\s\S]*\}$/.test(normalized)) return true;
	if (
		/\bassistant\s+(?:reported|replied|completed|said)\b/i.test(normalized) ||
		/(?:助手|assistant).{0,12}(?:已|reported|完成|回复)/iu.test(normalized)
	) {
		return !/(?:final rule|confirmed rule|最终规则|明确规则|确认|纠正|偏好|约束|决定)/iu.test(
			normalized,
		);
	}
	return false;
}

export function parseDailyNoteBullets(value: string): string[] {
	const trimmed = stripSoulMemoryJsonFence(value).trim();
	if (!trimmed || trimmed.toUpperCase() === "NONE") return [];
	if (/^\s*\{/.test(trimmed)) return [];

	const seen = new Set<string>();
	const bullets: string[] = [];
	for (const rawLine of trimmed.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.toUpperCase() === "NONE" || line.startsWith("#"))
			continue;
		const match = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
		const text = normalizeSoulMemoryBulletText(match ? match[1] : line);
		if (isLowValueDailyNoteLine(text)) continue;
		const key = normalizeSoulMemoryForDedupe(soulMemoryAsBullet(text));
		if (!key || seen.has(key)) continue;
		seen.add(key);
		bullets.push(text);
	}
	return bullets;
}

export function findDailyNoteBulletLine(
	lines: string[],
	text: string | undefined,
): number {
	const raw = text?.trim();
	if (!raw) return -1;
	const bullet = soulMemoryAsBullet(raw);
	return lines.findIndex((line) => {
		const trimmed = line.trim();
		return (
			trimmed.startsWith("- ") &&
			(trimmed === raw || (!!bullet && trimmed === bullet))
		);
	});
}

export function serializeDailyNoteLines(lines: string[]): string {
	return `${lines.join("\n").replace(/\s+$/u, "")}\n`;
}

export function applyDailyNoteLineReplace(
	content: string,
	oldText: string,
	newText: string,
): {
	next: string;
	changed: boolean;
} {
	const lines = content.split(/\r?\n/);
	const index = findDailyNoteBulletLine(lines, oldText);
	if (index < 0) return { next: content, changed: false };
	const replacement = soulMemoryAsBullet(newText);
	if (!replacement || lines[index].trim() === replacement)
		return { next: content, changed: false };
	lines[index] = replacement;
	return { next: serializeDailyNoteLines(lines), changed: true };
}

export function applyDailyNoteLineRemove(
	content: string,
	text: string,
): {
	next: string;
	changed: boolean;
} {
	const lines = content.split(/\r?\n/);
	const index = findDailyNoteBulletLine(lines, text);
	if (index < 0) return { next: content, changed: false };
	lines.splice(index, 1);
	return { next: serializeDailyNoteLines(lines), changed: true };
}

export async function applyDailyNoteCaptureActions(
	options: ApplyDailyNoteCaptureActionsOptions,
): Promise<CoreDailyNoteCaptureApplyResult | null> {
	let content = await options.readContent();
	let changedContent = false;
	let skipped = 0;
	let replaced = 0;
	let removed = 0;

	for (const candidate of options.candidates) {
		if (candidate.action === "replace") {
			const oldText = candidate.oldText?.trim();
			const newText = candidate.newText?.trim();
			if (!oldText || !newText) {
				skipped += 1;
				continue;
			}
			const result = applyDailyNoteLineReplace(content, oldText, newText);
			if (result.changed) {
				content = result.next;
				changedContent = true;
				replaced += 1;
			} else {
				skipped += 1;
			}
			continue;
		}

		if (candidate.action === "remove") {
			const text =
				candidate.text?.trim() ||
				candidate.oldText?.trim() ||
				candidate.content?.trim();
			if (!text) {
				skipped += 1;
				continue;
			}
			const result = applyDailyNoteLineRemove(content, text);
			if (result.changed) {
				content = result.next;
				changedContent = true;
				removed += 1;
			} else {
				skipped += 1;
			}
		}
	}

	if (changedContent) {
		await options.writeContent(content);
	}

	const addTexts = options.candidates
		.filter((candidate) => candidate.action === "add")
		.map((candidate) => candidate.content || candidate.text || "")
		.map((text) => normalizeSoulMemoryBulletText(text))
		.filter(Boolean);
	const dailyBullets = await options.dedupeAdditions(addTexts);
	skipped += addTexts.length - dailyBullets.length;

	let added = 0;
	if (dailyBullets.length > 0) {
		const appended = await options.appendBullets(dailyBullets);
		added = appended ? dailyBullets.length : 0;
		if (!appended) skipped += dailyBullets.length;
	}

	const applied = added + replaced + removed;
	if (applied === 0) return null;
	return {
		applied,
		skipped,
		added,
		replaced,
		removed,
	};
}

export async function applyDailyNoteCaptureActionsWithAdapters(
	options: ApplyDailyNoteCaptureActionsWithAdaptersOptions,
): Promise<CoreDailyNoteCaptureApplyResult | null> {
	return applyDailyNoteCaptureActions({
		candidates: options.candidates,
		readContent: async () =>
			Promise.resolve(options.readDailyContent()).catch(() => ""),
		writeContent: options.writeDailyContent,
		dedupeAdditions: (bullets) =>
			dedupeSoulMemoryDailyNoteBulletsWithAdapters({
				bullets,
				readMemoryContent: options.readMemoryContent,
				readDailyContent: options.readDailyContent,
			}),
		appendBullets: options.appendBullets,
	});
}

export function extractTaggedBlock(
	text: string,
	tag: string,
): string | undefined {
	const match = text.match(
		new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i"),
	);
	return match?.[1]?.trim();
}

export function splitPromotions(
	memory: string,
	maxPromotions: number,
): string[] {
	const trimmed = memory.trim();
	if (!trimmed || /^none$/i.test(trimmed)) return [];
	const bulletLines = trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /^[-*]\s+\S/.test(line));
	const candidates =
		bulletLines.length > 0
			? bulletLines
			: trimmed
					.split(/\n{2,}/)
					.map((line) => line.trim())
					.filter(Boolean);
	return candidates
		.filter((line) => !/^none$/i.test(line))
		.slice(0, Math.max(0, maxPromotions));
}

export function memoryReviewLastTurnKey(
	agentId: string,
	sessionId: string,
): string;
export function memoryReviewLastTurnKey(
	prefix: string,
	agentId: string,
	sessionId: string,
): string;
export function memoryReviewLastTurnKey(
	first: string,
	second: string,
	third?: string,
): string {
	const prefix =
		third === undefined ? CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX : first;
	const agentId = third === undefined ? first : second;
	const sessionId = third === undefined ? second : third;
	return `${prefix}${agentId}:${sessionId}`;
}

export function countMemoryReviewUserTurns(
	messages: CoreMemoryReviewMessage[],
): number {
	return messages.filter((message) => message.role === "user").length;
}

export function getMemoryReviewProgress(options: {
	messages: CoreMemoryReviewMessage[];
	interval: number;
	lastReviewedTurn?: number;
}): CoreMemoryReviewProgress {
	const userTurns = countMemoryReviewUserTurns(options.messages);
	const interval = Math.max(0, Math.floor(options.interval));
	if (interval <= 0 || userTurns <= 0) {
		return {
			userTurns,
			turnsSinceReview: 0,
			turnsUntilReview: 0,
			shouldReview: false,
		};
	}

	const turnsSinceReview = userTurns % interval;
	const shouldReview =
		turnsSinceReview === 0 && options.lastReviewedTurn !== userTurns;
	return {
		userTurns,
		turnsSinceReview,
		turnsUntilReview: shouldReview ? 0 : interval - turnsSinceReview,
		shouldReview,
	};
}

export function normalizeMemoryReviewAction(
	value: unknown,
): CoreMemoryReviewAction | null {
	const action = String(value || "add").toLowerCase();
	if (action === "add" || action === "replace" || action === "remove")
		return action;
	return null;
}

export function normalizeMemoryReviewTarget(
	value: unknown,
): CoreMemoryReviewTarget | null {
	// USER.md / MEMORY.md 不再是复盘目标(Hermes 文件记忆已移除);模型若仍返回这两个
	// 目标,按无效候选丢弃,而不是悄悄写到别的文件里。
	const target = String(value || "soul").toLowerCase();
	if (target === "soul" || target === "dreams") return target;
	return null;
}

export function parseMemoryReviewModelResult(
	value: string,
): CoreMemoryReviewModelResult | null {
	const jsonText = stripSoulMemoryJsonFence(value);
	const start = jsonText.indexOf("{");
	const end = jsonText.lastIndexOf("}");
	if (start < 0 || end <= start) return null;

	try {
		const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
			action?: unknown;
			confidence?: unknown;
			memories?: unknown;
			candidates?: unknown;
			reason?: unknown;
		};
		if (String(parsed.action || "").toLowerCase() === "none") return null;

		const confidence = clampCaptureConfidence(parsed.confidence, 0.75);
		const rawItems = Array.isArray(parsed.memories)
			? parsed.memories
			: Array.isArray(parsed.candidates)
				? parsed.candidates
				: [];

		const candidates = rawItems
			.map((item): CoreMemoryReviewCandidate | null => {
				if (!item || typeof item !== "object") return null;
				const record = item as Record<string, unknown>;
				const action = normalizeMemoryReviewAction(record.action);
				const target = normalizeMemoryReviewTarget(record.target);
				if (!action || !target) return null;

				const sensitivity = String(
					record.sensitivity || "normal",
				).toLowerCase();
				if (sensitivity === "secret" || sensitivity === "sensitive")
					return null;

				const candidateConfidence = clampCaptureConfidence(
					record.confidence,
					confidence,
				);
				const content =
					optionalCaptureText(record.content) ||
					optionalCaptureText(record.memory);
				const oldText =
					optionalCaptureText(record.oldText) ||
					optionalCaptureText(record.old_text);
				const newText =
					optionalCaptureText(record.newText) ||
					optionalCaptureText(record.new_text);
				const text = optionalCaptureText(record.text) || oldText || content;

				if (action === "add" && !content && !text) return null;
				if (action === "replace" && (!oldText || typeof newText !== "string"))
					return null;
				if (action === "remove" && !text) return null;

				return {
					action,
					target,
					confidence: candidateConfidence,
					...(content || text ? { content: content || text } : {}),
					...(oldText ? { oldText } : {}),
					...(typeof newText === "string" ? { newText } : {}),
					...(text ? { text } : {}),
					...(typeof record.reason === "string"
						? { reason: record.reason.slice(0, 500) }
						: {}),
				};
			})
			.filter((item): item is CoreMemoryReviewCandidate => Boolean(item));

		if (candidates.length === 0) return null;
		return {
			candidates,
			confidence,
			reason:
				typeof parsed.reason === "string"
					? parsed.reason.slice(0, 500)
					: undefined,
		};
	} catch {
		return null;
	}
}

export function formatMemoryReviewConversation(
	messages: CoreMemoryReviewMessage[],
	maxChars: number,
): string {
	const formatted = messages
		.filter(
			(message) => message.role === "user" || message.role === "assistant",
		)
		.map((message) => {
			const role = message.role === "assistant" ? "Assistant" : "User";
			const content =
				typeof message.content === "string" ? message.content.trim() : "";
			return content ? `${role}: ${content}` : "";
		})
		.filter(Boolean)
		.join("\n\n");

	const limit = Math.max(1000, Math.floor(maxChars));
	if (formatted.length <= limit) return formatted;

	const tail = formatted.slice(-limit);
	const boundary = tail.indexOf("\n\n");
	const trimmedTail =
		boundary > 0 ? tail.slice(boundary + 2).trimStart() : tail.trimStart();
	return `[Older conversation omitted]\n\n${trimmedTail}`;
}

export function cleanReviewMemoryText(value: string | undefined): string {
	return normalizeSoulMemoryBulletText(value || "");
}

export function cleanReviewDocumentText(value: string | undefined): string {
	return (value || "").replace(/\r\n/g, "\n").replace(/\s+$/u, "").trim();
}

export function normalizeReviewDocumentContent(value: string): string {
	const trimmed = value.replace(/\s+$/u, "");
	return trimmed ? `${trimmed}\n` : "";
}

export function appendReviewDocumentContent(
	existing: string,
	addition: string,
): string {
	const base = existing.replace(/\s+$/u, "");
	return normalizeReviewDocumentContent(
		base ? `${base}\n\n${addition}` : addition,
	);
}

export function applyPlainReviewCandidateToContent(
	existingContent: string,
	candidate: CoreMemoryReviewCandidate & { target: CorePlainReviewTarget },
): CorePlainReviewMutationResult {
	if (candidate.action === "add") {
		const content = cleanReviewDocumentText(
			candidate.content || candidate.text,
		);
		if (!content) return { changed: false, skipped: true, reason: "empty-add" };
		const key = normalizeSoulMemoryForDedupe(content);
		const existingKeys = new Set(
			existingContent
				.split(/\r?\n/)
				.map(normalizeSoulMemoryForDedupe)
				.filter(Boolean),
		);
		if (!key || existingKeys.has(key) || existingContent.includes(content)) {
			return { changed: false, skipped: true, reason: "duplicate" };
		}
		return {
			changed: true,
			skipped: false,
			next: appendReviewDocumentContent(existingContent, content),
		};
	}

	if (candidate.action === "replace") {
		const oldText = candidate.oldText?.trim();
		const newText = cleanReviewDocumentText(candidate.newText);
		if (!oldText || typeof candidate.newText !== "string") {
			return { changed: false, skipped: true, reason: "invalid-replace" };
		}
		const index = existingContent.indexOf(oldText);
		if (index < 0) {
			return { changed: false, skipped: true, reason: "no-match" };
		}
		const next = `${existingContent.slice(0, index)}${newText}${existingContent.slice(index + oldText.length)}`;
		return {
			changed: true,
			skipped: false,
			next: normalizeReviewDocumentContent(next),
		};
	}

	const text =
		candidate.text?.trim() ||
		candidate.oldText?.trim() ||
		candidate.content?.trim();
	if (!text) return { changed: false, skipped: true, reason: "empty-remove" };
	const index = existingContent.indexOf(text);
	if (index < 0) {
		return { changed: false, skipped: true, reason: "no-match" };
	}
	const next = `${existingContent.slice(0, index)}${existingContent.slice(index + text.length)}`;
	return {
		changed: true,
		skipped: false,
		next: normalizeReviewDocumentContent(next),
	};
}

export async function applyMemoryReviewCandidate(
	options: ApplyMemoryReviewCandidateOptions,
): Promise<CoreMemoryReviewApplyResult> {
	const { candidate } = options;
	if (candidate.confidence < options.minConfidence) {
		return { changed: false, skipped: true, reason: "below-confidence" };
	}

	const target = candidate.target;
	const file = await options.readPlain(target);
	const result = applyPlainReviewCandidateToContent(
		file.content,
		candidate as CoreMemoryReviewCandidate & {
			target: CorePlainReviewTarget;
		},
	);

	if (!result.changed) {
		return {
			changed: false,
			skipped: true,
			relativePath: file.relativePath,
			reason: result.reason,
		};
	}

	await options.writePlain(
		target,
		result.next ?? normalizeReviewDocumentContent(file.content),
	);
	return { changed: true, skipped: false, relativePath: file.relativePath };
}

export function managedFileOrder(kind: CoreMemoryManagedFileKind): number {
	if (kind === "soul") return 0;
	if (kind === "user") return 1;
	if (kind === "memory") return 2;
	if (kind === "dreams") return 3;
	return 4;
}

export function sortManagedMemoryFiles<
	TFile extends CoreManagedMemoryFileSortable,
>(files: TFile[]): TFile[] {
	return [...files].sort((left, right) => {
		const kindDelta =
			managedFileOrder(left.kind) - managedFileOrder(right.kind);
		if (kindDelta !== 0) return kindDelta;
		if (left.kind === "daily" && right.kind === "daily") {
			return (
				(right.date || "").localeCompare(left.date || "") ||
				right.mtimeMs - left.mtimeMs
			);
		}
		return left.relativePath.localeCompare(right.relativePath);
	});
}
