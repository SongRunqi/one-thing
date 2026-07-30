import type {
	ChatMessage,
	ChatSession,
	ToolCall,
	Step,
	ContentPart,
	SessionMeta,
	SessionDetails,
	ContextVariable,
	SessionGoal,
	GetSessionMessagesPageRequest,
	GetSessionMessagesPageResponse,
	PromptContextState,
	UserMessageMarker,
} from "@shared/ipc.js";
import { join } from "node:path";
import {
	getSessionsDir,
	getSessionPath,
	readJsonFile,
	writeJsonFile,
	writeJsonFileAsync,
	deleteJsonFile,
} from "./paths.js";
import { getCurrentSessionId, setCurrentSessionId } from "./app-state.js";
import { getSettings } from "./settings.js";
import { expandPath } from "../tools/core/sandbox.js";
import {
	createHybridSessionStorageDriver,
	createOnethingSessionMessageRuntime,
	createOnethingSessionRepository,
	type OnethingSessionMessageRuntime,
} from "@onething/runtime/sessions";
import { COLLAB_MESSAGE_SOURCE, COLLAB_TURN_SOURCE } from "@onething/runtime/collab";
import {
	CORE_DEFAULT_AGENT_ID as DEFAULT_AGENT_ID,
	deriveRetainedContextSize,
	repairSessionTimelineMetadata,
	sanitizeSessionOnStartup,
} from "@onething/core/session";

export {
	deriveRetainedContextSize,
	repairSessionTimelineMetadata,
	sanitizeSessionOnStartup,
};

// ============ 异步节流落盘 ============
// Streaming updates (每个 token) 会频繁触发 updateMessageContent 等写入,
// 同步 writeFileSync 会阻塞事件循环并拖慢流式节奏。
// 策略:更新内存缓存后,用 300ms 节流把脏 session 异步写盘。
// 同一 session 的多次写入在 promise 链上串行化,避免旧异步写盖新数据。
// 关键生命周期(finalize / delete / 应用退出)会强制 flush。
let sessionMessageRuntime:
	| OnethingSessionMessageRuntime<
			ChatSession,
			ChatMessage,
			SessionMeta,
			Step,
			ContentPart,
			ToolCall
	  >
	| undefined;

// 会话体是大文件且只被程序读取,紧凑序列化;index.json 等仍走 pretty 的 writeJsonFile。
const writeSessionJsonFileAsync = (filePath: string, data: unknown) =>
	writeJsonFileAsync(filePath, data, { pretty: false });

const sessionStorageDriver = createHybridSessionStorageDriver<ChatSession>({
	getSessionsDir,
	getLegacySessionPath: getSessionPath,
	// flag 只决定"新建会话"的格式(也是惰性迁移的开关);已有会话跟随盘上格式,
	// settings.storage.sessionFormat 设为 legacy-json 即回滚
	newSessionFormat: () => getSettings().storage?.sessionFormat ?? "jsonl",
	readJsonFile,
	writeJsonFileAsync: writeSessionJsonFileAsync,
	deleteJsonFile,
	logger: console,
});

const sessionRepository = createOnethingSessionRepository<
	ChatSession,
	ChatMessage,
	SessionMeta,
	SessionDetails,
	UserMessageMarker
>({
	defaultAgentId: DEFAULT_AGENT_ID,
	getSessionsDir,
	getSessionPath,
	readJsonFile,
	writeJsonFile,
	writeJsonFileAsync: writeSessionJsonFileAsync,
	deleteJsonFile,
	storageDriver: sessionStorageDriver,
	getCurrentSessionId,
	setCurrentSessionId,
	getDefaultWorkingDirectory: () =>
		getSettings().tools?.bash?.defaultWorkingDirectory,
	expandPath,
	logger: console,
});

sessionMessageRuntime = createOnethingSessionMessageRuntime<
	ChatSession,
	ChatMessage,
	SessionMeta,
	Step,
	ContentPart,
	ToolCall
