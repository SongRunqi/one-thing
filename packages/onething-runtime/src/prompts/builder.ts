import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	CoreBuildPromptContextOptions,
	CoreBuildPromptOptions,
	CoreBuildPromptResult,
	CorePromptActiveProject,
	CorePromptKnownProjects,
	CorePromptRequestMessage,
	PromptSection,
} from "@onething/core/engine";
import { collectPluginPromptContext } from "./plugin-context.js";
import {
	ONETHING_DEFAULT_SYSTEM_PROMPT,
	ONETHING_KNOWN_PROJECTS_INSTRUCTIONS,
	ONETHING_TOOL_GUIDELINES,
	ONETHING_TOOL_WORKSPACE_RULES,
} from "./system-prompt.js";

import voiceSpeakModeRaw from "./content/voice-speak-mode.md?raw";
import osDarwinRaw from "./content/os-darwin.md?raw";
import osWin32Raw from "./content/os-win32.md?raw";
import osLinuxRaw from "./content/os-linux.md?raw";
import contextUpdateConventionRaw from "./content/context-update-convention.md?raw";

const normalizeContent = (s: string) => s.replace(/\n+$/, "");

const CONTEXT_UPDATE_CONVENTION = normalizeContent(contextUpdateConventionRaw);

const AGENTS_MAX_BYTES = 32 * 1024;

export interface OnethingPromptAgent {
	name: string;
	systemPrompt?: string;
}

export interface OnethingPromptHostAdapters {
	getAgent?(agentId: string | undefined): OnethingPromptAgent | undefined;
	getHomeDir?(): string;
	getPlatform?(): NodeJS.Platform | string;
	getMacOSAutomationDocsPath?(): string | undefined;
}

export interface BuildOnethingPromptContextOptions
	extends CoreBuildPromptContextOptions {
	host?: OnethingPromptHostAdapters;
}

export interface BuildOnethingPromptOptions extends CoreBuildPromptOptions {
	host?: OnethingPromptHostAdapters;
}

export type OnethingPromptRequestMessage = CorePromptRequestMessage;
export type BuildOnethingPromptResult = CoreBuildPromptResult;

export async function buildOnethingSystemPrompt(
	ctx: BuildOnethingPromptContextOptions,
): Promise<{ system: string; developer: string[] }> {
	return buildRuntimeSystemPrompt(coreOptions(ctx));
}

export async function buildOnethingPrompt(
	options: BuildOnethingPromptOptions,
): Promise<BuildOnethingPromptResult> {
	return buildRuntimePrompt({
		...coreOptions(options),
		providerId: options.providerId,
		historyMessages: options.historyMessages,
		separateDeveloperMessages:
			options.separateDeveloperMessages ?? options.providerId === "codex",
	});
}

function coreOptions(
	ctx: BuildOnethingPromptContextOptions,
): CoreBuildPromptContextOptions {
	const { host, ...core } = ctx;
	const agent = host?.getAgent?.(ctx.agentId);

	return {
		...core,
		agentName: ctx.agentName ?? agent?.name,
		agentSystemPrompt: ctx.agentSystemPrompt ?? agent?.systemPrompt,
		baseSystemPrompt: ctx.baseSystemPrompt ?? ONETHING_DEFAULT_SYSTEM_PROMPT,
		toolGuidelines: ctx.toolGuidelines ?? ONETHING_TOOL_GUIDELINES,
		toolWorkspaceRules: ctx.toolWorkspaceRules ?? ONETHING_TOOL_WORKSPACE_RULES,
		knownProjectsInstructions:
			ctx.knownProjectsInstructions ?? ONETHING_KNOWN_PROJECTS_INSTRUCTIONS,
		homeDir: ctx.homeDir ?? host?.getHomeDir?.() ?? os.homedir(),
		platform: ctx.platform ?? host?.getPlatform?.() ?? process.platform,
		macOSAutomationDocsPath:
			ctx.macOSAutomationDocsPath ?? host?.getMacOSAutomationDocsPath?.(),
	};
}

