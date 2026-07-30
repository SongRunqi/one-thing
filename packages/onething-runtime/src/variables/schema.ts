export interface VariablesFileGlobalVariable {
	name: string;
	value: string;
	type?: "string" | "number" | "bool" | "list" | "map" | "set";
	description?: string;
	volatility?: "static" | "turn" | "on-demand";
	updatedAt?: number;
}

export interface VariablesFile {
	ai_note_dir: string;
	user_note_dir: string;
	work_note_dir: string;
	global_variables: VariablesFileGlobalVariable[];
	/** Custom variables shared by every session of an agent, keyed by agent id. */
	agent_variables: Record<string, VariablesFileGlobalVariable[]>;
	/** Custom variables attached to a project directory, keyed by project id. */
	project_variables: Record<string, VariablesFileGlobalVariable[]>;
}

export function createDefaultVariablesFile(): VariablesFile {
	return {
		ai_note_dir: "~/.onething/memory",
		user_note_dir: "",
		work_note_dir: "",
		global_variables: [],
		agent_variables: {},
		project_variables: {},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const VALID_VOLATILITY = new Set(["static", "turn", "on-demand"]);
const VALID_TYPE = new Set(["string", "number", "bool", "list", "map", "set"]);

function parseGlobalVariable(
	value: unknown,
): VariablesFileGlobalVariable | null {
	if (!isRecord(value)) return null;
	if (typeof value.name !== "string") return null;
	if (typeof value.value !== "string") return null;
	return {
		name: value.name,
		value: value.value,
		type:
			typeof value.type === "string" && VALID_TYPE.has(value.type)
				? (value.type as VariablesFileGlobalVariable["type"])
				: undefined,
		description:
			typeof value.description === "string" ? value.description : undefined,
		volatility:
			typeof value.volatility === "string" &&
			VALID_VOLATILITY.has(value.volatility)
				? (value.volatility as VariablesFileGlobalVariable["volatility"])
				: undefined,
		updatedAt:
			typeof value.updatedAt === "number" ? value.updatedAt : undefined,
	};
}

/**
 * Parse a keyed record of variable lists (agent_variables /
 * project_variables). Lenient: malformed keys or entries are dropped
 * instead of failing the whole file — these maps grow organically and a
 * single bad entry must not reset every note dir to defaults.
 */
function parseKeyedVariables(
	value: unknown,
): Record<string, VariablesFileGlobalVariable[]> {
	if (!isRecord(value)) return {};
	const output: Record<string, VariablesFileGlobalVariable[]> = {};
	for (const [key, entries] of Object.entries(value)) {
		if (!key || !Array.isArray(entries)) continue;
		const parsed = entries
			.map(parseGlobalVariable)
			.filter((v): v is VariablesFileGlobalVariable => Boolean(v));
		if (parsed.length > 0) output[key] = parsed;
	}
	return output;
}

export function parseVariablesFile(raw: unknown): {
	data: VariablesFile;
	recovered: boolean;
} {
	if (!isRecord(raw)) {
		return { data: createDefaultVariablesFile(), recovered: true };
	}

	const globalsRaw = Array.isArray(raw.global_variables)
		? raw.global_variables
		: [];
	const globalVariables = globalsRaw.map(parseGlobalVariable);
	if (globalVariables.some((value) => !value)) {
		console.warn(
			"[variables.store] persisted file failed schema validation, falling back to defaults",
		);
		return { data: createDefaultVariablesFile(), recovered: true };
	}

	const data: VariablesFile = {
		ai_note_dir:
			typeof raw.ai_note_dir === "string"
				? raw.ai_note_dir
				: "~/.onething/memory",
		user_note_dir:
			typeof raw.user_note_dir === "string" ? raw.user_note_dir : "",
		work_note_dir:
			typeof raw.work_note_dir === "string" ? raw.work_note_dir : "",
		global_variables: globalVariables as VariablesFileGlobalVariable[],
		agent_variables: parseKeyedVariables(raw.agent_variables),
		project_variables: parseKeyedVariables(raw.project_variables),
	};

	return {
		data: migrateReservedGlobals(raw, data),
		recovered: false,
	};
}

function migrateReservedGlobals(
	raw: unknown,
	data: VariablesFile,
): VariablesFile {
	if (data.work_note_dir) return data;
	if (!isRecord(raw)) return data;
	const globals = raw.global_variables;
	if (!Array.isArray(globals)) return data;
	const legacy = globals.find(
		(v) =>
			isRecord(v) && v.name === "work_note_dir" && typeof v.value === "string",
	) as { value: string } | undefined;
	return legacy ? { ...data, work_note_dir: legacy.value } : data;
}
