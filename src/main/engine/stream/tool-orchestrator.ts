import * as store from "../../store.js";
import { getEventBus } from "../../events/index.js";
import type {
	ContentPart,
	SkillDefinition,
	Step,
	ToolCall,
} from "../../../shared/ipc.js";
import type { StreamContext, StreamProcessor } from "./stream-processor.js";
import type { IPCEmitter } from "./ipc-emitter.js";
import { executeToolAndUpdate } from "./tool-execution.js";
import { ToolExecutionScheduler } from "./tool-execution-scheduler.js";

interface ToolExecutionJob {
	toolCall: ToolCall;
	promise: Promise<void>;
	settled: boolean;
	barrier: boolean;
	published: boolean;
}

export interface ToolOrchestratorOptions {
	ctx: StreamContext;
	processor: StreamProcessor;
	enabledSkills: SkillDefinition[];
	turnIndex: number;
	turnToolCalls: ToolCall[];
	emitter: IPCEmitter;
	beforeFirstTool: () => void;
}

/**
 * Per-turn tool orchestration skeleton.
 *
 * Owns duplicate detection, queued status, scheduling, and execution jobs.
 * Tool execution now performs centralized analyze → PermissionPolicy → execute
 * before side effects, so barrier scheduling and permission lifecycle share one
 * backend-controlled path.
 */
export class ToolOrchestrator {
	private readonly ctx: StreamContext;
	private readonly processor: StreamProcessor;
	private readonly enabledSkills: SkillDefinition[];
	private readonly turnIndex: number;
	private readonly turnToolCalls: ToolCall[];
	private readonly emitter: IPCEmitter;
	private readonly beforeFirstTool: () => void;
	private readonly executedToolCallIds = new Set<string>();
	private readonly jobs: ToolExecutionJob[] = [];
	private readonly discardedToolCallIds = new Set<string>();
	private readonly toolSignatureCounts = new Map<string, number>();
	private readonly scheduler = new ToolExecutionScheduler();
	private stoppedByFailedToolCallId: string | null = null;

	constructor(options: ToolOrchestratorOptions) {
		this.ctx = options.ctx;
		this.processor = options.processor;
		this.enabledSkills = options.enabledSkills;
		this.turnIndex = options.turnIndex;
		this.turnToolCalls = options.turnToolCalls;
		this.emitter = options.emitter;
		this.beforeFirstTool = options.beforeFirstTool;
	}

	hasExecuted(toolCallId: string): boolean {
		return this.executedToolCallIds.has(toolCallId);
	}

	get jobCount(): number {
		return this.jobs.length;
	}

	shouldDeferNewToolCall(): boolean {
		return this.hasUnsettledJob() || this.stoppedByFailedToolCallId !== null;
	}

	start(
		toolCall: ToolCall,
		toolCallData: { toolName: string; args: Record<string, any> },
		existingStepId?: string,
	): void {
		if (this.executedToolCallIds.has(toolCall.id)) return;

		this.beforeFirstTool();
		this.executedToolCallIds.add(toolCall.id);

		const shouldDiscardImmediately = this.stoppedByFailedToolCallId !== null;
		const hiddenBehindBarrier =
			this.hasUnsettledJob() || shouldDiscardImmediately;
		const isBarrier = true;

		if (shouldDiscardImmediately) {
			this.discardedToolCallIds.add(toolCall.id);
			this.executedToolCallIds.delete(toolCall.id);
			this.unpublishToolCall(toolCall.id);
			return;
		}

		const doomLoop = this.checkDoomLoop(toolCallData);
		if (doomLoop.detected) {
			this.publishToolCall(toolCall, false);
			toolCall.status = "failed";
			toolCall.error = doomLoop.message;
			toolCall.endTime = Date.now();
			store.updateMessageToolCalls(
				this.ctx.sessionId,
				this.ctx.assistantMessageId,
				this.processor.toolCalls,
			);
			this.emitter.sendToolCall(toolCall);
			this.emitter.sendToolResult(toolCall);
			return;
		}

		if (hiddenBehindBarrier) {
			this.unpublishToolCall(toolCall.id);
		} else {
			this.publishToolCall(toolCall, false);
		}

		const job: ToolExecutionJob = {
			toolCall,
			settled: false,
			barrier: isBarrier,
			published: !hiddenBehindBarrier,
			promise: Promise.resolve(),
		};

		job.promise = this.scheduler.enqueue(
			async () => {
				if (this.discardedToolCallIds.has(toolCall.id)) {
					job.settled = true;
					return;
				}

				try {
					if (!job.published) {
						this.publishToolCall(toolCall, false);
						job.published = true;
					}

					await executeToolAndUpdate(
						this.ctx,
						toolCall,
						toolCallData,
						this.processor.toolCalls,
						this.enabledSkills,
						this.turnIndex,
						existingStepId,
					);
					if (shouldStopAfterTool(toolCall)) {
						this.stoppedByFailedToolCallId = toolCall.id;
						this.discardQueuedTailAfter(
							toolCall.id,
							toolCall.rejected ? "rejected" : toolCall.status,
						);
					}
				} catch (err) {
					console.error("[ToolOrchestrator] tool execution job error:", err);
				} finally {
					job.settled = true;
				}
			},
			{ barrier: isBarrier },
		);

		this.jobs.push(job);
	}

