import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import type { SessionGoal } from "../../goals/types.js";
import { Tool } from "../tool.js";

export interface GoalToolAdapters {
	/** Current goal including pending accounting, if any. */
	getGoal(sessionId: string): SessionGoal | undefined;
	/** Single-writer transition; only 'complete' | 'paused' pass validation. */
	updateGoalFromModel(sessionId: string, status: string, reason?: string): SessionGoal;
	/** Remaining tokens against the effective budget; undefined when uncapped. */
	remainingTokens(goal: SessionGoal): number | undefined;
}

interface GoalMetadata extends JsonObject {
	action: string;
	status?: string;
	[key: string]: JsonObjectProperty;
}

export const GoalParameters = z.object({
	action: z
		.enum(["continue", "complete", "pause", "get"])
		.describe(
			"Your disposition for the active goal: continue (keep working), complete (objective fully satisfied), pause (you need the user), get (read current state).",
		),
	note: z
		.string()
		.optional()
		.describe("For continue: your next concrete step, one short sentence."),
	reason: z
		.string()
		.optional()
		.describe(
			"Required for complete and pause. complete: what was delivered and what evidence verifies it. pause: exactly what you need from the user (a decision, missing input, an external blocker).",
		),
});

function describeGoal(goal: SessionGoal, remaining: number | undefined): string {
	return [
		`objective: ${goal.objective}`,
		`status: ${goal.status}${goal.statusReason ? ` (${goal.statusReason})` : ""}`,
		`tokens_used: ${goal.tokensUsed}`,
		`token_budget: ${goal.tokenBudget ?? "unlimited"}`,
		`remaining_tokens: ${remaining ?? "unlimited"}`,
		`time_used_seconds: ${Math.round(goal.timeUsedSeconds)}`,
		`auto_continuations: ${goal.continuationCount}`,
	].join("\n");
}

export function createGoalTool(
	adapters: GoalToolAdapters,
): Tool.Info<typeof GoalParameters, GoalMetadata> {
	return Tool.define<typeof GoalParameters, GoalMetadata>("goal", {
		name: "Goal",
		description: `Declare how your work toward the session's persistent goal proceeds.

While a goal is active, end every reply by calling this tool with your disposition:
- continue: keep working. Put your next concrete step in "note"; the loop resumes with your plan in hand.
- complete: the objective is fully satisfied. "reason" is required and must summarize what was delivered and what evidence verifies it — it is shown to the user as the delivery summary.
- pause: you need the user. "reason" is required and must state exactly what you need (a decision, missing input, an external blocker). Never pause merely because the work is hard, slow, or long.
- get: read the objective, status and remaining budget at any time.

Creating, resuming and re-budgeting goals belong to the user (/goal command).`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: GoalParameters,

		async execute(args, ctx) {
			if (args.action === "continue") {
				const goal = adapters.getGoal(ctx.sessionId);
				if (!goal) {
					return {
						title: "No goal",
						output: "No goal is set for this session.",
						metadata: { action: args.action },
					};
				}
				if (goal.status !== "active") {
					return {
						title: `Goal ${goal.status}`,
						output: `The goal is ${goal.status}, not active — do not keep working toward it.\n${describeGoal(goal, adapters.remainingTokens(goal))}`,
						metadata: { action: args.action, status: goal.status },
					};
				}
				return {
					title: "Goal — continuing",
					output: `Continue.${args.note ? ` Next step: ${args.note}` : ""}`,
					metadata: { action: args.action, status: goal.status },
				};
			}

			if (args.action === "complete" || args.action === "pause") {
				const reason = args.reason?.trim();
				if (!reason) {
					throw new Error(
						args.action === "complete"
							? 'complete requires "reason": what was delivered and what evidence verifies it'
							: 'pause requires "reason": exactly what you need from the user',
					);
				}
				const updated = adapters.updateGoalFromModel(
					ctx.sessionId,
					args.action === "complete" ? "complete" : "paused",
					reason,
				);
				return {
					title: `Goal ${updated.status}`,
					output: `Goal marked ${updated.status}.\n${describeGoal(updated, adapters.remainingTokens(updated))}`,
					metadata: { action: args.action, status: updated.status },
				};
			}

			const goal = adapters.getGoal(ctx.sessionId);
			const output = goal
				? describeGoal(goal, adapters.remainingTokens(goal))
				: "No goal is set for this session.";
			return {
				title: goal ? `Goal ${goal.status}` : "No goal",
				output,
				metadata: { action: args.action, status: goal?.status },
			};
		},
	});
}
