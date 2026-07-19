/**
 * Evals Module
 * Prompt evaluation IPC type definitions
 */

import type { TurnEvalRecord } from "@onething/runtime";

// Re-export for convenience
export type { TurnEvalRecord };

// ── Phase 0/1: Downvote ──────────────────────────────
export interface EvalsRecordDownvoteRequest {
	sessionId: string;
	turnId: string;
	userMessage: string;
	/** Optional one-liner from the user: what went wrong / what was expected. */
	note?: string;
}

export interface EvalsRecordDownvoteResponse {
	success: boolean;
	fixturePath?: string;
	/** Incident bundle id created for this downvote (workbench entry point). */
	incidentId?: string;
	error?: string;
}

// ── Phase 1: Review (read-only) ──────────────────────

export interface EvalsListRecordsRequest {
	negativeOnly?: boolean;
	category?: string;
	sinceTs?: string;
	limit?: number;
	offset?: number;
}

export interface EvalsListRecordsResponse {
	success: boolean;
	records?: TurnEvalRecordView[];
	total?: number;
	error?: string;
}

/** Turn record with additional computed fields for UI display. */
export interface TurnEvalRecordView extends TurnEvalRecord {
	hasFixture: boolean;
	userMessagePreview: string;
}

export interface EvalsListFixturesResponse {
	success: boolean;
	fixtures?: EvalFixtureMeta[];
	error?: string;
}

export interface EvalFixtureMeta {
	path: string;
	capturedAt: string;
	provider: string;
	model: string;
	sessionId: string;
	turnId: string;
	userMessagePreview: string;
	hasNegative: boolean;
}

export interface EvalsReadFixtureRequest {
	fixturePath: string;
}

export interface EvalsReadFixtureResponse {
	success: boolean;
	fixture?: Record<string, unknown>;
	error?: string;
}

export interface EvalsListResultsResponse {
	success: boolean;
	entries?: EvalRunResultEntry[];
	error?: string;
}

export interface EvalRunResultEntry {
	ts: string;
	promptVersion: string;
	provider: string;
	model?: string;
	runs: number;
	evalSetSize: number;
	scores: Record<string, number>;
	mean: number;
	disabled?: string[];
	cost?: string;
	sentinelScores?: Record<string, number>;
	/** pass^k per sentinel: true only when every attempt passed with no errors. */
	sentinelStrict?: Record<string, boolean>;
	/** Infra-error attempts / total attempts. */
	errorRate?: number;
	/** True when errorRate exceeded the invalid threshold — skip as baseline. */
	invalid?: boolean;
	/** Mean economics over judgeable attempts. */
	metrics?: {
		avgOutputChars: number;
		avgToolCalls: number;
		avgTotalTokens?: number;
	};
	/** True when the run was cancelled mid-way; aborted entries are not persisted. */
	aborted?: boolean;
}

export interface EvalsListCasesResponse {
	success: boolean;
	cases?: EvalCaseMeta[];
	error?: string;
}

export interface EvalCaseMeta {
	id: string;
	file: string;
	dir: string;
	description: string;
	fixture: string;
	userMessage: string;
	isSentinel: boolean;
	expect: Record<string, unknown>;
}

export interface EvalsGetCaseRequest {
	caseId: string;
}

export interface EvalsGetCaseResponse {
	success: boolean;
	case_?: EvalCaseMeta;
	error?: string;
}

// ── Phase 2: Run ─────────────────────────────────────

export interface EvalsRunStartRequest {
	caseIds?: string[];
	runs: number;
	disabledSections?: string[];
	providerId: string;
	model: string;
}

export interface EvalsRunStartResponse {
	success: boolean;
	error?: string;
}

export interface EvalsRunCancelResponse {
	success: boolean;
	error?: string;
}

export interface EvalsRunProgressEvent {
	type: "case-start" | "attempt-done" | "case-done" | "run-done" | "error";
	caseId?: string;
	attempt?: number;
	pass?: boolean;
	reason?: string;
	score?: number;
	totalCases?: number;
	completedCases?: number;
	entry?: EvalRunResultEntry;
	error?: string;
	/** Per-case per-attempt detail (run-done only). Not sent over IPC; persists on disk. */
	detail?: {
		cases: Record<
			string,
			{
				score: number;
				caseId: string;
				attempts: Array<{
					index: number;
					pass: boolean;
					reason: string;
					/** Infra error (excluded from the pass-rate denominator). */
					error?: boolean;
				}>;
			}
		>;
	};
}

