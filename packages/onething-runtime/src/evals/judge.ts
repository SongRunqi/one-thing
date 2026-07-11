/**
 * LLM Judge for evaluating turn quality.
 * Phase 3 of the prompt evaluation system.
 *
 * Usage:
 * - Judge only turns with negative implicit signals + random 10% sample.
 * - Output: score (0-1), category (failure classification), reason (one sentence).
 * - Requires calibration: human-annotated set of >=20 turns, judge accuracy >=85%.
 */

/**
 * Failure categories aligned with builder sections for attribution.
 */
export const JUDGE_CATEGORIES = [
	"missed-directory-switch",
	"ignored-skill-instructions",
	"voice-mode-violation",
	"ignored-known-projects",
	"wrong-platform-behavior",
	"ignored-agent-instructions",
	"general-poor-response",
	"not-prompt-fault",
] as const;

export type JudgeCategory = (typeof JUDGE_CATEGORIES)[number];

export interface JudgeResult {
	score: number; // 0-1, where 1 = perfect
	category: JudgeCategory;
	reason: string; // one-sentence explanation
}

export interface JudgeInput {
	userMessage: string;
	assistantResponse: string;
	promptContext?: string; // optional: the system prompt used
	signals?: {
		retried?: boolean;
		editResent?: boolean;
		toolErrors?: number;
		streamAborted?: boolean;
	};
}

/**
 * Build the judge system prompt. Designed to be cheap to run
 * (works well with fast models like haiku/flash).
 */
export function buildJudgePrompt(): string {
	return [
		"You are an expert evaluator of AI chat assistant responses. Your job is to judge whether an AI assistant responded appropriately to a user request, given the system prompt instructions it was given.",
		"",
		"Output a JSON object with:",
		"- score: number between 0 and 1 (1 = perfect, 0 = completely wrong)",
		"- category: one of:",
		...JUDGE_CATEGORIES.map((c) => `  - ${c}`),
		"- reason: one-sentence explanation of the score",
		"",
		"Categories guide:",
		"- missed-directory-switch: assistant should have switched working directory but did not",
		"- ignored-skill-instructions: assistant should have used a skill instruction but did not",
		"- voice-mode-violation: assistant used code blocks or long output in voice mode",
		"- ignored-known-projects: assistant did not use known project context when relevant",
		"- wrong-platform-behavior: assistant used wrong OS syntax",
		"- ignored-agent-instructions: assistant ignored custom agent instructions",
		"- general-poor-response: response was poor but not attributable to a specific section",
		"- not-prompt-fault: the failure is not attributable to prompt design (model limitation, tool failure, etc.)",
		"",
		"Be objective and concise. Only flag issues when the assistant clearly violated instructions.",
	].join("\n");
}

/**
 * Build the user message for the judge, containing the prompt context and the exchange.
 */
export function buildJudgeUserMessage(input: JudgeInput): string {
	const parts: string[] = [];

	if (input.promptContext) {
		parts.push("# System Prompt Context");
		parts.push("The system prompt given to the assistant (abbreviated):");
		parts.push(input.promptContext.slice(0, 2000));
		parts.push("");
	}

	if (input.signals) {
		parts.push("# Signals");
		const sigs: string[] = [];
		if (input.signals.retried)
			sigs.push("- User retried the response (strong negative)");
		if (input.signals.editResent)
			sigs.push("- User edited and resent (strong negative)");
		if (input.signals.toolErrors && input.signals.toolErrors > 0)
			sigs.push(`- ${input.signals.toolErrors} tool error(s)`);
		if (input.signals.streamAborted) sigs.push("- Stream was aborted");
		parts.push(sigs.join("\n"));
		parts.push("");
	}

	parts.push("# User Message");
	parts.push(input.userMessage);
	parts.push("");
	parts.push("# Assistant Response");
	parts.push(input.assistantResponse.slice(0, 4000));
	parts.push("");
	parts.push("Evaluate the assistant response. Return JSON only.");

	return parts.join("\n");
}

/**
 * Parse judge output (robust against markdown code fences).
 */
export function parseJudgeOutput(output: string): JudgeResult | null {
	try {
		// Try direct JSON parse
		return validateJudgeResult(JSON.parse(output));
	} catch {
		// Try extracting from markdown code fence
		const fenceMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fenceMatch) {
			try {
				return validateJudgeResult(JSON.parse(fenceMatch[1].trim()));
			} catch {
				// Fall through
			}
		}
		// Try extracting first JSON object
		const jsonMatch = output.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return validateJudgeResult(JSON.parse(jsonMatch[0]));
			} catch {
				// Fall through
			}
		}
		return null;
	}
}

// ── Rubric judging (workbench W2/W4, design D5) ────────
//
// Per-incident rubric judging asks a NARROW question — "does this replay
// satisfy the user's stated expectation?" — which needs no global judge
// calibration (the rubric is human-provided at 👎 time or AI-extracted
// from the note).

export interface RubricVerdict {
	pass: boolean;
	reason: string;
}

export function buildRubricJudgeMessages(options: {
	/** The expectation to judge against (👎 note or AI-extracted rubric). */
	rubric: string;
	userMessage: string;
	/** Compact text view of the replay transcript (transcriptToText). */
	transcriptText: string;
	/** Optional: what the assistant originally did (to detect "same mistake"). */
	originalBehavior?: string;
	/** Fraction of tool results that were simulated/stubbed, for honesty. */
	mockCaveat?: string;
}): { system: string; user: string } {
	const system = [
		"You judge whether an AI assistant's behavior satisfies a specific expectation.",
		"Answer ONLY with a JSON object: {\"pass\": boolean, \"reason\": \"one sentence\"}.",
		"pass=true only when the behavior clearly satisfies the expectation; be strict.",
		"Tool results marked simulated/stub are replay mocks — judge the assistant's INTENT and actions, not mock content quality.",
	].join("\n");

	const parts = [
		"# Expectation (judge against this)",
		options.rubric,
		"",
		"# User request",
		options.userMessage,
		"",
	];
	if (options.originalBehavior) {
		parts.push(
			"# Original (bad) behavior for reference",
			options.originalBehavior,
			"",
		);
	}
	if (options.mockCaveat) {
		parts.push(`# Replay note`, options.mockCaveat, "");
	}
	parts.push("# Replayed behavior (judge this)", options.transcriptText, "");
	parts.push("Return the JSON verdict only.");

	return { system, user: parts.join("\n") };
}

export function parseRubricVerdict(output: string): RubricVerdict | null {
	const candidates = [output];
	const fence = output.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence) candidates.push(fence[1].trim());
	const obj = output.match(/\{[\s\S]*\}/);
	if (obj) candidates.push(obj[0]);

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			if (typeof parsed?.pass === "boolean") {
				return { pass: parsed.pass, reason: String(parsed.reason ?? "") };
			}
		} catch {
			// try next candidate
		}
	}
	return null;
}

function validateJudgeResult(raw: unknown): JudgeResult {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("Judge output is not an object");
	}

	const obj = raw as Record<string, unknown>;

	if (typeof obj.score !== "number" || obj.score < 0 || obj.score > 1) {
		throw new Error(`Invalid score: ${obj.score}`);
	}

	const category = String(obj.category ?? "");
	if (!(JUDGE_CATEGORIES as readonly string[]).includes(category)) {
		throw new Error(`Invalid category: ${category}`);
	}

	return {
		score: obj.score,
		category: category as JudgeCategory,
		reason: String(obj.reason ?? ""),
	};
}