	private hasUnsettledJob(): boolean {
		return this.jobs.some((job) => !job.settled);
	}

	private publishToolCall(toolCall: ToolCall, emitQueued: boolean): void {
		if (
			!this.processor.toolCalls.some((existing) => existing.id === toolCall.id)
		) {
			this.processor.toolCalls.push(toolCall);
		}
		if (!this.turnToolCalls.some((existing) => existing.id === toolCall.id)) {
			this.turnToolCalls.push(toolCall);
		}
		if (emitQueued) {
			toolCall.status = "queued";
			this.emitter.sendToolCall(toolCall);
		}
		store.updateMessageToolCalls(
			this.ctx.sessionId,
			this.ctx.assistantMessageId,
			this.processor.toolCalls,
		);
	}

	private unpublishToolCall(toolCallId: string): void {
		const ids = new Set([toolCallId]);
		const removedProcessorToolCalls = removeToolCallsById(
			this.processor.toolCalls,
			ids,
		);
		removeToolCallsById(this.turnToolCalls, ids);

		// If a tool call was hidden from the start (publish:false), there is
		// nothing to remove from the store or renderer. Emitting a no-op
		// message:updated here is actively harmful: permission:request state is
		// applied optimistically in the renderer while Permission.ask() is
		// awaiting a response, and a stale backend snapshot can wipe the visible
		// Ask Permission UI.
		const removedArtifacts = this.removeToolCallArtifacts(ids);
		if (removedProcessorToolCalls === 0 && !removedArtifacts) return;

		store.updateMessageToolCalls(
			this.ctx.sessionId,
			this.ctx.assistantMessageId,
			this.processor.toolCalls,
		);
		if (!removedArtifacts) {
			this.emitToolCallRemovalUpdate();
		}
	}

	private removeToolCallArtifacts(ids: Set<string>): boolean {
		const session = store.getSession(this.ctx.sessionId);
		const message = session?.messages.find(
			(m) => m.id === this.ctx.assistantMessageId,
		);
		const hadSteps =
			message?.steps?.some(
				(step) => !!step.toolCallId && ids.has(step.toolCallId),
			) ?? false;
		const hadContentParts =
			message?.contentParts?.some(
				(part) =>
					part.type === "tool-call" &&
					part.toolCalls.some((toolCall) => ids.has(toolCall.id)),
			) ?? false;

		if (!hadSteps && !hadContentParts) return false;

		const nextSteps = hadSteps ? filterSteps(message?.steps, ids) : undefined;
		const nextParts = hadContentParts
			? filterContentParts(message?.contentParts, ids)
			: undefined;

		if (hadSteps) {
			store.updateMessageSteps(
				this.ctx.sessionId,
				this.ctx.assistantMessageId,
				nextSteps,
			);
		}
		if (hadContentParts) {
			store.updateMessageContentParts(
				this.ctx.sessionId,
				this.ctx.assistantMessageId,
				nextParts,
			);
		}

		try {
			getEventBus()
				.emit(this.ctx.sessionId, {
					type: "message:updated",
					messageId: this.ctx.assistantMessageId,
					updates: {
						toolCalls: [...this.processor.toolCalls],
						...(hadSteps ? { steps: nextSteps } : {}),
						...(hadContentParts ? { contentParts: nextParts } : {}),
					},
				})
				.catch((err) =>
					console.error("[ToolOrchestrator] message:updated emit error:", err),
				);
		} catch (err) {
			console.error("[ToolOrchestrator] remove artifacts emit error:", err);
		}
		return true;
	}

