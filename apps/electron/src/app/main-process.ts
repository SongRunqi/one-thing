import {
	activateMainWindow,
	createWindow,
	isTodoPlanBrowserWindow,
	recoverMainWindowAfterSystemResume,
	shouldSuppressMainWindowActivation,
	warmTodoPlanWindow,
} from "@onething/electron-host/window";
import {
	initializeIPC,
	initializeMCP,
	shutdownMCP,
	initializeSkills,
	initializeACP,
	shutdownACP,
} from "@main/ipc/handlers.js";
import { initializeStores, flushAllPendingSaves } from "@main/store.js";
import { getSettings, initializeSettings } from "@main/stores/settings.js";
import { initializeToolRegistry } from "@main/tools/index.js";
import { startTodoPlanWatcher } from "@main/todo-plan/store.js";
import { configureSandboxHost } from "@main/tools/core/sandbox.js";
import {
	getConversationRuntime,
	getStreamEngine,
	getStreamEngineSafe,
	initializeStreamEngine,
	shutdownStreamEngine,
} from "@main/engine/index.js";
import { registerBuiltinTriggers } from "@main/engine/triggers/index.js";
import { bootstrapGoalStreamBreakers } from "@main/goals/runtime-hooks.js";
import {
	configureStorePathHost,
	getMediaImagesDir,
} from "@main/stores/paths.js";
import {
	initializeEventSystem,
	shutdownEventSystem,
	getEventBus,
} from "@main/events/index.js";
import {
	initializeIPCBridge,
	shutdownIPCBridge,
} from "@main/bridges/ipc-bridge-lifecycle.js";
import {
	initializeSessionLayer,
	shutdownSessionLayer,
} from "@main/session/index.js";
import { Permission } from "@main/permission/index.js";
import { disposeMusicService } from "@main/music/service.js";
import { disposeRadioConductor } from "@main/music/radio.js";
import { bootstrapVariableSystem } from "@main/variables/index.js";
import { bootstrapProjectDirs } from "@main/project-dirs/index.js";
import { warmSearchWindow } from "@onething/electron-host/search/window";
import { applyNetworkProxySettings } from "@main/ipc/network-proxy.js";
import {
	configureGlobalWindowShortcuts,
	registerGlobalWindowShortcuts,
	unregisterGlobalWindowShortcuts,
} from "@onething/electron-host/shortcuts/global-shortcuts";
import { getVoiceService, getVoiceServiceSafe } from "@main/voice/service.js";
import {
	attachVoiceTrayMainWindow,
	configureVoiceTray,
	markVoiceQuitRequested,
	updateVoiceTray,
} from "@onething/electron-host/voice/tray";
import {
	destroyVoiceRuntimeWindow,
	ensureVoiceRuntimeWindow,
	flushVoiceRuntimeCommands,
	isVoiceRuntimeReady,
	markVoiceRuntimeReady,
	sendVoiceRuntimeCommand,
} from "@onething/electron-host/voice/runtime-window";
import { killTrackedDetachedChildren } from "@main/tools/core/bash-executor.js";
import {
	configureAppLoggingHost,
	initializeAppLogging,
	shutdownAppLogging,
} from "@main/logging/index.js";
import {
	createElectronRendererConsoleCapture,
	setElectronAppLogsPath,
} from "@onething/electron-host/logging/console-capture";
import { configureSkillsEnvironmentHost } from "@main/skills/loader.js";
import {
	getElectronAppIsPackaged,
	getElectronResourcesPath,
} from "@onething/electron-host/skills/environment";
import { configureAuthHost } from "@main/auth/host-ports.js";
import { configureVoiceHost } from "@main/voice/host-ports.js";
import { broadcastElectronVoiceMessage } from "@onething/electron-host/voice/events";
import { createElectronAuthFetch } from "@onething/electron-host/auth/auth-fetch";
import { getElectronSafeStorage } from "@onething/electron-host/auth/electron-auth";
import { createRequiredAppFetch } from "@main/providers/bound-fetch.js";
import { hydrateProcessEnvFromLoginShell } from "@onething/electron-host/app/login-shell-env";
import {
	StoreLock,
	LockConflictError,
	formatDesktopLockConflict,
} from "@onething/runtime/storage";
import {
	formatStartupSummary,
	markStartup,
	markStartupProcessStart,
} from "@onething/runtime/perf";
import {
	configureGatewayLifecycle,
	initializeGateway,
	shutdownGateway,
} from "@onething/electron-host/gateway/lifecycle";
import { createGatewayPluginCommandProvider } from "@main/ipc/plugins.js";
import {
	registerElectronAppBootstrap,
	type ElectronActivateOptions,
} from "@onething/electron-host/app/bootstrap";

/**
 * Refresh model metadata from models.dev on first startup.
 * Only runs if no model data exists yet for any configured provider.
 */
