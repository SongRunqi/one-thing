import type { ChatMessageMention, ChatMessageReplyTo, PermissionMode } from "@shared/ipc.js";
import type { MessageOrigin } from "@shared/ipc.js";
import {
	type CoreInitialToolChoice,
	type CoreStreamEngineRuntime,
} from "@onething/core/engine";
import {
	OnethingStreamEngine,
	type BindableOnethingStreamSender,
	type OnethingStreamSender,
	type OnethingStreamSenderPayload,
} from "@onething/runtime/stream-engine";
import type { EventBus } from "../events/event-bus.js";
import {
	createMainStreamEngineRuntime,
	type MainStreamEngineRuntime,
} from "./stream-engine-runtime.js";
import { getChannelSessionRouter } from "../channel/index.js";
import { isSystemInternalSource } from "../channel/origin.js";
import {
	handleCollabRoomSendMessage,
	isCollabCoordinatorDrivenSession,
	isCollabRoomSession,
} from "../collab/ingress.js";
import { isTrustedCollabDrive } from "../collab/drive-guard.js";
import { getEventBus } from "../events/index.js";
import { composeAgentPermissionMode } from "@onething/runtime/agents";
import { defaultAgent, findAgent } from "../agents/store.js";
import { resolveAgentProfileForSession } from "../agents/profile.js";
import { getSession } from "../stores/sessions.js";

export type StreamSenderPayload = OnethingStreamSenderPayload;
export type StreamSender = OnethingStreamSender;
export type BindableStreamSender = BindableOnethingStreamSender;

export class StreamEngine extends OnethingStreamEngine<EventBus, StreamSender> {
	constructor(
		private readonly mainRuntime: MainStreamEngineRuntime = createMainStreamEngineRuntime(),
	) {
		super(mainRuntime as unknown as CoreStreamEngineRuntime);
	}

	/**
	 * session/settings chain (core) composed with the agent's declared mode by
	 * STRICTNESS — an agent that asks to be asked is not silenced by a session
	 * that turned approvals off. An agent that declares nothing does not
	 * participate, so the collab worker's inherited auto-approve still holds.
	 *
	 * Read live rather than off the turn snapshot: this runs per `Permission.ask`
	 * via the callback wired in backend.ts, and permissions go strict-and-fresh.
	 */
	getPermissionMode(sessionId: string): PermissionMode {
		const base = super.getPermissionMode(sessionId);
		// persona/能力功能兜底(域模型 §3.3),与 profile.ts 同一条规则。
		const agent = findAgent(getSession(sessionId)?.agentId) ?? defaultAgent();
		return composeAgentPermissionMode(agent?.permissionMode, base, undefined, {
			agentId: agent?.id,
		}) as PermissionMode;
	}

	bind(sender: BindableStreamSender): void {
		super.bind(sender);
	}

	override async handleSendMessage(
		sessionId: string,
		command: {
			type?: string;
			channel?: string;
			source?: string;
			content: string;
			attachments?: unknown[];
			voice?: unknown;
			origin?: MessageOrigin;
			replyTo?: ChatMessageReplyTo;
			/** Picked @mentions (W14a); consumed by the room ingress gate. */
			mentions?: ChatMessageMention[];
			/**
			 * W23: the room message a collab drive answers. Pure passthrough to
			 * the core engine, which persists it onto the drive's user message.
			 */
			collabSourceMessageId?: string;
			/**
			 * P2-8: proof this command came from the live coordinator. Consumed by
			 * the room/exec gate below and by the ingress gate; never persisted.
			 */
			collabDriveToken?: string;
			/** Billing attribution passthrough (W13.3); default 'chat'. */
			usageSource?: string;
			/**
			 * Force the first model call of this turn into a (named) tool call
			 * — W18b, narrowed to `say` by name in W22. Set by the collab room
			 * drive only; rides straight through to the agent loop.
			 */
			initialToolChoice?: CoreInitialToolChoice;
			/** Per-command model override; an explicit one outranks the agent binding. */
			providerId?: string;
			model?: string;
			thinking?: boolean;
			thinkingEffort?: string;
		},
		sender: StreamSender,
	): Promise<void> {
		// System-internal re-drives (goal continuations, ...) have no channel
		// identity behind them. The router would resolve their `api` origin to
		// an anonymous channel identity, remap the command into an identity
		// session and overwrite the session's memory-profile metadata — so
		// they bypass routing entirely, like the in-run goal injection. The
		// source set is shared with the counterpart-identity scans.
		if (isSystemInternalSource(command.source)) {
			// Only the coordinator's own drives may stream a room — or, since W18,
			// an agent's execution session, which is where the turn actually runs.
			// Other internal emitters (goal retry kicks, radio) targeting one would
			// bypass the coordinator entirely: a turn with the last activated
			// persona, no mention resolution, and none of the three gates.
			//
			// P2-8: the test is the drive TOKEN, not the source string. `source`
			// says what a command claims to be; only the coordinator that minted
			// this process's token can prove it (drive-guard.ts).
			if (
				isCollabCoordinatorDrivenSession(sessionId)
				&& !(command.source === "collab" && isTrustedCollabDrive(command))
			) {
				console.warn(
					`[StreamEngine] internal source '${command.source}' refused on coordinator-driven session`,
					sessionId,
				);
				return;
			}
			await super.handleSendMessage(
				sessionId,
				this.withAgentModelBinding(sessionId, command),
				sender,
			);
			return;
		}

		// Room ingress gate (docs/multi-agent-collab.md D2): user messages into a
		// room persist WITHOUT streaming — the engine's auto-drive would reply
		// with the stale persona and supersede-abort the coordinator. The
		// coordinator observes message:user-created and decides activations; its
		// own drives carry source 'collab' and take the system-internal branch.
		if (await handleCollabRoomSendMessage(sessionId, command)) {
			return;
		}

		const routed = getChannelSessionRouter().route({
			sessionId,
			origin: command.origin,
			fallbackTransport: fallbackTransportForCommand(command),
			preserveSessionId: shouldPreserveSessionId(command),
		});
		const nextCommand = {
			...command,
			origin: routed.origin,
			source: command.source || routed.origin.source,
			channel: command.channel || channelForOrigin(routed.origin),
		};
		await super.handleSendMessage(
			routed.sessionId,
			this.withAgentModelBinding(routed.sessionId, nextCommand),
			sender,
		);
	}

