/**
 * Public entry for the variable subsystem (scalar variables only).
 *
 * Bootstrap:
 *  1. Initialize the variables store (loads variables.json).
 *  2. Register the three built-in providers.
 *  3. Bridge registry change events onto the EventBus as
 *     `session:variables-updated` for the renderer.
 *  4. Make sure ai_note_dir's directory exists on disk.
 *
 * Project directories live in their own module — see
 * `src/main/project-dirs/`. Bootstrap order in `src/main/index.ts`
 * runs both modules' bootstraps separately; they have no boot-time
 * coupling.
 *
 * Idempotent — `bootstrapVariableSystem` can be called multiple times
 * but only takes effect once. Tests bypass this and use registry
 * directly with isolated providers.
 */

import * as fs from "fs/promises";
import path from "node:path";
import { getEventBus } from "../events/index.js";
import { getProjectsStore } from "../project-dirs/index.js";
import * as appStore from "../store.js";
import { expandPath } from "../tools/core/sandbox.js";
import { enforcePermissionPolicy } from "../tools/core/permission-policy.js";
import { getVariableRegistry } from "@onething/runtime/variables/registry";
import { registerStandardVariableProviders } from "@onething/runtime/variables/bootstrap";
import { getVariablesStore } from "./store/index.js";
import type { SetInput, VariableProvider } from "@onething/runtime/variables";
import { createChannelSessionGuard } from "./channel-guard.js";
import {
	notesGateway,
	globalStoreGateway,
	sessionStoreGateway,
	workdirGateway,
	goalVariableGateway,
	musicRadioGateway,
	agentStoreGateway,
	agentSelfGateway,
	projectStoreGateway,
} from "./gateways.js";
import {
	formatStateVariablesForPrompt,
	type FormatOptions,
} from "@onething/runtime/variables/format";
import type { ContextVariable } from "@onething/runtime/variables";

let bootstrapped = false;
let unsubscribeBridge: (() => void) | null = null;

export function bootstrapVariableSystem(): void {
	if (bootstrapped) return;
	bootstrapped = true;

	// Persistence layer comes online first — providers read from it.
	getVariablesStore().initialize();

	const registry = getVariableRegistry();
	registerStandardVariableProviders(registry, {
		workdir: workdirGateway,
		notes: notesGateway,
		globalStore: globalStoreGateway,
		sessionStore: sessionStoreGateway,
		goal: goalVariableGateway,
		musicRadio: musicRadioGateway,
		agentSelf: agentSelfGateway,
		agentStore: agentStoreGateway,
		projectStore: projectStoreGateway,
		core: {
			enforcePermission: enforcePermissionPolicy,
			// Registered project directories are user-blessed: switching the
			// workdir into one (or a subdirectory) never prompts.
			isPreauthorizedDirectory: (dir) => {
				try {
					const target = path.resolve(dir);
					return getProjectsStore()
						.list()
						.some((project) => {
							const root = path.resolve(project.path);
							return target === root || target.startsWith(root + path.sep);
						});
				} catch {
					return false;
				}
			},
		},
	});

	// Migrate old ~/.onething/notes to ~/.onething/memory if needed, then make
	// sure the configured ai_note_dir exists on disk. ensure must run after the
	// migration or it would recreate the old directory mid-rename.
	// Fire-and-forget: failure is non-fatal, the AI will get an error
	// on first write and can fall back to set a different path.
	migrateAiNoteDir()
		.catch((err) => console.error("[variables] migrateAiNoteDir failed:", err))
		.then(() => ensureAiNoteDir())
		.catch((err) => console.error("[variables] ensureAiNoteDir failed:", err));

	// Bridge registry change events to the EventBus so the renderer
	// refreshes via the existing session:variables-updated channel.
	unsubscribeBridge = registry.subscribe((ctx, snapshot) => {
		if (ctx.sessionId) {
			emitVariablesSnapshot(ctx.sessionId, snapshot);
			return;
		}
		// Broadcast (empty sessionId): a shared-scope write (global/agent/
		// project) or an external variables.json change. The affected variables
		// are visible from other sessions whose panels would otherwise go
		// stale, so re-snapshot every recently-active (LRU-cached) session.
		// Coalesced per tick — a write emits its own session snapshot AND a
		// broadcast back-to-back.
		scheduleBroadcastRefresh(registry);
	});

	console.log("[variables] subsystem bootstrapped");
}

