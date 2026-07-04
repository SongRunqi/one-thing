import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
	SessionDetails,
	ContextVariable,
	PermissionMode,
} from "@/types";
import { platformApi } from "@/platform";
import { DEFAULT_AGENT_ID } from "../../shared/ipc";
import { useChatStore } from "./chat";
import { useSettingsStore } from "./settings";

// Base session type for list display - can be metadata-only initially, then
// hydrated with full activation details such as token/context fields.
// This allows mixed loading: metadata on startup, full session after switching
type SessionListItem = SessionDetails;
type NewChatDraft = SessionDetails & { readonly kind: "new-chat-draft" };
type VisibleSessionListItem = SessionListItem | NewChatDraft;

const SWITCH_INITIAL_MESSAGE_LIMIT = 6;
const SWITCH_TARGET_MESSAGE_LIMIT = 16;

let switchGeneration = 0;
const sessionNameAnimationTimers = new Map<
	string,
	ReturnType<typeof setTimeout>
>();
const sessionNameAnimationTokens = new Map<string, number>();

function caughtErrorMessage(error: object | undefined, fallback: string): string {
	if (error instanceof Error && error.message) return error.message;
	if (error && "message" in error && typeof error.message === "string" && error.message) {
		return error.message;
	}
	return fallback;
}