>({
	repository: {
		getSession: (sessionId) => sessionRepository.getSession(sessionId),
		getCachedSession: (sessionId) =>
			sessionRepository.getCachedSession(sessionId),
		saveSessionToFile: (sessionId, session, options) =>
			sessionRepository.saveSessionToFile(sessionId, session, options),
		syncSessionToSqliteIfReady: (session) =>
			sessionRepository.syncSessionToSqliteIfReady(session),
		updateSessionsIndexMeta: (sessionId, update) =>
			sessionRepository.updateSessionsIndexMeta(sessionId, update),
	},
	now: Date.now,
	logger: console,
});

function updateSessionsIndexMeta(
	sessionId: string,
	update: (meta: SessionMeta) => void,
): boolean {
	return sessionRepository.updateSessionsIndexMeta(sessionId, update);
}

/**
 * 强制刷盘单个 session,等待所有挂起的写入完成。
 * 用于 stream 结束、session 删除前等关键点。
 */
export async function flushSessionSave(sessionId: string): Promise<void> {
	await sessionRepository.flushSessionSave(sessionId);
}

/**
 * 应用退出前调用,刷完所有挂起的异步写入。
 */
export async function flushAllPendingSaves(): Promise<void> {
	await sessionRepository.flushAllPendingSaves();
}

/**
 * 统一的保存函数 - 更新缓存并安排异步落盘
 * 默认节流异步,finalize/delete 等关键路径可调 flushSessionSave 强刷
 */
function saveSessionToFile(sessionId: string, session: ChatSession): void {
	sessionRepository.saveSessionToFile(sessionId, session);
}

/**
 * 整会话保存:宿主 facade(如 server HTTP API)对会话对象做原地修改后调用。
 * 刷新 LRU 权威副本 + 节流异步落盘,并同步 index 元数据(列表读只走 index、
 * 不加载消息体,漏盖章会导致列表与会话体不一致)。
 */
export function saveSessionSnapshot(
	session: ChatSession,
	mutateIndexMeta?: (meta: SessionMeta) => void,
): void {
	sessionRepository.saveSessionToFile(session.id, session);
	sessionRepository.updateSessionsIndexMeta(session.id, (meta) => {
		meta.name = session.name;
		meta.updatedAt = session.updatedAt;
		meta.isPinned = session.isPinned;
		meta.isArchived = session.isArchived;
		meta.agentId = session.agentId;
		meta.messageCount = session.messages.length;
		mutateIndexMeta?.(meta);
	});
	sessionRepository.syncSessionToSqliteIfReady(session);
}

/**
 * 失效单个 session 缓存
 */
export function invalidateSessionCache(sessionId: string): void {
	sessionRepository.invalidateSessionCache(sessionId);
}

/**
 * 清空所有缓存（应用重启时可能需要）
 */
export function clearAllSessionCache(): void {
	sessionRepository.clearAllSessionCache();
}

/**
 * 获取 LRU 缓存统计信息（调试用）
 */
export function getSessionCacheStats(): {
	size: number;
	maxSize: number;
	cachedSessionIds: string[];
} {
	return sessionRepository.getSessionCacheStats();
}

// Load sessions index (metadata only)
function loadSessionsIndex(): SessionMeta[] {
	return sessionRepository.loadSessionsIndex();
}

// Save sessions index
function saveSessionsIndex(index: SessionMeta[]): void {
	sessionRepository.saveSessionsIndex(index);
}

// Get all sessions with full data (legacy, for backward compatibility)
export function getSessions(): ChatSession[] {
	return sessionRepository.getSessions();
}

// ============================================================================
// Optimized Session Loading (Metadata Separation)
// ============================================================================

/**
 * workingDirectory is persisted per-session (meta.json / SessionDetails) but is
 * NOT kept in the fast sessions index that `getSessionsList` returns. The
 * sidebar groups sessions by project, so we surface it in the list: read each
 * session's persisted cwd once into this cache (meta.json holds no messages, so
 * the scan is cheap), then keep it fresh on explicit writes. The active
 * session's live changes are separately mirrored into the renderer store via
 * `session:variables-updated`, so this cache only has to cover cold start.
 */
