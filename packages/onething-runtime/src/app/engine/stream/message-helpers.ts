/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from "@shared/ipc.js";
import type { AgentProviderData } from "@onething/core/agent-loop";
import type { JsonObject, JsonValue } from "@shared/json.js";
import type { AIMessageContent } from "../../providers/index.js";
import { logMessageBodyShape } from "./chat-logger.js";
import {
	formatMessagesForLog,
	getTextFromContent,
	historyMessagesForLog,
	renderContextUpdateBlock,
	sanitizeToolResultForAI,
} from "@onething/core/engine";
import {
	buildOnethingHistoryMessages,
	buildOnethingMessageContent,
	filterOnethingHistoryForNonToolAPI,
} from "@onething/runtime/sessions";
import {
	appendCollabReactionSummary,
	buildCollabChatRoomPayload,
	createCollabFoldedAccumulator,
	formatCollabFlattenedToolCall,
	formatCollabDigestLines,
	formatCollabFoldedLine,
	formatCollabNotificationBlock,
	formatCollabUserLabel,
	COLLAB_SYSTEM_SPEAKER_LABEL,
	resolveCollabUnreadRelation,
	wrapCollabMessageEnvelope,
	formatCollabReplyQuote,
	isCollabDriveMessage,
	isCollabPassMessage,
	isCollabProjectedSystemLine,
	isCollabThinkingMessage,
	renderCollabMentionText,
	renderCollabModelMention,
	resolveCollabSpeakerLabel,
	type CollabAgentLike,
	type CollabHistoryWindow,
} from "@onething/runtime/collab";
import { findAgent } from "../../agents/index.js";
import { resolveUserIdentity } from "../../collab/user-identity.js";
import { getCollabDigestsForDays } from "../../collab/digest-store.js";
import * as store from "../../store.js";

export { formatMessagesForLog, getTextFromContent, sanitizeToolResultForAI };

/**
 * Convert message with attachments to multimodal format
 */
export function buildMessageContent(message: ChatMessage): AIMessageContent {
	return buildOnethingMessageContent(prepareUserMessageForModel(message), {
		onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
			console.log("[Chat] Adding image attachment:", {
				mimeType,
				base64Length,
				dataUrlPrefix,
			});
		},
	}) as AIMessageContent;
}

/**
 * History message type for AI conversation
 * Supports user, assistant (with optional tool calls), and tool result messages
 */
export type HistoryMessage =
	| { role: "user"; content: AIMessageContent }
	| {
			role: "assistant";
			content: AIMessageContent;
			reasoningContent?: string;
			providerData?: AgentProviderData[];
			toolCalls?: Array<{
				toolCallId: string;
				toolName: string;
				args: JsonObject;
			}>;
	  }
	| {
			role: "tool";
			content: Array<{
				type: "tool-result";
				toolCallId: string;
				toolName: string;
				result: JsonValue;
			}>;
	  };

/**
 * Build history messages from session messages
 * Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
 * Includes tool calls and tool results for multi-turn tool context preservation
 * Filters out streaming messages (empty assistant messages being generated)
 * When session has a summary, uses [summary] + [recent messages] to reduce context window usage
 */