export const useSessionsStore = defineStore("sessions", () => {
	// Sessions list stores metadata-only items initially
	// Full session data is loaded on-demand when switching sessions
	const sessions = ref<SessionListItem[]>([]);
	const newChatDrafts = ref<NewChatDraft[]>([]);
	const currentSessionId = ref<string>("");
	const isLoading = ref(false);
	// Track if current session is "active" (messages loaded in memory)
	const isActive = ref(false);

	/**
	 * Per-session full variable snapshot (system + custom). The map is the
	 * single source of truth for the inspector. Hydrated on session
	 * switch via `fetchVariables()`, then live-updated by ipc-hub when
	 * `session:variables-updated` arrives.
	 */
	const sessionVariables = ref<Map<string, ContextVariable[]>>(new Map());

	const currentSession = computed<VisibleSessionListItem | undefined>(() => {
		return (
			newChatDrafts.value.find(
				(draft) => draft.id === currentSessionId.value,
			) || sessions.value.find((s) => s.id === currentSessionId.value)
		);
	});

	const sessionCount = computed(() => sessions.value.length);

	// Filter sessions (excluding archived), sorted by pinned first
	const filteredSessions = computed((): SessionListItem[] => {
		const filtered = sessions.value.filter((s) => !s.isArchived);

		// Only group by pinned, keep array order (new sessions are unshifted to top)
		const pinned = filtered.filter((s) => s.isPinned);
		const unpinned = filtered.filter((s) => !s.isPinned);
		return [...pinned, ...unpinned];
	});

	const sidebarSessions = computed((): VisibleSessionListItem[] => {
		return [...newChatDrafts.value, ...filteredSessions.value];
	});

	// Get all archived sessions
	const archivedSessions = computed(() => {
		return sessions.value
			.filter((s) => s.isArchived)
			.sort(
				(a, b) => (b.archivedAt || b.updatedAt) - (a.archivedAt || a.updatedAt),
			);
	});

	const filteredSessionCount = computed(() => filteredSessions.value.length);

	function findSessionItem(sessionId: string): VisibleSessionListItem | undefined {
		return (
			sessions.value.find((s) => s.id === sessionId) ||
			newChatDrafts.value.find((draft) => draft.id === sessionId)
		);
	}

	function getSessionItem(sessionId?: string | null): VisibleSessionListItem | undefined {
		return sessionId ? findSessionItem(sessionId) : undefined;
	}

	function nextSessionNameAnimationToken(sessionId: string): number {
		const token = (sessionNameAnimationTokens.get(sessionId) ?? 0) + 1;
		sessionNameAnimationTokens.set(sessionId, token);
		const timer = sessionNameAnimationTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			sessionNameAnimationTimers.delete(sessionId);
		}
		return token;
	}

	function cancelSessionNameAnimation(sessionId: string): void {
		const timer = sessionNameAnimationTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			sessionNameAnimationTimers.delete(sessionId);
		}
		sessionNameAnimationTokens.delete(sessionId);
	}

	function setSessionName(sessionId: string, name: string): void {
		const session = findSessionItem(sessionId);
		if (!session) return;
		session.name = name;
	}

	function updateSessionNameAnimated(sessionId: string, nextName: string): void {
		const targetName = nextName.trim();
		if (!targetName) return;

		const session = findSessionItem(sessionId);
		if (!session) return;
		if (session.name === targetName) return;

		const token = nextSessionNameAnimationToken(sessionId);
		const chars = Array.from(targetName);
		let index = 0;

		const step = () => {
			if (sessionNameAnimationTokens.get(sessionId) !== token) return;
			const currentSession = findSessionItem(sessionId);
			if (!currentSession) return;

			index += 1;
			currentSession.name = chars.slice(0, index).join("");
			if (index < chars.length) {
				const delay = chars.length > 24 ? 24 : 32;
				sessionNameAnimationTimers.set(sessionId, setTimeout(step, delay));
				return;
			}

			currentSession.name = targetName;
			sessionNameAnimationTimers.delete(sessionId);
			sessionNameAnimationTokens.delete(sessionId);
		};

		step();
	}

	/**
	 * Load sessions list (metadata only, no messages)
	 * This is optimized for fast startup - messages are loaded on-demand
	 */
	async function loadSessions() {
		isLoading.value = true;
		try {
			// Use optimized API that returns only metadata (no messages)
			const response = await platformApi.getSessionsList();
			if (response.success) {
				sessions.value = response.sessions || [];
				// Don't auto-create new chat on app open - let user choose
			}
		} finally {
			isLoading.value = false;
		}
	}

	function isNewChatDraftId(sessionId?: string | null): boolean {
		return Boolean(
			sessionId && newChatDrafts.value.some((draft) => draft.id === sessionId),
		);
	}

	function createNewChatDraftId(): string {
		return `draft:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
	}

	function discardNewChatDraft(sessionId = currentSessionId.value) {
		if (!isNewChatDraftId(sessionId)) return;
		const chatStore = useChatStore();
		chatStore.clearSessionMessages(sessionId);
		chatStore.deleteSnapshot(sessionId);
		chatStore.clearComposerDraft(sessionId);
		newChatDrafts.value = newChatDrafts.value.filter(
			(draft) => draft.id !== sessionId,
		);
		if (currentSessionId.value === sessionId) {
			currentSessionId.value = "";
			isActive.value = false;
		}
	}

	function openNewChatDraft(name = "New Chat") {
		const chatStore = useChatStore();
		const currentDraft = newChatDrafts.value.find(
			(draft) => draft.id === currentSessionId.value,
		);
		if (currentDraft && chatStore.isComposerDraftEmpty(currentDraft.id)) {
			currentDraft.updatedAt = Date.now();
			newChatDrafts.value = [
				currentDraft,
				...newChatDrafts.value.filter((draft) => draft.id !== currentDraft.id),
			];
			return currentDraft;
		}

		const now = Date.now();
		const draft: NewChatDraft = {
			kind: "new-chat-draft",
			id: createNewChatDraftId(),
			name: name || "New Chat",
			createdAt: now,
			updatedAt: now,
			agentId: DEFAULT_AGENT_ID,
			messageCount: 0,
		};
		newChatDrafts.value = [draft, ...newChatDrafts.value];
		chatStore.clearSessionMessages(draft.id);
		chatStore.deleteSnapshot(draft.id);
		chatStore.clearComposerDraft(draft.id);
		currentSessionId.value = draft.id;
		isActive.value = true;
		return draft;
	}

	async function materializeNewChatDraft(
		sessionId = currentSessionId.value,
		name = "New Chat",
	) {
		const draft = newChatDrafts.value.find((item) => item.id === sessionId);
		if (!draft) return currentSession.value;
		const draftName = draft.name || name || "New Chat";
		newChatDrafts.value = newChatDrafts.value.filter(
			(item) => item.id !== sessionId,
		);
		const chatStore = useChatStore();
		chatStore.clearSessionMessages(sessionId);
		chatStore.deleteSnapshot(sessionId);
		const created = await createSession(draftName);
		chatStore.clearComposerDraft(sessionId);
		if (!created) {
			newChatDrafts.value = [draft, ...newChatDrafts.value];
			currentSessionId.value = draft.id;
			isActive.value = true;
			return created;
		}

		await applyDraftSettingsToSession(created.id, draft);
		return created;
	}

	async function applyDraftSettingsToSession(
		sessionId: string,
		draft: NewChatDraft,
	): Promise<void> {
		if (draft.agentId && draft.agentId !== DEFAULT_AGENT_ID) {
			await updateSessionAgent(sessionId, draft.agentId);
		}
		if (draft.permissionMode) {
			await updateSessionPermissionMode(sessionId, draft.permissionMode);
		}
		if (draft.lastProvider && draft.lastModel) {
			await updateSessionModel(sessionId, draft.lastProvider, draft.lastModel);
		}
		if (draft.workingDirectory !== undefined) {
			await updateSessionWorkingDirectory(
				sessionId,
				draft.workingDirectory || null,
			);
		}
	}

	/**
	 * Legacy load function for backward compatibility
	 * Loads full sessions with messages (use sparingly)
	 */
	async function loadSessionsFull() {
		isLoading.value = true;
		try {
			const response = await platformApi.getSessions();
			if (response.success) {
				sessions.value = response.sessions || [];
			}
		} finally {
			isLoading.value = false;
		}
	}

	async function createSession(name: string) {
		try {
			const response = await platformApi.createSession(
				name || "New Chat",
			);
			if (response.success && response.session) {
				sessions.value.unshift(response.session);
				await switchSession(response.session.id);
				return response.session;
			}
		} catch (error) {
			console.error("Failed to create session:", error);
		}
	}

	/**
	 * Create a new session without switching to it
	 * Used for split view where we want to create a new chat in a split panel
	 */
	async function createSessionWithoutSwitch(name: string) {
		try {
			const response = await platformApi.createSession(name);
			if (response.success && response.session) {
				sessions.value.unshift(response.session);
				return response.session;
			}
		} catch (error) {
			console.error("Failed to create session:", error);
		}
	}

	/**
	 * Switch to a session using optimized two-step loading:
	 * 1. Activate session (get details, no messages) - fast
	 * 2. Load messages on-demand
	 */
	async function switchSession(sessionId: string) {
		if (currentSessionId.value === sessionId) return currentSession.value;
		if (isNewChatDraftId(sessionId)) {
			currentSessionId.value = sessionId;
			isActive.value = true;
			return newChatDrafts.value.find((draft) => draft.id === sessionId);
		}
		const generation = ++switchGeneration;
		const previousSessionId = currentSessionId.value;
		const switchStart = performance.now();
		let activateMs = 0;
		let pageMs = 0;
		let commitMs = 0;
		let visibleSwitchMs = 0;
		let reusedCachedMessages = false;
		try {
			const chatStore = useChatStore();
			const settingsStore = useSettingsStore();
			const existingMessages = chatStore.sessionMessages.get(sessionId);
			const targetSnapshot = chatStore.getSnapshot(sessionId);
			const anchorMessageId =
				targetSnapshot?.mode === "anchor"
					? targetSnapshot.anchorMessageId
					: undefined;
			const existingHasAnchor = Boolean(
				anchorMessageId &&
					existingMessages?.some((message) => message.id === anchorMessageId),
			);

			// Optimistic visible switch: make sidebar/header respond in the same
			// event turn as the click. Backend activation and message paging fill in
			// details afterward.
			const commitStart = performance.now();
			currentSessionId.value = sessionId;
			isActive.value = true;
			if (!existingMessages || existingMessages.length === 0) {
				chatStore.setSessionLoading(sessionId, true);
			}
			commitMs = performance.now() - commitStart;
			visibleSwitchMs = performance.now() - switchStart;

			// Step 1: Activate session (returns details without messages)
			const activateStart = performance.now();
			const activateResponse =
				await platformApi.activateSession(sessionId);
			activateMs = performance.now() - activateStart;
			if (generation !== switchGeneration) return;
			if (!activateResponse.success || !activateResponse.session) {
				console.error("Failed to activate session:", activateResponse.error);
				if (currentSessionId.value === sessionId) {
					currentSessionId.value = previousSessionId;
				}
				chatStore.setSessionLoading(sessionId, false);
				return;
			}

			const sessionDetails = activateResponse.session as SessionDetails;

			// Update local session data with latest from backend
			const localSession = sessions.value.find((s) => s.id === sessionId);
			if (localSession) {
				Object.assign(localSession, sessionDetails);
			}

			// Sync model selection if session has a saved model (from cached config)
			if (sessionDetails.lastProvider && sessionDetails.lastModel) {
				settingsStore.updateAIProvider(sessionDetails.lastProvider);
				settingsStore.updateModel(
					sessionDetails.lastModel,
					sessionDetails.lastProvider,
				);
			}

			// Step 2: Load the page needed by the UI state. Sessions without a saved
			// detached anchor open at the tail, while revisits load around the saved
			// anchor so the renderer can restore the exact viewport.
			if (!existingMessages || existingMessages.length === 0) {
				const pageStart = performance.now();
				if (anchorMessageId) {
					await chatStore.loadMessagesAround(sessionId, anchorMessageId);
				} else {
					await chatStore.loadInitialMessagePage(
						sessionId,
						SWITCH_INITIAL_MESSAGE_LIMIT,
					);
				}
				if (generation !== switchGeneration) return;
				pageMs = performance.now() - pageStart;
				if (!anchorMessageId) {
					scheduleTailPageBackfill(sessionId);
				}
			} else {
				reusedCachedMessages = true;
				if (anchorMessageId && !existingHasAnchor) {
					const pageStart = performance.now();
					await chatStore.loadMessagesAround(sessionId, anchorMessageId);
					if (generation !== switchGeneration) return;
					pageMs = performance.now() - pageStart;
				} else if (
					!anchorMessageId &&
					existingMessages.length < SWITCH_TARGET_MESSAGE_LIMIT
				) {
					scheduleTailPageBackfill(sessionId);
				}
			}

			// Keep switch hot path free of full legacy session reads. Variables and
			// global user markers still live inside the JSON session file today, so
			// they are fetched lazily by the inspector / nav flows instead of during
			// every switch.

			console.info("[Perf][SessionSwitch]", {
				sessionId,
				totalMs: Math.round(performance.now() - switchStart),
				activateMs: Math.round(activateMs),
				pageMs: Math.round(pageMs),
				commitMs: Math.round(commitMs),
				visibleSwitchMs: Math.round(visibleSwitchMs),
				reusedCachedMessages,
				renderedMessages: chatStore.sessionMessages.get(sessionId)?.length ?? 0,
			});

			return sessionDetails;
		} catch (error) {
			console.error("Failed to switch session:", error);
			if (currentSessionId.value === sessionId) {
				currentSessionId.value = previousSessionId;
			}
			isActive.value = false;
			useChatStore().setSessionLoading(sessionId, false);
			console.info("[Perf][SessionSwitch]", {
				sessionId,
				totalMs: Math.round(performance.now() - switchStart),
				activateMs: Math.round(activateMs),
				pageMs: Math.round(pageMs),
				commitMs: Math.round(commitMs),
				visibleSwitchMs: Math.round(visibleSwitchMs),
				failed: true,
			});
		}
	}

	function scheduleTailPageBackfill(sessionId: string) {
		requestAnimationFrame(() => {
			window.setTimeout(async () => {
				if (currentSessionId.value !== sessionId) return;
				const chatStore = useChatStore();
				const loaded = chatStore.sessionMessages.get(sessionId)?.length ?? 0;
				const remaining = SWITCH_TARGET_MESSAGE_LIMIT - loaded;
				if (remaining <= 0) return;
				await chatStore.loadOlderMessages(sessionId, remaining);
			}, 0);
		});
	}

	/**
	 * Legacy switch function that uses the old API (full session with messages)
	 * Use this for backward compatibility when needed
	 */
	async function switchSessionLegacy(sessionId: string) {
		try {
			const response = await platformApi.switchSession(sessionId);
			if (response.success && response.session) {
				const chatStore = useChatStore();
				const settingsStore = useSettingsStore();

				currentSessionId.value = sessionId;
				isActive.value = true;

				const localSession = sessions.value.find((s) => s.id === sessionId);
				if (localSession) {
					Object.assign(localSession, response.session);
				}

				if (response.session.lastProvider && response.session.lastModel) {
					settingsStore.updateAIProvider(response.session.lastProvider);
					settingsStore.updateModel(
						response.session.lastModel,
						response.session.lastProvider,
					);
				}

				chatStore.setMessagesFromSession(
					sessionId,
					response.session.messages || [],
				);

				return response.session;
			}
		} catch (error) {
			console.error("Failed to switch session (legacy):", error);
		}
	}

	async function deleteSession(sessionId: string) {
		if (isNewChatDraftId(sessionId)) {
			discardNewChatDraft();
			return;
		}
		const session = sessions.value.find((s) => s.id === sessionId);

		// If session has no messages, permanently delete instead of archiving
		// Use messageCount (from metadata) instead of messages array
		const hasMessages =
			session && session.messageCount && session.messageCount > 0;
		if (!session || !hasMessages) {
			// Find the index of session to delete for switching logic
			const activeSessions = filteredSessions.value;
			const sessionIndex = activeSessions.findIndex((s) => s.id === sessionId);

			// Check if this is the only session - just delete it, keep window open
			if (activeSessions.length === 1 && activeSessions[0].id === sessionId) {
				await permanentlyDeleteSession(sessionId);
				currentSessionId.value = "";
				return;
			}

			await permanentlyDeleteSession(sessionId);
			// Switch to another session if needed
			if (currentSessionId.value === sessionId) {
				const remaining = filteredSessions.value;
				if (remaining.length > 0) {
					// Switch to previous session if available, otherwise next
					// After deletion, the next session is at the same index
					const targetIndex = sessionIndex > 0 ? sessionIndex - 1 : 0;
					await switchSession(remaining[targetIndex].id);
				} else {
					// No sessions remaining, just clear current session
					currentSessionId.value = "";
				}
			}
			return;
		}

		// Archive the session (soft delete) if it has messages
		await archiveSession(sessionId);
	}

	async function archiveSession(sessionId: string) {
		try {
			const session = sessions.value.find((s) => s.id === sessionId);
			if (!session) return;

			// Find the index of session to archive for switching logic (before archiving)
			const activeSessionsBefore = filteredSessions.value;
			const sessionIndex = activeSessionsBefore.findIndex(
				(s) => s.id === sessionId,
			);

			const archivedAt = Date.now();

			// Collect all child sessions (branches) recursively
			function collectChildSessionIds(parentId: string): string[] {
				const children = sessions.value.filter(
					(s) => s.parentSessionId === parentId,
				);
				let ids: string[] = [];
				for (const child of children) {
					ids.push(child.id);
					ids = ids.concat(collectChildSessionIds(child.id));
				}
				return ids;
			}

			const childIds = collectChildSessionIds(sessionId);
			const allIdsToArchive = [sessionId, ...childIds];

			// Mark all sessions as archived
			for (const id of allIdsToArchive) {
				const s = sessions.value.find((ses) => ses.id === id);
				if (s) {
					s.isArchived = true;
					s.archivedAt = archivedAt;
					await platformApi.updateSessionArchived(id, true, archivedAt);
				}
			}

			// Switch to another session if current was archived
			if (allIdsToArchive.includes(currentSessionId.value)) {
				const activeSessions = filteredSessions.value;
				if (activeSessions.length > 0) {
					// Switch to previous session if available, otherwise next
					// After archiving, the next session is at the same index
					const targetIndex = sessionIndex > 0 ? sessionIndex - 1 : 0;
					await switchSession(activeSessions[targetIndex].id);
				} else {
					// No sessions remaining, just clear current session
					currentSessionId.value = "";
				}
			}
		} catch (error) {
			console.error("Failed to archive session:", error);
		}
	}

	async function restoreSession(sessionId: string) {
		try {
			const session = sessions.value.find((s) => s.id === sessionId);
			if (!session) return;

			// Collect all child sessions (branches) recursively
			function collectChildSessionIds(parentId: string): string[] {
				const children = sessions.value.filter(
					(s) => s.parentSessionId === parentId,
				);
				let ids: string[] = [];
				for (const child of children) {
					ids.push(child.id);
					ids = ids.concat(collectChildSessionIds(child.id));
				}
				return ids;
			}

			const childIds = collectChildSessionIds(sessionId);
			const allIdsToRestore = [sessionId, ...childIds];

			// Unarchive all sessions
			for (const id of allIdsToRestore) {
				const s = sessions.value.find((ses) => ses.id === id);
				if (s) {
					s.isArchived = false;
					s.archivedAt = undefined;
					await platformApi.updateSessionArchived(id, false, null);
				}
			}
		} catch (error) {
			console.error("Failed to restore session:", error);
		}
	}

	async function permanentlyDeleteSession(sessionId: string) {
		try {
			// Collect all child sessions before delete (backend cascade deletes them)
			function collectChildSessionIds(parentId: string): string[] {
				const children = sessions.value.filter(
					(s) => s.parentSessionId === parentId,
				);
				let ids: string[] = [];
				for (const child of children) {
					ids.push(child.id);
					ids = ids.concat(collectChildSessionIds(child.id));
				}
				return ids;
			}

			const childIds = collectChildSessionIds(sessionId);
			const allIdsToDelete = [sessionId, ...childIds];

			const response = await platformApi.deleteSession(sessionId);
			if (response.success) {
				// Remove all deleted sessions from local state
				sessions.value = sessions.value.filter(
					(s) => !allIdsToDelete.includes(s.id),
				);
			}
		} catch (error) {
			console.error("Failed to permanently delete session:", error);
		}
	}

	async function renameSession(sessionId: string, newName: string) {
		try {
			const response = await platformApi.renameSession(
				sessionId,
				newName,
			);
			if (response.success) {
				cancelSessionNameAnimation(sessionId);
				setSessionName(sessionId, newName);
			}
		} catch (error) {
			console.error("Failed to rename session:", error);
		}
	}

	async function createBranch(
		parentSessionId: string,
		branchFromMessageId: string,
	) {
		try {
			const response = await platformApi.createBranch(
				parentSessionId,
				branchFromMessageId,
			);
			if (response.success && response.session) {
				// Add the new branch session to the list
				sessions.value.unshift(response.session);
				// Return the session - caller decides whether to switch or split
				return response.session;
			}
		} catch (error) {
			console.error("Failed to create branch:", error);
		}
		return null;
	}

	async function updateSessionPin(sessionId: string, isPinned: boolean) {
		try {
			const response = await platformApi.updateSessionPin(
				sessionId,
				isPinned,
			);
			if (response.success) {
				const session = sessions.value.find((s) => s.id === sessionId);
				if (session) {
					session.isPinned = isPinned;
				}
			}
		} catch (error) {
			console.error("Failed to update session pin:", error);
		}
	}

	async function updateSessionWorkingDirectory(
		sessionId: string,
		workingDirectory: string | null,
	): Promise<{ success: boolean; error?: string }> {
		const draft = newChatDrafts.value.find((item) => item.id === sessionId);
		if (draft) {
			if (workingDirectory === null || workingDirectory === "") {
				delete draft.workingDirectory;
			} else {
				draft.workingDirectory = workingDirectory;
			}
			draft.updatedAt = Date.now();
			newChatDrafts.value = [...newChatDrafts.value];
			return { success: true };
		}

		try {
			const response = await platformApi.updateSessionWorkingDirectory(
				sessionId,
				workingDirectory,
			);
			if (response.success) {
				const session = sessions.value.find((s) => s.id === sessionId);
				if (session) {
					if (workingDirectory === null || workingDirectory === "") {
						delete session.workingDirectory;
					} else {
						session.workingDirectory = workingDirectory;
					}
				}
				return { success: true };
			}
			return {
				success: false,
				error: response.error || "Failed to update working directory",
			};
		} catch (error) {
			console.error("Failed to update session working directory:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async function updateSessionAgent(
		sessionId: string,
		agentId: string,
	): Promise<{ success: boolean; error?: string }> {
		const draft = newChatDrafts.value.find((item) => item.id === sessionId);
		if (draft) {
			draft.agentId = agentId || DEFAULT_AGENT_ID;
			draft.updatedAt = Date.now();
			newChatDrafts.value = [...newChatDrafts.value];
			return { success: true };
		}

		try {
			const response = await platformApi.updateSessionAgent(
				sessionId,
				agentId,
			);
			if (response.success) {
				const session = sessions.value.find((s) => s.id === sessionId);
				if (session) {
					session.agentId = agentId;
					sessions.value = [...sessions.value];
				}
			}
			return response;
		} catch (error) {
			const errorObject = error && typeof error === "object" ? error : undefined;
			console.error("Failed to update session agent:", error);
			return {
				success: false,
				error: caughtErrorMessage(errorObject, "Failed to update session agent"),
			};
		}
	}

	async function updateSessionPermissionMode(
		sessionId: string,
		permissionMode: PermissionMode,
	): Promise<{ success: boolean; error?: string }> {
		const draft = newChatDrafts.value.find((item) => item.id === sessionId);
		if (draft) {
			draft.permissionMode = permissionMode;
			draft.updatedAt = Date.now();
			newChatDrafts.value = [...newChatDrafts.value];
			return { success: true };
		}

		try {
			const response = await platformApi.updateSessionPermissionMode(
				sessionId,
				permissionMode,
			);
			if (response.success) {
				const session = sessions.value.find((s) => s.id === sessionId);
				if (session) {
					session.permissionMode = permissionMode;
					sessions.value = [...sessions.value];
				}
			}
			return response;
		} catch (error) {
			const errorObject = error && typeof error === "object" ? error : undefined;
			console.error("Failed to update session permission mode:", error);
			return {
				success: false,
				error: caughtErrorMessage(errorObject, "Failed to update session permission mode"),
			};
		}
	}

	async function updateSessionModel(
		sessionId: string,
		provider: string,
		model: string,
	): Promise<{ success: boolean; error?: string }> {
		const draft = newChatDrafts.value.find((item) => item.id === sessionId);
		if (draft) {
			draft.lastProvider = provider;
			draft.lastModel = model;
			draft.updatedAt = Date.now();
			newChatDrafts.value = [...newChatDrafts.value];
			return { success: true };
		}

		try {
			const response = await platformApi.updateSessionModel(
				sessionId,
				provider,
				model,
			);
			if (response.success) {
				const session = sessions.value.find((s) => s.id === sessionId);
				if (session) {
					session.lastProvider = provider;
					session.lastModel = model;
					sessions.value = [...sessions.value];
				}
			}
			return response;
		} catch (error) {
			const errorObject = error && typeof error === "object" ? error : undefined;
			console.error("Failed to update session model:", error);
			return {
				success: false,
				error: caughtErrorMessage(errorObject, "Failed to update session model"),
			};
		}
	}

	/**
	 * Update token-usage fields on a session in place. Called by ipc-hub
	 * for `context:size-updated` (per-turn input tokens) and on
	 * `stream:complete` (accumulated session totals). Inspector's Context
	 * tab reactively re-renders from these fields.
	 */
	function updateSessionTokenStats(
		sessionId: string,
		stats: {
			contextSize?: number;
			lastInputTokens?: number;
			totalInputTokens?: number;
			totalOutputTokens?: number;
			totalTokens?: number;
		},
	): void {
		const session = sessions.value.find((s) => s.id === sessionId);
		if (!session) return;
		if (stats.contextSize !== undefined)
			session.contextSize = stats.contextSize;
		if (stats.lastInputTokens !== undefined)
			session.lastInputTokens = stats.lastInputTokens;
		if (stats.totalInputTokens !== undefined)
			session.totalInputTokens = stats.totalInputTokens;
		if (stats.totalOutputTokens !== undefined)
			session.totalOutputTokens = stats.totalOutputTokens;
		if (stats.totalTokens !== undefined)
			session.totalTokens = stats.totalTokens;
	}

	/**
	 * Apply an incoming `session:variables-updated` event:
	 * - Mirror workingDirectory onto the SessionMeta entry (so other UI
	 *   that reads it stays consistent).
	 * - Replace the full variable snapshot for this session.
	 *
	 * The payload now carries the full snapshot (system + custom) — the
	 * inspector reads from `sessionVariables` directly and no longer
	 * recomputes system entries client-side.
	 */
	function updateSessionVariables(
		sessionId: string,
		payload: {
			workingDirectory?: string;
			workingDirectoryRoots?: string[];
			variables?: ContextVariable[];
		},
	): void {
		const session = sessions.value.find((s) => s.id === sessionId);
		if (session && payload.workingDirectory !== undefined) {
			session.workingDirectory = payload.workingDirectory;
		}
		if (session && payload.workingDirectoryRoots !== undefined) {
			session.workingDirectoryRoots = payload.workingDirectoryRoots;
		}
		if (payload.variables !== undefined) {
			sessionVariables.value.set(sessionId, payload.variables);
			// Trigger reactivity for Map mutation.
			sessionVariables.value = new Map(sessionVariables.value);
		}
	}

	/**
	 * Pull the latest variable snapshot from the main process. Called on
	 * session switch (initial fetch) and on any UI action that needs
	 * fresh state without waiting for the next change event.
	 */
	async function fetchVariables(sessionId: string): Promise<ContextVariable[]> {
		try {
			const response = await platformApi.listVariables(sessionId);
			const variables =
				response.success && response.variables ? response.variables : [];
			sessionVariables.value.set(sessionId, variables);
			sessionVariables.value = new Map(sessionVariables.value);
			return variables;
		} catch (error) {
			console.error("[Sessions] Failed to fetch variables:", error);
			return [];
		}
	}

	/**
	 * Write a variable through the registry. The main process will emit
	 * `session:variables-updated`, so the local snapshot picks up via
	 * `updateSessionVariables` — no need to mutate state here.
	 */
	async function setVariable(
		sessionId: string,
		name: string,
		value: string,
		description?: string,
		scope?: "global" | "session",
	): Promise<{ success: boolean; error?: string; code?: string }> {
		const response = await platformApi.setVariable(
			sessionId,
			name,
			value,
			description,
			scope,
		);
		return {
			success: response.success,
			error: response.error,
			code: response.code,
		};
	}

	async function deleteVariable(
		sessionId: string,
		name: string,
	): Promise<{ success: boolean; error?: string; code?: string }> {
		const response = await platformApi.deleteVariable(sessionId, name);
		return {
			success: response.success,
			error: response.error,
			code: response.code,
		};
	}

	return {
		sessions,
		newChatDrafts,
		currentSessionId,
		isLoading,
		isActive,
		sessionVariables,
		currentSession,
		sessionCount,
		filteredSessions,
		sidebarSessions,
		getSessionItem,
		filteredSessionCount,
		archivedSessions,
		loadSessions,
		loadSessionsFull,
		openNewChatDraft,
		materializeNewChatDraft,
		discardNewChatDraft,
		isNewChatDraftId,
		createSession,
		createSessionWithoutSwitch,
		switchSession,
		switchSessionLegacy,
		deleteSession,
		archiveSession,
		updateSessionTokenStats,
		updateSessionVariables,
		fetchVariables,
		setVariable,
		deleteVariable,
		setSessionName,
		updateSessionNameAnimated,
		restoreSession,
		permanentlyDeleteSession,
		renameSession,
		createBranch,
		updateSessionPin,
		updateSessionAgent,
		updateSessionPermissionMode,
		updateSessionModel,
		updateSessionWorkingDirectory,
	};
});