async function buildRuntimeSystemPrompt(
	ctx: CoreBuildPromptContextOptions,
): Promise<{ system: string; developer: string[]; sections: PromptSection[] }> {
	const plugins = await collectPlugins(ctx);
	const agentSystemPrompt = ctx.agentSystemPrompt?.trim();
	const disabled = new Set(ctx.disabledSections ?? []);

	const sections: Array<[string, string | false | 0 | null | undefined]> = [
		[
			"agent",
			agentSystemPrompt &&
				agentPrompt(ctx.agentName || "Agent", agentSystemPrompt),
		],
		["voice", (ctx.speakMode ?? ctx.voiceConversation) && VOICE_SPEAK_MODE],
		["runtime-context", runtimeContext(ctx)],
		// Constant bytes (cache-safe): documents the <context-update> channel
		// so the model knows the latest block supersedes earlier ones.
		["context-update-convention", CONTEXT_UPDATE_CONVENTION],
		["workdir", ctx.workingDirectory && workdir(ctx)],
		[
			"active-project",
			ctx.activeProject?.hasActive && activeProject(ctx.activeProject),
		],
		["known-projects", ctx.knownProjects?.hasAny && knownProjects(ctx)],
		["skills", skills_(ctx)],
		["os", os_(ctx)],
		["agents-md", loadAgentsMdInstructions(ctx.workingDirectory)],
		// Mutable at runtime (the variable tool writes to it): kept last among
		// the static sections so a change invalidates the smallest possible
		// prompt-cache prefix.
		[
			"context-variables",
			ctx.contextVariables?.trim() &&
				`# Context Variables\n${ctx.contextVariables.trim()}`,
		],
	];
	for (const plugin of plugins) sections.push(["plugins", plugin]);

	const systemContent = core(ctx);
	const activeSections = sections.filter(([name]) => !disabled.has(name));
	const developer = compact(activeSections.map(([, content]) => content));

	// Build named sections: system + each non-falsy developer section; plugins merged
	const namedSections: PromptSection[] = [
		{ name: "system", content: systemContent },
	];
	const pluginContents: string[] = [];
	for (const [name, content] of activeSections) {
		if (typeof content !== "string" || !content) continue;
		if (name === "plugins") {
			pluginContents.push(content);
		} else {
			namedSections.push({ name, content });
		}
	}
	if (pluginContents.length > 0) {
		namedSections.push({
			name: "plugins",
			content: pluginContents.join("\n\n"),
		});
	}

	return { system: systemContent, developer, sections: namedSections };
}

async function buildRuntimePrompt(
	options: CoreBuildPromptOptions,
): Promise<CoreBuildPromptResult> {
	const { system, developer, sections } =
		await buildRuntimeSystemPrompt(options);
	const systemPrompt = [system, ...developer].filter(Boolean).join("\n\n");

	if (options.separateDeveloperMessages) {
		return {
			messages: [
				{ role: "system", content: system },
				...developer.map((content) => ({
					role: "developer" as const,
					content,
				})),
				...options.historyMessages,
			],
			systemPrompt,
			sections,
		};
	}

	return {
		messages: [
			{ role: "system", content: systemPrompt },
			...options.historyMessages,
		],
		systemPrompt,
		sections,
	};
}

function core(ctx: CoreBuildPromptContextOptions): string {
	const baseSystemPrompt =
		ctx.baseSystemPrompt?.trim() ||
		"You are an AI assistant. Help users by reading context, using available tools, and producing clear, useful answers.";
	const guidelines = ctx.toolGuidelines?.length
		? ctx.toolGuidelines
		: [
				"Follow the Tool Workspace Rules when choosing file paths or command directories.",
				"Prefer the most specific available tool for the task.",
				"When changing code, run an appropriate check when practical, then summarize changed paths clearly.",
				"Show file paths clearly when working with files.",
			];

	return [
		baseSystemPrompt,
		"",
		"Tool Guidelines:",
		...guidelines.map((item) => `- ${item}`),
		"",
		`Current date: ${formatDate(ctx.now)}`,
	].join("\n");
}

function agentPrompt(name: string, systemPrompt: string): string {
	return `# Agent: ${name}\n\n${systemPrompt.trim()}`;
}

const VOICE_SPEAK_MODE = normalizeContent(voiceSpeakModeRaw);

