import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";
import { formatCollabSayReceipt } from "../../collab/index.js";

/**
 * `say` — 说话即行动 (W14b, docs/design/multi-agent-collab-im.md §4.5).
 *
 * The turn is thinking; THIS is speaking. Everything the executor needs to
 * decide (which room, is it frozen, is the budget spent, who may be mentioned)
 * lives behind one adapter, because all of it needs the store — this file only
 * owns the contract the model sees.
 */

export interface SayToolResult {
	ok: boolean;
	/** Persisted room message id — present only on success. */
	messageId?: string;
	/** Why it did not deliver, in words meant for the agent itself. */
	error?: string;
}

export interface SayToolAdapters {
	/**
	 * Persist + broadcast the utterance into the room this session belongs to
	 * (a room session speaks into itself; a work session speaks into its parent
	 * room). Gate refusals (frozen / over budget / not a member) come back as
	 * `{ ok: false, error }` — the agent is told its words did not land.
	 */
	speak(input: {
		sessionId: string;
		content: string;
		mentions?: string[];
		replyTo?: string;
		/** W18: explicit target room. Omitted = the room this turn answers. */
		room?: string;
	}): Promise<SayToolResult>;
}

const SayParameters = z.object({
	content: z.string().describe("What you are saying, as it will appear in the room. Keep it a chat message — short, plain, no headers."),
	mentions: z.array(z.string()).optional()
		.describe("Agent ids to address (from the roster). Writing @名字 in the content works too; this parameter is what makes it exact."),
	replyTo: z.string().optional()
		.describe("Message id this is a reply to — the room shows your message with that one quoted above it. Only worth using when the thing you answer has scrolled away."),
	room: z.string().optional()
		.describe("Room (group chat) session id to speak into. Leave it out: by default you speak into the room whose message you are answering."),
});

interface SayMetadata extends JsonObject {
	ok: boolean;
	messageId?: string;
	[key: string]: JsonObjectProperty;
}

export function createSayTool(
	adapters: SayToolAdapters,
): Tool.Info<typeof SayParameters, SayMetadata> {
	return Tool.define<typeof SayParameters, SayMetadata>("say", {
		name: "Say",
		description: `Speak in the room. This is the ONLY way anything you produce reaches the other members — the rest of this turn is your own thinking and nobody sees it.

- Call it as many times as you have things to say; each call is one message, the way people send several short lines instead of one essay.
- Not calling it at all is silence, and silence is a normal outcome: if you have nothing to add, say nothing.
- "mentions" addresses specific members by id; "replyTo" quotes a specific message.
- If the room is paused or out of budget the call FAILS and tells you so — your words did not reach anyone, and repeating them will not help until that clears.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: SayParameters,

		async execute(args, ctx) {
			const result = await adapters.speak({
				sessionId: ctx.sessionId,
				content: args.content,
				...(args.mentions ? { mentions: args.mentions } : {}),
				...(args.replyTo ? { replyTo: args.replyTo } : {}),
				...(args.room ? { room: args.room } : {}),
			});

			if (!result.ok) {
				return {
					title: "Say — 未送达",
					output: result.error ?? "发言未送达。",
					metadata: { ok: false },
				};
			}

			return {
				title: "Say",
				output: formatCollabSayReceipt(result.messageId ?? ""),
				metadata: { ok: true, messageId: result.messageId },
			};
		},
	});
}