const sessionWorkdirCache = new Map<string, string>();
let sessionWorkdirBackfilled = false;

function readPersistedWorkdir(sessionId: string): string {
	const meta = readJsonFile<{ workingDirectory?: string }>(
		join(getSessionsDir(), sessionId, "meta.json"),
		{},
	);
	return typeof meta.workingDirectory === "string" ? meta.workingDirectory : "";
}

function ensureWorkdirBackfill(metas: SessionMeta[]): void {
	if (sessionWorkdirBackfilled) return;
	for (const meta of metas) {
		if (sessionWorkdirCache.has(meta.id)) continue;
		const indexWd = meta.workingDirectory;
		sessionWorkdirCache.set(
			meta.id,
			typeof indexWd === "string" && indexWd
				? indexWd
				: readPersistedWorkdir(meta.id),
		);
	}
	sessionWorkdirBackfilled = true;
}

/**
 * Get sessions list with metadata only (no messages)
 * This is the optimized version for fast startup
 */
export function getSessionsList(): SessionMeta[] {
	const metas = sessionRepository.getSessionsList();
	ensureWorkdirBackfill(metas);
	return metas.map((meta) => {
		const workingDirectory = sessionWorkdirCache.get(meta.id);
		return workingDirectory ? { ...meta, workingDirectory } : meta;
	});
}

export function initializeSessionRepositoryIndex(): void {
	sessionRepository.initializeSessionRepositoryIndex();
}

/**
 * Get session details without messages
 * Used for session activation before loading messages
 */
export function getSessionDetails(
	sessionId: string,
): SessionDetails | undefined {
	return sessionRepository.getSessionDetails(sessionId);
}

/**
 * Get session messages only
 * Called separately after activating a session
 */
export function getSessionMessages(
	sessionId: string,
): ChatMessage[] | undefined {
	return sessionRepository.getSessionMessages(sessionId);
}

/**
 * Get a cursor-addressed page of session messages.
 *
 * This JSON-backed implementation intentionally preserves the existing storage
 * path while establishing the page contract that SQLite will implement
 * directly. It still reads the full legacy session file internally.
 */
