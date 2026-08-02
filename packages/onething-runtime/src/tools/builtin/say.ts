import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";
import {
	COLLAB_SAY_REFUSED_EMPTY,
	COLLAB_SEND_MESSAGE_TOOL_NAME,
	COLLAB_SEND_REFUSED_GATEWAY,
	formatCollabDmReceipt,
	formatCollabSayReceipt,
	resolveCollabSendChannel,
} from "../../collab/index.js";

/**
 * `send_message` — 聊天应用的发送按钮
 * (docs/design/collab-turn-protocol-and-identity.md A.2 ①)。
 *
 * 2026-08-02 从 `say` 改名。`say`(言说动作)与「回合正文=我的发言」这条训练
 * 先例同向,于是提示词越劝越像自辩;`send_message` 是模型在海量 bot/agent 数据
 * 里见过的那个 API —— "要让消息出现在聊天里就调 send"是它熟练的既有行为。
 *
 * 同日**合并了 `dm`**(docs/design/collab-send-channel-and-wake.md §2):两者
 * 本来就是同一条链路(`dm` 的落库就是 say 的执行器 + 显式房间),差的只是
 * 「收件人解析 + 建房 + 送达即激活」三步前奏。合并之后一个工具带一个 channel:
 * 有 `to` 就是私聊档,否则是房间档 —— 模型可以完全不写 channel。
 *
 * **落盘不动**:消息 source 仍是 `COLLAB_SAY_SOURCE`('collab-say'),渲染层认
 * source 不认工具名,历史转录零迁移。工具名是进程内符号,source 是持久化约定,
 * 两者从 W14b 起就是解耦的。
 *
 * Everything the executor needs to decide (which room, is it frozen, is the
 * budget spent, who may be mentioned, who is 「小明#3f9c」) lives behind the
 * adapters, because all of it needs the store — this file only owns the
 * contract the model sees.
 */

export interface SayToolResult {
	ok: boolean;
	/** Persisted room message id — present only on success. */
	messageId?: string;
	/** Why it did not deliver, in words meant for the agent itself. */
	error?: string;
}

/**
 * 私聊档的结果。收件人是同事还是用户本人(agent-dm-user.md §3.2)决定回执用
 * 哪一版:发给人的那一版必须说清「TA 不一定在线」,否则 agent 会发完就停轮空
 * 等回复。
 */
export interface CollabDmSendResult {
	ok: boolean;
	targetKind?: "user" | "agent";
	/** The two-person room the message landed in — present only on success. */
	roomSessionId?: string;
	/** Persisted room message id — present only on success. */
	messageId?: string;
	/** Display name of the addressee, for the receipt. */
	peerName?: string;
	/** 登记了 wake 时,poke 会落在哪个群(房名)—— 回执要说清地名。 */
	wakeRoomName?: string;
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

	/**
	 * 私聊档(设计 §2.2):解析收件人、开(或复用)两个人的房、以本人身份落库、
	 * 送达即激活对方。`wake` 时再登记一次跨房唤醒 —— 校验全部在这里 fail fast,
	 * 兑现在对方读完之后。
	 */
	sendDm(input: {
		sessionId: string;
		to: string;
		content: string;
		wake?: boolean;
		wakeRoom?: string;
	}): Promise<CollabDmSendResult>;
}

const SayParameters = z.object({
	content: z.string().describe("The message to deliver, exactly as it will appear in the chat. Keep it a chat message — short lines, not an essay; markdown (lists, tables, code) renders fine when the content calls for it."),
	to: z.string().optional()
		.describe("Send this to ONE person privately instead of into this chat, as the roster writes them: 名字#句柄 (or just #句柄). A bare name works when only one colleague goes by it. Write 用户 (or the user's own 名字#句柄) to reach the user themselves."),
	channel: z.enum(["room", "dm", "gateway"]).optional()
		.describe("Where this goes. Leave it out: \"dm\" when you gave a \"to\", \"room\" otherwise."),
	wake: z.boolean().optional()
		.describe("Private messages only: after they have read it, an @ goes out in the room asking them to respond there. None of the private message is carried over — only the fact that you wrote to them."),
	wakeRoom: z.string().optional()
		.describe("Which chat that @ goes into. Leave it out: by default it is the chat this turn is answering."),
	mentions: z.array(z.string()).optional()
		.describe("Agent ids to address. Rarely needed: writing @名字#句柄 in the content (the handle is what the roster shows after each name) already addresses them exactly."),
	replyTo: z.string().optional()
		.describe("Message id this is a reply to — the chat shows your message with that one quoted above it. Only worth using when the thing you answer has scrolled away."),
	room: z.string().optional()
		.describe("Session id of the chat to send into. Leave it out: by default it goes to the chat whose message you are answering."),
});

interface SayMetadata extends JsonObject {
	ok: boolean;
	messageId?: string;
	[key: string]: JsonObjectProperty;
}

/**
 * 合并后的描述。前半是 say 的原文,后半是 `dm` 描述里那四条**负重事实**
 * (设计 §2.2)——它们不是修辞,每一条对应一个真实机制,漏掉哪一条 agent 就会
 * 按错误的世界模型行动:
 *
 *  - **没有上下文搬运**:房是空的建出来的(agent-im-dm.md §3.4 防滥用),转运
 *    群历史会同时是一次 token 洪水和一次信息泄露;
 *  - **用户看得见**(D4 透明制):私聊房在侧栏里,用户随时能读能插话。这不是
 *    警告而是世界模型 —— 系统里不存在暗通道,以为存在的 agent 会照着虚构行动;
 *  - **可以 dm 用户本人**;
 *  - **谈事不干活**:正经活回大群立卡。
 */
