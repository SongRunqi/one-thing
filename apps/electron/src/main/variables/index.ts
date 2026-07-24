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

import { createHash } from "node:crypto";
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
import type { VariableProvider } from "@onething/runtime/variables";
import { createChannelSessionGuard } from "./channel-guard.js";
import {
	notesGateway,
	globalStoreGateway,
	sessionStoreGateway,
	workdirGateway,
	goalVariableGateway,
	musicRadioGateway,
} from "./gateways.js";
import {
	splitVariablesForPrompt,
	type VariablePromptSections,
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
		// Broadcasts (e.g. notes from a global state change) come with an
		// empty sessionId; we have no target to emit to in that case.
		if (!ctx.sessionId) return;
		const workdirVariable = snapshot.find((v) => v.name === "workdir");
		const workdir = workdirVariable?.value || undefined;
		const workdirRoots = workdirVariable?.values?.slice(workdir ? 1 : 0);
		try {
			getEventBus()
				.emit(ctx.sessionId, {
					type: "session:variables-updated",
					workingDirectory: workdir,
					workingDirectoryRoots: workdirRoots,
					variables: snapshot,
				})
				.catch((err) =>
					console.error("[variables] EventBus emit failed:", err),
				);
		} catch {
			// EventBus not initialized (test or pre-bootstrap path) — ignore.
		}
	});

	console.log("[variables] subsystem bootstrapped (4 providers)");
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
			return registry.set(ctx, input);
		},
		append: (ctx, input) => {
			channelGuard.assertExternalWriteAllowed(
				ctx.sessionId,
				input.name,
				input.scope,
			);
			return registry.append(ctx, input);
		},
		remove: (ctx, input) => {
			channelGuard.assertExternalWriteAllowed(
				ctx.sessionId,
				input.name,
				input.scope,
			);
			return registry.remove(ctx, input);
		},
		delete: (ctx, name, scope) => {
			channelGuard.assertExternalWriteAllowed(ctx.sessionId, name, scope);
			return registry.delete(ctx, name, scope);
		},
	};
}

type VariableRegistryLike = ReturnType<typeof getVariableRegistry>;

/**
 * Build both prompt channels for context variables:
 * systemText (static volatility → system-prompt section) and
 * turnText (turn volatility → per-turn <context-update> injection).
 * Workdir is skipped inside the formatter itself (the prompt builder
 * renders it in its own "# Work Directory" section).
 */
export async function buildVariablePromptSections(
	sessionId: string,
): Promise<VariablePromptSections> {
	const sections = splitVariablesForPrompt(
		await listContextVariables(sessionId),
	);
	trackStaticSectionChange(sessionId, sections.systemText);
	return sections;
}

// Telemetry: the static section sits in the system prompt, ahead of the whole
// conversation history, so any change invalidates the provider prompt-cache
// prefix for that session. This should stay rare — log every occurrence so
// unexpected churn (a provider leaking volatile values as static) is visible.
const lastStaticSectionHash = new Map<string, string>();

function trackStaticSectionChange(sessionId: string, systemText: string): void {
	const hash = createHash("sha1").update(systemText).digest("hex").slice(0, 8);
	const previous = lastStaticSectionHash.get(sessionId);
	if (previous !== undefined && previous !== hash) {
		console.log(
			`[variables] static context section changed (busts prompt-cache prefix) session=${sessionId.slice(0, 8)} ${previous}→${hash}`,
		);
	}
	lastStaticSectionHash.set(sessionId, hash);
}

/**
 * Static channel only — the string injected as the system prompt's
 * "# Context Variables" section.
 */
export async function buildContextVariablesPromptText(
	sessionId: string,
): Promise<string> {
	return (await buildVariablePromptSections(sessionId)).systemText;
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
	formatVariablesForPrompt,
	splitVariablesForPrompt,
	type VariablePromptSections,
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
