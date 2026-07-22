/**
 * Billing helpers for side-line model calls.
 *
 * The main chat turn bills itself from the agent-loop executor, but every
 * other model call the app makes on the user's behalf — title generation,
 * memory capture/review, skill review — historically never reached the ledger
 * at all. That made a whole category of spend invisible: these run on the
 * tool-call model, in the background, without any UI showing they happened.
 *
 * Each helper returns a callback so the call sites stay one line, and each one
 * swallows its own errors: billing must never break the work it is measuring.
 */
import { ONETHING_USAGE_SOURCES } from "@onething/runtime/usage";
import { recordUsage } from "./index.js";

export interface SideLineUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

function bill(
	label: string,
	source: string,
	providerId: string,
	modelId: string,
	sessionId?: string,
): (usage: SideLineUsage) => void {
	return (usage) => {
		try {
			recordUsage({ sessionId, providerId, modelId, source, usage });
		} catch (error) {
			console.error(`[usage] recordUsage failed for ${label}:`, error);
		}
	};
}

/** Session title generation (runs once per session, on the tool-call model). */
export function billTitleUsage(
	providerId: string,
	modelId: string,
	sessionId?: string,
): (usage: SideLineUsage) => void {
	return bill("title", ONETHING_USAGE_SOURCES.title, providerId, modelId, sessionId);
}

/** Session TOC segmentation — one call per substantive turn. */
export function billTocUsage(
	providerId: string,
	modelId: string,
	sessionId?: string,
): (usage: SideLineUsage) => void {
	return bill("session toc", ONETHING_USAGE_SOURCES.toc, providerId, modelId, sessionId);
}

/** The skill-review trigger's agent loop. */
export function billSkillUsage(
	providerId: string,
	modelId: string,
	sessionId?: string,
): (usage: SideLineUsage) => void {
	return bill("skill review", ONETHING_USAGE_SOURCES.skill, providerId, modelId, sessionId);
}