export function buildHistoryMessages(
	messages: ChatMessage[],
	session?: {
		id?: string;
		summary?: string;
		summaryUpToMessageId?: string;
		kind?: string;
		agentId?: string;
		name?: string;
		// 与 projectRoomMessagesForModel 的第二参同形:这两个字段是原样透传下去的,
		// 声明里漏掉它们不会报错(结构性子类型),只会让下一个读这段的人以为
		// 视野窗口的输入不在这条路上。
		room?: {
			memberAgentIds?: string[];
			context?: {
				historyDays?: number;
				historyTailCount?: number;
				unreadMax?: number;
			};
		};
		collab?: { roomSessionId?: string; seenMessageId?: string };
	},
): HistoryMessage[] {
	return buildOnethingHistoryMessages(
		collapseSupersededGoalDrives(
			projectRoomMessagesForModel(messages, session),
		).map(prepareUserMessageForModel),
		session,
		{
			onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
				console.log("[Chat] Adding image attachment:", {
					mimeType,
					base64Length,
					dataUrlPrefix,
				});
			},
			onCompactedHistory: (details) => {
				logMessageBodyShape(
					"[buildHistoryMessages] compacted history body",
					historyMessagesForLog(details.resultMessages as HistoryMessage[]),
					{
						sessionId: details.sessionId,
						summaryUpToMessageId: details.summaryUpToMessageId,
						summaryIndex: details.summaryIndex,
						totalSessionMessages: details.totalSessionMessages,
						recentSessionMessages: details.recentSessionMessages,
						retainedRecentMessages: details.retainedRecentMessages,
						degradedRecentMessages: details.degradedRecentMessages,
						droppedRecentMessages: details.droppedRecentMessages,
						retainedPayloadChars: details.retainedPayloadChars,
						originalRecentPayloadChars: details.originalRecentPayloadChars,
						retainedPayloadBudgetChars: details.retainedPayloadBudgetChars,
						summaryChars: details.summaryChars,
						retainedMessages: details.retainedMessages,
						degradedMessageIds: details.degradedMessageIds,
						droppedMessages: details.droppedMessages,
					},
				);
			},
			onMissingSummaryAnchor: (details) => {
				console.warn(
					"[buildHistoryMessages] Ignoring summary with missing anchor:",
					{
						sessionId: details.sessionId,
						summaryUpToMessageId: details.summaryUpToMessageId,
					},
				);
			},
		},
	) as HistoryMessage[];
}

/**
 * Room projection (docs/design/collab-chatroom-payload.md):整间房塌成 **一条
 * user 消息**,内容是一块 `<ChatRoom><Members>…</Members><History>…</History>
 * </ChatRoom>` —— 房间侧一个 assistant 轮都没有。为什么是结构层的堵而不是措辞
 * 层的提醒,见 buildCollabChatRoomPayload 的注释。
 *
 * `<History>` 里仍是 D3 的五类:自己的发言逐字原样(W14b),别人的发言重绘 @、
 * 带引用行与表情统计,两者都裹 `<message from>` 信封;别人消息上的 tool calls 拍平
 * 成正文 —— 结构化的 tool 伴生行绝不能到 provider(orphan tool_result → 400)。
 * Coordinator drives、pass turns、W14b thinking records 整条排除;MARKED collab
 * system lines(任务生命周期、成员变动)进 History(W9.1 —— 没有它们,评审方
 * 只知道别的 agent **声称**了什么),未标记的系统行仍是显示态。Ordinary
 * sessions pass through untouched.
 *
 * The RULES are specified and unit-tested in @onething/runtime/collab
 * projection.ts (projectRoomHistory), and the payload itself is assembled by
 * the SAME builder both sides import — 只改一边 = 测试全绿而真机没变。这里多做
 * 的只有 ChatMessage 层的事:attachments 归拢到这一条上、id 取第一条房间消息的。
 *
 * ONE thing is adapter-only and has no counterpart in the pure spec: the
 * `kind === 'agent'` branch below, which turns an EXECUTION session into
 * "room projection + this round's drive". The spec's input is a room message
 * list; it has no notion of an execution session, so there is nothing to
 * mirror there — see the branch's own comment for the boundary.
 *
 * 导出只为可测:attachments 归拢与「id 取第一条房间消息」都活在 ChatMessage
 * 这一层,而 buildHistoryMessages 出口处已经把它们换成 provider 的形状了。
 */