function emitVariablesSnapshot(
	sessionId: string,
	snapshot: ContextVariable[],
): void {
	const workdirVariable = snapshot.find((v) => v.name === "workdir");
	const workdir = workdirVariable?.value || undefined;
	const workdirRoots = workdirVariable?.values?.slice(workdir ? 1 : 0);
	try {
		getEventBus()
			.emit(sessionId, {
				type: "session:variables-updated",
				workingDirectory: workdir,
				workingDirectoryRoots: workdirRoots,
				variables: snapshot,
			})
			.catch((err) => console.error("[variables] EventBus emit failed:", err));
	} catch {
		// EventBus not initialized (test or pre-bootstrap path) — ignore.
	}
}

let broadcastRefreshScheduled = false;

function scheduleBroadcastRefresh(
	registry: ReturnType<typeof getVariableRegistry>,
): void {
	if (broadcastRefreshScheduled) return;
	broadcastRefreshScheduled = true;
	queueMicrotask(() => {
		broadcastRefreshScheduled = false;
		let sessionIds: string[];
		try {
			sessionIds = appStore.getSessionCacheStats().cachedSessionIds;
		} catch {
			return;
		}
		for (const sessionId of sessionIds) {
			registry
				.list({ sessionId })
				.then((snapshot) => emitVariablesSnapshot(sessionId, snapshot))
				.catch((err) =>
					console.error(
						"[variables] broadcast refresh failed for session",
						sessionId,
						err,
					),
				);
		}
	});
}

/**
 * Tear down the subsystem. Used in tests; the runtime app does not
 * normally need this since the process exits on shutdown.
 */
export function shutdownVariableSystem(): void {
	if (unsubscribeBridge) {
		unsubscribeBridge();
		unsubscribeBridge = null;
	}
	getVariableRegistry().reset();
	bootstrapped = false;
}

/**
 * Migrate legacy ~/.onething/notes to ~/.onething/memory.
 * If the old directory exists and the new one doesn't, rename old → new.
 * Also renames the memory/ subdirectory to daily/ within.
 */
async function migrateAiNoteDir(): Promise<void> {
	const OLD_DEFAULT = "~/.onething/notes";
	const NEW_DEFAULT = "~/.onething/memory";
	const raw = getVariablesStore().getAiNoteDir();
	// Migrate when the store still points at the old default, or when it was
	// never customized (unset, or already normalized to the new default by the
	// schema fallback) while the old default directory still holds the data.
	if (raw && raw !== OLD_DEFAULT && raw !== NEW_DEFAULT) return;

	const oldPath = expandPath(OLD_DEFAULT);
	const newPath = expandPath(NEW_DEFAULT);

	try {
		const oldStat = await fs.stat(oldPath).catch(() => null);
		if (!oldStat?.isDirectory()) return;
		const newStat = await fs.stat(newPath).catch(() => null);
		if (newStat) return; // new path already exists, skip

		await fs.rename(oldPath, newPath);
		console.log("[variables] migrated ai_note_dir:", oldPath, "→", newPath);

		// Rename memory/ → daily/ inside the migrated root.
		const oldMemoryDir = path.join(newPath, "memory");
		const newDailyDir = path.join(newPath, "daily");
		const oldMemoryStat = await fs.stat(oldMemoryDir).catch(() => null);
		if (oldMemoryStat?.isDirectory()) {
			const newDailyStat = await fs.stat(newDailyDir).catch(() => null);
			if (!newDailyStat) {
				await fs.rename(oldMemoryDir, newDailyDir);
				console.log(
					"[variables] migrated daily dir:",
					oldMemoryDir,
					"→",
					newDailyDir,
				);
			}
		}

		// Update the variable so future reads use the new path.
		getVariablesStore().setAiNoteDir(NEW_DEFAULT);
	} catch (err) {
		console.warn("[variables] could not migrate ai_note_dir:", err);
	}
}

/**
 * Create the configured ai_note_dir directory if it doesn't exist yet.
 */
async function ensureAiNoteDir(): Promise<void> {
	const raw = getVariablesStore().getAiNoteDir();
	if (!raw) return;
	const resolved = expandPath(raw);
	try {
		await fs.mkdir(resolved, { recursive: true });
	} catch (err) {
		console.warn("[variables] could not create ai_note_dir:", resolved, err);
	}
}