function workdir(ctx: CoreBuildPromptContextOptions): string {
	const homeDir = ctx.homeDir || os.homedir();
	const lines = [
		"# Work Directory",
		`Current work directory: ${displayPath(ctx.workingDirectory, homeDir) ?? ctx.workingDirectory} (${ctx.workingDirectory})`,
	];
	const roots = displayRoots(ctx.workingDirectoryRoots, homeDir);
	if (roots.length > 0) {
		lines.push("Additional work directories:");
		for (const root of roots)
			lines.push(`- ${root.displayPath} (${root.path})`);
	}
	if (ctx.hasTools) {
		lines.push("", "## Tool Workspace Rules");
		const rules = ctx.toolWorkspaceRules?.length
			? ctx.toolWorkspaceRules
			: [
					"Tools use the current work directory by default when the host provides one.",
					"If the host exposes a work-directory switching tool, use it before file operations that belong elsewhere.",
				];
		lines.push(
			...rules.map((rule) => (rule.startsWith("- ") ? rule : `- ${rule}`)),
		);
	}
	return lines.join("\n");
}

function activeProject(project: CorePromptActiveProject): string {
	return [
		"# Active Project",
		`- path: ${project.displayPath}`,
		project.description ? `- description: ${project.description}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

function knownProjects(ctx: CoreBuildPromptContextOptions): string {
	const known = ctx.knownProjects;
	if (!known) return "";
	const lines = ["# Known Projects"];
	for (const item of (known as CorePromptKnownProjects).entries ?? []) {
		lines.push(
			`- ${item.displayPath}${item.description ? ` \u2014 ${item.description}` : ""}`,
		);
	}
	lines.push(
		"",
		ctx.knownProjectsInstructions ||
			"If a request clearly belongs to one of these directories and it is not already the current work directory, switch to that directory using a host-provided mechanism before reading or editing files.",
	);
	return lines.join("\n");
}

function skills_(ctx: CoreBuildPromptContextOptions): string | undefined {
	const hasReadTool = Boolean(ctx.hasTools && ctx.toolNames?.includes("read"));
	if (!hasReadTool || !ctx.skills.length) return undefined;
	const skills = ctx.skills
		.filter((skill) => skill.enabled !== false && !skill.disableModelInvocation)
		.slice()
		.sort((a, b) =>
			`${a.category ?? ""}/${a.name}`.localeCompare(
				`${b.category ?? ""}/${b.name}`,
			),
		);
	if (skills.length === 0) return undefined;

	const lines = [
		"# Skills",
		"The following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];
	for (const skill of skills) {
		const location = skill.path || skill.directoryPath || skill.name;
		lines.push("  <skill>");
		lines.push(`    <name>${escapeSkillXml(skill.name)}</name>`);
		lines.push(
			`    <description>${escapeSkillXml(skill.description)}</description>`,
		);
		lines.push(`    <location>${escapeSkillXml(location)}</location>`);
		lines.push("  </skill>");
	}
	lines.push("</available_skills>");
	return lines.join("\n");
}

function escapeSkillXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function os_(ctx: CoreBuildPromptContextOptions): string {
	switch (ctx.platform || process.platform) {
		case "darwin":
			return (
				normalizeContent(osDarwinRaw) +
				"\n" +
				`Detailed examples and syntax: ${ctx.macOSAutomationDocsPath || "resources/docs/macos-automation.md"}`
			);
		case "win32":
			return normalizeContent(osWin32Raw);
		default:
			return normalizeContent(osLinuxRaw);
	}
}

function safeUtf8Truncate(data: Buffer, maxBytes: number): string {
	if (data.length <= maxBytes) return data.toString("utf-8");
	// TextDecoder in streaming mode drops a trailing partial multi-byte
	// sequence instead of emitting the U+FFFD replacement character that
	// Buffer#toString('utf-8') would produce when a cut lands mid-character.
	return new TextDecoder("utf-8", { fatal: false }).decode(
		data.subarray(0, maxBytes),
		{ stream: true },
	);
}

export function loadAgentsMdInstructions(
	workingDirectory?: string,
): string | undefined {
	if (!workingDirectory) return undefined;
	const target = path.resolve(workingDirectory);
	const projectRoot = findProjectRoot(target);
	const root = isPathContained(projectRoot, target) ? projectRoot : target;
	const dirs = dirsFromRootToTarget(root, target);
	const parts: string[] = [];
	for (const dir of dirs) {
		const candidates = ["AGENTS.override.md", "AGENTS.md"].map((name) =>
			path.join(dir, name),
		);
		const selected = candidates.find(
			(file) => fs.existsSync(file) && fs.statSync(file).isFile(),
		);
		if (!selected) continue;
		const data = fs.readFileSync(selected);
		const text =
			data.length > AGENTS_MAX_BYTES
				? `${safeUtf8Truncate(data, AGENTS_MAX_BYTES)}\n\n<!-- AGENTS instructions truncated -->`
				: data.toString("utf-8");
		parts.push(
			`<project_instructions path="${selected}">\n${text}\n</project_instructions>`,
		);
	}
	if (parts.length === 0) return undefined;
	return [
		"<project_context>",
		"",
		"Project-specific instructions and guidelines:",
		"",
		...parts,
		"",
		"</project_context>",
	].join("\n");
}

function findProjectRoot(startDir: string): string {
	let current = path.resolve(startDir);
	try {
		const stats = fs.statSync(current);
		if (stats.isFile()) current = path.dirname(current);
	} catch {
		return current;
	}
	let cursor = current;
	while (true) {
		if (fs.existsSync(path.join(cursor, ".git"))) return cursor;
		const parent = path.dirname(cursor);
		if (parent === cursor) return current;
		cursor = parent;
	}
}

function isPathContained(root: string, target: string): boolean {
	const resolvedRoot = path.resolve(root);
	const resolvedTarget = path.resolve(target);
	const relative = path.relative(resolvedRoot, resolvedTarget);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function dirsFromRootToTarget(root: string, target: string): string[] {
	const resolvedRoot = path.resolve(root);
	const resolvedTarget = path.resolve(target);
	const relative = path.relative(resolvedRoot, resolvedTarget);
	const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
	const dirs = [resolvedRoot];
	let cursor = resolvedRoot;
	for (const part of parts) {
		cursor = path.join(cursor, part);
		dirs.push(cursor);
	}
	return dirs;
}

function compact(
	parts: Array<string | false | 0 | null | undefined>,
): string[] {
	return parts
		.map((part) => (typeof part === "string" ? part.trim() : ""))
		.filter(Boolean);
}

async function collectPlugins(
	ctx: CoreBuildPromptContextOptions,
): Promise<string[]> {
	const fragments = await collectPluginPromptContext({
		sessionId: ctx.sessionId,
		providerId: ctx.providerId,
		model: resolvePromptModelId(ctx),
		providerConfig: ctx.providerConfig,
		settings: ctx.settings,
		hasTools: ctx.hasTools,
		skills: ctx.skills,
		workingDirectory: ctx.workingDirectory,
		workingDirectoryRoots: ctx.workingDirectoryRoots,
		contextVariables: ctx.contextVariables,
		activeProject: ctx.activeProject,
		knownProjects: ctx.knownProjects,
		toolNames: ctx.toolNames,
		mcpToolNames: ctx.mcpToolNames,
	});
	return fragments.map((fragment) => fragment.content);
}

function runtimeContext(
	ctx: CoreBuildPromptContextOptions,
): string | undefined {
	const providerId = ctx.providerId?.trim();
	const modelId = resolvePromptModelId(ctx);
	const lines = compact([
		providerId && `- Provider ID: ${providerId}`,
		modelId && `- Model ID: ${modelId}`,
	]);

	return lines.length ? `# Runtime Context\n${lines.join("\n")}` : undefined;
}

function resolvePromptModelId(
	ctx: CoreBuildPromptContextOptions,
): string | undefined {
	if (ctx.model?.trim()) return ctx.model.trim();
	const providerModel = ctx.providerConfig?.model;
	return typeof providerModel === "string" && providerModel.trim()
		? providerModel.trim()
		: undefined;
}

function displayPath(
	input: string | undefined,
	homeDir: string,
): string | undefined {
	if (!input) return undefined;
	return input.startsWith(homeDir) ? input.replace(homeDir, "~") : input;
}

function displayRoots(
	roots: string[] | undefined,
	homeDir: string,
): Array<{ path: string; displayPath: string }> {
	return (roots ?? []).map((root) => ({
		path: root,
		displayPath: displayPath(root, homeDir) ?? root,
	}));
}

function formatDate(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