export function projectRoomMessagesForModel(
	messages: ChatMessage[],
	session?: {
		id?: string;
		kind?: string;
		agentId?: string;
		name?: string;
		// 刻意保持**结构性宽松**(不是 ChatSession['room'] / ['collab']):调用点里
		// 有只带 id 的壳和夹具,收窄成完整类型会把它们全部逼着改。
		room?: {
			memberAgentIds?: string[];
			context?: {
				historyDays?: number;
				historyTailCount?: number;
				unreadMax?: number;
			};
		};
		collab?: { roomSessionId?: string; seenMessageId?: string };
	},
	/**
	 * 读者的视野(collab/history-window.ts)。只有 `kind === 'agent'` 那一支算得
	 * 出它(游标存在执行会话上),所以它是**参数**而不是从 session 里读 ——
	 * 一间房被谁读、读到哪儿,不是房间的属性。
	 *
	 * 不给 = 老行为:全量逐字、无折叠、无未读块。
	 */
	window?: CollabHistoryWindow,
): ChatMessage[] {
	/**
	 * 房回合就是一条普通会话(collab-agent-view-v3.md,V2)。
	 *
	 * 这里曾经有一段 `kind === 'agent'` 特判:把整间房**每回合重新投影**一遍拼成
	 * 一条 user 消息,并把这个 agent 自己的历史**整份丢弃**,只从里面捞出最后一条
	 * drive。它造出的是一个能行动、却看不见自己行动史的 agent —— 自己**说过**的
	 * 每句话逐字都在(W14b),自己**做过**的任何一件事都不在。
	 *
	 * 2026-08-01 真机:上帝 dm 发完四张身份牌,下一个回合先硬撑说了句「身份牌不变」,
	 * 再下一轮才承认「谁拿的什么牌 —— 我这边是空白的」。牌一直躺在四间私聊房里,
	 * 丢的是**它知道自己发过牌这件事**。
	 *
	 * 现在房间内容跟着 drive 写进执行会话一次(V1,`turn.ts` 的
	 * `buildDriveRoomContext`),于是这条会话本来就是一段真实对话,落到下面那行
	 * `return messages` 即可 —— 与普通聊天会话同一条路。压缩、工具结果预算、
	 * provider 适配一律不再需要 collab 分支。
	 */
	if (session?.kind !== "room") return messages;
	const selfAgentId = session.agentId;

	/**
	 * 花名册从 system prompt 搬进了载荷(collab-chatroom-payload.md 决定 2),
	 * 所以这里要认得出「这间房里有谁」。房配置随 session 传进来最省事;传的是
	 * 一个只有 id 的壳(旧调用点/夹具)才回 store 取一次。
	 */
	const roomSession = session.room
		? session
		: session.id
			? store.getSession(session.id)
			: undefined;
	const roomName = roomSession?.name;
	const members: CollabAgentLike[] = [];
	const listed = new Set<string>();
	for (const memberId of roomSession?.room?.memberAgentIds ?? []) {
		if (listed.has(memberId)) continue;
		listed.add(memberId);
		const agent = findAgent(memberId);
		// 名册里有 id、全局查不到人 = 这位已被删除。给「前成员#句柄」而不是裸 id:
		// 句柄是真的,而一串 `agent-a1b2…` 在提示词里是个谜题。
		members.push(
			agent
				? {
						id: agent.id,
						name: agent.name,
						title: agent.title,
						description: agent.description,
					}
				: { id: memberId, name: "前成员" },
		);
	}
	// 自己一定在名单里:`— you` 是模型认出 History 里哪几条是自己说的唯一线索,
	// 而 memberAgentIds 在旧会话/夹具里可能压根读不到。
	if (selfAgentId && !listed.has(selfAgentId)) {
		const self = findAgent(selfAgentId);
		members.push(
			self
				? {
						id: self.id,
						name: self.name,
						title: self.title,
						description: self.description,
					}
				: { id: selfAgentId, name: "成员" },
		);
	}

	/**
	 * `<History>` 的行,和归拢到这一条上的 attachments(决定 4:单块之后没有
	 * 别的行可挂,而 merge pass 本来就是这么合并 attachments 的)。
	 */
	const history: string[] = [];
	const unreadLines: string[] = [];
	const folded = createCollabFoldedAccumulator();
	const attachments: NonNullable<ChatMessage["attachments"]> = [];
	/** 第一条**进得了投影**的房间消息 —— 这一条的 id 就是整块的 id(决定 5)。 */
	let anchor: ChatMessage | undefined;
	/**
	 * 三条互斥的去处(collab/history-window.ts):折叠掉 / 进未读块 / 进历史。
	 * 与纯 spec(projection.ts 的同名闭包)必须逐字同构 —— 只改一边 = 测试全绿
	 * 而真机没变。
	 *
	 * 折叠掉的那些**不贡献 attachments、不当 anchor**:它们没进上下文,把它们的
	 * 附件挂上去等于凭空给模型一份它读不到出处的图。
	 */
	const record = (index: number, message: ChatMessage, line: string) => {
		if (window?.folded.has(index)) {
			folded.note(message.timestamp);
			return;
		}
		if (!anchor) anchor = message;
		if (message.attachments?.length) attachments.push(...message.attachments);
		if (window?.unread.has(index)) {
			unreadLines.push(line);
			return;
		}
		history.push(line);
	};
	/** 未读行才带 `rel`;历史里不带(按条计费的固定开销 × 全量投影)。 */
	const relOf = (index: number, message: ChatMessage): { rel?: string } => {
		if (!window?.unread.has(index)) return {};
		return {
			rel: resolveCollabUnreadRelation(message, selfAgentId, (messageId) =>
				messages.find((entry) => entry.id === messageId)?.agentId,
			),
		};
	};

	/**
	 * A speech block dressed with its IM metadata: quote line on top (§3.5 A),
	 * reaction tally on the tail (§3.5 B). Self messages take neither — 自己的
	 * 发言逐字原样进 History(W14b),读到自己没写过的字是最坏的一种失真。
	 */
	const withImMetadata = (message: ChatMessage, block: string): string => {
		const withReactions = appendCollabReactionSummary(block, message.reactions);
		const quote = formatCollabReplyQuote(message.replyTo);
		return quote ? `${quote}\n${withReactions}` : withReactions;
	};

	/**
	 * W14a: `@名字` is repainted from the message's mentions[] against the
	 * CURRENT roster, so a renamed member is addressed by the name it goes by
	 * now. Only the mentioned ids are looked up — the roster slice IS the
	 * mention list. Same rule as the pure spec (projection.ts) and the
	 * willingness window; self messages are exempt — verbatim is verbatim.
	 */
	const renderMentions = (message: ChatMessage): string => {
		if (!message.mentions?.length) return message.content;
		const roster: CollabAgentLike[] = [];
		for (const mention of message.mentions) {
			const agent = findAgent(mention.agentId);
			if (agent) roster.push({ id: agent.id, name: agent.name });
		}
		// 句柄(collab-agent-handle.md §2.3):与纯 spec(projection.ts)逐字同源 ——
		// 只改一边 = 测试全绿而真机没变。
		return renderCollabMentionText(message.content, message.mentions, roster, {
			renderHit: renderCollabModelMention,
		});
	};

	// IM-relay style「名字: 内容」(v3, 用户反馈) — the bracketed [名字 · 职务]
	// script style read as a simulation transcript; titles live in the room note.
	// P2-16: the global lookup IS the fallback here (a member that left the room
	// still exists), so what is left after it is a genuinely unknown speaker —
	// and a raw `agent-a1b2…` in prompt text is a riddle, not a name.
	const speakerLabel = (agentId: string | undefined): string =>
		resolveCollabSpeakerLabel(agentId, [], (id) => findAgent(id)?.name);

	for (const [index, message] of messages.entries()) {
		if (message.role === "assistant") {
			if (isCollabPassMessage(message.content)) continue;
			// W14b: a thinking record is not speech and leaves the projection for
			// everyone, its own author included. Dropping the WHOLE message keeps
			// tool calls and their results together (they ride on one ChatMessage
			// here), so no orphan tool_result can reach a provider.
			if (isCollabThinkingMessage(message)) continue;
			const flattened = (message.toolCalls ?? []).map((call) =>
				formatCollabFlattenedToolCall({
					name: call.toolName,
					arguments: call.arguments,
					result: call.result,
				}),
			);
			if (message.agentId && message.agentId === selfAgentId) {
				// W14b 铁律:自己的历史输出与它当初写的一模一样 —— 不重绘 @、不加
				// 引用行、不加表情统计。toolCalls 照旧拍平(W18 之前的旧转录才会把
				// 它们挂在自身消息上):丢掉就会留下没有调用的 tool_result。
				const own = [message.content, ...flattened].filter(Boolean).join("\n");
				if (own) {
					record(
						index,
						message,
						wrapCollabMessageEnvelope(
							speakerLabel(message.agentId),
							own,
							message.timestamp,
							relOf(index, message),
						),
					);
				}
				continue;
			}
			const body = [renderMentions(message), ...flattened]
				.filter(Boolean)
				.join("\n");
			if (!body) continue;
			// collab-team-v2 §6.2 信封:说话人搬进 from 属性,正文里不再重复名字。
			// 与纯 spec(projection.ts)必须逐字一致 —— 只改一边 = 测试全绿真机没变。
			record(
				index,
				message,
				wrapCollabMessageEnvelope(
					speakerLabel(message.agentId),
					withImMetadata(message, body),
					message.timestamp,
					relOf(index, message),
				),
			);
			continue;
		}
		if (message.role === "user") {
			if (isCollabDriveMessage(message)) continue;
			if (!message.content && !message.attachments?.length) continue;
			// agent-dm-user.md §2.3:署名取「我的资料」里的名字,没配置才是「用户」;
			// 句柄跟着一起(chatroom-payload §1 的样例),与 `<Members>` 的用户行同形。
			// 现取而不是循环外求值 —— 一次投影期间改名的窗口小到无所谓,但把身份
			// 缓存进局部变量正是它以后不跟着改的开始。
			const user = resolveUserIdentity();
			record(
				index,
				message,
				wrapCollabMessageEnvelope(
					formatCollabUserLabel(user.label, user.handle),
					withImMetadata(message, renderMentions(message)),
					message.timestamp,
					relOf(index, message),
				),
			);
			continue;
		}
		if (isCollabProjectedSystemLine(message)) {
			// 系统行进 History(W9.1):没有它们,评审方只知道别的 agent 声称了
			// 什么。role='system' 留在外面等于谁也读不到 —— 下游整类丢弃。
			if (message.content) {
				record(
					index,
					message,
					wrapCollabMessageEnvelope(
						COLLAB_SYSTEM_SPEAKER_LABEL,
						message.content,
						message.timestamp,
						relOf(index, message),
					),
				);
			}
			continue;
		}
		// error/unmarked system are display-only; downstream filtering ignores them.
	}

	// 一条都没有 → 什么也不投(与纯 spec 同):没有房间内容时凭空塞一个空壳
	// 进上下文,只是让模型多读一遍它已经知道的花名册。
	//
	// 「只有未读」照投:那正是"我离开期间群里说了话"这一种最需要被读到的形态。
	if (history.length === 0 && unreadLines.length === 0) return [];
	const identity = resolveUserIdentity();
	const anchorMessage = anchor ?? messages[0];
	const foldedSummary = folded.summary();
	return [
		{
			// 全新的一行,而不是 `...anchorMessage`:整块房间不该继承某一条消息的
			// origin —— goal 折叠与 `X said:` 署名都是按 origin 走的,一条带
			// origin 的首行会让整间房被改写成一句标记。
			id: anchorMessage?.id ?? "collab-room-projection",
			role: "user",
			content: buildCollabChatRoomPayload({
				...(roomSession?.id ? { roomId: roomSession.id } : {}),
				...(roomName ? { roomName } : {}),
				members,
				...(selfAgentId ? { selfAgentId } : {}),
				userLabel: identity.label,
				userHandle: identity.handle,
				history,
				// P2:折叠了才读摘要 —— 没折叠还放摘要,等于把同一天的事说两遍。
				// 读的是**已有的**那些:生成是回合收尾之后的后台任务,所以今天第一个
				// 回合看到的折叠段还没摘要,下一轮才有。
				...(foldedSummary
					? {
							foldedLine: formatCollabFoldedLine(foldedSummary),
							digestLines: formatCollabDigestLines(
								getCollabDigestsForDays(
									roomSession?.id ?? "",
									foldedSummary.days,
								),
							),
						}
					: {}),
				newMessagesBlock: formatCollabNotificationBlock({
					lines: unreadLines,
					...(window?.seenAt !== undefined ? { seenAt: window.seenAt } : {}),
					...(window?.unreadElided ? { elided: window.unreadElided } : {}),
				}),
			}),
			timestamp: anchorMessage?.timestamp ?? Date.now(),
			...(attachments.length ? { attachments } : {}),
		},
	];
}