async function refreshModelsOnFirstStartup(): Promise<void> {
	const { getSettings } = await import("@main/stores/settings.js");
	const settings = getSettings();
	const providers = settings?.ai?.providers;
	if (!providers) return;

	// Check if any provider already has models
	let hasModels = false;
	for (const pid of Object.keys(providers)) {
		const cfg = providers[pid] as any;
		if (cfg?.models && Object.keys(cfg.models).length > 0) {
			hasModels = true;
			break;
		}
	}

	if (hasModels) {
		console.log(
			"[Models] Model data already exists, skipping first-startup refresh",
		);
		return;
	}

	console.log("[Models] First startup detected, refreshing model registry...");
	const { refreshAllProviders } = await import(
		"@main/providers/model-registry.js"
	);
	await refreshAllProviders();
	console.log("[Models] First-startup refresh complete");
}

type MainBrowserWindow = ReturnType<typeof createWindow>;

let mainWindow: MainBrowserWindow | null = null;
let desktopStoreLock: StoreLock | null = null;
let electronMainStarted = false;

async function initializeElectronReadyServices(): Promise<void> {
	markStartup("ready-begin");

	// Initialize stores and migrate data if needed
	initializeStores();

	// Initialize settings asynchronously (before any settings access)
	await initializeSettings();
	markStartup("settings-ready");
	configureGlobalWindowShortcuts({
		getShortcuts: () => getSettings().general?.shortcuts,
	});
	await applyNetworkProxySettings();

	// Initialize event system (EventBus + StreamChannel + SessionManager + StreamEngine)
	initializeEventSystem();
	initializeSessionLayer();
	initializeStreamEngine();
	registerBuiltinTriggers();

	// Initialize promptVersion from minimal scene output (evals S1/G1).
	// This ensures the production path uses the actual prompt output,
	// not just the 4-constant static fallback.
	try {
		const { initPromptVersion, buildOnethingSystemPrompt } = await import(
			"@onething/runtime"
		);
		const { system, developer } = await buildOnethingSystemPrompt({
			hasTools: false,
			skills: [],
		});
		const minimalOutput = [system, ...developer].filter(Boolean).join("\n\n");
		initPromptVersion(minimalOutput);
		console.log(
			"[Startup] Prompt version initialized:",
			minimalOutput.slice(0, 40),
		);
	} catch (err) {
		console.warn("[Startup] Failed to initialize promptVersion:", err);
	}

	// Initialize Permission system with EventBus and channel resolver
	Permission.initialize(
		getEventBus(),
		(sessionId) => getStreamEngine().getChannel(sessionId),
		(sessionId) => getStreamEngine().getPermissionMode(sessionId),
	);

	// Bootstrap variable subsystem (registers built-in providers, bridges
	// change events to EventBus). Must run after EventBus init and before
	// tool registry so the variable tool finds a populated registry.
	bootstrapVariableSystem();

	// Goal stream breakers: error → retry/blocked, abort → paused, complete →
	// usage flush. Without this subscription goals never leave 'active' and
	// their accounting never persists (the headless backend wires it too).
	bootstrapGoalStreamBreakers();

	// Bootstrap project-dirs subsystem (independent storage). Order doesn't
	// matter relative to variables; the store feeds the Known Projects prompt
	// section and the workdir gateway's auto-touch.
	bootstrapProjectDirs();

	// Initialize tool registry
	await initializeToolRegistry();

	// Initialize IPC handlers
	initializeIPC();

	// Watch the todo store: the AI edits its todo with the plain write/edit
	// tools, so nothing else would tell the UI those edits landed.
	await startTodoPlanWatcher();

	markStartup("services-ready");
}

async function acquireDesktopStoreLock(): Promise<void> {
	desktopStoreLock = new StoreLock();
	await desktopStoreLock.acquire("desktop");
}

function formatElectronDesktopStoreLockError(error: unknown): string {
	if (error instanceof LockConflictError) {
		return formatDesktopLockConflict(error.holder);
	}
	return error instanceof Error ? error.message : String(error);
}

function startPostWindowServices(): void {
	const pluginsReady = (async () => {
		const { bootstrapPluginSystem } = await import("@main/plugins/index.js");
		await bootstrapPluginSystem(getEventBus(), getStreamEngine());
	})().catch((err) => {
		console.error("[Plugins] Bootstrap failed (non-blocking):", err);
	});

	import("@main/scheduler/user-tasks.js")
		.then(({ initializeUserSchedulerTasks }) => initializeUserSchedulerTasks())
		.catch((err) => {
			console.error(
				"[Scheduler] User task initialization failed (non-blocking):",
				err,
			);
		});

	// Initialize MCP system asynchronously (don't block startup)
	initializeMCP().catch((err) => {
		console.error("[MCP] Initialization failed (non-blocking):", err);
	});

	try {
		initializeACP();
	} catch (err) {
		console.error("[ACP] Initialization failed (non-blocking):", err);
	}

	// Refresh model registry on first startup (non-blocking)
	refreshModelsOnFirstStartup().catch((err) => {
		console.error("[Models] First-startup refresh failed (non-blocking):", err);
	});


	// Gateway is an Electron-hosted service. Enable from Settings > Channels
	// or with legacy gateway env vars so IM messages enter the real onething runtime.
	initializeGateway().catch((err) => {
		console.error("[Gateway] Initialization failed (non-blocking):", err);
	});

	// Plugin roots can contribute skills, so load skills after plugin bootstrap
	// has had a chance to register its roots.
	pluginsReady.finally(() => {
		initializeSkills().catch((err) => {
			console.error("[Skills] Initialization failed (non-blocking):", err);
		});
	});
}