export function getSessionMessagesPage(
	request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse {
	return sessionRepository.getSessionMessagesPage(
		request,
	) as GetSessionMessagesPageResponse;
}

export function getSessionUserMessageMarkers(
	sessionId: string,
): UserMessageMarker[] | undefined {
	return sessionRepository.getSessionUserMessageMarkers(sessionId);
}

/**
 * Read a session from disk without inserting into the LRU cache.
 * Use for bulk read-only operations like search that scan many sessions.
 */
export function getSessionRaw(sessionId: string): ChatSession | undefined {
	return sessionRepository.getSessionRaw(sessionId);
}

// Get a single session by ID
export function getSession(sessionId: string): ChatSession | undefined {
	return sessionRepository.getSession(sessionId);
}

// Create a new session
export function createSession(sessionId: string, name: string): ChatSession {
	return sessionRepository.createSession(sessionId, name);
}

/**
 * Collab (multi-agent room) session fields — docs/design/multi-agent-collab.md.
 * `undefined` leaves a field untouched, `null` deletes it.
 */
export function updateSessionCollab(
	sessionId: string,
	fields: {
		kind?: ChatSession["kind"] | null;
		room?: ChatSession["room"] | null;
		collab?: ChatSession["collab"] | null;
	},
): boolean {
	return sessionRepository.updateSessionCollab(sessionId, fields);
}

// Create a branch session
export function createBranchSession(
	sessionId: string,
	name: string,
	parentSessionId: string,
	branchFromMessageId: string,
	inheritedMessages: ChatMessage[],
): ChatSession {
	return sessionRepository.createBranchSession(
		sessionId,
		name,
		parentSessionId,
		branchFromMessageId,
		inheritedMessages,
	);
}

// Delete session result type
export interface DeleteSessionResult {
	deletedIds: string[];
	parentSessionId?: string;
}

/**
 * Subsystems that own per-session state OUTSIDE the session file, notified
 * after a delete lands (P2-10).
 *
 * An observer seam rather than a direct call, because the dependency may only
 * point one way: this module is a store, and a store that imported the room
 * coordinator to clean up after it would invert the layering. Subsystems
 * register themselves at startup and are handed the ids that went away.
 */
type SessionsDeletedListener = (deletedSessionIds: readonly string[]) => void

const sessionsDeletedListeners = new Set<SessionsDeletedListener>()

export function onSessionsDeleted(listener: SessionsDeletedListener): () => void {
	sessionsDeletedListeners.add(listener);
	return () => {
		sessionsDeletedListeners.delete(listener);
	};
}

// Delete a session and all its child sessions (cascade delete)
export function deleteSession(sessionId: string): DeleteSessionResult {
	const result = sessionRepository.deleteSession(sessionId);
	for (const listener of sessionsDeletedListeners) {
		try {
			listener(result.deletedIds);
		} catch (error) {
			console.error("[Sessions] delete listener failed:", error);
		}
	}
	return result;
}

// Rename a session (does not update updatedAt to avoid reordering)
export function renameSession(sessionId: string, newName: string): void {
	sessionRepository.renameSession(sessionId, newName);
}

// Update session pin status (does not affect sort order)
export function updateSessionPin(sessionId: string, isPinned: boolean): void {
	sessionRepository.updateSessionPin(sessionId, isPinned);
}

// Update session archived status (does not affect sort order)
export function updateSessionArchived(
	sessionId: string,
	isArchived: boolean,
	archivedAt?: number | null,
): void {
	sessionRepository.updateSessionArchived(sessionId, isArchived, archivedAt);
}

// Update session working directory (does not affect sort order)
export function updateSessionPermissionMode(
	sessionId: string,
	permissionMode: ChatSession["permissionMode"],
): boolean {
	return sessionRepository.updateSessionPermissionMode(
		sessionId,
		permissionMode,
	);
}

export function updateSessionWorkingDirectory(
	sessionId: string,
	workingDirectory: string | null,
): void {
	sessionRepository.updateSessionWorkingDirectory(sessionId, workingDirectory);
	sessionWorkdirCache.set(sessionId, workingDirectory ?? "");
}

export function updateSessionWorkingDirectoryRoots(
	sessionId: string,
	roots: string[],
): void {
	sessionRepository.updateSessionWorkingDirectoryRoots(sessionId, roots);
}

export function updateSessionVariables(
	sessionId: string,
	variables: ContextVariable[],
): void {
	sessionRepository.updateSessionVariables(sessionId, variables);
}

// Update session goal (does not affect sort order); null clears it
export function updateSessionGoal(sessionId: string, goal: SessionGoal | null): void {
	sessionRepository.updateSessionGoal(sessionId, goal);
}

// Write the goal history plus its derived current goal (see goal-system-v3)
export function updateSessionGoals(
	sessionId: string,
	goals: SessionGoal[],
	current: SessionGoal | null,
): void {
	sessionRepository.updateSessionGoals(sessionId, goals, current);
}

// Inherit working directory from workspace (does not update updatedAt)
export function inheritSessionWorkingDirectory(
	sessionId: string,
	workingDirectory: string,
): void {
	sessionRepository.inheritSessionWorkingDirectory(sessionId, workingDirectory);
	sessionWorkdirCache.set(sessionId, workingDirectory);
}

// Update session token usage (does not affect sort order)
export function updateSessionTokenUsage(
	sessionId: string,
	usage: { inputTokens: number; outputTokens: number; totalTokens: number },
	lastTurnUsage?: { inputTokens: number; outputTokens: number },
): void {
	const before = sessionMessageRuntime!.getSessionTokenUsage(sessionId);
	sessionRepository.updateSessionTokenUsage(sessionId, usage, lastTurnUsage);
	const after = sessionMessageRuntime!.getSessionTokenUsage(sessionId);
	console.log("[SessionUsage] updateSessionTokenUsage", {
		sessionId,
		source: "stream-final-usage",
		usageInputTokens: usage.inputTokens,
		usageOutputTokens: usage.outputTokens,
		usageTotalTokens: usage.totalTokens,
		lastTurnInputTokens: lastTurnUsage?.inputTokens,
		lastTurnOutputTokens: lastTurnUsage?.outputTokens,
		beforeContextSize: before?.contextSize,
		beforeLastInputTokens: before?.lastInputTokens,
		afterContextSize: after?.contextSize,
		afterLastInputTokens: after?.lastInputTokens,
		afterTotalInputTokens: after?.totalInputTokens,
		afterTotalTokens: after?.totalTokens,
	});
}

export function updateSessionContextSize(
	sessionId: string,
	contextSize: number,
	source = "direct",
): boolean {
	const before = sessionMessageRuntime!.getSessionTokenUsage(sessionId);
	const updated = sessionRepository.updateSessionContextSize(
		sessionId,
		contextSize,
	);
	const after = sessionMessageRuntime!.getSessionTokenUsage(sessionId);
	console.log("[SessionUsage] updateSessionContextSize", {
		sessionId,
		source,
		contextSize,
		updated,
		beforeContextSize: before?.contextSize,
		beforeLastInputTokens: before?.lastInputTokens,
		afterContextSize: after?.contextSize,
		afterLastInputTokens: after?.lastInputTokens,
	});
	return updated;
}

export function updateSessionPromptContext(
	sessionId: string,
	promptContext: PromptContextState | null,
): boolean {
	return sessionRepository.updateSessionPromptContext(sessionId, promptContext);
}

// Get session token usage
export function getSessionTokenUsage(sessionId: string): {
	totalInputTokens: number;
	totalOutputTokens: number;
	totalTokens: number;
	lastInputTokens: number;
	contextSize: number;
} | null {
	return sessionMessageRuntime!.getSessionTokenUsage(sessionId);
}

/**
 * Collab persona attribution (docs/design/multi-agent-collab.md D3): assistant
 * messages in room/work sessions get the speaking agent stamped at this single
 * choke point — every engine creation site (send / edit / retry / mid-turn
 * follow-up writer) persists through here, so no core change is needed.
 */
function stampCollabAgentId(sessionId: string, message: ChatMessage): void {
	if (message.role !== "assistant" || message.agentId) return;
	const session = sessionRepository.getSession(sessionId);
	if (
		!session ||
		(session.kind !== "room" &&
			session.kind !== "work" &&
			session.kind !== "agent")
	)
		return;
	if (session.agentId) message.agentId = session.agentId;

	/**
	 * W14b 思考与发言分离: in a ROOM the turn's own assistant message is the
	 * agent's THINKING record, never its speech — speech is a `say` call, which
	 * writes its own message with an agentId already on it and therefore never
	 * reaches this branch.
	 *
	 * Stamped at CREATION rather than at the coordinator's turn finale (which is
	 * where the工单 put it) for two reasons the finale cannot give:
	 *   1. no flash — the marker exists before the message can ever render, so
	 *      the room never paints a full bubble that collapses to a hairline a
	 *      tick later;
	 *   2. crash-safe — a process that dies mid-turn leaves a record that still
	 *      reads as thinking instead of impersonating an utterance nobody made.
	 * Everything downstream keys off the marker (projection / chain / render),
	 * so the epoch judgement is identical either way.
	 *
	 * The marker rides the message's own `source`, not `origin.source`: an
	 * assistant message has no MessageOrigin to speak of (that type is the
	 * inbound-channel envelope, transport + receivedAt required) and the sibling
	 * markers on this exact axis — COLLAB_HARVEST_SOURCE, COLLAB_SAY_SOURCE —
	 * already live there. Every predicate reads both fields, so a message
	 * stamped either way judges the same.
	 *
	 * The origin guard tolerates COLLAB_MESSAGE_SOURCE ('collab'): the engine
	 * copies the DRIVE's channel envelope onto the reply it creates, so every
	 * production room turn arrives as origin.source='collab' — that is inbound
	 * routing, not an utterance epoch, and treating it as one left the whole
	 * turn rendering as legacy speech (真机实锤 2026-07-28: src=None 满屏).
	 * Only real epoch markers (say/harvest) block the stamp.
	 *
	 * W18 moved the turn into the agent's own execution session, and the marker
	 * moved with it: the whole session is an execution record, and the harvest
	 * reads this marker to tell a thinking record from legacy speech. Rooms
	 * keep the branch for pre-W18 transcripts (and for any path that still
	 * creates an assistant message there).
	 */
	if (
		(session.kind === "room" || session.kind === "agent") &&
		!message.source &&
		(!message.origin?.source || message.origin.source === COLLAB_MESSAGE_SOURCE)
	) {
		message.source = COLLAB_TURN_SOURCE;
	}
}

// Add a message to a session
export function addMessage(sessionId: string, message: ChatMessage): void {
	stampCollabAgentId(sessionId, message);
	sessionMessageRuntime!.addMessage(sessionId, message);
}

// Insert a message after a specific message ID
// Used for context compacting to insert summary message at the correct position
export function insertMessageAfter(
	sessionId: string,
	afterMessageId: string,
	message: ChatMessage,
): boolean {
	return sessionMessageRuntime!.insertMessageAfter(
		sessionId,
		afterMessageId,
		message,
	);
}

// Delete a message from a session
export function deleteMessage(sessionId: string, messageId: string): boolean {
	return sessionMessageRuntime!.deleteMessage(sessionId, messageId);
}

// Delete a message and all messages after it.
// Used when regenerating an earlier assistant response so later conversation is discarded.
export function deleteMessageAndTruncate(
	sessionId: string,
	messageId: string,
): boolean {
	return sessionMessageRuntime!.deleteMessageAndTruncate(sessionId, messageId);
}

// Update a message and remove all messages after it
// Returns true if successful, also subtracts token usage of deleted messages from session total
export function updateMessageAndTruncate(
	sessionId: string,
	messageId: string,
	newContent: string,
	options?: { contentParts?: ChatMessage["contentParts"] | null },
): boolean {
	return sessionMessageRuntime!.updateMessageAndTruncate(
		sessionId,
		messageId,
		newContent,
		options,
	);
}

// Update message content (for streaming, does not affect sort order)
export function updateMessageContent(
	sessionId: string,
	messageId: string,
	newContent: string,
): boolean {
	return sessionMessageRuntime!.updateMessageContent(
		sessionId,
		messageId,
		newContent,
	);
}

// Update message reasoning (for streaming, does not affect sort order)
export function updateMessageReasoning(
	sessionId: string,
	messageId: string,
	reasoning: string,
): boolean {
	return sessionMessageRuntime!.updateMessageReasoning(
		sessionId,
		messageId,
		reasoning,
	);
}

// Update message streaming status (does not affect sort order)
export function updateMessageStreaming(
	sessionId: string,
	messageId: string,
	isStreaming: boolean,
): boolean {
	return sessionMessageRuntime!.updateMessageStreaming(
		sessionId,
		messageId,
		isStreaming,
	);
}

// Update message usage (does not affect sort order)
export function updateMessageUsage(
	sessionId: string,
	messageId: string,
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
		reasoningTokens?: number;
	},
): boolean {
	return sessionMessageRuntime!.updateMessageUsage(sessionId, messageId, usage);
}