	private emitToolCallRemovalUpdate(): void {
		try {
			getEventBus()
				.emit(this.ctx.sessionId, {
					type: "message:updated",
					messageId: this.ctx.assistantMessageId,
					updates: { toolCalls: [...this.processor.toolCalls] },
				})
				.catch((err) =>
					console.error("[ToolOrchestrator] message:updated emit error:", err),
				);
		} catch (err) {
			console.error("[ToolOrchestrator] tool call removal emit error:", err);
		}
	}

	private checkDoomLoop(toolCallData: {
		toolName: string;
		args: Record<string, any>;
	}): { detected: boolean; message?: string } {
		const signature = `${toolCallData.toolName.toLowerCase()}:${stableStringify(toolCallData.args)}`;
		const count = (this.toolSignatureCounts.get(signature) || 0) + 1;
		this.toolSignatureCounts.set(signature, count);

		if (count >= 4) {
			return {
				detected: true,
				message: `Repeated identical tool call detected (${toolCallData.toolName}, ${count} times). Stop and reassess instead of retrying the same arguments.`,
			};
		}

		return { detected: false };
	}

	private discardQueuedTailAfter(toolCallId: string, reason: string): void {
		const index = this.jobs.findIndex((job) => job.toolCall.id === toolCallId);
		if (index < 0) return;

		const tailIds = this.jobs
			.slice(index + 1)
			.filter(
				(job) =>
					!job.settled && (!job.published || job.toolCall.status === "queued"),
			)
			.map((job) => job.toolCall.id);

		if (tailIds.length === 0) return;

		for (const id of tailIds) {
			this.discardedToolCallIds.add(id);
			this.executedToolCallIds.delete(id);
		}

		const tailIdSet = new Set(tailIds);
		removeToolCallsById(this.processor.toolCalls, tailIdSet);
		removeToolCallsById(this.turnToolCalls, tailIdSet);

		store.updateMessageToolCalls(
			this.ctx.sessionId,
			this.ctx.assistantMessageId,
			this.processor.toolCalls,
		);
		this.removeToolCallArtifacts(tailIdSet);

		console.log(
			`[ToolOrchestrator] Discarded ${tailIds.length} queued tool(s) after ${reason} tool ${toolCallId}`,
		);
	}

	async waitForAll(): Promise<void> {
		if (this.jobs.length === 0) return;
		await Promise.allSettled(this.jobs.map((job) => job.promise));
	}
}

function shouldStopAfterTool(toolCall: ToolCall): boolean {
	return Boolean(toolCall.rejected) || toolCall.status === "cancelled";
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
		.join(",")}}`;
}

function removeToolCallsById(toolCalls: ToolCall[], ids: Set<string>): number {
	let removed = 0;
	for (let i = toolCalls.length - 1; i >= 0; i--) {
		if (ids.has(toolCalls[i].id)) {
			toolCalls.splice(i, 1);
			removed++;
		}
	}
	return removed;
}

function filterSteps(
	steps: Step[] | undefined,
	ids: Set<string>,
): Step[] | undefined {
	if (!steps) return undefined;
	return steps.filter((step) => !step.toolCallId || !ids.has(step.toolCallId));
}

function filterContentParts(
	parts: ContentPart[] | undefined,
	ids: Set<string>,
): ContentPart[] | undefined {
	if (!parts) return undefined;
	return parts
		.map((part) => {
			if (part.type !== "tool-call") return part;
			return {
				...part,
				toolCalls: part.toolCalls.filter((toolCall) => !ids.has(toolCall.id)),
			};
		})
		.filter((part) => part.type !== "tool-call" || part.toolCalls.length > 0);
}
