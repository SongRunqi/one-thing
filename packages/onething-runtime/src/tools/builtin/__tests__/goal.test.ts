import { describe, expect, it, vi } from "vitest";
import { createGoalTool, type GoalToolAdapters } from "../goal.js";
import type { SessionGoal } from "../../../goals/types.js";

function activeGoal(overrides: Partial<SessionGoal> = {}): SessionGoal {
	return {
		id: "goal-1",
		objective: "fix the theme color bug",
		status: "active",
		tokensUsed: 0,
		timeUsedSeconds: 0,
		continuationCount: 0,
		...overrides,
	};
}

function createContext(sessionId = "test-session") {
	return {
		sessionId,
		messageId: "test-message",
		toolCallId: "test-call",
		workingDirectory: "/tmp",
		metadata: vi.fn(),
	} as never;
}

function createAdapters(goal: SessionGoal): GoalToolAdapters & {
	updateGoalFromModel: ReturnType<typeof vi.fn>;
} {
	const updateGoalFromModel = vi.fn(
		(_sessionId: string, status: string, reason?: string) => ({
			...goal,
			status: status as SessionGoal["status"],
			statusReason: reason,
		}),
	);
	return {
		getGoal: () => goal,
		updateGoalFromModel,
		remainingTokens: () => undefined,
	};
}

describe("goal tool complete gating", () => {
	it("rejects complete without evidence", async () => {
		const adapters = createAdapters(activeGoal());
		const tool = createGoalTool(adapters);

		await expect(
			tool.execute(
				{ action: "complete", reason: "all done" },
				createContext(),
			),
		).rejects.toThrow('complete requires "evidence"');
		expect(adapters.updateGoalFromModel).not.toHaveBeenCalled();
	});

	it("first complete triggers a self-check instead of completing; second complete lands", async () => {
		const adapters = createAdapters(activeGoal());
		const tool = createGoalTool(adapters);
		const args = {
			action: "complete" as const,
			reason: "all done",
			evidence: "1. tests pass (vitest run) 2. color verified in screenshot",
		};

		const first = await tool.execute(args, createContext());
		expect(first.title).toBe("Goal — self-check required");
		expect(adapters.updateGoalFromModel).not.toHaveBeenCalled();

		const second = await tool.execute(args, createContext());
		expect(second.title).toBe("Goal complete");
		expect(adapters.updateGoalFromModel).toHaveBeenCalledWith(
			"test-session",
			"complete",
			"all done",
		);
	});

	it("forces the self-check once per goal, not once per session", async () => {
		const goalA = activeGoal({ id: "goal-a" });
		const goalB = activeGoal({ id: "goal-b" });
		let current = goalA;
		const updateGoalFromModel = vi.fn(
			(_sessionId: string, status: string, reason?: string) => ({
				...current,
				status: status as SessionGoal["status"],
				statusReason: reason,
			}),
		);
		const tool = createGoalTool({
			getGoal: () => current,
			updateGoalFromModel,
			remainingTokens: () => undefined,
		});
		const args = {
			action: "complete" as const,
			reason: "done",
			evidence: "verified",
		};

		await tool.execute(args, createContext());
		await tool.execute(args, createContext());
		expect(updateGoalFromModel).toHaveBeenCalledTimes(1);

		// A new goal in the same session must go through its own self-check.
		current = goalB;
		const first = await tool.execute(args, createContext());
		expect(first.title).toBe("Goal — self-check required");
		expect(updateGoalFromModel).toHaveBeenCalledTimes(1);
	});

	it("pause is not gated by the self-check", async () => {
		const adapters = createAdapters(activeGoal());
		const tool = createGoalTool(adapters);

		const result = await tool.execute(
			{ action: "pause", reason: "need a decision from the user" },
			createContext(),
		);
		expect(result.title).toBe("Goal paused");
		expect(adapters.updateGoalFromModel).toHaveBeenCalledWith(
			"test-session",
			"paused",
			"need a decision from the user",
		);
	});
});
