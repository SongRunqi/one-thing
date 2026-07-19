/**
 * Model-capability display helpers shared by the provider settings surfaces
 * (model ledger, per-provider catalog). All verdicts come from the shared
 * model-capability ledger — this file holds no pattern lists of its own.
 */

import { resolveOnethingModelCapabilities } from "@onething/runtime/providers/model-capability";
import type { OpenRouterModel } from "@/types";

function resolve(model: OpenRouterModel, providerId?: string) {
	return resolveOnethingModelCapabilities({
		providerId: providerId ?? "unknown",
		modelId: model.id,
		modelMetadata: model,
	});
}

export function hasVision(model: OpenRouterModel, providerId?: string): boolean {
	return resolve(model, providerId).vision;
}

export function hasImageGeneration(model: OpenRouterModel, providerId?: string): boolean {
	return resolve(model, providerId).imageOutput;
}

export function hasTools(model: OpenRouterModel, providerId?: string): boolean {
	// Display stays conservative: only show the badge when actual data (registry
	// or rules) confirms it, never from the engine's optimistic default.
	const resolved = resolve(model, providerId);
	return resolved.tools && resolved.source.tools !== "default";
}

export function hasReasoning(model: OpenRouterModel, providerId?: string): boolean {
	return resolve(model, providerId).reasoning;
}

export function supportsTemperature(model: OpenRouterModel, providerId?: string): boolean {
	return resolve(model, providerId).temperature;
}

export function formatContextLength(contextLength: number): string {
	if (!contextLength) return "";
	if (contextLength >= 1000000) {
		return `${(contextLength / 1000000).toFixed(1)}M`;
	} else if (contextLength >= 1000) {
		return `${Math.round(contextLength / 1000)}K`;
	}
	return contextLength.toString();
}

export function createCustomModel(modelId: string): OpenRouterModel {
	return {
		id: modelId,
		name: modelId,
		description: "Custom model",
		context_length: 0,
		architecture: {
			modality: "text",
			input_modalities: ["text"],
			output_modalities: ["text"],
			tokenizer: "unknown",
		},
		pricing: { prompt: "0", completion: "0", request: "0", image: "0" },
		top_provider: {
			context_length: 0,
			max_completion_tokens: 0,
			is_moderated: false,
		},
		supported_parameters: [],
	};
}
