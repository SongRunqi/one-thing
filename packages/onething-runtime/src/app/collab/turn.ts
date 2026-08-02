/**
 * One room turn, end to end (R2 split out of the coordinator).
 *
 * W18 moved a room turn into the agent's own EXECUTION session: the room is
 * still the subject (roster, projection material, gates, chain, cascade and
 * typing all read it) but no longer the host — the drive, the thinking and
 * every tool call land in `agent-exec-<agentId>`, and the only thing that
 * reaches the room is whatever `say` puts there.
 *
 * Everything scoped to that window lives here: waiting for the terminal event,
 * aborting it, the per-agent lock that keeps two rooms from putting two streams
 * on one execution session, the circuit breaker, and the harvest.
 *
 * The cascade (what a turn's utterances activate next) is INJECTED rather than
 * imported: the queue drives turns and turns feed the queue, and passing the
 * two entry points down as a parameter breaks that cycle without a
 * module-level host that has to be initialised in the right order.
 */
import { randomUUID } from "node:crypto";
import {
	COLLAB_MESSAGE_SOURCE,
	COLLAB_USAGE_SOURCE_ROOM,
	buildCollabChainHoldLine,
	buildCollabDriveRoomContext,
	buildCollabElsewhere,
	collabAgentSessionId,
	collectCollabFoldedFacts,
	formatCollabAgentHandle,
	formatCollabNotificationBlock,
	createCollabTurnCircuitBreaker,
	decideCollabActivations,
	formatCollabTurnBreakerNote,
	isCollabDriveMessage,
	isCollabHarvestMessage,
	isCollabPassMessage,
	isCollabSayMessage,
	isAgentPairDmRoom,
	isCollabThinkingMessage,
	isUserDmRoom,
	resolveCollabChainCap,
	planCollabHistoryWindow,
	resolveCollabTurnBreakerLimits,
	type CollabMentionLike,
	type CollabElsewhereSource,
} from "@onething/runtime/collab";
import type { ChatMessage, ChatSession } from "@shared/ipc.js";
import * as store from "../store.js";
import { getEventBus } from "../events/index.js";
import { getStreamEngineSafe } from "../engine/index.js";
import { isActiveAgent } from "@shared/ipc.js";
import { findAgent } from "../agents/index.js";
import { advanceSeenCursor, ensureCollabAgentSession } from "./agent-session.js";
import { getCollabDigestsForDays } from "./digest-store.js";
import { collabUserPromptFields } from "./user-identity.js";
import { attachCollabMentions } from "./mentions.js";
import { broadcastCollabCoordinator, noteCollabSchedule } from "./inspector.js";
import {
	belongsToLiveCollabPlan,
	noteCollabPlanSpoke,
	spliceCollabPlanMentions,
} from "./plan-runner.js";
import { attachCollabReplyTo } from "./reply-quote.js";
import {
	emitCollabTurnActive,
	observeCollabSayTyping,
} from "./typing-observer.js";
import { isRoomOverBudget } from "./budget.js";
import { issueCollabDriveToken } from "./drive-guard.js";
import {
	advanceWatermark,
	isSupersededByFloor,
	maxChainFor,
	peekRoomRuntime,
	persistRoomState,
	postSystemLine,
	roomChannel,
	roomMembers,
	selfElected,
	type CollabActivationInput,
	type CollabActivationRecord,
	type CollabElectionRequest,
	type RoomRuntime,
} from "./room-runtime.js";

/**
 * What a finished turn is allowed to set in motion (R2 拆环).
 *
 * A turn's utterances are messages like any other: they can name someone, and
 * they can move a quiet member to speak. Both doors belong to the queue, so the
 * queue hands them in rather than the turn reaching back for them.
 */
export interface CollabTurnCascade {
	enqueue(
		roomSessionId: string,
		runtime: RoomRuntime,
		activations: CollabActivationInput[],
		sourceMessageId: string | undefined,
	): void;
	electWillingSpeakers(request: CollabElectionRequest): Promise<string[]>;
}

const TURN_START_TIMEOUT_MS = 20_000;
const TURN_TOTAL_TIMEOUT_MS = 10 * 60_000;
/** How long a queued activation waits for the engine to get a bound sender
 *  (desktop: window creation) before giving up this processing round. The
 *  record stays queued and is retried on the next queue kick. */
const ENGINE_BIND_WAIT_MS = 5 * 60_000;
const ENGINE_BIND_POLL_MS = 1_000;
/** 收尾正文超过这个长度还零 say = 「写而未发」;更短的当收尾自语,算真沉默。 */
const COLLAB_UNSENT_PROSE_MIN = 40;

/** Wait until the engine can actually deliver commands (desktop: window bound).
 *  Commands emitted with no bound sender are silently dropped by the engine —
 *  driving into the void would burn the activation (评审修订). */
export async function waitForEngineBound(): Promise<boolean> {
	const deadline = Date.now() + ENGINE_BIND_WAIT_MS;
	for (;;) {
		// P2-6: five minutes of 1s polling used to outlive teardown entirely —
		// shutdown returned while this kept ticking against a coordinator whose
		// subscriptions were already gone.
		if (shuttingDown) return false;
		const engine = getStreamEngineSafe();
		if (engine?.hasCommandTarget()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, ENGINE_BIND_POLL_MS));
	}
}

let shuttingDown = false;

/** Teardown latch: the next poll of any engine-bind wait gives up immediately. */
export function setCollabTurnsShuttingDown(next: boolean): void {
	shuttingDown = next;
}

/** Wait for the terminal event of the next stream on a session. */
export function waitForRoomTurn(
	sessionId: string,
	startTimeoutMs = TURN_START_TIMEOUT_MS,
	totalTimeoutMs = TURN_TOTAL_TIMEOUT_MS,
): Promise<"complete" | "error" | "aborted" | "timeout"> {
	return new Promise((resolve) => {
		const bus = getEventBus();
		let sawStart = false;
		let settled = false;
		const finish = (outcome: "complete" | "error" | "aborted" | "timeout") => {
			if (settled) return;
			settled = true;
			clearTimeout(startTimer);
			clearTimeout(totalTimer);
			unsubscribe();
			resolve(outcome);
		};
		const unsubscribe = bus.onAny(
			sessionId,
			(envelope) => {
				const type = envelope.event?.type;
				if (type === "stream:start") sawStart = true;
				else if (type === "stream:complete") finish("complete");
				else if (type === "stream:error") finish("error");
				else if (type === "stream:aborted") finish("aborted");
			},
			"collab-turn-wait",
		);
		const startTimer = setTimeout(() => {
			if (!sawStart) finish("timeout");
		}, startTimeoutMs);
		const totalTimer = setTimeout(() => finish("timeout"), totalTimeoutMs);
	});
}

/**
 * Stop whatever stream this room's turn is riding — the single door for it.
 *
 * W18 moved the turn into the agent's execution session and left every "stop"
 * still pointing at the room session, where no stream has lived since: the
 * freeze switch was aborting a session with no controller, i.e. nothing. Abort
 * follows the turn now — the live execution session first, then the room itself
 * as the pre-W18 fallback (an old-shape room hosts its own stream, and aborting
 * a session with no controller is a harmless no-op).
 *
 * Work sessions are deliberately NOT touched: that is `freezeRoomWork`'s job,
 * and each caller composes the two according to what it means by "stop".
 */
export function abortRoomTurn(roomSessionId: string): void {
	const engine = getStreamEngineSafe();
	if (!engine) return;
	// 并行化之后"这间房的回合"是一组而不是一个,而"停下这间房"必须是全部 ——
	// 只打其中一条,剩下的会继续说,而用户按的是同一个按钮。
	const activeTurns = peekRoomRuntime(roomSessionId)?.activeTurns;
	for (const turn of activeTurns?.values() ?? []) {
		engine.abort(turn.agentSessionId);
	}
	engine.abort(roomSessionId);
}