// Update message tool calls (does not affect sort order)
export function updateMessageToolCalls(
	sessionId: string,
	messageId: string,
	toolCalls: ToolCall[],
): boolean {
	return sessionMessageRuntime!.updateMessageToolCalls(
		sessionId,
		messageId,
		toolCalls,
	);
}

// Update message content parts (does not affect sort order)
export function updateMessageContentParts(
	sessionId: string,
	messageId: string,
	contentParts: ChatMessage["contentParts"],
): boolean {
	return sessionMessageRuntime!.updateMessageContentParts(
		sessionId,
		messageId,
		contentParts,
	);
}

// Add a single content part to message (does not affect sort order)
export function addMessageContentPart(
	sessionId: string,
	messageId: string,
	part: ContentPart,
): boolean {
	return sessionMessageRuntime!.addMessageContentPart(
		sessionId,
		messageId,
		part,
	);
}

// Update message thinking time (does not affect sort order)
export function updateMessageThinkingTime(
	sessionId: string,
	messageId: string,
	thinkingTime: number,
): boolean {
	return sessionMessageRuntime!.updateMessageThinkingTime(
		sessionId,
		messageId,
		thinkingTime,
	);
}

// Update message skill used (does not affect sort order)
export function updateMessageSkill(
	sessionId: string,
	messageId: string,
	skillUsed: string,
): boolean {
	return sessionMessageRuntime!.updateMessageSkill(
		sessionId,
		messageId,
		skillUsed,
	);
}

