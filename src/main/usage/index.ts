/**
 * Token billing: per-turn usage ledger. Single choke point (recordUsage) so
 * every LLM call — main chat path and side-line calls (title/memory/evals/
 * goal) — lands in the same append-only JSONL ledger. See
 * docs/design/token-billing.md.
 */
import path from "node:path";
import {
	OnethingUsageLedger,
	getOnethingSessionUsageTotal,
	resolveOnethingUsageBillingMode,
	type OnethingUsageBillingMode,
	type OnethingUsageLedgerRecord,
} from "@onething/runtime/usage";
import type { MessageOrigin } from "../../shared/ipc/channel-identity.js";
import { getStorePath } from "../stores/paths.js";
import { getModelCapabilityEntry } from "../providers/model-registry.js";
import * as store from "../store.js";

/**
 * Providers billed as a fixed-price subscription (no per-token invoice).
 * Their usage is recorded at the same-model official API rate as a cost
 * *estimate*, tagged billing: 'subscription' so it is never summed into
 * real spend.
 */
const SUBSCRIPTION_PROVIDER_IDS = ["codex", "claude-code", "github-copilot"] as const;

export interface RecordUsageInput {
	sessionId?: string;
	providerId: string;
	modelId: string;
	/** Originating channel/platform. Falls back to the session's assistant-message origin, then 'electron'. */
	platform?: string;
	/** Call category: 'chat' | 'title' | 'memory' | 'goal' | 'evals' | ... */
	source: string;
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens?: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
		reasoningTokens?: number;
	};
	/** The assistant message this usage was recorded for, used to resolve platform from its origin. */
	assistantMessageId?: string;
	partial?: boolean;
}

function platformForOrigin(origin: MessageOrigin | undefined): string {
	if (!origin) return "electron";
	if (origin.transport === "im") {
		return origin.conversation?.connector || origin.replyTarget?.connector || "im";
	}
	if (origin.transport === "desktop") return "electron";
	return origin.transport;
}

function resolvePlatform(input: RecordUsageInput): string {
	if (input.platform) return input.platform;
	if (input.sessionId && input.assistantMessageId) {
		const session = store.getSession(input.sessionId);
		const message = session?.messages.find((m) => m.id === input.assistantMessageId);
		return platformForOrigin(message?.origin as MessageOrigin | undefined);
	}
	return "electron";
}

let ledgerInstance: OnethingUsageLedger | null = null;

export function getUsageLedger(): OnethingUsageLedger {
	if (!ledgerInstance) {
		ledgerInstance = new OnethingUsageLedger({
			ledgerDir: () => path.join(getStorePath(), "usage"),
		});
	}
	return ledgerInstance;
}

export function resolveUsageBillingMode(providerId: string): OnethingUsageBillingMode {
	return resolveOnethingUsageBillingMode(providerId, SUBSCRIPTION_PROVIDER_IDS);
}

export interface SessionUsageTotal {
	apiCostUSD: number;
	subscriptionCostUSD: number;
	turnCount: number;
	usage: {
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens: number;
		cacheWriteTokens: number;
		reasoningTokens: number;
		totalTokens: number;
	};
}

/** Total cost/usage for one session, for a live in-session readout (not the day/week/month settings panel). */
export async function getSessionUsageTotal(sessionId: string): Promise<SessionUsageTotal> {
	const total = await getOnethingSessionUsageTotal(getUsageLedger(), sessionId);
	return {
		apiCostUSD: total.apiCostUSD,
		subscriptionCostUSD: total.subscriptionCostUSD,
		turnCount: total.turnCount,
		usage: {
			inputTokens: total.usage.input,
			outputTokens: total.usage.output,
			cacheReadTokens: total.usage.cacheRead,
			cacheWriteTokens: total.usage.cacheWrite,
			reasoningTokens: total.usage.reasoning,
			totalTokens: total.usage.total,
		},
	};
}

/** Single entry point for billing: builds the ledger record and queues it for append. */
export function recordUsage(input: RecordUsageInput): OnethingUsageLedgerRecord {
	const capability = getModelCapabilityEntry(input.modelId, input.providerId);
	const billing = resolveUsageBillingMode(input.providerId);
	return getUsageLedger().record({
		sessionId: input.sessionId,
		providerId: input.providerId,
		modelId: input.modelId,
		platform: resolvePlatform(input),
		source: input.source,
		billing,
		usage: {
			input: input.usage.inputTokens,
			output: input.usage.outputTokens,
			total: input.usage.totalTokens,
			cacheRead: input.usage.cacheReadTokens,
			cacheWrite: input.usage.cacheWriteTokens,
			reasoning: input.usage.reasoningTokens,
		},
		unitPrice: capability?.pricing,
		partial: input.partial,
	});
}
