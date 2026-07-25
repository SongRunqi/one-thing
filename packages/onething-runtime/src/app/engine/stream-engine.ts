import type { PermissionMode } from "@shared/ipc.js";
import type { MessageOrigin } from "@shared/ipc.js";
import { type CoreStreamEngineRuntime } from "@onething/core/engine";
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

export type StreamSenderPayload = OnethingStreamSenderPayload;
export type StreamSender = OnethingStreamSender;
export type BindableStreamSender = BindableOnethingStreamSender;

export class StreamEngine extends OnethingStreamEngine<EventBus, StreamSender> {
	constructor(
		private readonly mainRuntime: MainStreamEngineRuntime = createMainStreamEngineRuntime(),
	) {
		super(mainRuntime as unknown as CoreStreamEngineRuntime);
	}

	getPermissionMode(sessionId: string): PermissionMode {
		return super.getPermissionMode(sessionId) as PermissionMode;
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
			await super.handleSendMessage(sessionId, command, sender);
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
		await super.handleSendMessage(routed.sessionId, nextCommand, sender);
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
