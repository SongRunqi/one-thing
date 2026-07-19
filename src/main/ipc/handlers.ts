import { emitCoreSessionCommandForIpc } from "@onething/core/events";
import {
	registerElectronSessionCommandIpcHandler,
	type ElectronSessionCommandRequest,
} from "@onething/electron-host/ipc/session-command";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import { registerChatHandlers } from "./chat.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerAgentHandlers } from "./agents.js";
import { registerModelsHandlers } from "./models.js";
import { registerProvidersHandlers } from "./providers.js";
import { registerToolHandlers } from "./tools.js";
import { registerMCPHandlers, initializeMCP, shutdownMCP } from "./mcp.js";
import { registerSkillHandlers, initializeSkills } from "./skills.js";
import { registerShellHandlers } from "./shell.js";
import { registerMediaHandlers } from "./media.js";
import { registerPermissionHandlers } from "./permission.js";
import { registerOAuthHandlers, cleanupOAuth } from "./oauth.js";
import { registerThemeHandlers, initializeThemeSystem } from "./themes.js";
import { registerVariableHandlers } from "../variables/ipc.js";
import { registerProjectDirsHandlers } from "../project-dirs/ipc.js";
import { registerPluginHandlers } from "./plugins.js";
import { registerPromptHandlers } from "../prompts/ipc.js";
import { registerMemoryHandlers } from "./memory.js";
import { registerSchedulerHandlers } from "./scheduler.js";
import { registerFilesHandlers } from "./files.js";
import { registerMarkdownHandlers } from "./markdown.js";
import { registerSearchHandlers } from "@onething/electron-host/search/ipc";
import { registerAppStateHandlers } from "./app-state.js";
import { registerTodoPlanHandlers } from "../todo-plan/ipc.js";
import { registerVoiceHandlers } from "../voice/ipc.js";
import { registerMusicHandlers } from "../music/ipc.js";
import { startMusicNowPlayingWatch } from "../music/service.js";
import { startRadioConductor } from "../music/radio.js";
import { registerACPHandlers, initializeACP, shutdownACP } from "./acp.js";
import { registerGatewayHandlers } from "../gateway/ipc.js";
import { registerChannelIdentityHandlers } from "./channel-identity.js";
import { registerGoalHandlers } from "./goal.js";
import { registerEvalsHandlers } from "./evals.js";
import { registerUsageHandlers } from "./usage.js";
import { registerPracticeHandlers } from "./practice.js";
import { getEventBus } from "../events/index.js";
import { sanitizeRendererOrigin } from "../channel/index.js";

export function initializeIPC() {
	registerChatHandlers();
	registerSessionHandlers();
	registerSettingsHandlers();
	registerAgentHandlers();
	registerModelsHandlers();
	registerProvidersHandlers();
	registerToolHandlers();
	registerMCPHandlers();
	registerSkillHandlers();
	registerShellHandlers();
	registerMediaHandlers();
	registerPermissionHandlers();
	registerOAuthHandlers();
	registerThemeHandlers();
	registerVariableHandlers();
	registerProjectDirsHandlers();
	registerPluginHandlers();
	registerPromptHandlers();
	registerMemoryHandlers();
	registerSchedulerHandlers();
	registerFilesHandlers();
	registerMarkdownHandlers();
	registerSearchHandlers();
	registerAppStateHandlers();
	registerTodoPlanHandlers();
	registerVoiceHandlers();
	registerMusicHandlers();
	// Safe at startup, unlike the keepalive: watching is a file stat on a timer,
	// and `ncm-cli state` cannot start a player even when it does run. Nothing
	// here can make sound.
	startMusicNowPlayingWatch();
	// Also inert while the radio is off: every sample starts with a brief read
	// that says "inactive" and returns. Sound only ever follows a user opening
	// the station in conversation.
	startRadioConductor();
	registerACPHandlers();
	registerGatewayHandlers();
	registerChannelIdentityHandlers();
	registerGoalHandlers();
	registerEvalsHandlers();
	registerUsageHandlers();
	registerPracticeHandlers();
	registerCommandHandler();
}

/**
 * Register the unified session:command handler.
 * Routes renderer commands through EventBus for processing by
 * subscribed systems (Permission, StreamEngine, etc.).
 */
function registerCommandHandler() {
	registerElectronSessionCommandIpcHandler({
		channel: IPC_CHANNELS.SESSION_COMMAND,
		handleCommand: async ({
			sessionId,
			command,
		}: ElectronSessionCommandRequest) => {
			const safeCommand = sanitizeRendererCommand(command);
			return emitCoreSessionCommandForIpc({
				sessionId,
				command: safeCommand as Parameters<
					ReturnType<typeof getEventBus>["emit"]
				>[1],
				eventBus: getEventBus(),
				logger: console,
			});
		},
	});
	console.log("[IPC] session:command handler registered");
}

function sanitizeRendererCommand(command: unknown): unknown {
	if (!command || typeof command !== "object") return command;
	const record = command as Record<string, unknown>;
	if (typeof record.type !== "string") return command;
	if (!record.type.startsWith("command:")) return command;

	// Phase 1 evals: amend turn records on retry/edit ("先落盘后补写").
	// turnId must match the assistant message id recorded by
	// turn-evaluation.ts (see collectContext there), not the sessionId —
	// otherwise every turn in a session collapses onto one record.
	if (record.type === "command:retry-message") {
		const sessionId = record.sessionId as string | undefined;
		// messageId here is the assistant message being retried, which is
		// exactly the turnId recorded for that turn.
		const turnId = record.messageId as string | undefined;
		if (sessionId && turnId) {
			// A retry is a late negative signal: materialize the incident
			// bundle now (scene from LRU + trace from persisted messages).
			Promise.all([
				import("@onething/runtime"),
				import("./evals.js"),
			])
				.then(async ([{ amendTurnRetry }, { createIncidentForTurn }]) => {
					const incident = await createIncidentForTurn({
						sessionId,
						turnId,
						origin: "auto",
						signals: { retried: true },
					});
					amendTurnRetry({
						turnId,
						sessionId,
						incidentRef: incident?.incidentId ?? null,
					});
				})
				.catch(() => {});
		}
	}
	if (record.type === "command:edit-and-resend") {
		const sessionId = record.sessionId as string | undefined;
		// messageId here is the user message being edited, not the assistant
		// turnId — best-effort amend key until callers can pass the
		// responding assistant message id. The prompt-capture LRU is keyed by
		// assistant message id, so this path usually creates no incident.
		const turnId = record.messageId as string | undefined;
		if (sessionId && turnId) {
			Promise.all([
				import("@onething/runtime"),
				import("./evals.js"),
			])
				.then(async ([{ amendTurnEditResend }, { createIncidentForTurn }]) => {
					const incident = await createIncidentForTurn({
						sessionId,
						turnId,
						origin: "auto",
						signals: { editResent: true },
					});
					amendTurnEditResend({
						turnId,
						sessionId,
						incidentRef: incident?.incidentId ?? null,
					});
				})
				.catch(() => {});
		}
	}

	if (
		record.type === "command:send-message" ||
		record.type === "command:edit-and-resend" ||
		record.type === "command:inject-steering" ||
		record.type === "command:inject-followup"
	) {
		return {
			...record,
			origin: sanitizeRendererOrigin(record),
		};
	}

	return command;
}

export {
	initializeMCP,
	shutdownMCP,
	initializeSkills,
	cleanupOAuth,
	initializeThemeSystem,
	initializeACP,
	shutdownACP,
};
