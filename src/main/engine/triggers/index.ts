import type {
	AppSettings,
	ChatMessage,
	ChatSession,
	ProviderConfig,
} from "../../../shared/ipc.js";
import {
	CoreTriggerManager,
	type CoreTrigger,
	type CoreTriggerContext,
} from "@onething/core/engine";
import { createGoalContinuationTrigger } from "./goal-continuation.js";
import { createSkillReviewTrigger } from "./skill-review.js";
import { createTurnEvaluationTrigger } from "./turn-evaluation.js";
import { createSessionTocTrigger } from "./session-toc.js";

export interface TriggerContext
	extends CoreTriggerContext<
		AppSettings,
		ChatSession,
		ChatMessage,
		ProviderConfig
	> {}

export interface Trigger extends CoreTrigger<TriggerContext> {}

export class TriggerManager extends CoreTriggerManager<TriggerContext> {}

export const triggerManager = new TriggerManager();

let builtinTriggersRegistered = false;

export function registerBuiltinTriggers(): void {
	if (builtinTriggersRegistered) return;
	builtinTriggersRegistered = true;
	triggerManager.register(createSkillReviewTrigger());
	triggerManager.register(createGoalContinuationTrigger());
	triggerManager.register(createTurnEvaluationTrigger());
	triggerManager.register(createSessionTocTrigger());
}