// ── Phase 3: Closed-loop actions ─────────────────────

export interface EvalsPromoteFixtureRequest {
	fixturePath: string;
	caseId: string;
	description: string;
	/** When true, also copy .context.jsonl alongside the fixture for multi-turn replay. */
	includeContext?: boolean;
	expect: {
		firstToolCall?: string;
		lastToolCall?: string;
		hasToolCalls?: boolean;
		toolCallContains?: { name: string; args?: Record<string, unknown> };
		noToolCalls?: string | string[];
		toolCallCount?: {
			name: string;
			min?: number;
			max?: number;
			exactly?: number;
		};
		skillUsed?: string | string[];
		anySkillUsed?: boolean;
		mcpToolUsed?: boolean;
		mcpServerUsed?: string;
		mcpToolUsedName?: string;
		contains?: string | string[];
		notContains?: string | string[];
		minOutputLength?: number;
		maxOutputLength?: number;
		outputStartsWith?: string;
		outputEndsWith?: string;
		regex?: string;
		notes?: string;
	};
}

export interface EvalsPromoteFixtureResponse {
	success: boolean;
	casePath?: string;
	error?: string;
}

export interface EvalsRetireCaseRequest {
	caseId: string;
}

export interface EvalsRetireCaseResponse {
	success: boolean;
	newPath?: string;
	error?: string;
}

export interface EvalsGenerateTriageRequest {
	weeks?: number;
}

export interface EvalsGenerateTriageResponse {
	success: boolean;
	report?: string;
	triagePath?: string;
	error?: string;
}

// ── Evals Workbench (incident-centric, W1-W5) ─────────

/** Mirror of runtime IncidentMeta (kept structural to avoid runtime import). */
export interface EvalsIncidentMetaDTO {
	version: 1;
	id: string;
	createdAt: string;
	origin: "downvote" | "auto";
	status: string;
	title: string;
	note?: string;
	category?: string;
	rubric?: string;
	sessionId: string;
	turnId: string;
	provider: string;
	model: string;
	promptVersion?: string;
	skeletonVersion?: string;
	sectionHashes?: Record<string, string>;
	signals?: Record<string, unknown>;
	explicitDown?: boolean;
	userMessage: string;
	assistantPreview: string;
	contextOrigin?: "live" | "rebuilt" | "synthesized";
	scene: Record<string, boolean>;
	diagnosis?: { conclusion: string; reportRef?: string; at: string };
	caseId?: string;
}

export interface EvalsIncidentListResponse {
	success: boolean;
	incidents?: EvalsIncidentMetaDTO[];
	error?: string;
}

export interface EvalsIncidentGetRequest {
	incidentId: string;
}

export interface EvalsIncidentRunSummary {
	runId: string;
	startedAt: string;
	kind: "replay" | "diagnosis";
	attempts: number;
	passes: number;
	disabledSections?: string[];
	attemptFiles: string[];
}

export interface EvalsIncidentGetResponse {
	success: boolean;
	incident?: EvalsIncidentMetaDTO;
	markdown?: string;
	runs?: EvalsIncidentRunSummary[];
	error?: string;
}

export interface EvalsIncidentUpdateRequest {
	incidentId: string;
	patch: {
		status?: string;
		note?: string;
		rubric?: string;
		title?: string;
	};
}

export interface EvalsIncidentUpdateResponse {
	success: boolean;
	incident?: EvalsIncidentMetaDTO;
	error?: string;
}

/** Read a file inside the incident bundle by relative path (scene/*, runs/*). */
export interface EvalsIncidentReadFileRequest {
	incidentId: string;
	relativePath: string;
}

export interface EvalsIncidentReadFileResponse {
	success: boolean;
	content?: string;
	error?: string;
}

export interface EvalsReplayStartRequest {
	incidentId: string;
	/** Attempts (k). Default 1 for a quick look, 3-5 for reproduction rate. */
	runs?: number;
	disabledSections?: string[];
	/** Judge against the incident rubric/note (needs analysis model). */
	judge?: boolean;
	/** Replay with the captured original prompt (faithful reproduction). */
	useCapturedPrompt?: boolean;
	/** Override provider/model; default: scene params. */
	providerId?: string;
	model?: string;
}

export interface EvalsReplayStartResponse {
	success: boolean;
	runId?: string;
	error?: string;
}

