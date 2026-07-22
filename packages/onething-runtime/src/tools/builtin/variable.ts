import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import type { VariableVolatility } from "../../variables/types.js";
import { isCapabilityVariable } from "../../variables/types.js";
import { Tool } from "../tool.js";

export type VariableAction = "list" | "set" | "append" | "remove" | "delete";
export type VariableScope = "global" | "session";
export type { VariableVolatility };

export interface RuntimeContextVariable {
	name: string;
	value?: string;
	values?: string[];
	scope?: VariableScope;
	readonly?: boolean;
	volatility?: VariableVolatility;
	description?: string;
	updatedAt?: number;
}

export interface RuntimeVariableContext {
	sessionId: string;
	messageId?: string;
	toolCallId?: string;
}

export interface RuntimeVariableSetInput {
	name: string;
	value: string;
	scope?: VariableScope;
	description?: string;
	volatility?: VariableVolatility;
}

export interface RuntimeVariableRegistry {
	list(
		ctx: RuntimeVariableContext,
	): Promise<RuntimeContextVariable[]> | RuntimeContextVariable[];
	set(
		ctx: RuntimeVariableContext,
		input: RuntimeVariableSetInput,
	): Promise<RuntimeContextVariable> | RuntimeContextVariable;
	append(
		ctx: RuntimeVariableContext,
		input: RuntimeVariableSetInput,
	): Promise<RuntimeContextVariable> | RuntimeContextVariable;
	remove(
		ctx: RuntimeVariableContext,
		input: RuntimeVariableSetInput,
	): Promise<RuntimeContextVariable> | RuntimeContextVariable;
	delete(
		ctx: RuntimeVariableContext,
		name: string,
		scope?: VariableScope,
	): Promise<void> | void;
}

export interface VariableToolAdapters {
	getRegistry(): RuntimeVariableRegistry;
	isVariableError?(error: unknown): boolean;
}

interface VariableMetadataVariable extends JsonObject {
	name: string;
	value?: string;
	values?: string[];
	scope?: VariableScope;
	readonly?: boolean;
	volatility?: VariableVolatility;
	description?: string;
	updatedAt?: number;
}

interface VariableMetadata extends JsonObject {
	action: VariableAction;
	name?: string;
	variables: VariableMetadataVariable[];
	[key: string]: JsonObjectProperty;
}

export const VariableParameters = z.object({
	action: z
		.enum(["list", "set", "append", "remove", "delete"])
		.describe("Operation to perform on context variables."),
	name: z
		.string()
		.optional()
		.describe("Variable name (required for set/append/remove/delete)."),
	value: z
		.string()
		.optional()
		.describe(
			"Variable value (required for set/append/remove; for the work directory and note directories, must be an existing directory).",
		),
	scope: z
		.enum(["session", "global"])
		.optional()
		.describe(
			"Scope for custom variables. Defaults to session. Built-in note directories are global; the work directory variable is session-scoped.",
		),
	description: z
		.string()
		.optional()
		.describe(
			"Short description, surfaced in the prompt and the Context inspector.",
		),
	volatility: z
		.enum(["static", "turn"])
		.optional()
		.describe(
			'How often the value changes. "static" (default): stable values, rendered in the system prompt. "turn": fast-changing status you expect to update repeatedly - delivered in per-turn <context-update> blocks instead, so updates never rewrite the system prompt. Use "turn" for in-flight operation status.',
		),
});

function summarizeForMetadata(
	snapshot: RuntimeContextVariable[],
): VariableMetadata["variables"] {
	return snapshot.map((v) => ({
		name: v.name,
		value: v.value,
		values: v.values,
		scope: v.scope,
		readonly: v.readonly,
		volatility: v.volatility,
		description: v.description,
		updatedAt: v.updatedAt,
	}));
}