/**
 * The stop button's door into a room (collab-team-v2 §5.1 入口①).
 *
 * `abortStream(roomId)` used to reach the engine, find no controller on the room
 * session (there has been none since W18) and report success having stopped
 * nothing. This answers the one question the generic abort path needs — "is
 * this a room whose turn I just stopped?" — and returns false for everything
 * else, so private chats and work sessions keep the ordinary path untouched.
 *
 * Work sessions are deliberately spared: stopping the conversation is not
 * stopping the work. Killing the room's floor plus every card in flight is the
 * freeze switch's meaning, and it has its own button.
 */
export function abortCollabRoomTurnForStop(sessionId: string): boolean {
	const session = store.getSession(sessionId);
	if (session?.kind !== "room") return false;
	const hadTurn = (peekRoomRuntime(sessionId)?.activeTurns.size ?? 0) > 0;
	abortRoomTurn(sessionId);
	return hadTurn;
}

/**
 * What a turn left behind (W14b 说话即行动, re-homed by W18).
 *
 * Since W18 a turn runs in the agent's own execution session, so its remains
 * are split across two transcripts and the split IS the point:
 *  - `says`        — what the agent actually SAID, one message per `say` call,
 *                    oldest first, harvested from the ROOM. This is the only
 *                    thing the room ever receives.
 *  - `turnMessage` — the turn's host message (thinking text + tool calls),
 *                    harvested from the AGENT EXECUTION session, where the
 *                    whole turn now lives.
 *  - `legacySpeech`— pre-W18 shape only: an unmarked assistant message the
 *                    agent left IN the room, back when the stream itself was
 *                    the utterance. Kept so an old-style turn still counts as
 *                    speech; nothing writes this shape any more.
 *
 * Worker harvest posts are skipped: they are written under the same agent's
 * name but by the coordinator, and a harvest that lands mid-turn must not be
 * mistaken for something this turn produced.
 *
 * Both scans stop at the first message older than the drive: everything else
 * belongs to an earlier turn, which is exactly the stale-reply trap the
 * pre-W14b `latestAssistantMessageSince` guarded against.
 */
interface CollabTurnHarvest {
	says: ChatMessage[];
	turnMessage?: ChatMessage;
	legacySpeech?: ChatMessage;
}

function harvestTurnMessages(
	roomSession: ChatSession,
	agentSession: ChatSession | undefined,
	agentId: string,
	sinceTs: number,
): CollabTurnHarvest {
	const says: ChatMessage[] = [];
	let legacySpeech: ChatMessage | undefined;
	for (let index = roomSession.messages.length - 1; index >= 0; index--) {
		const message = roomSession.messages[index];
		if (message.timestamp < sinceTs) break;
		if (message.role !== "assistant" || message.agentId !== agentId) continue;
		if (isCollabSayMessage(message)) {
			says.unshift(message);
			continue;
		}
		if (isCollabHarvestMessage(message)) continue;
		// Neither a say nor a harvest post: only a pre-W18 in-room turn can be
		// this, and back then it WAS the utterance.
		if (!legacySpeech && !isCollabThinkingMessage(message))
			legacySpeech = message;
	}

	// `turnMessage` is the NEWEST assistant record of the window — the silence
	// branch reads it to tell "the turn ran and said nothing" from "never ran".
	let turnMessage: ChatMessage | undefined;
	for (
		let index = (agentSession?.messages.length ?? 0) - 1;
		index >= 0;
		index--
	) {
		const message = agentSession!.messages[index];
		if (message.timestamp < sinceTs) break;
		if (message.role !== "assistant") continue;
		turnMessage = message;
		break;
	}

	return { says, turnMessage, legacySpeech };
}

/** Union of the ids a turn addressed, in first-appearance order. `say` stamps
 *  its own mentions at write time (explicit ids ∪ prose scan), so this reads
 *  them back instead of re-resolving names the room may have since renamed. */
function unionTurnMentions(
	messages: readonly ChatMessage[],
): CollabMentionLike[] {
	const seen = new Set<string>();
	const mentions: CollabMentionLike[] = [];
	for (const message of messages) {
		for (const mention of message.mentions ?? []) {
			if (!mention?.agentId || seen.has(mention.agentId)) continue;
			seen.add(mention.agentId);
			mentions.push({ agentId: mention.agentId, label: mention.label });
		}
	}
	return mentions;
}

/** 'requeue-wait' = chain frozen, resumes on the next human message;
 *  'requeue-budget' = day budget spent, re-kicked when the day rolls over;
 *  'requeue-retry' = engine unbound past the wait window, re-kicked on a timer. */
export type DriveResult =
	| "done"
	| "requeue-wait"
	| "requeue-budget"
	| "requeue-retry";

/**
 * One turn at a time per AGENT (W18).
 *
 * Each room owns a serial queue, but an agent that belongs to two rooms is now
 * driven through ONE execution session, and two rooms activating it at the same
 * moment would put two streams on that session — supersede-abort, a half-turn,
 * and a target-room pointer written by whichever drive got there last. The
 * queues stay per-room; this makes the agent itself the second serialization
 * axis. A room whose turn waits here is only waiting for the same agent to
 * finish speaking elsewhere, and turn timeouts bound that wait.
 */
const agentSessionLocks = new Map<string, Promise<void>>();

async function withAgentSessionLock<T>(
	agentSessionId: string,
	run: () => Promise<T>,
): Promise<T> {
	const previous = agentSessionLocks.get(agentSessionId) ?? Promise.resolve();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	// The tail never rejects (it is only ever a chain of resolved gates), so a
	// failing turn cannot wedge the next one.
	const tail = previous.then(() => held);
	agentSessionLocks.set(agentSessionId, tail);
	await previous;
	try {
		return await run();
	} finally {
		release();
		// P2-10: drop the key when nobody queued behind us. `agentSessionLocks` was
		// add-only — every agent that ever spoke kept an entry for the life of the
		// process. If the map still points at OUR tail, we were the last holder;
		// if a later turn has already replaced it, leave it alone, because that
		// entry is the gate the next turn is waiting on.
		if (agentSessionLocks.get(agentSessionId) === tail) {
			agentSessionLocks.delete(agentSessionId);
		}
	}
}

/**
 * 死房兜底(agent-im-dm.md P1):一条激活在驱动处被丢掉时,**私聊**要留一行
 * 用户看得见的系统行。
 *
 * 群房刻意零改动:群里一条激活被丢掉,还有别的成员、还有别的消息,而"每次丢弃
 * 都在群里贴一行"会把机械账目搬进对话面(W9.1 反对的正是这件事)。私聊没有第二
 * 个人可以指望,静默丢弃在用户那里等于"这间房坏了"。
 */
/**
 * 这条 drive 要带的房间内容(v3 V1)。
 *
 * 渲染整段复用投影那一份(`buildCollabDriveRoomContext`)—— 房消息渲染成
 * `<message from>` 行这件事只有一份实现,两份迟早分家,而分家的形态就是 P5 §2
 * 那五个缺口。这里只负责喂事实:哪间房、谁在读、它读到哪儿了。
 *
 * **游标缺席 = 首轮铺底**。这位同事在这间房还没跑过回合,它需要整段可见历史;
 * 有游标就只带未读,更早的消息在更早的 drive 里已经写进它自己的历史了。
 *
 * `now` 由调用方传入(`driveStartTs`),不在这里现取:折叠切点是按天算的,同一个
 * 回合里跨过午夜就会跳一天 —— 前缀全 miss,而且模型第一遍读到的正文第二遍消失。
 * 一个回合只问一次"现在几点",三处共用那一个答案。
 */
