import type { AgentProviderData } from "../agent-loop/types.js";
import type { JsonObject, JsonObjectProperty } from "../json.js";
import type {
	CorePromptActiveProject,
	CorePromptKnownProjects,
	CorePromptProviderConfig,
	CoreTemplateSkill,
} from "./prompt-types.js";

export interface CoreBuildPromptContextOptions {
	sessionId?: string;
	agentId?: string;
	agentName?: string;
	agentSystemPrompt?: string;
	providerId?: string;
	model?: string;
	providerConfig?: CorePromptProviderConfig;
	baseSystemPrompt?: string;
	toolGuidelines?: string[];
	toolWorkspaceRules?: string[];
	knownProjectsInstructions?: string;
	settings?: unknown;
	hasTools: boolean;
	skills: CoreTemplateSkill[];
	workingDirectory?: string;
	workingDirectoryRoots?: string[];
	activeProject?: CorePromptActiveProject;
	knownProjects?: CorePromptKnownProjects;
	toolNames?: string[];
	mcpToolNames?: string[];
	speakMode?: boolean;
	voiceConversation?: boolean;
	homeDir?: string;
	platform?: NodeJS.Platform | string;
	macOSAutomationDocsPath?: string;
	todoPlanDirectory?: string;
	now?: Date;
	/** Phase 5 ablation: disable specific prompt sections for testing. */
	disabledSections?: string[];
}

type CorePromptMessageContent = JsonObjectProperty | object;
type CorePromptToolCall = {
	toolCallId: string;
	toolName: string;
	args: JsonObject;
};

export type CorePromptRequestMessage =
	| { role: "system" | "developer" | "user"; content: CorePromptMessageContent }
	| {
			role: "assistant";
			content: CorePromptMessageContent;
			reasoningContent?: string;
			providerData?: AgentProviderData[];
			toolCalls?: CorePromptToolCall[];
	  }
	| {
			role: "tool";
			content: Array<{
				type: "tool-result";
				toolCallId: string;
				toolName: string;
				result: CorePromptMessageContent;
			}>;
	  };

export interface CoreBuildPromptOptions extends CoreBuildPromptContextOptions {
	providerId: string;
	historyMessages: CorePromptRequestMessage[];
	separateDeveloperMessages?: boolean;
}

/** Named prompt sections (for hash-based versioning and snapshot capture). */
export interface PromptSection {
	name: string;
	content: string;
}

export interface CoreBuildPromptResult {
	messages: CorePromptRequestMessage[];
	systemPrompt: string;
	/** Named prompt sections, for per-section hashing and snapshot display (optional). */
	sections?: PromptSection[];
}
