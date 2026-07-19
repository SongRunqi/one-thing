/**
 * Goal IPC Handlers
 *
 * Thin wrappers over the GoalManager (src/main/goals) — the single writer
 * for session goals. Live updates reach the renderer through the
 * `session:goal-updated` event; these RPCs cover the initial fetch and
 * explicit user mutations from the /goal command.
 */
import { ipcMain } from "electron";
import {
	IPC_CHANNELS,
	type GoalDiffsRequest,
	type GoalDiffsResponse,
	type GoalGetRequest,
	type GoalGetResponse,
	type GoalSetRequest,
	type GoalSetResponse,
} from "../../shared/ipc.js";
import type { SessionGoal } from "../../shared/ipc.js";
import { collectGoalFileDiffs } from "../goals/file-changes.js";
import {
	clearGoal,
	createGoal,
	getGoal,
	updateGoalFromUser,
} from "../goals/index.js";
import { kickGoalRunIfIdle } from "../goals/kick.js";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function registerGoalHandlers(): void {
	ipcMain.handle(
		IPC_CHANNELS.GOAL_GET,
		async (_event, request: GoalGetRequest): Promise<GoalGetResponse> => {
			try {
				return { success: true, goal: (getGoal(request.sessionId) as SessionGoal | undefined) ?? null };
			} catch (error) {
				return { success: false, error: errorMessage(error) };
			}
		},
	);

	ipcMain.handle(
		IPC_CHANNELS.GOAL_SET,
		async (_event, request: GoalSetRequest): Promise<GoalSetResponse> => {
			try {
				switch (request.action) {
					case "create": {
						const goal = createGoal(request.sessionId, {
							objective: request.objective ?? "",
							tokenBudget: request.tokenBudget ?? undefined,
						});
						// No kick on create: the renderer sends the goal
						// declaration as a visible 'goal-set' user message,
						// which is itself the first drive.
						return { success: true, goal: goal as SessionGoal };
					}
					case "update": {
						const goal = updateGoalFromUser(request.sessionId, {
							status: request.status,
							objective: request.objective,
							tokenBudget: request.tokenBudget,
						});
						// Only an explicit resume restarts work; budget or
						// objective edits must not fire runs on their own.
						if (request.status === "active") {
							kickGoalRunIfIdle(request.sessionId, goal);
						}
						return { success: true, goal: goal as SessionGoal };
					}
					case "clear": {
						clearGoal(request.sessionId);
						return { success: true, goal: null };
					}
					default:
						return { success: false, error: `Unknown goal action: ${String(request.action)}` };
				}
			} catch (error) {
				return { success: false, error: errorMessage(error) };
			}
		},
	);

	ipcMain.handle(
		IPC_CHANNELS.GOAL_DIFFS,
		async (_event, request: GoalDiffsRequest): Promise<GoalDiffsResponse> => {
			try {
				const goal = getGoal(request.sessionId) as SessionGoal | undefined;
				if (!goal) {
					return { success: false, error: "No goal is set for this session" };
				}
				// The goal's own lifetime is the review window — the same one
				// the numstat summary on the goal was built from.
				const diffs = await collectGoalFileDiffs(request.sessionId, goal.createdAt);
				return { success: true, goal, diffs };
			} catch (error) {
				return { success: false, error: errorMessage(error) };
			}
		},
	);
}