// ── Helpers used by call sites ──────────────────────

export async function listContextVariables(
	sessionId: string,
): Promise<ContextVariable[]> {
	return channelGuard.filterVariablesForSession(
		sessionId,
		await getVariableRegistry().list({ sessionId }),
	);
}

// Channel-session trust guard — see ./channel-guard.ts for the rules.
const channelGuard = createChannelSessionGuard((sessionId) =>
	appStore.getSession(sessionId),
);

/**
 * Registry facade for the `variable` tool: enforces the channel-session
 * trust guard on top of the raw registry. The raw registry stays available
 * for host-internal callers (IPC inspector, prompt build funnels through
 * listContextVariables above).
 */
export function getGuardedVariableRegistryForTools(): Pick<
	VariableRegistryLike,
	"list" | "set" | "append" | "remove" | "delete"
> {
	const registry = getVariableRegistry();
	// Unscoped writes follow the variable to the store that already holds it
	// (see VariableRegistry.resolveStoreClaimant). For an external session
	// that redirect could land on a shared scope the guard just blocked, so
	// external unscoped writes are pinned to session scope.
	const pinScope = (sessionId: string, input: SetInput): SetInput =>
		!input.scope && channelGuard.isExternalIdentitySession(sessionId)
			? { ...input, scope: "session" }
			: input;
	return {
		list: async (ctx) =>
			channelGuard.filterVariablesForSession(
				ctx.sessionId,
				await registry.list(ctx),
			),
		set: (ctx, input) => {
			channelGuard.assertExternalWriteAllowed(
				ctx.sessionId,
				input.name,
				input.scope,
			);
			return registry.set(ctx, pinScope(ctx.sessionId, input));
		},
		append: (ctx, input) => {
			channelGuard.assertExternalWriteAllowed(
				ctx.sessionId,
				input.name,
				input.scope,
			);
			return registry.append(ctx, pinScope(ctx.sessionId, input));
		},
		remove: (ctx, input) => {
			channelGuard.assertExternalWriteAllowed(
				ctx.sessionId,
				input.name,
				input.scope,
			);
			return registry.remove(ctx, pinScope(ctx.sessionId, input));
		},
		delete: (ctx, name, scope) => {
			channelGuard.assertExternalWriteAllowed(ctx.sessionId, name, scope);
			return registry.delete(
				ctx,
				name,
				!scope && channelGuard.isExternalIdentitySession(ctx.sessionId)
					? "session"
					: scope,
			);
		},
	};
}

type VariableRegistryLike = ReturnType<typeof getVariableRegistry>;

/**
 * state 变量渲染成 `<context-update>` 尾部块的正文;非 state 变量不进请求。
 * 这是变量进入模型的唯一数据通道(§R.4)—— system prompt 那一段只剩一句常量
 * 指路,所以写变量永远不再打穿缓存前缀,也就没有"静态段变了"这种遥测对象了。
 *
 * Workdir is skipped inside the formatter itself (the prompt builder renders
 * it in its own "# Work Directory" section).
 *
 * `options` 只为调用方需要调整渲染细节时留一个口子,生产路径一律用默认值。
 */
export async function buildStateVariablesPromptText(
	sessionId: string,
	options: FormatOptions = {},
): Promise<string> {
	return formatStateVariablesForPrompt(
		await listContextVariables(sessionId),
		options,
	);
}

/**
 * Plugin entry point. External code calls this to add a custom
 * provider to the live registry. Must be called after
 * `bootstrapVariableSystem()`. Throws PROVIDER_CONFLICT on
 * duplicate IDs.
 */
export function registerVariableProvider(provider: VariableProvider): void {
	getVariableRegistry().register(provider);
}

// Re-exports for ergonomic imports at call sites.
export { getVariableRegistry } from "@onething/runtime/variables/registry";
export {
	formatStateVariablesForPrompt,
	type FormatOptions,
} from "@onething/runtime/variables/format";
export { VariableError } from "@onething/runtime/variables";
export type {
	ContextVariable,
	SetInput,
	VariableContext,
	VariableProvider,
} from "@onething/runtime/variables";
export {
	notifyNotesDirChanged,
	notifySessionVariablesChanged,
	notifyWorkdirChanged,
} from "./gateways.js";
export { getVariablesStore } from "./store/index.js";