const SUPERSEDED_GOAL_DRIVE_MARKER =
	"(automatic goal continuation — superseded by a later one)";

/**
 * Goal drives are persisted as user messages whose content is largely the
 * same template each time. Replaying them all verbatim makes the model read
 * the transcript as "the user keeps repeating the same message", so the
 * model view keeps only the newest drive in full and shrinks the superseded
 * ones to a one-line marker. Roles are kept (providers require user/assistant
 * alternation) and the renderer view is untouched — it folds these visually
 * via origin.source already.
 */
export function collapseSupersededGoalDrives(
	messages: ChatMessage[],
): ChatMessage[] {
	let latestGoalDriveIndex = -1;
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "user" && message.origin?.source === "goal") {
			latestGoalDriveIndex = index;
			break;
		}
	}
	if (latestGoalDriveIndex === -1) return messages;

	return messages.map((message, index) => {
		if (index >= latestGoalDriveIndex) return message;
		if (message.role !== "user" || message.origin?.source !== "goal")
			return message;
		return {
			...message,
			content: SUPERSEDED_GOAL_DRIVE_MARKER,
			// The stale turn-context block adds nothing to a superseded ping.
			contextUpdate: undefined,
		};
	});
}

function prepareUserMessageForModel(message: ChatMessage): ChatMessage {
	return appendContextUpdateForModel(labelUserMessageForModel(message));
}