function buildDriveRoomContext(
	roomSessionId: string,
	agentId: string,
	now: number,
	scheduled?: string,
): string {
	const room = store.getSession(roomSessionId);
	if (room?.kind !== "room") return "";
	// `collabAgentSessionId` 可能返回 null(id 拼不出来 —— 迁移期的旧形状)。
	// 那种情况按"没有游标"处理:首轮铺底带整段历史,方向是多给不是少给。
	const cursorSessionId = collabAgentSessionId(agentId, roomSessionId);
	const seenMessageId = cursorSessionId
		? store.getSession(cursorSessionId)?.collab?.seenMessageId
		: undefined;
	const messages = room.messages ?? [];
	const window = planCollabHistoryWindow({
		messages,
		...(seenMessageId ? { seenMessageId } : {}),
		selfAgentId: agentId,
		now,
		...(room.room?.context ?? {}),
	});
	return buildCollabDriveRoomContext({
		messages,
		selfAgentId: agentId,
		agents: roomMembers(room),
		resolveAgentName: (id) => findAgent(id)?.name,
		...collabUserPromptFields(),
		window,
		bootstrap: !seenMessageId,
		...(scheduled ? { scheduled } : {}),
		...(window.cut !== undefined
			? {
					digests: getCollabDigestsForDays(
						roomSessionId,
						collabFoldedDaysOfWindow(messages, window),
					),
				}
			: {}),
	});
}

/**
 * 别处发生的事(v3 V4',collab-agent-view-v3.md §3)。
 *
 * 一个 agent 每间房一条执行会话,隔离必须保住(私聊内容混进群上下文 = 随时可能
 * 被 say 出去)。代价是跨房那一维没人承担,两个方向都缺:「我在别的房做过什么」
 * 与「别的房有谁找过我」。2026-08-01 真机两边都踩到了。
 *
 * 三条实现纪律,每一条都是初版踩过的坑:
 *
 *  - **时间窗,不是"最近 N 条"**。drive 会落盘、会永久留在历史里,所以进 drive 的
 *    块只能是事件。初版是滚动快照,实测同一个事件最多被写入 23 次。窗口下界取
 *    **上一条 drive 的时刻** —— 它本来就在历史里,不需要新游标。
 *  - **按房成员枚举,不按执行会话**。执行会话只在那间房第一次被驱动时才建
 *    (`ensureCollabAgentSession`,唯一非测试调用点在本文件里),于是"从没被驱动
 *    过的房"整间不可见 —— 实测漏掉的正是**用户和这位同事的私聊**。
 *  - **元数据先筛,再 load**。`SessionMeta` 的快速索引不含 messages,先用
 *    `updatedAt` 把窗口内毫无动静的房剔掉,稳态下一间都不用 load。
 */
function buildDriveElsewhere(
	roomSessionId: string,
	agentId: string,
	since: number | undefined,
	until: number,
): string {
	// 首轮:没有上一条 drive,窗口无从谈起。纯层同样会返回空,这里提前短路省掉扫描。
	if (!since) return "";

	const candidates = store
		.getSessionsList()
		.filter(
			(meta) =>
				meta.kind === "room"
				&& meta.id !== roomSessionId
				&& meta.room?.memberAgentIds?.includes(agentId)
				// 窗口内这间房一个字都没写过 → 不可能有事件,连 load 都省了
				&& (meta.updatedAt ?? 0) > since,
		)
		.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
		.slice(0, DRIVE_ELSEWHERE_MAX_ROOMS);

	const sources: CollabElsewhereSource[] = [];
	for (const meta of candidates) {
		const room = store.getSession(meta.id);
		if (room?.kind !== "room") continue;
		const execId = collabAgentSessionId(agentId, meta.id);
		const exec = execId ? store.getSession(execId) : undefined;
		sources.push({
			roomLabel: room.name?.trim() || "另一间房",
			...(exec?.messages?.length ? { execMessages: exec.messages } : {}),
			...(room.messages?.length ? { roomMessages: room.messages } : {}),
		});
	}
	if (sources.length === 0) return "";

	return buildCollabElsewhere({
		sources,
		since,
		until,
		selfAgentId: agentId,
		resolveSpeakerLabel: (id) => {
			const agent = findAgent(id);
			return agent ? formatCollabAgentHandle(agent.name, agent.id) : undefined;
		},
	});
}

/**
 * 最多回看几间房。
 *
 * 5 与事件上限同一个数量级:更多的房意味着更久以前的事,而那些与这一轮该说什么
 * 已经没有关系了。元数据先筛之后,稳态下真正 load 的远少于 5。
 */
const DRIVE_ELSEWHERE_MAX_ROOMS = 5;

/**
 * 这条执行会话里**上一条** drive 的时刻 —— 事件窗口的下界。
 *
 * 不新增游标就是这个意思:它本来就在历史里。附带一条免费的正确性 —— 某一轮
 * abort、模型没读到那份事件块,块仍然落在历史里,下一轮照样读得到。
 */
function previousDriveAt(agentSessionId: string): number | undefined {
	const messages = store.getSession(agentSessionId)?.messages ?? [];
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "user" || !isCollabDriveMessage(message)) continue;
		return typeof message.timestamp === "number" ? message.timestamp : undefined;
	}
	return undefined;
}

