import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import type {
	VariableScope,
	VariableType,
	VariableVolatility,
} from "../../variables/types.js";
import { isCapabilityVariable } from "../../variables/types.js";
import { Tool } from "../tool.js";

export type VariableAction = "list" | "set" | "append" | "remove" | "delete";
export type { VariableScope, VariableType, VariableVolatility };

export interface RuntimeContextVariable {
	name: string;
	value?: string;
	values?: string[];
	type?: VariableType;
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
	type?: VariableType;
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
	type?: VariableType;
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
		.describe(
			"list: show all variables. set: create or replace a value. append/remove: add or drop an element of a collection variable (or a workdir sandbox root). delete: drop the whole variable.",
		),
	name: z
		.string()
		.optional()
		.describe("Variable name (required for set/append/remove/delete)."),
	value: z
		.string()
		.optional()
		.describe(
			"Variable value (required for set/append/remove). Collections take compact JSON on set; append/remove take a single element (JSON, or plain text for a string element) - map append merges a JSON object, map remove takes the key. Directory variables (workdir, note dirs) take an existing directory path.",
		),
	type: z
		.enum(["string", "number", "bool", "list", "map", "set"])
		.optional()
		.describe(
			'Value type. Defaults to the existing type, else "string". number accepts decimals; list/map hold JSON; set is a list with unique elements. append on a missing variable creates it (default list).',
		),
	scope: z
		.enum(["session", "global", "agent", "project"])
		.optional()
		.describe(
			"Where the variable lives: session (default), agent (every session of the current agent), project (the active workdir's project; requires a workdir), global (all sessions). A name lives in one scope; a write without scope follows the variable to its current scope.",
		),
	description: z
		.string()
		.optional()
		.describe(
			'Short description shown next to the value in the prompt and the Context inspector. Sticky: omitted on later writes it is kept; "" clears it.',
		),
	volatility: z
		.enum(["static", "turn"])
		.optional()
		.describe(
			'"static" (default): rendered in the system prompt. "turn": delivered in per-turn <context-update> blocks, for values that change often. Sticky across writes.',
		),
});

function summarizeForMetadata(
	snapshot: RuntimeContextVariable[],
): VariableMetadata["variables"] {
	return snapshot.map((v) => ({
		name: v.name,
		value: v.value,
		values: v.values,
		type: v.type,
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
			const flags = `${v.type && v.type !== "string" ? ` [${v.type}]` : ""}${v.scope ? ` [${v.scope}]` : ""}${v.readonly ? " [readonly]" : ""}${v.volatility && v.volatility !== "static" ? ` [${v.volatility}]` : ""}${age}`;
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
		description: `Manage context variables - named state visible to you in every turn.

Use this freely and proactively: anything you record is in front of you every turn afterwards, with no re-discovery. Whenever you learn or decide something later turns will need - what you're working on, a target, a status, a list you're accumulating - set it the moment you have it, and keep it current as things change.

A variable has a typed value (string, number, bool, list, map, set), an optional description, and lives in one of four scopes: session (this session), agent (every session of this agent), project (the active workdir's project), global (all sessions). Collections support element-wise append/remove. Custom names are non-reserved snake_case matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/; system variables (workdir, note dirs, background_jobs, ...) explain their own semantics via their description in list output.
`,
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
						type: args.type,
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
