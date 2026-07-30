import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";

/**
 * `dm` — 找某位同事单独说句话 (agent-im-dm.md D5/§3.4).
 *
 * The counterpart of `say`: `say` speaks into the room this turn is answering,
 * `dm` opens (or reuses) the two-person room with ONE named colleague and drops
 * a message there. Everything that decides whether it lands — does that agent
 * exist, is it a colleague, is it retired, is it me — lives behind the adapter,
 * because all of it needs the store; this file only owns the contract the model
 * sees.
 *
 * Two properties of that contract are load-bearing and therefore spelled out in
 * the description rather than left to be discovered:
 *
 *  - **没有上下文搬运**. The room is created empty (§3.4 防滥用): dumping the
 *    group transcript into it would be a token flood and an information leak in
 *    one move. The sender writes the background itself, or points the other side
 *    at a tool it can query.
 *  - **用户看得见** (D4 透明制). A dm room sits in the sidebar and the user can
 *    read it and speak into it at any time. Saying so is not a warning, it is
 *    the world model: there is no back channel in this system, so an agent that
 *    believes there is one will act on a fiction.
 */

export interface DmToolResult {
	ok: boolean;
	/** The two-person room the message landed in — present only on success. */
	roomSessionId?: string;
	/** Persisted room message id — present only on success. */
	messageId?: string;
	/** Display name of the addressee, for the receipt. */
	peerName?: string;
	/** Why it did not deliver, in words meant for the agent itself. */
	error?: string;
}

export interface DmToolAdapters {
	/**
	 * Resolve the addressee, get-or-create the pair room, persist the message as
	 * this agent's own utterance, and activate the other side. Refusals (unknown
	 * agent, 已注销, service agent, 自己) come back as `{ ok: false, error }` —
	 * the caller is told in words, never silently dropped.
	 */
	send(input: {
		sessionId: string;
		to: string;
		message: string;
	}): Promise<DmToolResult>;
}

const DmParameters = z.object({
	to: z.string().describe("Agent id of the colleague to talk to (from the roster). Not a name."),
	message: z.string().describe("What you are saying to them, as one chat message. Include the background they need — they cannot see where you are coming from."),
});

interface DmMetadata extends JsonObject {
	ok: boolean;
	roomSessionId?: string;
	messageId?: string;
	[key: string]: JsonObjectProperty;
}

export function createDmTool(
	adapters: DmToolAdapters,
): Tool.Info<typeof DmParameters, DmMetadata> {
	return Tool.define<typeof DmParameters, DmMetadata>("dm", {
		name: "Dm",
		description: `Say something to ONE colleague privately. Opens a two-person chat with them (reused if it already exists) and delivers your message there; they get pulled in to answer.

- Use it to align on a detail with one person instead of making the whole group read it. Bring the conclusion back with "say".
- NOTHING is carried over: the other side does not see this conversation, the board, or what you were just asked. Whatever background they need, write it into the message.
- The user can see and join this private chat — it is a side room, not a back channel.
- It is for talking. Work that actually changes things goes back to the group as a board card.
- Fails (and tells you so) if that id is not an active colleague, or if it is you.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: DmParameters,

		async execute(args, ctx) {
			const result = await adapters.send({
				sessionId: ctx.sessionId,
				to: args.to,
				message: args.message,
			});

			if (!result.ok) {
				return {
					title: "Dm — 未送达",
					output: result.error ?? "私聊未送达。",
					metadata: { ok: false },
				};
			}

			return {
				title: "Dm",
				output: `已发给 ${result.peerName || args.to};TA 会在你们的私聊里回复,用户也看得见。`,
				metadata: {
					ok: true,
					roomSessionId: result.roomSessionId,
					messageId: result.messageId,
				},
			};
		},
	});
}