// Update message error details (for API errors during streaming)
export function updateMessageError(
	sessionId: string,
	messageId: string,
	errorDetails: string,
): boolean {
	return sessionMessageRuntime!.updateMessageError(
		sessionId,
		messageId,
		errorDetails,
	);
}

// Update IM emoji reactions (W8, rooms only; does not affect sort order)
export function updateMessageReactions(
	sessionId: string,
	messageId: string,
	reactions: NonNullable<ChatMessage["reactions"]>,
): boolean {
	return sessionMessageRuntime!.updateMessageReactions(
		sessionId,
		messageId,
		reactions,
	);
}

// Attach an IM quote-reply snapshot after the fact (W13.2, rooms only; does
// not affect sort order)
export function updateMessageReplyTo(
	sessionId: string,
	messageId: string,
	replyTo: NonNullable<ChatMessage["replyTo"]>,
): boolean {
	return sessionMessageRuntime!.updateMessageReplyTo(
		sessionId,
		messageId,
		replyTo,
	);
}

// Stamp identity-resolved @mentions after the fact (W14a, rooms only; does
// not affect sort order)
export function updateMessageMentions(
	sessionId: string,
	messageId: string,
	mentions: NonNullable<ChatMessage["mentions"]>,
): boolean {
	return sessionMessageRuntime!.updateMessageMentions(
		sessionId,
		messageId,
		mentions,
	);
}