function formatAge(updatedAt: number, now: number): string {
	const minutes = Math.floor(Math.max(0, now - updatedAt) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function renderForOutput(
	snapshot: RuntimeContextVariable[],
	now: number = Date.now(),
): string {
	if (snapshot.length === 0) return "No context variables are set.";
	return snapshot
		.map((v) => {
			// Age makes stale state visible so the model can update or clean it
			// up. Tool output is never part of the cached prompt prefix, so a
			// live relative time is safe here (unlike in the prompt sections).
			const age = v.updatedAt ? ` [updated ${formatAge(v.updatedAt, now)}]` : "";
			const flags = `${v.scope ? ` [${v.scope}]` : ""}${v.readonly ? " [readonly]" : ""}${v.volatility && v.volatility !== "static" ? ` [${v.volatility}]` : ""}${age}`;
			const desc = v.description ? ` - ${v.description}` : "";
			if (v.values && v.values.length > 0) {
				return `${v.name} = ${v.value || "(empty)"}\nvalues:\n${v.values.map((value, index) => `  [${index}] ${value}${index === 0 && v.value ? " (current)" : ""}`).join("\n")}${flags}${desc}`;
			}
			const value = v.value || "(empty)";
			return `${v.name} = ${value}${flags}${desc}`;
		})
		.join("\n");
}

function rethrowVariableError(
	err: Error | object | string | number | boolean | null | undefined,
	adapters: VariableToolAdapters,
): never {
	if (adapters.isVariableError?.(err) && err instanceof Error) {
		const code =
			"code" in err && typeof err.code === "string" ? err.code : undefined;
		const e = new Error(code ? `[${code}] ${err.message}` : err.message);
		e.name = err.name;
		throw e;
	}
	throw err;
}

export function createVariableTool(
	adapters: VariableToolAdapters,
): Tool.Info<typeof VariableParameters, VariableMetadata> {
	return Tool.define<typeof VariableParameters, VariableMetadata>("variable", {
		name: "Variable",
		description: `Manage context variables - the session's live state board.

Variables are small structured facts about the CURRENT state of the session and system: what is running, what is being worked on, which directories are active. They are visible to you in every turn, so state recorded here never needs re-discovery. Each variable documents itself via its description in list output - system variables (workdir, note dirs, background_jobs, ...) explain their own semantics there.

Use this tool to:
- adjust the active context for future tool calls (e.g. set the workdir when switching projects)
- track a long-running or multi-turn operation you start: record its target and status, update on change, delete when done (set volatility="turn" for status you will update repeatedly)
- record task-critical state later turns must see (current deploy target, in-progress migration step)

This is NOT memory. Durable knowledge about the user (preferences, identity, reply language) belongs to the memory system; one-off details belong in conversation. State that will be stale by tomorrow and matters every turn until then - that is what belongs here.

Custom variables use any non-reserved snake_case name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/. scope="session" (default) for state of this session; scope="global" only for state genuinely shared across sessions. Read-only variables are maintained by the system and cannot be written.

Known Projects are listed in the system prompt. Setting workdir auto-registers the directory there; pass description alongside set to name or rename the project entry.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: VariableParameters,

		// Ordinary variables are the session's live state board and stay
		// frictionless — no effect, no prompt. A capability variable is different:
		// its value is a directory the system acts on, so repointing one is a
		// proposal the user approves, not something that happens silently.
		analyze(args) {
			const name = args.name?.trim();
			if (!name || args.action === "list") return { effects: [] };
			if (!isCapabilityVariable(name)) return { effects: [] };

			const value = args.value?.trim();
			const title =
				args.action === "delete"
					? `Reset ${name} to its default`
					: `Repoint ${name} to: ${value || ""}`;

			return {
				effects: [
					{
						kind: "capability_change" as const,
						resources: value ? [value] : [name],
						barrier: true,
						metadata: { variable: name, value, action: args.action },
					},
				],
				preview: { title, metadata: { variable: name, value } },
			};
		},

		async execute(args, ctx) {
			const registry = adapters.getRegistry();
			const variableCtx = {
				sessionId: ctx.sessionId,
				messageId: ctx.messageId,
				toolCallId: ctx.toolCallId,
			};
			const action: VariableAction = args.action;

			try {
				if (action === "set" || action === "append" || action === "remove") {
					if (!args.name) throw new Error(`name is required for ${action}`);
					if (args.value === undefined)
						throw new Error(`value is required for ${action}`);
					const input = {
						name: args.name,
						value: args.value,
						scope: args.scope,
						description: args.description,
						volatility: args.volatility,
					};
					if (action === "set") {
						await registry.set(variableCtx, input);
					} else if (action === "append") {
						await registry.append(variableCtx, input);
					} else if (action === "remove") {
						await registry.remove(variableCtx, input);
					}
				} else if (action === "delete") {
					if (!args.name) throw new Error("name is required for delete");
					await registry.delete(variableCtx, args.name, args.scope);
				}

				const snapshot = await registry.list(variableCtx);
				const metadataSummary = summarizeForMetadata(snapshot);
				const output = renderForOutput(snapshot);

				ctx.updateResult?.({
					content: [{ type: "text", text: output }],
					details: {
						phase: "ready",
						action,
						name: args.name,
						variables: metadataSummary,
					},
				});

				ctx.metadata({
					title:
						action === "list"
							? "Listed variables"
							: `${action[0].toUpperCase()}${action.slice(1)} ${args.name}`,
					metadata: {
						action,
						name: args.name,
						variables: metadataSummary,
					},
				});

				return {
					title: action === "list" ? "Variables" : `Variable ${action}`,
					output,
					metadata: {
						action,
						name: args.name,
						variables: metadataSummary,
					},
				};
			} catch (err) {
				const caught =
					err instanceof Error || (err && typeof err === "object")
						? err
						: String(err);
				rethrowVariableError(caught, adapters);
			}
		},
	});
}
