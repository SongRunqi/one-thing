import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";
import {
	COLLAB_TASK_STATUSES,
	renderCollabBoardDigest,
	type CollabBoard,
	type CollabBoardAction,
	type CollabTask,
	type CollabTaskStatus,
} from "../../collab/index.js";

export interface BoardToolContext {
	roomSessionId: string;
	/** The acting agent (session.agentId); undefined = the user side. */
	actorAgentId?: string;
}

export interface BoardToolAdapters {
	/** Resolve the room this session belongs to (room itself or its work session). */
	resolveContext(sessionId: string): BoardToolContext | null;
	/** Member display name → agent id (accepts an id passthrough too). */
	resolveMember(roomSessionId: string, nameOrId: string): string | null;
	agentName(agentId: string): string;
	applyAction(
		roomSessionId: string,
		action: CollabBoardAction,
		actor: { type: "user" | "agent"; agentId?: string },
	): Promise<{ board: CollabBoard; task?: CollabTask; error?: string }>;
}

const BoardParameters = z.object({
	action: z.enum(["list", "create", "start", "assign", "move", "update", "comment", "complete", "block"]),
	taskId: z.string().optional().describe("Target task id (from action:list). Required for everything except list/create/start — start without a taskId creates the card it starts."),
	title: z.string().optional().describe("create/update/start: task title (start uses it only when there is no taskId)"),
	description: z.string().optional().describe("create/update/start: task detail — everything the assignee needs to execute independently"),
	assignee: z.string().optional().describe("create/assign: member NAME (as shown in the roster) or agent id"),
	status: z.enum(COLLAB_TASK_STATUSES as [CollabTaskStatus, ...CollabTaskStatus[]]).optional()
		.describe("move: target column"),
	expectedRev: z.number().optional().describe("assign/move/update/complete/block: the task rev you last read — stale revs are rejected so you never overwrite someone else's change"),
	comment: z.string().optional().describe("comment: note appended to the task's activity log"),
	summary: z.string().optional().describe("complete: delivery report (≤2000 chars) — it is posted into the room under your name and reviewed"),
	reason: z.string().optional().describe("block (and move→blocked): why the task cannot proceed — say what you tried and what stopped you; it is stored on the card and shown to whoever has to unblock it"),
});

interface BoardMetadata extends JsonObject {
	action: string;
	taskId?: string;
	[key: string]: JsonObjectProperty;
}