function labelUserMessageForModel(message: ChatMessage): ChatMessage {
	if (message.role !== "user") return message;
	const actor = message.origin?.actor;
	if (!actor) return message;

	const speaker = actor.displayName || actor.handle || actor.externalUserId;
	if (!speaker) return message;
	return {
		...message,
		content: `${speaker} said:\n${message.content}`,
	};
}

/**
 * Render the persisted turn-volatile context block into the model-facing
 * content. The stored field is replayed verbatim on every history rebuild so
 * the request bytes stay identical (prompt-cache safe, append-only history).
 */
function appendContextUpdateForModel(message: ChatMessage): ChatMessage {
	if (message.role !== "user" || !message.contextUpdate) return message;
	return {
		...message,
		content: renderContextUpdateBlock(message.content, message.contextUpdate),
	};
}

/**
 * Filter history messages for non-tool-aware APIs
 * Removes tool messages and extracts only user/assistant messages
 * Used for APIs like generateChatResponseWithReasoning that don't support tool messages
 */
export function filterHistoryForNonToolAPI(
	messages: HistoryMessage[],
): Array<{
	role: "user" | "assistant";
	content: AIMessageContent;
	reasoningContent?: string;
}> {
	return filterOnethingHistoryForNonToolAPI(messages) as Array<{
		role: "user" | "assistant";
		content: AIMessageContent;
		reasoningContent?: string;
	}>;
}