const SEND_MESSAGE_DESCRIPTION = `Send a message to the chat, or privately to one person.
Exactly like pressing send in a chat app: only the text passed as "content" gets delivered. Nothing written anywhere else is visible to anyone.

- One call = one message bubble; send a few short messages the way people do.
- markdown in "content" renders fine (lists, tables, code).
- @名字#句柄 addresses someone (handle from the roster); "replyTo" quotes a message.
- If the chat is paused or out of budget the send FAILS and tells you so.

With "to" it goes to a private chat with that one person instead — opened if it does not exist yet, and they get pulled in to answer.
- Use it to settle a detail with one person instead of making the whole group read it. Bring the conclusion back with a plain send_message.
- NOTHING is carried over: they cannot see this conversation, the board, or what you were just asked. Whatever background they need, write it into the message.
- The user can see and join that private chat — it is a side room, not a back channel.
- You can write to the user themselves (to: "用户" or their name/handle). They may be away; the message waits with a notification, don't block on a reply.
- A private chat is for talking. Work that actually changes things goes back to the group as a board card.
- "wake": after they read it, an @ goes out in the room asking them to respond there. Use it when you need them to show up in the group, not just to read you.
- Fails (and tells you so) if "to" names no active colleague, if two colleagues share the name you gave (add the handle), or if it is you.`;

export function createSayTool(
	adapters: SayToolAdapters,
): Tool.Info<typeof SayParameters, SayMetadata> {
	return Tool.define<typeof SayParameters, SayMetadata>(
		COLLAB_SEND_MESSAGE_TOOL_NAME,
		{
			name: "Send message",
			description: SEND_MESSAGE_DESCRIPTION,
			category: "builtin",
			enabled: true,
			autoExecute: true,
			permissionGuard: "safe",
			executionMode: "sequential",
			renderKind: "text",

			parameters: SayParameters,

			async execute(args, ctx) {
				// 路由是纯规则(设计 §2.1/§2.3):推断 + 矛盾检查在一处,门在执行器里。
				const route = resolveCollabSendChannel(args);
				if (!route.ok) {
					return {
						title: "Send message — 未送达",
						output: route.error,
						metadata: { ok: false },
					};
				}

				if (route.channel === "gateway") {
					// P3 才接 outbound dispatch。占坑的意义在于:那一天改的是这一支,
					// 不是工具契约 —— 模型学到的写法不用再改一次。
					return {
						title: "Send message — 未送达",
						output: COLLAB_SEND_REFUSED_GATEWAY,
						metadata: { ok: false },
					};
				}

				if (route.channel === "dm") {
					const dm = await adapters.sendDm({
						sessionId: ctx.sessionId,
						to: args.to ?? "",
						content: args.content,
						...(args.wake ? { wake: true } : {}),
						...(args.wakeRoom ? { wakeRoom: args.wakeRoom } : {}),
					});
					if (!dm.ok) {
						return {
							title: "Send message — 未送达",
							output: dm.error ?? "私聊未送达。",
							metadata: { ok: false },
						};
					}
					return {
						title: "Send message",
						output: formatCollabDmReceipt({
							targetKind: dm.targetKind ?? "agent",
							peerName: dm.peerName || (args.to ?? ""),
							...(dm.wakeRoomName ? { wakeRoomName: dm.wakeRoomName } : {}),
						}),
						metadata: {
							ok: true,
							roomSessionId: dm.roomSessionId,
							messageId: dm.messageId,
						},
					};
				}

				const result = await adapters.speak({
					sessionId: ctx.sessionId,
					content: args.content,
					...(args.mentions ? { mentions: args.mentions } : {}),
					...(args.replyTo ? { replyTo: args.replyTo } : {}),
					...(args.room ? { room: args.room } : {}),
				});

				if (!result.ok) {
					return {
						title: "Send message — 未送达",
						output: result.error ?? "消息未送达。",
						metadata: { ok: false },
					};
				}

				return {
					title: "Send message",
					output: formatCollabSayReceipt(result.messageId ?? ""),
					metadata: { ok: true, messageId: result.messageId },
				};
			},

			/**
			 * legacy `dm` 的**降级出口**(设计 §5 R1;§9.3 偏离条)。
			 *
			 * `dm` 走退役名表转发到这里,但两者参数名不同形:`to` 是合并面的正式
			 * 参数、活着进来,`message` 不是 —— zod 把它 strip 掉,于是 `content`
			 * 缺席,校验就在这一层失败。设计原文以为它会落到执行器的空正文提前判
			 * 上,实际到不了(`content` 必填,校验先一步拦下),所以那句可操作的
			 * 拒绝语在这里**逐字**给出,而不是一坨 zod issue —— 模型手上还攥着
			 * 原文,读到「content 是空的」就知道下一轮换参数名重发。执行器那一半
			 * (`content: ""`,过得了 zod)照旧由 `sendCollabDm` 的提前判接住,
			 * 两处同一句话。
			 *
			 * 其余校验错误(比如 `mentions` 传了个数字)与这次降级无关,按常规逐条
			 * 列出 —— 把它们也说成「content 是空的」会把模型引到错的地方。
			 */
			formatValidationError(error) {
				if (error.issues.some((issue) => issue.path[0] === "content")) {
					return COLLAB_SAY_REFUSED_EMPTY;
				}
				const issues = error.issues.map(
					(issue) => `- ${issue.path.join(".")}: ${issue.message}`,
				);
				return `Invalid send_message parameters:\n${issues.join("\n")}`;
			},
		},
	);
}
