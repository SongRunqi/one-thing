import {
	estimateSoulMemoryTokens as coreEstimateSoulMemoryTokens,
	extractSoulMemoryCandidateValue as coreExtractSoulMemoryCandidateValue,
	formatSoulMemoryDateString as coreFormatSoulMemoryDateString,
	formatSoulMemoryDateStringDaysAgo as coreFormatSoulMemoryDateStringDaysAgo,
	hashSoulMemoryText as coreHashSoulMemoryText,
	isDurableSoulMemoryCaptureCandidate as coreIsDurableSoulMemoryCaptureCandidate,
	looksLikeSoulMemoryNameValue as coreLooksLikeSoulMemoryNameValue,
	normalizeSoulMemoryBulletText as coreNormalizeSoulMemoryBulletText,
	normalizeSoulMemoryForDedupe as coreNormalizeSoulMemoryForDedupe,
	normalizeSoulMemoryRelativePath as coreNormalizeSoulMemoryRelativePath,
	previewSoulMemoryLine as corePreviewSoulMemoryLine,
	sanitizeSoulMemoryAgentPathSegment as coreSanitizeSoulMemoryAgentPathSegment,
	sanitizeSoulMemoryKey as coreSanitizeSoulMemoryKey,
	slugifySoulMemoryKeyPart as coreSlugifySoulMemoryKeyPart,
	soulMemoryAsBullet as coreSoulMemoryAsBullet,
	truncateSoulMemoryText as coreTruncateSoulMemoryText,
	type CoreCaptureCandidate,
	type CoreCaptureCandidateKind,
} from "../plugins/index.js";
import {
	readTextFileLimited,
	writeTextFileAtomic,
	writeTextFileIfMissing,
} from "@onething/core/storage";
import soulMemoryRulesRaw from "../prompts/content/memory-rules.md?raw";

export const SOUL_MEMORY_PLUGIN_ID = "soul-memory";

// SOUL_MEMORY_RULES_PROMPT: original template literal ends with \n;
// preserve that trailing newline so downstream consumers produce identical output.
export const SOUL_MEMORY_RULES_PROMPT = soulMemoryRulesRaw;

export const SOUL_TEMPLATE = `# SOUL.md

`;

export const CAPTURE_PENDING_STORE_KEY = "pendingCaptures";
export const CAPTURE_MAX_PENDING = 20;

export type MemoryCaptureCandidateKind = CoreCaptureCandidateKind;
export type MemoryDurableCandidateLike = Pick<CoreCaptureCandidate, "kind">;

export function normalizeMemoryRelativePath(value: string): string {
	return coreNormalizeSoulMemoryRelativePath(value);
}

export function todayString(): string {
	return dateString(new Date());
}

export function dateString(date: Date): string {
	return coreFormatSoulMemoryDateString(date);
}

export function dateStringDaysAgo(daysAgo: number): string {
	return coreFormatSoulMemoryDateStringDaysAgo(daysAgo);
}

export function sha(value: string): string {
	return coreHashSoulMemoryText(value);
}

export function truncate(value: string, maxChars: number): string {
	return coreTruncateSoulMemoryText(value, maxChars);
}

export function estimateTokens(value: string): number {
	return coreEstimateSoulMemoryTokens(value);
}

export function sanitizeAgentPathSegment(
	agentId: string,
	defaultAgentId = "default",
): string {
	return coreSanitizeSoulMemoryAgentPathSegment(agentId, defaultAgentId);
}

export async function writeIfMissing(
	filePath: string,
	content: string,
): Promise<void> {
	await writeTextFileIfMissing(filePath, content);
}

export function readLimited(filePath: string, maxChars: number): string {
	return readTextFileLimited(filePath, maxChars, truncate);
}

export function normalizeBulletText(value: string): string {
	return coreNormalizeSoulMemoryBulletText(value);
}

export function asBullet(value: string): string {
	return coreSoulMemoryAsBullet(value);
}

export function slugifyMemoryKeyPart(value: string): string {
	return coreSlugifySoulMemoryKeyPart(value);
}

export function sanitizeMemoryKey(value: string): string {
	return coreSanitizeSoulMemoryKey(value);
}

export function extractCandidateValue(text: string): string {
	return coreExtractSoulMemoryCandidateValue(text);
}

export function looksLikeNameValue(value: string): boolean {
	return coreLooksLikeSoulMemoryNameValue(value);
}

export function isDurableCandidate(
	candidate: MemoryDurableCandidateLike,
): boolean {
	return coreIsDurableSoulMemoryCaptureCandidate(candidate);
}

export function normalizeForDedupe(value: string): string {
	return coreNormalizeSoulMemoryForDedupe(value);
}

export function previewLine(value: string, maxChars = 220): string {
	return corePreviewSoulMemoryLine(value, maxChars);
}

export const replaceFileAtomic = writeTextFileAtomic;
