import {
	canonicalSoulMemoryKindFromCaptureKind as coreCanonicalSoulMemoryKindFromCaptureKind,
	canonicalSoulMemoryTokens as coreCanonicalSoulMemoryTokens,
	buildSoulMemoryFtsQuery as coreBuildSoulMemoryFtsQuery,
	CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
	cosineSoulMemoryVector as coreCosineSoulMemoryVector,
	estimateSoulMemoryTokens as coreEstimateSoulMemoryTokens,
	extractSoulMemoryCandidateValue as coreExtractSoulMemoryCandidateValue,
	formatSoulMemoryDateString as coreFormatSoulMemoryDateString,
	formatSoulMemoryDateStringDaysAgo as coreFormatSoulMemoryDateStringDaysAgo,
	hashSoulMemoryText as coreHashSoulMemoryText,
	isDurableSoulMemoryCaptureCandidate as coreIsDurableSoulMemoryCaptureCandidate,
	isSoulMemoryIndexableMarkdownRelativePath as coreIsSoulMemoryIndexableMarkdownRelativePath,
	looksLikeSoulMemoryNameValue as coreLooksLikeSoulMemoryNameValue,
	normalizeSoulMemoryBulletText as coreNormalizeSoulMemoryBulletText,
	normalizeSoulMemoryForDedupe as coreNormalizeSoulMemoryForDedupe,
	normalizeSoulMemoryRelativePath as coreNormalizeSoulMemoryRelativePath,
	previewSoulMemoryLine as corePreviewSoulMemoryLine,
	sanitizeSoulMemoryAgentPathSegment as coreSanitizeSoulMemoryAgentPathSegment,
	sanitizeSoulMemoryKey as coreSanitizeSoulMemoryKey,
	slugifySoulMemoryKeyPart as coreSlugifySoulMemoryKeyPart,
	soulMemoryAsBullet as coreSoulMemoryAsBullet,
	soulMemoryTokenJaccard as coreSoulMemoryTokenJaccard,
	truncateSoulMemoryText as coreTruncateSoulMemoryText,
	type CoreCanonicalMemoryKind,
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

export const DREAMING_SCHEDULER_TASK_ID = "memory-dreaming-promotion";
export const SCOPED_DREAMING_SCHEDULER_TASK_ID = `plugin:${SOUL_MEMORY_PLUGIN_ID}:${DREAMING_SCHEDULER_TASK_ID}`;
export const CAPTURE_PENDING_STORE_KEY = "pendingCaptures";
export const CAPTURE_MAX_PENDING = 20;
export const CANONICAL_MIGRATION_STORE_KEY = "canonicalMemoryMigrationV1Done";
export const GRAPH_MIGRATION_STORE_KEY = "graphMemoryMigrationV1Done";
export const USER_SELF_ENTITY_ID = CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID;

export type MemoryCanonicalKind = CoreCanonicalMemoryKind;
export type MemoryCaptureCandidateKind = CoreCaptureCandidateKind;
export type MemoryDurableCandidateLike = Pick<CoreCaptureCandidate, "kind">;

export function normalizeMemoryRelativePath(value: string): string {
	return coreNormalizeSoulMemoryRelativePath(value);
}

export function isIndexableMarkdownPath(relativePath: string): boolean {
	return coreIsSoulMemoryIndexableMarkdownRelativePath(relativePath);
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

export function canonicalKindFromCaptureKind(
	kind: MemoryCaptureCandidateKind | string,
): MemoryCanonicalKind {
	return coreCanonicalSoulMemoryKindFromCaptureKind(kind);
}

export function canonicalTokens(value: string): Set<string> {
	return coreCanonicalSoulMemoryTokens(value);
}

export function tokenJaccard(left: string, right: string): number {
	return coreSoulMemoryTokenJaccard(left, right);
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

export function cosine(left?: number[], right?: number[]): number {
	return coreCosineSoulMemoryVector(left, right);
}

export function ftsQuery(query: string): string {
	return coreBuildSoulMemoryFtsQuery(query);
}

export const replaceFileAtomic = writeTextFileAtomic;