function createElectronMainWindowOptions(): ElectronActivateOptions {
	return {
		getMainWindow: () => mainWindow,
		setMainWindow: (window) => {
			mainWindow = window;
		},
		shouldSuppressMainWindowActivation,
		createWindow,
		attachVoiceTrayMainWindow,
		registerGlobalWindowShortcuts,
		initializeIPCBridge,
		bindStreamEngine: (webContents) => getStreamEngine().bind(webContents),
		shutdownIPCBridge,
		abortActiveStreams: () => getStreamEngineSafe()?.abortAll(),
		attachVoiceMainWindow: (window) =>
			getVoiceService().attachMainWindow(window),
		warmSearchWindow,
		warmTodoPlanWindow: () =>
			warmTodoPlanWindow({
				activation: "preserve-current-app",
				preserveMainWindowVisibility: true,
			}),
		activateMainWindow,
	};
}

export function startOnethingElectronMain(): void {
	if (electronMainStarted) return;
	electronMainStarted = true;

	markStartupProcessStart(process.uptime());
	markStartup("main-start");

	configureGatewayLifecycle({
		getConversationRuntime,
		getSettings: () => getSettings(),
		commandProvider: createGatewayPluginCommandProvider(),
	});
	configureVoiceTray({
		getVoiceState: () => getSettings().voice,
		shutdownVoiceService: () => getVoiceServiceSafe()?.shutdown(),
	});

	configureAppLoggingHost({
		setAppLogsPath: setElectronAppLogsPath,
		createRendererConsoleCapture: createElectronRendererConsoleCapture,
	});
	configureSkillsEnvironmentHost({
		isPackaged: getElectronAppIsPackaged,
		getResourcesPath: getElectronResourcesPath,
	});
	configureAuthHost({
		authFetch: createElectronAuthFetch({
			fallbackFetch: createRequiredAppFetch({ policy: "auth" }),
		}),
		tokenCryptoAdapter: getElectronSafeStorage,
	});
	configureVoiceHost({
		broadcastMessage: broadcastElectronVoiceMessage,
		runtimeWindow: {
			ensure: () => void ensureVoiceRuntimeWindow(),
			destroy: destroyVoiceRuntimeWindow,
			sendCommand: sendVoiceRuntimeCommand,
			markReady: markVoiceRuntimeReady,
			isReady: isVoiceRuntimeReady,
			flushCommands: flushVoiceRuntimeCommands,
		},
		updateTray: updateVoiceTray,
	});
	initializeAppLogging();

	// Suppress security warnings in development mode. Vite HMR needs unsafe-eval;
	// production builds use strict CSP and do not show these warnings.
	if (process.env.NODE_ENV === "development") {
		process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
	}

	registerElectronAppBootstrap({
		storePathHost: { configureStorePathHost },
		ready: {
			configureSandboxHost,
			hydratePackagedEnvironment: async () => {
				await hydrateProcessEnvFromLoginShell({ logger: console });
				markStartup("login-shell-env-hydrated");
			},
			acquireDesktopStoreLock,
			formatDesktopStoreLockError: formatElectronDesktopStoreLockError,
		},
		mediaProtocol: { getMediaImagesDir },
		powerResume: {
			getMainWindow: () => mainWindow,
			recoverMainWindow: recoverMainWindowAfterSystemResume,
		},
		windowAllClosed: {
			isVoiceKeepAliveEnabled: () => getVoiceService().getState().enabled,
		},
		didBecomeActive: {
			getMainWindow: () => mainWindow,
			isTodoPlanWindow: isTodoPlanBrowserWindow,
			activateMainWindow,
		},
		beforeQuit: {
			markVoiceQuitRequested,
			shutdownVoiceService: () => getVoiceService().shutdown(),
			shutdownMusicService: () => {
				disposeRadioConductor();
				disposeMusicService();
			},
			unregisterGlobalWindowShortcuts,
			shutdownGateway,
			shutdownMCP,
			shutdownACP,
			killTrackedDetachedChildren,
			shutdownStreamEngine,
			shutdownPermission: () => Permission.shutdown(),
			shutdownSessionLayer,
			shutdownEventSystem,
			flushAllPendingSaves,
			shutdownAppLogging,
			releaseDesktopStoreLock: () => {
				desktopStoreLock?.release();
				desktopStoreLock = null;
			},
		},
		createMainWindowOptions: createElectronMainWindowOptions,
		onReady: initializeElectronReadyServices,
		afterMainWindowCreated: () => {
			markStartup("window-created");
			console.log(formatStartupSummary());
			getVoiceService().applySettings();
		},
		startPostWindowServices,
	});
}

export { mainWindow };