/** 折叠段覆盖到的那几天 —— 首轮铺底要按它取摘要。 */
function collabFoldedDaysOfWindow(
	messages: readonly ChatMessage[],
	window: { folded: ReadonlySet<number> },
): string[] {
	const days = new Set<string>();
	for (const message of collectCollabFoldedFacts(messages, window)) {
		const at = new Date(message.timestamp ?? 0);
		const pad = (value: number) => String(value).padStart(2, "0");
		days.add(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
	}
	return [...days].sort();
}

function postDmDeadEndLine(session: ChatSession, content: string): void {
	if (!isUserDmRoom(session.room)) return;
	postSystemLine(session.id, content);
}

export async function driveActivation(
	roomSessionId: string,
	runtime: RoomRuntime,
	record: CollabActivationRecord,
	cascade: CollabTurnCascade,
): Promise<DriveResult> {
	const session = store.getSession(roomSessionId);
	if (!session || session.kind !== "room" || session.room?.frozen) {
		// 冻结本身已经有可见反馈:总闸落下时 setCollabRoomFrozen 贴了「房间已全部
		// 暂停…」,冻结期间的用户消息由 ingress 侧的冻结系统行接住(queue.ts)。
		record.stage = "failed";
		return "done";
	}

	// Removed while queued → it does not get the floor (W6 / §3.5 C). Its
	// in-flight WORK session is deliberately left alone (the task is still
	// harvested), but the room roster is read fresh here, so a member removed a
	// moment ago never speaks again.
	if (!(session.room?.memberAgentIds ?? []).includes(record.agentId)) {
		record.stage = "failed";
		// 私聊房的成员被换掉了(设置里改了名册),排在队里的那位已经不属于这间房。
		postDmDeadEndLine(session, "这间私聊的成员已经变了,刚才那句没有人接");
		return "done";
	}

	// Chain gate re-check at DRIVE time (评审修订): queued fan-out from a
	// multi-mention reply must not overshoot the cap. Records stay queued;
	// a real user message resets the chain and the queue resumes.
	// task-event activations (delivery → review) are EXEMPT: the work pipeline
	// has its own bounds (per-task 打回 ≤2, concurrency caps) and freezing a
	// review mid-delivery stalls real work (真机实测修订).
	// 费用闸:一切激活(含 task-event)都花钱,超预算即等待(次日/调预算恢复)。
	if (await isRoomOverBudget(roomSessionId)) {
		// Its own outcome, not a plain wait: the caller arms the day-rollover kick
		// that makes the notice's 「明天自动恢复」 true (P2-4). A chain freeze needs
		// no timer — it resumes on the next human message, by design.
		return "requeue-budget";
	}

	// 闸按激活原因分档,但只剩两档:'task-event' 豁免(Infinity,pre-W21 的
	// 短路),其余共用房间那一格的连续发言上限 —— 主动接话曾有一道固定的更严
	// 闸,已撤(见 resolveCollabChainCap)。
	const chainCap = resolveCollabChainCap(record.reason, maxChainFor(session));
	// 并行化:`chainCount` 要到收尾(harvest)才 += 说了几句,所以同时起跑的 N 条
	// 回合读到的是**同一个**旧计数,各自都能过闸 —— 一道设成 8 的闸会放过 8+N 条。
	// 已经在跑的每条按至少一句预占一格,闸的语义(无人类输入时最多连着说几条)
	// 因此在并行下仍然成立。
	const speaking = runtime.activeTurns.size;
	if (runtime.state.chainCount + speaking >= chainCap) {
		// A self-election that hits its tighter cap is DROPPED, not parked. It was
		// an impulse about one particular message ("我想接这句"), and parking it
		// means the impulse resurfaces stale right after the human reopens the room
		// — the very 重复发消息 feel W21 exists to remove. It also keeps the serial
		// queue moving: a parked head blocks the mentions and task-events behind it,
		// and a delivery review must never wait on somebody's small talk.
		// Mentions and task events are obligations: they still park and resume.
		if (record.reason === "self-elected") {
			record.stage = "failed";
			return "done";
		}
		// Everything that reaches here parks at the FULL cap (mention/schedule),
		// so the 「我先按住了」 line still means what it always meant: the room is
		// held until the user speaks.
		if (!runtime.chainNoticePosted) {
			runtime.chainNoticePosted = true;
			postSystemLine(
				roomSessionId,
				buildCollabChainHoldLine({
					maxChain: maxChainFor(session),
					...(isAgentPairDmRoom(session.room) ? { pairDm: true } : {}),
				}),
			);
		}
		return "requeue-wait";
	}

	// 查无此人,或者这个人已经退休(域模型 §3.2 的激活链一行):不给发言权。
	//
	// 这是每一条激活的必经之路(点名/主动接话/任务事件/日程),所以退休的收口就
	// 放在这里 —— 上游的候选面各自也筛(意愿判定、mention 解析),但那些是"不
	// 提名",这一行是"提名了也不给"。已退休的成员**留在 memberAgentIds 里**(数据
	// 不动,成员条照旧显示墓碑),只是永远沉默。
	const agent = findAgent(record.agentId);
	if (!agent || !isActiveAgent(agent)) {
		record.stage = "failed";
		// 私聊里这条分支就是"这间房再也不会有人说话了",必须说出来(P1 死房兜底)。
		// 群房照旧只记账 —— 群里少一个人不等于群坏了。
		postDmDeadEndLine(
			session,
			agent
				? `${agent.name} 已注销,这间私聊不会再有回复`
				: "这位同事已经不在了,这间私聊不会再有回复",
		);
		return "done";
	}

	// 未读闸(collab-agent-view.md P4)——**对话性激活专用**。
	//
	// 一条对话性激活的意思是"去看看",而不是"你欠这条一次回复"。所以在花掉一次
	// 全上下文调用之前先问一句:这位同事在这间房还有没有没读过的话?没有 = 它上
	// 一轮已经把这些都读进上下文了,读完选择说什么是它的事,再驱一次只会让它对着
	// 同一段话再说一遍 —— 2026-08-01 那次群里三遍「四人全齐」就是这么来的。
	//
	// 判据用的是**投影同一个函数**,所以"闸说没有未读"与"投影里 Notification 为空"
	// 永远是同一件事:两套判据迟早会分家,而分家的后果是一个闸拦住了一条投影明明
	// 会展示新消息的激活。
	//
	// 任务事件/日程豁免:它们没有触发消息,压根不是"回答某条消息"。
	if (record.reason === "mention" || record.reason === "self-elected") {
		const cursorSessionId = collabAgentSessionId(record.agentId, roomSessionId);
		const seenMessageId = cursorSessionId
			? store.getSession(cursorSessionId)?.collab?.seenMessageId
			: undefined;
		// 游标缺席 = 这位同事在这间房还没跑过回合 —— 那当然要驱,整段历史都是新的。
		if (seenMessageId) {
			const view = planCollabHistoryWindow({
				messages: session.messages ?? [],
				seenMessageId,
				selfAgentId: record.agentId,
				now: Date.now(),
				...(session.room?.context ?? {}),
			});
			if (view.unread.size === 0) {
				record.stage = "failed";
				// 群里静默丢弃是合法的(还有别人、还有别的消息);私聊没有第二个人可以
				// 指望,所以那里要留一行 —— 与本文件其它丢弃路径同口径。
				postDmDeadEndLine(
					session,
					`${agent?.name ?? "TA"} 已经读过这些消息了`,
				);
				return "done";
			}
		}
	}

	// Commands are dropped silently when no sender is bound (boot, pre-window).
	// Deliberately BEFORE the agent lock: waiting up to five minutes for a window
	// must not block the same agent's turn in another room.
	if (!(await waitForEngineBound())) {
		return "requeue-retry";
	}

	// collab-team-v2 §1.1:每群每 agent 一条常驻会话。锁的 key 就是这个 id,所以
	// 串行粒度在这一行同时从 per-agent 变成 per(agent×群)——两个群同时激活同一个
	// agent 各驱各的会话,不再互等。
	const agentSessionId = collabAgentSessionId(record.agentId, roomSessionId);
	if (!agentSessionId) {
		record.stage = "failed";
		return "done";
	}

	return await withAgentSessionLock(agentSessionId, async () => {
		// 喊停/清空的最后一道门(四审 A-1):这条记录从出队到走进 agent 锁之间隔着
		// 预算读取、引擎绑定等待、锁上排队 —— 期间一次清空/喊停换掉了世代号,而
		// `stopRoomFloor` 看不见还没登记进 activeTurns 的它。emitDrive 之前最后
		// 核对一次,过期就地退场,一次模型调用都不花。任务事件(epoch undefined)
		// 照旧豁免 —— 停对话不是停干活。
		if (isSupersededByFloor(runtime, record)) {
			record.stage = "superseded";
			return "done";
		}
		// Where this room's turn actually lives, for exactly as long as it lives
		// there (R0). Same window as the observers below — inside the agent lock,
		// torn down by the same finally — so `abortRoomTurn` can never point at a
		// session that has already handed the floor to another room.
		runtime.activeTurns.set(agentSessionId, {
			agentSessionId,
			agentId: record.agentId,
			reason: record.reason,
			startedAt: Date.now(),
		});
		// 状态条在这一刻才知道「X 正在说」(2026-08-02 三审):调度泵发牌时广播过
		// 一次,但那时回合还没进 `activeTurns`(闸检查 + agent 锁都在中间),快照里
		// 队列少了一条、在跑却还是空 —— 不补这一发,整个回合的 10–40s 里常驻条都
		// 显示「空闲」,「谁在说 + 秒表」要到收尾那次广播才短暂闪现。
		broadcastCollabCoordinator(roomSessionId);
		// collab-team-v2 §5.1 入口①: tell the ROOM its turn window is open, so the
		// renderer can draw a stop button. The room session emits no `stream:start`
		// of its own (the stream lives in the execution session), which is why the
		// button has never been drawable — and why this pulse must share the
		// activeTurn window exactly: the button is visible iff `abortRoomTurn` has
		// something to shoot at.
		emitCollabTurnActive(roomSessionId, record.agentId, true);
		// W19 真实 typing: the window is exactly the turn — opened under the agent
		// lock (so the light belongs to this room's turn, not to another room that
		// holds the same execution session) and closed by the finally, which also
		// forces the indicator off. Nothing outside this window emits typing any
		// more: queueing is not typing, thinking is not typing.
		const detachTyping = observeCollabSayTyping({
			sessionId: agentSessionId,
			roomSessionId,
			agentId: record.agentId,
		});
		// W22 回合断路器: same window, same teardown discipline, opposite job — the
		// typing observer reports what the turn is doing, this one stops it when
		// what it is doing has stopped making sense.
		const detachBreaker = observeCollabTurnCircuitBreaker({
			sessionId: agentSessionId,
			roomSessionId,
		});
		try {
			return await runActivationTurn({
				roomSessionId,
				runtime,
				record,
				agent,
				agentSessionId,
				cascade,
			});
		} finally {
			detachBreaker();
			detachTyping();
			runtime.activeTurns.delete(agentSessionId);
			emitCollabTurnActive(roomSessionId, record.agentId, false);
		}
	});
}

/**
 * Watch one turn window's tool calls and abort the turn if it runs away (W22).
 *
 * Both caps are room settings (`budgets.maxTurnToolCalls` / `maxTurnSayCalls`,
 * 0 = 关闭) — the defaults sit where no real turn reaches them, and a room that
 * genuinely needs a longer turn raises or removes them in the settings form
 * instead of anyone editing a constant.
 *
 * The breaker is a STRUCTURAL floor, not a behaviour: nothing about it is
 * specific to which tool is looping (the one that caused 真机 事故 is gone), and
 * a turn that says its piece never comes near it. It exists because the only
 * other bound on a tool loop is `TURN_TOTAL_TIMEOUT_MS`, and ten minutes of
 * full-context requests is an expensive way to discover a turn is stuck.
 *
 * Abort goes through the engine's ordinary channel, so everything downstream
 * behaves as it does for a user-pressed stop: `waitForRoomTurn` settles on
 * `stream:aborted`, the partial transcript is harvested exactly as it will be
 * on boot replay, and any `say` that already landed still counts as speech.
 * The note is written into the EXECUTION session (where the turn lives and
 * where someone debugging it will look), never into the room — the room shows
 * utterances, and a breaker trip is machinery.
 */
function observeCollabTurnCircuitBreaker(options: {
	sessionId: string;
	roomSessionId: string;
}): () => void {
	const { sessionId, roomSessionId } = options;
	// Caps are per-room settings (0 = 关闭), read at turn start like every other
	// room gate — a change made mid-turn belongs to the next turn, not this one.
	const budgets = store.getSession(roomSessionId)?.room?.budgets;
	const limits = resolveCollabTurnBreakerLimits({
		maxToolCalls: budgets?.maxTurnToolCalls,
		maxSayCalls: budgets?.maxTurnSayCalls,
	});
	// Both caps off: don't subscribe at all. A breaker that cannot trip is a
	// listener on every event of the turn for nothing.
	if (!limits.enabled) return () => {};
	const breaker = createCollabTurnCircuitBreaker(limits);
	const unsubscribe = getEventBus().onAny(
		sessionId,
		(envelope) => {
			const trip = breaker.observe(
				(
					envelope as
						| { event?: Parameters<typeof breaker.observe>[0] }
						| undefined
				)?.event,
			);
			if (!trip) return;
			// Note first: the abort tears the stream down, and a record that lands
			// after it is a record nobody associates with the turn that earned it.
			postSystemLine(sessionId, formatCollabTurnBreakerNote(trip));
			getStreamEngineSafe()?.abort(sessionId);
		},
		"collab-turn-breaker",
	);

	let detached = false;
	return () => {
		if (detached) return;
		detached = true;
		unsubscribe();
	};
}

/**
 * The turn itself — W18: it runs in the AGENT's execution session.
 *
 * The room is still the subject (roster, projection material, gates, chain,
 * cascade, typing all read it) but no longer the host: the drive, the thinking
 * and every tool call land in `agentSessionId`, and the only thing that reaches
 * the room is whatever `say` puts there. Entered under the agent lock, so the
 * target-room pointer written here belongs to this turn for its whole duration.
 */
async function runActivationTurn(options: {
	roomSessionId: string;
	runtime: RoomRuntime;
	record: CollabActivationRecord;
	agent: NonNullable<ReturnType<typeof findAgent>>;
	agentSessionId: string;
	cascade: CollabTurnCascade;
}): Promise<DriveResult> {
	const { roomSessionId, runtime, record, agent, agentSessionId, cascade } =
		options;
	// Re-read the room: waiting for the agent lock can take a whole turn in
	// another room, and a brake pulled meanwhile must be honoured here too (the
	// same gates the caller checked before queueing for the lock).
	const session = store.getSession(roomSessionId);
	if (!session || session.kind !== "room" || session.room?.frozen) {
		record.stage = "failed";
		return "done";
	}
	if (!(session.room?.memberAgentIds ?? []).includes(record.agentId)) {
		record.stage = "failed";
		postDmDeadEndLine(session, "这间私聊的成员已经变了,刚才那句没有人接");
		return "done";
	}

	// Lazily created, and pointed at the room this drive is about: the prompt
	// builder takes its persona/roster/projection material from there, and a
	// `say` without an explicit room lands there.
	if (!ensureCollabAgentSession(record.agentId, roomSessionId)) {
		record.stage = "failed";
		// 常驻会话都建不出来(agent 在等锁的这段时间里被删了)——私聊里同样不能静默。
		postDmDeadEndLine(session, `${agent.name} 的会话打不开,这一句没能送到`);
		return "done";
	}

	// One stream per session: the queue is serial, but guard against an
	// externally-driven stream (steering resume etc.) racing the drive.
	//
	// collab-team-v2 §5.2: the same zombie hole the total-timeout branch below
	// fixed, one wait earlier. Giving up on the wait used to fall straight through
	// to `emitDrive`, which put a second stream on a session that still had a live
	// one — supersede-abort, a half turn, and a drive billed for nothing. The wait
	// ending is not the stream ending; only an abort makes it so.
	if (getStreamEngineSafe()?.getController(agentSessionId)) {
		if ((await waitForRoomTurn(agentSessionId)) === "timeout") {
			getStreamEngineSafe()?.abort(agentSessionId);
		}
	}

	// The room still records who spoke last: `say` stamps its own agentId, but
	// the room's own attribution choke point (and any pre-W18 path) reads this.
	store.updateSessionAgent(roomSessionId, record.agentId);
	record.stage = "driving";
	record.driveMessageId = randomUUID();
	persistRoomState(roomSessionId, runtime);

	const driveStartTs = Date.now();

	/**
	 * 这一轮**将会**读到哪一条为止 —— 已读游标的候选值(collab/history-window.ts)。
	 *
	 * 在 `emitDrive` **之前**取,而不是回合结束时取:投影是引擎在流启动时按当时
	 * 的房间列表构建的,而回合跑完时房间早就前进了。这里取得比投影稍早一点,
	 * 于是在这几毫秒里到达的消息会被算作未读 —— 多读一遍是安全方向,而反过来
	 * (游标越过一条模型没看见的消息)就是永久丢消息。
	 *
	 * 落盘要等到 harvest,见下面 `advanceSeenCursor` 的调用点:一个 abort/超时的
	 * 回合可能一个字都没读到,虚假前进的游标会把那批消息永久变成"已读"。
	 */
	const projectedThroughId = store.getSession(roomSessionId)?.messages?.at(-1)?.id;

	/**
	 * P1-4 (docs/design/todo2-fix-plan.md): a model the user pinned on THIS
	 * execution session outranks the agent's binding.
	 *
	 * The drive used to stamp the binding as a command-level override
	 * unconditionally, and `withAgentModelBinding` (app/engine/stream-engine.ts)
	 * short-circuits on any command that already carries providerId — so picking
	 * a model in the execution session's UI could never take effect. Dropping the
	 * override lets the engine resolve the session's own configuration, and
	 * `resolveAgentProfile` already drops the binding for a pinned session, so
	 * nothing puts it back.
	 */
	const modelPinned = store.getSession(agentSessionId)?.modelPinned === true;

	/**
	 * The drive round: the synthetic user message that carries the turn, plus
	 * the model binding this agent brings. It bills, binds and hides as one unit
	 * (COLLAB_MESSAGE_SOURCE ⇒ isCollabDriveMessage ⇒ never relayed into the room
	 * projection anyone else reads, and never a message that opens a willingness
	 * round of its own).
	 *
	 * The one place it is NOT hidden is this turn's own model input: the history
	 * builder appends the CURRENT drive at the tail of the execution session's
	 * projection (app/engine/stream/message-helpers.ts). Until 2026-07-30 it did
	 * not, and the drive reached the model exactly never.
	 */
	const emitDrive = async (content: string): Promise<void> => {
		await getEventBus().emit(agentSessionId, {
			type: "command:send-message",
			// The room's connector: the turn runs elsewhere, but it answers the
			// room, and outbound routing/permission affinity follow the room.
			channel: roomChannel(roomSessionId),
			content,
			source: COLLAB_MESSAGE_SOURCE,
			origin: {
				transport: "api",
				source: COLLAB_MESSAGE_SOURCE,
				receivedAt: Date.now(),
			},
			// P2-8: the marker says what this is, the token proves who sent it. Only
			// the coordinator that minted it this process can put this value on a
			// command, so the engine's room/exec gate can stop trusting a string.
			...(issueCollabDriveToken()
				? { collabDriveToken: issueCollabDriveToken() }
				: {}),
			// W23: the drive is the idempotence ledger. Persisting WHICH room message
			// this activation answers turns the execution transcript into a record
			// that outlives the 50-entry cap on state.json's activations — boot
			// reconciliation reads it when its own records come up empty.
			//
			// Task-event activations have no room message behind them and leave the
			// field absent, which is exactly right — nothing to retire.
			...(record.sourceMessageId
				? { collabSourceMessageId: record.sourceMessageId }
				: {}),
			suppressTitleGeneration: true,
			// W13.3: bill this turn as room spend, not anonymous chat. Attribution
			// only — the budget gate below still sums by sessionId.
			usageSource: COLLAB_USAGE_SOURCE_ROOM,
			// 这里刻意 **没有** initialToolChoice。
			//
			// W22 曾把回合首调 named-force 成 say(「判定即承诺」:意愿判定说了要
			// 发言,那开口即 say)。2026-07-30 移除:真机的代价是无话可说的 agent
			// 没有"不说"的出口——被 @ 或被任务事件拉起来、看完上下文发现确实没自己
			// 的事,却必须调 say,于是群里多出一条「我这轮不说了 / 保持静默」的废话
			// 消息。行为由代码决定,而提示词全链路(roster 情况说明、say 工具描述)
			// 都说"可以沉默"——两者矛盾时收拾的是代码。
			//
			// 沉默路径不需要强制:不管是整轮什么都不调,还是写了正文没发送,都走
			// 静默收尾分支(不计链、不级联、推水位)。W14d 的补救 nudge 已于
			// 2026-07-30 拆除——真机上它把一个想 pass 却把 pass 写成旁白的回合重新
			// 推上发言台,模型在补救轮里误以为上一条已送达的消息没发出去,又发了
			// 一遍,群里出现重复消息。代价是"写了完整回复却忘了发送"不再有结构补救;
			// 2026-08-02 起连 drive 尾行也没有了,靠的是框架一致性(工位 + 发送按钮)
			// 与 unsent 度量。
			// W18b 的 stay_silent 空转事故也不会回归:那个工具已删除,沉默就是不调
			// 任何工具,没有可空转的落点(tool-surface.ts 自己就是这么论证的)。
			// Per-agent thinking preference (D1): binding stores an effort level
			// string; the command contract wants thinking:boolean + thinkingEffort.
			// All three are dropped for a pinned session (P1-4, see modelPinned).
			...(modelPinned
				? {}
				: {
						...(agent.model?.providerId
							? { providerId: agent.model.providerId }
							: {}),
						...(agent.model?.modelId ? { model: agent.model.modelId } : {}),
						...(agent.model?.thinking && agent.model?.providerId
							? { thinking: true, thinkingEffort: agent.model.thinking }
							: {}),
					}),
		} as Parameters<ReturnType<typeof getEventBus>["emit"]>[1]);
	};

	// P2-7 先订阅后驱动: the bus delivers synchronously, so a stream that starts
	// and ends inside `emitDrive` would settle before a waiter created after it
	// existed — the turn would then sit out its full start timeout and get
	// aborted as a zombie it never was. The externally-driven branch above has
	// always built its waiter first; the drive here does the same.
	const turnEnded = waitForRoomTurn(agentSessionId);
	/**
	 * 房间内容跟着 drive 进来(v3 V1,collab-agent-view-v3.md §2)。
	 *
	 * 从前它是每回合**重新投影**出来的一块临时快照;现在它写进这条 drive ——
	 * 一条真实的、会落盘的消息,于是之后每一轮都在这条会话的历史里读得到。
	 * 首轮铺底带整段可见历史,之后只带未读(`buildDriveRoomContext` 里判)。
	 *
	 * 编排点将只作为 `<Notification scheduled="coordinator">` 这一个**属性**进来
	 * (collab-turn-protocol-and-identity.md A.2 ②):原来那句「The coordinator
	 * scheduled you this round — the room is waiting on you.」是舞台指示,而舞台
	 * 隐喻正是「写而未发」的病根。被 @ 的信号已在每行的 `rel` 上,不重复。
	 * 零未读时这个属性还负责让 drive 非空 —— 自闭合的 count="0" 块本身是数据。
	 */
	const scheduled = record.reason === "relay" ? "coordinator" : undefined;
	const roomContext = buildDriveRoomContext(
		roomSessionId,
		record.agentId,
		driveStartTs,
		scheduled,
	);
	// 别处发生的事(V4')。排在房间内容之后、drive 那一行之前:它是背景,不是这一轮
	// 的指令,而 drive 必须留在最末(上下文末尾,指令遵从最强)。
	const elsewhere = buildDriveElsewhere(
		roomSessionId,
		record.agentId,
		previousDriveAt(agentSessionId),
		driveStartTs,
	);
	// drive = 房间内容 + 别处发生的事,句号。
	//
	// 这里曾有一个 `<turn agent=… reason=…>` 尾注块(「Your turn. Nothing here
	// reaches the room on its own — `say` is what sends…」)。2026-08-02 整块删除:
	// 真实的聊天应用推送消息,不会在每条通知后附一张使用说明卡。机制在 system
	// prompt 的 `<where_you_are>` 说一次就够;每回合重复它是念经,而且占着 recency
	// 最强的位置 —— 一旦措辞有偏(「Your turn / the room is waiting」已被真机证明
	// 有偏),伤害被放大到每一轮。删掉块,这个风险点结构性消失。
	//
	// 原块的三项职能各归其位:机制→system prompt;激活理由→`<Notification
	// scheduled>` 属性与每行的 `rel`;drive 非空→零未读时的自闭合 count="0" 块。
	const drive = [roomContext, elsewhere].filter(Boolean).join("\n\n");
	await emitDrive(
		// 兜底:两块都空(比如任务事件把一位同事叫起来,而房里一条未读都没有)。
		// 空 drive 就是一条空的 user 消息;`count="0"` 至少是一条真数据。
		drive || formatCollabNotificationBlock({ lines: [], emitWhenEmpty: true }),
	);

	record.stage = "streaming";
	persistRoomState(roomSessionId, runtime);

	const outcome = await turnEnded;
	if (outcome === "timeout") {
		// Never leave a zombie stream: the wait gave up, but the request did not —
		// it keeps burning full-context round-trips against a turn nobody is
		// listening to any more, and the agent lock is about to be handed to the
		// next room. worker.ts:363 fixed the same hole on the work path; the room
		// path was left behind.
		getStreamEngineSafe()?.abort(agentSessionId);
	}

	// Harvest whatever persisted, regardless of outcome — an aborted partial IS
	// in the transcript and must count exactly like it will on boot replay
	// (live/replay chain alignment, 评审修订). Two transcripts since W18: the
	// room holds the says, the execution session holds the turn.
	const room = store.getSession(roomSessionId);
	let harvested: CollabTurnHarvest = room
		? harvestTurnMessages(
				room,
				store.getSession(agentSessionId),
				record.agentId,
				driveStartTs,
			)
		: { says: [] };

	/**
	 * 收养式兜底(2026-08-02 用户裁决,翻案「写而未发不再有结构补救」)。
	 *
	 * 跑完的回合把答复写成大段收尾正文、一次 send_message 都没调 —— 那段话本来
	 * 谁也看不见。措辞层的对抗已被真机反复证伪(四层劝导、尾注、隐喻更换都只降频
	 * 不归零):assistant 的训练先例就是「最终文本 = 给对方的回复」。所以由框架把
	 * 这段正文**原样收养**,走 say 的同一条落地路径投进群(防冒名、句柄出栈、
	 * mentions 解析、frozen/预算/成员门全部照常)。
	 *
	 * 与被拆除的 W14d nudge 的本质区别:**不再驱动模型**,只搬运已写好的文本。
	 * nudge 的死因是补救轮里模型误以为已送达的消息没发出去而重发;这里的前提就是
	 * 本回合零发送,重复在结构上不可能发生。残余风险只有一种:想 pass 却写了长
	 * 旁白的回合会被当成发言收养 —— 真机度量(2026-08-02)显示超过阈值的收尾正文
	 * 几乎全是写好的答复,这笔交换是划算的(漏发比偶发自语贵)。
	 *
	 * 动态 import 与 dm-tool 同理:静态引 say-tool 会拼出 turn → say-tool →
	 * coordinator → queue → turn 的环,而环的初始化顺序问题只在打包形态下现身。
	 * 投递失败(房间冻结/超预算/已除名/异常)不重试:回落静默收尾,记成 unsent。
	 */
	let adoptedDelivery = false;
	if (
		room &&
		outcome === "complete" &&
		harvested.says.length === 0 &&
		!harvested.legacySpeech
	) {
		const prose = (harvested.turnMessage?.content ?? "").trim();
		if (prose.length >= COLLAB_UNSENT_PROSE_MIN) {
			try {
				const { speakIntoCollabRoom } = await import("./say-tool.js");
				const delivered = await speakIntoCollabRoom({
					sessionId: agentSessionId,
					content: prose,
				});
				if (delivered.ok) {
					adoptedDelivery = true;
					// 重新收割:收养进群的那条消息带着 COLLAB_SAY_SOURCE,从这里起
					// 它就是一条普通的 say —— 计链、mentions 级联、水位、编排记账
					// 全部走下面的正常发言分支,不另开一条半吊子路径。
					const refreshed = store.getSession(roomSessionId);
					if (refreshed) {
						harvested = harvestTurnMessages(
							refreshed,
							store.getSession(agentSessionId),
							record.agentId,
							driveStartTs,
						);
					}
				}
			} catch (error) {
				console.error("[collab] adopt-unsent delivery failed:", error);
			}
		}
	}

	const after = store.getSession(roomSessionId);
	const { says, turnMessage } = harvested;

	// 已读游标(collab/history-window.ts):**只有跑完的回合**才推进。
	//
	// 沉默同样推进 —— 读过了、判断不必说,这是有效处理。不推的话同一批未读会
	// 反反复复把它叫起来,而那正是 2026-08-01 那次事故里"陈旧激活"的机制。
	// 中止/超时不推:那种回合可能一个字都没读到。
	if (outcome === "complete" && projectedThroughId) {
		advanceSeenCursor(agentSessionId, projectedThroughId);
	}

	// P2 每日摘要:回合收尾之后补,**不等**。让投影去等一次网络往返,等于把每个
	// 回合的首字延迟押在一个后台任务上;晚一轮拿到摘要是可接受的代价,而
	// `<Folded count>` 在此期间照旧诚实地说少了多少条。开关见 room.context.dailyDigest。
	//
	// **动态 import 是刻意的**:摘要跑模型,所以它的静态图里挂着整个 provider 栈
	// (settings 仓库 → stores/paths)。静态引它,turn.ts 就把那条依赖带给了每一个
	// import 它的协调器测试 —— 那些测试 partial-mock `stores/paths`,于是 15 个
	// 文件在收集阶段就炸了。这是一个真正的后台子系统,按需加载正合适。
	void import("./digest-runner.js")
		.then((module) => module.ensureCollabDigestsForRoom(roomSessionId))
		.catch((error) => {
			console.error("[collab] daily digest trigger failed:", error);
		});

	record.stage = outcome === "complete" ? "harvested" : "failed";
	// 编排的「这一批发生过没有」读它:`DriveResult` 对超时/中止/模型失败同样返回
	// 'done',分不出"跑完了"和"没跑成"(审查 #11)。
	record.turnClean = outcome === "complete";

	/**
	 * Epoch fork (W14b, narrowed by W18). `say` messages are speech, full stop.
	 * With none of them, the only thing that can still count as an utterance is
	 * an unmarked assistant message the agent left IN THE ROOM — the pre-W18
	 * shape, where the turn ran there and the stream itself was the utterance
	 * (`[pass]` sentinel included). A turn record in the execution session is
	 * never speech: nobody can read it, which is the whole point of W18.
	 */
	const legacySpeech =
		says.length === 0 &&
		harvested.legacySpeech &&
		!isCollabPassMessage(harvested.legacySpeech.content)
			? harvested.legacySpeech
			: undefined;
	const speech = says.length > 0 ? says : legacySpeech ? [legacySpeech] : [];

	// 顺序模式(接力)。两件事因此要从下面那个分支里提出来:传棒**不管这一棒有没有
	// 说话**(没说话正是"静默收尾"计数器的输入),而 @ 抢棒要读这一棒说出口的
	// mention —— 两者都活在 `speech.length > 0` 分支的里面,而传棒活在它外面。
	// 有编排在飞时不走 @ 级联 + 意愿判定:这一轮该谁说已经由编排回答了。
	// 降级路径(编排要不到)照旧走那条老路,所以 `electWillingSpeakers` 不退役。
	// 这一条激活是不是**当前这份**编排派出来的。
	//
	// 此前问的是"房里有没有编排",于是两件事一起坏了:一条属于**旧**编排的在飞
	// 回合会把 `waveSpoke` / @ 插批写进刚装上的新编排(审查 #12);而编排在飞时
	// 一条**非编排**的激活(任务事件)说出口的 @ 被整段跳过 —— 级联被 planRoom
	// 关掉,而下面的补救又只认 reason==='relay',两条路都不走(审查 #16)。
	const livePlanTurn = Boolean(after) && belongsToLiveCollabPlan(runtime, record);
	let turnMentionIds: string[] = [];

	if (after && speech.length > 0) {
		// One chain unit per utterance: an agent that sends three short lines said
		// three things. The boot recompute counts the same messages one by one, so
		// live and replay reach the same number (W12 alignment).
		runtime.state.chainCount += speech.length;

		let mentions: CollabMentionLike[];
		if (says.length > 0) {
			mentions = unionTurnMentions(says);
			// W13.2 stays as the FALLBACK it was demoted to: a say that named its
			// own replyTo is left alone (attachCollabReplyTo refuses a message that
			// already carries a snapshot), and only the FIRST utterance of the turn
			// is a candidate — by the second one the agent's own first line sits in
			// between, and quoting the trigger through it would read as a loop.
			attachCollabReplyTo(roomSessionId, says[0].id, record.sourceMessageId);
		} else {
			// W14a: the reply's own `@名字` become ids HERE — the one place where the
			// message is settled and the roster that produced it is still the current
			// one. The result feeds the cascade decision below, so the ids the
			// transcript keeps and the ids that activate members are the same list.
			mentions = attachCollabMentions(
				roomSessionId,
				speech[0].id,
				roomMembers(after),
			);
			attachCollabReplyTo(roomSessionId, speech[0].id, record.sourceMessageId);
		}

		const lastSpoken = speech[speech.length - 1];
		turnMentionIds = mentions.map((mention) => mention.agentId);
		// 收养的发言单独记账:消息照常送达,但「谁总是忘了按发送」这个信号不能被
		// 抹平 —— unsent 度量存在的理由就是量化这个失败,收养只是兜住后果。
		noteCollabSchedule(roomSessionId, {
			kind: adoptedDelivery ? "adopted" : "spoke",
			agentId: record.agentId,
			count: speech.length,
		});
		advanceWatermark(runtime, lastSpoken);
		persistRoomState(roomSessionId, runtime);

		// Cascade follow-up activations only for cleanly completed turns.
		//
		// 接力房整段跳过:那里"下一个说话的是谁"由环回答,不由 @ 决策 + 意愿判定
		// 回答。@ 没有被丢掉 —— 它在下面变成抢棒(§3③)。
		if (outcome === "complete" && !livePlanTurn) {
			const decision = decideCollabActivations({
				authorKind: "agent",
				authorAgentId: record.agentId,
				// The turn's utterances judged as one act: a member @-ed in the second
				// of three lines is addressed just as squarely as one named in the first.
				text: speech.map((message) => message.content).join("\n"),
				// Empty means "the stamp resolved nothing" — which can also mean the
				// stamp never ran (message gone, room re-typed). Falling through to the
				// text scan then costs nothing and never loses an activation.
				...(mentions.length > 0 ? { mentions } : {}),
				members: roomMembers(after),
				chainCount: runtime.state.chainCount,
				maxChain: maxChainFor(after),
				frozen: after.room?.frozen,
				// D6 免判(双成员 dm 房,IM P3):一对一里 agent 开口就是在对对面说话,
				// 所以合成一个 mention —— 与单成员房用的是同一套手法,于是 reason
				// 'mention'、链长闸、去重、驱动侧的冻结/退休/预算门全部照常。省掉的
				// 只有下面那次意愿判定,而在两个人的房里它的候选面本来就是空的。
				// 用户插话不走这里(那是 handleRoomUserMessage 的事,双成员房照旧判定)。
				...(isAgentPairDmRoom(after.room) ? { dmPairPeer: true } : {}),
			});
			if (decision.blockedByChain && !runtime.chainNoticePosted) {
				runtime.chainNoticePosted = true;
				postSystemLine(
					roomSessionId,
					buildCollabChainHoldLine({
						maxChain: maxChainFor(after),
						...(isAgentPairDmRoom(after.room) ? { pairDm: true } : {}),
					}),
				);
			}
			cascade.enqueue(
				roomSessionId,
				runtime,
				decision.activations,
				lastSpoken.id,
			);

			// What was said is a real message too, so the room judges it — but only
			// below the chain cap: an agent-authored message at the cap buys no
			// judgement calls (same gate the mention path hits via blockedByChain).
			// W21: what this round can produce is self-elected activations, so it is
			// the SELF-ELECT cap that decides whether to pay for the round at all —
			// no point spending one call per member for records the drive gate will
			// freeze. Mentions are unaffected: they were decided above, at the full
			// cap, before this line.
			if (
				runtime.state.chainCount <
				resolveCollabChainCap("self-elected", maxChainFor(after))
			) {
				const elected = await cascade.electWillingSpeakers({
					roomSessionId,
					session: after,
					exclude: new Set(
						decision.activations.map((activation) => activation.agentId),
					),
					authorAgentId: record.agentId,
					targetMessageId: lastSpoken.id,
				});
				if (elected.length > 0) {
					cascade.enqueue(
						roomSessionId,
						runtime,
						selfElected(elected),
						lastSpoken.id,
					);
				}
			}
		}
	} else if (after && (turnMessage || harvested.legacySpeech)) {
		// The turn ran and said nothing — a thinking record in the execution
		// session with no say beside it (W18/W14b), or a `[pass]` sentinel in an
		// older transcript. Silence is a legal state in an IM room: no chain, no
		// cascade, no line. The trigger IS consumed, so a restart never re-drives
		// it — and the watermark must name a ROOM message to do that, which the
		// turn record no longer is (it lives in another session entirely).
		//
		// P2-3: and it must be a ROOM message. The old fallback ended at
		// `turnMessage`, which since W18 lives in the execution session — a
		// watermark pointing at an id the room does not contain fails the id lookup
		// on the next boot and falls through to the timestamp path, where it
		// silently retires every room message older than that turn. When no room
		// anchor exists (a task-event activation has no source message at all, and
		// that is the normal path) the watermark simply does not move: dedup is
		// already two-level (the state record here, the `collabSourceMessageId`
		// stamp on the drive, W23), so nothing re-drives for want of a fake anchor.
		const consumed =
			(record.sourceMessageId
				? after.messages.find(
						(message) => message.id === record.sourceMessageId,
					)
				: undefined) ?? harvested.legacySpeech;
		if (consumed) advanceWatermark(runtime, consumed);
		persistRoomState(roomSessionId, runtime);
		// 「没说话」和「说了 N 句」一样是调度结果,而且它是接力自然收尾的输入 ——
		// 不记的话,「刚才」里那一圈静默看起来就像什么都没发生过。
		//
		// 沉默分两种,必须分开记(2026-08-02 真机):**写而未发**(回合把答复写成
		// 大段正文收尾,零 say —— 那段话谁也看不见)与**真沉默**(读完确实没自己的
		// 事)。长文型成员一半的回合栽在前者,而两者在「刚才」里长一个样的话,这个
		// 失败永远量化不了。阈值放过收尾的只言片语(「已回复,无补充」不算写了话)。
		// 收养式兜底之后,能走到这里的「写而未发」只剩投递被门拒掉(冻结/超预算/
		// 已除名)或收养本身异常的情形 —— 送出去的都进了上面的发言分支记 adopted。
		// outcome 门(四审 C-1):中止/超时的回合就算留了半成品正文也不算「写而未发」
		// —— 那是被打断,不是忘了发。不加这道门,用户亲手停掉的回合会在私聊里被
		// 报成「写了内容没发送」,而这个度量要量的正是 complete 回合的忘发率。
		const unsentProse = (turnMessage?.content ?? "").trim();
		const wroteButUnsent =
			outcome === "complete" && unsentProse.length >= COLLAB_UNSENT_PROSE_MIN;
		noteCollabSchedule(roomSessionId, {
			kind: wroteButUnsent ? "unsent" : "silent",
			agentId: record.agentId,
		});
		// 群里沉默是合法状态(别人还会说话,而且判定层本来就允许"这轮不说")。
		// 私聊里它是死路的最后一种形态:用户问了一句,回合跑完了,对话面上什么都
		// 没有。所以只在私聊贴一行事实——不解释、不催,只让"没有回应"变得可见。
		postDmDeadEndLine(
			after,
			wroteButUnsent
				? `${agent.name} 写了内容但没有发送`
				: `${agent.name} 这一轮没有说话`,
		);
	} else {
		// Nothing persisted at all — surface the failure instead of a silent
		// fold line followed by nothing (评审修订).
		persistRoomState(roomSessionId, runtime);
		if (outcome !== "complete") {
			const why =
				outcome === "timeout"
					? "响应超时"
					: outcome === "aborted"
						? "已被中止"
						: "模型调用失败";
			postSystemLine(roomSessionId, `${agent.name} 未能应答(${why})`);
		}
	}

	// 编排记账(collab-coordinator-plan.md §5)。
	//
	// **推进不在这里** —— 一个 wave 可以有 N 个回合,"这一批完了没有"只有调度泵
	// 知道。接力时代一棒就是一个回合,所以传棒写在回合收尾;照搬过来的话,同一批
	// 的兄弟回合会互相误判成"另一根棒子"。这里只留两件回合自己才知道的事:
	//
	//  1. 这一批**有人开口了** —— 静默收尾那一格的输入;
	//  2. 它在发言里 @ 了谁 —— 没排上的插进下一批。编排开跑后不再问协调器
	//     (设计:耗尽才停,中途不续推),但「点名必须能应」不能让步,所以这里
	//     做一次**机械**插入:不问模型,也不重排已有批次。
	if (after && livePlanTurn) {
		if (speech.length > 0) noteCollabPlanSpoke(runtime);
		if (outcome === "complete" && turnMentionIds.length > 0) {
			const spliced = spliceCollabPlanMentions(
				runtime,
				turnMentionIds.filter((agentId) => agentId !== record.agentId),
				after,
			);
			if (spliced.length > 0) {
				for (const agentId of spliced) {
					noteCollabSchedule(roomSessionId, { kind: "relay-pass", agentId });
				}
			}
		}
		persistRoomState(roomSessionId, runtime);
	}
	return "done";
}
/** Drop every agent lock (process teardown / test reset). The chain each entry
 *  holds is only ever a chain of resolved gates, so nothing is left waiting. */
export function clearAgentSessionLocks(): void {
	agentSessionLocks.clear();
}

/** How many agents currently hold (or are queued behind) a turn lock. Exists
 *  so the self-cleaning invariant above is assertable — the map is otherwise
 *  invisible, which is exactly how it grew unbounded. */
export function agentSessionLockCount(): number {
	return agentSessionLocks.size;
}

/** The lock itself, for the tests that pin its queueing and self-cleaning. */
export const withAgentSessionLockForTest = withAgentSessionLock;