	/**
	 * Apply the agent's model binding when nothing more specific asked for a
	 * model (A1.4). Two things outrank it and both are already decided by the
	 * time a command reaches here: an explicit per-command override (the
	 * renderer's picker result, a collab drive's own stamp) and a session the
	 * user pinned by hand — `resolveAgentProfileForSession` drops the binding
	 * for a pinned session, so this only ever fills a genuine blank.
	 *
	 * Stamped onto the command rather than folded into
	 * getEffectiveProviderConfig, keeping the store.ts contract that an agent's
	 * model is never part of that resolution chain.
	 */
	private withAgentModelBinding<
		TCommand extends {
			providerId?: string;
			model?: string;
			thinking?: boolean;
			thinkingEffort?: string;
		},
	>(sessionId: string, command: TCommand): TCommand {
		if (command.providerId) return command;
		const binding = resolveAgentProfileForSession(sessionId).model;
		if (!binding?.providerId) return command;
		return {
			...command,
			providerId: binding.providerId,
			...(binding.modelId ? { model: binding.modelId } : {}),
			...(binding.thinking
				? { thinking: true, thinkingEffort: binding.thinking }
				: {}),
		};
	}

	override async handleEditAndResend(
		sessionId: string,
		command: {
			type?: string;
			channel?: string;
			source?: string;
			messageId: string;
			newContent: string;
			origin?: MessageOrigin;
		},
		sender: StreamSender,
	): Promise<void> {
		// P0: edit/retry semantics in rooms are undefined (a retry would replay
		// with the CURRENT session persona, not the message's original one).
		// The renderer hides these affordances; this is the engine backstop —
		// and it must be OBSERVABLE: the renderer latches sessionLoading before
		// emitting, so a silent return would wedge the composer.
		if (isCollabRoomSession(sessionId)) {
			await emitCollabRefusal(sessionId, "群聊房间不支持编辑重发");
			return;
		}
		const routed = getChannelSessionRouter().route({
			sessionId,
			origin: command.origin,
			fallbackTransport: fallbackTransportForCommand(command),
			preserveSessionId: shouldPreserveSessionId(command),
		});
		const nextCommand = {
			...command,
			origin: routed.origin,
			source: command.source || routed.origin.source,
			channel: command.channel || channelForOrigin(routed.origin),
		};
		await super.handleEditAndResend(routed.sessionId, nextCommand, sender);
	}

	override async handleRetryMessage(
		sessionId: string,
		command: Parameters<OnethingStreamEngine<EventBus, StreamSender>["handleRetryMessage"]>[1],
		sender: StreamSender,
	): Promise<void> {
		if (isCollabRoomSession(sessionId)) {
			await emitCollabRefusal(sessionId, "群聊房间不支持重试");
			return;
		}
		await super.handleRetryMessage(sessionId, command, sender);
	}

	override steerMessage(
		sessionId: string,
		content: string,
		source = "api",
		origin?: MessageOrigin,
	): void {
		const routed = getChannelSessionRouter().route({
			sessionId,
			origin,
			fallbackTransport: fallbackTransportForCommand({ source }),
			preserveSessionId: source === "gateway",
		});
		super.steerMessage(
			routed.sessionId,
			content,
			source || routed.origin.source,
			routed.origin,
		);
	}

	override followUpMessage(
		sessionId: string,
		content: string,
		source = "api",
		origin?: MessageOrigin,
	): void {
		const routed = getChannelSessionRouter().route({
			sessionId,
			origin,
			fallbackTransport: fallbackTransportForCommand({ source }),
			preserveSessionId: source === "gateway",
		});
		super.followUpMessage(
			routed.sessionId,
			content,
			source || routed.origin.source,
			routed.origin,
		);
	}

	protected override onShutdown(): void {
		super.onShutdown();
		console.log("[StreamEngine] Shut down");
	}
}

async function emitCollabRefusal(sessionId: string, error: string): Promise<void> {
	console.warn(`[StreamEngine] ${error}`, sessionId);
	try {
		await getEventBus().emit(sessionId, {
			type: "stream:error",
			data: { error },
		} as Parameters<ReturnType<typeof getEventBus>["emit"]>[1]);
	} catch (cause) {
		console.error("[StreamEngine] failed to emit collab refusal:", cause);
	}
}

function fallbackTransportForCommand(command: {
	channel?: string;
	source?: string;
}): MessageOrigin["transport"] {
	if (command.source === "voice" || command.channel === "voice") return "voice";
	if (command.source === "api" || command.channel === "api") return "api";
	if (
		command.channel &&
		command.channel !== "ipc" &&
		command.channel !== "desktop"
	)
		return "im";
	return "desktop";
}

function channelForOrigin(origin: MessageOrigin): string {
	if (origin.transport === "im") {
		return (
			origin.conversation?.connector || origin.replyTarget?.connector || "im"
		);
	}
	return origin.transport === "desktop" ? "ipc" : origin.transport;
}

function shouldPreserveSessionId(command: { source?: string }): boolean {
	return command.source === "gateway";
}