export interface EvalsReplayProgressEvent {
	incidentId: string;
	runId: string;
	type:
		| "attempt-start"
		| "transcript-event"
		| "attempt-done"
		| "run-done"
		| "error";
	attempt?: number;
	/** Serialized TranscriptEvent for live rendering. */
	event?: Record<string, unknown>;
	pass?: boolean | null;
	reason?: string;
	passes?: number;
	attempts?: number;
	error?: string;
}

export interface EvalsIncidentAnalyzeRequest {
	incidentId: string;
}

export interface EvalsIncidentAnalyzeResponse {
	success: boolean;
	incident?: EvalsIncidentMetaDTO;
	error?: string;
}

export interface EvalsIncidentPromoteRequest {
	incidentId: string;
	caseId: string;
	description?: string;
}

export interface EvalsIncidentPromoteResponse {
	success: boolean;
	casePath?: string;
	error?: string;
}

export interface EvalsDiagnoseStartRequest {
	incidentId: string;
	/** Quick mode: fewer attempts, suspected sections only. */
	quick?: boolean;
}

export interface EvalsDiagnoseStartResponse {
	success: boolean;
	error?: string;
}

export interface EvalsDiagnoseProgressEvent {
	incidentId: string;
	type: "step" | "ablation" | "done" | "error";
	step?: string;
	section?: string;
	failRate?: number;
	conclusion?: string;
	report?: string;
	error?: string;
}

// ── Per-round tracing (L1) ─────────────────────────────

export interface EvalsRoundListRequest {
	incidentId: string;
}

/** One agent-loop round: the exact request the model saw + its decision. */
export interface EvalsRoundView {
	round: number;
	ts: string;
	purpose: string;
	/** Hydrated request messages (AgentMessage-shaped, serializable). */
	requestMessages: unknown[];
	model: string;
	temperature?: number;
	toolNames: string[];
	/** The model's decision this round. */
	responseContent: string;
	responseToolCalls: Array<{ name: string; args: unknown }>;
	finishReason: string;
	/** Delta chain broken — request view is best-effort. */
	incomplete?: boolean;
}

export interface EvalsRoundListResponse {
	success: boolean;
	rounds?: EvalsRoundView[];
	error?: string;
}

export interface EvalsRoundReplayRequest {
	incidentId: string;
	round: number;
	runs?: number;
	/** Edited request messages (edit-and-replay attribution). */
	editedMessages?: unknown[];
	providerId?: string;
	model?: string;
}

export interface EvalsRoundReplayResponse {
	success: boolean;
	attempts?: Array<{
		content: string;
		toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
		finishReason: string;
	}>;
	edited?: boolean;
	error?: string;
}

// ── Snapshot Viewing (S3) ─────────────────────────────

export interface EvalsReadSnapshotRequest {
	path: string;
	/** For .context.jsonl, start loading from this offset (for pagination). */
	offset?: number;
	/** For .context.jsonl, max lines to load. */
	limit?: number;
}

export interface PromptSnapshotView {
	version: number;
	capturedAt: string;
	promptVersion: string;
	sections: Array<{
		name: string;
		hash: string;
		content: string;
	}>;
	truncated: string[];
}

export interface ContextSnapshotMessage {
	role: string;
	content: unknown;
	reasoningContent?: string;
	toolCalls?: Array<{
		toolCallId?: string;
		toolName?: string;
		args?: unknown;
	}>;
	toolCallId?: string;
}

export interface EvalsReadSnapshotResponse {
	success: boolean;
	snapshotType?: "prompt" | "context";
	promptSnapshot?: PromptSnapshotView;
	contextMessages?: ContextSnapshotMessage[];
	total?: number;
	hasMore?: boolean;
	error?: string;
}

// ── Run Detail Viewing ───────────────────────────────

export interface EvalsReadRunDetailRequest {
	detailPath: string;
}

export interface EvalRunCaseAttempt {
	index: number;
	pass: boolean;
	reason: string;
}

export interface EvalRunCaseDetail {
	score: number;
	caseId: string;
	attempts: EvalRunCaseAttempt[];
}

export interface EvalRunDetail {
	version: 1;
	ts: string;
	provider: string;
	model?: string;
	runs: number;
	cases: Record<string, EvalRunCaseDetail>;
}

export interface EvalsReadRunDetailResponse {
	success: boolean;
	detail?: EvalRunDetail;
	error?: string;
}
