/**
 * Agent provider for background "utility" work — the calls the app makes on
 * its own rather than on a user turn: skill review, session TOC, and anything
 * else that should run on `settings.tools.toolCallModel` instead of whatever
 * model the chat happens to be using.
 *
 * This assembles the four steps every such caller needs (resolve the tool-call
 * model → look up its provider config → resolve auth → build the agent
 * provider). Each caller used to open-code them, which is how skill review and
 * title generation ended up with subtly different fallback rules.
 *
 * See docs/design/session-toc.md §10.
 */
import type { AgentProvider } from "@onething/core/agent-loop";
import type { AppSettings } from "@shared/ipc.js";
import { createAgentProviderFromRuntime } from "../agent-loop/index.js";
import { pickOnethingProviderOptions } from "@onething/runtime/providers";
import {
	getProviderApiType,
	resolveProviderAuth,
} from "../engine/stream/provider-helpers.js";

export interface UtilityProviderRef {
	provider: AgentProvider;
	providerId: string;
	model: string;
	thinking?: boolean;
	thinkingEffort?: unknown;
	thinkingByModel?: Record<string, boolean | undefined>;
	thinkingEffortByModel?: Record<string, unknown>;
}

export interface CreateUtilityProviderOptions {
	workingDirectory?: string;
	sessionId?: string;
	/**
	 * When the tool-call model is not configured, fall back to the chat
	 * provider instead of giving up.
	 *
	 * Off by default, which is the conservative choice: background work that
	 * silently runs on an expensive chat model is worse than background work
	 * that does not run. Title generation opts in (it must always produce
	 * something); skill review does not.
	 */
	fallbackToChatProvider?: boolean;
}

/** Which provider/model background work should use, before auth is resolved. */
function resolveUtilityModel(
	settings: AppSettings,
	fallbackToChatProvider: boolean,
): { providerId: string; model: string } | undefined {
	const toolCallModel = settings.tools?.toolCallModel;
	const configuredProviderId = toolCallModel?.providerId?.trim();
	const configuredModel = toolCallModel?.model?.trim();

	if (configuredProviderId && settings.ai?.providers?.[configuredProviderId]) {
		const providerConfig = settings.ai.providers[configuredProviderId];
		const model =
			configuredModel ||
			providerConfig?.model ||
			providerConfig?.selectedModels?.[0] ||
			"";
		if (model) return { providerId: configuredProviderId, model };
	}

	if (!fallbackToChatProvider) return undefined;

	const providerId = settings.ai?.provider;
	if (!providerId) return undefined;
	const providerConfig = settings.ai?.providers?.[providerId];
	const model = providerConfig?.model || providerConfig?.selectedModels?.[0] || "";
	return model ? { providerId, model } : undefined;
}

/**
 * Returns undefined whenever the provider cannot be built — unconfigured,
 * unknown provider, or missing auth. Callers treat that as "skip this work",
 * never as an error: background work must not surface failures to the user.
 */
export async function createUtilityProvider(
	settings: AppSettings,
	options: CreateUtilityProviderOptions = {},
): Promise<UtilityProviderRef | undefined> {
	const resolved = resolveUtilityModel(
		settings,
		options.fallbackToChatProvider === true,
	);
	if (!resolved) return undefined;

	const providerConfig = settings.ai?.providers?.[resolved.providerId];
	if (!providerConfig) return undefined;

	const authContext = await resolveProviderAuth(resolved.providerId, providerConfig);
	if (!authContext) return undefined;

	const provider = createAgentProviderFromRuntime(
		resolved.providerId,
		{
			...providerConfig,
			// Background work reads settings directly rather than going through
			// getEffectiveProviderConfig, so it has to pack the provider's own
			// dials itself — otherwise a zhipu coding-plan / qwen intl account
			// would quietly bill its side-line calls to the wrong endpoint.
			providerOptions: pickOnethingProviderOptions(
				resolved.providerId,
				providerConfig as unknown as Record<string, unknown>,
			),
			model: resolved.model,
			apiKey: authContext.kind === "api-key" ? authContext.apiKey : "",
			authContext,
			oauthToken:
				authContext.kind === "oauth" ? authContext.token : providerConfig.oauthToken,
			apiType: getProviderApiType(settings, resolved.providerId),
		},
		{
			workingDirectory: options.workingDirectory,
			localSessionId: options.sessionId,
		},
	);
	if (!provider) return undefined;

	const toolCallModel = settings.tools?.toolCallModel;
	return {
		provider,
		providerId: resolved.providerId,
		model: resolved.model,
		thinking:
			typeof toolCallModel?.thinking === "boolean" ? toolCallModel.thinking : undefined,
		thinkingEffort: toolCallModel?.thinkingEffort,
		thinkingByModel: providerConfig.thinkingByModel,
		thinkingEffortByModel: providerConfig.thinkingEffortByModel,
	};
}