export function createBoardTool(
	adapters: BoardToolAdapters,
): Tool.Info<typeof BoardParameters, BoardMetadata> {
	return Tool.define<typeof BoardParameters, BoardMetadata>("board", {
		name: "Board",
		description: `The room's shared task board (kanban). Columns: backlog → todo → doing → review → done, plus blocked.

- list: read the current board (do this before mutating — you need each task's rev).
- create: add a task. Give it a title and a description complete enough to execute without asking. Adding "assignee" puts it on that member's todo and tells them — they decide when to start.
- start: START WORKING on a task, right now, in your own work session (full tools, no turn limit). Use it for anything that needs more than a couple of tool calls or touches several files. Without a taskId it creates the card first, so you never have to leave the work to file paperwork. You can only start a card that is unassigned (you claim it) or already yours. It is also how you RESUME a card that was interrupted — the same work session is reopened with your history intact.
- assign: put a task on a member (by roster name). Assigning is a notification, not a launch: the assignee gets told, and can ask questions, start, or block it.
- move: change a task's column. Moving an assigned card back to todo (from review, blocked or done) actually re-runs it in a fresh work session — it is a real retry, not a label change.
- comment: append a note to the task's activity log.
- complete: (as the assignee, from your work session) declare the task done with a delivery summary — it moves to review, your summary is posted to the room, and the reviewer takes over. Call this exactly once, as your final action.
- block: mark the task stuck and say why (pass "reason" — it is stored on the card and read by whoever unblocks it). A card that halts twice stops being retried automatically and waits for the user.

State-changing actions (start/assign/move/update/complete/block) take expectedRev from your last read; a stale rev is rejected — re-list and retry.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: BoardParameters,

		async execute(args, ctx) {
			const context = adapters.resolveContext(ctx.sessionId);
			if (!context) {
				return {
					title: "Board unavailable",
					output: "This session has no room board (boards exist only in collab rooms and their work sessions).",
					metadata: { action: args.action },
				};
			}
			const actor = context.actorAgentId
				? { type: "agent" as const, agentId: context.actorAgentId }
				: { type: "user" as const };

			const toAction = (): CollabBoardAction | { error: string } => {
				switch (args.action) {
					case "list":
						return { action: "list" };
					case "create":
						return {
							action: "create",
							title: args.title ?? "",
							description: args.description,
							assigneeAgentId: args.assignee
								? adapters.resolveMember(context.roomSessionId, args.assignee) ?? undefined
								: undefined,
						};
					case "start":
						return {
							action: "start",
							...(args.taskId ? { taskId: args.taskId } : {}),
							...(args.title ? { title: args.title } : {}),
							...(args.description ? { description: args.description } : {}),
							...(args.expectedRev !== undefined ? { expectedRev: args.expectedRev } : {}),
						};
					case "assign": {
						if (!args.taskId) return { error: "assign requires taskId" };
						const member = args.assignee
							? adapters.resolveMember(context.roomSessionId, args.assignee)
							: null;
						if (!member) return { error: `Unknown member: ${args.assignee ?? "(missing assignee)"}` };
						return { action: "assign", taskId: args.taskId, assigneeAgentId: member, expectedRev: args.expectedRev };
					}
					case "move":
						if (!args.taskId || !args.status) return { error: "move requires taskId and status" };
						return { action: "move", taskId: args.taskId, status: args.status, expectedRev: args.expectedRev, reason: args.reason };
					case "update":
						if (!args.taskId) return { error: "update requires taskId" };
						return { action: "update", taskId: args.taskId, title: args.title, description: args.description, expectedRev: args.expectedRev };
					case "comment":
						if (!args.taskId || !args.comment) return { error: "comment requires taskId and comment" };
						return { action: "comment", taskId: args.taskId, comment: args.comment };
					case "complete":
						if (!args.taskId || !args.summary) return { error: "complete requires taskId and summary" };
						return { action: "complete", taskId: args.taskId, summary: args.summary, expectedRev: args.expectedRev };
					case "block":
						if (!args.taskId) return { error: "block requires taskId" };
						return { action: "block", taskId: args.taskId, reason: args.reason, expectedRev: args.expectedRev };
				}
			};

			const planned = toAction();
			if ("error" in planned) {
				return {
					title: "Board — invalid call",
					output: planned.error,
					metadata: { action: args.action, taskId: args.taskId },
				};
			}

			const result = await adapters.applyAction(context.roomSessionId, planned, actor);
			if (result.error) {
				return {
					title: "Board — rejected",
					output: result.error,
					metadata: { action: args.action, taskId: args.taskId },
				};
			}

			// W10: an agent reads its own cards as 「你(小研)」. The identity comes
			// from the host-resolved context (room turn: the room session's agentId;
			// work session: its assignee) — the user side has no actorAgentId and
			// keeps the plain third-person board.
			const self = context.actorAgentId
				? { agentId: context.actorAgentId, name: adapters.agentName(context.actorAgentId) }
				: undefined;
			const digest = renderCollabBoardDigest(result.board, adapters.agentName, self);
			const headline = result.task
				? `${args.action} ok: #${result.task.id.slice(0, 8)}「${result.task.title}」[${result.task.status}] rev${result.task.rev}`
				: "board";
			return {
				title: `Board — ${args.action}`,
				output: `${headline}\n\n${digest}`,
				metadata: { action: args.action, taskId: result.task?.id ?? args.taskId },
			};
		},
	});
}
