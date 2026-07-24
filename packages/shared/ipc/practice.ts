/**
 * Practice system IPC types: kegel / pomodoro rhythm sessions plus manual
 * exercise logging. See docs/design/practice-system.md.
 */
import type {
	OnethingPracticeConfig,
	OnethingPracticeEngineSnapshot,
	OnethingPracticeExerciseDetail,
	OnethingPracticeLedgerRecord,
	OnethingPracticePhaseEdge,
	OnethingPracticeSummaryGranularity,
	OnethingPracticeSummaryResult,
} from "@onething/runtime/practice";

export type PracticeSnapshot = OnethingPracticeEngineSnapshot;
export type PracticePhaseEdge = OnethingPracticePhaseEdge;
export type PracticeConfig = OnethingPracticeConfig;
export type PracticeLedgerRecord = OnethingPracticeLedgerRecord;
export type PracticeSummaryGranularity = OnethingPracticeSummaryGranularity;
export type PracticeSummaryResult = OnethingPracticeSummaryResult;

export type PracticeStartRequest =
	| { kind: "kegel" }
	| { kind: "pomodoro"; category: string; label?: string };

export interface PracticeStopRequest {
	/** Cancel: drop the session without settling a ledger record. */
	discard?: boolean;
}

export interface PracticeStateResponse {
	snapshot: PracticeSnapshot;
}

/** Manual/agent quick-log: either sets×reps or a duration (or both). */
export interface PracticeLogRequest {
	name: string;
	source: "manual" | "agent";
	exercise: OnethingPracticeExerciseDetail;
	note?: string;
	ts?: number;
}

export interface PracticeLogResponse {
	record: PracticeLedgerRecord;
}

export interface PracticeSummaryRequest {
	granularity: PracticeSummaryGranularity;
	count?: number;
}

export interface PracticeRecentRequest {
	/** Trailing window in days (default 7). */
	days?: number;
	limit?: number;
}

export interface PracticeRecentResponse {
	records: PracticeLedgerRecord[];
}

export interface PracticeSetConfigRequest {
	config: {
		kegel?: Partial<PracticeConfig["kegel"]>;
		pomodoro?: Partial<PracticeConfig["pomodoro"]>;
	};
}

export interface PracticeConfigResponse {
	config: PracticeConfig;
}

/**
 * Pushed to the renderer on every engine transition and ~1 Hz while running.
 * `settled` is present exactly once per session, when it lands in the ledger.
 */
export interface PracticeEventPayload {
	snapshot: PracticeSnapshot;
	edges: PracticePhaseEdge[];
	settled?: PracticeLedgerRecord;
}