// Add a step to a message (does not affect sort order)
export function addMessageStep(
	sessionId: string,
	messageId: string,
	step: Step,
): boolean {
	return sessionMessageRuntime!.addMessageStep(sessionId, messageId, step);
}

// Update a step in a message (does not affect sort order)
// Searches recursively in childSteps
export function updateMessageStep(
	sessionId: string,
	messageId: string,
	stepId: string,
	updates: Partial<Step>,
): boolean {
	return sessionMessageRuntime!.updateMessageStep(
		sessionId,
		messageId,
		stepId,
		updates,
	);
}

export function updateMessageSteps(
	sessionId: string,
	messageId: string,
	steps: Step[] | undefined,
): boolean {
	return sessionMessageRuntime!.updateMessageSteps(sessionId, messageId, steps);
}

// Update usage for all steps in a specific turn (does not affect sort order)
export function updateStepsUsageByTurn(
	sessionId: string,
	messageId: string,
	turnIndex: number,
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
		reasoningTokens?: number;
	},
): string[] {
	return sessionMessageRuntime!.updateStepsUsageByTurn(
		sessionId,
		messageId,
		turnIndex,
		usage,
	);
}

// Update session summary (for context compacting)
export function updateSessionSummary(
	sessionId: string,
	summary: string,
	summaryUpToMessageId: string,
): boolean {
	return sessionRepository.updateSessionSummary(
		sessionId,
		summary,
		summaryUpToMessageId,
	);
}

export function updateSessionModel(
	sessionId: string,
	provider: string,
	model: string,
	options: { pinned?: boolean } = {},
): boolean {
	return sessionRepository.updateSessionModel(sessionId, provider, model, options);
}

export function updateSessionAgent(
	sessionId: string,
	agentId: string,
): boolean {
	return sessionRepository.updateSessionAgent(sessionId, agentId);
}
